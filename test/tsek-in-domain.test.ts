import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TsekInEngine,
  CheckInParamsSchema,
  CheckOutParamsSchema,
  RoomReadyParamsSchema,
  ExtendStayParamsSchema,
  RoomRateSnapshotSchema,
  BookingSnapshotSchema,
  PaymentRecordSchema,
  ExtraChargeSchema,
  SafeCentavosSchema,
  MAX_SAFE_CENTAVOS,
  MAX_NIGHTS,
  MAX_SHORT_HOURS,
  MAX_EXTRA_PAX,
  MAX_EXTRA_CHARGES,
  computeFingerprint,
  type CheckInResult,
  type CheckOutResult,
  type RoomReadyResult,
  type ExtensionCostResult,
  type CheckoutBalanceResult,
  type PaymentRouteResult,
  type RoomState,
  type BookingState,
  type PaymentChannel,
} from '../src/lib/tsek-in/domain';

// =========================================
// Fixtures
// =========================================

const BASE_ROOM_RATE: Parameters<typeof RoomRateSnapshotSchema.parse>[0] = {
  rateCentavos: 250000,
  shortTimeRatesCentavos: {
    '3h': 150000,
    '6h': 280000,
    '8h': 350000,
    '12h': 450000,
  },
  extraPaxFeeCentavos: 50000,
};

const SHORT_ROOM_RATE: Parameters<typeof RoomRateSnapshotSchema.parse>[0] = {
  rateCentavos: 200000,
  shortTimeRatesCentavos: {
    '3h': 120000,
    '6h': 220000,
    '8h': 300000,
    '12h': 400000,
  },
  extraPaxFeeCentavos: 40000,
};

const BASE_BOOKING: Parameters<typeof BookingSnapshotSchema.parse>[0] = {
  rateCentavos: 250000,
  nights: 2,
  extraPax: 1,
  extraPaxCostCentavos: 50000,
  totalRoomCostCentavos: 550000,
};

// =========================================
// 1. State Transitions
// =========================================

test('1a. Available -> Occupied through checkIn', () => {
  assert.equal(TsekInEngine.transitionRoom('Available', 'checkIn'), 'Occupied');
});

test('1b. Occupied -> Cleaning through checkOut', () => {
  assert.equal(TsekInEngine.transitionRoom('Occupied', 'checkOut'), 'Cleaning');
});

test('1c. Cleaning -> Available through roomReady', () => {
  assert.equal(TsekInEngine.transitionRoom('Cleaning', 'roomReady'), 'Available');
});

test('1d. Reject Available -> Cleaning', () => {
  assert.throws(() => TsekInEngine.transitionRoom('Available', 'checkOut'), /Invalid room state transition/);
});

test('1e. Reject Available -> roomReady', () => {
  assert.throws(() => TsekInEngine.transitionRoom('Available', 'roomReady'), /Invalid room state transition/);
});

test('1f. Reject Occupied -> Available', () => {
  assert.throws(() => TsekInEngine.transitionRoom('Occupied', 'roomReady'), /Invalid room state transition/);
});

test('1g. Reject Occupied -> Occupied (repeat)', () => {
  assert.throws(() => TsekInEngine.transitionRoom('Occupied', 'checkIn'), /Invalid room state transition/);
});

test('1h. Reject Cleaning -> Occupied (repeat)', () => {
  assert.throws(() => TsekInEngine.transitionRoom('Cleaning', 'checkOut'), /Invalid room state transition/);
});

test('1i. Reject Cleaning -> Occupied', () => {
  assert.throws(() => TsekInEngine.transitionRoom('Cleaning', 'checkIn'), /Invalid room state transition/);
});

test('1j. Reject Occupied -> Cleaning via roomReady', () => {
  assert.throws(() => TsekInEngine.transitionRoom('Occupied', 'roomReady'), /Invalid room state transition/);
});

// =========================================
// 2. Check-in Quote Calculations
// =========================================

test('2a. Night stay quote: rate * nights', () => {
  const result = TsekInEngine.computeCheckInQuote(BASE_ROOM_RATE, 'night', 2, 0);
  assert.equal(result.quoteCentavos, 500000);
});

test('2b. Night stay quote with extra pax', () => {
  const result = TsekInEngine.computeCheckInQuote(BASE_ROOM_RATE, 'night', 3, 2);
  assert.equal(result.quoteCentavos, 850000);
});

test('2c. Short-time 6h quote', () => {
  const result = TsekInEngine.computeCheckInQuote(SHORT_ROOM_RATE, 'short', 6, 0);
  assert.equal(result.quoteCentavos, 220000);
});

test('2d. Short-time 3h quote with extra pax', () => {
  const result = TsekInEngine.computeCheckInQuote(SHORT_ROOM_RATE, 'short', 3, 1);
  assert.equal(result.quoteCentavos, 160000);
});

test('2e. Reject zero night duration', () => {
  assert.throws(() => TsekInEngine.computeCheckInQuote(BASE_ROOM_RATE, 'night', 0, 0), /Invalid duration/);
});

test('2f. Reject negative short duration', () => {
  assert.throws(() => TsekInEngine.computeCheckInQuote(SHORT_ROOM_RATE, 'short', -1, 0), /Invalid duration/);
});

test('2g. Reject short duration exceeding max', () => {
  assert.throws(() => TsekInEngine.computeCheckInQuote(SHORT_ROOM_RATE, 'short', 13, 0), /Short-time duration must be exactly/);
});

test('2h. Reject night duration exceeding max', () => {
  assert.throws(() => TsekInEngine.computeCheckInQuote(BASE_ROOM_RATE, 'night', 366, 0), /Night duration 366 exceeds/);
});

test('2i. Reject short-time stay with missing rate', () => {
  const noRates = { rateCentavos: 200000, extraPaxFeeCentavos: 40000 };
  assert.throws(() => TsekInEngine.computeCheckInQuote(noRates, 'short', 6, 0), /Short-time rates are required/);
});

test('2j. Reject short-time stay with undefined specific rate', () => {
  const partialRates = { rateCentavos: 200000, shortTimeRatesCentavos: { '3h': 120000, '6h': 220000 } as any };
  assert.throws(() => TsekInEngine.computeCheckInQuote(partialRates, 'short', 8, 0), /No short-time rate defined/);
});

test('2k. Extra pax fee ignored when not defined', () => {
  const noExtraFee = { rateCentavos: 250000, shortTimeRatesCentavos: { '3h': 150000 } };
  const result = TsekInEngine.computeCheckInQuote(noExtraFee, 'night', 2, 5);
  assert.equal(result.quoteCentavos, 500000);
});

test('2l. Boundary: max nights quote', () => {
  const result = TsekInEngine.computeCheckInQuote(BASE_ROOM_RATE, 'night', MAX_NIGHTS, 0);
  assert.equal(result.quoteCentavos, 250000 * MAX_NIGHTS);
});

test('2m. Boundary: max short-time quote (12h)', () => {
  const result = TsekInEngine.computeCheckInQuote(BASE_ROOM_RATE, 'short', 12, 0);
  assert.equal(result.quoteCentavos, 450000);
});

// =========================================
// 3. Extension Cost Calculations
// =========================================

test('3a. Night extension cost', () => {
  const result = TsekInEngine.computeExtensionCost(BASE_BOOKING, BASE_ROOM_RATE, 1, 'night');
  assert.equal(result.additionalCostCentavos, 250000);
  assert.equal(result.newTotalRoomCostCentavos, 800000);
});

test('3b. Short extension cost', () => {
  const result = TsekInEngine.computeExtensionCost(BASE_BOOKING, SHORT_ROOM_RATE, 6, 'short');
  assert.equal(result.additionalCostCentavos, 220000);
  assert.equal(result.newTotalRoomCostCentavos, 770000);
});

test('3c. Reject zero extension duration', () => {
  assert.throws(() => TsekInEngine.computeExtensionCost(BASE_BOOKING, BASE_ROOM_RATE, 0, 'night'), /Extension duration must be a positive integer/);
});

test('3d. Reject negative extension duration', () => {
  assert.throws(() => TsekInEngine.computeExtensionCost(BASE_BOOKING, BASE_ROOM_RATE, -1, 'night'), /Extension duration must be a positive integer/);
});

test('3e. Reject night extension exceeding max', () => {
  assert.throws(() => TsekInEngine.computeExtensionCost(BASE_BOOKING, BASE_ROOM_RATE, MAX_NIGHTS + 1, 'night'), /Extension nights 366 exceeds/);
});

test('3f. Reject short extension exceeding max', () => {
  assert.throws(() => TsekInEngine.computeExtensionCost(BASE_BOOKING, SHORT_ROOM_RATE, 13, 'short'), /Extension short-time duration must be exactly/);
});

test('3g. Reject short extension without rates', () => {
  const noRates = { rateCentavos: 200000, extraPaxFeeCentavos: 40000 };
  assert.throws(() => TsekInEngine.computeExtensionCost(BASE_BOOKING, noRates, 6, 'short'), /Short-time rates are required/);
});

test('3h. Reject short extension with missing specific rate', () => {
  const partialRates = { rateCentavos: 200000, shortTimeRatesCentavos: { '3h': 120000 } };
  assert.throws(() => TsekInEngine.computeExtensionCost(BASE_BOOKING, partialRates, 6, 'short'), /No short-time rate defined/);
});

// =========================================
// 4. Checkout Balance Calculations
// =========================================

test('4a. Simple checkout balance with no extra charges or payments', () => {
  const result = TsekInEngine.computeCheckoutBalance(500000, [], [{ channel: 'cash', amountCentavos: 0 }]);
  assert.equal(result.totalRoomCostCentavos, 500000);
  assert.equal(result.totalExtraChargesCentavos, 0);
  assert.equal(result.totalDueCentavos, 500000);
  assert.equal(result.totalCollectedCentavos, 0);
  assert.equal(result.balanceCentavos, 500000);
  assert.equal(result.isRefund, false);
  assert.deepEqual(result.refundAllocations, []);
});

test('4b. Checkout balance with extra charges', () => {
  const result = TsekInEngine.computeCheckoutBalance(500000, [
    { description: 'Room service', amountCentavos: 25000 },
    { description: 'Laundry', amountCentavos: 15000 },
  ], [{ channel: 'cash', amountCentavos: 0 }]);
  assert.equal(result.totalExtraChargesCentavos, 40000);
  assert.equal(result.totalDueCentavos, 540000);
  assert.equal(result.balanceCentavos, 540000);
});

test('4c. Checkout balance with partial payment', () => {
  const result = TsekInEngine.computeCheckoutBalance(500000, [], [
    { channel: 'cash', amountCentavos: 200000 },
  ]);
  assert.equal(result.totalCollectedCentavos, 200000);
  assert.equal(result.balanceCentavos, 300000);
  assert.equal(result.isRefund, false);
});

test('4d. Checkout balance with overpayment (refund)', () => {
  const result = TsekInEngine.computeCheckoutBalance(500000, [], [
    { channel: 'cash', amountCentavos: 600000 },
  ]);
  assert.equal(result.balanceCentavos, 100000);
  assert.equal(result.isRefund, true);
});

test('4e. Checkout balance with multiple payments', () => {
  const result = TsekInEngine.computeCheckoutBalance(500000, [
    { description: 'Extra bed', amountCentavos: 10000 },
  ], [
    { channel: 'cash', amountCentavos: 200000 },
    { channel: 'gcash', amountCentavos: 200000 },
    { channel: 'card', amountCentavos: 110000 },
  ]);
  assert.equal(result.totalDueCentavos, 510000);
  assert.equal(result.totalCollectedCentavos, 510000);
  assert.equal(result.balanceCentavos, 0);
  assert.equal(result.isRefund, false);
});

test('4f. Reject negative extra charge amount', () => {
  assert.throws(() => TsekInEngine.computeCheckoutBalance(500000, [
    { description: 'Discount', amountCentavos: -1000 },
  ], []), /Centavos must be non-negative/);
});

test('4g. Reject too many extra charges', () => {
  const charges = Array.from({ length: MAX_EXTRA_CHARGES + 1 }, (_, i) => ({
    description: `Charge ${i}`,
    amountCentavos: 1000,
  }));
  assert.throws(() => TsekInEngine.computeCheckoutBalance(500000, charges, []), /Too many extra charges/);
});

test('4h. Reject unsafe integer in payment via computeCheckoutBalance', () => {
  assert.throws(() => TsekInEngine.computeCheckoutBalance(500000, [], [
    { channel: 'cash', amountCentavos: Number.MAX_SAFE_INTEGER + 1 },
  ]), /Centavos exceeds safe financial limits/);
});

// =========================================
// 5. Payment Routing
// =========================================

test('5a. Cash payment affects physical cash', () => {
  const result = TsekInEngine.routePayment('cash', 50000);
  assert.equal(result.affectsCash, true);
  assert.equal(result.routedTo, 'physical-cash');
});

test('5b. GCash does not affect physical cash', () => {
  const result = TsekInEngine.routePayment('gcash', 50000);
  assert.equal(result.affectsCash, false);
  assert.equal(result.routedTo, 'gcash');
});

test('5c. Maya does not affect physical cash', () => {
  const result = TsekInEngine.routePayment('maya', 50000);
  assert.equal(result.affectsCash, false);
  assert.equal(result.routedTo, 'maya');
});

test('5d. Card does not affect physical cash', () => {
  const result = TsekInEngine.routePayment('card', 50000);
  assert.equal(result.affectsCash, false);
  assert.equal(result.routedTo, 'card');
});

test('5e. Refund retains original cash channel', () => {
  const result = TsekInEngine.routeRefund('cash', 10000);
  assert.equal(result.affectsCash, true);
  assert.equal(result.routedTo, 'physical-cash');
});

test('5f. Refund retains original GCash channel', () => {
  const result = TsekInEngine.routeRefund('gcash', 10000);
  assert.equal(result.affectsCash, false);
  assert.equal(result.routedTo, 'gcash');
});

test('5g. Refund retains original Maya channel', () => {
  const result = TsekInEngine.routeRefund('maya', 10000);
  assert.equal(result.affectsCash, false);
  assert.equal(result.routedTo, 'maya');
});

test('5h. Refund retains original card channel', () => {
  const result = TsekInEngine.routeRefund('card', 10000);
  assert.equal(result.affectsCash, false);
  assert.equal(result.routedTo, 'card');
});

test('5i. Reject invalid payment channel', () => {
  assert.throws(() => TsekInEngine.routePayment('paypal' as PaymentChannel, 50000), /Invalid enum value/);
});

test('5j. Reject invalid refund channel', () => {
  assert.throws(() => TsekInEngine.routeRefund('crypto' as PaymentChannel, 50000), /Invalid enum value/);
});

// =========================================
// 6. Malformed Input Rejection
// =========================================

test('6a. Reject empty room ID in CheckInParams', () => {
  assert.throws(() => CheckInParamsSchema.parse({
    roomId: '',
    guestName: 'Juan',
    contactInfo: '09123456789',
    stayType: 'night',
    duration: 2,
    extraPax: 0,
    roomRateSnapshot: BASE_ROOM_RATE,
    paymentMethod: 'cash',
    initialPaymentCentavos: 0,
    checkedInAt: new Date(),
  }), /String is required/);
});

test('6b. Reject control characters in guest name', () => {
  assert.throws(() => CheckInParamsSchema.parse({
    roomId: '101',
    guestName: 'Juan\x00Dela',
    contactInfo: '09123456789',
    stayType: 'night',
    duration: 2,
    extraPax: 0,
    roomRateSnapshot: BASE_ROOM_RATE,
    paymentMethod: 'cash',
    initialPaymentCentavos: 0,
    checkedInAt: new Date(),
  }), /Control characters are not allowed/);
});

test('6c. Reject control characters in contact info', () => {
  assert.throws(() => CheckInParamsSchema.parse({
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    roomId: '101',
    guestName: 'Juan',
    contactInfo: '09123\x1F456789',
    stayType: 'night',
    duration: 2,
    extraPax: 0,
    roomRateSnapshot: BASE_ROOM_RATE,
    paymentMethod: 'cash',
    initialPaymentCentavos: 0,
    checkedInAt: new Date(),
  }), /Control characters are not allowed/);
});

test('6d. Reject negative centavos', () => {
  assert.throws(() => SafeCentavosSchema.parse(-100), /Centavos must be non-negative/);
});

test('6e. Reject non-integer centavos', () => {
  assert.throws(() => SafeCentavosSchema.parse(100.5), /Centavos must be an integer/);
});

test('6f. Reject unsafe integer centavos', () => {
  assert.throws(() => SafeCentavosSchema.parse(Number.MAX_SAFE_INTEGER + 1), /Centavos exceeds safe financial limits/);
});

test('6g. Reject unsupported payment method', () => {
  assert.throws(() => PaymentRecordSchema.parse({
    channel: 'paypal',
    amountCentavos: 1000,
  }), /Invalid enum value/);
});

test('6h. Reject extra charge with empty description', () => {
  assert.throws(() => ExtraChargeSchema.parse({
    description: '   ',
    amountCentavos: 1000,
  }), /cannot be whitespace only/);
});

test('6i. Reject extra charge with control characters in description', () => {
  assert.throws(() => ExtraChargeSchema.parse({
    description: 'Fee\x07details',
    amountCentavos: 1000,
  }), /Control characters are not allowed/);
});

test('6j. Reject CheckOutParams with invalid booking ID', () => {
  assert.throws(() => CheckOutParamsSchema.parse({
    bookingId: '',
    roomId: '101',
    extraCharges: [],
    finalPaymentCentavos: 0,
    paymentMethod: 'cash',
    checkedOutAt: new Date(),
  }), /String is required/);
});

test('6k. Reject CheckOutParams with negative final payment exceeding safe bounds', () => {
  assert.throws(() => CheckOutParamsSchema.parse({
    bookingId: 'BK-1',
    roomId: '101',
    extraCharges: [],
    finalPaymentCentavos: -MAX_SAFE_CENTAVOS - 1,
    paymentMethod: 'cash',
    checkedOutAt: new Date(),
  }), /Refund exceeds safe bounds/);
});

test('6l. Reject extra pax exceeding max', () => {
  assert.throws(() => CheckInParamsSchema.parse({
    roomId: '101',
    guestName: 'Juan',
    contactInfo: '09123456789',
    stayType: 'night',
    duration: 2,
    extraPax: MAX_EXTRA_PAX + 1,
    roomRateSnapshot: BASE_ROOM_RATE,
    paymentMethod: 'cash',
    initialPaymentCentavos: 0,
    checkedInAt: new Date(),
  }), /Extra pax cannot exceed/);
});

// =========================================
// 7. Overflow & Boundary Values
// =========================================

test('7a. Reject check-in quote exceeding safe bounds', () => {
  const hugeRate = {
    rateCentavos: MAX_SAFE_CENTAVOS,
    shortTimeRatesCentavos: { '12h': MAX_SAFE_CENTAVOS },
    extraPaxFeeCentavos: MAX_SAFE_CENTAVOS,
  };
  assert.throws(() => TsekInEngine.computeCheckInQuote(hugeRate, 'night', 2, 0), /exceeds safe financial bounds/);
});

test('7b. Accept quote at exact safe boundary', () => {
  const boundaryRate = {
    rateCentavos: Math.floor(MAX_SAFE_CENTAVOS / MAX_NIGHTS),
    shortTimeRatesCentavos: { '12h': Math.floor(MAX_SAFE_CENTAVOS / MAX_NIGHTS) },
    extraPaxFeeCentavos: 0,
  };
  const result = TsekInEngine.computeCheckInQuote(boundaryRate, 'night', MAX_NIGHTS, 0);
  assert.equal(result.quoteCentavos, Math.floor(MAX_SAFE_CENTAVOS / MAX_NIGHTS) * MAX_NIGHTS);
});

test('7c. Reject extension causing overflow', () => {
  const booking: BookingSnapshot = {
    rateCentavos: MAX_SAFE_CENTAVOS,
    nights: 1,
    extraPax: 0,
    extraPaxCostCentavos: 0,
    totalRoomCostCentavos: MAX_SAFE_CENTAVOS,
  };
  const rate = { rateCentavos: 1, shortTimeRatesCentavos: { '3h': 1 } };
  assert.throws(() => TsekInEngine.computeExtensionCost(booking, rate, 1, 'night'), /exceeds safe financial bounds/);
});

test('7d. Reject checkout balance with overflow extra charges', () => {
  assert.throws(() => TsekInEngine.computeCheckoutBalance(MAX_SAFE_CENTAVOS, [
    { description: 'Huge', amountCentavos: 1 },
  ], []), /Addition exceeds safe financial bounds/);
});

test('7e. Reject checkout balance with overflow payments', () => {
  assert.throws(() => TsekInEngine.computeCheckoutBalance(1, [], [
    { channel: 'cash', amountCentavos: MAX_SAFE_CENTAVOS },
    { channel: 'cash', amountCentavos: 1 },
  ]), /Total collected payments exceed safe financial bounds/);
});

// =========================================
// 8. Schema Validation of Domain Objects
// =========================================

test('8a. RoomRateSnapshot accepts valid input', () => {
  const parsed = RoomRateSnapshotSchema.parse(BASE_ROOM_RATE);
  assert.equal(parsed.rateCentavos, 250000);
  assert.equal(parsed.extraPaxFeeCentavos, 50000);
});

test('8b. BookingSnapshot accepts valid input', () => {
  const parsed = BookingSnapshotSchema.parse(BASE_BOOKING);
  assert.equal(parsed.totalRoomCostCentavos, 550000);
});

test('8c. PaymentRecord accepts valid input', () => {
  const parsed = PaymentRecordSchema.parse({ channel: 'gcash', amountCentavos: 50000 });
  assert.equal(parsed.channel, 'gcash');
});

test('8d. Reject extra fields in strict schemas', () => {
  assert.throws(() => RoomRateSnapshotSchema.parse({
    rateCentavos: 250000,
    extraField: 'nope',
  }), /Unrecognized key/);
});

test('8e. Reject booking with negative total cost', () => {
  assert.throws(() => BookingSnapshotSchema.parse({
    rateCentavos: 250000,
    nights: 1,
    extraPax: 0,
    extraPaxCostCentavos: 50000,
    totalRoomCostCentavos: -1,
  }), /Centavos must be non-negative/);
});

// =========================================
// 9. CheckInParams Schema Validation
// =========================================

test('9a. Valid check-in params parse', () => {
  const parsed = CheckInParamsSchema.parse({
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    roomId: '101',
    guestName: 'Juan Dela Cruz',
    contactInfo: '09171234567',
    stayType: 'night',
    duration: 2,
    extraPax: 1,
    roomRateSnapshot: BASE_ROOM_RATE,
    paymentMethod: 'cash',
    initialPaymentCentavos: 100000,
    checkedInAt: '2026-09-03T10:00:00.000Z',
  });
  assert.equal(parsed.guestName, 'Juan Dela Cruz');
  assert.equal(parsed.stayType, 'night');
});

test('9b. Reject invalid stay type', () => {
  assert.throws(() => CheckInParamsSchema.parse({
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    roomId: '101',
    guestName: 'Juan',
    contactInfo: '09123456789',
    stayType: 'hourly',
    duration: 2,
    extraPax: 0,
    roomRateSnapshot: BASE_ROOM_RATE,
    paymentMethod: 'cash',
    initialPaymentCentavos: 0,
    checkedInAt: new Date(),
  }), /Invalid enum value/);
});

test('9c. Reject contact info with control chars', () => {
  assert.throws(() => CheckInParamsSchema.parse({
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    roomId: '101',
    guestName: 'Juan',
    contactInfo: '09123\x00X',
    stayType: 'night',
    duration: 2,
    extraPax: 0,
    roomRateSnapshot: BASE_ROOM_RATE,
    paymentMethod: 'cash',
    initialPaymentCentavos: 0,
    checkedInAt: new Date(),
  }), /Control characters are not allowed/);
});

test('9d. Reject guest name with control chars', () => {
  assert.throws(() => CheckInParamsSchema.parse({
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    roomId: '101',
    guestName: 'Juan\x07',
    contactInfo: '09123456789',
    stayType: 'night',
    duration: 2,
    extraPax: 0,
    roomRateSnapshot: BASE_ROOM_RATE,
    paymentMethod: 'cash',
    initialPaymentCentavos: 0,
    checkedInAt: new Date(),
  }), /Control characters are not allowed/);
});

// =========================================
// 10. CheckOutParams Schema Validation
// =========================================

test('10a. Valid check-out params parse', () => {
  const parsed = CheckOutParamsSchema.parse({
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    bookingId: 'BK-001',
    roomId: '101',
    extraCharges: [{ description: 'Snack', amountCentavos: 5000 }],
    finalPaymentCentavos: 100000,
    paymentMethod: 'gcash',
    payments: [{ channel: 'gcash', amountCentavos: 100000 }],
    checkedOutAt: '2026-09-04T10:00:00.000Z',
  });
  assert.equal(parsed.bookingId, 'BK-001');
  assert.equal(parsed.paymentMethod, 'gcash');
});

test('10b. Reject invalid payment method in checkout', () => {
  assert.throws(() => CheckOutParamsSchema.parse({
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    bookingId: 'BK-001',
    roomId: '101',
    extraCharges: [],
    finalPaymentCentavos: 0,
    paymentMethod: 'venmo',
    payments: [{ channel: 'cash', amountCentavos: 0 }],
    checkedOutAt: new Date(),
  }), /Invalid enum value/);
});

test('10c. Reject non-integer final payment', () => {
  assert.throws(() => CheckOutParamsSchema.parse({
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    bookingId: 'BK-001',
    roomId: '101',
    extraCharges: [],
    finalPaymentCentavos: 100.5,
    paymentMethod: 'cash',
    payments: [{ channel: 'cash', amountCentavos: 100 }],
    checkedOutAt: new Date(),
  }), /Final payment must be an integer/);
});

// =========================================
// 11. RoomReadyParams Schema Validation
// =========================================

test('11a. Valid room-ready params parse', () => {
  const parsed = RoomReadyParamsSchema.parse({ idempotencyKey: '550e8400-e29b-41d4-a716-446655440000', roomId: '101' });
  assert.equal(parsed.roomId, '101');
});

test('11b. Reject empty room ID', () => {
  assert.throws(() => RoomReadyParamsSchema.parse({ idempotencyKey: '550e8400-e29b-41d4-a716-446655440000', roomId: '' }), /String is required/);
});

// =========================================
// 12. ExtendStayParams Schema Validation
// =========================================

test('12a. Valid extend params parse', () => {
  const parsed = ExtendStayParamsSchema.parse({
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    bookingSnapshot: BASE_BOOKING,
    roomRateSnapshot: BASE_ROOM_RATE,
    additionalNightsOrHours: 1,
    stayType: 'night',
    newExpectedCheckOutDate: new Date(),
  });
  assert.equal(parsed.additionalNightsOrHours, 1);
});

test('12b. Reject zero extension duration', () => {
  assert.throws(() => ExtendStayParamsSchema.parse({
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    bookingSnapshot: BASE_BOOKING,
    roomRateSnapshot: BASE_ROOM_RATE,
    additionalNightsOrHours: 0,
    stayType: 'night',
    newExpectedCheckOutDate: new Date(),
  }), /Number must be greater than 0/);
});

test('12c. Reject negative extension duration', () => {
  assert.throws(() => ExtendStayParamsSchema.parse({
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    bookingSnapshot: BASE_BOOKING,
    roomRateSnapshot: BASE_ROOM_RATE,
    additionalNightsOrHours: -1,
    stayType: 'night',
    newExpectedCheckOutDate: new Date(),
  }), /Number must be greater than 0/);
});

// ==========================================
// 13. Fingerprint Determinism & Nesting
// ==========================================

test('13a. Equivalent nested objects with different key insertion order have the same fingerprint', () => {
  const obj1 = { extension: { type: 'night', duration: 1 } };
  const obj2 = { extension: { duration: 1, type: 'night' } };
  assert.equal(computeFingerprint(obj1), computeFingerprint(obj2), 'different key order produces same fingerprint');
});

test('13b. Changing a nested value changes the fingerprint', () => {
  const obj1 = { extension: { type: 'night', duration: 1 } };
  const obj2 = { extension: { type: 'night', duration: 2 } };
  assert.notEqual(computeFingerprint(obj1), computeFingerprint(obj2), 'different nested value produces different fingerprint');
});

test('13c. Changing extension.type changes the fingerprint', () => {
  const obj1 = { extension: { type: 'night', duration: 1 } };
  const obj2 = { extension: { type: 'short', duration: 1 } };
  assert.notEqual(computeFingerprint(obj1), computeFingerprint(obj2), 'different extension type produces different fingerprint');
});

test('13d. Changing extension.duration changes the fingerprint', () => {
  const obj1 = { extension: { type: 'night', duration: 1 } };
  const obj2 = { extension: { type: 'night', duration: 2 } };
  assert.notEqual(computeFingerprint(obj1), computeFingerprint(obj2), 'different extension duration produces different fingerprint');
});

test('13e. Arrays preserve ordering', () => {
  const obj1 = { items: [{ a: 1 }, { a: 2 }] };
  const obj2 = { items: [{ a: 2 }, { a: 1 }] };
  assert.notEqual(computeFingerprint(obj1), computeFingerprint(obj2), 'different array order produces different fingerprint');
});

test('13f. Nested arrays of objects are represented fully', () => {
  const obj1 = { data: [[{ x: 1 }]] };
  const obj2 = { data: [[{ x: 2 }]] };
  assert.notEqual(computeFingerprint(obj1), computeFingerprint(obj2), 'nested array objects produce different fingerprints');
});

test('13g. Deeply nested objects with different key order have the same fingerprint', () => {
  const obj1 = { a: { z: 1, b: { y: 2, a: 3 } } };
  const obj2 = { a: { b: { a: 3, y: 2 }, z: 1 } };
  assert.equal(computeFingerprint(obj1), computeFingerprint(obj2), 'deeply nested different key order produces same fingerprint');
});

test('13h. Different nested object keys produce different fingerprints', () => {
  const obj1 = { extension: { type: 'night', duration: 1 } };
  const obj2 = { extension: { type: 'night', duration: 1, extra: true } };
  assert.notEqual(computeFingerprint(obj1), computeFingerprint(obj2), 'different nested keys produce different fingerprint');
});
