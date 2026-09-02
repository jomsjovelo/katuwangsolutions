import { initializeFirebase } from '@/firebase';

export const SALE_REVERSAL_MAX_REASON_LENGTH = 500;
export const SALE_REVERSAL_CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

export interface SaleReversalReceipt {
  readonly reversalId: string;
  readonly saleId: string;
  readonly voidedAt: string;
  readonly paymentMethod: string;
  readonly productCount: number;
  readonly shiftStatus: 'open' | 'closed';
  readonly reversalVersion: number;
}

export type SaleReversalErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_INELIGIBLE'
  | 'SALE_NOT_FOUND'
  | 'SALE_NOT_REVERSIBLE'
  | 'SALE_ALREADY_VOIDED'
  | 'INVALID_REQUEST'
  | 'IDEMPOTENCY_CONFLICT'
  | 'REVERSAL_INTEGRITY_ERROR'
  | 'LEDGER_ERROR'
  | 'SHIFT_ERROR'
  | 'UNDERFLOW'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export class SaleReversalError extends Error {
  readonly code: SaleReversalErrorCode;
  readonly httpStatus: number;
  constructor(message: string, code: SaleReversalErrorCode, httpStatus: number) {
    super(message);
    this.name = 'SaleReversalError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const RECEIPT_KEYS = ['reversalId', 'saleId', 'voidedAt', 'paymentMethod', 'productCount', 'shiftStatus', 'reversalVersion'] as const;

function sanitizeReceipt(raw: unknown): SaleReversalReceipt {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    throw new SaleReversalError('Nagkaroon ng problema sa server response.', 'UNKNOWN_ERROR', 500);
  }
  const r = raw as Record<string, unknown>;
  const receivedKeys = Object.keys(r);
  if (receivedKeys.length !== RECEIPT_KEYS.length || !RECEIPT_KEYS.every((k) => k in r)) {
    throw new SaleReversalError('Nagkaroon ng problema sa server response.', 'UNKNOWN_ERROR', 500);
  }
  return Object.freeze({
    reversalId: String(r.reversalId),
    saleId: String(r.saleId),
    voidedAt: String(r.voidedAt),
    paymentMethod: String(r.paymentMethod),
    productCount: Number(r.productCount),
    shiftStatus: String(r.shiftStatus) as 'open' | 'closed',
    reversalVersion: Number(r.reversalVersion),
  }) as SaleReversalReceipt;
}

async function getOwnerAuthToken(): Promise<string> {
  const { auth } = initializeFirebase();
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new SaleReversalError(
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
  if (trimmed.length > SALE_REVERSAL_MAX_REASON_LENGTH) {
    return { valid: false, message: `Hindi dapat higit sa ${SALE_REVERSAL_MAX_REASON_LENGTH} character ang dahilan.` };
  }
  if (SALE_REVERSAL_CONTROL_CHAR_REGEX.test(trimmed)) {
    return { valid: false, message: 'Hindi allowed ang control characters sa dahilan.' };
  }
  return { valid: true, value: trimmed };
}

export interface SubmitSaleReversalOptions {
  tenantId: string;
  saleId: string;
  reason: string;
  idempotencyKey: string;
  token?: string;
  fetchFn?: typeof fetch;
}

const ERROR_MESSAGES: Partial<Record<SaleReversalErrorCode, (status: number) => string>> = {
  AUTHENTICATION_REQUIRED: () => 'Kailangan munang mag-log in bilang may-ari ng tindahan.',
  FORBIDDEN: () => 'Wala kang karapatan na i-void ang sale na ito.',
  TENANT_NOT_FOUND: () => 'Hindi mahanap ang tenant.',
  TENANT_INELIGIBLE: () => 'Hindi eligible ang tenant para sa operasyong ito.',
  SALE_NOT_FOUND: () => 'Hindi mahanap ang sale.',
  SALE_NOT_REVERSIBLE: () => 'Hindi ma-void ang sale na ito.',
  SALE_ALREADY_VOIDED: () => 'Na-void na ang sale na ito.',
  INVALID_REQUEST: () => 'Hindi valid ang request.',
  IDEMPOTENCY_CONFLICT: () => 'May nakabinbing pag-void na may ibang dahilan. Pakikontak ang support.',
  REVERSAL_INTEGRITY_ERROR: () => 'May integrity error sa reversal. Pakikontak ang support.',
  LEDGER_ERROR: () => 'May error sa ledger habang bina-void ang sale.',
  SHIFT_ERROR: () => 'May error sa shift habang bina-void ang sale.',
  UNDERFLOW: () => 'Hindi ma-void ang sale dahil mababa ang account balance.',
  SERVICE_UNAVAILABLE: () => 'Hindi available ang serbisyo ngayon. Pakib 시도 muli.',
  NETWORK_ERROR: () => 'Hindi makakonekta sa server. Pakitingnan ang internet connection.',
  UNKNOWN_ERROR: () => 'May error sa pag-void ng sale.',
};

export async function submitSaleReversal(options: SubmitSaleReversalOptions): Promise<SaleReversalReceipt> {
  const { tenantId, saleId, reason, idempotencyKey, token: providedToken, fetchFn = fetch } = options;

  const reasonValidation = validateReversalReason(reason);
  if (!reasonValidation.valid) {
    throw new SaleReversalError(reasonValidation.message, 'INVALID_REQUEST', 400);
  }

  let token: string;
  if (providedToken) {
    token = providedToken;
  } else {
    try {
      token = await getOwnerAuthToken();
    } catch {
      throw new SaleReversalError(
        'Kailangan munang mag-log in bilang may-ari ng tindahan.',
        'AUTHENTICATION_REQUIRED',
        401
      );
    }
  }

  let response: Response;
  try {
    response = await fetchFn(
      `/api/owner/tenants/${encodeURIComponent(tenantId)}/benta-sale-reversal`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          saleId,
          idempotencyKey,
          reason: reasonValidation.value,
        }),
      }
    );
  } catch {
    throw new SaleReversalError(
      'Hindi makakonekta sa server. Pakitingnan ang internet connection.',
      'NETWORK_ERROR',
      0
    );
  }

  if (response.ok) {
    const json: unknown = await response.json();
    return sanitizeReceipt(json);
  }

  let errorCode: SaleReversalErrorCode = 'UNKNOWN_ERROR';
  try {
    const errJson = (await response.json()) as Record<string, unknown>;
    if (typeof errJson.category === 'string') {
      errorCode = errJson.category as SaleReversalErrorCode;
    }
  } catch {
    // ignore parse failure
  }

  const msgFn = ERROR_MESSAGES[errorCode];
  const message = msgFn ? msgFn(response.status) : 'May error sa pag-void ng sale.';

  throw new SaleReversalError(message, errorCode, response.status);
}
