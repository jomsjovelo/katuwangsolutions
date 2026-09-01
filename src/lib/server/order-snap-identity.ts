/**
 * Order Snap Canonical Identity Verifier
 *
 * Single source of truth for server-side identity validation.
 * Used by both checkout and catalog handlers.
 *
 * Invariants:
 * - ALL reads are executed BEFORE any writes (read-side only)
 * - NEVER trusts token claims alone; verifies against authoritative Firestore state
 * - FAILS CLOSED on any missing, mismatched, or stale data
 */

import * as admin from 'firebase-admin';
import { getAdminFirestore } from '@/firebase/admin';
import { SERVER_IDENTIFIER, ALLOWED_MODULE_IDS, OrderSnapError, OrderSnapErrorCode } from './order-snap-finalizer';

export interface VerifiedOrderSnapIdentity {
  uid: string;
  tenantId: string;
  staffAccountId: string | null;
  sessionVersion: number;
  actorId: string;
  role: 'cashier' | 'owner';
}

interface TenantSnapshot {
  moduleType: string;
  subscriptionStatus: string;
  ownerUid?: string;
}

interface StaffSnapshot {
  status: string;
  tenantId: string;
  authUid: string;
  sessionVersion: number;
}

const ERROR_MESSAGES = {
  TENANT_NOT_FOUND: 'Tenant not found.',
  TENANT_NOT_ACTIVE: 'Tenant not active.',
  MODULE_NOT_AUTHORIZED: 'Module not authorized for Order Snap.',
  SUBSCRIPTION_INACTIVE: 'Subscription not active.',
  STAFF_NOT_FOUND: 'Staff account not found.',
  STAFF_INACTIVE: 'Staff account inactive.',
  STAFF_TENANT_MISMATCH: 'Staff tenant mismatch.',
  STAFF_AUTH_MISMATCH: 'Staff auth UID mismatch.',
  SESSION_VERSION_MISMATCH: 'Session version mismatch.',
  OWNER_MISMATCH: 'Not owner of tenant.',
  MISSING_TENANT_ID: 'Tenant ID required.',
  INVALID_ROLE: 'Unauthorized role.',
  INVALID_TENANT_ID: 'Invalid tenant identifier.',
  MISSING_STAFF_ACCOUNT_ID: 'Staff account ID required.',
  INVALID_STAFF_ACCOUNT_ID: 'Invalid staff account identifier.',
  INVALID_SESSION_VERSION: 'Invalid session version.'
};

export async function verifyOrderSnapIdentity(
  idToken: string,
  auth: admin.auth.Auth,
  firestore: admin.firestore.Firestore = getAdminFirestore()
): Promise<VerifiedOrderSnapIdentity> {
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch {
    throw new OrderSnapError(OrderSnapErrorCode.AUTHENTICATION_REQUIRED, 'Authentication required.');
  }

  const role = decoded.role;
  const uid = decoded.uid;

  if (role === 'cashier') {
    return verifyCashierIdentity(decoded, uid, firestore);
  }

  if (role === 'owner') {
    return verifyOwnerIdentity(decoded, uid, firestore);
  }

  throw new OrderSnapError(OrderSnapErrorCode.OPERATION_NOT_PERMITTED, ERROR_MESSAGES.INVALID_ROLE);
}

async function verifyCashierIdentity(
  decoded: admin.auth.DecodedIdToken,
  uid: string,
  firestore: admin.firestore.Firestore
): Promise<VerifiedOrderSnapIdentity> {
  const tenantId = decoded.tenantId;
  const staffAccountId = decoded.staffAccountId;
  const tokenSessionVersion = decoded.sessionVersion;

  if (!tenantId || typeof tenantId !== 'string' || !SERVER_IDENTIFIER.test(tenantId)) {
    throw new OrderSnapError(OrderSnapErrorCode.OPERATION_NOT_PERMITTED, ERROR_MESSAGES.MISSING_TENANT_ID);
  }

  if (!staffAccountId || typeof staffAccountId !== 'string' || !SERVER_IDENTIFIER.test(staffAccountId)) {
    throw new OrderSnapError(OrderSnapErrorCode.OPERATION_NOT_PERMITTED, ERROR_MESSAGES.MISSING_STAFF_ACCOUNT_ID);
  }

  if (!Number.isSafeInteger(tokenSessionVersion) || tokenSessionVersion < 0) {
    throw new OrderSnapError(OrderSnapErrorCode.SESSION_INVALID, ERROR_MESSAGES.INVALID_SESSION_VERSION);
  }

  const tenantRef = firestore.collection('tenants').doc(tenantId);
  const tenantSnap = await tenantRef.get();

  if (!tenantSnap.exists) {
    throw new OrderSnapError(OrderSnapErrorCode.CHECKOUT_UNAVAILABLE, ERROR_MESSAGES.TENANT_NOT_FOUND);
  }

  const tenant = tenantSnap.data() as TenantSnapshot | undefined;
  if (!tenant || tenant.subscriptionStatus !== 'active') {
    throw new OrderSnapError(OrderSnapErrorCode.CHECKOUT_UNAVAILABLE, ERROR_MESSAGES.SUBSCRIPTION_INACTIVE);
  }

  if (!ALLOWED_MODULE_IDS.includes(tenant.moduleType as any)) {
    throw new OrderSnapError(OrderSnapErrorCode.CHECKOUT_UNAVAILABLE, ERROR_MESSAGES.MODULE_NOT_AUTHORIZED);
  }

  const staffRef = tenantRef.collection('staff_accounts').doc(staffAccountId);
  const staffSnap = await staffRef.get();

  if (!staffSnap.exists) {
    throw new OrderSnapError(OrderSnapErrorCode.SESSION_INVALID, ERROR_MESSAGES.STAFF_NOT_FOUND);
  }

  const staff = staffSnap.data() as StaffSnapshot | undefined;
  if (!staff || staff.status !== 'active') {
    throw new OrderSnapError(OrderSnapErrorCode.SESSION_INVALID, ERROR_MESSAGES.STAFF_INACTIVE);
  }

  if (staff.tenantId !== tenantId) {
    throw new OrderSnapError(OrderSnapErrorCode.SESSION_INVALID, ERROR_MESSAGES.STAFF_TENANT_MISMATCH);
  }

  if (staff.authUid !== uid) {
    throw new OrderSnapError(OrderSnapErrorCode.SESSION_INVALID, ERROR_MESSAGES.STAFF_AUTH_MISMATCH);
  }

  if (staff.sessionVersion !== tokenSessionVersion) {
    throw new OrderSnapError(OrderSnapErrorCode.SESSION_INVALID, ERROR_MESSAGES.SESSION_VERSION_MISMATCH);
  }

  return {
    uid,
    tenantId,
    staffAccountId,
    sessionVersion: tokenSessionVersion,
    actorId: `staff_${staffAccountId}`,
    role: 'cashier'
  };
}

async function verifyOwnerIdentity(
  decoded: admin.auth.DecodedIdToken,
  uid: string,
  firestore: admin.firestore.Firestore
): Promise<VerifiedOrderSnapIdentity> {
  let tenantId = decoded.tenantId;

  if (!tenantId || typeof tenantId !== 'string') {
    const tenantQuery = await firestore
      .collection('tenants')
      .where('ownerUid', '==', uid)
      .limit(1)
      .get();

    if (!tenantQuery.empty) {
      tenantId = tenantQuery.docs[0].id;
    }
  }

  if (!tenantId || typeof tenantId !== 'string' || !SERVER_IDENTIFIER.test(tenantId)) {
    throw new OrderSnapError(OrderSnapErrorCode.OPERATION_NOT_PERMITTED, ERROR_MESSAGES.INVALID_TENANT_ID);
  }

  const tenantRef = firestore.collection('tenants').doc(tenantId);
  const tenantSnap = await tenantRef.get();

  if (!tenantSnap.exists) {
    throw new OrderSnapError(OrderSnapErrorCode.CHECKOUT_UNAVAILABLE, ERROR_MESSAGES.TENANT_NOT_FOUND);
  }

  const tenant = tenantSnap.data() as TenantSnapshot | undefined;
  if (!tenant || tenant.subscriptionStatus !== 'active') {
    throw new OrderSnapError(OrderSnapErrorCode.CHECKOUT_UNAVAILABLE, ERROR_MESSAGES.SUBSCRIPTION_INACTIVE);
  }

  if (!ALLOWED_MODULE_IDS.includes(tenant.moduleType as any)) {
    throw new OrderSnapError(OrderSnapErrorCode.CHECKOUT_UNAVAILABLE, ERROR_MESSAGES.MODULE_NOT_AUTHORIZED);
  }

  if (tenant.ownerUid !== uid) {
    throw new OrderSnapError(OrderSnapErrorCode.OPERATION_NOT_PERMITTED, ERROR_MESSAGES.OWNER_MISMATCH);
  }

  return {
    uid,
    tenantId,
    staffAccountId: `owner_${uid}`,
    sessionVersion: 1,
    actorId: `owner_${uid}`,
    role: 'owner'
  };
}

export function sanitizedErrorResponse(error: OrderSnapError, headers?: HeadersInit): Response {
  return Response.json(
    { error: error.userMessage, category: error.code },
    { status: error.httpStatus, headers }
  );
}