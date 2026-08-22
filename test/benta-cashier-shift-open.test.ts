import * as admin from 'firebase-admin';
import { CheckoutError, CheckoutErrorCode } from '../src/lib/server/benta-cashier-checkout';
import { MAX_STARTING_CASH_CENTAVOS, openBentaCashierShift, validateShiftOpenRequest } from '../src/lib/server/benta-cashier-shift-open';

let passed = 0; let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
async function rejects(fn: () => unknown | Promise<unknown>, code: CheckoutErrorCode, message: string) { try { await fn(); assert(false, message); } catch (error) { assert(error instanceof CheckoutError && error.code === code, message); } }

function memory(seed: Record<string, any>) {
  const store = structuredClone(seed); let sequence = 0;
  const query = (path: string, filters: Array<[string, unknown]> = [], maximum = Infinity): any => ({ path, filters, maximum,
    doc: (id?: string) => { const name = id || `generated-${++sequence}`; const full = `${path}/${name}`; return { id: name, path: full, collection: (child: string) => collection(`${full}/${child}`) }; },
    where: (field: string, _operator: string, value: unknown) => query(path, [...filters, [field, value]], maximum), limit: (value: number) => query(path, filters, value) });
  const collection = (path: string): any => query(path);
  const snap = (ref: any) => ({ id: ref.id, exists: store[ref.path] !== undefined, data: () => store[ref.path] });
  const db = { collection, runTransaction: async (work: (transaction: any) => Promise<any>) => work({
    getAll: async (...refs: any[]) => refs.map(snap),
    get: async (ref: any) => ref.filters ? (() => { const docs = Object.entries(store).filter(([path, data]) => path.startsWith(`${ref.path}/`) && path.slice(ref.path.length + 1).split('/').length === 1 && ref.filters.every(([field, value]: [string, unknown]) => (data as any)[field] === value)).slice(0, ref.maximum).map(([path, data]) => ({ id: path.split('/').pop(), data: () => data })); return { empty: docs.length === 0, size: docs.length, docs }; })() : snap(ref),
    create: (ref: any, data: any) => { if (store[ref.path]) throw new Error('exists'); store[ref.path] = data; },
    update: (ref: any, data: any) => { const next = { ...store[ref.path], ...data }; if ('activeShiftId' in data && typeof data.activeShiftId !== 'string') delete next.activeShiftId; store[ref.path] = next; }
  }) };
  return { db: db as any, store };
}

const tenantId = 'tenant-1'; const staffId = 'cashier-1';
const auth = { verifyIdToken: async () => ({ uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: staffId, sessionVersion: 4 }) } as any;
const base = {
  [`tenants/${tenantId}`]: { moduleType: 'benta-snap', subscriptionStatus: 'active' },
  [`tenants/${tenantId}/staff_accounts/${staffId}`]: { tenantId, authUid: 'uid-1', sessionVersion: 4, status: 'active', username: 'Maria' }
};
const request = { idempotencyKey: '123e4567-e89b-42d3-a456-426614174000', startingCashCentavos: 100_000 };

async function main() {
  console.log('BENTA SECURE SHIFT OPEN UNIT TESTS');
  assert(validateShiftOpenRequest({ ...request, startingCashCentavos: 0 }).startingCashCentavos === 0, 'zero starting cash accepted');
  assert(validateShiftOpenRequest({ ...request, startingCashCentavos: MAX_STARTING_CASH_CENTAVOS }).startingCashCentavos === 10_000_000, 'maximum exact centavo value accepted');
  for (const value of [-1, 1.5, '100', NaN, Infinity, Number.MAX_SAFE_INTEGER, 10_000_001]) await rejects(() => validateShiftOpenRequest({ ...request, startingCashCentavos: value }), CheckoutErrorCode.INVALID_REQUEST, 'invalid starting cash rejected');
  for (const field of ['tenantId', 'staffAccountId', 'actorId', 'shiftId', 'status', 'moduleId', 'openedAt', 'cashSales', 'expectedPhysicalCash']) await rejects(() => validateShiftOpenRequest({ ...request, [field]: 'forged' }), CheckoutErrorCode.INVALID_REQUEST, `client authority field ${field} rejected`);

  const state = memory(base);
  const first = await openBentaCashierShift('token', request, { adminAuth: auth, adminFirestore: state.db, now: () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000) });
  const staff = state.store[`tenants/${tenantId}/staff_accounts/${staffId}`];
  const shift = state.store[`tenants/${tenantId}/shifts/${first.shiftId}`];
  assert(staff.activeShiftId === first.shiftId && shift.staffAccountId === staffId && shift.staffId === `staff_${staffId}`, 'opening atomically binds both pointer directions');
  assert(shift.startingCash === 100_000 && shift.cashSales === 0 && shift.gcashSales === 0 && shift.mayaSales === 0 && shift.saleCount === 0, 'opening initializes immutable starting cash and zero accounting state');
  const beforeReplay = JSON.stringify(state.store);
  const replay = await openBentaCashierShift('token', request, { adminAuth: auth, adminFirestore: state.db });
  assert(replay.shiftId === first.shiftId && JSON.stringify(state.store) === beforeReplay, 'open-shift replay with the correct pointer succeeds without mutation');
  const expectOpenReplayRecovery = async (label: string, pointer: unknown, target?: Record<string, unknown>) => {
    if (pointer === undefined) delete staff.activeShiftId; else staff.activeShiftId = pointer;
    if (target) state.store[`tenants/${tenantId}/shifts/${String(pointer)}`] = target;
    const snapshot = JSON.stringify(state.store);
    await rejects(() => openBentaCashierShift('token', request, { adminAuth: auth, adminFirestore: state.db }), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, `open-shift replay with ${label} fails closed`);
    assert(JSON.stringify(state.store) === snapshot, `open-shift replay with ${label} is mutation-free`);
    if (target) delete state.store[`tenants/${tenantId}/shifts/${String(pointer)}`];
    staff.activeShiftId = first.shiftId;
  };
  await expectOpenReplayRecovery('missing pointer', undefined);
  await expectOpenReplayRecovery('malformed pointer', 'bad/value');
  await expectOpenReplayRecovery('dangling pointer', 'missing-shift');
  await expectOpenReplayRecovery('different valid pointer', 'different-shift', { ...shift, id: 'different-shift', status: 'open' });
  await expectOpenReplayRecovery('corrupted pointer target', 'corrupted-shift', { ...shift, id: 'contradictory-id', status: 'open' });
  shift.id = 'contradictory-id';
  const corruptOriginalState = JSON.stringify(state.store);
  await rejects(() => openBentaCashierShift('token', request, { adminAuth: auth, adminFirestore: state.db }), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'opening replay rejects an original shift whose stored id contradicts its Firestore document id');
  assert(JSON.stringify(state.store) === corruptOriginalState, 'corrupted original replay remains mutation-free');
  shift.id = first.shiftId;
  await rejects(() => openBentaCashierShift('token', { ...request, startingCashCentavos: 200_000 }, { adminAuth: auth, adminFirestore: state.db }), CheckoutErrorCode.IDEMPOTENCY_CONFLICT, 'same key with different starting cash conflicts');
  delete staff.activeShiftId; shift.status = 'closed';
  const closedState = JSON.stringify(state.store);
  const closedReplay = await openBentaCashierShift('token', request, { adminAuth: auth, adminFirestore: state.db });
  assert(closedReplay.shiftId === first.shiftId && closedReplay.status === 'closed' && JSON.stringify(state.store) === closedState, 'closed-shift replay without a pointer returns the original result without mutation');
  const expectClosedReplayRecovery = async (label: string, pointer: unknown, target?: Record<string, unknown>) => {
    staff.activeShiftId = pointer;
    if (target) state.store[`tenants/${tenantId}/shifts/${String(pointer)}`] = target;
    const snapshot = JSON.stringify(state.store);
    await rejects(() => openBentaCashierShift('token', request, { adminAuth: auth, adminFirestore: state.db }), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, `closed-shift replay with ${label} fails closed`);
    assert(JSON.stringify(state.store) === snapshot, `closed-shift replay with ${label} is mutation-free`);
    if (target) delete state.store[`tenants/${tenantId}/shifts/${String(pointer)}`];
    delete staff.activeShiftId;
  };
  await expectClosedReplayRecovery('stale pointer to the original shift', first.shiftId);
  await expectClosedReplayRecovery('malformed pointer', 'bad/value');
  await expectClosedReplayRecovery('dangling pointer', 'missing-shift');
  const newerShift = { ...shift, id: 'newer-shift', status: 'open' };
  staff.activeShiftId = 'newer-shift'; state.store[`tenants/${tenantId}/shifts/newer-shift`] = newerShift;
  const newerReplayState = JSON.stringify(state.store);
  const newerReplay = await openBentaCashierShift('token', request, { adminAuth: auth, adminFirestore: state.db });
  assert(newerReplay.shiftId === first.shiftId && newerReplay.status === 'closed' && JSON.stringify(state.store) === newerReplayState, 'closed-shift replay with a valid newer active shift succeeds without mutation');
  newerShift.id = 'contradictory-id';
  const corruptNewerState = JSON.stringify(state.store);
  await rejects(() => openBentaCashierShift('token', request, { adminAuth: auth, adminFirestore: state.db }), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'closed-shift replay rejects a corrupted newer active shift');
  assert(JSON.stringify(state.store) === corruptNewerState, 'corrupted newer-shift replay is mutation-free');
  delete state.store[`tenants/${tenantId}/shifts/newer-shift`]; delete staff.activeShiftId;

  for (const [label, staffChange, shiftSeed] of [
    ['missing pointer target', { activeShiftId: 'missing' }, {}],
    ['malformed pointer', { activeShiftId: 'bad/value' }, {}],
    ['closed referenced shift', { activeShiftId: 'x' }, { 'tenants/tenant-1/shifts/x': { ...shift, id: 'x', status: 'closed' } }],
    ['legacy referenced shift', { activeShiftId: 'x' }, { 'tenants/tenant-1/shifts/x': { tenantId, staffId: `staff_${staffId}`, status: 'open' } }],
    ['stored id contradicts pointer document', { activeShiftId: 'x' }, { 'tenants/tenant-1/shifts/x': { ...shift, id: 'other-id', status: 'open' } }],
    ['open shift without pointer', {}, { 'tenants/tenant-1/shifts/x': { ...shift, id: 'x', status: 'open' } }]
  ] as const) {
    const inconsistent = memory({ ...base, [`tenants/${tenantId}/staff_accounts/${staffId}`]: { ...base[`tenants/${tenantId}/staff_accounts/${staffId}`], ...staffChange }, ...shiftSeed });
    const snapshot = JSON.stringify(inconsistent.store);
    await rejects(() => openBentaCashierShift('token', { ...request, idempotencyKey: '223e4567-e89b-42d3-a456-426614174001' }, { adminAuth: auth, adminFirestore: inconsistent.db }), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, `${label} fails closed`);
    assert(JSON.stringify(inconsistent.store) === snapshot, `${label} is not repaired or mutated`);
  }
  console.log(`RESULT ${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
