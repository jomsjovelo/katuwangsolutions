import { z } from 'zod';
import crypto from 'node:crypto';

// ==========================================
// Stable Domain Error Codes
// ==========================================

export enum TsekInErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  INVALID_DURATION = 'INVALID_DURATION',
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  FINANCIAL_OVERFLOW = 'FINANCIAL_OVERFLOW',
  PAYMENT_ALLOCATION_ERROR = 'PAYMENT_ALLOCATION_ERROR',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
}

export class TsekInError extends Error {
  constructor(
    public readonly code: TsekInErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TsekInError';
  }
}

// ==========================================
// Constants & Bounds
// ==========================================

export const MAX_SAFE_CENTAVOS = 1_000_000_000_000;
export const MAX_NIGHTS = 365;
export const MAX_SHORT_HOURS = 12;
export const MAX_EXTRA_PAX = 20;
export const MAX_EXTRA_CHARGES = 50;
export const MAX_GUEST_NAME_LENGTH = 100;
export const MAX_CONTACT_INFO_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 200;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export const ROOM_STATES = ['Available', 'Occupied', 'Cleaning'] as const;
export const BOOKING_STATES = ['Active', 'CheckedOut'] as const;
export const PAYMENT_CHANNELS = ['cash', 'gcash', 'maya', 'card'] as const;
export const STAY_TYPES = ['night', 'short'] as const;
export const SHORT_TIME_DURATIONS = [3, 6, 8, 12] as const;

export type RoomState = typeof ROOM_STATES[number];
export type BookingState = typeof BOOKING_STATES[number];
export type PaymentChannel = typeof PAYMENT_CHANNELS[number];
export type StayType = typeof STAY_TYPES[number];
export type ShortTimeDuration = typeof SHORT_TIME_DURATIONS[number];

// ==========================================
// Primitive Validators
// ==========================================

export const SafeCentavosSchema = z.number()
  .int('Centavos must be an integer.')
  .min(0, 'Centavos must be non-negative.')
  .max(MAX_SAFE_CENTAVOS, 'Centavos exceeds safe financial limits.');

export const SafeNonNegativeIntSchema = z.number()
  .int('Must be an integer.')
  .min(0, 'Must be non-negative.')
  .max(Number.MAX_SAFE_INTEGER, 'Exceeds safe integer precision.');

function createStrictStringSchema(maxLength: number) {
  return z.string()
    .min(1, 'String is required.')
    .max(maxLength, `String too long. Max is ${maxLength}.`)
    .trim()
    .refine((s) => s.length > 0, 'String cannot be whitespace only.')
    .refine((s) => !/[\x00-\x1F\x7F]/.test(s), 'Control characters are not allowed.');
}

export const NonEmptyStringSchema = createStrictStringSchema(Number.MAX_SAFE_INTEGER);

const IdempotencyKeySchema = z.string()
  .min(1, 'Idempotency key is required.')
  .max(MAX_IDEMPOTENCY_KEY_LENGTH, 'Idempotency key too long.')
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Idempotency key must be a valid UUID v4.')
  .refine((s) => !/[\x00-\x1F\x7F]/.test(s), 'Control characters are not allowed.');

const PaymentChannelSchema = z.enum(PAYMENT_CHANNELS);
const StayTypeSchema = z.enum(STAY_TYPES);

// ==========================================
// Domain Schemas
// ==========================================

export const RoomRateSnapshotSchema = z.object({
  rateCentavos: SafeCentavosSchema,
  shortTimeRatesCentavos: z.object({
    '3h': SafeCentavosSchema.optional(),
    '6h': SafeCentavosSchema.optional(),
    '8h': SafeCentavosSchema.optional(),
    '12h': SafeCentavosSchema.optional(),
  }).optional(),
  extraPaxFeeCentavos: SafeCentavosSchema.optional(),
}).strict();

export type RoomRateSnapshot = z.infer<typeof RoomRateSnapshotSchema>;

export const BookingSnapshotSchema = z.object({
  rateCentavos: SafeCentavosSchema,
  nights: SafeNonNegativeIntSchema.max(MAX_NIGHTS, `Nights cannot exceed ${MAX_NIGHTS}.`),
  extraPax: SafeNonNegativeIntSchema.max(MAX_EXTRA_PAX, `Extra pax cannot exceed ${MAX_EXTRA_PAX}.`),
  extraPaxCostCentavos: SafeCentavosSchema,
  totalRoomCostCentavos: SafeCentavosSchema,
}).strict();

export type BookingSnapshot = z.infer<typeof BookingSnapshotSchema>;

export const PaymentRecordSchema = z.object({
  channel: PaymentChannelSchema,
  amountCentavos: SafeCentavosSchema,
}).strict();

export type PaymentRecord = z.infer<typeof PaymentRecordSchema>;

// Authoritative payment-allocation shape persisted on booking documents by
// Phase 1B-1 and consumed by Phase 1B-2 (checkout). `paymentAllocations` is the
// list of {channel, amountCentavos, routedTo, affectsCash} entries recorded when
// money was collected at check-in time. `totalCollectedCentavos` is the BigInt-safe
// sum of those allocations and is the authoritative prior balance used by the
// checkout service. `paymentAllocationsVersion` lets the checkout service detect
// legacy bookings without allocations and fail closed safely.
export const PAYMENT_ALLOCATIONS_VERSION = 1 as const;

export const PaymentAllocationSchema = z.object({
  channel: PaymentChannelSchema,
  amountCentavos: SafeCentavosSchema,
  routedTo: z.string().min(1).max(64),
  affectsCash: z.boolean(),
}).strict();

export const PaymentAllocationsListSchema = z.array(PaymentAllocationSchema).max(50);

export type PaymentAllocation = z.infer<typeof PaymentAllocationSchema>;
export type PaymentAllocationsList = z.infer<typeof PaymentAllocationsListSchema>;

export const ExtraChargeSchema = z.object({
  description: createStrictStringSchema(MAX_DESCRIPTION_LENGTH),
  amountCentavos: SafeCentavosSchema,
}).strict();

export type ExtraCharge = z.infer<typeof ExtraChargeSchema>;

// ==========================================
// Operation Parameter Schemas
// ==========================================

const NightDurationSchema = z.number().int().positive().max(MAX_NIGHTS, `Night duration cannot exceed ${MAX_NIGHTS}.`);
const ShortDurationSchema = z.number().int().positive().refine((n) => SHORT_TIME_DURATIONS.includes(n as ShortTimeDuration), `Short-time duration must be exactly 3, 6, 8, or 12.`);

const NightStaySchema = z.object({
  type: z.literal('night'),
  duration: NightDurationSchema,
});

const ShortStaySchema = z.object({
  type: z.literal('short'),
  duration: ShortDurationSchema,
});

export const StaySchema = z.discriminatedUnion('type', [NightStaySchema, ShortStaySchema]);

export type StayInput = z.infer<typeof StaySchema>;

export const CheckInParamsSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  roomId: createStrictStringSchema(100),
  guestName: createStrictStringSchema(MAX_GUEST_NAME_LENGTH),
  contactInfo: createStrictStringSchema(MAX_CONTACT_INFO_LENGTH),
  stayType: StayTypeSchema,
  duration: NightDurationSchema.or(ShortDurationSchema),
  extraPax: SafeNonNegativeIntSchema.max(MAX_EXTRA_PAX, `Extra pax cannot exceed ${MAX_EXTRA_PAX}.`),
  roomRateSnapshot: RoomRateSnapshotSchema,
  paymentMethod: PaymentChannelSchema,
  initialPaymentCentavos: SafeCentavosSchema,
  checkedInAt: z.coerce.date().refine((d) => Number.isFinite(d.getTime()), 'Invalid finite date.'),
}).strict();

export type CheckInParams = z.infer<typeof CheckInParamsSchema>;

export const CheckOutParamsSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  bookingId: createStrictStringSchema(100),
  roomId: createStrictStringSchema(100),
  extraCharges: z.array(ExtraChargeSchema).max(MAX_EXTRA_CHARGES, 'Too many extra charges.'),
  finalPaymentCentavos: z.number()
    .int('Final payment must be an integer.')
    .min(-MAX_SAFE_CENTAVOS, 'Refund exceeds safe bounds.')
    .max(MAX_SAFE_CENTAVOS, 'Final payment exceeds safe bounds.'),
  paymentMethod: PaymentChannelSchema,
  payments: z.array(PaymentRecordSchema).min(1, 'At least one payment record is required for checkout.'),
  checkedOutAt: z.coerce.date().refine((d) => Number.isFinite(d.getTime()), 'Invalid finite date.'),
}).strict();

export type CheckOutParams = z.infer<typeof CheckOutParamsSchema>;

export const RoomReadyParamsSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  roomId: createStrictStringSchema(100),
}).strict();

export type RoomReadyParams = z.infer<typeof RoomReadyParamsSchema>;

export const ExtendStayParamsSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  bookingSnapshot: BookingSnapshotSchema,
  roomRateSnapshot: RoomRateSnapshotSchema,
  additionalNightsOrHours: NightDurationSchema.or(ShortDurationSchema),
  stayType: StayTypeSchema,
  newExpectedCheckOutDate: z.coerce.date().refine((d) => Number.isFinite(d.getTime()), 'Invalid finite date.'),
}).strict();

export type ExtendStayParams = z.infer<typeof ExtendStayParamsSchema>;

// ==========================================
// Engine Result Types
// ==========================================

export interface CheckInResult {
  nextRoomState: RoomState;
  bookingState: BookingState;
  quoteCentavos: number;
  bookingId: string;
  fingerprint: string;
}

export interface CheckOutResult {
  nextRoomState: RoomState;
  bookingState: BookingState;
  balanceCentavos: number;
  fingerprint: string;
}

export interface RoomReadyResult {
  nextRoomState: RoomState;
  fingerprint: string;
}

export interface ExtensionCostResult {
  additionalCostCentavos: number;
  newTotalRoomCostCentavos: number;
  fingerprint: string;
}

export interface CheckoutBalanceResult {
  totalRoomCostCentavos: number;
  totalExtraChargesCentavos: number;
  totalDueCentavos: number;
  totalCollectedCentavos: number;
  balanceCentavos: number;
  isRefund: boolean;
  refundAllocations: PaymentAllocation[];
  fingerprint: string;
}

export interface PaymentRouteResult {
  affectsCash: boolean;
  routedTo: string;
}

// ==========================================
// Pure Domain Engine
// ==========================================

export class TsekInEngine {
  // -------------------------------------------------------
  // Room State Transitions
  // -------------------------------------------------------

  static transitionRoom(currentState: RoomState, action: 'checkIn' | 'checkOut' | 'roomReady'): RoomState {
    const state = ROOM_STATES.includes(currentState) ? currentState : null;
    if (!state) {
      throw new TsekInError(TsekInErrorCode.INVALID_INPUT, `Invalid room state: ${currentState}`);
    }

    const validActions: Record<RoomState, string[]> = {
      Available: ['checkIn'],
      Occupied: ['checkOut'],
      Cleaning: ['roomReady'],
    };

    if (!validActions[state].includes(action)) {
      throw new TsekInError(
        TsekInErrorCode.INVALID_STATE_TRANSITION,
        `Invalid room state transition: ${state} → ${action}. ` +
        `Allowed: Available→Occupied (checkIn), Occupied→Cleaning (checkOut), Cleaning→Available (roomReady).`
      );
    }

    const nextStates: Record<RoomState, RoomState> = {
      Available: 'Occupied',
      Occupied: 'Cleaning',
      Cleaning: 'Available',
    };

    return nextStates[state];
  }

  // -------------------------------------------------------
  // Authoritative Calculations
  // -------------------------------------------------------

  static computeCheckInQuote(
    roomRateSnapshot: RoomRateSnapshot,
    stayType: StayType,
    duration: number,
    extraPax: number,
    idempotencyKey?: string
  ): { quoteCentavos: number; fingerprint: string } {
    const validatedSnapshot = RoomRateSnapshotSchema.parse(roomRateSnapshot);

    if (!Number.isSafeInteger(duration) || duration <= 0) {
      throw new TsekInError(TsekInErrorCode.INVALID_DURATION, `Invalid duration: ${duration}. Must be a positive integer.`);
    }

    if (stayType === 'night') {
      if (duration > MAX_NIGHTS) {
        throw new TsekInError(TsekInErrorCode.INVALID_DURATION, `Night duration ${duration} exceeds ${MAX_NIGHTS}.`);
      }
    } else if (stayType === 'short') {
      if (!SHORT_TIME_DURATIONS.includes(duration as ShortTimeDuration)) {
        throw new TsekInError(TsekInErrorCode.INVALID_DURATION, `Short-time duration must be exactly 3, 6, 8, or 12.`);
      }
    } else {
      throw new TsekInError(TsekInErrorCode.INVALID_INPUT, `Invalid stay type: ${stayType}`);
    }

    if (!Number.isSafeInteger(extraPax) || extraPax < 0 || extraPax > MAX_EXTRA_PAX) {
      throw new TsekInError(TsekInErrorCode.INVALID_INPUT, `Extra pax ${extraPax} is out of bounds [0, ${MAX_EXTRA_PAX}].`);
    }

    if (idempotencyKey !== undefined) {
      validateIdempotencyKey(idempotencyKey);
    }

    let quoteCentavos: number;
    if (stayType === 'night') {
      quoteCentavos = this._computeNightQuote(validatedSnapshot, duration, extraPax);
    } else {
      quoteCentavos = this._computeShortQuote(validatedSnapshot, duration, extraPax);
    }

    const fingerprint = computeFingerprint({
      operation: 'checkInQuote',
      roomRateSnapshot: validatedSnapshot,
      stayType,
      duration,
      extraPax,
      idempotencyKey: idempotencyKey || '',
    });

    return { quoteCentavos, fingerprint };
  }

  static computeExtensionCost(
    bookingSnapshot: BookingSnapshot,
    roomRateSnapshot: RoomRateSnapshot,
    additionalNightsOrHours: number,
    stayType: StayType,
    currentExpectedCheckOutDate?: Date,
    newExpectedCheckOutDate?: Date,
    idempotencyKey?: string
  ): ExtensionCostResult & { fingerprint: string } {
    const validatedBooking = BookingSnapshotSchema.parse(bookingSnapshot);
    const validatedRate = RoomRateSnapshotSchema.parse(roomRateSnapshot);

    if (!Number.isSafeInteger(additionalNightsOrHours) || additionalNightsOrHours <= 0) {
      throw new TsekInError(TsekInErrorCode.INVALID_DURATION, `Extension duration must be a positive integer.`);
    }

    if (stayType === 'night') {
      if (additionalNightsOrHours > MAX_NIGHTS) {
        throw new TsekInError(TsekInErrorCode.INVALID_DURATION, `Extension nights ${additionalNightsOrHours} exceeds ${MAX_NIGHTS}.`);
      }
    } else if (stayType === 'short') {
      if (!SHORT_TIME_DURATIONS.includes(additionalNightsOrHours as ShortTimeDuration)) {
        throw new TsekInError(TsekInErrorCode.INVALID_DURATION, `Extension short-time duration must be exactly 3, 6, 8, or 12.`);
      }
    } else {
      throw new TsekInError(TsekInErrorCode.INVALID_INPUT, `Invalid stay type: ${stayType}`);
    }

    if (
      currentExpectedCheckOutDate !== undefined &&
      newExpectedCheckOutDate !== undefined &&
      !Number.isFinite(currentExpectedCheckOutDate.getTime()) &&
      !Number.isFinite(newExpectedCheckOutDate.getTime())
    ) {
      throw new TsekInError(TsekInErrorCode.INVALID_DATE_RANGE, 'Extension dates must be valid finite dates.');
    }

    if (
      currentExpectedCheckOutDate !== undefined &&
      newExpectedCheckOutDate !== undefined &&
      newExpectedCheckOutDate <= currentExpectedCheckOutDate
    ) {
      throw new TsekInError(
        TsekInErrorCode.INVALID_DATE_RANGE,
        `New expected checkout (${newExpectedCheckOutDate.toISOString()}) must be after current expected checkout (${currentExpectedCheckOutDate.toISOString()}).`
      );
    }

    if (idempotencyKey !== undefined) {
      validateIdempotencyKey(idempotencyKey);
    }

    let additionalCostCentavos: number;
    if (stayType === 'night') {
      additionalCostCentavos = this._bigIntToNumber(
        BigInt(validatedRate.rateCentavos) * BigInt(additionalNightsOrHours)
      );
    } else {
      const rates = validatedRate.shortTimeRatesCentavos;
      if (!rates) {
        throw new TsekInError(TsekInErrorCode.INVALID_INPUT, 'Short-time rates are required for short-time extensions.');
      }
      const key = `${additionalNightsOrHours}h`;
      if (rates[key as keyof typeof rates] === undefined) {
        throw new TsekInError(TsekInErrorCode.INVALID_INPUT, `No short-time rate defined for ${additionalNightsOrHours}h extension.`);
      }
      additionalCostCentavos = rates[key as keyof typeof rates]!;
    }

    const newTotal = this.safeAdd(validatedBooking.totalRoomCostCentavos, additionalCostCentavos);

    const fingerprint = computeFingerprint({
      operation: 'extensionCost',
      bookingSnapshot: validatedBooking,
      roomRateSnapshot: validatedRate,
      additionalNightsOrHours,
      stayType,
      currentExpectedCheckOutDate: currentExpectedCheckOutDate?.toISOString() || '',
      newExpectedCheckOutDate: newExpectedCheckOutDate?.toISOString() || '',
      idempotencyKey: idempotencyKey || '',
    });

    return {
      additionalCostCentavos,
      newTotalRoomCostCentavos: newTotal,
      fingerprint,
    };
  }

  static computeCheckoutBalance(
    totalRoomCostCentavos: number,
    extraCharges: readonly ExtraCharge[],
    collectedPayments: readonly PaymentRecord[],
    idempotencyKey?: string
  ): CheckoutBalanceResult {
    if (!Number.isSafeInteger(totalRoomCostCentavos) || totalRoomCostCentavos < 0 || totalRoomCostCentavos > MAX_SAFE_CENTAVOS) {
      throw new TsekInError(TsekInErrorCode.INVALID_INPUT, `Total room cost ${totalRoomCostCentavos} is out of bounds.`);
    }

    if (extraCharges.length > MAX_EXTRA_CHARGES) {
      throw new TsekInError(TsekInErrorCode.INVALID_INPUT, `Too many extra charges: ${extraCharges.length}. Max is ${MAX_EXTRA_CHARGES}.`);
    }

    const validatedCharges: ExtraCharge[] = [];
    for (const charge of extraCharges) {
      validatedCharges.push(ExtraChargeSchema.parse(charge));
    }

    let totalExtra = BigInt(0);
    for (const charge of validatedCharges) {
      totalExtra += BigInt(charge.amountCentavos);
    }
    const totalExtraNumber = Number(totalExtra);
    if (totalExtraNumber > MAX_SAFE_CENTAVOS) {
      throw new TsekInError(TsekInErrorCode.FINANCIAL_OVERFLOW, 'Total extra charges exceed safe financial bounds.');
    }

    const totalDue = this.safeAdd(totalRoomCostCentavos, totalExtraNumber);

    const validatedPayments: PaymentRecord[] = [];
    for (const payment of collectedPayments) {
      validatedPayments.push(PaymentRecordSchema.parse(payment));
    }

    if (validatedPayments.length === 0) {
      throw new TsekInError(TsekInErrorCode.PAYMENT_ALLOCATION_ERROR, 'At least one payment record is required.');
    }

    let totalCollected = BigInt(0);
    for (const payment of validatedPayments) {
      totalCollected += BigInt(payment.amountCentavos);
    }
    const totalCollectedNumber = Number(totalCollected);
    if (totalCollectedNumber > MAX_SAFE_CENTAVOS) {
      throw new TsekInError(TsekInErrorCode.FINANCIAL_OVERFLOW, 'Total collected payments exceed safe financial bounds.');
    }

    const rawBalance = totalDue - totalCollectedNumber;
    const isRefund = rawBalance < 0;
    const balanceCentavos = Math.abs(rawBalance);

    const refundAllocations = this.allocateRefund(validatedPayments, balanceCentavos, isRefund);

    if (idempotencyKey !== undefined) {
      validateIdempotencyKey(idempotencyKey);
    }

    const fingerprint = computeFingerprint({
      operation: 'checkoutBalance',
      totalRoomCostCentavos,
      extraCharges: validatedCharges,
      collectedPayments: validatedPayments,
      idempotencyKey: idempotencyKey || '',
    });

    return {
      totalRoomCostCentavos,
      totalExtraChargesCentavos: totalExtraNumber,
      totalDueCentavos: totalDue,
      totalCollectedCentavos: totalCollectedNumber,
      balanceCentavos,
      isRefund,
      refundAllocations,
      fingerprint,
    };
  }

  // -------------------------------------------------------
  // Payment Routing
  // -------------------------------------------------------

  static routePayment(channel: PaymentChannel, amountCentavos: number): PaymentRouteResult {
    PaymentChannelSchema.parse(channel);
    SafeCentavosSchema.parse(amountCentavos);
    switch (channel) {
      case 'cash':
        return { affectsCash: true, routedTo: 'physical-cash' };
      case 'gcash':
      case 'maya':
      case 'card':
        return { affectsCash: false, routedTo: channel };
    }
  }

  static routeRefund(
    originalChannel: PaymentChannel,
    amountCentavos: number,
    allocations?: PaymentAllocation[]
  ): PaymentRouteResult {
    PaymentChannelSchema.parse(originalChannel);
    SafeCentavosSchema.parse(amountCentavos);

    if (allocations && allocations.length > 0) {
      const cashAllocations = allocations.filter((a) => a.affectsCash);
      const externalAllocations = allocations.filter((a) => !a.affectsCash);

      if (cashAllocations.length > 0 && externalAllocations.length > 0) {
        throw new TsekInError(
          TsekInErrorCode.PAYMENT_ALLOCATION_ERROR,
          'Mixed-channel refunds must be explicitly allocated. Cannot silently convert external refunds to cash.'
        );
      }

      if (externalAllocations.length > 0) {
        const totalExternal = externalAllocations.reduce((sum, a) => sum + a.amountCentavos, 0);
        if (totalExternal === amountCentavos) {
          return { affectsCash: false, routedTo: externalAllocations[0].routedTo };
        }
      }

      if (cashAllocations.length > 0) {
        return { affectsCash: true, routedTo: 'physical-cash' };
      }
    }

    switch (originalChannel) {
      case 'cash':
        return { affectsCash: true, routedTo: 'physical-cash' };
      case 'gcash':
      case 'maya':
      case 'card':
        return { affectsCash: false, routedTo: originalChannel };
    }
  }

  static allocateRefund(
    payments: PaymentRecord[],
    refundAmountCentavos: number,
    isRefund: boolean
  ): PaymentAllocation[] {
    if (!isRefund) {
      return [];
    }

    const totalCollected = payments.reduce((sum, p) => sum + p.amountCentavos, 0);
    if (refundAmountCentavos > totalCollected) {
      throw new TsekInError(
        TsekInErrorCode.PAYMENT_ALLOCATION_ERROR,
        `Refund amount ${refundAmountCentavos} exceeds total collected ${totalCollected}.`
      );
    }

    const channels = [...new Set(payments.map((p) => p.channel))];

    if (channels.length === 1) {
      const channel = channels[0];
      const routed = TsekInEngine.routePayment(channel, refundAmountCentavos);
      return [{ channel, amountCentavos: refundAmountCentavos, ...routed }];
    }

    if (channels.length > 1) {
      const cashPayments = payments.filter((p) => p.channel === 'cash');
      const externalPayments = payments.filter((p) => p.channel !== 'cash');

      if (cashPayments.length > 0 && externalPayments.length > 0) {
        throw new TsekInError(
          TsekInErrorCode.PAYMENT_ALLOCATION_ERROR,
          'Mixed cash and external payment overpayment requires explicit allocation policy. Fail closed.'
        );
      }

      if (cashPayments.length > 0) {
        const totalCash = cashPayments.reduce((sum, p) => sum + p.amountCentavos, 0);
        const routed = TsekInEngine.routePayment('cash', refundAmountCentavos);
        return [{ channel: 'cash', amountCentavos: Math.min(refundAmountCentavos, totalCash), ...routed }];
      }

      const totalExternal = externalPayments.reduce((sum, p) => sum + p.amountCentavos, 0);
      if (refundAmountCentavos <= totalExternal) {
        const routed = TsekInEngine.routePayment(externalPayments[0].channel, refundAmountCentavos);
        return [{ channel: externalPayments[0].channel, amountCentavos: refundAmountCentavos, ...routed }];
      }
    }

    throw new TsekInError(
      TsekInErrorCode.PAYMENT_ALLOCATION_ERROR,
      'Unable to allocate refund across payment channels.'
    );
  }

  // -------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------

  private static _computeNightQuote(roomRateSnapshot: RoomRateSnapshot, nights: number, extraPax: number): number {
    let total = BigInt(roomRateSnapshot.rateCentavos) * BigInt(nights);
    if (extraPax > 0 && roomRateSnapshot.extraPaxFeeCentavos !== undefined) {
      total += BigInt(roomRateSnapshot.extraPaxFeeCentavos) * BigInt(extraPax);
    }
    return this._bigIntToNumber(total);
  }

  private static _computeShortQuote(roomRateSnapshot: RoomRateSnapshot, hours: number, extraPax: number): number {
    const rates = roomRateSnapshot.shortTimeRatesCentavos;
    if (!rates) {
      throw new TsekInError(TsekInErrorCode.INVALID_INPUT, 'Short-time rates are required for short-time stays.');
    }
    const key = `${hours}h`;
    if (rates[key as keyof typeof rates] === undefined) {
      throw new TsekInError(TsekInErrorCode.INVALID_INPUT, `No short-time rate defined for ${hours}h.`);
    }
    let total = BigInt(rates[key as keyof typeof rates]!);
    if (extraPax > 0 && roomRateSnapshot.extraPaxFeeCentavos !== undefined) {
      total += BigInt(roomRateSnapshot.extraPaxFeeCentavos) * BigInt(extraPax);
    }
    return this._bigIntToNumber(total);
  }

  private static _bigIntToNumber(value: bigint): number {
    if (value > BigInt(MAX_SAFE_CENTAVOS)) {
      throw new TsekInError(TsekInErrorCode.FINANCIAL_OVERFLOW, 'Calculation exceeds safe financial bounds.');
    }
    if (!Number.isSafeInteger(Number(value))) {
      throw new TsekInError(TsekInErrorCode.FINANCIAL_OVERFLOW, 'Calculation exceeds safe integer precision.');
    }
    return Number(value);
  }

  static safeAdd(a: number, b: number): number {
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
      throw new TsekInError(TsekInErrorCode.FINANCIAL_OVERFLOW, 'Unsafe integer in addition.');
    }
    const result = BigInt(a) + BigInt(b);
    if (result > BigInt(MAX_SAFE_CENTAVOS) || result < BigInt(0)) {
      throw new TsekInError(TsekInErrorCode.FINANCIAL_OVERFLOW, 'Addition exceeds safe financial bounds or produced negative value.');
    }
    return Number(result);
  }
}

// ==========================================
// Idempotency & Fingerprint Utilities
// ==========================================

export function validateIdempotencyKey(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new TsekInError(TsekInErrorCode.IDEMPOTENCY_CONFLICT, 'Idempotency key is required.');
  }
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new TsekInError(TsekInErrorCode.IDEMPOTENCY_CONFLICT, 'Idempotency key cannot be whitespace only.');
  }
  if (trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new TsekInError(TsekInErrorCode.IDEMPOTENCY_CONFLICT, `Idempotency key too long: ${trimmed.length}. Max is ${MAX_IDEMPOTENCY_KEY_LENGTH}.`);
  }
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    throw new TsekInError(TsekInErrorCode.IDEMPOTENCY_CONFLICT, 'Control characters are not allowed in idempotency key.');
  }
  if (!/^[a-zA-Z0-9\-_]+$/.test(trimmed)) {
    throw new TsekInError(TsekInErrorCode.IDEMPOTENCY_CONFLICT, 'Idempotency key must be alphanumeric, hyphen, or underscore.');
  }
}

function canonicalize(value: unknown, depth?: number): unknown {
  if (depth !== undefined && depth > 50) throw new Error('Maximum recursion depth exceeded in fingerprint');

  if (value === null || value === undefined) return null;

  const type = typeof value;

  if (type === 'string' || type === 'boolean') return value;
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number in fingerprint');
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item, depth !== undefined ? depth + 1 : 1));
  }

  if (type === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key], depth !== undefined ? depth + 1 : 1);
    }
    return sorted;
  }

  throw new Error('Unsupported type in fingerprint: ' + type);
}

export function computeFingerprint(input: Record<string, unknown>): string {
  const normalized = canonicalize(input);
  const json = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(json).digest('hex');
}
