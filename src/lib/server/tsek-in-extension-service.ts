import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  TSEK_IN_MODULE_ID,
  CheckinError,
  CheckinErrorCode,
  assertStaffMatches,
  assertTenantTsekInEntitlement,
  type VerifiedTsekInIdentity,
} from './tsek-in-checkin-service';
import {
  TsekInEngine,
  TsekInError,
  validateIdempotencyKey,
  computeFingerprint,
  PaymentAllocationSchema,
  PaymentAllocationsListSchema,
  PAYMENT_ALLOCATIONS_VERSION,
} from '@/lib/tsek-in/domain';

// ==========================================
// Error Codes & Messages
// ==========================================

export enum ExtensionErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  TENANT_INELIGIBLE = 'TENANT_INELIGIBLE',
  BOOKING_NOT_FOUND = 'BOOKING_NOT_FOUND',
  BOOKING_NOT_ACTIVE = 'BOOKING_NOT_ACTIVE',
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  ROOM_STATE_CONFLICT = 'ROOM_STATE_CONFLICT',
  RATE_SNAPSHOT_INVALID = 'RATE_SNAPSHOT_INVALID',
  INVALID_EXTENSION = 'INVALID_EXTENSION',
  FINANCIAL_INTEGRITY_ERROR = 'FINANCIAL_INTEGRITY_ERROR',
  PAYMENT_ALLOCATION_ERROR = 'PAYMENT_ALLOCATION_ERROR',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

const ERROR_DETAILS: Record<ExtensionErrorCode, { status: number; message: string }> = {
  [ExtensionErrorCode.INVALID_REQUEST]: { status: 400, message: 'Invalid request.' },
  [ExtensionErrorCode.UNAUTHENTICATED]: { status: 401, message: 'Authentication required.' },
  [ExtensionErrorCode.FORBIDDEN]: { status: 403, message: 'Operation not permitted.' },
  [ExtensionErrorCode.TENANT_INELIGIBLE]: { status: 403, message: 'Tenant is not eligible for Tsek-In.' },
  [ExtensionErrorCode.BOOKING_NOT_FOUND]: { status: 404, message: 'Booking not found.' },
  [ExtensionErrorCode.BOOKING_NOT_ACTIVE]: { status: 409, message: 'Booking is not active.' },
  [ExtensionErrorCode.ROOM_NOT_FOUND]: { status: 404, message: 'Room not found.' },
  [ExtensionErrorCode.ROOM_STATE_CONFLICT]: { status: 409, message: 'Room is not in the required state.' },
  [ExtensionErrorCode.RATE_SNAPSHOT_INVALID]: { status: 409, message: 'Stored rate snapshot is invalid.' },
  [ExtensionErrorCode.INVALID_EXTENSION]: { status: 409, message: 'Invalid extension.' },
  [ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR]: { status: 409, message: 'Financial integrity error.' },
  [ExtensionErrorCode.PAYMENT_ALLOCATION_ERROR]: { status: 409, message: 'Payment allocation error.' },
  [ExtensionErrorCode.IDEMPOTENCY_CONFLICT]: { status: 409, message: 'Idempotency conflict.' },
  [ExtensionErrorCode.SERVICE_UNAVAILABLE]: { status: 503, message: 'Service temporarily unavailable.' },
};

export class ExtensionError extends Error {
  readonly code: ExtensionErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;

  constructor(code: ExtensionErrorCode, customMessage?: string) {
    const detail = ERROR_DETAILS[code];
    const message = customMessage || detail.message;
    super(message);
    this.name = 'ExtensionError';
    this.code = code;
    this.httpStatus = detail.status;
    this.userMessage = message;
  }
}

// ==========================================
// Request / Receipt Types
// ==========================================

const NightDurationSchema = z.number().int().positive().max(365, 'Night extension duration cannot exceed 365.');
const ShortDurationSchema = z.number().int().positive().refine((n) => [3, 6, 8, 12].includes(n), 'Short extension must be exactly 3, 6, 8, or 12.');

const NightExtensionSchema = z.object({ type: z.literal('night'), duration: NightDurationSchema });
const ShortExtensionSchema = z.object({ type: z.literal('short'), duration: ShortDurationSchema });
export const ExtensionSchema = z.discriminatedUnion('type', [NightExtensionSchema, ShortExtensionSchema]);
export type ExtensionInput = z.infer<typeof ExtensionSchema>;

export const ExtensionRequestSchema = z.object({
  idempotencyKey: z.string().uuid('Idempotency key must be a valid UUID v4.'),
  bookingId: z.string().min(1).max(100),
  extension: ExtensionSchema,
  collectionCentavos: z.number().int().min(0).max(1_000_000_000_000),
  paymentChannel: z.enum(['cash', 'gcash', 'maya', 'card']),
}).strict();

export type ExtensionRequest = z.infer<typeof ExtensionRequestSchema>;

export const ExtensionReceiptSchema = z.object({
  bookingId: z.string().min(1).max(128),
  roomId: z.string().min(1).max(128),
  roomDisplayName: z.string().min(1).max(128),
  stayType: z.enum(['night', 'short']),
  extensionDuration: z.number().int().positive().max(365),
  previousCheckOutAt: z.string().min(1).max(64),
  newCheckOutAt: z.string().min(1).max(64),
  additionalCostCentavos: z.number().int().min(0).max(1_000_000_000_000),
  newTotalRoomCostCentavos: z.number().int().min(0).max(1_000_000_000_000),
  amountCollectedNowCentavos: z.number().int().min(0).max(1_000_000_000_000),
  totalCollectedCentavos: z.number().int().min(0).max(1_000_000_000_000),
  remainingBalanceCentavos: z.number().int().min(0).max(1_000_000_000_000),
  paymentChannel: z.string().min(1).max(64),
  bookingStatus: z.literal('Active'),
  roomStatus: z.literal('Occupied'),
  committedAt: z.string().min(1).max(64),
  moduleId: z.literal(TSEK_IN_MODULE_ID),
}).strict();

export interface ExtensionReceipt extends z.infer<typeof ExtensionReceiptSchema> {}

export interface ExtensionServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

// ==========================================
// Idempotency
// ==========================================

function extensionIdempotencyDocumentId(tenantId: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${tenantId}:${idempotencyKey}`, 'utf8').digest('hex');
}

// ==========================================
// Fingerprint
// ==========================================

function buildExtensionFingerprint(input: {
  tenantId: string;
  bookingId: string;
  extension: ExtensionInput;
  collectionCentavos: number;
  paymentChannel: 'cash' | 'gcash' | 'maya' | 'card';
}): string {
  return computeFingerprint({
    operation: 'tsekInExtend',
    tenantId: input.tenantId,
    bookingId: input.bookingId,
    extension: input.extension,
    collectionCentavos: input.collectionCentavos,
    paymentChannel: input.paymentChannel,
  });
}

// ==========================================
// Payment channel routing helpers
// ==========================================

function targetAccountForPaymentChannel(method: 'cash' | 'gcash' | 'maya' | 'card'): { id: string; name: string } {
  switch (method) {
    case 'cash': return { id: 'master-cash', name: 'Main Cash Register' };
    case 'gcash': return { id: 'gcash-settlement', name: 'GCash Settlement' };
    case 'maya': return { id: 'maya-settlement', name: 'Maya Settlement' };
    case 'card': return { id: 'card-clearing', name: 'Card Clearing' };
  }
}

// ==========================================
// Time / Check-out policy (Manila)
// ==========================================

const MANILA_TZ = 'Asia/Manila';
const DEFAULT_MANILA_CHECKOUT_HHMM = '12:00';
const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTenantCheckoutHHMM(raw: unknown): { hours: number; minutes: number } {
  if (raw === undefined || raw === null) {
    const m = DEFAULT_MANILA_CHECKOUT_HHMM.match(HHMM_REGEX)!;
    return { hours: Number(m[1]), minutes: Number(m[2]) };
  }
  if (typeof raw !== 'string' || !HHMM_REGEX.test(raw)) {
    throw new ExtensionError(ExtensionErrorCode.TENANT_INELIGIBLE);
  }
  const [h, m] = raw.split(':').map((n) => Number(n));
  return { hours: h, minutes: m };
}

// Compute Manila midnight UTC ms for the Manila Y/M/D.
function manilaMidnightUtcMs(year: number, month: number, day: number): number {
  const targetUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const local = new Date(targetUtc);
  const tz = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TZ,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(local).reduce<Record<string, number>>((acc, p) => {
    if (p.type === 'year' || p.type === 'month' || p.type === 'day' || p.type === 'hour' || p.type === 'minute' || p.type === 'second') {
      acc[p.type] = Number(p.value === '24' ? 0 : p.value);
    }
    return acc;
  }, {});
  const asUtc = Date.UTC(tz.year, tz.month - 1, tz.day, tz.hour, tz.minute, tz.second);
  const offsetMin = (asUtc - targetUtc) / 60000;
  return targetUtc - offsetMin * 60000;
}

// Derive new expected checkout from the PREVIOUS authoritative checkout.
// Night extensions advance by `duration` calendar days at the tenant's
// `standardCheckOutTime` (interpreted in Asia/Manila). Short extensions add
// exactly `duration` hours to the previous timestamp.
function deriveNextExpectedCheckOutAt(
  previousCheckOutMillis: number,
  stayType: 'night' | 'short',
  duration: number,
  standardCheckOutTime: string | undefined
): number {
  if (stayType === 'night') {
    const { hours, minutes } = parseTenantCheckoutHHMM(standardCheckOutTime);
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: MANILA_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const parts = fmt.formatToParts(new Date(previousCheckOutMillis)).reduce<Record<string, number>>((acc, p) => {
      if (p.type === 'year' || p.type === 'month' || p.type === 'day') acc[p.type] = Number(p.value);
      return acc;
    }, {});
    const base = manilaMidnightUtcMs(parts.year, parts.month, parts.day);
    return base + duration * 24 * 60 * 60 * 1000 + hours * 3600 * 1000 + minutes * 60 * 1000;
  }
  return previousCheckOutMillis + duration * 60 * 60 * 1000;
}

// ==========================================
// Internal — authoritative booking parsing
// ==========================================

function parseStrictBooking(
  roomIdRaw: unknown,
  statusRaw: unknown,
  totalCostRaw: unknown,
  totalCollectedRaw: unknown,
  moduleIdRaw: unknown,
  allocationsRaw: unknown,
  allocationsVersionRaw: unknown,
  expectedCheckOutRaw: unknown,
  rateCentavosRaw: unknown,
  shortTimeRatesRaw: unknown,
  extraPaxFeeRaw: unknown,
  stayTypeRaw: unknown
): {
  roomId: string;
  status: string;
  totalRoomCostCentavos: number;
  totalCollectedCentavos: number;
  paymentAllocations: ReturnType<typeof PaymentAllocationsListSchema.parse>;
  paymentAllocationsVersion: number;
  expectedCheckOutAt: number;
  rateCentavos: number;
  shortTimeRates: { '3h'?: number; '6h'?: number; '8h'?: number; '12h'?: number } | null;
  extraPaxFeeCentavos: number;
  stayType: 'night' | 'short';
} {
  if (typeof roomIdRaw !== 'string' || roomIdRaw.length === 0 || roomIdRaw.length > 128) {
    throw new ExtensionError(ExtensionErrorCode.RATE_SNAPSHOT_INVALID);
  }
  if (moduleIdRaw !== TSEK_IN_MODULE_ID) {
    throw new ExtensionError(ExtensionErrorCode.BOOKING_NOT_FOUND);
  }
  if (statusRaw !== 'Active') {
    throw new ExtensionError(ExtensionErrorCode.BOOKING_NOT_ACTIVE);
  }
  if (!Number.isSafeInteger(totalCostRaw) || (totalCostRaw as number) < 0 || (totalCostRaw as number) > 1_000_000_000_000) {
    throw new ExtensionError(ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR);
  }
  if (!Number.isSafeInteger(totalCollectedRaw) || (totalCollectedRaw as number) < 0 || (totalCollectedRaw as number) > 1_000_000_000_000) {
    throw new ExtensionError(ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR);
  }
  let paymentAllocations;
  try {
    paymentAllocations = PaymentAllocationsListSchema.parse(allocationsRaw ?? []);
  } catch {
    throw new ExtensionError(ExtensionErrorCode.PAYMENT_ALLOCATION_ERROR);
  }
  if (!Number.isSafeInteger(allocationsVersionRaw) || (allocationsVersionRaw as number) < 0 || (allocationsVersionRaw as number) > PAYMENT_ALLOCATIONS_VERSION) {
    throw new ExtensionError(ExtensionErrorCode.PAYMENT_ALLOCATION_ERROR);
  }
  // expectedCheckOutAt must be a Timestamp, Date, or finite epoch ms.
  let expectedCheckOutAt: number;
  if (expectedCheckOutRaw && typeof (expectedCheckOutRaw as any).toMillis === 'function') {
    expectedCheckOutAt = (expectedCheckOutRaw as admin.firestore.Timestamp).toMillis();
  } else if (expectedCheckOutRaw && typeof (expectedCheckOutRaw as any)._seconds === 'number' && typeof (expectedCheckOutRaw as any)._nanoseconds === 'number') {
    // Structured-cloned admin.firestore.Timestamp lands as the raw
    // {_seconds, _nanoseconds} shape with no toMillis method.
    const sec = (expectedCheckOutRaw as any)._seconds as number;
    const ns = (expectedCheckOutRaw as any)._nanoseconds as number;
    expectedCheckOutAt = sec * 1000 + Math.floor(ns / 1_000_000);
  } else if (expectedCheckOutRaw instanceof Date) {
    expectedCheckOutAt = expectedCheckOutRaw.getTime();
  } else if (typeof expectedCheckOutRaw === 'number') {
    if (!Number.isFinite(expectedCheckOutRaw)) {
      throw new ExtensionError(ExtensionErrorCode.RATE_SNAPSHOT_INVALID);
    }
    expectedCheckOutAt = expectedCheckOutRaw;
  } else {
    throw new ExtensionError(ExtensionErrorCode.RATE_SNAPSHOT_INVALID);
  }
  if (!Number.isSafeInteger(rateCentavosRaw) || (rateCentavosRaw as number) < 0 || (rateCentavosRaw as number) > 1_000_000_000_000) {
    throw new ExtensionError(ExtensionErrorCode.RATE_SNAPSHOT_INVALID);
  }
  let shortTimeRates: { '3h'?: number; '6h'?: number; '8h'?: number; '12h'?: number } | null = null;
  if (shortTimeRatesRaw !== undefined && shortTimeRatesRaw !== null) {
    if (typeof shortTimeRatesRaw !== 'object' || shortTimeRatesRaw === null) {
      throw new ExtensionError(ExtensionErrorCode.RATE_SNAPSHOT_INVALID);
    }
    shortTimeRates = {};
    for (const key of ['3h', '6h', '8h', '12h'] as const) {
      const v = (shortTimeRatesRaw as Record<string, unknown>)[key];
      if (v !== undefined && v !== null) {
        if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > 1_000_000_000_000) {
          throw new ExtensionError(ExtensionErrorCode.RATE_SNAPSHOT_INVALID);
        }
        shortTimeRates[key] = v as number;
      }
    }
  }
  let extraPaxFeeCentavos = 0;
  if (extraPaxFeeRaw !== undefined && extraPaxFeeRaw !== null) {
    if (!Number.isSafeInteger(extraPaxFeeRaw) || (extraPaxFeeRaw as number) < 0) {
      throw new ExtensionError(ExtensionErrorCode.RATE_SNAPSHOT_INVALID);
    }
    extraPaxFeeCentavos = extraPaxFeeRaw as number;
  }
  if (stayTypeRaw !== 'night' && stayTypeRaw !== 'short') {
    throw new ExtensionError(ExtensionErrorCode.RATE_SNAPSHOT_INVALID);
  }
  return {
    roomId: roomIdRaw,
    status: statusRaw,
    totalRoomCostCentavos: totalCostRaw as number,
    totalCollectedCentavos: totalCollectedRaw as number,
    paymentAllocations,
    paymentAllocationsVersion: allocationsVersionRaw as number,
    expectedCheckOutAt,
    rateCentavos: rateCentavosRaw as number,
    shortTimeRates,
    extraPaxFeeCentavos,
    stayType: stayTypeRaw,
  };
}

function sumAllocations(allocations: ReturnType<typeof PaymentAllocationsListSchema.parse>): number {
  let total = BigInt(0);
  for (const a of allocations) total += BigInt(a.amountCentavos);
  const n = Number(total);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1_000_000_000_000) {
    throw new ExtensionError(ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR);
  }
  return n;
}

// ==========================================
// Service
// ==========================================

export async function tsekInExtend(
  idToken: string,
  requestValue: unknown,
  options: ExtensionServiceOptions = {}
): Promise<ExtensionReceipt> {
  const auth = options.adminAuth || getAdminAuth();
  const db = options.adminFirestore || getAdminFirestore();
  const now = options.now || (() => admin.firestore.Timestamp.now());

  let identity: VerifiedTsekInIdentity;
  try {
    identity = await verifyTsekInIdentityCompat(idToken, auth, db);
  } catch (e) {
    if (e instanceof ExtensionError) throw e;
    if (e instanceof CheckinError) {
      switch (e.code) {
        case CheckinErrorCode.TENANT_INELIGIBLE:
          throw new ExtensionError(ExtensionErrorCode.TENANT_INELIGIBLE);
        case CheckinErrorCode.UNAUTHENTICATED:
          throw new ExtensionError(ExtensionErrorCode.UNAUTHENTICATED);
        case CheckinErrorCode.FORBIDDEN:
        default:
          throw new ExtensionError(ExtensionErrorCode.FORBIDDEN);
      }
    }
    throw new ExtensionError(ExtensionErrorCode.UNAUTHENTICATED);
  }

  let request: ExtensionRequest;
  try {
    request = ExtensionRequestSchema.parse(requestValue);
  } catch {
    throw new ExtensionError(ExtensionErrorCode.INVALID_REQUEST);
  }

  try {
    validateIdempotencyKey(request.idempotencyKey);
  } catch {
    throw new ExtensionError(ExtensionErrorCode.INVALID_REQUEST);
  }

  const { tenantId } = identity;
  const bookingId = request.bookingId;
  const idempotencyKey = request.idempotencyKey;
  const collection = request.collectionCentavos;

  const tenantRef = db.collection('tenants').doc(tenantId);
  const bookingRef = db.collection('tenants').doc(tenantId).collection('bookings').doc(bookingId);
  const idempotencyRef = db.collection('tenants').doc(tenantId).collection('tsek_in_extension_idempotency').doc(extensionIdempotencyDocumentId(tenantId, idempotencyKey));
  const staffRef = identity.role === 'staff' && identity.staffAccountId
    ? tenantRef.collection('staff_accounts').doc(identity.staffAccountId)
    : null;

  const targetChannel = request.paymentChannel;
  const settlementAccountRef = collection > 0
    ? db.collection('tenants').doc(tenantId).collection('accounts').doc(targetAccountForPaymentChannel(targetChannel).id)
    : null;

  const fingerprint = buildExtensionFingerprint({
    tenantId,
    bookingId,
    extension: request.extension,
    collectionCentavos: collection,
    paymentChannel: targetChannel,
  });

  try {
    return await db.runTransaction(async (transaction) => {
      // Build the read set up front; all reads happen before any writes.
      const readRefs: admin.firestore.DocumentReference[] = [idempotencyRef, tenantRef, bookingRef];
      if (staffRef) readRefs.push(staffRef);
      if (settlementAccountRef) readRefs.push(settlementAccountRef);

      const snaps = await transaction.getAll(...readRefs);
      const idempotencySnap = snaps[0];
      const tenantSnap = snaps[1];
      const bookingSnap = snaps[2];
      const staffSnap = staffRef ? snaps[3] : null;
      const settlementAccountSnap = settlementAccountRef
        ? snaps[staffRef ? 4 : 3]
        : null;

      // Replay path
      if (idempotencySnap.exists) {
        const prior = idempotencySnap.data()!;
        let priorReceipt: ExtensionReceipt;
        try {
          priorReceipt = ExtensionReceiptSchema.parse(prior.receipt);
        } catch {
          throw new ExtensionError(ExtensionErrorCode.IDEMPOTENCY_CONFLICT);
        }
        if (prior.status === 'complete' && prior.fingerprint === fingerprint && prior.tenantId === tenantId) {
          return priorReceipt;
        }
        throw new ExtensionError(ExtensionErrorCode.IDEMPOTENCY_CONFLICT);
      }

      // Mid-flight tenant + staff revalidation
      if (!tenantSnap.exists) {
        throw new ExtensionError(ExtensionErrorCode.TENANT_INELIGIBLE);
      }
      const tenantData = tenantSnap.data()!;
      const { ownerUid } = assertTenantTsekInEntitlement(tenantData);
      if (identity.role === 'owner' && ownerUid !== identity.uid) {
        throw new ExtensionError(ExtensionErrorCode.FORBIDDEN);
      }
      if (identity.role === 'staff') {
        if (!staffSnap || !staffSnap.exists) {
          throw new ExtensionError(ExtensionErrorCode.FORBIDDEN);
        }
        assertStaffMatches(staffSnap.data(), identity.tenantId, identity.uid, identity.sessionVersion);
      }

      // Booking
      if (!bookingSnap.exists) {
        throw new ExtensionError(ExtensionErrorCode.BOOKING_NOT_FOUND);
      }
      const bookingData = bookingSnap.data()!;
      const parsedBooking = parseStrictBooking(
        bookingData.roomId,
        bookingData.status,
        bookingData.totalRoomCostCentavos,
        bookingData.totalCollectedCentavos,
        bookingData.moduleId,
        bookingData.paymentAllocations,
        bookingData.paymentAllocationsVersion,
        bookingData.expectedCheckOutDate,
        bookingData.rateCentavos,
        bookingData.shortTimeRatesCentavos,
        bookingData.extraPaxFeeCentavos,
        bookingData.stayType
      );

      // Stored allocation consistency
      const storedSum = sumAllocations(parsedBooking.paymentAllocations);
      if (storedSum !== parsedBooking.totalCollectedCentavos) {
        throw new ExtensionError(ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR);
      }

      // Rate snapshot — must include the right kind of rate for the extension.
      const snapshotForEngine = {
        rateCentavos: parsedBooking.rateCentavos,
        shortTimeRatesCentavos: parsedBooking.shortTimeRates || undefined,
        extraPaxFeeCentavos: parsedBooking.extraPaxFeeCentavos,
      };

      // Compute the authoritative additional cost using the engine. This reads
      // only stored values.
      let additionalCostCentavos: number;
      try {
        const result = TsekInEngine.computeExtensionCost(
          {
            rateCentavos: parsedBooking.rateCentavos,
            nights: parsedBooking.stayType === 'night' ? request.extension.duration : 0,
            extraPax: 0,
            extraPaxCostCentavos: 0,
            totalRoomCostCentavos: parsedBooking.totalRoomCostCentavos,
          },
          snapshotForEngine,
          request.extension.duration,
          request.extension.type
        );
        additionalCostCentavos = result.additionalCostCentavos;
      } catch (e) {
        if (e instanceof TsekInError) {
          if (e.code === 'INVALID_INPUT' || e.code === 'INVALID_DURATION') {
            throw new ExtensionError(ExtensionErrorCode.RATE_SNAPSHOT_INVALID);
          }
          throw new ExtensionError(ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR);
        }
        throw e;
      }

      const newTotalRoomCostCentavos = parsedBooking.totalRoomCostCentavos + additionalCostCentavos;
      if (!Number.isSafeInteger(newTotalRoomCostCentavos) || newTotalRoomCostCentavos < 0 || newTotalRoomCostCentavos > 1_000_000_000_000) {
        throw new ExtensionError(ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR);
      }

      // Outstanding balance after extension but BEFORE collection.
      const newOutstandingBalance = newTotalRoomCostCentavos - parsedBooking.totalCollectedCentavos;
      if (newOutstandingBalance < 0) {
        throw new ExtensionError(ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR);
      }

      // The tender decision is the browser-supplied collection. It is NOT the
      // authoritative cost. It must be safe non-negative integer and not
      // exceed the outstanding balance.
      if (!Number.isSafeInteger(collection) || collection < 0) {
        throw new ExtensionError(ExtensionErrorCode.INVALID_REQUEST);
      }
      if (collection > newOutstandingBalance) {
        throw new ExtensionError(ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR);
      }

      // Derive the new expected checkout from the PREVIOUS authoritative one.
      const standardCheckOutTime = typeof tenantData.standardCheckOutTime === 'string'
        ? tenantData.standardCheckOutTime
        : undefined;
      const previousCheckOutMillis = parsedBooking.expectedCheckOutAt;
      const newCheckOutMillis = deriveNextExpectedCheckOutAt(
        previousCheckOutMillis,
        request.extension.type,
        request.extension.duration,
        standardCheckOutTime
      );
      if (newCheckOutMillis <= previousCheckOutMillis) {
        throw new ExtensionError(ExtensionErrorCode.INVALID_EXTENSION);
      }

      // Read the room (derived from booking) BEFORE writes.
      const roomRef = db.collection('tenants').doc(tenantId).collection('rooms').doc(parsedBooking.roomId);
      const roomSnap = await transaction.get(roomRef);
      if (!roomSnap.exists || roomSnap.data()!.deletedAt) {
        throw new ExtensionError(ExtensionErrorCode.ROOM_NOT_FOUND);
      }
      const roomData = roomSnap.data()!;
      if (roomData.status !== 'Occupied') {
        throw new ExtensionError(ExtensionErrorCode.ROOM_STATE_CONFLICT);
      }
      if (typeof roomData.id === 'string' && roomData.id !== parsedBooking.roomId) {
        throw new ExtensionError(ExtensionErrorCode.ROOM_STATE_CONFLICT);
      }
      const roomDisplayName = typeof roomData.roomNumber === 'string' && roomData.roomNumber.length > 0
        ? roomData.roomNumber
        : parsedBooking.roomId;

      // ---- All reads done. Begin writes. ----
      const committedAt = now();
      const newTotalCollectedCentavos = parsedBooking.totalCollectedCentavos + collection;
      const remainingBalanceCentavos = newOutstandingBalance - collection;

      // Build normalized allocation entry for the collection, if any.
      const newAllocationEntries = collection > 0
        ? [...parsedBooking.paymentAllocations, {
            channel: targetChannel,
            amountCentavos: collection,
            routedTo: TsekInEngine.routePayment(targetChannel, collection).routedTo,
            affectsCash: TsekInEngine.routePayment(targetChannel, collection).affectsCash,
          }]
        : parsedBooking.paymentAllocations;

      // Validate the allocation we are about to persist.
      try {
        PaymentAllocationsListSchema.parse(newAllocationEntries);
      } catch {
        throw new ExtensionError(ExtensionErrorCode.PAYMENT_ALLOCATION_ERROR);
      }

      // Append immutable extension history entry.
      const newExtensionEntry = {
        type: request.extension.type,
        duration: request.extension.duration,
        additionalCostCentavos,
        rateSnapshot: snapshotForEngine,
        previousCheckOutAt: admin.firestore.Timestamp.fromMillis(previousCheckOutMillis),
        newCheckOutAt: admin.firestore.Timestamp.fromMillis(newCheckOutMillis),
        committedAt,
        actorId: identity.actorId,
        collectionChannel: collection > 0 ? targetChannel : null,
        collectionCentavos: collection,
      };

      const priorExtensionHistory = Array.isArray(bookingData.extensionHistory) ? bookingData.extensionHistory : [];
      const newExtensionHistory = [...priorExtensionHistory, newExtensionEntry];

      // Writes
      transaction.update(bookingRef, {
        status: 'Active',
        expectedCheckOutDate: admin.firestore.Timestamp.fromMillis(newCheckOutMillis),
        totalRoomCostCentavos: newTotalRoomCostCentavos,
        totalCollectedCentavos: newTotalCollectedCentavos,
        paymentAllocations: newAllocationEntries,
        paymentAllocationsVersion: PAYMENT_ALLOCATIONS_VERSION,
        extensionHistory: newExtensionHistory,
        lastExtendedAt: committedAt,
        lastExtendedBy: identity.actorId,
      });

      // Room stays Occupied — no state transition.
      // (No transaction update on roomRef.)

      // Money movement: only when collection > 0.
      const newLedgerRef = db.collection('tenants').doc(tenantId).collection('transactions').doc();
      const newAuditRef = db.collection('tenants').doc(tenantId).collection('tsek_in_audit').doc();

      if (collection > 0) {
        const acct = settlementAccountSnap!;
        if (!acct.exists) {
          transaction.set(settlementAccountRef!, {
            id: targetAccountForPaymentChannel(targetChannel).id,
            tenantId,
            name: targetAccountForPaymentChannel(targetChannel).name,
            type: 'asset',
            balance: admin.firestore.FieldValue.increment(collection),
            isActive: true,
            createdAt: committedAt,
            updatedAt: committedAt,
          });
        } else {
          transaction.update(settlementAccountRef!, {
            balance: admin.firestore.FieldValue.increment(collection),
            updatedAt: committedAt,
          });
        }
        transaction.set(newLedgerRef, {
          id: newLedgerRef.id,
          tenantId,
          moduleId: TSEK_IN_MODULE_ID,
          bookingId,
          referenceId: bookingId,
          paymentChannel: targetChannel,
          amountCentavos: collection,
          type: 'income',
          category: 'Stay Extension',
          description: `Stay extension for booking ${bookingId} (${request.extension.type} +${request.extension.duration})`,
          status: 'completed',
          date: committedAt,
          createdAt: committedAt,
          actorId: identity.actorId,
        });
      }

      // Atomic audit record (always written — even for zero-collection).
      transaction.set(newAuditRef, {
        id: newAuditRef.id,
        tenantId,
        moduleId: TSEK_IN_MODULE_ID,
        bookingId,
        action: 'extend',
        stayType: request.extension.type,
        duration: request.extension.duration,
        additionalCostCentavos,
        newTotalRoomCostCentavos,
        collectionCentavos: collection,
        paymentChannel: collection > 0 ? targetChannel : null,
        newExpectedCheckOutAt: admin.firestore.Timestamp.fromMillis(newCheckOutMillis),
        actorId: identity.actorId,
        committedAt,
        createdAt: committedAt,
      });

      // Build + validate the sanitized receipt.
      const receipt: ExtensionReceipt = {
        bookingId,
        roomId: parsedBooking.roomId,
        roomDisplayName,
        stayType: request.extension.type,
        extensionDuration: request.extension.duration,
        previousCheckOutAt: new Date(previousCheckOutMillis).toISOString(),
        newCheckOutAt: new Date(newCheckOutMillis).toISOString(),
        additionalCostCentavos,
        newTotalRoomCostCentavos,
        amountCollectedNowCentavos: collection,
        totalCollectedCentavos: newTotalCollectedCentavos,
        remainingBalanceCentavos,
        paymentChannel: collection > 0 ? targetChannel : 'none',
        bookingStatus: 'Active',
        roomStatus: 'Occupied',
        committedAt: committedAt.toDate().toISOString(),
        moduleId: TSEK_IN_MODULE_ID,
      };
      const validatedReceipt = ExtensionReceiptSchema.parse(receipt);

      transaction.set(idempotencyRef, {
        id: idempotencyRef.id,
        tenantId,
        moduleId: TSEK_IN_MODULE_ID,
        bookingId,
        status: 'complete',
        fingerprint,
        receipt: validatedReceipt,
        createdAt: committedAt,
      });

      return validatedReceipt;
    });
  } catch (error: any) {
    if (error instanceof ExtensionError) {
      throw error;
    }
    if (error instanceof TsekInError) {
      throw new ExtensionError(ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR);
    }
    if (error instanceof z.ZodError) {
      throw new ExtensionError(ExtensionErrorCode.INVALID_REQUEST);
    }
    throw new ExtensionError(ExtensionErrorCode.SERVICE_UNAVAILABLE);
  }
}

// ==========================================
// Identity compat shim
// ==========================================

async function verifyTsekInIdentityCompat(
  idToken: string,
  auth: admin.auth.Auth,
  firestore: admin.firestore.Firestore
): Promise<VerifiedTsekInIdentity> {
  const { verifyTsekInIdentity } = await import('./tsek-in-checkin-service');
  return verifyTsekInIdentity(idToken, auth, firestore);
}

export function sanitizedExtensionResponse(error: ExtensionError): Response {
  return Response.json({ error: error.userMessage, code: error.code }, { status: error.httpStatus });
}