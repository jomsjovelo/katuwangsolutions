import * as admin from 'firebase-admin';
import {
  ExtensionError,
  ExtensionErrorCode,
  ExtensionReceipt,
  ExtensionServiceOptions,
  tsekInExtend,
} from '../src/lib/server/tsek-in-extension-service';
import { TSEK_IN_MODULE_ID } from '../src/lib/server/tsek-in-checkin-service';

let passed = 0;
let failed = 0;

function assert(value: unknown, message: string) {
  if (value) { console.log(`  PASS ${message}`); passed++; }
  else { console.error(`  FAIL ${message}`); failed++; }
}

async function rejects(fn: () => Promise<unknown> | unknown, code: ExtensionErrorCode, message: string) {
  try { await fn(); assert(false, message); }
  catch (error: any) {
    if (!(error instanceof ExtensionError && error.code === code)) {
      console.error(`REJECTS FAIL for "${message}": got`, error?.code, error?.message, error?.constructor?.name);
    }
    assert(error instanceof ExtensionError && error.code === code, message);
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
    extensionHistory: [],
  },
  ...(overrides.extras || {}),
});

const validRequest = (overrides: Record<string, any> = {}) => ({
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
  bookingId: 'booking-1',
  extension: { type: 'night' as const, duration: 1 },
  collectionCentavos: 0,
  paymentChannel: 'cash' as const,
  ...overrides,
});

async function main() {
  console.log('TSEK-IN STAY-EXTENSION SERVICE TESTS');

  // 1. Night extension with zero payment
  {
    const memory = mockFirestore(seed());
    const before = memory.store['tenants/tenant-1/bookings/booking-1'].totalRoomCostCentavos;
    const receipt = await tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_900_000_000_000) });
    assert(receipt.bookingId === 'booking-1', 'night extension: booking id echoed');
    assert(receipt.additionalCostCentavos === 250000, 'night extension uses stored nightly rate');
    assert(receipt.newTotalRoomCostCentavos === before + 250000, 'total room cost increased');
    assert(receipt.amountCollectedNowCentavos === 0, 'zero collection amount');
    assert(receipt.totalCollectedCentavos === 200000, 'total collected unchanged when zero tender');
    assert(receipt.bookingStatus === 'Active', 'booking remains Active');
    assert(receipt.roomStatus === 'Occupied', 'room remains Occupied');
    assert(memory.store['tenants/tenant-1/bookings/booking-1'].status === 'Active', 'booking doc still Active');
    assert(memory.store['tenants/tenant-1/rooms/room-101'].status === 'Occupied', 'room still Occupied');
    assert(memory.store['tenants/tenant-1/bookings/booking-1'].extensionHistory.length === 1, 'extension history appended');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === 50000, 'master cash unchanged on zero-collection');
  }

  // 2. Each allowed short duration
  for (const dur of [3, 6, 8, 12]) {
    const memory = mockFirestore(seed({
      extras: {
        'tenants/tenant-1/bookings/booking-1': {
          ...seed()['tenants/tenant-1/bookings/booking-1'],
          stayType: 'short',
          duration: 3,
          rateCentavos: 0,
          shortTimeRatesCentavos: { '3h': 150000, '6h': 280000, '8h': 350000, '12h': 450000 },
          totalRoomCostCentavos: 150000,
          totalCollectedCentavos: 150000,
          paymentAllocations: [{ channel: 'cash', amountCentavos: 150000, routedTo: 'physical-cash', affectsCash: true }],
          expectedCheckOutDate: admin.firestore.Timestamp.fromMillis(1_700_000_000_000),
        },
      },
    }));
    const expectedCost = { 3: 150000, 6: 280000, 8: 350000, 12: 450000 }[dur];
    const receipt = await tsekInExtend('token', validRequest({ extension: { type: 'short' as const, duration: dur }, collectionCentavos: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.additionalCostCentavos === expectedCost, `short ${dur}h extension: stored rate applied`);
    assert(receipt.stayType === 'short', `short ${dur}h: stayType=short`);
    assert(receipt.extensionDuration === dur, `short ${dur}h: duration recorded`);
  }

  // 3. Partial payment extension (cash)
  {
    const memory = mockFirestore(seed());
    const before = memory.store['tenants/tenant-1/accounts/master-cash'].balance;
    const receipt = await tsekInExtend('token', validRequest({ collectionCentavos: 100000 }), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_900_000_000_000) });
    assert(receipt.amountCollectedNowCentavos === 100000, 'partial: amount echoed');
    assert(receipt.totalCollectedCentavos === 200000 + 100000, 'partial: total collected increased');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === before + 100000, 'partial: master cash incremented');
    const tx = Object.values(memory.store).find((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.type === 'income' && v.bookingId === 'booking-1' && v.category === 'Stay Extension');
    assert(!!tx && tx.amountCentavos === 100000, 'ledger entry for partial');
  }

  // 4. Cash / GCash / Maya / card routing
  for (const channel of ['gcash', 'maya', 'card'] as const) {
    const memory = mockFirestore(seed());
    const before = memory.store['tenants/tenant-1/accounts/master-cash'].balance;
    const target = `tenants/tenant-1/accounts/${channel === 'gcash' ? 'gcash-settlement' : channel === 'maya' ? 'maya-settlement' : 'card-clearing'}`;
    const beforeTarget = memory.store[target].balance;
    const receipt = await tsekInExtend('token', validRequest({ collectionCentavos: 100000, paymentChannel: channel }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.paymentChannel === channel, `${channel}: paymentChannel echoed`);
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === before, `${channel}: master cash unchanged`);
    assert(memory.store[target].balance === beforeTarget + 100000, `${channel}: target account incremented`);
  }

  // 5. Invalid durations
  {
    await rejects(() => tsekInExtend('token', validRequest({ extension: { type: 'night' as const, duration: 366 } }), { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'night >365 rejected');
    await rejects(() => tsekInExtend('token', validRequest({ extension: { type: 'night' as const, duration: 0 } }), { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'night 0 rejected');
    await rejects(() => tsekInExtend('token', validRequest({ extension: { type: 'short' as const, duration: 5 } }), { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'short 5h rejected');
    await rejects(() => tsekInExtend('token', validRequest({ extension: { type: 'short' as const, duration: 13 } }), { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'short 13h rejected');
  }

  // 6. Rate snapshot missing or malformed
  {
    const memory = mockFirestore(seed());
    delete memory.store['tenants/tenant-1/bookings/booking-1'].rateCentavos;
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.RATE_SNAPSHOT_INVALID, 'missing rate snapshot rejected');
  }
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].rateCentavos = 'bad';
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.RATE_SNAPSHOT_INVALID, 'malformed rate snapshot rejected');
  }
  {
    // Short extension without shortTimeRatesCentavos stored
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].stayType = 'short';
    memory.store['tenants/tenant-1/bookings/booking-1'].shortTimeRatesCentavos = null;
    await rejects(() => tsekInExtend('token', validRequest({ extension: { type: 'short' as const, duration: 3 } }), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.RATE_SNAPSHOT_INVALID, 'short extension without rates rejected');
  }
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].stayType = 'short';
    memory.store['tenants/tenant-1/bookings/booking-1'].shortTimeRatesCentavos = { '3h': 'oops' };
    await rejects(() => tsekInExtend('token', validRequest({ extension: { type: 'short' as const, duration: 3 } }), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.RATE_SNAPSHOT_INVALID, 'malformed short rate rejected');
  }

  // 7. Missing booking
  {
    const memory = mockFirestore(seed());
    delete memory.store['tenants/tenant-1/bookings/booking-1'];
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.BOOKING_NOT_FOUND, 'missing booking rejected');
  }

  // 8. Wrong module booking
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].moduleId = 'order-snap';
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.BOOKING_NOT_FOUND, 'wrong module booking rejected');
  }

  // 9. Inactive booking
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].status = 'CheckedOut';
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.BOOKING_NOT_ACTIVE, 'non-active booking rejected');
  }

  // 10. Missing room
  {
    const memory = mockFirestore(seed());
    delete memory.store['tenants/tenant-1/rooms/room-101'];
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.ROOM_NOT_FOUND, 'missing room rejected');
  }

  // 11. Deleted room
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/rooms/room-101'].deletedAt = admin.firestore.Timestamp.now();
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.ROOM_NOT_FOUND, 'deleted room rejected');
  }

  // 12. Non-occupied room
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/rooms/room-101'].status = 'Cleaning';
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.ROOM_STATE_CONFLICT, 'non-Occupied room rejected');
  }

  // 13. Booking-room mismatch
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/rooms/room-101'].id = 'some-other-id';
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.ROOM_STATE_CONFLICT, 'booking/room mismatch rejected');
  }

  // 14. Inconsistent payment allocations
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].totalCollectedCentavos = 999999;
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR, 'mismatched totalCollected rejected');
  }
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].paymentAllocations = [{ channel: 'cash' }];
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.PAYMENT_ALLOCATION_ERROR, 'malformed allocations rejected');
  }

  // 15. Collection > outstanding
  {
    const memory = mockFirestore(seed());
    await rejects(() => tsekInExtend('token', validRequest({ collectionCentavos: 10_000_000 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR, 'over-collection rejected');
  }

  // 16. Negative collection
  {
    await rejects(() => tsekInExtend('token', validRequest({ collectionCentavos: -1 }), { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'negative collection rejected');
  }

  // 17. Financial overflow (huge rate that pushes beyond safe-integer when added)
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].rateCentavos = 600_000_000_000; // near MAX_SAFE_CENTAVOS
    memory.store['tenants/tenant-1/bookings/booking-1'].totalRoomCostCentavos = 600_000_000_000;
    await rejects(() => tsekInExtend('token', validRequest({ extension: { type: 'night' as const, duration: 2 } }), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.FINANCIAL_INTEGRITY_ERROR, 'overflow rejected');
  }

  // 18. Forged request fields
  {
    await rejects(() => tsekInExtend('token', { ...validRequest(), tenantId: 'other' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'forged tenantId rejected');
    await rejects(() => tsekInExtend('token', { ...validRequest(), roomId: 'r' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'forged roomId rejected');
    await rejects(() => tsekInExtend('token', { ...validRequest(), rates: { rateCentavos: 100 } } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'forged rates rejected');
    await rejects(() => tsekInExtend('token', { ...validRequest(), addedCost: 100 } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'forged addedCost rejected');
    await rejects(() => tsekInExtend('token', { ...validRequest(), newCheckoutDate: new Date().toISOString() } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'forged newCheckoutDate rejected');
    await rejects(() => tsekInExtend('token', { ...validRequest(), totalCost: 100 } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'forged totalCost rejected');
    await rejects(() => tsekInExtend('token', { ...validRequest(), actorId: 'x' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'forged actorId rejected');
    await rejects(() => tsekInExtend('token', { ...validRequest(), accountId: 'a' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'forged accountId rejected');
    await rejects(() => tsekInExtend('token', { ...validRequest(), committedAt: new Date().toISOString() } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'forged committedAt rejected');
    await rejects(() => tsekInExtend('token', { ...validRequest(), fingerprint: 'x' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'forged fingerprint rejected');
  }

  // 19. Manila date boundaries — extend across UTC date change still aligned to Manila
  {
    // Set previous checkout late UTC = next Manila day. Extend by 1 night.
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/bookings/booking-1'].expectedCheckOutDate = admin.firestore.Timestamp.fromMillis(Date.UTC(2026, 0, 1, 18, 0, 0)); // 2026-01-02 02:00 Manila
    const receipt = await tsekInExtend('token', validRequest({ extension: { type: 'night' as const, duration: 1 } }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const expected = Date.UTC(2026, 0, 3, 4, 0, 0); // 2026-01-03 12:00 Manila
    assert(receipt.newCheckOutAt === new Date(expected).toISOString(), 'Manila boundary: night extension past UTC midnight anchored to Manila 12:00');
  }

  // 20. Same-key replay at a later time
  {
    const memory = mockFirestore(seed());
    const r1 = await tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_900_000_000_000) });
    const r2 = await tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(2_000_000_000_000) });
    assert(r1.bookingId === r2.bookingId, 'replay returns same bookingId');
    assert(JSON.stringify(r1) === JSON.stringify(r2), 'replay returns exact original receipt');
    assert(memory.store['tenants/tenant-1/bookings/booking-1'].extensionHistory.length === 1, 'replay did not re-apply');
    assert(memory.store['tenants/tenant-1/bookings/booking-1'].totalRoomCostCentavos === 550000 + 250000, 'replay did not increase cost twice');
  }

  // 21. Same-key conflicts for every request field
  {
    const memory = mockFirestore(seed());
    const r1 = await tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db });
    await rejects(() => tsekInExtend('token', validRequest({ bookingId: 'other' }), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.IDEMPOTENCY_CONFLICT, 'replay with different bookingId conflicts');
    await rejects(() => tsekInExtend('token', validRequest({ extension: { type: 'night' as const, duration: 2 } }), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.IDEMPOTENCY_CONFLICT, 'replay with different duration conflicts');
    await rejects(() => tsekInExtend('token', validRequest({ extension: { type: 'short' as const, duration: 3 } }), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.IDEMPOTENCY_CONFLICT, 'replay with different extension type conflicts');
    await rejects(() => tsekInExtend('token', validRequest({ collectionCentavos: 50000 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.IDEMPOTENCY_CONFLICT, 'replay with different collection conflicts');
    await rejects(() => tsekInExtend('token', validRequest({ paymentChannel: 'gcash' }), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.IDEMPOTENCY_CONFLICT, 'replay with different paymentChannel conflicts');
  }

  // 22. New-key duplicate protection
  {
    const memory = mockFirestore(seed());
    await tsekInExtend('token', validRequest({ extension: { type: 'night' as const, duration: 1 } }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const beforeHistoryLen = memory.store['tenants/tenant-1/bookings/booking-1'].extensionHistory.length;
    const beforeCost = memory.store['tenants/tenant-1/bookings/booking-1'].totalRoomCostCentavos;
    // Use a fresh idempotency key — must re-apply.
    const r = await tsekInExtend('token', validRequest({ idempotencyKey: '99999999-9999-4999-8999-999999999999', extension: { type: 'night' as const, duration: 1 } }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(memory.store['tenants/tenant-1/bookings/booking-1'].extensionHistory.length === beforeHistoryLen + 1, 'fresh key applies new extension');
    assert(memory.store['tenants/tenant-1/bookings/booking-1'].totalRoomCostCentavos === beforeCost + 250000, 'fresh key increases total room cost');
  }

  // 23. Transaction read-before-write (guard active)
  {
    const memory = mockFirestore(seed(), { failOnReadAfterWrite: true });
    const receipt = await tsekInExtend('token', validRequest({ collectionCentavos: 50000 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.amountCollectedNowCentavos === 50000, 'paid extension passes guard');
    assert(memory.store['tenants/tenant-1/bookings/booking-1'].extensionHistory.length === 1, 'paid extension: history updated');
  }
  // Zero-payment extension must also pass without an account read
  {
    const memory = mockFirestore(seed(), { failOnReadAfterWrite: true });
    const receipt = await tsekInExtend('token', validRequest({ collectionCentavos: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.amountCollectedNowCentavos === 0, 'zero-collection extension passes guard');
  }

  // 24. Tenant mid-flight revalidation
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1'].subscriptionStatus = 'suspended';
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.TENANT_INELIGIBLE, 'tenant suspended mid-flight rejected');
  }

  // 25. Staff mid-flight revalidation
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/staff_accounts/staff-1'].status = 'disabled';
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db }), ExtensionErrorCode.FORBIDDEN, 'staff disabled mid-flight rejected');
  }
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/staff_accounts/staff-1'].sessionVersion = 99;
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db }), ExtensionErrorCode.FORBIDDEN, 'staff sessionVersion changed mid-flight rejected');
  }

  // 26. Transaction commit failure leaves state unchanged
  {
    const memory = mockFirestore(seed(), { failCommit: true });
    const beforeBooking = JSON.stringify(memory.store['tenants/tenant-1/bookings/booking-1']);
    const beforeRoom = memory.store['tenants/tenant-1/rooms/room-101'].status;
    const beforeCash = memory.store['tenants/tenant-1/accounts/master-cash'].balance;
    try {
      await tsekInExtend('token', validRequest({ collectionCentavos: 100000 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    } catch (e: any) {
      // expected
    }
    assert(JSON.stringify(memory.store['tenants/tenant-1/bookings/booking-1']) === beforeBooking, 'commit failure: booking unchanged');
    assert(memory.store['tenants/tenant-1/rooms/room-101'].status === beforeRoom, 'commit failure: room unchanged');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === beforeCash, 'commit failure: cash unchanged');
  }

  // 27. No raw UUID persistence
  {
    const memory = mockFirestore(seed());
    const rawKey = '550e8400-e29b-41d4-a716-446655440000';
    await tsekInExtend('token', validRequest({ idempotencyKey: rawKey }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const idemEntry = Object.values(memory.store).find((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.tenantId === 'tenant-1' && v.status === 'complete');
    assert(idemEntry !== undefined, 'idempotency record exists');
    assert(!JSON.stringify(idemEntry).includes(rawKey), 'raw idempotency key never persisted');
  }

  // 28. Sanitized errors
  {
    const memory = mockFirestore(seed());
    try {
      await tsekInExtend('token', { ...validRequest(), bookingId: 'booking-missing' }, { adminAuth: ownerAuth, adminFirestore: memory.db });
    } catch (e: any) {
      assert(e instanceof ExtensionError, 'error is ExtensionError');
      assert(e.httpStatus === 404, 'http status 404');
      assert(!e.message.includes('booking-missing'), 'message does not leak booking id');
      assert(!e.message.includes('tenant-1'), 'message does not leak tenant id');
    }
  }

  // 29. Module-isolated ledger and audit
  {
    const memory = mockFirestore(seed());
    const receipt = await tsekInExtend('token', validRequest({ collectionCentavos: 50000, paymentChannel: 'gcash' }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const tx = Object.values(memory.store).find((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.type === 'income' && v.bookingId === receipt.bookingId && v.category === 'Stay Extension');
    assert(!!tx && tx.moduleId === TSEK_IN_MODULE_ID, 'ledger: moduleId');
    assert(!!tx && tx.tenantId === 'tenant-1', 'ledger: tenantId');
    assert(!!tx && tx.referenceId === 'booking-1', 'ledger: referenceId');
    assert(!!tx && tx.actorId === 'owner_owner-1', 'ledger: actorId');
    const audit = Object.values(memory.store).find((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.action === 'extend' && v.bookingId === 'booking-1');
    assert(!!audit && audit.additionalCostCentavos === 250000, 'audit: additional cost recorded');
    assert(!!audit && audit.actorId === 'owner_owner-1', 'audit: actor recorded');
  }

  // 30. Exactly one extension and one payment entry per successful call
  {
    const memory = mockFirestore(seed());
    const r = await tsekInExtend('token', validRequest({ collectionCentavos: 50000 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const extHist = memory.store['tenants/tenant-1/bookings/booking-1'].extensionHistory;
    assert(extHist.length === 1, 'exactly one extension history entry');
    assert(extHist[0].collectionCentavos === 50000, 'extension history entry has collection');
    const txs = Object.values(memory.store).filter((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.type === 'income' && v.bookingId === r.bookingId && v.category === 'Stay Extension');
    assert(txs.length === 1, 'exactly one ledger entry per extension');
  }

  // 31. Unknown role rejected
  {
    const badAuth = { verifyIdToken: async () => ({ uid: 'u', role: 'guest' }) } as any;
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: badAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.FORBIDDEN, 'guest role rejected');
  }

  // 32. Cashier rejected
  {
    const cashierAuth = { verifyIdToken: async () => ({ uid: 'c', role: 'cashier' }) } as any;
    await rejects(() => tsekInExtend('token', validRequest(), { adminAuth: cashierAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.FORBIDDEN, 'cashier rejected');
  }

  // 33. Bad UUID idempotency key rejected
  {
    await rejects(() => tsekInExtend('token', { ...validRequest(), idempotencyKey: 'not-a-uuid' }, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), ExtensionErrorCode.INVALID_REQUEST, 'non-UUID key rejected');
  }

  // 34. Room ID derived from booking (roomId on request rejected)
  {
    const memory = mockFirestore(seed());
    await rejects(() => tsekInExtend('token', { ...validRequest(), roomId: 'r-evil' } as any, { adminAuth: ownerAuth, adminFirestore: memory.db }), ExtensionErrorCode.INVALID_REQUEST, 'forged roomId on request rejected');
  }

  // 35. Electronic payment never affects cash
  {
    const memory = mockFirestore(seed());
    const before = memory.store['tenants/tenant-1/accounts/master-cash'].balance;
    await tsekInExtend('token', validRequest({ collectionCentavos: 50000, paymentChannel: 'gcash' }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === before, 'gcash extension: cash untouched');
  }

  // 36. Cashier route for zero-collection does not require an account read
  {
    const memory = mockFirestore(seed(), { failOnReadAfterWrite: true });
    const r = await tsekInExtend('token', validRequest({ collectionCentavos: 0, paymentChannel: 'cash' }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(r.amountCollectedNowCentavos === 0, 'zero-collection cash extension passes guard');
  }

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });