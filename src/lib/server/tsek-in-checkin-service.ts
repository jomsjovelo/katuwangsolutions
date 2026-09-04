import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { TsekInEngine, TsekInError, validateIdempotencyKey, computeFingerprint } from '@/lib/tsek-in/domain';

// ==========================================
// Module Constants
// ==========================================

export const TSEK_IN_MODULE_ID = 'tsek-in' as const;

// ==========================================
// Error Codes & Messages
// ==========================================

export enum CheckinErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  TENANT_INELIGIBLE = 'TENANT_INELIGIBLE',
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  ROOM_UNAVAILABLE = 'ROOM_UNAVAILABLE',
  ROOM_DATA_INVALID = 'ROOM_DATA_INVALID',
  FINANCIAL_INTEGRITY_ERROR = 'FINANCIAL_INTEGRITY_ERROR',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

const ERROR_DETAILS: Record<CheckinErrorCode, { status: number; message: string }> = {
  [CheckinErrorCode.INVALID_REQUEST]: { status: 400, message: 'Invalid request.' },
  [CheckinErrorCode.UNAUTHENTICATED]: { status: 401, message: 'Authentication required.' },
  [CheckinErrorCode.FORBIDDEN]: { status: 403, message: 'Operation not permitted.' },
  [CheckinErrorCode.TENANT_INELIGIBLE]: { status: 403, message: 'Tenant is not eligible for Tsek-In.' },
  [CheckinErrorCode.ROOM_NOT_FOUND]: { status: 404, message: 'Room not found.' },
  [CheckinErrorCode.ROOM_UNAVAILABLE]: { status: 409, message: 'Room is not available.' },
  [CheckinErrorCode.ROOM_DATA_INVALID]: { status: 409, message: 'Room data is invalid.' },
  [CheckinErrorCode.FINANCIAL_INTEGRITY_ERROR]: { status: 409, message: 'Financial integrity error.' },
  [CheckinErrorCode.IDEMPOTENCY_CONFLICT]: { status: 409, message: 'Idempotency conflict.' },
  [CheckinErrorCode.SERVICE_UNAVAILABLE]: { status: 503, message: 'Service temporarily unavailable.' },
};

export class CheckinError extends Error {
  readonly code: CheckinErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;

  constructor(code: CheckinErrorCode, customMessage?: string) {
    const detail = ERROR_DETAILS[code];
    const message = customMessage || detail.message;
    super(message);
    this.name = 'CheckinError';
    this.code = code;
    this.httpStatus = detail.status;
    this.userMessage = message;
  }
}

// ==========================================
// Request / Receipt Types
// ==========================================

export const StayTypeSchema = z.enum(['night', 'short']);
export const PaymentChannelSchema = z.enum(['cash', 'gcash', 'maya', 'card']);

const NightDurationSchema = z.number().int().positive().max(365, 'Night duration cannot exceed 365.');
const ShortDurationSchema = z.number().int().positive().refine((n) => [3, 6, 8, 12].includes(n), 'Short-time duration must be exactly 3, 6, 8, or 12.');

const NightStaySchema = z.object({ type: z.literal('night'), duration: NightDurationSchema });
const ShortStaySchema = z.object({ type: z.literal('short'), duration: ShortDurationSchema });
export const StaySchema = z.discriminatedUnion('type', [NightStaySchema, ShortStaySchema]);

export const CheckinRequestSchema = z.object({
  idempotencyKey: z.string().uuid('Idempotency key must be a valid UUID v4.'),
  roomId: z.string().min(1).max(100),
  guestName: z.string().min(1).max(100),
  contactInfo: z.string().max(200).optional(),
  stayType: StayTypeSchema,
  duration: NightDurationSchema.or(ShortDurationSchema),
  extraPax: z.number().int().min(0).max(20),
  paymentMethod: PaymentChannelSchema,
  initialPaymentCentavos: z.number().int().min(0).max(1_000_000_000_000),
}).strict();

export type CheckinRequest = z.infer<typeof CheckinRequestSchema>;

const CheckinReceiptSchema = z.object({
  bookingId: z.string().min(1).max(128),
  roomId: z.string().min(1).max(128),
  roomDisplayName: z.string().min(1).max(128),
  stayType: z.enum(['night', 'short']),
  duration: z.number().int().positive(),
  totalCostCentavos: z.number().int().min(0).max(1_000_000_000_000),
  initialPaymentCentavos: z.number().int().min(0).max(1_000_000_000_000),
  remainingBalanceCentavos: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000),
  paymentChannel: z.string().min(1).max(64),
  requestedCheckOutAt: z.string().min(1).max(64),
  committedAt: z.string().min(1).max(64),
  moduleId: z.literal(TSEK_IN_MODULE_ID),
}).strict();

export interface CheckinReceipt extends z.infer<typeof CheckinReceiptSchema> {}

export interface CheckinServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

// ==========================================
// Identity & Authorization
// ==========================================

export interface VerifiedTsekInIdentity {
  uid: string;
  tenantId: string;
  staffAccountId?: string;
  sessionVersion: number;
  actorId: string;
  role: 'owner' | 'staff';
}

const SERVER_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_UNLOCKED_MODULES = 64;

// Single source of truth for Tsek-In entitlement. Accepts a raw tenant document
// payload (no Firestore dependency) so it can be reused by both the initial
// authentication path and the transactional revalidation path.
export function assertTenantTsekInEntitlement(tenant: unknown): { ownerUid: string } {
  if (!tenant || typeof tenant !== 'object') {
    throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
  }
  const doc = tenant as Record<string, unknown>;

  if (doc.subscriptionStatus !== 'active') {
    throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
  }

const ownerUid = doc.ownerUid;
    if (typeof ownerUid !== 'string' || ownerUid.length === 0) {
      throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
    }

  // Primary entitlement: tenant.moduleType === 'tsek-in'.
  let hasPrimary = false;
  if (typeof doc.moduleType === 'string') {
    hasPrimary = doc.moduleType === TSEK_IN_MODULE_ID;
  }

  // Secondary entitlement: 'tsek-in' present in authoritative unlockedModules.
  // Must be a string array with no duplicates, no non-string entries, and bounded
  // length; otherwise we fail closed.
  let hasUnlocked = false;
  const unlocked = doc.unlockedModules;
  if (unlocked !== undefined && unlocked !== null) {
    if (!Array.isArray(unlocked)) {
      throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
    }
    if (unlocked.length > MAX_UNLOCKED_MODULES) {
      throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
    }
    const seen = new Set<string>();
    for (const entry of unlocked) {
      if (typeof entry !== 'string' || entry.length === 0 || entry.length > 128) {
        throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
      }
      if (seen.has(entry)) {
        throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
      }
      seen.add(entry);
      if (entry === TSEK_IN_MODULE_ID) hasUnlocked = true;
    }
  }

  if (!hasPrimary && !hasUnlocked) {
    throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
  }

  // Per-module status override: if `moduleStatuses['tsek-in']` exists, it must be active.
  const statuses = doc.moduleStatuses;
  if (statuses !== undefined && statuses !== null) {
    if (!statuses || typeof statuses !== 'object' || Array.isArray(statuses)) {
      throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
    }
    const tsekInStatus = (statuses as Record<string, unknown>)[TSEK_IN_MODULE_ID];
    if (tsekInStatus !== undefined && tsekInStatus !== 'active') {
      throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
    }
  }

  return { ownerUid };
}

export function assertStaffMatches(
  staff: unknown,
  tenantId: string,
  uid: string,
  sessionVersion: number
): void {
  if (!staff || typeof staff !== 'object') {
    throw new CheckinError(CheckinErrorCode.FORBIDDEN);
  }
  const s = staff as Record<string, unknown>;
  if (s.status !== 'active') {
    throw new CheckinError(CheckinErrorCode.FORBIDDEN);
  }
  if (s.tenantId !== tenantId) {
    throw new CheckinError(CheckinErrorCode.FORBIDDEN);
  }
  if (s.authUid !== uid) {
    throw new CheckinError(CheckinErrorCode.FORBIDDEN);
  }
  if (!Number.isSafeInteger(s.sessionVersion) || s.sessionVersion !== sessionVersion) {
    throw new CheckinError(CheckinErrorCode.FORBIDDEN);
  }
}

async function loadTenantForAuth(
  firestore: admin.firestore.Firestore,
  tenantId: string
): Promise<{ ownerUid: string }> {
  const tenantSnap = await firestore.collection('tenants').doc(tenantId).get();
  if (!tenantSnap.exists) {
    throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
  }
  return assertTenantTsekInEntitlement(tenantSnap.data());
}

export async function verifyTsekInIdentity(
  idToken: string,
  auth: admin.auth.Auth,
  firestore: admin.firestore.Firestore
): Promise<VerifiedTsekInIdentity> {
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch {
    throw new CheckinError(CheckinErrorCode.UNAUTHENTICATED);
  }

  const role = decoded.role;
  const uid = decoded.uid;

  if (role === 'cashier') {
    throw new CheckinError(CheckinErrorCode.FORBIDDEN);
  }

  if (role === 'owner') {
    const tenantId = decoded.tenantId;
    if (!tenantId || typeof tenantId !== 'string' || !SERVER_IDENTIFIER.test(tenantId)) {
      throw new CheckinError(CheckinErrorCode.FORBIDDEN);
    }
    const { ownerUid } = await loadTenantForAuth(firestore, tenantId);
    if (ownerUid !== uid) {
      throw new CheckinError(CheckinErrorCode.FORBIDDEN);
    }
    return { uid, tenantId, sessionVersion: 0, actorId: `owner_${uid}`, role: 'owner' };
  }

  if (role === 'staff') {
    const tenantId = decoded.tenantId;
    const staffAccountId = decoded.staffAccountId;
    const tokenSessionVersion = decoded.sessionVersion;

    if (!tenantId || typeof tenantId !== 'string' || !SERVER_IDENTIFIER.test(tenantId)) {
      throw new CheckinError(CheckinErrorCode.FORBIDDEN);
    }
    if (!staffAccountId || typeof staffAccountId !== 'string' || !SERVER_IDENTIFIER.test(staffAccountId)) {
      throw new CheckinError(CheckinErrorCode.FORBIDDEN);
    }
    if (!Number.isSafeInteger(tokenSessionVersion) || tokenSessionVersion < 0) {
      throw new CheckinError(CheckinErrorCode.FORBIDDEN);
    }

    await loadTenantForAuth(firestore, tenantId);

    const tenantRef = firestore.collection('tenants').doc(tenantId);
    const staffRef = tenantRef.collection('staff_accounts').doc(staffAccountId);
    const staffSnap = await staffRef.get();
    assertStaffMatches(staffSnap.exists ? staffSnap.data() : null, tenantId, uid, tokenSessionVersion);

    return {
      uid,
      tenantId,
      staffAccountId,
      sessionVersion: tokenSessionVersion,
      actorId: `staff_${staffAccountId}`,
      role: 'staff',
    };
  }

  throw new CheckinError(CheckinErrorCode.FORBIDDEN);
}

// ==========================================
// Idempotency
// ==========================================

function checkinIdempotencyDocumentId(tenantId: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${tenantId}:${idempotencyKey}`, 'utf8').digest('hex');
}

// ==========================================
// Time / Check-out Policy
// ==========================================

// All times are interpreted against `Asia/Manila` for human-facing check-out policy.
// Requested check-out is derived from the authoritative injected `now()` so the service
// is deterministic and replay-safe. The committed timestamp is NEVER read from the
// browser; only the injected `now()` source (and tenant authoritative settings) drive
// the result. The fingerprint excludes `committedAt` and `requestedCheckOutAt`.
const MANILA_TZ = 'Asia/Manila';
// Safe default: 12:00 noon Manila when tenant has no `standardCheckOutTime`.
const DEFAULT_MANILA_CHECKOUT_HHMM = '12:00';
const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTenantCheckoutHHMM(raw: unknown): { hours: number; minutes: number } {
  if (raw === undefined || raw === null) {
    const m = DEFAULT_MANILA_CHECKOUT_HHMM.match(HHMM_REGEX)!;
    return { hours: Number(m[1]), minutes: Number(m[2]) };
  }
  if (typeof raw !== 'string' || !HHMM_REGEX.test(raw)) {
    throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
  }
  const [h, m] = raw.split(':').map((n) => Number(n));
  return { hours: h, minutes: m };
}

// Returns the UTC millisecond timestamp for the requested check-out derived from the
// authoritative committed time + the tenant's Manila `standardCheckOutTime` setting
// (interpreted as a wall-clock time in `Asia/Manila` for night stays) or, for short
// stays, `committedAt` + duration hours.
function deriveRequestedCheckOutAt(
  committedAt: admin.firestore.Timestamp,
  stayType: 'night' | 'short',
  duration: number,
  standardCheckOutTime: string | undefined
): admin.firestore.Timestamp {
  if (stayType === 'night') {
    const { hours, minutes } = parseTenantCheckoutHHMM(standardCheckOutTime);
    const baseMillis = committedAt.toMillis();
    const baseManila = new Date(baseMillis);
    // Compute the Manila wall-clock day + duration, then anchor the HH:mm checkout.
    // We never trust browser clocks: use Intl.DateTimeFormat parts to derive the
    // Manila Y/M/D, then add `duration` days and re-anchor the checkout wall time.
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: MANILA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = fmt.formatToParts(baseManila).reduce<Record<string, number>>((acc, p) => {
      if (p.type === 'year' || p.type === 'month' || p.type === 'day') acc[p.type] = Number(p.value);
      return acc;
    }, {});
    // Anchor by computing the Manila midnight for the check-in day, adding
    // duration days, and shifting by the configured checkout HH:mm. This is
    // timezone-correct without depending on Date's getDate()/setHours().
    const manilaMidnightUtcMs = (() => {
      // Find the UTC instant when Manila is at 00:00 on `parts.year-month-day`.
      // Use the tz offset for that specific moment by binary-probing.
      const targetUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
      // Compute Manila offset at that target (handles DST even though Manila has none).
      const offsetMin = (() => {
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
        return (asUtc - targetUtc) / 60000;
      })();
      return targetUtc - offsetMin * 60000;
    })();
    const checkoutUtcMs = manilaMidnightUtcMs + duration * 24 * 60 * 60 * 1000 + hours * 3600 * 1000 + minutes * 60 * 1000;
    return admin.firestore.Timestamp.fromMillis(checkoutUtcMs);
  }
  // Short stay: add duration hours to the committed UTC timestamp.
  return admin.firestore.Timestamp.fromMillis(committedAt.toMillis() + duration * 60 * 60 * 1000);
}

// Returns the human-facing Asia/Manila wall-clock string (ISO 8601 with offset) for
// a UTC millisecond instant. Used by deterministic boundary tests.
export function manilaWallClockIsoFromMillis(utcMs: number): string {
  // Build the ISO string with explicit +08:00 offset (Manila has no DST).
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TZ,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(utcMs)).reduce<Record<string, number>>((acc, p) => {
    if (p.type === 'year' || p.type === 'month' || p.type === 'day' || p.type === 'hour' || p.type === 'minute' || p.type === 'second') {
      acc[p.type] = Number(p.value === '24' ? 0 : p.value);
    }
    return acc;
  }, {});
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}+08:00`;
}

// ==========================================
// Room Validation
// ==========================================

function validateRoomAuthoritative(room: Record<string, unknown>): {
  rateCentavos: number;
  shortTimeRatesCentavos?: { '3h'?: number; '6h'?: number; '8h'?: number; '12h'?: number };
  extraPaxFeeCentavos: number;
  roomNumber: string;
  capacity: number;
} {
  if (!Number.isSafeInteger(room.rateCentavos) || (room.rateCentavos as number) < 0) {
    throw new CheckinError(CheckinErrorCode.ROOM_DATA_INVALID);
  }
  if (!Number.isSafeInteger(room.capacity) || (room.capacity as number) < 1) {
    throw new CheckinError(CheckinErrorCode.ROOM_DATA_INVALID);
  }
  const roomNumber = typeof room.roomNumber === 'string' && room.roomNumber.length > 0 && room.roomNumber.length <= 50
    ? room.roomNumber
    : (() => { throw new CheckinError(CheckinErrorCode.ROOM_DATA_INVALID); })();

  const extraPaxFeeRaw = room.extraPaxFeeCentavos;
  let extraPaxFeeCentavos = 0;
  if (extraPaxFeeRaw !== undefined && extraPaxFeeRaw !== null) {
    if (!Number.isSafeInteger(extraPaxFeeRaw) || (extraPaxFeeRaw as number) < 0) {
      throw new CheckinError(CheckinErrorCode.ROOM_DATA_INVALID);
    }
    extraPaxFeeCentavos = extraPaxFeeRaw as number;
  }

  const rawShortRates = room.shortTimeRatesCentavos;
  if (rawShortRates !== undefined && rawShortRates !== null) {
    if (typeof rawShortRates !== 'object' || rawShortRates === null) {
      throw new CheckinError(CheckinErrorCode.ROOM_DATA_INVALID);
    }
    const out: { '3h'?: number; '6h'?: number; '8h'?: number; '12h'?: number } = {};
    for (const key of ['3h', '6h', '8h', '12h'] as const) {
      const v = (rawShortRates as Record<string, unknown>)[key];
      if (v !== undefined && v !== null) {
        if (!Number.isSafeInteger(v) || (v as number) < 0) {
          throw new CheckinError(CheckinErrorCode.ROOM_DATA_INVALID);
        }
        out[key] = v as number;
      }
    }
    return { rateCentavos: room.rateCentavos as number, shortTimeRatesCentavos: out, extraPaxFeeCentavos, roomNumber, capacity: room.capacity as number };
  }
  return { rateCentavos: room.rateCentavos as number, extraPaxFeeCentavos, roomNumber, capacity: room.capacity as number };
}

// ==========================================
// Fingerprint
// ==========================================

function buildCheckinFingerprint(input: {
  tenantId: string;
  roomId: string;
  guestName: string;
  contactInfo: string;
  stayType: 'night' | 'short';
  duration: number;
  extraPax: number;
  paymentMethod: string;
  initialPaymentCentavos: number;
}): string {
  return computeFingerprint({
    operation: 'tsekInCheckIn',
    tenantId: input.tenantId,
    roomId: input.roomId,
    guestName: input.guestName,
    contactInfo: input.contactInfo,
    stayType: input.stayType,
    duration: input.duration,
    extraPax: input.extraPax,
    paymentMethod: input.paymentMethod,
    initialPaymentCentavos: input.initialPaymentCentavos,
  });
}

function targetAccountForPaymentChannel(method: 'cash' | 'gcash' | 'maya' | 'card'): { id: string; name: string } {
  switch (method) {
    case 'cash': return { id: 'master-cash', name: 'Main Cash Register' };
    case 'gcash': return { id: 'gcash-settlement', name: 'GCash Settlement' };
    case 'maya': return { id: 'maya-settlement', name: 'Maya Settlement' };
    case 'card': return { id: 'card-clearing', name: 'Card Clearing' };
  }
}

// ==========================================
// Service
// ==========================================

export async function tsekInCheckIn(
  idToken: string,
  requestValue: unknown,
  options: CheckinServiceOptions = {}
): Promise<CheckinReceipt> {
  const auth = options.adminAuth || getAdminAuth();
  const db = options.adminFirestore || getAdminFirestore();
  const now = options.now || (() => admin.firestore.Timestamp.now());

  let identity: VerifiedTsekInIdentity;
  try {
    identity = await verifyTsekInIdentity(idToken, auth, db);
  } catch (e) {
    if (e instanceof CheckinError) throw e;
    throw new CheckinError(CheckinErrorCode.UNAUTHENTICATED);
  }

  let request: CheckinRequest;
  try {
    request = CheckinRequestSchema.parse(requestValue);
  } catch {
    throw new CheckinError(CheckinErrorCode.INVALID_REQUEST);
  }

  const { tenantId } = identity;
  const roomId = request.roomId;
  const idempotencyKey = request.idempotencyKey;

  try {
    validateIdempotencyKey(idempotencyKey);
  } catch {
    throw new CheckinError(CheckinErrorCode.INVALID_REQUEST);
  }

  const roomRef = db.collection('tenants').doc(tenantId).collection('rooms').doc(roomId);
  const bookingsRef = db.collection('tenants').doc(tenantId).collection('bookings');
  const idempotencyRef = db.collection('tenants').doc(tenantId).collection('tsek_in_idempotency').doc(checkinIdempotencyDocumentId(tenantId, idempotencyKey));

  const committedAt = now();
  const fingerprint = buildCheckinFingerprint({
    tenantId,
    roomId,
    guestName: request.guestName,
    contactInfo: request.contactInfo || '',
    stayType: request.stayType,
    duration: request.duration,
    extraPax: request.extraPax,
    paymentMethod: request.paymentMethod,
    initialPaymentCentavos: request.initialPaymentCentavos,
  });

  const tenantRef = db.collection('tenants').doc(tenantId);
  const targetAccount = targetAccountForPaymentChannel(request.paymentMethod);
  const accountRef = db.collection('tenants').doc(tenantId).collection('accounts').doc(targetAccount.id);
  const staffRef = identity.role === 'staff' && identity.staffAccountId
    ? tenantRef.collection('staff_accounts').doc(identity.staffAccountId)
    : null;

  // Build the read set up front so all reads happen before any write.
  const paidRequest = request.initialPaymentCentavos > 0;
  const readRefs: admin.firestore.DocumentReference[] = [idempotencyRef, tenantRef, roomRef];
  if (paidRequest) readRefs.push(accountRef);
  if (staffRef) readRefs.push(staffRef);

  try {
    return await db.runTransaction(async (transaction) => {
      // All transaction reads must happen before any writes. A single getAll call
      // is used so the read set is deterministic and any read-after-write attempt
      // is caught by the mock's read-after-write guard.
      const snaps = await transaction.getAll(...readRefs);
      const accountIndex = paidRequest ? 3 : -1;
      const staffIndex = staffRef ? (paidRequest ? 4 : 3) : -1;
      const idempotencySnap = snaps[0];
      const tenantSnap = snaps[1];
      const roomSnap = snaps[2];
      const accountSnap = accountIndex >= 0 ? snaps[accountIndex] : null;
      const staffSnap = staffIndex >= 0 ? snaps[staffIndex] : null;

      // Revalidate authoritative tenant inside the transaction to catch mid-flight
      // changes (subscription canceled, module switched, owner reassigned,
      // unlocked modules revoked, Tsek-In module status suspended).
      if (!tenantSnap.exists) {
        throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
      }
      const { ownerUid } = assertTenantTsekInEntitlement(tenantSnap.data());
      if (identity.role === 'owner' && ownerUid !== identity.uid) {
        throw new CheckinError(CheckinErrorCode.FORBIDDEN);
      }

      // Revalidate authoritative staff account for staff actors. The read must
      // occur inside the same getAll batch above so no read-after-write violation
      // is possible.
      if (identity.role === 'staff') {
        if (!staffSnap || !staffSnap.exists) {
          throw new CheckinError(CheckinErrorCode.FORBIDDEN);
        }
        assertStaffMatches(staffSnap.data(), identity.tenantId, identity.uid, identity.sessionVersion);
      }

      if (idempotencySnap.exists) {
        const prior = idempotencySnap.data()!;
        let priorReceipt: CheckinReceipt;
        try {
          priorReceipt = CheckinReceiptSchema.parse(prior.receipt);
        } catch {
          throw new CheckinError(CheckinErrorCode.IDEMPOTENCY_CONFLICT);
        }
        if (prior.status === 'complete' && prior.fingerprint === fingerprint && prior.tenantId === tenantId) {
          return priorReceipt;
        }
        throw new CheckinError(CheckinErrorCode.IDEMPOTENCY_CONFLICT);
      }

      if (!roomSnap.exists || roomSnap.data()!.deletedAt) {
        throw new CheckinError(CheckinErrorCode.ROOM_NOT_FOUND);
      }
      const roomData = roomSnap.data()!;
      if (roomData.status !== 'Available') {
        throw new CheckinError(CheckinErrorCode.ROOM_UNAVAILABLE);
      }

      const roomValidated = validateRoomAuthoritative(roomData);

      // Capacity rule: 1 primary guest + extraPax must not exceed capacity.
      if (1 + request.extraPax > roomValidated.capacity) {
        throw new CheckinError(CheckinErrorCode.ROOM_DATA_INVALID);
      }

      const roomRateSnapshot = {
        rateCentavos: roomValidated.rateCentavos,
        shortTimeRatesCentavos: roomValidated.shortTimeRatesCentavos,
        extraPaxFeeCentavos: roomValidated.extraPaxFeeCentavos,
      };

      // Domain engine validates short-time rates presence for short stays.
      let quoteResult: { quoteCentavos: number };
      try {
        quoteResult = TsekInEngine.computeCheckInQuote(
          roomRateSnapshot,
          request.stayType,
          request.duration,
          request.extraPax
        );
      } catch (e) {
        if (e instanceof TsekInError) {
          throw new CheckinError(CheckinErrorCode.ROOM_DATA_INVALID);
        }
        throw e;
      }
      const totalCostCentavos = quoteResult.quoteCentavos;

      if (request.initialPaymentCentavos > totalCostCentavos) {
        throw new CheckinError(CheckinErrorCode.FINANCIAL_INTEGRITY_ERROR);
      }
      const remainingBalanceCentavos = totalCostCentavos - request.initialPaymentCentavos;

// Now that the authoritative tenant snapshot is validated, derive the
      // timezone-aware requested check-out timestamp.
      const requestedCheckOutAt = deriveRequestedCheckOutAt(
        committedAt,
        request.stayType,
        request.duration,
        typeof tenantSnap.data()!.standardCheckOutTime === 'string' ? tenantSnap.data()!.standardCheckOutTime as string : undefined
      );

      // Authoritative allocation of the initial payment for downstream services.
      const initialRoute = TsekInEngine.routePayment(request.paymentMethod, request.initialPaymentCentavos);
      const initialPaymentAllocations = request.initialPaymentCentavos > 0
        ? [{ channel: request.paymentMethod, amountCentavos: request.initialPaymentCentavos, routedTo: initialRoute.routedTo, affectsCash: initialRoute.affectsCash }]
        : [];

      const newBookingRef = bookingsRef.doc();
      const newTransactionRef = db.collection('tenants').doc(tenantId).collection('transactions').doc();

      // ---- Writes start here. No further transaction.get/getAll may be issued. ----
      transaction.update(roomRef, { status: 'Occupied', updatedAt: committedAt });

      transaction.set(newBookingRef, {
        id: newBookingRef.id,
        tenantId,
        moduleId: TSEK_IN_MODULE_ID,
        roomId,
        roomName: roomValidated.roomNumber,
        guestName: request.guestName,
        contactInfo: request.contactInfo || null,
        stayType: request.stayType,
        duration: request.duration,
        extraPax: request.extraPax,
        paymentMethod: request.paymentMethod,
        initialPaymentCentavos: request.initialPaymentCentavos,
        rateCentavos: roomValidated.rateCentavos,
        shortTimeRatesCentavos: roomValidated.shortTimeRatesCentavos || null,
        extraPaxFeeCentavos: roomValidated.extraPaxFeeCentavos,
        totalRoomCostCentavos: totalCostCentavos,
        totalCollectedCentavos: request.initialPaymentCentavos,
        paymentAllocations: initialPaymentAllocations,
        paymentAllocationsVersion: request.initialPaymentCentavos > 0 ? 1 : 0,
        extraCharges: [],
        expectedCheckOutDate: requestedCheckOutAt,
        status: 'Active',
        actorId: identity.actorId,
        fingerprint,
        createdAt: committedAt,
        committedAt,
      });

      if (paidRequest) {
        const acct = accountSnap!;
        if (!acct.exists) {
          transaction.set(accountRef, {
            id: targetAccount.id,
            tenantId,
            name: targetAccount.name,
            type: 'asset',
            balance: admin.firestore.FieldValue.increment(request.initialPaymentCentavos),
            isActive: true,
            createdAt: committedAt,
            updatedAt: committedAt,
          });
        } else {
          transaction.update(accountRef, {
            balance: admin.firestore.FieldValue.increment(request.initialPaymentCentavos),
            updatedAt: committedAt,
          });
        }

        transaction.set(newTransactionRef, {
          id: newTransactionRef.id,
          tenantId,
          moduleId: TSEK_IN_MODULE_ID,
          bookingId: newBookingRef.id,
          referenceId: newBookingRef.id,
          paymentChannel: request.paymentMethod,
          amountCentavos: request.initialPaymentCentavos,
          type: 'income',
          category: 'Check-In Payment',
          description: `Check-in advance payment for ${request.guestName} (Room ${roomValidated.roomNumber})`,
          status: 'completed',
          date: committedAt,
          createdAt: committedAt,
          actorId: identity.actorId,
        });
      }

      const receipt: CheckinReceipt = {
        bookingId: newBookingRef.id,
        roomId,
        roomDisplayName: roomValidated.roomNumber,
        stayType: request.stayType,
        duration: request.duration,
        totalCostCentavos,
        initialPaymentCentavos: request.initialPaymentCentavos,
        remainingBalanceCentavos,
        paymentChannel: request.paymentMethod,
        requestedCheckOutAt: requestedCheckOutAt.toDate().toISOString(),
        committedAt: committedAt.toDate().toISOString(),
        moduleId: TSEK_IN_MODULE_ID,
      };

      // Validate the sanitized receipt before persistence.
      const validatedReceipt = CheckinReceiptSchema.parse(receipt);

      transaction.set(idempotencyRef, {
        id: idempotencyRef.id,
        tenantId,
        moduleId: TSEK_IN_MODULE_ID,
        bookingId: newBookingRef.id,
        status: 'complete',
        fingerprint,
        receipt: validatedReceipt,
        createdAt: committedAt,
      });

      return validatedReceipt;
    });
  } catch (error: any) {
    if (error instanceof CheckinError) {
      throw error;
    }
    if (error instanceof TsekInError) {
      throw new CheckinError(CheckinErrorCode.INVALID_REQUEST);
    }
    if (error instanceof z.ZodError) {
      throw new CheckinError(CheckinErrorCode.INVALID_REQUEST);
    }
    throw new CheckinError(CheckinErrorCode.SERVICE_UNAVAILABLE);
  }
}

export function sanitizedCheckinResponse(error: CheckinError): Response {
  return Response.json({ error: error.userMessage, code: error.code }, { status: error.httpStatus });
}