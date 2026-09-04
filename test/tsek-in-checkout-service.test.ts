import * as admin from 'firebase-admin';
import {
  CheckoutError,
  CheckoutErrorCode,
  CheckoutReceipt,
  CheckoutServiceOptions,
  tsekInCheckOut,
  TSEK_IN_MODULE_ID,
} from '../src/lib/server/tsek-in-checkout-service';

let passed = 0;
let failed = 0;

function assert(value: unknown, message: string) {
  if (value) { console.log(`  PASS ${message}`); passed++; }
  else { console.error(`  FAIL ${message}`); failed++; }
}

async function rejects(fn: () => Promise<unknown> | unknown, code: CheckoutErrorCode, message: string) {
  try { await fn(); assert(false, message); }
  catch (error: any) {
    if (!(error instanceof CheckoutError && error.code === code)) {
      console.error(`REJECTS FAIL for "${message}": got`, error?.code, error?.message, error?.constructor?.name);
    }
    assert(error instanceof CheckoutError && error.code === code, message);
  }
}

function applyIncrements(target: any, data: any) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'operand' in (v as any)) {
      const base = target[k];
      const baseNum = typeof base === 'number' ? base : 0;
      target[k] = baseNum + (v as any).operand;
    } else if (v && typeof v === 'object' && '__increment' in (v as any)) {
      const base = target[k];
      const baseNum = typeof base === 'number' ? base : 0;
      target[k] = baseNum + (v as any).__increment;
    } else {
      target[k] = v;
    }
  }
}

function mockFirestore(seed: Record<string, any>, opts: { failCommit?: boolean; failOnReadAfterWrite?: boolean } = {}) {
  const store: Record<string, any> = structuredClone(seed);
  const collection = (path: string): any => ({
    doc: (id?: string) => {
      const docId = id || `generated-${Math.random().toString(36).slice(2, 10)}`;
      const fullPath = `${path}/${docId}`;
      const ref: any = {
        id: docId,
        path: fullPath,
        collection: (name: string) => collection(`${fullPath}/${name}`),
        get: async () => snapshot(ref),
      };
      return ref;
    }
  });
  const snapshot = (ref: any) => {
    const data = store[ref.path];
    return { id: ref.id, path: ref.path, exists: data !== undefined, data: () => data, ref };
  };
  const db = {
    collection,
    runTransaction: async (work: (transaction: any) => Promise<any>) => {
      const staged: Record<string, any> = structuredClone(store);
      let writesStarted = false;
      const transaction = {
        getAll: async (...refs: any[]) => {
          if (opts.failOnReadAfterWrite && writesStarted) {
            throw new Error('read-after-write violation');
          }
          return refs.map((ref) => snapshot(ref));
        },
        get: async (ref: any) => {
          if (opts.failOnReadAfterWrite && writesStarted) {
            throw new Error('read-after-write violation');
          }
          return snapshot(ref);
        },
        create: (ref: any, data: any) => {
          writesStarted = true;
          if (staged[ref.path] !== undefined) throw new Error('already exists');
          staged[ref.path] = data;
        },
        update: (ref: any, data: any) => {
          writesStarted = true;
          if (staged[ref.path] === undefined) throw new Error('missing');
          const prev = staged[ref.path] || {};
          staged[ref.path] = { ...prev };
          applyIncrements(staged[ref.path], data);
        },
        set: (ref: any, data: any, options?: { merge?: boolean }) => {
          writesStarted = true;
          if (options?.merge) {
            const prev = staged[ref.path] || {};
            staged[ref.path] = { ...prev };
            applyIncrements(staged[ref.path], data);
          } else {
            staged[ref.path] = {};
            applyIncrements(staged[ref.path], data);
          }
        },
      };
      const result = await work(transaction);
      if (opts.failCommit) throw new Error('injected transaction failure');
      Object.keys(store).forEach((key) => delete store[key]);
      Object.assign(store, staged);
      return result;
    },
  };
  return { db: db as any, store };
}

const ownerAuth = {
  verifyIdToken: async () => ({ uid: 'owner-1', role: 'owner', tenantId: 'tenant-1' })
} as any;

const staffAuth = {
  verifyIdToken: async () => ({ uid: 'staff-auth-1', role: 'staff', tenantId: 'tenant-1', staffAccountId: 'staff-1', sessionVersion: 2 })
} as any;

const baseRoom = (overrides: Record<string, any> = {}) => ({
  roomNumber: '101',
  type: 'Standard',
  rateCentavos: 250000,
  shortTimeRatesCentavos: { '3h': 150000, '6h': 280000, '8h': 350000, '12h': 450000 },
  capacity: 4,
  bedType: '1 Queen',
  status: 'Occupied',
  extraPaxFeeCentavos: 50000,
  ...overrides,
});

const baseTenant = (overrides: Record<string, any> = {}) => ({
  ownerUid: 'owner-1',
  moduleType: TSEK_IN_MODULE_ID,
  subscriptionStatus: 'active',
  ...overrides,
});

const seed = (overrides: Record<string, any> = {}) => ({
  'tenants/tenant-1': baseTenant(overrides.tenant || {}),
  'tenants/tenant-1/rooms/room-101': baseRoom(overrides.room || {}),
  'tenants/tenant-1/staff_accounts/staff-1': { tenantId: 'tenant-1', authUid: 'staff-auth-1', sessionVersion: 2, status: 'active', username: 'Maria' },
  'tenants/tenant-1/accounts/master-cash': { balance: 50000 },
  'tenants/tenant-1/accounts/gcash-settlement': { balance: 20000 },
  'tenants/tenant-1/accounts/maya-settlement': { balance: 15000 },
  'tenants/tenant-1/accounts/card-clearing': { balance: 0 },
  'tenants/tenant-1/bookings/booking-1': {
    id: 'booking-1',
    tenantId: 'tenant-1',
    moduleId: TSEK_IN_MODULE_ID,
    roomId: 'room-101',
    roomName: '101',
    guestName: 'Juan Dela Cruz',
    stayType: 'night',
    duration: 2,
    extraPax: 1,
    paymentMethod: 'cash',
    initialPaymentCentavos: 200000,
    rateCentavos: 250000,
    shortTimeRatesCentavos: null,
    extraPaxFeeCentavos: 50000,
    totalRoomCostCentavos: 550000,
    totalCollectedCentavos: 200000,
    paymentAllocations: [
      { channel: 'cash', amountCentavos: 200000, routedTo: 'physical-cash', affectsCash: true },
    ],
    paymentAllocationsVersion: 1,
    extraCharges: [],
    expectedCheckOutDate: admin.firestore.Timestamp.fromMillis(1_900_000_000_000),
    status: 'Active',
    actorId: 'owner_owner-1',
    fingerprint: 'fp-booking-1',
    createdAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
    committedAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
  },
  ...(overrides.extras || {}),
});

const validRequest = (overrides: Record<string, any> = {}) => ({
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
  bookingId: 'booking-1',
  extraCharges: [],
  paymentChannel: 'cash',
  ...overrides,
});

function setupCheckedIn(
  baseOverrides: Record<string, any> = {},
  checkInOverrides: Record<string, any> = {}
): { db: any; store: Record<string, any> } {
  // Build a checkout-ready seed directly so tests don't depend on the check-in
  // service running concurrently.
  const method = (checkInOverrides.paymentMethod || 'cash') as 'cash' | 'gcash' | 'maya' | 'card';
  const initial = checkInOverrides.initialPaymentCentavos ?? 200000;
  const routed = method === 'cash'
    ? { routedTo: 'physical-cash', affectsCash: true }
    : { routedTo: method, affectsCash: false };
  const booking = {
    id: 'booking-1',
    tenantId: 'tenant-1',
    moduleId: TSEK_IN_MODULE_ID,
    roomId: 'room-101',
    roomName: '101',
    guestName: 'Juan Dela Cruz',
    stayType: 'night',
    duration: 2,
    extraPax: 1,
    paymentMethod: method,
    initialPaymentCentavos: initial,
    rateCentavos: 250000,
    shortTimeRatesCentavos: null,
    extraPaxFeeCentavos: 50000,
    totalRoomCostCentavos: 550000,
    totalCollectedCentavos: initial,
    paymentAllocations: [{ channel: method, amountCentavos: initial, ...routed }],
    paymentAllocationsVersion: 1,
    extraCharges: [],
    expectedCheckOutDate: admin.firestore.Timestamp.fromMillis(1_900_000_000_000),
    status: 'Active',
    actorId: 'owner_owner-1',
    fingerprint: 'fp-booking-1',
    createdAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
    committedAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
  };
  const memory = mockFirestore(seed({
    ...baseOverrides,
    room: { ...(baseOverrides.room || {}), status: 'Occupied' },
    extras: {
      ...(baseOverrides.extras || {}),
      'tenants/tenant-1/bookings/booking-1': booking,
    },
  }));
  if (!memory || !memory.store) throw new Error('setupCheckedIn: empty store');
  return memory;
}

async function main() {
  console.log('TSEK-IN CHECK-OUT SERVICE TESTS');

  // 1. Cash balance collection (settle path)
  {
    const memory = setupCheckedIn();
    const before = memory.store['tenants/tenant-1/accounts/master-cash'].balance;
    const receipt = await tsekInCheckOut('token', validRequest({ paymentChannel: 'cash' }), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_900_000_000_000) });
    assert(receipt.action === 'settle', 'cash balance collected: action=settle');
    assert(receipt.totalDueCentavos === 550000, 'total due derived from booking');
    assert(receipt.totalCollectedCentavos === 550000, 'total collected after settle');
    assert(receipt.amountMovedNowCentavos === 350000, 'settlement amount = balance (550000-200000)');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === before + 350000, 'master cash increased by balance');
    assert(memory.store['tenants/tenant-1/accounts/gcash-settlement'].balance === 20000, 'gcash untouched');
    assert(memory.store['tenants/tenant-1/accounts/maya-settlement'].balance === 15000, 'maya untouched');
    assert(memory.store['tenants/tenant-1/rooms/room-101'].status === 'Cleaning', 'room moved to Cleaning');
    assert(memory.store['tenants/tenant-1/bookings/booking-1'].status === 'CheckedOut', 'booking moved to CheckedOut');
    const tx = Object.values(memory.store).find((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.type === 'income' && v.bookingId === 'booking-1');
    assert(!!tx, 'income ledger entry exists');
    assert(tx.amountCentavos === 350000, 'ledger entry has settlement amount');
    assert(tx.paymentChannel === 'cash', 'ledger entry has cash channel');
  }

  // 2. GCash / Maya / card never affect cash
  for (const channel of ['gcash', 'maya', 'card'] as const) {
    const memory = setupCheckedIn({}, { paymentMethod: 'cash' });
    const before = memory.store['tenants/tenant-1/accounts/master-cash'].balance;
    const target = `tenants/tenant-1/accounts/${channel === 'gcash' ? 'gcash-settlement' : channel === 'maya' ? 'maya-settlement' : 'card-clearing'}`;
    const beforeTarget = memory.store[target].balance;
    const receipt = await tsekInCheckOut('token', validRequest({ paymentChannel: channel }), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_900_000_000_000) });
    assert(receipt.action === 'settle', `${channel}: action=settle`);
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === before, `${channel}: master cash unchanged`);
    assert(memory.store[target].balance === beforeTarget + 350000, `${channel}: target account increased`);
  }

  // 3. Zero-balance checkout => no-op, no account delta
  {
    const memory = setupCheckedIn({}, { paymentMethod: 'cash', initialPaymentCentavos: 550000 });
    const before = memory.store['tenants/tenant-1/accounts/master-cash'].balance;
    const receipt = await tsekInCheckOut('token', validRequest({ paymentChannel: 'cash' }), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_900_000_000_000) });
    assert(receipt.action === 'no-op', 'zero balance => action=no-op');
    assert(receipt.amountMovedNowCentavos === 0, 'no money moved');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === before, 'master cash unchanged on no-op');
    const incomeLedger = Object.values(memory.store).filter((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.type === 'income' && v.bookingId === 'booking-1');
    assert(incomeLedger.length === 0, 'no income ledger entry for no-op');
    const refundLedger = Object.values(memory.store).filter((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.type === 'refund' && v.bookingId === 'booking-1');
    assert(refundLedger.length === 0, 'no refund ledger entry for no-op');
  }

  // 4. Single-channel cash refund (overpayment)
  {
    const memory = mockFirestore(seed({
      extras: {
        'tenants/tenant-1/bookings/booking-1': {
          id: 'booking-1',
          tenantId: 'tenant-1',
          moduleId: TSEK_IN_MODULE_ID,
          roomId: 'room-101',
          roomName: '101',
          guestName: 'Test',
          stayType: 'short',
          duration: 3,
          extraPax: 0,
          paymentMethod: 'cash',
          initialPaymentCentavos: 200000,
          totalRoomCostCentavos: 100000,
          totalCollectedCentavos: 200000,
          paymentAllocations: [{ channel: 'cash', amountCentavos: 200000, routedTo: 'physical-cash', affectsCash: true }],
          paymentAllocationsVersion: 1,
          extraCharges: [],
          status: 'Active',
          actorId: 'owner_owner-1',
          fingerprint: 'fp',
          createdAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
          committedAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
        },
      },
    }));
    memory.store['tenants/tenant-1/accounts/master-cash'].balance = 500000; // plenty for refund
    const before = memory.store['tenants/tenant-1/accounts/master-cash'].balance;
    const receipt = await tsekInCheckOut('token', validRequest({ paymentChannel: 'cash' }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.action === 'refund', 'overpayment => action=refund');
    assert(receipt.amountMovedNowCentavos === -100000, 'negative movement = refund amount');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === before - 100000, 'cash refund decremented master-cash');
    const refund = Object.values(memory.store).find((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.type === 'refund');
    assert(!!refund && refund.paymentChannel === 'cash', 'refund ledger entry on cash channel');
  }

  // 5. External-channel refund (gcash overpayment)
  {
    const memory = mockFirestore(seed({
      extras: {
        'tenants/tenant-1/bookings/booking-1': {
          id: 'booking-1',
          tenantId: 'tenant-1',
          moduleId: TSEK_IN_MODULE_ID,
          roomId: 'room-101',
          roomName: '101',
          guestName: 'Test',
          stayType: 'short',
          duration: 3,
          extraPax: 0,
          paymentMethod: 'gcash',
          initialPaymentCentavos: 200000,
          totalRoomCostCentavos: 100000,
          totalCollectedCentavos: 200000,
          paymentAllocations: [{ channel: 'gcash', amountCentavos: 200000, routedTo: 'gcash', affectsCash: false }],
          paymentAllocationsVersion: 1,
          extraCharges: [],
          status: 'Active',
          actorId: 'owner_owner-1',
          fingerprint: 'fp',
          createdAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
          committedAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
        },
      },
    }));
    const before = memory.store['tenants/tenant-1/accounts/master-cash'].balance;
    const beforeGcash = memory.store['tenants/tenant-1/accounts/gcash-settlement'].balance;
    const receipt = await tsekInCheckOut('token', validRequest({ paymentChannel: 'gcash' }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.action === 'refund', 'gcash overpayment => refund');
    assert(receipt.amountMovedNowCentavos === -100000, 'gcash refund amount');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === before, 'master cash UNCHANGED on external refund');
    assert(memory.store['tenants/tenant-1/accounts/gcash-settlement'].balance === beforeGcash - 100000, 'gcash settlement decreased');
  }

  // 6. Mixed-channel refund fails closed
  {
    const memory = mockFirestore(seed({
      extras: {
        'tenants/tenant-1/bookings/booking-1': {
          id: 'booking-1',
          tenantId: 'tenant-1',
          moduleId: TSEK_IN_MODULE_ID,
          roomId: 'room-101',
          roomName: '101',
          guestName: 'Test',
          stayType: 'short',
          duration: 3,
          extraPax: 0,
          paymentMethod: 'cash',
          initialPaymentCentavos: 200000,
          totalRoomCostCentavos: 100000,
          totalCollectedCentavos: 200000,
          paymentAllocations: [
            { channel: 'cash', amountCentavos: 100000, routedTo: 'physical-cash', affectsCash: true },
            { channel: 'gcash', amountCentavos: 100000, routedTo: 'gcash', affectsCash: false },
          ],
          paymentAllocationsVersion: 1,
          extraCharges: [],
          status: 'Active',
          actorId: 'owner_owner-1',
          fingerprint: 'fp',
          createdAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
          committedAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
        },
      },
    }));
    await rejects(() => tsekInCheckOut('token', validRequest({ paymentChannel: 'cash' }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.PAYMENT_ALLOCATION_ERROR, 'mixed-channel refund fails closed');
  }

  // 7. Insufficient cash refund
  {
    const memory = mockFirestore(seed({
      extras: {
        'tenants/tenant-1/bookings/booking-1': {
          id: 'booking-1',
          tenantId: 'tenant-1',
          moduleId: TSEK_IN_MODULE_ID,
          roomId: 'room-101',
          roomName: '101',
          guestName: 'Test',
          stayType: 'short',
          duration: 3,
          extraPax: 0,
          paymentMethod: 'cash',
          initialPaymentCentavos: 100000,
          totalRoomCostCentavos: 5000,
          totalCollectedCentavos: 100000,
          paymentAllocations: [{ channel: 'cash', amountCentavos: 100000, routedTo: 'physical-cash', affectsCash: true }],
          paymentAllocationsVersion: 1,
          extraCharges: [],
          status: 'Active',
          actorId: 'owner_owner-1',
          fingerprint: 'fp',
          createdAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
          committedAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
        },
      },
    }));
    memory.store['tenants/tenant-1/accounts/master-cash'].balance = 50000;
    await rejects(() => tsekInCheckOut('token', validRequest({ paymentChannel: 'cash' }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.INSUFFICIENT_CASH, 'cash refund blocked when register too low');
  }

  // 8. Booking missing
  {
    const memory = mockFirestore(seed());
    delete memory.store['tenants/tenant-1/bookings/booking-1'];
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.BOOKING_NOT_FOUND, 'missing booking rejected');
  }

  // 9. Booking wrong module
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].moduleId = 'order-snap';
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.BOOKING_NOT_FOUND, 'wrong module booking rejected');
  }

  // 10. Booking not Active
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].status = 'CheckedOut';
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.BOOKING_NOT_ACTIVE, 'non-active booking rejected');
  }

  // 11. Room ID derived from booking (roomId field never accepted on request)
  {
    const memory = setupCheckedIn();
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), roomId: 'room-EVIL' } as any, { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.INVALID_REQUEST, 'roomId field on request rejected');
    // The receipt must echo the booking's authoritative roomId.
    const memory2 = setupCheckedIn();
    const receipt = await tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory2.db });
    assert(receipt.roomId === 'room-101', 'receipt roomId echoes booking authoritative value');
  }

  // 12. Missing room
  {
    const memory = mockFirestore(seed());
    delete memory.store['tenants/tenant-1/rooms/room-101'];
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.ROOM_NOT_FOUND, 'missing room rejected');
  }

  // 13. Deleted room
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/rooms/room-101'].deletedAt = admin.firestore.Timestamp.now();
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.ROOM_NOT_FOUND, 'deleted room rejected');
  }

  // 14. Wrong-state room
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/rooms/room-101'].status = 'Cleaning';
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.ROOM_STATE_CONFLICT, 'non-Occupied room rejected');
  }

  // 15. Booking/room mismatch
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/rooms/room-101'].id = 'some-other-id';
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.ROOM_STATE_CONFLICT, 'booking/room mismatch rejected');
  }

  // 16. Forged request fields
  {
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), tenantId: 'other' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'forged tenantId rejected');
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), roomId: 'r' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'forged roomId rejected');
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), totalRoomCost: 100 } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'forged totalRoomCost rejected');
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), totalCollected: 100 } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'forged totalCollected rejected');
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), finalPaymentCentavos: 100 } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'forged finalPayment rejected');
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), accountId: 'a' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'forged accountId rejected');
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), actorId: 'x' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'forged actorId rejected');
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), checkoutAt: new Date().toISOString() } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'forged checkoutAt rejected');
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), fingerprint: 'x' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'forged fingerprint rejected');
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), receipt: {} } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'forged receipt rejected');
  }

  // 17. Excessive extra charges
  {
    const charges = Array.from({ length: 51 }, () => ({ description: 'X', amountCentavos: 100 }));
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), extraCharges: charges }, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, '>50 extra charges rejected');
  }

  // 18. Malformed extra charge
  {
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), extraCharges: [{ description: '\u0000', amountCentavos: 100 }] }, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'control chars rejected');
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), extraCharges: [{ description: '   ', amountCentavos: 100 }] }, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'whitespace-only description rejected');
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), extraCharges: [{ description: 'X', amountCentavos: -1 }] }, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'negative amount rejected');
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), extraCharges: [{ description: 'X', amountCentavos: 1.5 }] }, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'non-integer amount rejected');
  }

  // 19. Inconsistent collected totals
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].totalCollectedCentavos = 999999;
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.FINANCIAL_INTEGRITY_ERROR, 'mismatched totalCollected rejected');
  }

  // 20. Malformed allocations
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].paymentAllocations = [{ channel: 'cash' }];
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.PAYMENT_ALLOCATION_ERROR, 'malformed allocations rejected');
  }

  // 21. Same-key replay
  {
    const memory = setupCheckedIn();
    const r1 = await tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const r2 = await tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(r1.bookingId === r2.bookingId, 'replay returns same bookingId');
    assert(JSON.stringify(r1) === JSON.stringify(r2), 'replay returns exact original receipt');
    const txs = Object.values(memory.store).filter((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.type === 'income' && v.bookingId === 'booking-1');
    assert(txs.length === 1, 'exactly one income ledger entry after replay');
  }

  // 22. Same-key conflict for each business field
  {
    const memory = setupCheckedIn();
    await tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db });
    await rejects(() => tsekInCheckOut('token', validRequest({ bookingId: 'booking-OTHER' }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.IDEMPOTENCY_CONFLICT, 'replay with different bookingId conflicts');
    await rejects(() => tsekInCheckOut('token', validRequest({ extraCharges: [{ description: 'Snack', amountCentavos: 5000 }] }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.IDEMPOTENCY_CONFLICT, 'replay with different extraCharges conflicts');
    await rejects(() => tsekInCheckOut('token', validRequest({ extraCharges: [{ description: 'Snack', amountCentavos: 6000 }] }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.IDEMPOTENCY_CONFLICT, 'replay with different extraCharge amount conflicts');
    await rejects(() => tsekInCheckOut('token', validRequest({ paymentChannel: 'gcash' }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.IDEMPOTENCY_CONFLICT, 'replay with different paymentChannel conflicts');
  }

  // 23. New key after checkout rejected (no mutation)
  {
    const memory = setupCheckedIn();
    await tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const beforeRoom = memory.store['tenants/tenant-1/rooms/room-101'].status;
    const beforeBooking = memory.store['tenants/tenant-1/bookings/booking-1'].status;
    const beforeCash = memory.store['tenants/tenant-1/accounts/master-cash'].balance;
    await rejects(() => tsekInCheckOut('token', validRequest({ idempotencyKey: '99999999-9999-4999-8999-999999999999' }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.BOOKING_NOT_ACTIVE, 'new key against already-checked-out booking rejected');
    assert(memory.store['tenants/tenant-1/rooms/room-101'].status === beforeRoom, 'room state not mutated by failed retry');
    assert(memory.store['tenants/tenant-1/bookings/booking-1'].status === beforeBooking, 'booking state not mutated by failed retry');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === beforeCash, 'cash not mutated by failed retry');
  }

  // 24. Read-after-write guard: both settle and refund pass
  {
    const memory1 = mockFirestore(seed(), { failOnReadAfterWrite: true });
    const r = await tsekInCheckOut('token', validRequest({ paymentChannel: 'cash' }), { adminAuth: ownerAuth, adminFirestore: memory1.db });
    assert(r.action === 'settle', 'settle path: no read-after-write');
    // Refund path: build a fresh checkout state with overpayment so the engine
    // resolves a refund allocation. Need a brand-new seed (booking Active,
    // totalCollected > totalRoomCost).
    const refundSeed = {
      ...seed(),
      'tenants/tenant-1/bookings/booking-1': {
        ...seed()['tenants/tenant-1/bookings/booking-1'],
        totalRoomCostCentavos: 100000,
        totalCollectedCentavos: 200000,
        paymentAllocations: [{ channel: 'cash', amountCentavos: 200000, routedTo: 'physical-cash', affectsCash: true }],
      },
      'tenants/tenant-1/accounts/master-cash': { balance: 500000 },
    };
    const memory2 = mockFirestore(refundSeed, { failOnReadAfterWrite: true });
    const r2 = await tsekInCheckOut('token', validRequest({ paymentChannel: 'cash' }), { adminAuth: ownerAuth, adminFirestore: memory2.db });
    assert(r2.action === 'refund', 'refund path: no read-after-write');
  }

  // 25. Tenant mid-flight revalidation
  {
    const memory = setupCheckedIn();
    memory.store['tenants/tenant-1'].subscriptionStatus = 'suspended';
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckoutErrorCode.TENANT_INELIGIBLE, 'tenant suspended mid-flight rejected');
  }

  // 26. Staff mid-flight disabled
  {
    const memory = setupCheckedIn();
    memory.store['tenants/tenant-1/staff_accounts/staff-1'].status = 'disabled';
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db }), CheckoutErrorCode.FORBIDDEN, 'staff disabled mid-flight rejected');
  }

  // 27. Staff sessionVersion changed mid-flight
  {
    const memory = setupCheckedIn();
    memory.store['tenants/tenant-1/staff_accounts/staff-1'].sessionVersion = 99;
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db }), CheckoutErrorCode.FORBIDDEN, 'staff sessionVersion changed mid-flight rejected');
  }

  // 28. Transaction commit failure leaves state unchanged
  {
    const baseSeed = seed();
    const memory = mockFirestore(baseSeed, { failCommit: true });
    // Manually build an Active booking identical to setupCheckedIn.
    memory.store['tenants/tenant-1/bookings/booking-1'] = {
      id: 'booking-1',
      tenantId: 'tenant-1',
      moduleId: TSEK_IN_MODULE_ID,
      roomId: 'room-101',
      roomName: '101',
      guestName: 'Test',
      stayType: 'night',
      duration: 2,
      extraPax: 1,
      paymentMethod: 'cash',
      initialPaymentCentavos: 200000,
      totalRoomCostCentavos: 550000,
      totalCollectedCentavos: 200000,
      paymentAllocations: [{ channel: 'cash', amountCentavos: 200000, routedTo: 'physical-cash', affectsCash: true }],
      paymentAllocationsVersion: 1,
      extraCharges: [],
      status: 'Active',
      actorId: 'owner_owner-1',
      fingerprint: 'fp',
      createdAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
      committedAt: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
    };
    const before = {
      room: memory.store['tenants/tenant-1/rooms/room-101'].status,
      booking: memory.store['tenants/tenant-1/bookings/booking-1'].status,
      cash: memory.store['tenants/tenant-1/accounts/master-cash'].balance,
    };
    try {
      await tsekInCheckOut('token', validRequest({ paymentChannel: 'cash' }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    } catch (e: any) {
      // expected
    }
    assert(memory.store['tenants/tenant-1/rooms/room-101'].status === before.room, 'room unchanged on commit failure');
    assert(memory.store['tenants/tenant-1/bookings/booking-1'].status === before.booking, 'booking unchanged on commit failure');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === before.cash, 'cash unchanged on commit failure');
  }

  // 29. Raw idempotency key never persisted
  {
    const memory = setupCheckedIn();
    const rawKey = '550e8400-e29b-41d4-a716-446655440000';
    await tsekInCheckOut('token', validRequest({ idempotencyKey: rawKey }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const idemEntry = Object.values(memory.store).find((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.tenantId === 'tenant-1' && v.status === 'complete');
    assert(idemEntry !== undefined, 'idempotency record exists');
    assert(!JSON.stringify(idemEntry).includes(rawKey), 'raw idempotency key never persisted');
  }

  // 30. Sanitized errors
  {
    const memory = setupCheckedIn();
    try {
      await tsekInCheckOut('token', { ...validRequest(), bookingId: 'booking-missing' }, { adminAuth: ownerAuth, adminFirestore: memory.db });
    } catch (e: any) {
      assert(e instanceof CheckoutError, 'error is CheckoutError');
      assert(e.httpStatus === 404, 'http status 404');
      assert(!e.message.includes('booking-missing'), 'message does not leak booking id');
      assert(!e.message.includes('tenant-1'), 'message does not leak tenant id');
    }
  }

  // 31. Module-isolated ledger fields
  {
    const memory = setupCheckedIn();
    const receipt = await tsekInCheckOut('token', validRequest({ paymentChannel: 'gcash' }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const tx = Object.values(memory.store).find((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.type === 'income' && v.bookingId === receipt.bookingId);
    assert(!!tx && tx.moduleId === TSEK_IN_MODULE_ID, 'ledger entry has moduleId');
    assert(!!tx && tx.tenantId === 'tenant-1', 'ledger entry has tenantId');
    assert(!!tx && tx.referenceId === 'booking-1', 'ledger entry has referenceId');
    assert(!!tx && tx.category === 'Check-Out Settlement', 'ledger entry has category');
    assert(!!tx && tx.actorId === 'owner_owner-1', 'ledger entry has actorId');
  }

  // 32. Exactly one booking transition + one money entry
  {
    const memory = setupCheckedIn();
    const r = await tsekInCheckOut('token', validRequest({ paymentChannel: 'gcash' }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const booking = memory.store['tenants/tenant-1/bookings/booking-1'];
    assert(booking.status === 'CheckedOut', 'booking transitioned exactly once');
    const txs = Object.values(memory.store).filter((v: any) => v.moduleId === TSEK_IN_MODULE_ID && (v.type === 'income' || v.type === 'refund') && v.bookingId === r.bookingId);
    assert(txs.length === 1, 'exactly one money ledger entry');
  }

  // 33. Audit record written atomically for settle
  {
    const memory = setupCheckedIn();
    await tsekInCheckOut('token', validRequest({ paymentChannel: 'gcash' }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const audit = Object.values(memory.store).find((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.action === 'settle' && v.bookingId === 'booking-1');
    assert(!!audit, 'audit record created atomically for settle');
  }

  // 34. Extra charges increase total due
  {
    const memory = setupCheckedIn();
    const receipt = await tsekInCheckOut('token', validRequest({ paymentChannel: 'cash', extraCharges: [{ description: 'Room service', amountCentavos: 25000 }] }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.totalExtraChargesCentavos === 25000, 'extra charges summed');
    assert(receipt.totalDueCentavos === 550000 + 25000, 'total due includes extras');
  }

  // 35. Unknown role rejected
  {
    const badAuth = { verifyIdToken: async () => ({ uid: 'u', role: 'guest' }) } as any;
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: badAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.FORBIDDEN, 'guest role rejected');
  }

  // 36. Cashier role rejected
  {
    const cashierAuth = { verifyIdToken: async () => ({ uid: 'c', role: 'cashier' }) } as any;
    await rejects(() => tsekInCheckOut('token', validRequest(), { adminAuth: cashierAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.FORBIDDEN, 'cashier rejected');
  }

  // 37. Bad UUID idempotency key rejected
  {
    await rejects(() => tsekInCheckOut('token', { ...validRequest(), idempotencyKey: 'not-a-uuid' }, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckoutErrorCode.INVALID_REQUEST, 'non-UUID key rejected');
  }

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });