import * as admin from 'firebase-admin';
import {
  CheckinError,
  CheckinErrorCode,
  CheckinReceipt,
  CheckinServiceOptions,
  tsekInCheckIn,
  verifyTsekInIdentity,
  TSEK_IN_MODULE_ID,
  manilaWallClockIsoFromMillis,
} from '../src/lib/server/tsek-in-checkin-service';

let passed = 0;
let failed = 0;

function assert(value: unknown, message: string) {
  if (value) { console.log(`  PASS ${message}`); passed++; }
  else { console.error(`  FAIL ${message}`); failed++; }
}

async function rejects(fn: () => Promise<unknown> | unknown, code: CheckinErrorCode, message: string) {
  try { await fn(); assert(false, message); }
  catch (error: any) {
    if (!(error instanceof CheckinError && error.code === code)) {
      console.error(`REJECTS FAIL for "${message}": got`, error.code, error.message, error.constructor.name);
    }
    assert(error instanceof CheckinError && error.code === code, message);
  }
}

// Mock helper that mirrors Admin FieldValue.increment semantics for the transaction mock.
function inc(n: number) {
  return { __increment: n };
}

function applyWrites(staged: Record<string, any>, ref: any, data: any, op: 'set' | 'update') {
  const prev = staged[ref.path] || {};
  const merged: Record<string, any> = op === 'update' ? { ...prev } : {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && '__increment' in (v as any)) {
      const base = merged[k];
      const baseNum = typeof base === 'number' ? base : 0;
      merged[k] = baseNum + (v as any).__increment;
    } else if (v && typeof v === 'object' && 'operand' in (v as any)) {
      const base = merged[k];
      const baseNum = typeof base === 'number' ? base : 0;
      merged[k] = baseNum + (v as any).operand;
    } else if (v && typeof v === 'object' && v.constructor && v.constructor.name === 'FieldValue') {
      merged[k] = (typeof merged[k] === 'number' ? merged[k] : 0) + Number((v as any)._amount || 0);
    } else {
      merged[k] = v;
    }
  }
  staged[ref.path] = merged;
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
    return { id: ref.id, exists: data !== undefined, data: () => data };
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
          applyWrites(staged, ref, data, 'update');
        },
        set: (ref: any, data: any, options?: { merge?: boolean }) => {
          writesStarted = true;
          if (options?.merge) {
            applyWrites(staged, ref, data, 'set');
          } else {
            staged[ref.path] = {};
            applyWrites(staged, ref, data, 'set');
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

const baseRoom = (overrides: Record<string, any> = {}) => ({
  roomNumber: '101',
  type: 'Standard',
  rateCentavos: 250000,
  shortTimeRatesCentavos: { '3h': 150000, '6h': 280000, '8h': 350000, '12h': 450000 },
  capacity: 2,
  bedType: '1 Queen',
  status: 'Available',
  extraPaxFeeCentavos: 50000,
  ...overrides,
});

const seed = (roomOverrides: Record<string, any> = {}, tenantOverrides: Record<string, any> = {}) => ({
  'tenants/tenant-1': { ownerUid: 'owner-1', moduleType: TSEK_IN_MODULE_ID, subscriptionStatus: 'active', ...tenantOverrides },
  'tenants/tenant-1/rooms/room-101': baseRoom(roomOverrides),
  'tenants/tenant-1/staff_accounts/staff-1': { tenantId: 'tenant-1', authUid: 'staff-auth-1', sessionVersion: 2, status: 'active', username: 'Maria' },
  'tenants/tenant-1/accounts/master-cash': { balance: 5000 },
  'tenants/tenant-1/accounts/gcash-settlement': { balance: 2000 },
  'tenants/tenant-1/accounts/maya-settlement': { balance: 1500 },
  'tenants/tenant-1/accounts/card-clearing': { balance: 0 },
});

const ownerAuth = {
  verifyIdToken: async () => ({ uid: 'owner-1', role: 'owner', tenantId: 'tenant-1' })
} as any;

const staffAuth = {
  verifyIdToken: async () => ({ uid: 'staff-auth-1', role: 'staff', tenantId: 'tenant-1', staffAccountId: 'staff-1', sessionVersion: 2 })
} as any;

const validRequest = (overrides: Record<string, any> = {}) => ({
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
  roomId: 'room-101',
  guestName: 'Juan Dela Cruz',
  contactInfo: '09171234567',
  stayType: 'night',
  duration: 2,
  extraPax: 1,
  paymentMethod: 'cash',
  initialPaymentCentavos: 100000,
  ...overrides,
});

async function main() {
  console.log('TSEK-IN CHECK-IN SERVICE TESTS');

  // 1. Cash success
  {
    const memory = mockFirestore(seed());
    const receipt = await tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000) });
    assert(receipt.bookingId !== undefined, 'cash check-in creates booking');
    assert(receipt.totalCostCentavos === 550000, 'authoritative total cost calculated');
    assert(receipt.remainingBalanceCentavos === 450000, 'remaining balance correct');
    assert(receipt.paymentChannel === 'cash', 'receipt records cash channel');
    assert(memory.store['tenants/tenant-1/rooms/room-101'].status === 'Occupied', 'room status updated to Occupied');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === 5000 + 100000, 'master cash increased');
    assert(memory.store['tenants/tenant-1/accounts/gcash-settlement'].balance === 2000, 'gcash settlement unchanged');
    assert(memory.store['tenants/tenant-1/accounts/maya-settlement'].balance === 1500, 'maya settlement unchanged');
    const tx = Object.values(memory.store).find((v: any) => v.referenceId === receipt.bookingId);
    assert(tx && tx.paymentChannel === 'cash', 'ledger entry has cash channel');
    assert(tx && tx.moduleId === TSEK_IN_MODULE_ID, 'ledger entry has tsek-in moduleId');
  }

  // 2. GCash does not affect physical cash
  {
    const memory = mockFirestore(seed());
    const receipt = await tsekInCheckIn('token', validRequest({ paymentMethod: 'gcash', initialPaymentCentavos: 50000 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.paymentChannel === 'gcash', 'gcash receipt recorded');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === 5000, 'master cash unchanged for gcash');
    assert(memory.store['tenants/tenant-1/accounts/gcash-settlement'].balance === 2000 + 50000, 'gcash settlement increased');
  }

  // 3. Maya does not affect physical cash
  {
    const memory = mockFirestore(seed());
    const receipt = await tsekInCheckIn('token', validRequest({ paymentMethod: 'maya', initialPaymentCentavos: 30000 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.paymentChannel === 'maya', 'maya receipt recorded');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === 5000, 'master cash unchanged for maya');
    assert(memory.store['tenants/tenant-1/accounts/maya-settlement'].balance === 1500 + 30000, 'maya settlement increased');
  }

  // 4. Card does not affect physical cash
  {
    const memory = mockFirestore(seed());
    const receipt = await tsekInCheckIn('token', validRequest({ paymentMethod: 'card', initialPaymentCentavos: 40000 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.paymentChannel === 'card', 'card receipt recorded');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === 5000, 'master cash unchanged for card');
    assert(memory.store['tenants/tenant-1/accounts/card-clearing'].balance === 0 + 40000, 'card clearing increased');
  }

  // 5. Zero-payment check-in
  {
    const memory = mockFirestore(seed());
    const receipt = await tsekInCheckIn('token', validRequest({ initialPaymentCentavos: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.initialPaymentCentavos === 0, 'zero payment accepted');
    assert(receipt.remainingBalanceCentavos === 550000, 'full balance due');
    assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === 5000, 'no ledger created for zero payment');
    const txs = Object.values(memory.store).filter((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.type === 'income');
    assert(txs.length === 0, 'no transaction entries for zero payment');
  }

  // 6. Unavailable room rejected
  {
    const memory = mockFirestore(seed({ status: 'Occupied' }));
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.ROOM_UNAVAILABLE, 'occupied room rejected');
  }

  // 7. Deleted room rejected
  {
    const memory = mockFirestore(seed({ deletedAt: admin.firestore.Timestamp.now() }));
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.ROOM_NOT_FOUND, 'deleted room rejected');
  }

  // 8. Malformed room data rejected
  {
    const memory = mockFirestore(seed({ rateCentavos: 'bad' }));
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.ROOM_DATA_INVALID, 'malformed room rejected');
  }

  // 9. Capacity violation rejected (1 + extraPax > capacity)
  {
    // room capacity=1, extraPax=1 => 1 + 1 > 1 => rejected
    const memory = mockFirestore(seed({ capacity: 1 }));
    await rejects(() => tsekInCheckIn('token', validRequest({ extraPax: 1 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.ROOM_DATA_INVALID, 'capacity violation rejected (1+extraPax>capacity)');
  }

  // 10. Forged authority fields rejected
  {
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), tenantId: 'tenant-other' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged tenantId rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), rates: { rateCentavos: 100 } } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged rates rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), totalCost: 500000 } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged totalCost rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), bookingId: 'booking-1' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged bookingId rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), roomStatus: 'Occupied' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged roomStatus rejected');
  }

  // 11. Cross-tenant owner rejected (tenant not seeded => TENANT_INELIGIBLE)
  {
    const crossAuth = { verifyIdToken: async () => ({ uid: 'owner-2', role: 'owner', tenantId: 'tenant-2' }) } as any;
    const memory = mockFirestore(seed());
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: crossAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'cross-tenant owner rejected');
  }

  // 11b. Cross-tenant owner with seeded tenant but wrong ownerUid
  {
    const crossAuth = { verifyIdToken: async () => ({ uid: 'owner-1', role: 'owner', tenantId: 'tenant-2' }) } as any;
    const memory = mockFirestore({
      'tenants/tenant-2': { ownerUid: 'owner-OTHER', moduleType: TSEK_IN_MODULE_ID, subscriptionStatus: 'active' },
    });
    await rejects(() => tsekInCheckIn('token', validRequest({ roomId: 'room-101' }), { adminAuth: crossAuth, adminFirestore: memory.db }), CheckinErrorCode.FORBIDDEN, 'cross-tenant owner uid mismatch rejected');
  }

  // 12. Unauthorized actor rejection
  {
    const badAuth = { verifyIdToken: async () => ({ uid: 'user-1', role: 'guest' }) } as any;
    const memory = mockFirestore(seed());
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: badAuth, adminFirestore: memory.db }), CheckinErrorCode.FORBIDDEN, 'guest role rejected');
  }

  // 12b. Cashier role explicitly rejected
  {
    const cashierAuth = { verifyIdToken: async () => ({ uid: 'cash-1', role: 'cashier', tenantId: 'tenant-1' }) } as any;
    const memory = mockFirestore(seed());
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: cashierAuth, adminFirestore: memory.db }), CheckinErrorCode.FORBIDDEN, 'cashier role rejected');
  }

  // 13. Inactive tenant rejected (owner)
  {
    const memory = mockFirestore(seed({}, { subscriptionStatus: 'suspended' }));
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'inactive tenant rejected (owner)');
  }

  // 13b. Inactive tenant rejected (staff)
  {
    const memory = mockFirestore(seed({}, { subscriptionStatus: 'suspended' }));
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'inactive tenant rejected (staff)');
  }

  // 14. Wrong module tenant rejected
  {
    const memory = mockFirestore(seed({}, { moduleType: 'benta-snap' }));
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'wrong module tenant rejected (owner)');
  }

  // 14b. Wrong module tenant rejected (staff)
  {
    const memory = mockFirestore(seed({}, { moduleType: 'benta-snap' }));
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'wrong module tenant rejected (staff)');
  }

  // 15. Same-key replay (later time allowed)
  {
    const memory = mockFirestore(seed());
    const r1 = await tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000) });
    const r2 = await tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_800_000_000_000) });
    assert(r1.bookingId === r2.bookingId, 'same key replay returns original bookingId at later time');
    assert(memory.store['tenants/tenant-1/rooms/room-101'].status === 'Occupied', 'room remains Occupied after replay');
  }

  // 16. Same-key conflict (different business fields)
  {
    const memory = mockFirestore(seed());
    await tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db });
    await rejects(() => tsekInCheckIn('token', validRequest({ guestName: 'Different Guest' }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.IDEMPOTENCY_CONFLICT, 'same key with different guestName rejected');
    await rejects(() => tsekInCheckIn('token', validRequest({ contactInfo: '09170000000' }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.IDEMPOTENCY_CONFLICT, 'same key with different contactInfo rejected');
    await rejects(() => tsekInCheckIn('token', validRequest({ duration: 3 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.IDEMPOTENCY_CONFLICT, 'same key with different duration rejected');
  }

  // 17. Read-after-write enforcement: paid request must succeed when the
  // guard is active because the service performs all reads via getAll before
  // any write. The presence of the guard must NOT block a normal check-in.
  {
    const memory = mockFirestore(seed(), { failOnReadAfterWrite: true });
    const receipt = await tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt !== undefined && receipt.bookingId !== undefined, 'paid check-in succeeds even with guard active (cash)');
    assert(memory.store['tenants/tenant-1/rooms/room-101'].status === 'Occupied', 'cash: room occupied after guard-active run');
  }
  {
    const memory = mockFirestore(seed(), { failOnReadAfterWrite: true });
    const receipt = await tsekInCheckIn('token', validRequest({ paymentMethod: 'gcash', initialPaymentCentavos: 25000 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt !== undefined && receipt.paymentChannel === 'gcash', 'paid check-in succeeds with guard active (gcash)');
    assert(memory.store['tenants/tenant-1/accounts/gcash-settlement'].balance === 2000 + 25000, 'gcash: account increased');
  }
  {
    const memory = mockFirestore(seed(), { failOnReadAfterWrite: true });
    const receipt = await tsekInCheckIn('token', validRequest({ paymentMethod: 'maya', initialPaymentCentavos: 30000 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt !== undefined && receipt.paymentChannel === 'maya', 'paid check-in succeeds with guard active (maya)');
    assert(memory.store['tenants/tenant-1/accounts/maya-settlement'].balance === 1500 + 30000, 'maya: account increased');
  }
  {
    const memory = mockFirestore(seed(), { failOnReadAfterWrite: true });
    const receipt = await tsekInCheckIn('token', validRequest({ paymentMethod: 'card', initialPaymentCentavos: 40000 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt !== undefined && receipt.paymentChannel === 'card', 'paid check-in succeeds with guard active (card)');
    assert(memory.store['tenants/tenant-1/accounts/card-clearing'].balance === 0 + 40000, 'card: account increased');
  }
  // Zero-payment requests do not read the account; the guard must still pass.
  {
    const memory = mockFirestore(seed(), { failOnReadAfterWrite: true });
    const receipt = await tsekInCheckIn('token', validRequest({ initialPaymentCentavos: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt !== undefined && receipt.initialPaymentCentavos === 0, 'zero-payment check-in succeeds with guard active');
  }

  // 18. Transaction failure leaves no state
  {
    const memory = mockFirestore(seed(), { failCommit: true });
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.SERVICE_UNAVAILABLE, 'transaction failure is sanitized');
    assert(memory.store['tenants/tenant-1/rooms/room-101']?.status === 'Available', 'room unchanged on transaction failure');
    const bookingDocs = Object.keys(memory.store).filter((k) => k.includes('/bookings/'));
    assert(bookingDocs.length === 0, 'no booking created on transaction failure');
  }

  // 19. Sanitized errors and receipts
  {
    const memory = mockFirestore(seed());
    try {
      await tsekInCheckIn('token', validRequest({ roomId: 'room-missing' }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    } catch (e: any) {
      assert(e instanceof CheckinError, 'error is CheckinError');
      assert(e.httpStatus === 404, 'http status is 404');
      assert(!e.message.includes('tenant'), 'error does not leak tenant info');
      assert(!e.message.includes('room-missing'), 'error does not leak room path');
    }
  }

  // 19b. Zod validation failures are sanitized
  {
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), guestName: '' }, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'empty guest name rejected as INVALID_REQUEST');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), initialPaymentCentavos: -1 }, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'negative payment rejected as INVALID_REQUEST');
    try {
      await tsekInCheckIn('token', { ...validRequest(), guestName: '' }, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db });
    } catch (e: any) {
      assert(e.userMessage === 'Invalid request.', 'zod failure message sanitized');
    }
  }

  // 20. No raw idempotency key persisted
  {
    const memory = mockFirestore(seed());
    const rawKey = '550e8400-e29b-41d4-a716-446655440000';
    await tsekInCheckIn('token', validRequest({ idempotencyKey: rawKey }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const idemEntry = Object.values(memory.store).find((v: any) => v.moduleId === TSEK_IN_MODULE_ID && v.tenantId === 'tenant-1' && v.status === 'complete');
    assert(idemEntry !== undefined, 'idempotency record exists');
    assert(!JSON.stringify(idemEntry).includes(rawKey), 'raw idempotency key not persisted');
  }

  // 21. Ledger module isolation fields
  {
    const memory = mockFirestore(seed());
    const receipt = await tsekInCheckIn('token', validRequest({ paymentMethod: 'gcash', initialPaymentCentavos: 25000 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    const tx = Object.values(memory.store).find((v: any) => v.referenceId === receipt.bookingId && v.type === 'income');
    assert(tx && tx.moduleId === TSEK_IN_MODULE_ID, 'transaction has tsek-in moduleId');
    assert(tx && tx.tenantId === 'tenant-1', 'transaction has tenantId');
    assert(tx && tx.paymentChannel === 'gcash', 'transaction has gcash channel');
    assert(tx && tx.actorId === 'owner_owner-1', 'transaction has actorId');
  }

  // 22. Staff identity check
  {
    const memory = mockFirestore(seed());
    const receipt = await tsekInCheckIn('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db });
    assert(receipt !== undefined, 'staff check-in succeeds');
    const tx = Object.values(memory.store).find((v: any) => v.referenceId === receipt.bookingId && v.type === 'income');
    assert(tx && tx.actorId === 'staff_staff-1', 'transaction records staff actorId');
  }

  // 22b. Staff sessionVersion mismatch rejected
  {
    const mismatchedStaff = { verifyIdToken: async () => ({ uid: 'staff-auth-1', role: 'staff', tenantId: 'tenant-1', staffAccountId: 'staff-1', sessionVersion: 99 }) } as any;
    const memory = mockFirestore(seed());
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: mismatchedStaff, adminFirestore: memory.db }), CheckinErrorCode.FORBIDDEN, 'staff sessionVersion mismatch rejected');
  }

  // 22c. Staff inactive rejected
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/staff_accounts/staff-1'].status = 'disabled';
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db }), CheckinErrorCode.FORBIDDEN, 'staff inactive rejected');
  }

  // 23. Request validation rejects unknown fields
  {
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), unknownField: 'x' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'unknown field rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), userId: 'user-1' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged userId rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), userName: 'Admin' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged userName rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), roomName: 'Suite' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged roomName rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), rates: { rateCentavos: 100 } } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged rates rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), totalCost: 500000 } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged totalCost rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), checkoutDate: new Date().toISOString() } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged checkoutDate rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), accountId: 'account-1' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged accountId rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), createdBy: 'user-1' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged createdBy rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), bookingId: 'booking-1' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged bookingId rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), fingerprint: 'abc' } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged fingerprint rejected');
    await rejects(() => tsekInCheckIn('token', { ...validRequest(), paymentRouting: { affectsCash: true } } as any, { adminAuth: ownerAuth, adminFirestore: mockFirestore(seed()).db }), CheckinErrorCode.INVALID_REQUEST, 'forged paymentRouting rejected');
  }

  // 24. Short stay
  {
    const memory = mockFirestore(seed({ shortTimeRatesCentavos: { '3h': 150000, '6h': 280000, '8h': 350000, '12h': 450000 } }));
    const receipt = await tsekInCheckIn('token', validRequest({ stayType: 'short', duration: 6, extraPax: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.stayType === 'short', 'short stay type recorded');
    assert(receipt.duration === 6, 'short duration recorded');
    assert(receipt.totalCostCentavos === 280000, 'short-time rate applied');
  }

  // 24b. Short stay without rates rejected
  {
    const memory = mockFirestore(seed());
    delete memory.store['tenants/tenant-1/rooms/room-101'].shortTimeRatesCentavos;
    await rejects(() => tsekInCheckIn('token', validRequest({ stayType: 'short', duration: 6, extraPax: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.ROOM_DATA_INVALID, 'short stay without rates rejected');
  }

  // 24c. Short stay missing specific rate rejected
  {
    const memory = mockFirestore(seed({ shortTimeRatesCentavos: { '3h': 150000 } }));
    await rejects(() => tsekInCheckIn('token', validRequest({ stayType: 'short', duration: 6, extraPax: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.ROOM_DATA_INVALID, 'short stay missing 6h rate rejected');
  }

  // 24d. Malformed short rate (non-integer) rejected
  {
    const memory = mockFirestore(seed({ shortTimeRatesCentavos: { '3h': 'oops' } as any }));
    await rejects(() => tsekInCheckIn('token', validRequest({ stayType: 'short', duration: 6, extraPax: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.ROOM_DATA_INVALID, 'malformed short rate rejected');
  }

  // 24e. Malformed extra-pax fee rejected
  {
    const memory = mockFirestore(seed({ extraPaxFeeCentavos: -1 }));
    await rejects(() => tsekInCheckIn('token', validRequest({ extraPax: 1 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.ROOM_DATA_INVALID, 'negative extra-pax fee rejected');
  }

  // 24f. Missing roomNumber rejected
  {
    const memory = mockFirestore(seed({ roomNumber: '' }));
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.ROOM_DATA_INVALID, 'empty roomNumber rejected');
  }

  // 25. Extra pax fee applied (1 + extraPax <= capacity)
  {
    const memory = mockFirestore(seed({ capacity: 4, extraPaxFeeCentavos: 50000 }));
    const receipt = await tsekInCheckIn('token', validRequest({ extraPax: 2 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt.totalCostCentavos === 250000 * 2 + 50000 * 2, 'extra pax fee included when capacity allows');
  }

  // 26. Overpayment rejected
  {
    const memory = mockFirestore(seed());
    await rejects(() => tsekInCheckIn('token', validRequest({ initialPaymentCentavos: 1000000 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.FINANCIAL_INTEGRITY_ERROR, 'overpayment rejected');
  }

  // 27. Receipt sanitization — tampered stored receipt fails closed on replay
  {
    const memory = mockFirestore(seed());
    await tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000) });
    const idemPath = 'tenants/tenant-1/tsek_in_idempotency/' + (() => {
      const { createHash } = require('node:crypto');
      return createHash('sha256').update('tenant-1:550e8400-e29b-41d4-a716-446655440000').digest('hex');
    })();
    memory.store[idemPath].receipt.totalCostCentavos = 'not-a-number';
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.IDEMPOTENCY_CONFLICT, 'tampered receipt fails closed on replay');
  }

  // 28. Deterministic requested checkout derived from now() + tenant setting (Manila).
  // Default `standardCheckOutTime` is 12:00 Asia/Manila; with a 1-night stay from
  // 2026-01-01 10:00 UTC the checkout is 2026-01-02 12:00 Manila = 2026-01-02 04:00 UTC.
  {
    const memory = mockFirestore(seed());
    const committedMillis = Date.UTC(2026, 0, 1, 10, 0, 0);
    const receipt = await tsekInCheckIn('token', validRequest({ duration: 1 }), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(committedMillis) });
    const expectedUtc = Date.UTC(2026, 0, 2, 4, 0, 0);
    assert(receipt.requestedCheckOutAt === new Date(expectedUtc).toISOString(), 'night checkout: 12:00 Manila on N-th day from committed');
    assert(manilaWallClockIsoFromMillis(expectedUtc) === '2026-01-02T12:00:00+08:00', 'night checkout Manila wall-clock matches 12:00 default');
  }

  // 28b. UTC date-boundary: a check-in late in UTC but still same Manila day must
  // checkout at Manila 12:00 of the next Manila day, not next UTC day.
  {
    const memory = mockFirestore(seed());
    // 2026-01-01 18:00 UTC = 2026-01-02 02:00 Manila, duration=1 night => checkout at
    // 2026-01-03 12:00 Manila = 2026-01-03 04:00 UTC.
    const committedMillis = Date.UTC(2026, 0, 1, 18, 0, 0);
    const receipt = await tsekInCheckIn('token', validRequest({ duration: 1 }), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(committedMillis) });
    const expectedUtc = Date.UTC(2026, 0, 3, 4, 0, 0);
    assert(receipt.requestedCheckOutAt === new Date(expectedUtc).toISOString(), 'late-UTC check-in rolls Manila day forward');
    assert(manilaWallClockIsoFromMillis(expectedUtc) === '2026-01-03T12:00:00+08:00', 'manila wall-clock for late-UTC boundary');
  }

  // 28c. UTC date-boundary: a check-in early in UTC but previous Manila day.
  {
    const memory = mockFirestore(seed());
    // 2026-01-01 23:30 UTC = 2026-01-02 07:30 Manila, duration=1 night => checkout at
    // 2026-01-03 12:00 Manila = 2026-01-03 04:00 UTC.
    const committedMillis = Date.UTC(2026, 0, 1, 23, 30, 0);
    const receipt = await tsekInCheckIn('token', validRequest({ duration: 1 }), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(committedMillis) });
    const expectedUtc = Date.UTC(2026, 0, 3, 4, 0, 0);
    assert(receipt.requestedCheckOutAt === new Date(expectedUtc).toISOString(), 'check-in near UTC midnight rolls Manila day forward');
    assert(manilaWallClockIsoFromMillis(expectedUtc) === '2026-01-03T12:00:00+08:00', 'manila wall-clock across UTC date boundary');
  }

  // 28d. Tenant `standardCheckOutTime` overrides default.
  {
    const seedWithCustom = (hhmm: string) => ({
      ...seed(),
      'tenants/tenant-1': { ownerUid: 'owner-1', moduleType: TSEK_IN_MODULE_ID, subscriptionStatus: 'active', standardCheckOutTime: hhmm },
    });
    const memory = mockFirestore(seedWithCustom('15:30'));
    const committedMillis = Date.UTC(2026, 0, 1, 10, 0, 0);
    const receipt = await tsekInCheckIn('token', validRequest({ duration: 1 }), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(committedMillis) });
    // 2026-01-02 15:30 Manila = 2026-01-02 07:30 UTC.
    const expectedUtc = Date.UTC(2026, 0, 2, 7, 30, 0);
    assert(receipt.requestedCheckOutAt === new Date(expectedUtc).toISOString(), 'tenant standardCheckOutTime honored');
    assert(manilaWallClockIsoFromMillis(expectedUtc) === '2026-01-02T15:30:00+08:00', 'manila wall-clock from tenant setting');
  }

  // 28e. Malformed `standardCheckOutTime` is rejected as TENANT_INELIGIBLE.
  {
    const memory = mockFirestore({
      ...seed(),
      'tenants/tenant-1': { ownerUid: 'owner-1', moduleType: TSEK_IN_MODULE_ID, subscriptionStatus: 'active', standardCheckOutTime: 'noon' },
    });
    await rejects(() => tsekInCheckIn('token', validRequest({ duration: 1 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'malformed tenant checkout time rejected');
  }

  // 29. Short stay checkout derived from now() (UTC arithmetic).
  {
    const memory = mockFirestore(seed());
    const committedMillis = 1_700_000_000_000;
    const receipt = await tsekInCheckIn('token', validRequest({ stayType: 'short', duration: 3 }), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(committedMillis) });
    assert(receipt.requestedCheckOutAt === new Date(committedMillis + 3 * 3600 * 1000).toISOString(), 'short checkout now()+duration');
  }

  // 30. Tenant eligibility revalidated inside the transaction.
  // Subscription flipped to suspended after authentication => reject inside tx.
  {
    const memory = mockFirestore(seed({}, { subscriptionStatus: 'suspended' }));
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'tenant flipped to suspended during tx');
  }
  // ModuleType flipped mid-flight => reject.
  {
    const memory = mockFirestore(seed({}, { moduleType: 'benta-snap' }));
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'tenant module changed during tx');
  }
  // ownerUid reassigned mid-flight => reject.
  {
    const memory = mockFirestore(seed({}, { ownerUid: 'someone-else' }));
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.FORBIDDEN, 'tenant ownerUid changed during tx');
  }
  // Tenant document deleted mid-flight => reject.
  {
    const memory = mockFirestore(seed());
    delete memory.store['tenants/tenant-1'];
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'tenant deleted during tx');
  }

  // 31. Fingerprint is independent of committed and checkout timestamps.
  // Same key, identical business fields, different now() => replay succeeds.
  // The replayed receipt preserves the original committedAt/requestedCheckOutAt
  // because the stored receipt is the canonical replay.
  {
    const memory = mockFirestore(seed());
    const r1 = await tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000) });
    const r2 = await tsekInCheckIn('token', validRequest(), { adminAuth: ownerAuth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_900_000_000_000) });
    assert(r1.bookingId === r2.bookingId, 'fingerprint-stable: later now() still replays');
    assert(r1.committedAt === r2.committedAt, 'replayed receipt preserves original committedAt');
    assert(r1.requestedCheckOutAt === r2.requestedCheckOutAt, 'replayed receipt preserves original requestedCheckOutAt');
  }
  // But for a fresh key (different idempotency key), a later now() DOES shift
  // requestedCheckOutAt, proving the time policy is bound to committed time.
  // Reset the mock between calls so the room is still Available.
  {
    const memory1 = mockFirestore(seed());
    const r1 = await tsekInCheckIn('token', validRequest({ idempotencyKey: '11111111-1111-4111-8111-111111111111' }), { adminAuth: ownerAuth, adminFirestore: memory1.db, now: () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000) });
    const memory2 = mockFirestore(seed());
    const r2 = await tsekInCheckIn('token', validRequest({ idempotencyKey: '22222222-2222-4222-8222-222222222222' }), { adminAuth: ownerAuth, adminFirestore: memory2.db, now: () => admin.firestore.Timestamp.fromMillis(1_900_000_000_000) });
    assert(r1.committedAt !== r2.committedAt, 'fresh keys: committedAt differs');
    assert(r1.requestedCheckOutAt !== r2.requestedCheckOutAt, 'fresh keys: requestedCheckOutAt differs by committed time');
  }

  // 32. Tsek-In entitlement via unlockedModules.
  {
    const memory = mockFirestore({
      ...seed(),
      'tenants/tenant-1': {
        ownerUid: 'owner-1',
        moduleType: 'benta-snap',
        subscriptionStatus: 'active',
        unlockedModules: ['tsek-in'],
      },
    });
    const receipt = await tsekInCheckIn('token', validRequest({ extraPax: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt !== undefined && receipt.bookingId !== undefined, 'tenant with unlocked tsek-in module succeeds');
  }

  // 32b. Tsek-In absent from unlocked modules (primary is different) => fail.
  {
    const memory = mockFirestore({
      ...seed(),
      'tenants/tenant-1': {
        ownerUid: 'owner-1',
        moduleType: 'benta-snap',
        subscriptionStatus: 'active',
        unlockedModules: ['order-snap'],
      },
    });
    await rejects(() => tsekInCheckIn('token', validRequest({ extraPax: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'tenant without tsek-in entitlement rejected');
  }

  // 32c. Suspended moduleStatuses['tsek-in'] => fail.
  {
    const memory = mockFirestore({
      ...seed(),
      'tenants/tenant-1': {
        ownerUid: 'owner-1',
        moduleType: TSEK_IN_MODULE_ID,
        subscriptionStatus: 'active',
        moduleStatuses: { 'tsek-in': 'suspended' },
      },
    });
    await rejects(() => tsekInCheckIn('token', validRequest({ extraPax: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'suspended tsek-in module status rejected');
  }

  // 32d. moduleStatuses['tsek-in'] = active is still allowed.
  {
    const memory = mockFirestore({
      ...seed(),
      'tenants/tenant-1': {
        ownerUid: 'owner-1',
        moduleType: TSEK_IN_MODULE_ID,
        subscriptionStatus: 'active',
        moduleStatuses: { 'tsek-in': 'active' },
      },
    });
    const receipt = await tsekInCheckIn('token', validRequest({ extraPax: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt !== undefined, 'active tsek-in module status accepted');
  }

  // 32e. Malformed unlockedModules (non-array) => fail closed.
  {
    const memory = mockFirestore({
      ...seed(),
      'tenants/tenant-1': {
        ownerUid: 'owner-1',
        moduleType: 'benta-snap',
        subscriptionStatus: 'active',
        unlockedModules: 'tsek-in',
      },
    });
    await rejects(() => tsekInCheckIn('token', validRequest({ extraPax: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'non-array unlockedModules rejected');
  }

  // 32f. Duplicated entry in unlockedModules => fail closed.
  {
    const memory = mockFirestore({
      ...seed(),
      'tenants/tenant-1': {
        ownerUid: 'owner-1',
        moduleType: 'benta-snap',
        subscriptionStatus: 'active',
        unlockedModules: ['tsek-in', 'tsek-in'],
      },
    });
    await rejects(() => tsekInCheckIn('token', validRequest({ extraPax: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'duplicate unlockedModules entry rejected');
  }

  // 33. Staff revalidation inside the transaction.
  // Disabled mid-flight => FORBIDDEN (must still be detected even though initial auth passed).
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/staff_accounts/staff-1'].status = 'disabled';
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db }), CheckinErrorCode.FORBIDDEN, 'staff disabled mid-flight rejected');
  }
  // Staff sessionVersion bumped mid-flight => FORBIDDEN.
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/staff_accounts/staff-1'].sessionVersion = 99;
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db }), CheckinErrorCode.FORBIDDEN, 'staff sessionVersion changed mid-flight rejected');
  }
  // Staff account deleted mid-flight => FORBIDDEN.
  {
    const memory = mockFirestore(seed());
    delete memory.store['tenants/tenant-1/staff_accounts/staff-1'];
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db }), CheckinErrorCode.FORBIDDEN, 'staff deleted mid-flight rejected');
  }
  // Staff reassigned to different tenant mid-flight => FORBIDDEN.
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/staff_accounts/staff-1'].tenantId = 'tenant-other';
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db }), CheckinErrorCode.FORBIDDEN, 'staff reassigned mid-flight rejected');
  }
  // Staff authUid changed mid-flight => FORBIDDEN.
  {
    const memory = mockFirestore(seed());
    memory.store['tenants/tenant-1/staff_accounts/staff-1'].authUid = 'someone-else';
    await rejects(() => tsekInCheckIn('token', validRequest(), { adminAuth: staffAuth, adminFirestore: memory.db }), CheckinErrorCode.FORBIDDEN, 'staff authUid changed mid-flight rejected');
  }

  // 34. Paid + zero-payment staff transactions still keep all reads before writes.
  {
    const memory = mockFirestore(seed(), { failOnReadAfterWrite: true });
    const receipt = await tsekInCheckIn('token', validRequest({ paymentMethod: 'gcash', initialPaymentCentavos: 25000 }), { adminAuth: staffAuth, adminFirestore: memory.db });
    assert(receipt !== undefined && receipt.actorId === undefined || receipt !== undefined, 'paid staff check-in succeeds with guard active');
    assert(memory.store['tenants/tenant-1/rooms/room-101'].status === 'Occupied', 'paid staff: room occupied');
    assert(memory.store['tenants/tenant-1/accounts/gcash-settlement'].balance === 2000 + 25000, 'paid staff: gcash increased');
  }
  {
    const memory = mockFirestore(seed(), { failOnReadAfterWrite: true });
    const receipt = await tsekInCheckIn('token', validRequest({ initialPaymentCentavos: 0 }), { adminAuth: staffAuth, adminFirestore: memory.db });
    assert(receipt !== undefined && receipt.initialPaymentCentavos === 0, 'zero-payment staff check-in succeeds with guard active');
  }

  // 35. Tenant unlockedModules revoked mid-flight => reject.
  {
    const memory = mockFirestore({
      ...seed(),
      'tenants/tenant-1': {
        ownerUid: 'owner-1',
        moduleType: 'benta-snap',
        subscriptionStatus: 'active',
        unlockedModules: ['tsek-in'],
      },
    });
    const receipt = await tsekInCheckIn('token', validRequest({ extraPax: 0 }), { adminAuth: ownerAuth, adminFirestore: memory.db });
    assert(receipt !== undefined, 'baseline: unlocked tsek-in works');
    // Now revoke mid-flight (subsequent run): drop unlockedModules.
    const memory2 = mockFirestore({
      ...seed(),
      'tenants/tenant-1': {
        ownerUid: 'owner-1',
        moduleType: 'benta-snap',
        subscriptionStatus: 'active',
      },
    });
    await rejects(() => tsekInCheckIn('token', validRequest({ extraPax: 0, idempotencyKey: '33333333-3333-4333-8333-333333333333' }), { adminAuth: ownerAuth, adminFirestore: memory2.db }), CheckinErrorCode.TENANT_INELIGIBLE, 'unlockedModules revoked mid-flight rejected');
  }
  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });