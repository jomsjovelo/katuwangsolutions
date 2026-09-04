/**
 * Tsek-In Client API
 * Browser-side submission functions for check-in, check-out, and extension.
 */

export enum TsekInClientErrorCode {
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  ROOM_UNAVAILABLE = 'ROOM_UNAVAILABLE',
  ROOM_DATA_INVALID = 'ROOM_DATA_INVALID',
  BOOKING_NOT_FOUND = 'BOOKING_NOT_FOUND',
  BOOKING_NOT_ACTIVE = 'BOOKING_NOT_ACTIVE',
  TENANT_INELIGIBLE = 'TENANT_INELIGIBLE',
  FORBIDDEN = 'FORBIDDEN',
  FINANCIAL_INTEGRITY_ERROR = 'FINANCIAL_INTEGRITY_ERROR',
  PAYMENT_ALLOCATION_ERROR = 'PAYMENT_ALLOCATION_ERROR',
  INSUFFICIENT_CASH = 'INSUFFICIENT_CASH',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  INVALID_EXTENSION = 'INVALID_EXTENSION',
  RATE_SNAPSHOT_INVALID = 'RATE_SNAPSHOT_INVALID',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

const ERROR_MESSAGES: Record<TsekInClientErrorCode, string> = {
  [TsekInClientErrorCode.AUTHENTICATION_REQUIRED]: 'Please sign in to continue.',
  [TsekInClientErrorCode.INVALID_REQUEST]: 'Invalid request. Please check your input.',
  [TsekInClientErrorCode.INVALID_RESPONSE]: 'Invalid server response. Please try again.',
  [TsekInClientErrorCode.NETWORK_ERROR]: 'Network error. Please check your connection.',
  [TsekInClientErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
  [TsekInClientErrorCode.ROOM_NOT_FOUND]: 'Room not found.',
  [TsekInClientErrorCode.ROOM_UNAVAILABLE]: 'Room is not available.',
  [TsekInClientErrorCode.ROOM_DATA_INVALID]: 'Room data is invalid.',
  [TsekInClientErrorCode.BOOKING_NOT_FOUND]: 'Booking not found.',
  [TsekInClientErrorCode.BOOKING_NOT_ACTIVE]: 'Booking is not active.',
  [TsekInClientErrorCode.TENANT_INELIGIBLE]: 'Tenant is not eligible for Tsek-In.',
  [TsekInClientErrorCode.FORBIDDEN]: 'Operation not permitted.',
  [TsekInClientErrorCode.FINANCIAL_INTEGRITY_ERROR]: 'Financial integrity error.',
  [TsekInClientErrorCode.PAYMENT_ALLOCATION_ERROR]: 'Payment allocation error.',
  [TsekInClientErrorCode.INSUFFICIENT_CASH]: 'Insufficient cash on hand.',
  [TsekInClientErrorCode.IDEMPOTENCY_CONFLICT]: 'Idempotency conflict.',
  [TsekInClientErrorCode.INVALID_EXTENSION]: 'Invalid extension.',
  [TsekInClientErrorCode.RATE_SNAPSHOT_INVALID]: 'Stored rate snapshot is invalid.',
  [TsekInClientErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable. Please try again.',
};

const ALLOWED_ERROR_CODES = new Set(Object.values(TsekInClientErrorCode));

export class TsekInClientError extends Error {
  readonly code: TsekInClientErrorCode;

  constructor(code: TsekInClientErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'TsekInClientError';
    this.code = code;
  }
}

export interface FetchOptions {
  token?: string;
  fetchFn?: typeof fetch;
}

function getCrypto(): Crypto {
  const c = Reflect.get(globalThis, 'crypto') as Crypto | undefined;
  if (c && typeof c.getRandomValues === 'function') {
    return c;
  }
  throw new TsekInClientError(TsekInClientErrorCode.UNKNOWN_ERROR);
}

export function generateIdempotencyKey(): string {
  const c = getCrypto();
  if (typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  const arr = new Uint8Array(16);
  c.getRandomValues(arr);
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

export function isValidUUIDv4(uuid: string): boolean {
  const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidv4Regex.test(uuid);
}

function isStrictISO8601(str: string): boolean {
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:?\d{2})$/;
  if (!isoRegex.test(str)) return false;
  const date = new Date(str);
  if (isNaN(date.getTime())) return false;
  return date.toISOString() === str || date.toISOString().slice(0, -1) === str.slice(0, -1);
}

async function getIdToken(options: FetchOptions): Promise<string> {
  if (options.token !== undefined) {
    const t = options.token.trim();
    if (!t) {
      throw new TsekInClientError(TsekInClientErrorCode.AUTHENTICATION_REQUIRED);
    }
    return t;
  }
  const { initializeFirebase } = await import('@/firebase');
  const { auth } = initializeFirebase();
  const user = auth.currentUser;
  if (!user) {
    throw new TsekInClientError(TsekInClientErrorCode.AUTHENTICATION_REQUIRED);
  }
  const token = await user.getIdToken();
  const trimmed = token.trim();
  if (!trimmed) {
    throw new TsekInClientError(TsekInClientErrorCode.AUTHENTICATION_REQUIRED);
  }
  return trimmed;
}

function validateCheckInRequest(request: CheckInRequest): void {
  if (!request || typeof request !== 'object') {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  const requiredKeys = [
    'idempotencyKey', 'roomId', 'guestName',
    'stayType', 'duration', 'extraPax', 'paymentMethod', 'initialPaymentCentavos'
  ];
  const allowedKeys = new Set([...requiredKeys, 'contactInfo']);
  for (const k of Object.keys(request)) {
    if (!allowedKeys.has(k)) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    }
  }
  const keyCount = Object.keys(request).length;
  if (keyCount !== requiredKeys.length && keyCount !== allowedKeys.size) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  for (const k of requiredKeys) {
    if (!(k in request)) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    }
  }
  if (!isValidUUIDv4(request.idempotencyKey)) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (typeof request.roomId !== 'string' || !request.roomId.trim() || request.roomId.length > 100) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (typeof request.guestName !== 'string' || !request.guestName.trim() || request.guestName.length > 100) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (request.contactInfo !== undefined) {
    if (typeof request.contactInfo !== 'string' || request.contactInfo.length > 200) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    }
  }
  if (request.stayType !== 'night' && request.stayType !== 'short') {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (!Number.isSafeInteger(request.duration) || request.duration <= 0) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (request.stayType === 'night') {
    if (request.duration > 365) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    }
  } else {
    if (![3, 6, 8, 12].includes(request.duration)) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    }
  }
  if (!Number.isSafeInteger(request.extraPax) || request.extraPax < 0 || request.extraPax > 20) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (request.paymentMethod !== 'cash' && request.paymentMethod !== 'gcash' && request.paymentMethod !== 'maya' && request.paymentMethod !== 'card') {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (!Number.isSafeInteger(request.initialPaymentCentavos) || request.initialPaymentCentavos < 0 || request.initialPaymentCentavos > 1_000_000_000_000) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
}

function validateCheckOutRequest(request: CheckOutRequest): void {
  if (!request || typeof request !== 'object') {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  const allowedKeys = new Set(['idempotencyKey', 'bookingId', 'extraCharges', 'paymentChannel']);
  for (const k of Object.keys(request)) {
    if (!allowedKeys.has(k)) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    }
  }
  if (Object.keys(request).length !== allowedKeys.size) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (!isValidUUIDv4(request.idempotencyKey)) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (typeof request.bookingId !== 'string' || !request.bookingId.trim() || request.bookingId.length > 100) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (!Array.isArray(request.extraCharges) || request.extraCharges.length > 50) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  for (const ec of request.extraCharges) {
    if (!ec || typeof ec !== 'object') throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    const ecKeys = Object.keys(ec);
    if (ecKeys.length !== 2 || !ecKeys.includes('description') || !ecKeys.includes('amountCentavos')) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    }
    const desc = ec.description;
    if (typeof desc !== 'string') throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    const trimmed = desc.trim();
    if (!trimmed || trimmed.length > 200) throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    if (/[\u0000-\u001F\u007F]/.test(trimmed)) throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    const amt = ec.amountCentavos;
    if (!Number.isSafeInteger(amt) || amt < 0 || amt > 1_000_000_000_000) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    }
  }
  if (request.paymentChannel !== 'cash' && request.paymentChannel !== 'gcash' && request.paymentChannel !== 'maya' && request.paymentChannel !== 'card') {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
}

function validateExtensionRequest(request: ExtensionRequest): void {
  if (!request || typeof request !== 'object') {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  const allowedKeys = new Set(['idempotencyKey', 'bookingId', 'extension', 'collectionCentavos', 'paymentChannel']);
  for (const k of Object.keys(request)) {
    if (!allowedKeys.has(k)) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    }
  }
  if (Object.keys(request).length !== allowedKeys.size) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (!isValidUUIDv4(request.idempotencyKey)) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (typeof request.bookingId !== 'string' || !request.bookingId.trim() || request.bookingId.length > 100) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (!request.extension || typeof request.extension !== 'object') throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  const extKeys = Object.keys(request.extension);
  if (extKeys.length !== 2 || !extKeys.includes('type') || !extKeys.includes('duration')) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (request.extension.type !== 'night' && request.extension.type !== 'short') throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  if (!Number.isSafeInteger(request.extension.duration) || request.extension.duration <= 0 ||
      (request.extension.type === 'night' && request.extension.duration > 365) ||
      (request.extension.type === 'short' && ![3, 6, 8, 12].includes(request.extension.duration))) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (!Number.isSafeInteger(request.collectionCentavos) || request.collectionCentavos < 0 || request.collectionCentavos > 1_000_000_000_000) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  if (request.paymentChannel !== 'cash' && request.paymentChannel !== 'gcash' && request.paymentChannel !== 'maya' && request.paymentChannel !== 'card') {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
}

async function doRequest<T>(
  url: string,
  body: unknown,
  options: FetchOptions,
  validateReceipt: (data: unknown) => T
): Promise<T> {
  const fetchFn = options.fetchFn ?? fetch;
  const token = await getIdToken(options);

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TsekInClientError(TsekInClientErrorCode.NETWORK_ERROR);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new TsekInClientError(TsekInClientErrorCode.UNKNOWN_ERROR);
    }
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }

  if (!response.ok) {
    const errorCode = data && typeof data === 'object' && 'code' in data
      ? String((data as Record<string, unknown>).code)
      : TsekInClientErrorCode.UNKNOWN_ERROR;

    if (errorCode === 'UNAUTHENTICATED') {
      throw new TsekInClientError(TsekInClientErrorCode.AUTHENTICATION_REQUIRED);
    }
    if (errorCode === 'INVALID_REQUEST') {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
    }
    if (ALLOWED_ERROR_CODES.has(errorCode as TsekInClientErrorCode)) {
      throw new TsekInClientError(errorCode as TsekInClientErrorCode);
    }
    throw new TsekInClientError(TsekInClientErrorCode.UNKNOWN_ERROR);
  }

  return validateReceipt(data);
}

export type StayType = 'night' | 'short';
export type PaymentChannel = 'cash' | 'gcash' | 'maya' | 'card';

export interface CheckInRequest {
  idempotencyKey: string;
  roomId: string;
  guestName: string;
  contactInfo?: string;
  stayType: StayType;
  duration: number;
  extraPax: number;
  paymentMethod: PaymentChannel;
  initialPaymentCentavos: number;
}

export interface CheckInReceipt {
  bookingId: string;
  roomId: string;
  roomDisplayName: string;
  stayType: StayType;
  duration: number;
  totalCostCentavos: number;
  initialPaymentCentavos: number;
  remainingBalanceCentavos: number;
  paymentChannel: 'cash' | 'gcash' | 'maya' | 'card';
  requestedCheckOutAt: string;
  committedAt: string;
  moduleId: 'tsek-in';
}

function validateCheckInReceipt(data: unknown): CheckInReceipt {
  if (!data || typeof data !== 'object') {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }
  const d = data as Record<string, unknown>;
  const requiredKeys = [
    'bookingId', 'roomId', 'roomDisplayName', 'stayType', 'duration',
    'totalCostCentavos', 'initialPaymentCentavos', 'remainingBalanceCentavos',
    'paymentChannel', 'requestedCheckOutAt', 'committedAt', 'moduleId'
  ];
  for (const k of requiredKeys) {
    if (!(k in d)) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
    }
  }
  if (Object.keys(d).length !== requiredKeys.length) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }
  if (d.moduleId !== 'tsek-in') {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }
  if (typeof d.bookingId !== 'string' || !d.bookingId) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (typeof d.roomId !== 'string' || !d.roomId) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (typeof d.roomDisplayName !== 'string' || !d.roomDisplayName) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (d.stayType !== 'night' && d.stayType !== 'short') throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (!Number.isSafeInteger(d.duration as number) || (d.duration as number) <= 0) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  for (const centKey of ['totalCostCentavos', 'initialPaymentCentavos'] as const) {
    const v = d[centKey];
    if (!Number.isSafeInteger(v as number) || (v as number) < 0 || (v as number) > 1_000_000_000_000) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
    }
  }
  const remaining = d.remainingBalanceCentavos;
  if (!Number.isSafeInteger(remaining as number) || (remaining as number) < -1_000_000_000_000 || (remaining as number) > 1_000_000_000_000) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }
  const pc = d.paymentChannel;
  if (pc !== 'cash' && pc !== 'gcash' && pc !== 'maya' && pc !== 'card') throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  for (const tsKey of ['requestedCheckOutAt', 'committedAt'] as const) {
    const v = d[tsKey];
    if (typeof v !== 'string' || !isStrictISO8601(v)) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
    }
  }
  return {
    bookingId: d.bookingId as string,
    roomId: d.roomId as string,
    roomDisplayName: d.roomDisplayName as string,
    stayType: d.stayType as StayType,
    duration: d.duration as number,
    totalCostCentavos: d.totalCostCentavos as number,
    initialPaymentCentavos: d.initialPaymentCentavos as number,
    remainingBalanceCentavos: remaining as number,
    paymentChannel: pc as CheckInReceipt['paymentChannel'],
    requestedCheckOutAt: d.requestedCheckOutAt as string,
    committedAt: d.committedAt as string,
    moduleId: 'tsek-in',
  };
}

export async function submitTsekInCheckIn(
  request: CheckInRequest,
  options: FetchOptions = {}
): Promise<CheckInReceipt> {
  validateCheckInRequest(request);
  return doRequest('/api/tsek-in/check-in', request, options, validateCheckInReceipt);
}

export interface CheckOutRequest {
  idempotencyKey: string;
  bookingId: string;
  extraCharges: Array<{ description: string; amountCentavos: number }>;
  paymentChannel: PaymentChannel;
}

export interface CheckOutReceipt {
  bookingId: string;
  roomId: string;
  roomDisplayName: string;
  checkoutStatus: 'CheckedOut';
  totalRoomCostCentavos: number;
  totalExtraChargesCentavos: number;
  totalDueCentavos: number;
  totalCollectedCentavos: number;
  amountMovedNowCentavos: number;
  paymentChannel: 'cash' | 'gcash' | 'maya' | 'card';
  action: 'settle' | 'refund' | 'no-op';
  nextRoomState: 'Available' | 'Occupied' | 'Cleaning';
  committedAt: string;
  moduleId: 'tsek-in';
}

function validateCheckOutReceipt(data: unknown): CheckOutReceipt {
  if (!data || typeof data !== 'object') {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }
  const d = data as Record<string, unknown>;
  const requiredKeys = [
    'bookingId', 'roomId', 'roomDisplayName', 'checkoutStatus', 'totalRoomCostCentavos',
    'totalExtraChargesCentavos', 'totalDueCentavos', 'totalCollectedCentavos',
    'amountMovedNowCentavos', 'paymentChannel', 'action', 'nextRoomState', 'committedAt', 'moduleId'
  ];
  for (const k of requiredKeys) {
    if (!(k in d)) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
    }
  }
  if (Object.keys(d).length !== requiredKeys.length) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }
  if (d.moduleId !== 'tsek-in') throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (typeof d.bookingId !== 'string' || !d.bookingId) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (typeof d.roomId !== 'string' || !d.roomId) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (typeof d.roomDisplayName !== 'string' || !d.roomDisplayName) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (d.checkoutStatus !== 'CheckedOut') throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  for (const centKey of ['totalRoomCostCentavos', 'totalExtraChargesCentavos', 'totalDueCentavos', 'totalCollectedCentavos'] as const) {
    const v = d[centKey];
    if (!Number.isSafeInteger(v as number) || (v as number) < 0 || (v as number) > 1_000_000_000_000) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
    }
  }
  const amountMoved = d.amountMovedNowCentavos;
  if (!Number.isSafeInteger(amountMoved as number) || (amountMoved as number) < -1_000_000_000_000 || (amountMoved as number) > 1_000_000_000_000) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }
  const pc = d.paymentChannel;
  if (pc !== 'cash' && pc !== 'gcash' && pc !== 'maya' && pc !== 'card') throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (d.action !== 'settle' && d.action !== 'refund' && d.action !== 'no-op') throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (d.nextRoomState !== 'Available' && d.nextRoomState !== 'Occupied' && d.nextRoomState !== 'Cleaning') throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (typeof d.committedAt !== 'string' || !isStrictISO8601(d.committedAt)) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  return {
    bookingId: d.bookingId as string,
    roomId: d.roomId as string,
    roomDisplayName: d.roomDisplayName as string,
    checkoutStatus: 'CheckedOut',
    totalRoomCostCentavos: d.totalRoomCostCentavos as number,
    totalExtraChargesCentavos: d.totalExtraChargesCentavos as number,
    totalDueCentavos: d.totalDueCentavos as number,
    totalCollectedCentavos: d.totalCollectedCentavos as number,
    amountMovedNowCentavos: amountMoved as number,
    paymentChannel: pc as CheckOutReceipt['paymentChannel'],
    action: d.action as CheckOutReceipt['action'],
    nextRoomState: d.nextRoomState as CheckOutReceipt['nextRoomState'],
    committedAt: d.committedAt as string,
    moduleId: 'tsek-in',
  };
}

export async function submitTsekInCheckOut(
  request: CheckOutRequest,
  options: FetchOptions = {}
): Promise<CheckOutReceipt> {
  validateCheckOutRequest(request);
  return doRequest('/api/tsek-in/check-out', request, options, validateCheckOutReceipt);
}

export interface ExtensionInput {
  type: 'night' | 'short';
  duration: number;
}

export interface ExtensionRequest {
  idempotencyKey: string;
  bookingId: string;
  extension: ExtensionInput;
  collectionCentavos: number;
  paymentChannel: PaymentChannel;
}

export interface ExtensionReceipt {
  bookingId: string;
  roomId: string;
  roomDisplayName: string;
  stayType: 'night' | 'short';
  extensionDuration: number;
  previousCheckOutAt: string;
  newCheckOutAt: string;
  additionalCostCentavos: number;
  newTotalRoomCostCentavos: number;
  amountCollectedNowCentavos: number;
  totalCollectedCentavos: number;
  remainingBalanceCentavos: number;
  paymentChannel: 'cash' | 'gcash' | 'maya' | 'card' | 'none';
  bookingStatus: 'Active';
  roomStatus: 'Occupied';
  committedAt: string;
  moduleId: 'tsek-in';
}

function validateExtensionReceipt(data: unknown): ExtensionReceipt {
  if (!data || typeof data !== 'object') {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }
  const d = data as Record<string, unknown>;
  const requiredKeys = [
    'bookingId', 'roomId', 'roomDisplayName', 'stayType', 'extensionDuration',
    'previousCheckOutAt', 'newCheckOutAt', 'additionalCostCentavos', 'newTotalRoomCostCentavos',
    'amountCollectedNowCentavos', 'totalCollectedCentavos', 'remainingBalanceCentavos',
    'paymentChannel', 'bookingStatus', 'roomStatus', 'committedAt', 'moduleId'
  ];
  for (const k of requiredKeys) {
    if (!(k in d)) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
    }
  }
  if (Object.keys(d).length !== requiredKeys.length) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }
  if (d.moduleId !== 'tsek-in') throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (typeof d.bookingId !== 'string' || !d.bookingId) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (typeof d.roomId !== 'string' || !d.roomId) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (typeof d.roomDisplayName !== 'string' || !d.roomDisplayName) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (d.stayType !== 'night' && d.stayType !== 'short') throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (!Number.isSafeInteger(d.extensionDuration as number) || (d.extensionDuration as number) <= 0) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  for (const tsKey of ['previousCheckOutAt', 'newCheckOutAt', 'committedAt'] as const) {
    const v = d[tsKey];
    if (typeof v !== 'string' || !isStrictISO8601(v)) throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }
  for (const centKey of ['additionalCostCentavos', 'newTotalRoomCostCentavos', 'amountCollectedNowCentavos', 'totalCollectedCentavos', 'remainingBalanceCentavos'] as const) {
    const v = d[centKey];
    if (!Number.isSafeInteger(v as number) || (v as number) < 0 || (v as number) > 1_000_000_000_000) {
      throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
    }
  }
  const pc = d.paymentChannel;
  if (pc !== 'cash' && pc !== 'gcash' && pc !== 'maya' && pc !== 'card' && pc !== 'none') throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (d.bookingStatus !== 'Active') throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  if (d.roomStatus !== 'Occupied') throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  return {
    bookingId: d.bookingId as string,
    roomId: d.roomId as string,
    roomDisplayName: d.roomDisplayName as string,
    stayType: d.stayType as 'night' | 'short',
    extensionDuration: d.extensionDuration as number,
    previousCheckOutAt: d.previousCheckOutAt as string,
    newCheckOutAt: d.newCheckOutAt as string,
    additionalCostCentavos: d.additionalCostCentavos as number,
    newTotalRoomCostCentavos: d.newTotalRoomCostCentavos as number,
    amountCollectedNowCentavos: d.amountCollectedNowCentavos as number,
    totalCollectedCentavos: d.totalCollectedCentavos as number,
    remainingBalanceCentavos: d.remainingBalanceCentavos as number,
    paymentChannel: pc as ExtensionReceipt['paymentChannel'],
    bookingStatus: 'Active',
    roomStatus: 'Occupied',
    committedAt: d.committedAt as string,
    moduleId: 'tsek-in',
  };
}

export async function submitTsekInExtension(
  request: ExtensionRequest,
  options: FetchOptions = {}
): Promise<ExtensionReceipt> {
  validateExtensionRequest(request);
  return doRequest('/api/tsek-in/extend', request, options, validateExtensionReceipt);
}

export type TsekInAdminOperation =
  | 'create-room'
  | 'mark-room-ready'
  | 'delete-room'
  | 'update-category-rates'
  | 'update-global-settings';

export type ShortTimeRates = Partial<Record<'3h' | '6h' | '8h' | '12h', number>>;

export type TsekInAdminRequest =
  | { idempotencyKey: string; operation: 'create-room'; roomNumber: string; type: string; rateCentavos: number; shortTimeRatesCentavos: ShortTimeRates; capacity: number; bedType: string; extraPaxFeeCentavos?: number }
  | { idempotencyKey: string; operation: 'mark-room-ready'; roomId: string }
  | { idempotencyKey: string; operation: 'delete-room'; roomId: string }
  | { idempotencyKey: string; operation: 'update-category-rates'; category: string; rateCentavos: number; shortTimeRatesCentavos: ShortTimeRates; extraPaxFeeCentavos?: number }
  | { idempotencyKey: string; operation: 'update-global-settings'; standardCheckInTime: string; standardCheckOutTime: string };

export interface TsekInAdminReceipt {
  operation: TsekInAdminOperation;
  roomId?: string;
  affectedRooms: number;
  committedAt: string;
  moduleId: 'tsek-in';
}

function isBoundedMoney(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000_000_000;
}

function isNonBlankBounded(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function validShortRates(value: unknown): value is ShortTimeRates {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = new Set(['3h', '6h', '8h', '12h']);
  return Object.entries(value).every(([key, amount]) => allowed.has(key) && isBoundedMoney(amount));
}

function hasExactAdminKeys(request: object, required: string[], optional: string[] = []): boolean {
  const keys = Object.keys(request);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key));
}

function validateTsekInAdminRequest(request: TsekInAdminRequest): void {
  if (!request || typeof request !== 'object' || !isValidUUIDv4(request.idempotencyKey)) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
  }
  let valid = false;
  if (request.operation === 'create-room') {
    valid = hasExactAdminKeys(request, ['idempotencyKey', 'operation', 'roomNumber', 'type', 'rateCentavos', 'shortTimeRatesCentavos', 'capacity', 'bedType'], ['extraPaxFeeCentavos'])
      && isNonBlankBounded(request.roomNumber, 200)
      && isNonBlankBounded(request.type, 200)
      && isBoundedMoney(request.rateCentavos)
      && validShortRates(request.shortTimeRatesCentavos)
      && Number.isSafeInteger(request.capacity) && request.capacity >= 1 && request.capacity <= 100
      && isNonBlankBounded(request.bedType, 200)
      && (request.extraPaxFeeCentavos === undefined || isBoundedMoney(request.extraPaxFeeCentavos));
  } else if (request.operation === 'mark-room-ready' || request.operation === 'delete-room') {
    valid = hasExactAdminKeys(request, ['idempotencyKey', 'operation', 'roomId'])
      && isNonBlankBounded(request.roomId, 100);
  } else if (request.operation === 'update-category-rates') {
    valid = hasExactAdminKeys(request, ['idempotencyKey', 'operation', 'category', 'rateCentavos', 'shortTimeRatesCentavos'], ['extraPaxFeeCentavos'])
      && isNonBlankBounded(request.category, 200)
      && isBoundedMoney(request.rateCentavos)
      && validShortRates(request.shortTimeRatesCentavos)
      && (request.extraPaxFeeCentavos === undefined || isBoundedMoney(request.extraPaxFeeCentavos));
  } else if (request.operation === 'update-global-settings') {
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    valid = hasExactAdminKeys(request, ['idempotencyKey', 'operation', 'standardCheckInTime', 'standardCheckOutTime'])
      && timePattern.test(request.standardCheckInTime)
      && timePattern.test(request.standardCheckOutTime);
  }
  if (!valid) throw new TsekInClientError(TsekInClientErrorCode.INVALID_REQUEST);
}

function validateTsekInAdminReceipt(data: unknown): TsekInAdminReceipt {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }
  const receipt = data as Record<string, unknown>;
  const operations: TsekInAdminOperation[] = ['create-room', 'mark-room-ready', 'delete-room', 'update-category-rates', 'update-global-settings'];
  const required = ['operation', 'affectedRooms', 'committedAt', 'moduleId'];
  if (!hasExactAdminKeys(receipt, required, ['roomId'])
      || !operations.includes(receipt.operation as TsekInAdminOperation)
      || receipt.moduleId !== 'tsek-in'
      || !Number.isSafeInteger(receipt.affectedRooms) || (receipt.affectedRooms as number) < 0 || (receipt.affectedRooms as number) > 25
      || typeof receipt.committedAt !== 'string' || !isStrictISO8601(receipt.committedAt)
      || (receipt.roomId !== undefined && !isNonBlankBounded(receipt.roomId, 128))) {
    throw new TsekInClientError(TsekInClientErrorCode.INVALID_RESPONSE);
  }
  return {
    operation: receipt.operation as TsekInAdminOperation,
    ...(receipt.roomId !== undefined ? { roomId: receipt.roomId as string } : {}),
    affectedRooms: receipt.affectedRooms as number,
    committedAt: receipt.committedAt,
    moduleId: 'tsek-in',
  };
}

export async function submitTsekInAdminMutation(
  request: TsekInAdminRequest,
  options: FetchOptions = {},
): Promise<TsekInAdminReceipt> {
  validateTsekInAdminRequest(request);
  return doRequest('/api/tsek-in/admin', request, options, validateTsekInAdminReceipt);
}
