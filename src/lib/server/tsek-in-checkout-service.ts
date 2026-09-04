import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  ExtraChargeSchema,
  TsekInEngine,
  TsekInError,
  TsekInErrorCode,
  validateIdempotencyKey,
  computeFingerprint,
  PaymentAllocationSchema,
  PaymentAllocationsListSchema,
  PAYMENT_ALLOCATIONS_VERSION,
  type ExtraCharge,
  type PaymentAllocation,
} from '@/lib/tsek-in/domain';
import {
  TSEK_IN_MODULE_ID,
  CheckinErrorCode,
  assertStaffMatches,
  assertTenantTsekInEntitlement,
  type VerifiedTsekInIdentity,
} from './tsek-in-checkin-service';

// Re-export so downstream consumers can `import { CheckoutErrorCode } from
// '@/lib/server/tsek-in-checkout-service'` without having to also pull the
// check-in module.
import { CheckinError } from './tsek-in-checkin-service';

// ==========================================
// Module Constants
// ==========================================

// Note: TSEK_IN_MODULE_ID is re-exported indirectly through the check-in module
// above (kept for parity with the Phase 1B-1 surface).
export { TSEK_IN_MODULE_ID };

// ==========================================
// Error Codes & Messages
// ==========================================

export enum CheckoutErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  TENANT_INELIGIBLE = 'TENANT_INELIGIBLE',
  BOOKING_NOT_FOUND = 'BOOKING_NOT_FOUND',
  BOOKING_NOT_ACTIVE = 'BOOKING_NOT_ACTIVE',
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  ROOM_STATE_CONFLICT = 'ROOM_STATE_CONFLICT',
  FINANCIAL_INTEGRITY_ERROR = 'FINANCIAL_INTEGRITY_ERROR',
  PAYMENT_ALLOCATION_ERROR = 'PAYMENT_ALLOCATION_ERROR',
  INSUFFICIENT_CASH = 'INSUFFICIENT_CASH',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

const ERROR_DETAILS: Record<CheckoutErrorCode, { status: number; message: string }> = {
  [CheckoutErrorCode.INVALID_REQUEST]: { status: 400, message: 'Invalid request.' },
  [CheckoutErrorCode.UNAUTHENTICATED]: { status: 401, message: 'Authentication required.' },
  [CheckoutErrorCode.FORBIDDEN]: { status: 403, message: 'Operation not permitted.' },
  [CheckoutErrorCode.TENANT_INELIGIBLE]: { status: 403, message: 'Tenant is not eligible for Tsek-In.' },
  [CheckoutErrorCode.BOOKING_NOT_FOUND]: { status: 404, message: 'Booking not found.' },
  [CheckoutErrorCode.BOOKING_NOT_ACTIVE]: { status: 409, message: 'Booking is not active.' },
  [CheckoutErrorCode.ROOM_NOT_FOUND]: { status: 404, message: 'Room not found.' },
  [CheckoutErrorCode.ROOM_STATE_CONFLICT]: { status: 409, message: 'Room is not in the required state.' },
  [CheckoutErrorCode.FINANCIAL_INTEGRITY_ERROR]: { status: 409, message: 'Financial integrity error.' },
  [CheckoutErrorCode.PAYMENT_ALLOCATION_ERROR]: { status: 409, message: 'Payment allocation error.' },
  [CheckoutErrorCode.INSUFFICIENT_CASH]: { status: 409, message: 'Insufficient cash on hand.' },
  [CheckoutErrorCode.IDEMPOTENCY_CONFLICT]: { status: 409, message: 'Idempotency conflict.' },
  [CheckoutErrorCode.SERVICE_UNAVAILABLE]: { status: 503, message: 'Service temporarily unavailable.' },
};

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;

  constructor(code: CheckoutErrorCode, customMessage?: string) {
    const detail = ERROR_DETAILS[code];
    const message = customMessage || detail.message;
    super(message);
    this.name = 'CheckoutError';
    this.code = code;
    this.httpStatus = detail.status;
    this.userMessage = message;
  }
}

// ==========================================
// Request / Receipt Types
// ==========================================

export const CheckoutExtraChargeInputSchema = ExtraChargeSchema;

export const CheckoutRequestSchema = z.object({
  idempotencyKey: z.string().uuid('Idempotency key must be a valid UUID v4.'),
  bookingId: z.string().min(1).max(100),
  extraCharges: z.array(CheckoutExtraChargeInputSchema).max(50, 'Too many extra charges.').default([]),
  paymentChannel: z.enum(['cash', 'gcash', 'maya', 'card']),
}).strict();

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export type CheckoutAction =
  | { kind: 'settle'; paymentChannel: 'cash' | 'gcash' | 'maya' | 'card'; amountCentavos: number }
  | { kind: 'refund'; refundChannel: 'cash' | 'gcash' | 'maya' | 'card'; amountCentavos: number }
  | { kind: 'no-op' };

export const CheckoutReceiptSchema = z.object({
  bookingId: z.string().min(1).max(128),
  roomId: z.string().min(1).max(128),
  roomDisplayName: z.string().min(1).max(128),
  checkoutStatus: z.literal('CheckedOut'),
  totalRoomCostCentavos: z.number().int().min(0).max(1_000_000_000_000),
  totalExtraChargesCentavos: z.number().int().min(0).max(1_000_000_000_000),
  totalDueCentavos: z.number().int().min(0).max(1_000_000_000_000),
  totalCollectedCentavos: z.number().int().min(0).max(1_000_000_000_000),
  amountMovedNowCentavos: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000),
  paymentChannel: z.string().min(1).max(64),
  action: z.enum(['settle', 'refund', 'no-op']),
  nextRoomState: z.enum(['Available', 'Occupied', 'Cleaning']),
  committedAt: z.string().min(1).max(64),
  moduleId: z.literal(TSEK_IN_MODULE_ID),
}).strict();

export interface CheckoutReceipt extends z.infer<typeof CheckoutReceiptSchema> {}

export interface CheckoutServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

// ==========================================
// Idempotency
// ==========================================

function checkoutIdempotencyDocumentId(tenantId: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${tenantId}:${idempotencyKey}`, 'utf8').digest('hex');
}

// ==========================================
// Fingerprint
// ==========================================

function buildCheckoutFingerprint(input: {
  tenantId: string;
  bookingId: string;
  extraCharges: ExtraCharge[];
  paymentChannel: 'cash' | 'gcash' | 'maya' | 'card';
}): string {
  return computeFingerprint({
    operation: 'tsekInCheckOut',
    tenantId: input.tenantId,
    bookingId: input.bookingId,
    extraCharges: input.extraCharges.map((c) => ({ description: c.description, amountCentavos: c.amountCentavos })),
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
// Internal — authoritative parsers
// ==========================================

function parseStrictBooking(roomIdRaw: unknown, statusRaw: unknown, totalCostRaw: unknown, totalCollectedRaw: unknown, moduleIdRaw: unknown, allocationsRaw: unknown, allocationsVersionRaw: unknown, extraChargesRaw: unknown): {
  roomId: string;
  status: string;
  totalRoomCostCentavos: number;
  totalCollectedCentavos: number;
  paymentAllocations: PaymentAllocation[];
  paymentAllocationsVersion: number;
  extraCharges: ExtraCharge[];
} {
  if (typeof roomIdRaw !== 'string' || roomIdRaw.length === 0 || roomIdRaw.length > 128) {
    throw new CheckoutError(CheckoutErrorCode.FINANCIAL_INTEGRITY_ERROR);
  }
  if (moduleIdRaw !== TSEK_IN_MODULE_ID) {
    throw new CheckoutError(CheckoutErrorCode.BOOKING_NOT_FOUND);
  }
  if (statusRaw !== 'Active') {
    throw new CheckoutError(CheckoutErrorCode.BOOKING_NOT_ACTIVE);
  }
  if (!Number.isSafeInteger(totalCostRaw) || (totalCostRaw as number) < 0 || (totalCostRaw as number) > 1_000_000_000_000) {
    throw new CheckoutError(CheckoutErrorCode.FINANCIAL_INTEGRITY_ERROR);
  }
  if (!Number.isSafeInteger(totalCollectedRaw) || (totalCollectedRaw as number) < 0 || (totalCollectedRaw as number) > 1_000_000_000_000) {
    throw new CheckoutError(CheckoutErrorCode.FINANCIAL_INTEGRITY_ERROR);
  }
  let paymentAllocations: PaymentAllocation[];
  try {
    paymentAllocations = PaymentAllocationsListSchema.parse(allocationsRaw ?? []);
  } catch {
    throw new CheckoutError(CheckoutErrorCode.PAYMENT_ALLOCATION_ERROR);
  }
  if (!Number.isSafeInteger(allocationsVersionRaw) || (allocationsVersionRaw as number) < 0 || (allocationsVersionRaw as number) > PAYMENT_ALLOCATIONS_VERSION) {
    throw new CheckoutError(CheckoutErrorCode.PAYMENT_ALLOCATION_ERROR);
  }
  let extraCharges: ExtraCharge[];
  try {
    const arr = Array.isArray(extraChargesRaw) ? (extraChargesRaw as unknown[]) : [];
    extraCharges = arr.map((c: unknown) => ExtraChargeSchema.parse(c));
  } catch {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }
  if (extraCharges.length > 50) {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }
  return {
    roomId: roomIdRaw,
    status: statusRaw,
    totalRoomCostCentavos: totalCostRaw as number,
    totalCollectedCentavos: totalCollectedRaw as number,
    paymentAllocations,
    paymentAllocationsVersion: allocationsVersionRaw as number,
    extraCharges,
  };
}

function sumAllocations(allocations: PaymentAllocation[]): number {
  let total = BigInt(0);
  for (const a of allocations) {
    total += BigInt(a.amountCentavos);
  }
  const n = Number(total);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1_000_000_000_000) {
    throw new CheckoutError(CheckoutErrorCode.FINANCIAL_INTEGRITY_ERROR);
  }
  return n;
}

// ==========================================
// Service
// ==========================================

export async function tsekInCheckOut(
  idToken: string,
  requestValue: unknown,
  options: CheckoutServiceOptions = {}
): Promise<CheckoutReceipt> {
  const auth = options.adminAuth || getAdminAuth();
  const db = options.adminFirestore || getAdminFirestore();
  const now = options.now || (() => admin.firestore.Timestamp.now());

  // ---- Reuse Phase 1B-1 identity & entitlement helpers (no duplication). ----
  // The check-in service exports verifyTsekInIdentity; we re-implement a
  // scoped variant that also surfaces staffAccountId/sessionVersion via the
  // returned identity, but the heavy lifting (auth, tenant eligibility, staff
  // matching) is shared.
  let identity: VerifiedTsekInIdentity;
  try {
    identity = await verifyTsekInIdentityCompat(idToken, auth, db);
  } catch (e) {
    if (e instanceof CheckoutError) throw e;
    if (e instanceof CheckinError) {
      switch (e.code) {
        case CheckinErrorCode.TENANT_INELIGIBLE:
          throw new CheckoutError(CheckoutErrorCode.TENANT_INELIGIBLE);
        case CheckinErrorCode.UNAUTHENTICATED:
          throw new CheckoutError(CheckoutErrorCode.UNAUTHENTICATED);
        case CheckinErrorCode.FORBIDDEN:
        default:
          throw new CheckoutError(CheckoutErrorCode.FORBIDDEN);
      }
    }
    throw new CheckoutError(CheckoutErrorCode.UNAUTHENTICATED);
  }

  let request: CheckoutRequest;
  try {
    request = CheckoutRequestSchema.parse(requestValue);
  } catch {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }

  try {
    validateIdempotencyKey(request.idempotencyKey);
  } catch {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }

  const { tenantId } = identity;
  const bookingId = request.bookingId;
  const idempotencyKey = request.idempotencyKey;

  const tenantRef = db.collection('tenants').doc(tenantId);
  const bookingRef = db.collection('tenants').doc(tenantId).collection('bookings').doc(bookingId);
  const idempotencyRef = db.collection('tenants').doc(tenantId).collection('tsek_in_checkout_idempotency').doc(checkoutIdempotencyDocumentId(tenantId, idempotencyKey));
  const staffRef = identity.role === 'staff' && identity.staffAccountId
    ? tenantRef.collection('staff_accounts').doc(identity.staffAccountId)
    : null;

  const targetChannel = request.paymentChannel;
  const settlementAccountRef = db.collection('tenants').doc(tenantId).collection('accounts').doc(targetAccountForPaymentChannel(targetChannel).id);

  // Pre-compute the fingerprint outside the transaction because the receipt is
  // payload-identical for any replay of the same business fields.
  const fingerprint = buildCheckoutFingerprint({
    tenantId,
    bookingId,
    extraCharges: request.extraCharges,
    paymentChannel: targetChannel,
  });

  try {
    return await db.runTransaction(async (transaction) => {
      // Room ref is derived inside the transaction (after reading the booking)
      // because we MUST NOT accept a roomId from the browser.
      const [idempotencySnap, tenantSnap, bookingSnap, settlementAccountSnap, staffSnap] = await transaction.getAll(
        idempotencyRef,
        tenantRef,
        bookingRef,
        settlementAccountRef,
        ...(staffRef ? [staffRef] : [])
      );

      // ---- Replay path ----
      if (idempotencySnap.exists) {
        const prior = idempotencySnap.data()!;
        let priorReceipt: CheckoutReceipt;
        try {
          priorReceipt = CheckoutReceiptSchema.parse(prior.receipt);
        } catch {
          throw new CheckoutError(CheckoutErrorCode.IDEMPOTENCY_CONFLICT);
        }
        if (prior.status === 'complete' && prior.fingerprint === fingerprint && prior.tenantId === tenantId) {
          return priorReceipt;
        }
        throw new CheckoutError(CheckoutErrorCode.IDEMPOTENCY_CONFLICT);
      }

      // ---- Mid-flight tenant + staff revalidation ----
      if (!tenantSnap.exists) {
        throw new CheckoutError(CheckoutErrorCode.TENANT_INELIGIBLE);
      }
      const { ownerUid } = assertTenantTsekInEntitlement(tenantSnap.data());
      if (identity.role === 'owner' && ownerUid !== identity.uid) {
        throw new CheckoutError(CheckoutErrorCode.FORBIDDEN);
      }
      if (identity.role === 'staff') {
        if (!staffSnap || !staffSnap.exists) {
          throw new CheckoutError(CheckoutErrorCode.FORBIDDEN);
        }
        assertStaffMatches(staffSnap.data(), identity.tenantId, identity.uid, identity.sessionVersion);
      }

      // ---- Booking ----
      if (!bookingSnap.exists) {
        throw new CheckoutError(CheckoutErrorCode.BOOKING_NOT_FOUND);
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
        bookingData.extraCharges
      );
      const roomId = parsedBooking.roomId;
      const roomRef = db.collection('tenants').doc(tenantId).collection('rooms').doc(roomId);

      // ---- Read the derived room + refund accounts (still before writes) ----
      // We need the refund destination accounts to know the cash position for
      // an INSUFFICIENT_CASH check. Read all accounts that could potentially be
      // touched by a refund allocation.
      const accountRefs: admin.firestore.DocumentReference[] = [roomRef, settlementAccountRef];
      // Add the three "could be a refund channel" account refs so we can check
      // balances for cash refunds. These reads are necessary because we need
      // to detect overpayment refunds that route back to cash and verify the
      // physical-cash register can absorb the deduction.
      accountRefs.push(db.collection('tenants').doc(tenantId).collection('accounts').doc('master-cash'));
      // The other three settlement accounts may also be touched.
      for (const id of ['gcash-settlement', 'maya-settlement', 'card-clearing']) {
        if (id !== targetAccountForPaymentChannel(targetChannel).id) {
          accountRefs.push(db.collection('tenants').doc(tenantId).collection('accounts').doc(id));
        }
      }
      const accountSnaps = await transaction.getAll(...accountRefs);
      const roomSnap = accountSnaps[0];
      const settlementAccountSnap2 = accountSnaps[1];
      const masterCashSnap = accountSnaps[2];
      // accountSnaps[3..] are the other external accounts; index them by id.
      const externalAccountSnaps: Record<string, admin.firestore.DocumentSnapshot> = {};
      for (let i = 3; i < accountSnaps.length; i++) {
        const snap = accountSnaps[i];
        // path: tenants/{tid}/accounts/{id}
        const parts = snap.ref.path.split('/');
        externalAccountSnaps[parts[parts.length - 1]] = snap;
      }

      // ---- Room ----
      if (!roomSnap.exists || roomSnap.data()!.deletedAt) {
        throw new CheckoutError(CheckoutErrorCode.ROOM_NOT_FOUND);
      }
      const roomData = roomSnap.data()!;
      if (roomData.status !== 'Occupied') {
        throw new CheckoutError(CheckoutErrorCode.ROOM_STATE_CONFLICT);
      }
      if (typeof roomData.roomNumber !== 'string' || roomData.roomNumber.length === 0) {
        throw new CheckoutError(CheckoutErrorCode.ROOM_STATE_CONFLICT);
      }
      // Booking/room relationship must match.
      if (typeof roomData.id === 'string' && roomData.id !== roomId) {
        throw new CheckoutError(CheckoutErrorCode.ROOM_STATE_CONFLICT);
      }

      // ---- Authoritative balance from stored values only ----
      const totalRoomCostCentavos = parsedBooking.totalRoomCostCentavos;
      const storedAllocations = parsedBooking.paymentAllocations;
      const sumOfStoredAllocations = sumAllocations(storedAllocations);
      const storedTotalCollected = parsedBooking.totalCollectedCentavos;
      if (storedTotalCollected !== sumOfStoredAllocations) {
        // The booking's totalCollected must equal the sum of its allocations.
        throw new CheckoutError(CheckoutErrorCode.FINANCIAL_INTEGRITY_ERROR);
      }

      // Use the pure-domain engine to compute balance. The engine treats
      // extraCharges as validated inputs; we already validated them at the
      // request boundary. We pass the stored allocations as the "collected"
      // history (engine requires ≥1 payment; we already enforce non-zero via
      // storedTotalCollected when zero).
      const extraChargesForEngine = request.extraCharges;
      let totalExtraChargesCentavos = 0;
      for (const c of extraChargesForEngine) totalExtraChargesCentavos += c.amountCentavos;

      let totalDueCentavos: number;
      let totalPreviouslyCollectedCentavos: number;
      let balanceCentavos: number;
      let isRefund: boolean;
      let refundAllocations: PaymentAllocation[];
      try {
        // The engine requires at least one payment record; if no payments
        // were collected at check-in, use a zero-centavos record on the
        // requested payment channel for the engine computation (it will be
        // removed from the bookkeeping when storedTotalCollected === 0).
        const enginePayments = storedAllocations.length > 0
          ? storedAllocations.map((a) => ({ channel: a.channel, amountCentavos: a.amountCentavos }))
          : [{ channel: targetChannel, amountCentavos: 0 }];
        const engineResult = TsekInEngine.computeCheckoutBalance(
          totalRoomCostCentavos,
          extraChargesForEngine,
          enginePayments
        );
        totalDueCentavos = engineResult.totalDueCentavos;
        totalPreviouslyCollectedCentavos = engineResult.totalCollectedCentavos;
        balanceCentavos = engineResult.balanceCentavos;
        isRefund = engineResult.isRefund;
        refundAllocations = engineResult.refundAllocations;
        // Defense-in-depth: engine total must agree with stored total.
        if (totalPreviouslyCollectedCentavos !== storedTotalCollected) {
          throw new CheckoutError(CheckoutErrorCode.FINANCIAL_INTEGRITY_ERROR);
        }
      } catch (e) {
        if (e instanceof CheckoutError) throw e;
        if (e instanceof TsekInError) {
          // The engine throws PAYMENT_ALLOCATION_ERROR when a refund cannot be
          // deterministically allocated (e.g. mixed-channel overpayment).
          // Surface it with the same code so callers can distinguish from
          // genuine financial integrity issues.
          if (e.code === TsekInErrorCode.PAYMENT_ALLOCATION_ERROR) {
            throw new CheckoutError(CheckoutErrorCode.PAYMENT_ALLOCATION_ERROR);
          }
          throw new CheckoutError(CheckoutErrorCode.FINANCIAL_INTEGRITY_ERROR);
        }
        throw e;
      }

      // ---- Derive the checkout action ----
      let action: CheckoutAction;
      let amountMovedNowCentavos = 0;
      if (!isRefund && balanceCentavos === 0) {
        action = { kind: 'no-op' };
      } else if (!isRefund && balanceCentavos > 0) {
        action = { kind: 'settle', paymentChannel: targetChannel, amountCentavos: balanceCentavos };
        amountMovedNowCentavos = balanceCentavos;
      } else {
        // Refund case. Derive refund allocation deterministically from stored
        // allocations using the Phase 1A engine. Mixed-channel refunds fail
        // closed unless the engine finds an explicit single-channel path.
        if (refundAllocations.length === 0) {
          throw new CheckoutError(CheckoutErrorCode.PAYMENT_ALLOCATION_ERROR);
        }
        const cashAllocations = refundAllocations.filter((a) => a.affectsCash);
        const externalAllocations = refundAllocations.filter((a) => !a.affectsCash);
        if (cashAllocations.length > 0 && externalAllocations.length > 0) {
          throw new CheckoutError(CheckoutErrorCode.PAYMENT_ALLOCATION_ERROR);
        }
        // Determine which channel the refund flows to. If only one channel
        // was ever used, route to it. Otherwise fail closed.
        if (cashAllocations.length === 1) {
          action = { kind: 'refund', refundChannel: 'cash', amountCentavos: cashAllocations[0].amountCentavos };
          amountMovedNowCentavos = -cashAllocations[0].amountCentavos;
          // Cash refund must not make physical cash negative.
          const currentCash = typeof masterCashSnap.data()?.balance === 'number' ? masterCashSnap.data()!.balance as number : 0;
          if (currentCash - cashAllocations[0].amountCentavos < 0) {
            throw new CheckoutError(CheckoutErrorCode.INSUFFICIENT_CASH);
          }
        } else if (externalAllocations.length === 1) {
          const refundChannel = externalAllocations[0].channel;
          action = { kind: 'refund', refundChannel, amountCentavos: externalAllocations[0].amountCentavos };
          amountMovedNowCentavos = -externalAllocations[0].amountCentavos;
        } else if (refundAllocations.length === 1) {
          // Single allocation; engine already validated single-channel.
          const a = refundAllocations[0];
          action = { kind: 'refund', refundChannel: a.channel, amountCentavos: a.amountCentavos };
          amountMovedNowCentavos = -a.amountCentavos;
          if (a.affectsCash) {
            const currentCash = typeof masterCashSnap.data()?.balance === 'number' ? masterCashSnap.data()!.balance as number : 0;
            if (currentCash - a.amountCentavos < 0) {
              throw new CheckoutError(CheckoutErrorCode.INSUFFICIENT_CASH);
            }
          }
        } else {
          throw new CheckoutError(CheckoutErrorCode.PAYMENT_ALLOCATION_ERROR);
        }
      }

      // ---- All reads done. Build receipt + writes. ----
      const committedAt = now();
      const nextRoomState = TsekInEngine.transitionRoom('Occupied', 'checkOut');

      const newLedgerRef = db.collection('tenants').doc(tenantId).collection('transactions').doc();
      const newAuditRef = db.collection('tenants').doc(tenantId).collection('tsek_in_audit').doc();

      // Persist normalized extra-charge breakdown (preserving any prior
      // charges, which are not supported by this version so always empty).
      const normalizedExtraCharges = extraChargesForEngine;

      // Compute the new totalCollectedCentavos after the settlement/refund.
      const newTotalCollectedCentavos = isRefund
        ? totalPreviouslyCollectedCentavos - balanceCentavos
        : totalPreviouslyCollectedCentavos + (action.kind === 'settle' ? balanceCentavos : 0);

      // ---- Writes ----
      transaction.update(roomRef, { status: nextRoomState, updatedAt: committedAt });

      transaction.update(bookingRef, {
        status: 'CheckedOut',
        extraCharges: normalizedExtraCharges,
        totalDueCentavos,
        totalCollectedCentavos: newTotalCollectedCentavos,
        settledAt: committedAt,
        settledChannel: action.kind === 'no-op' ? null : (action.kind === 'settle' ? action.paymentChannel : action.refundChannel),
        checkoutAction: action.kind,
        checkedOutAt: committedAt,
        checkedOutBy: identity.actorId,
      });

      if (action.kind === 'settle') {
        const acctSnap = settlementAccountSnap2;
        if (!acctSnap.exists) {
          transaction.set(settlementAccountRef, {
            id: targetAccountForPaymentChannel(targetChannel).id,
            tenantId,
            name: targetAccountForPaymentChannel(targetChannel).name,
            type: 'asset',
            balance: admin.firestore.FieldValue.increment(action.amountCentavos),
            isActive: true,
            createdAt: committedAt,
            updatedAt: committedAt,
          });
        } else {
          transaction.update(settlementAccountRef, {
            balance: admin.firestore.FieldValue.increment(action.amountCentavos),
            updatedAt: committedAt,
          });
        }
        transaction.set(newLedgerRef, {
          id: newLedgerRef.id,
          tenantId,
          moduleId: TSEK_IN_MODULE_ID,
          bookingId,
          referenceId: bookingId,
          paymentChannel: action.paymentChannel,
          amountCentavos: action.amountCentavos,
          type: 'income',
          category: 'Check-Out Settlement',
          description: `Check-out settlement for booking ${bookingId}`,
          status: 'completed',
          date: committedAt,
          createdAt: committedAt,
          actorId: identity.actorId,
        });
        transaction.set(newAuditRef, {
          id: newAuditRef.id,
          tenantId,
          moduleId: TSEK_IN_MODULE_ID,
          bookingId,
          action: 'settle',
          amountCentavos: action.amountCentavos,
          paymentChannel: action.paymentChannel,
          actorId: identity.actorId,
          committedAt,
          createdAt: committedAt,
        });
      } else if (action.kind === 'refund') {
        const refundAccountId = targetAccountForPaymentChannel(action.refundChannel).id;
        const refundAccountRef = db.collection('tenants').doc(tenantId).collection('accounts').doc(refundAccountId);
        // The refund account was either settlementAccountRef (same as the
        // channel used to settle) or one of the other three settlement
        // accounts we pre-read.
        const preRead = action.refundChannel === targetChannel
          ? settlementAccountSnap2
          : externalAccountSnaps[refundAccountId];
        if (!preRead || !preRead.exists) {
          // Refund account must already exist (we never auto-create refund sinks).
          throw new CheckoutError(CheckoutErrorCode.PAYMENT_ALLOCATION_ERROR);
        }
        transaction.update(refundAccountRef, {
          balance: admin.firestore.FieldValue.increment(-action.amountCentavos),
          updatedAt: committedAt,
        });
        transaction.set(newLedgerRef, {
          id: newLedgerRef.id,
          tenantId,
          moduleId: TSEK_IN_MODULE_ID,
          bookingId,
          referenceId: bookingId,
          paymentChannel: action.refundChannel,
          amountCentavos: action.amountCentavos,
          type: 'refund',
          category: 'Check-Out Refund',
          description: `Check-out refund for booking ${bookingId}`,
          status: 'completed',
          date: committedAt,
          createdAt: committedAt,
          actorId: identity.actorId,
        });
        transaction.set(newAuditRef, {
          id: newAuditRef.id,
          tenantId,
          moduleId: TSEK_IN_MODULE_ID,
          bookingId,
          action: 'refund',
          amountCentavos: action.amountCentavos,
          paymentChannel: action.refundChannel,
          actorId: identity.actorId,
          committedAt,
          createdAt: committedAt,
        });
      } else {
        // no-op: zero-balance checkout. No ledger entry. Optionally persist
        // a zero-amount audit for traceability.
        transaction.set(newAuditRef, {
          id: newAuditRef.id,
          tenantId,
          moduleId: TSEK_IN_MODULE_ID,
          bookingId,
          action: 'no-op',
          amountCentavos: 0,
          paymentChannel: null,
          actorId: identity.actorId,
          committedAt,
          createdAt: committedAt,
        });
      }

      const receipt: CheckoutReceipt = {
        bookingId,
        roomId,
        roomDisplayName: roomData.roomNumber,
        checkoutStatus: 'CheckedOut',
        totalRoomCostCentavos,
        totalExtraChargesCentavos,
        totalDueCentavos,
        totalCollectedCentavos: newTotalCollectedCentavos,
        amountMovedNowCentavos,
        paymentChannel: action.kind === 'settle' ? action.paymentChannel
          : action.kind === 'refund' ? action.refundChannel
          : 'none',
        action: action.kind,
        nextRoomState,
        committedAt: committedAt.toDate().toISOString(),
        moduleId: TSEK_IN_MODULE_ID,
      };

      const validatedReceipt = CheckoutReceiptSchema.parse(receipt);

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
    if (error instanceof CheckoutError) {
      throw error;
    }
    if (error instanceof TsekInError) {
      throw new CheckoutError(CheckoutErrorCode.FINANCIAL_INTEGRITY_ERROR);
    }
    if (error instanceof z.ZodError) {
      throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
    }
    throw new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE);
  }
}

// ==========================================
// Thin compatibility shim: re-run the Phase 1B-1 identity flow but capture the
// fields the checkout service needs without re-implementing the helpers. This
// keeps the check-in helpers as the single source of truth.
// ==========================================

async function verifyTsekInIdentityCompat(
  idToken: string,
  auth: admin.auth.Auth,
  firestore: admin.firestore.Firestore
): Promise<VerifiedTsekInIdentity> {
  // We import the check-in service's exported function dynamically here is
  // not possible because we're already in the same module graph. Use the
  // shared helpers directly.
  const { verifyTsekInIdentity } = await import('./tsek-in-checkin-service');
  return verifyTsekInIdentity(idToken, auth, firestore);
}

export function sanitizedCheckoutResponse(error: CheckoutError): Response {
  return Response.json({ error: error.userMessage, code: error.code }, { status: error.httpStatus });
}