import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { admitStaffAuthRequest, extractTrustedClientIp, staffAuthRateLimiter } from './rate-limiter';
import { isSecureCashierSystemEnabled } from './secure-cashier-config';
import {
  assertBentaCashierAuthorization, BENTA_SNAP_MODULE_ID, CheckoutError, CheckoutErrorCode,
  hasOnlyRecordKeys, isPlainRecord, sanitizedErrorResponse, SERVER_IDENTIFIER, verifyBentaCashierIdentity
} from './cashier-server-authorization';
import { assertReconciliationShift, SHIFT_RECONCILIATION_VERSION } from './benta-cashier-shift-receipt';

export const MAX_STARTING_CASH_CENTAVOS = 10_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ShiftOpenRequest { idempotencyKey: string; startingCashCentavos: number }
export interface SanitizedShiftOpenResult {
  shiftId: string;
  openedAt: string;
  moduleId: typeof BENTA_SNAP_MODULE_ID;
  status: 'open' | 'closed';
  startingCashCentavos: number;
}
export interface ShiftOpenServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

export function validateShiftOpenRequest(value: unknown): ShiftOpenRequest {
  if (!isPlainRecord(value) || !hasOnlyRecordKeys(value, ['idempotencyKey', 'startingCashCentavos']) ||
      typeof value.idempotencyKey !== 'string' || !UUID.test(value.idempotencyKey) || typeof value.startingCashCentavos !== 'number' ||
      !Number.isSafeInteger(value.startingCashCentavos) || value.startingCashCentavos < 0 || value.startingCashCentavos > MAX_STARTING_CASH_CENTAVOS) {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }
  return { idempotencyKey: value.idempotencyKey, startingCashCentavos: value.startingCashCentavos };
}

function openingDocumentId(staffAccountId: string, key: string): string {
  return createHash('sha256').update(`shift-open:${staffAccountId}:${key}`, 'utf8').digest('hex');
}
function openingFingerprint(staffAccountId: string, request: ShiftOpenRequest): string {
  return createHash('sha256').update(JSON.stringify({ actor: staffAccountId, moduleId: BENTA_SNAP_MODULE_ID, startingCashCentavos: request.startingCashCentavos, intent: request.idempotencyKey }), 'utf8').digest('hex');
}
function timestampIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate: () => Date }).toDate().toISOString();
  return null;
}

export async function openBentaCashierShift(idToken: string, requestValue: unknown, options: ShiftOpenServiceOptions = {}): Promise<SanitizedShiftOpenResult> {
  const auth = options.adminAuth || getAdminAuth();
  const identity = await verifyBentaCashierIdentity(idToken, auth);
  const request = validateShiftOpenRequest(requestValue);
  const db = options.adminFirestore || getAdminFirestore();
  const tenantRef = db.collection('tenants').doc(identity.tenantId);
  const staffRef = tenantRef.collection('staff_accounts').doc(identity.staffAccountId);
  const idempotencyRef = tenantRef.collection('cashier_shift_open_idempotency').doc(openingDocumentId(identity.staffAccountId, request.idempotencyKey));
  const shiftRef = tenantRef.collection('shifts').doc();
  const auditRef = tenantRef.collection('audit_log').doc();
  const openedAt = (options.now || admin.firestore.Timestamp.now)();
  const fingerprint = openingFingerprint(identity.staffAccountId, request);
  try {
    return await db.runTransaction(async (transaction) => {
      const [tenantSnap, staffSnap, idempotencySnap] = await transaction.getAll(tenantRef, staffRef, idempotencyRef);
      const staff = assertBentaCashierAuthorization(identity, tenantSnap, staffSnap);
      if (idempotencySnap.exists) {
        const prior = idempotencySnap.data()!;
        if (prior.status !== 'complete' || prior.fingerprint !== fingerprint || typeof prior.shiftId !== 'string' || !SERVER_IDENTIFIER.test(prior.shiftId)) {
          throw new CheckoutError(CheckoutErrorCode.IDEMPOTENCY_CONFLICT);
        }
        const priorShiftSnap = await transaction.get(tenantRef.collection('shifts').doc(prior.shiftId));
        if (!priorShiftSnap.exists) throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
        const priorShift = priorShiftSnap.data()!;
        try { assertReconciliationShift(priorShiftSnap.id, priorShift, identity, false); } catch { throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED); }
        const openedAtIso = timestampIso(priorShift.openedAt);
        if (priorShift.id !== prior.shiftId || priorShift.startingCash !== request.startingCashCentavos ||
            (priorShift.status !== 'open' && priorShift.status !== 'closed') || !openedAtIso || !isPlainRecord(prior.result) ||
            prior.result.shiftId !== prior.shiftId || prior.result.openedAt !== openedAtIso ||
            prior.result.moduleId !== BENTA_SNAP_MODULE_ID || prior.result.startingCashCentavos !== request.startingCashCentavos) {
          throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
        }
        const hasActivePointer = Object.prototype.hasOwnProperty.call(staff, 'activeShiftId');
        if (priorShift.status === 'open') {
          if (!hasActivePointer || typeof staff.activeShiftId !== 'string' || !SERVER_IDENTIFIER.test(staff.activeShiftId) || staff.activeShiftId !== priorShiftSnap.id) {
            throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
          }
        } else if (hasActivePointer) {
          if (typeof staff.activeShiftId !== 'string' || !SERVER_IDENTIFIER.test(staff.activeShiftId) || staff.activeShiftId === priorShiftSnap.id) {
            throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
          }
          const currentShiftSnap = await transaction.get(tenantRef.collection('shifts').doc(staff.activeShiftId));
          if (!currentShiftSnap.exists) throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
          try { assertReconciliationShift(currentShiftSnap.id, currentShiftSnap.data()!, identity); }
          catch { throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED); }
        }
        return {
          shiftId: prior.shiftId,
          openedAt: openedAtIso,
          moduleId: BENTA_SNAP_MODULE_ID,
          status: priorShift.status,
          startingCashCentavos: request.startingCashCentavos
        };
      }

      if (Object.prototype.hasOwnProperty.call(staff, 'activeShiftId')) {
        if (typeof staff.activeShiftId !== 'string' || !SERVER_IDENTIFIER.test(staff.activeShiftId)) throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
        const activeSnap = await transaction.get(tenantRef.collection('shifts').doc(staff.activeShiftId));
        if (!activeSnap.exists) throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
        try { assertReconciliationShift(activeSnap.id, activeSnap.data()!, identity); } catch { throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED); }
        if (activeSnap.id !== staff.activeShiftId) throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
        throw new CheckoutError(CheckoutErrorCode.SHIFT_ALREADY_OPEN);
      }

      const unexpectedOpenQuery = tenantRef.collection('shifts').where('staffId', '==', identity.actorId).where('status', '==', 'open').limit(1);
      const unexpectedOpen = await transaction.get(unexpectedOpenQuery);
      if (!unexpectedOpen.empty) throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);

      const staffName = typeof staff.displayName === 'string' && staff.displayName.trim() ? staff.displayName.trim() :
        typeof staff.username === 'string' && staff.username.trim() ? staff.username.trim() : 'Cashier';
      const result: SanitizedShiftOpenResult = {
        shiftId: shiftRef.id, openedAt: openedAt.toDate().toISOString(), moduleId: BENTA_SNAP_MODULE_ID,
        status: 'open', startingCashCentavos: request.startingCashCentavos
      };
      transaction.create(shiftRef, {
        id: shiftRef.id, tenantId: identity.tenantId, moduleId: BENTA_SNAP_MODULE_ID,
        staffAccountId: identity.staffAccountId, staffId: identity.actorId, staffName, openedBy: identity.actorId,
        status: 'open', reconciliationVersion: SHIFT_RECONCILIATION_VERSION, startingCash: request.startingCashCentavos,
        cashSales: 0, gcashSales: 0, mayaSales: 0, totalShiftSales: 0, electronicReceipts: 0,
        physicalCashAdjustments: 0, saleCount: 0, openedAt
      });
      transaction.update(staffRef, { activeShiftId: shiftRef.id, updatedAt: openedAt });
      transaction.create(auditRef, {
        id: auditRef.id, tenantId: identity.tenantId, type: 'cashier_shift_initialization', action: 'open_shift',
        actorId: identity.actorId, staffAccountId: identity.staffAccountId, shiftId: shiftRef.id,
        startingCashCentavos: request.startingCashCentavos, createdAt: openedAt
      });
      transaction.create(idempotencyRef, { status: 'complete', fingerprint, shiftId: shiftRef.id, result, completedAt: openedAt });
      return result;
    });
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    throw new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE);
  }
}

export function createBentaShiftOpenRouteHandler(overrides: Partial<{
  enabled: () => boolean;
  extractClientIp: (headers: Headers) => string | null;
  admitNetworkRequest: (networkIdentifier: string) => Promise<{ isLimited: boolean; retryAfterSeconds: number; reason?: 'account' | 'network' | 'global' | 'unavailable' }>;
  openShift: (token: string, body: unknown) => Promise<unknown>;
}> = {}, serviceOptions?: ShiftOpenServiceOptions) {
  const deps = {
    enabled: isSecureCashierSystemEnabled, extractClientIp: extractTrustedClientIp,
    admitNetworkRequest: (networkIdentifier: string) => staffAuthRateLimiter.admitNetworkRequest(networkIdentifier),
    openShift: (token: string, body: unknown) => openBentaCashierShift(token, body, serviceOptions), ...overrides
  };
  return async (request: Request): Promise<Response> => {
    if (!deps.enabled()) return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.CHECKOUT_UNAVAILABLE));
    try {
      const clientIp = overrides.admitNetworkRequest ? deps.extractClientIp(request.headers) : null;
      if (overrides.admitNetworkRequest && !clientIp) return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE));
      const admission = overrides.admitNetworkRequest
        ? await deps.admitNetworkRequest(clientIp!)
        : await admitStaffAuthRequest(request.headers);
      if (admission.isLimited) {
        const unavailable = admission.reason === 'unavailable';
        const error = new CheckoutError(unavailable ? CheckoutErrorCode.SERVICE_UNAVAILABLE : CheckoutErrorCode.CHECKOUT_UNAVAILABLE);
        return Response.json({ error: error.userMessage, category: error.code }, { status: unavailable ? 503 : 429, headers: { 'Retry-After': String(Math.max(1, admission.retryAfterSeconds)) } });
      }
      const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '');
      if (!match) return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.AUTHENTICATION_REQUIRED));
      if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.INVALID_REQUEST));
      let body: unknown;
      try { body = await request.json(); } catch { return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.INVALID_REQUEST)); }
      return Response.json(await deps.openShift(match[1], body), { status: 201 });
    } catch (error) { return sanitizedErrorResponse(error instanceof CheckoutError ? error : new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE)); }
  };
}
