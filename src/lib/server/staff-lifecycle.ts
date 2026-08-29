import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { hashPinModern, generateCashierAuthUid, PepperConfigOptions } from './pin-security';
import * as admin from 'firebase-admin';

/**
 * Server-Side Owner-Authenticated Cashier Lifecycle Service Foundation
 * 
 * Provides trusted server-side management for Cashier accounts:
 * - List Cashiers (Safe fields only, Owner-Authenticated)
 * - Create Cashier (Transaction-Safe, Slot-Guarded, Owner-Authenticated)
 * - Reset PIN (Transaction-Safe, Owner-Authenticated)
 * - Disable Cashier (Transaction-Safe, Owner-Authenticated)
 * - Remove Cashier (Transaction-Safe, Slot-Releasing, Owner-Authenticated)
 * 
 * Enforces strict owner token verification, tenant boundary isolation,
 * atomic slot guards, preliminary ownership checks before expensive KDF,
 * session version rotation, and sanitized error classification.
 * Zero unprotected public routes. Zero secret or credential leakage.
 */

export enum LifecycleErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  SLOT_LIMIT_REACHED = 'SLOT_LIMIT_REACHED',
  USERNAME_UNAVAILABLE = 'USERNAME_UNAVAILABLE',
  ACTIVE_SHIFT_EXISTS = 'ACTIVE_SHIFT_EXISTS',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export class LifecycleError extends Error {
  public readonly code: LifecycleErrorCode;
  public readonly httpStatus: number;
  public readonly userMessage: string;
  public readonly internalDetail?: string;

  constructor(code: LifecycleErrorCode, internalDetail?: string) {
    let httpStatus = 500;
    let userMessage = 'Nagkaroon ng problema sa server. Paki-subukan muli mamaya.';

    switch (code) {
      case LifecycleErrorCode.UNAUTHORIZED:
        httpStatus = 401;
        userMessage = 'Kailangan munang mag-log in bilang may-ari ng tindahan.';
        break;
      case LifecycleErrorCode.FORBIDDEN:
        httpStatus = 403;
        userMessage = 'Wala kayong pahintulot na baguhin ang tindahang ito.';
        break;
      case LifecycleErrorCode.NOT_FOUND:
        httpStatus = 404;
        userMessage = 'Hindi matagpuan ang hinahanap na talaan o tindahan.';
        break;
      case LifecycleErrorCode.SLOT_LIMIT_REACHED:
        httpStatus = 409;
        userMessage = 'Nagamit na ang 1 Libreng Cashier Account slot para sa tindahang ito.';
        break;
      case LifecycleErrorCode.USERNAME_UNAVAILABLE:
        httpStatus = 409;
        userMessage = 'Ang username na ito ay hindi na available. Pumili ng ibang username.';
        break;
      case LifecycleErrorCode.ACTIVE_SHIFT_EXISTS:
        httpStatus = 409;
        userMessage = 'Hindi maaaring alisin ang Cashier habang may aktibong shift.';
        break;
      case LifecycleErrorCode.INVALID_PAYLOAD:
        httpStatus = 400;
        userMessage = 'Kailangan ang wastong impormasyon at 4-digit numeric PIN.';
        break;
      case LifecycleErrorCode.INTERNAL_ERROR:
      default:
        httpStatus = 500;
        userMessage = 'Nagkaroon ng problema sa server. Paki-subukan muli mamaya.';
        break;
    }

    // Error message is strictly fixed to userMessage. internalDetail is never public.
    super(userMessage);
    this.name = 'LifecycleError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.userMessage = userMessage;
    this.internalDetail = internalDetail;
  }
}

// Firestore structured error representations we treat as "transaction was
// aborted by concurrent contention" — this is the only case where we may
// perform an authoritative read-only slot/username classification.
const TRANSACTION_ABORTED_CODES = new Set(['ABORTED']);
const TRANSACTION_ABORTED_GRPC_CODES = new Set([10]); // gRPC ABORTED = 10
const TRANSACTION_INVALIDATED_MESSAGE = 'transaction is invalid or closed';

function isTransactionAbortedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  // Structured Firestore code (string) — e.g. 'ABORTED' or Firestore 4-arg
  // (code "ABORTED", details object, metadata).
  if (typeof e.code === 'string' && TRANSACTION_ABORTED_CODES.has(e.code.toUpperCase())) {
    return true;
  }
  // Numeric gRPC status code for ABORTED.
  if (typeof e.code === 'number' && TRANSACTION_ABORTED_GRPC_CODES.has(e.code)) {
    return true;
  }
  // gRPC status field.
  if (typeof e.status === 'number' && TRANSACTION_ABORTED_GRPC_CODES.has(e.status)) {
    return true;
  }
  if (typeof e.status === 'string' && TRANSACTION_ABORTED_CODES.has(e.status.toUpperCase())) {
    return true;
  }
  // Firestore admin SDK sometimes serializes the gRPC code into the message
  // as "code 3 INVALID_ARGUMENT: ..." or "code 10 ABORTED: ...". The
  // INVALID_ARGUMENT form (code 3) is NOT a contention abort — it is the
  // specific known "transaction is invalid or closed" condition that arises
  // when a concurrent commit invalidates our transaction.
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  if (msg.includes(TRANSACTION_INVALIDATED_MESSAGE)) {
    return true;
  }
  return false;
}

function isLifecycleError(err: unknown): err is LifecycleError {
  return err instanceof LifecycleError;
}

export interface LifecycleServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  pepperConfig?: PepperConfigOptions;
  hashPinFn?: (pin: string, config?: PepperConfigOptions) => Promise<string>;
}

export interface ListCashiersParams {
  ownerToken: string;
  tenantId: string;
}

export interface CreateCashierParams {
  ownerToken: string;
  tenantId: string;
  username: string;
  pin: string;
}

export interface ResetPinParams {
  ownerToken: string;
  tenantId: string;
  staffAccountId: string;
  newPin: string;
}

export interface DisableCashierParams {
  ownerToken: string;
  tenantId: string;
  staffAccountId: string;
}

export interface RemoveCashierParams {
  ownerToken: string;
  tenantId: string;
  staffAccountId: string;
}

export interface SafeCashierListItem {
  id: string;
  username: string;
  status: 'active' | 'disabled' | string;
  createdAt: string | null;
  lastLoginAt: string | null;
  actionsAvailable: {
    resetPin: boolean;
    disable: boolean;
    remove: boolean;
  };
}

export interface SafeCashierSummary {
  id: string;
  tenantId: string;
  username: string;
  status: 'active' | 'disabled';
  sessionVersion: number;
  authUid: string;
}

/**
 * Validates the owner token and retrieves requester UID.
 */
async function verifyOwnerToken(
  ownerToken: string,
  auth: admin.auth.Auth
): Promise<{ ownerUid: string }> {
  if (!ownerToken || typeof ownerToken !== 'string') {
    throw new LifecycleError(LifecycleErrorCode.UNAUTHORIZED);
  }

  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await auth.verifyIdToken(ownerToken);
  } catch {
    throw new LifecycleError(LifecycleErrorCode.UNAUTHORIZED);
  }

  return { ownerUid: decodedToken.uid };
}

/**
 * Lists Cashier accounts for a tenant with owner authorization.
 * Returns only safe UI-required fields (tenantId omitted from items).
 * Never reveals PIN, hash, salt, or auth internals.
 */
export async function listCashierAccounts(
  params: ListCashiersParams,
  options?: LifecycleServiceOptions
): Promise<SafeCashierListItem[]> {
  const auth = options?.adminAuth || getAdminAuth();
  const db = options?.adminFirestore || getAdminFirestore();

  const { ownerUid } = await verifyOwnerToken(params.ownerToken, auth);

  const cleanTenantId = (params.tenantId || '').trim();
  if (!cleanTenantId) {
    throw new LifecycleError(LifecycleErrorCode.INVALID_PAYLOAD);
  }

  const tenantRef = db.collection('tenants').doc(cleanTenantId);
  const tenantDoc = await tenantRef.get();
  if (!tenantDoc.exists) {
    throw new LifecycleError(LifecycleErrorCode.NOT_FOUND);
  }

  const tenantData = tenantDoc.data() || {};
  if (tenantData.ownerUid !== ownerUid) {
    throw new LifecycleError(LifecycleErrorCode.FORBIDDEN);
  }

  const staffCollection = tenantRef.collection('staff_accounts');
  const staffSnapshot = await staffCollection.get();

  return staffSnapshot.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    
    // Safely format dates without leaking raw server objects
    let createdAtStr: string | null = null;
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
      createdAtStr = data.createdAt.toDate().toISOString();
    } else if (data.createdAt instanceof Date) {
      createdAtStr = data.createdAt.toISOString();
    } else if (typeof data.createdAt === 'string') {
      createdAtStr = data.createdAt;
    }

    let lastLoginAtStr: string | null = null;
    if (data.lastLoginAt && typeof data.lastLoginAt.toDate === 'function') {
      lastLoginAtStr = data.lastLoginAt.toDate().toISOString();
    } else if (data.lastLoginAt instanceof Date) {
      lastLoginAtStr = data.lastLoginAt.toISOString();
    } else if (typeof data.lastLoginAt === 'string') {
      lastLoginAtStr = data.lastLoginAt;
    }

    const currentStatus = data.status === 'disabled' ? 'disabled' : (data.status || 'active');

    return {
      id: docSnap.id,
      username: data.username || '',
      status: currentStatus,
      createdAt: createdAtStr,
      lastLoginAt: lastLoginAtStr,
      actionsAvailable: {
        resetPin: currentStatus === 'active', // PIN reset disabled for inactive/disabled cashiers
        disable: currentStatus === 'active',
        remove: true
      }
    };
  });
}

/**
 * Creates a new Cashier account inside an authoritative Firestore transaction.
 * Enforces preliminary ownership check BEFORE expensive modern KDF.
 * Atomically verifies deterministic slot guard, checks global username availability,
 * and writes all three records (staff, slot, reservation) atomically.
 */
export async function createCashierAccount(
  params: CreateCashierParams,
  options?: LifecycleServiceOptions
): Promise<SafeCashierSummary> {
  const auth = options?.adminAuth || getAdminAuth();
  const db = options?.adminFirestore || getAdminFirestore();
  const hashFn = options?.hashPinFn || hashPinModern;

  // 1. Verify owner ID token
  const { ownerUid } = await verifyOwnerToken(params.ownerToken, auth);

  const cleanTenantId = (params.tenantId || '').trim();
  const cleanUsername = (params.username || '').trim();
  const cleanPin = (params.pin || '').trim();

  if (!cleanTenantId || !cleanUsername || cleanUsername.length < 2 || cleanUsername.length > 30 || !/^\d{4}$/.test(cleanPin)) {
    throw new LifecycleError(LifecycleErrorCode.INVALID_PAYLOAD);
  }

  const usernameLower = cleanUsername.toLowerCase();
  const tenantRef = db.collection('tenants').doc(cleanTenantId);

  // 2. Preliminary Authoritative Ownership Check BEFORE expensive KDF
  const preTenantDoc = await tenantRef.get();
  if (!preTenantDoc.exists) {
    throw new LifecycleError(LifecycleErrorCode.NOT_FOUND);
  }
  const preTenantData = preTenantDoc.data() || {};
  if (preTenantData.ownerUid !== ownerUid) {
    throw new LifecycleError(LifecycleErrorCode.FORBIDDEN);
  }

  // 3. ONLY THEN perform expensive modern PIN hashing
  const pinHash = await hashFn(cleanPin, options?.pepperConfig);

  // 4. Authoritative transaction execution
  const globalUserRef = db.collection('staff_usernames').doc(usernameLower);
  const staffCollection = tenantRef.collection('staff_accounts');
  const slotRef = tenantRef.collection('staff_slots').doc('cashier_primary');
  const newStaffRef = staffCollection.doc();
  const authUid = generateCashierAuthUid(cleanTenantId, newStaffRef.id);
  const sessionVersion = 1;

  try {
    await db.runTransaction(async (txn) => {
    // 4a. Fresh read & tenant ownership check (prevent TOCTOU)
    const tenantDoc = await txn.get(tenantRef);
    if (!tenantDoc.exists) {
      throw new LifecycleError(LifecycleErrorCode.NOT_FOUND);
    }
    const tenantData = tenantDoc.data() || {};
    if (tenantData.ownerUid !== ownerUid) {
      throw new LifecycleError(LifecycleErrorCode.FORBIDDEN);
    }

    // 4b. Global username reservation check
    const globalUserSnap = await txn.get(globalUserRef);
    if (globalUserSnap.exists) {
      throw new LifecycleError(LifecycleErrorCode.USERNAME_UNAVAILABLE);
    }

    // 4c. Deterministic Slot Guard Read
    const slotDoc = await txn.get(slotRef);
    if (slotDoc.exists) {
      const slotData = slotDoc.data() || {};
      if (slotData.staffAccountId) {
        const existingStaffRef = tenantRef.collection('staff_accounts').doc(slotData.staffAccountId);
        const existingStaffDoc = await txn.get(existingStaffRef);
        if (existingStaffDoc.exists) {
          throw new LifecycleError(LifecycleErrorCode.SLOT_LIMIT_REACHED);
        }
      }
    }

    // Also check existing staff_accounts collection for legacy cashier records
    const existingStaffSnap = await txn.get(staffCollection);
    if (existingStaffSnap.docs && existingStaffSnap.docs.length >= 1) {
      throw new LifecycleError(LifecycleErrorCode.SLOT_LIMIT_REACHED);
    }

    // 4d. Atomically write staff record, slot guard, and username reservation
    txn.set(globalUserRef, {
      username: cleanUsername,
      usernameLower,
      tenantId: cleanTenantId,
      staffAccountId: newStaffRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    txn.set(slotRef, {
      slotId: 'cashier_primary',
      tenantId: cleanTenantId,
      staffAccountId: newStaffRef.id,
      username: cleanUsername,
      assignedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    txn.set(newStaffRef, {
      id: newStaffRef.id,
      tenantId: cleanTenantId,
      username: cleanUsername,
      usernameLower,
      pinHash,
      status: 'active',
      sessionVersion,
      authUid,
      credentialVersion: 2,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: null
    });
   });
  } catch (txnErr) {
    if (isLifecycleError(txnErr)) {
      throw txnErr;
    }

    if (!isTransactionAbortedError(txnErr)) {
      throw txnErr;
    }

    let slotSnap;
    try {
      slotSnap = await db
        .collection('tenants')
        .doc(cleanTenantId)
        .collection('staff_slots')
        .doc('cashier_primary')
        .get();
    } catch {
      throw new LifecycleError(LifecycleErrorCode.INTERNAL_ERROR);
    }

    if (slotSnap.exists && slotSnap.data()?.staffAccountId) {
      throw new LifecycleError(LifecycleErrorCode.SLOT_LIMIT_REACHED);
    }

    let existingSnap;
    try {
      existingSnap = await db
        .collection('tenants')
        .doc(cleanTenantId)
        .collection('staff_accounts')
        .get();
    } catch {
      throw new LifecycleError(LifecycleErrorCode.INTERNAL_ERROR);
    }

    if (existingSnap.docs.length >= 1) {
      throw new LifecycleError(LifecycleErrorCode.SLOT_LIMIT_REACHED);
    }

    let usernameSnap;
    try {
      usernameSnap = await db
        .collection('staff_usernames')
        .doc(usernameLower)
        .get();
    } catch {
      throw new LifecycleError(LifecycleErrorCode.INTERNAL_ERROR);
    }

    if (usernameSnap.exists) {
      throw new LifecycleError(LifecycleErrorCode.USERNAME_UNAVAILABLE);
    }

    throw new LifecycleError(LifecycleErrorCode.INTERNAL_ERROR);
  }

  return {
    id: newStaffRef.id,
    tenantId: cleanTenantId,
    username: cleanUsername,
    status: 'active',
    sessionVersion,
    authUid
  };
}

/**
 * Resets the 4-digit PIN for a Cashier inside an authoritative transaction.
 * Performs preliminary ownership check before expensive KDF, updates PIN hash,
 * and increments sessionVersion to revoke previously minted tokens.
 */
export async function resetCashierPin(
  params: ResetPinParams,
  options?: LifecycleServiceOptions
): Promise<{ success: boolean; sessionVersion: number }> {
  const auth = options?.adminAuth || getAdminAuth();
  const db = options?.adminFirestore || getAdminFirestore();
  const hashFn = options?.hashPinFn || hashPinModern;

  // 1. Verify owner token
  const { ownerUid } = await verifyOwnerToken(params.ownerToken, auth);

  const cleanTenantId = (params.tenantId || '').trim();
  const cleanStaffAccountId = (params.staffAccountId || '').trim();
  const cleanPin = (params.newPin || '').trim();

  if (!cleanTenantId || !cleanStaffAccountId || !/^\d{4}$/.test(cleanPin)) {
    throw new LifecycleError(LifecycleErrorCode.INVALID_PAYLOAD);
  }

  const tenantRef = db.collection('tenants').doc(cleanTenantId);

  // 2. Preliminary Authoritative Ownership Check BEFORE expensive KDF
  const preTenantDoc = await tenantRef.get();
  if (!preTenantDoc.exists) {
    throw new LifecycleError(LifecycleErrorCode.NOT_FOUND);
  }
  const preTenantData = preTenantDoc.data() || {};
  if (preTenantData.ownerUid !== ownerUid) {
    throw new LifecycleError(LifecycleErrorCode.FORBIDDEN);
  }

  // 3. ONLY THEN perform expensive modern PIN hashing
  const newPinHash = await hashFn(cleanPin, options?.pepperConfig);

  const staffRef = tenantRef.collection('staff_accounts').doc(cleanStaffAccountId);
  let newSessionVersion = 1;

  await db.runTransaction(async (txn) => {
    // 4a. Fresh read & tenant ownership check
    const tenantDoc = await txn.get(tenantRef);
    if (!tenantDoc.exists) {
      throw new LifecycleError(LifecycleErrorCode.NOT_FOUND);
    }
    const tenantData = tenantDoc.data() || {};
    if (tenantData.ownerUid !== ownerUid) {
      throw new LifecycleError(LifecycleErrorCode.FORBIDDEN);
    }

    // 4b. Fresh read of staff document
    const staffDoc = await txn.get(staffRef);
    if (!staffDoc.exists) {
      throw new LifecycleError(LifecycleErrorCode.NOT_FOUND);
    }

    const currentData = staffDoc.data() || {};
    newSessionVersion = (typeof currentData.sessionVersion === 'number' ? currentData.sessionVersion : 1) + 1;

    txn.update(staffRef, {
      pinHash: newPinHash,
      credentialVersion: 2,
      sessionVersion: newSessionVersion,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { success: true, sessionVersion: newSessionVersion };
}

/**
 * Disables a Cashier account inside an authoritative transaction.
 * Atomically verifies tenant ownership, sets status to 'disabled',
 * and increments sessionVersion to immediately revoke active sessions.
 */
export async function disableCashierAccount(
  params: DisableCashierParams,
  options?: LifecycleServiceOptions
): Promise<{ success: boolean; sessionVersion: number }> {
  const auth = options?.adminAuth || getAdminAuth();
  const db = options?.adminFirestore || getAdminFirestore();

  const { ownerUid } = await verifyOwnerToken(params.ownerToken, auth);

  const cleanTenantId = (params.tenantId || '').trim();
  const cleanStaffAccountId = (params.staffAccountId || '').trim();

  if (!cleanTenantId || !cleanStaffAccountId) {
    throw new LifecycleError(LifecycleErrorCode.INVALID_PAYLOAD);
  }

  const tenantRef = db.collection('tenants').doc(cleanTenantId);
  const staffRef = tenantRef.collection('staff_accounts').doc(cleanStaffAccountId);
  let newSessionVersion = 1;

  await db.runTransaction(async (txn) => {
    // 1. Fresh read & tenant ownership check
    const tenantDoc = await txn.get(tenantRef);
    if (!tenantDoc.exists) {
      throw new LifecycleError(LifecycleErrorCode.NOT_FOUND);
    }
    const tenantData = tenantDoc.data() || {};
    if (tenantData.ownerUid !== ownerUid) {
      throw new LifecycleError(LifecycleErrorCode.FORBIDDEN);
    }

    // 2. Fresh read of staff document
    const staffDoc = await txn.get(staffRef);
    if (!staffDoc.exists) {
      throw new LifecycleError(LifecycleErrorCode.NOT_FOUND);
    }

    const currentData = staffDoc.data() || {};
    newSessionVersion = (typeof currentData.sessionVersion === 'number' ? currentData.sessionVersion : 1) + 1;

    txn.update(staffRef, {
      status: 'disabled',
      sessionVersion: newSessionVersion,
      disabledAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { success: true, sessionVersion: newSessionVersion };
}

/**
 * Removes a Cashier account inside an authoritative transaction.
 * Atomically verifies tenant ownership, deletes the staff document,
 * releases the slot guard if matched, and deletes the global username reservation
 * ONLY IF it identifies the exact tenant and cashier.
 */
export async function removeCashierAccount(
  params: RemoveCashierParams,
  options?: LifecycleServiceOptions
): Promise<{ success: boolean }> {
  const auth = options?.adminAuth || getAdminAuth();
  const db = options?.adminFirestore || getAdminFirestore();

  const { ownerUid } = await verifyOwnerToken(params.ownerToken, auth);

  const cleanTenantId = (params.tenantId || '').trim();
  const cleanStaffAccountId = (params.staffAccountId || '').trim();

  if (!cleanTenantId || !cleanStaffAccountId) {
    throw new LifecycleError(LifecycleErrorCode.INVALID_PAYLOAD);
  }

  const tenantRef = db.collection('tenants').doc(cleanTenantId);
  const staffRef = tenantRef.collection('staff_accounts').doc(cleanStaffAccountId);
  const slotRef = tenantRef.collection('staff_slots').doc('cashier_primary');

  await db.runTransaction(async (txn) => {
    // 1. Fresh read & tenant ownership check
    const tenantDoc = await txn.get(tenantRef);
    if (!tenantDoc.exists) {
      throw new LifecycleError(LifecycleErrorCode.NOT_FOUND);
    }
    const tenantData = tenantDoc.data() || {};
    if (tenantData.ownerUid !== ownerUid) {
      throw new LifecycleError(LifecycleErrorCode.FORBIDDEN);
    }

    // 2. Fresh read of staff document
    const staffDoc = await txn.get(staffRef);
    if (!staffDoc.exists) {
      throw new LifecycleError(LifecycleErrorCode.NOT_FOUND);
    }

    const staffData = staffDoc.data() || {};
    if (Object.prototype.hasOwnProperty.call(staffData, 'activeShiftId')) {
      throw new LifecycleError(LifecycleErrorCode.ACTIVE_SHIFT_EXISTS);
    }
    const usernameLower = (staffData.usernameLower || staffData.username || '').toLowerCase();

    // 3. Read slot document
    const slotDoc = await txn.get(slotRef);
    let shouldReleaseSlot = false;
    if (slotDoc.exists) {
      const slotData = slotDoc.data() || {};
      if (slotData.staffAccountId === cleanStaffAccountId && slotData.tenantId === cleanTenantId) {
        shouldReleaseSlot = true;
      }
    }

    // 4. Read global username reservation before performing any writes
    let matchingGlobalUserRef: admin.firestore.DocumentReference | null = null;
    if (usernameLower) {
      const globalUserRef = db.collection('staff_usernames').doc(usernameLower);
      const globalUserDoc = await txn.get(globalUserRef);
      if (globalUserDoc.exists) {
        const resData = globalUserDoc.data() || {};
        if (resData.tenantId === cleanTenantId && resData.staffAccountId === cleanStaffAccountId) {
          matchingGlobalUserRef = globalUserRef;
        }
      }
    }

    // 5. Write phase: delete staff record, release slot if matched, release reservation if matched
    txn.delete(staffRef);
    if (shouldReleaseSlot) {
      txn.delete(slotRef);
    }
    if (matchingGlobalUserRef) {
      txn.delete(matchingGlobalUserRef);
    }
  });

  return { success: true };
}
