import { initializeFirebase } from '@/firebase';

export const RESTOCK_REVERSAL_MAX_REASON_LENGTH = 500;
export const RESTOCK_REVERSAL_CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

export type PaymentEffect = 'cash_refunded' | 'payable_voided' | 'external_payment_unmodified';

export interface RestockReversalReceipt {
  readonly reversalId: string;
  readonly purchaseOrderId: string;
  readonly voidedAt: string;
  readonly productCount: number;
  readonly paymentEffect: PaymentEffect;
  readonly reversalVersion: 1;
}

export type RestockReversalErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_INELIGIBLE'
  | 'PO_NOT_FOUND'
  | 'PO_ALREADY_VOIDED'
  | 'PO_NOT_REVERSIBLE'
  | 'INVALID_REQUEST'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTEGRITY_ERROR'
  | 'PAYMENT_EVIDENCE_INVALID'
  | 'REPLAY_INTEGRITY_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export class RestockReversalError extends Error {
  readonly code: RestockReversalErrorCode;
  readonly httpStatus: number;
  constructor(message: string, code: RestockReversalErrorCode, httpStatus: number) {
    super(message);
    this.name = 'RestockReversalError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const RECEIPT_KEYS = ['reversalId', 'purchaseOrderId', 'voidedAt', 'productCount', 'paymentEffect', 'reversalVersion'] as const;
const SERVER_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const RESTOCK_REVERSAL_ERROR_CODES: ReadonlySet<RestockReversalErrorCode> = new Set([
  'AUTHENTICATION_REQUIRED', 'FORBIDDEN', 'TENANT_NOT_FOUND', 'TENANT_INELIGIBLE',
  'PO_NOT_FOUND', 'PO_ALREADY_VOIDED', 'PO_NOT_REVERSIBLE', 'INVALID_REQUEST',
  'IDEMPOTENCY_CONFLICT', 'INTEGRITY_ERROR', 'PAYMENT_EVIDENCE_INVALID',
  'REPLAY_INTEGRITY_ERROR', 'SERVICE_UNAVAILABLE', 'NETWORK_ERROR', 'UNKNOWN_ERROR',
]);

function isRestockReversalErrorCode(value: unknown): value is RestockReversalErrorCode {
  return typeof value === 'string' && RESTOCK_REVERSAL_ERROR_CODES.has(value as RestockReversalErrorCode);
}

function sanitizeReceipt(raw: unknown): RestockReversalReceipt {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    throw new RestockReversalError('Nagkaroon ng problema sa server response.', 'UNKNOWN_ERROR', 500);
  }
  const r = raw as Record<string, unknown>;
  const receivedKeys = Object.keys(r);
  if (receivedKeys.length !== RECEIPT_KEYS.length || !RECEIPT_KEYS.every((k) => k in r)) {
    throw new RestockReversalError('Nagkaroon ng problema sa server response.', 'UNKNOWN_ERROR', 500);
  }
  const paymentEffect = r.paymentEffect;
  if (
    paymentEffect !== 'cash_refunded' &&
    paymentEffect !== 'payable_voided' &&
    paymentEffect !== 'external_payment_unmodified'
  ) {
    throw new RestockReversalError('Nagkaroon ng problema sa server response.', 'UNKNOWN_ERROR', 500);
  }
  if (
    typeof r.reversalId !== 'string' || !SERVER_IDENTIFIER.test(r.reversalId) ||
    typeof r.purchaseOrderId !== 'string' || !SERVER_IDENTIFIER.test(r.purchaseOrderId) ||
    typeof r.voidedAt !== 'string' || Number.isNaN(Date.parse(r.voidedAt)) ||
    typeof r.productCount !== 'number' || !Number.isSafeInteger(r.productCount) || r.productCount < 1 || r.productCount > 100 ||
    r.reversalVersion !== 1
  ) {
    throw new RestockReversalError('Nagkaroon ng problema sa server response.', 'UNKNOWN_ERROR', 500);
  }
  return Object.freeze({
    reversalId: r.reversalId,
    purchaseOrderId: r.purchaseOrderId,
    voidedAt: r.voidedAt,
    productCount: r.productCount,
    paymentEffect: paymentEffect as PaymentEffect,
    reversalVersion: 1,
  });
}

async function getOwnerAuthToken(): Promise<string> {
  const { auth } = initializeFirebase();
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new RestockReversalError(
      'Kailangan munang mag-log in bilang may-ari ng tindahan.',
      'AUTHENTICATION_REQUIRED',
      401
    );
  }
  return currentUser.getIdToken();
}

const IDEMPOTENCY_KEY_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidIdempotencyKey(key: string): boolean {
  return IDEMPOTENCY_KEY_REGEX.test(key);
}

export function generateIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('Secure random generation unavailable');
}

export function validateReversalReason(reason: string): { valid: true; value: string } | { valid: false; message: string } {
  if (typeof reason !== 'string') {
    return { valid: false, message: 'Kailangan ang dahilan ng pag-void.' };
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return { valid: false, message: 'Kailangan ang dahilan ng pag-void.' };
  }
  if (trimmed.length > RESTOCK_REVERSAL_MAX_REASON_LENGTH) {
    return { valid: false, message: `Hindi dapat higit sa ${RESTOCK_REVERSAL_MAX_REASON_LENGTH} character ang dahilan.` };
  }
  if (RESTOCK_REVERSAL_CONTROL_CHAR_REGEX.test(trimmed)) {
    return { valid: false, message: 'Hindi allowed ang control characters sa dahilan.' };
  }
  return { valid: true, value: trimmed };
}

export interface SubmitRestockReversalOptions {
  tenantId: string;
  purchaseOrderId: string;
  reason: string;
  idempotencyKey: string;
  token?: string;
  fetchFn?: typeof fetch;
}

const RETRYABLE_ERROR_CODES: readonly RestockReversalErrorCode[] = [
  'SERVICE_UNAVAILABLE',
  'NETWORK_ERROR',
];

const ERROR_MESSAGES: Partial<Record<RestockReversalErrorCode, (status: number) => string>> = {
  AUTHENTICATION_REQUIRED: () => 'Kailangan munang mag-log in bilang may-ari ng tindahan.',
  FORBIDDEN: () => 'Wala kang karapatan na i-void ang purchase order na ito.',
  TENANT_NOT_FOUND: () => 'Hindi mahanap ang tenant.',
  TENANT_INELIGIBLE: () => 'Hindi eligible ang tenant para sa operasyong ito.',
  PO_NOT_FOUND: () => 'Hindi mahanap ang purchase order.',
  PO_ALREADY_VOIDED: () => 'Na-void na ang purchase order na ito.',
  PO_NOT_REVERSIBLE: () => 'Hindi ma-void ang purchase order na ito.',
  INVALID_REQUEST: () => 'Hindi valid ang request.',
  IDEMPOTENCY_CONFLICT: () => 'May nakabinbing pag-void na may ibang dahilan. Pakikontak ang support.',
  INTEGRITY_ERROR: () => 'May integrity error. Maaring nagbago ang inventory. Pakikontak ang support.',
  PAYMENT_EVIDENCE_INVALID: () => 'Hindi ma-void ang purchase order dahil sa payment evidence.',
  REPLAY_INTEGRITY_ERROR: () => 'May replay integrity error. Pakikontak ang support.',
  SERVICE_UNAVAILABLE: () => 'Hindi available ang serbisyo ngayon. Pakibasa muli.',
  NETWORK_ERROR: () => 'Hindi makakonekta sa server. Pakitingnan ang internet connection.',
  UNKNOWN_ERROR: () => 'May error sa pag-void ng purchase order.',
};

export function isRetryableError(error: RestockReversalError): boolean {
  return RETRYABLE_ERROR_CODES.includes(error.code);
}

export async function submitRestockReversal(options: SubmitRestockReversalOptions): Promise<RestockReversalReceipt> {
  const { tenantId, purchaseOrderId, reason, idempotencyKey, token: providedToken, fetchFn = fetch } = options;

  if (!SERVER_IDENTIFIER.test(tenantId) || !SERVER_IDENTIFIER.test(purchaseOrderId) || !isValidIdempotencyKey(idempotencyKey)) {
    throw new RestockReversalError('Hindi valid ang request.', 'INVALID_REQUEST', 400);
  }

  const reasonValidation = validateReversalReason(reason);
  if (!reasonValidation.valid) {
    throw new RestockReversalError(reasonValidation.message, 'INVALID_REQUEST', 400);
  }

  let token: string;
  if (typeof providedToken === 'string' && providedToken.trim().length > 0) {
    token = providedToken;
  } else {
    try {
      token = await getOwnerAuthToken();
    } catch {
      throw new RestockReversalError(
        'Kailangan munang mag-log in bilang may-ari ng tindahan.',
        'AUTHENTICATION_REQUIRED',
        401
      );
    }
  }

  let response: Response;
  try {
    response = await fetchFn(
      `/api/owner/tenants/${encodeURIComponent(tenantId)}/benta-restock-reversal`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          purchaseOrderId,
          idempotencyKey,
          reason: reasonValidation.value,
        }),
      }
    );
  } catch {
    throw new RestockReversalError(
      'Hindi makakonekta sa server. Pakitingnan ang internet connection.',
      'NETWORK_ERROR',
      0
    );
  }

  if (response.ok) {
    try {
      const json: unknown = await response.json();
      return sanitizeReceipt(json);
    } catch (error: unknown) {
      if (error instanceof RestockReversalError) throw error;
      throw new RestockReversalError('Nagkaroon ng problema sa server response.', 'UNKNOWN_ERROR', 500);
    }
  }

  let errorCode: RestockReversalErrorCode = 'UNKNOWN_ERROR';
  try {
    const errJson = (await response.json()) as Record<string, unknown>;
    if (isRestockReversalErrorCode(errJson.category)) {
      errorCode = errJson.category;
    }
  } catch {
    // ignore parse failure
  }

  const msgFn = ERROR_MESSAGES[errorCode];
  const message = msgFn ? msgFn(response.status) : 'May error sa pag-void ng purchase order.';

  throw new RestockReversalError(message, errorCode, response.status);
}
