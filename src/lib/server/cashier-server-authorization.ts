import * as admin from 'firebase-admin';

export const BENTA_SNAP_MODULE_ID = 'benta-snap' as const;

export enum CheckoutErrorCode {
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  SESSION_INVALID = 'SESSION_INVALID',
  OPERATION_NOT_PERMITTED = 'OPERATION_NOT_PERMITTED',
  CHECKOUT_UNAVAILABLE = 'CHECKOUT_UNAVAILABLE',
  INVALID_REQUEST = 'INVALID_REQUEST',
  ACTIVE_SHIFT_REQUIRED = 'ACTIVE_SHIFT_REQUIRED',
  PRODUCT_UNAVAILABLE = 'PRODUCT_UNAVAILABLE',
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  SHIFT_ALREADY_OPEN = 'SHIFT_ALREADY_OPEN',
  SHIFT_RECOVERY_REQUIRED = 'SHIFT_RECOVERY_REQUIRED',
  RECONCILIATION_INVALID = 'RECONCILIATION_INVALID',
  RECEIPT_UNAVAILABLE = 'RECEIPT_UNAVAILABLE',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

const ERROR_DETAILS: Record<CheckoutErrorCode, { status: number; message: string }> = {
  [CheckoutErrorCode.AUTHENTICATION_REQUIRED]: { status: 401, message: 'Authentication required.' },
  [CheckoutErrorCode.SESSION_INVALID]: { status: 401, message: 'Session invalid.' },
  [CheckoutErrorCode.OPERATION_NOT_PERMITTED]: { status: 403, message: 'Operation not permitted.' },
  [CheckoutErrorCode.CHECKOUT_UNAVAILABLE]: { status: 503, message: 'Checkout unavailable.' },
  [CheckoutErrorCode.INVALID_REQUEST]: { status: 400, message: 'Invalid request.' },
  [CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED]: { status: 409, message: 'Active shift required.' },
  [CheckoutErrorCode.PRODUCT_UNAVAILABLE]: { status: 409, message: 'Product unavailable.' },
  [CheckoutErrorCode.INSUFFICIENT_STOCK]: { status: 409, message: 'Insufficient stock.' },
  [CheckoutErrorCode.IDEMPOTENCY_CONFLICT]: { status: 409, message: 'Idempotency conflict.' },
  [CheckoutErrorCode.SHIFT_ALREADY_OPEN]: { status: 409, message: 'A secure shift is already open.' },
  [CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED]: { status: 409, message: 'Shift recovery is required.' },
  [CheckoutErrorCode.RECONCILIATION_INVALID]: { status: 409, message: 'Shift reconciliation unavailable.' },
  [CheckoutErrorCode.RECEIPT_UNAVAILABLE]: { status: 404, message: 'Receipt unavailable.' },
  [CheckoutErrorCode.SERVICE_UNAVAILABLE]: { status: 503, message: 'Service temporarily unavailable.' }
};

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;

  constructor(code: CheckoutErrorCode) {
    const detail = ERROR_DETAILS[code];
    super(detail.message);
    this.name = 'CheckoutError';
    this.code = code;
    this.httpStatus = detail.status;
    this.userMessage = detail.message;
  }
}

export interface VerifiedCashierIdentity {
  uid: string;
  tenantId: string;
  staffAccountId: string;
  sessionVersion: number;
  actorId: string;
}

export const SERVER_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function hasOnlyRecordKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export async function verifyBentaCashierIdentity(idToken: string, auth: admin.auth.Auth): Promise<VerifiedCashierIdentity> {
  let token: admin.auth.DecodedIdToken;
  try {
    token = await auth.verifyIdToken(idToken);
  } catch {
    throw new CheckoutError(CheckoutErrorCode.AUTHENTICATION_REQUIRED);
  }
  const tenantId = token.tenantId;
  const staffAccountId = token.staffAccountId;
  if (token.role !== 'cashier' || typeof tenantId !== 'string' || !SERVER_IDENTIFIER.test(tenantId) ||
      typeof staffAccountId !== 'string' || !SERVER_IDENTIFIER.test(staffAccountId)) {
    throw new CheckoutError(CheckoutErrorCode.OPERATION_NOT_PERMITTED);
  }
  if (!Number.isSafeInteger(token.sessionVersion) || token.sessionVersion < 0) {
    throw new CheckoutError(CheckoutErrorCode.SESSION_INVALID);
  }
  return { uid: token.uid, tenantId, staffAccountId, sessionVersion: token.sessionVersion, actorId: `staff_${staffAccountId}` };
}

export function assertBentaCashierAuthorization(
  identity: VerifiedCashierIdentity,
  tenantSnapshot: admin.firestore.DocumentSnapshot,
  staffSnapshot: admin.firestore.DocumentSnapshot
): Record<string, unknown> {
  if (!tenantSnapshot.exists) throw new CheckoutError(CheckoutErrorCode.OPERATION_NOT_PERMITTED);
  const tenant = tenantSnapshot.data()!;
  if (tenant.moduleType !== BENTA_SNAP_MODULE_ID || tenant.subscriptionStatus !== 'active') {
    throw new CheckoutError(CheckoutErrorCode.CHECKOUT_UNAVAILABLE);
  }
  if (!staffSnapshot.exists) throw new CheckoutError(CheckoutErrorCode.SESSION_INVALID);
  const staff = staffSnapshot.data()!;
  if (staff.status !== 'active' || staff.tenantId !== identity.tenantId || staff.authUid !== identity.uid ||
      staff.sessionVersion !== identity.sessionVersion) {
    throw new CheckoutError(CheckoutErrorCode.SESSION_INVALID);
  }
  return staff;
}

export function sanitizedErrorResponse(error: CheckoutError, headers?: HeadersInit): Response {
  return Response.json({ error: error.userMessage, category: error.code }, { status: error.httpStatus, headers });
}
