import * as admin from 'firebase-admin';
import {
  applySaleToShift, assertReconciliationShift, closeBentaCashierShift, getCurrentShiftReceipt,
  SHIFT_RECONCILIATION_VERSION, validateShiftCloseRequest
} from '../src/lib/server/benta-cashier-shift-receipt';
import { CheckoutError, CheckoutErrorCode } from '../src/lib/server/benta-cashier-checkout';

let passed = 0;
let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
async function rejects(fn: () => unknown | Promise<unknown>, code: CheckoutErrorCode, message: string) {
  try { await fn(); assert(false, message); } catch (error) { assert(error instanceof CheckoutError && error.code === code, message); }
}

function memoryFirestore(seed: Record<string, any>) {
  const store = structuredClone(seed);
  let id = 0;
  const query = (path: string, filters: Array<[string, unknown]> = [], maximum = Infinity): any => ({
    path, filters, maximum, doc: (name?: string) => { const docId = name || `generated-${++id}`; const full = `${path}/${docId}`; return { id: docId, path: full, collection: (child: string) => collection(`${full}/${child}`) }; },
    where: (field: string, _operator: string, value: unknown) => query(path, [...filters, [field, value]], maximum),
    limit: (value: number) => query(path, filters, value)
  });
  const collection = (path: string): any => query(path);
  const snap = (ref: any) => ({ id: ref.id, exists: store[ref.path] !== undefined, data: () => store[ref.path] });
  const db = { collection, runTransaction: async (work: (transaction: any) => Promise<any>) => work({
    getAll: async (...refs: any[]) => refs.map(snap), get: async (ref: any) => {
      if (ref.filters) {
        const docs = Object.entries(store).filter(([path, data]) => path.startsWith(`${ref.path}/`) && path.slice(ref.path.length + 1).split('/').length === 1 && ref.filters.every(([field, value]: [string, unknown]) => (data as any)[field] === value)).slice(0, ref.maximum).map(([path, data]) => ({ id: path.split('/').pop(), exists: true, data: () => data }));
        return { size: docs.length, docs };
      }
      return snap(ref);
    },
    update: (ref: any, data: any) => { const next = { ...store[ref.path], ...data }; if ('activeShiftId' in data && typeof data.activeShiftId !== 'string') delete next.activeShiftId; store[ref.path] = next; },
    create: (ref: any, data: any) => { if (store[ref.path]) throw new Error('exists'); store[ref.path] = data; }
  }) };
  return { db: db as any, store };
}

const tenantId = 'tenant-1';
const staffId = 'cashier-1';
const identity = { uid: 'cashier-auth-1', role: 'cashier', tenantId, staffAccountId: staffId, sessionVersion: 7 };
const auth = { verifyIdToken: async () => identity } as any;
const baseShift = {
  id: 'shift-1', tenantId, moduleId: 'benta-snap', staffAccountId: staffId, staffId: `staff_${staffId}`, openedBy: `staff_${staffId}`, status: 'open', startingCash: 100_000,
  reconciliationVersion: 1, cashSales: 10_000, gcashSales: 20_000, mayaSales: 30_000,
  totalShiftSales: 60_000, electronicReceipts: 50_000, physicalCashAdjustments: 0, saleCount: 3
};
const seed = {
  [`tenants/${tenantId}`]: { moduleType: 'benta-snap', subscriptionStatus: 'active' },
  [`tenants/${tenantId}/staff_accounts/${staffId}`]: { tenantId, authUid: identity.uid, sessionVersion: 7, status: 'active', username: 'Maria', activeShiftId: 'shift-1' },
  [`tenants/${tenantId}/shifts/shift-1`]: baseShift,
  [`tenants/${tenantId}/sales/sale-1`]: {
    tenantId, moduleId: 'benta-snap', shiftId: 'shift-1', staffAccountId: staffId, actorId: `staff_${staffId}`,
    items: [{ productId: 'p1', name: 'Rice', unit: 'bag', quantity: 2, price: 5000, costPrice: 3000, lineTotal: 10000 }],
    subtotalAmount: 10000, discountAmount: 0, totalAmount: 10000, paymentMethod: 'cash', createdAt: new Date('2026-08-16T00:00:00.000Z')
  }
};

async function main() {
  console.log('BENTA CASHIER SHIFT / RECEIPT UNIT TESTS');
  const parsed = validateShiftCloseRequest({ shiftId: 'shift-1', endingCashCentavos: 110_000, notes: ' Counted ' });
  assert(parsed.notes === 'Counted', 'close request accepts only bounded resource selector, ending cash, and notes');
  for (const invalid of [
    { shiftId: 'shift-1', endingCashCentavos: 110_000, cashSales: 1 },
    { shiftId: 'shift-1', endingCashCentavos: 110_000, expectedPhysicalCash: 1 },
    { shiftId: 'shift-1', endingCashCentavos: 110_000, actorId: 'attacker' },
    { shiftId: 'shift-1', endingCashCentavos: -1 }
  ]) await rejects(() => validateShiftCloseRequest(invalid), CheckoutErrorCode.INVALID_REQUEST, 'client authority-bearing reconciliation fields rejected');

  const checked = assertReconciliationShift('shift-1', baseShift, { uid: identity.uid, tenantId, staffAccountId: staffId, sessionVersion: 7, actorId: `staff_${staffId}` });
  for (const [label, documentId, changes, code] of [
    ['stored shift id missing', 'shift-1', { id: undefined }, CheckoutErrorCode.RECONCILIATION_INVALID],
    ['stored shift id differs from document id', 'shift-1', { id: 'shift-forged' }, CheckoutErrorCode.RECONCILIATION_INVALID],
    ['staffAccountId missing', 'shift-1', { staffAccountId: undefined }, CheckoutErrorCode.RECONCILIATION_INVALID],
    ['staffAccountId mismatched', 'shift-1', { staffAccountId: 'other' }, CheckoutErrorCode.RECONCILIATION_INVALID],
    ['staffId missing', 'shift-1', { staffId: undefined }, CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED],
    ['staffId mismatched', 'shift-1', { staffId: 'staff_other' }, CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED],
    ['tenant missing', 'shift-1', { tenantId: undefined }, CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED],
    ['tenant mismatched', 'shift-1', { tenantId: 'tenant-other' }, CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED],
    ['module missing', 'shift-1', { moduleId: undefined }, CheckoutErrorCode.RECONCILIATION_INVALID],
    ['module incorrect', 'shift-1', { moduleId: 'build-stack' }, CheckoutErrorCode.RECONCILIATION_INVALID],
    ['status invalid', 'shift-1', { status: 'pending' }, CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED],
    ['reconciliation version invalid', 'shift-1', { reconciliationVersion: 2 }, CheckoutErrorCode.RECONCILIATION_INVALID]
  ] as const) {
    await rejects(
      () => assertReconciliationShift(documentId, { ...baseShift, ...changes }, { uid: identity.uid, tenantId, staffAccountId: staffId, sessionVersion: 7, actorId: `staff_${staffId}` }),
      code,
      `${label} fails authoritative shift validation`
    );
  }
  const cash = applySaleToShift({ ...checked, cashSales: 0, gcashSales: 0, mayaSales: 0, totalShiftSales: 0, electronicReceipts: 0, saleCount: 0 }, 'cash', 10_000);
  const gcash = applySaleToShift({ ...checked, ...cash }, 'gcash', 20_000);
  const maya = applySaleToShift({ ...checked, ...gcash }, 'maya', 30_000);
  assert(maya.totalShiftSales === 60_000 && maya.electronicReceipts === 50_000 && maya.cashSales === 10_000, 'Cash, GCash, and Maya aggregate by payment method');

  const memory = memoryFirestore(seed);
  const summary = await closeBentaCashierShift('token', { shiftId: 'shift-1', endingCashCentavos: 110_000 }, { adminAuth: auth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000) });
  assert(summary.totalShiftSales === 60_000 && summary.electronicReceipts === 50_000, 'close preserves total sales and electronic receipts');
  assert(summary.expectedPhysicalCashCentavos === 110_000 && summary.discrepancyCentavos === 0, 'expected drawer cash includes starting cash and cash sales only');
  assert(memory.store[`tenants/${tenantId}/shifts/shift-1`].closedBy === `staff_${staffId}`, 'authenticated Cashier actor closes the shift');
  assert(!Object.prototype.hasOwnProperty.call(memory.store[`tenants/${tenantId}/staff_accounts/${staffId}`], 'activeShiftId'), 'close atomically clears the matching active-shift pointer');

  const receiptMemory = memoryFirestore(seed);
  const receipt = await getCurrentShiftReceipt('token', 'sale-1', { adminAuth: auth, adminFirestore: receiptMemory.db });
  assert(receipt.saleId === 'sale-1' && receipt.totalCentavos === 10000, 'current open-shift receipt returned');
  const serializedReceipt = JSON.stringify(receipt);
  assert(!serializedReceipt.includes('costPrice') && !serializedReceipt.includes('sessionVersion') && !serializedReceipt.includes('cashier-auth'), 'receipt excludes cost and security internals');

  const mismatchedIdClose = memoryFirestore({ ...seed, [`tenants/${tenantId}/shifts/shift-1`]: { ...baseShift, id: 'forged-shift-id' } });
  const mismatchedIdCloseState = JSON.stringify(mismatchedIdClose.store);
  await rejects(() => closeBentaCashierShift('token', { shiftId: 'shift-1', endingCashCentavos: 110_000 }, { adminAuth: auth, adminFirestore: mismatchedIdClose.db }), CheckoutErrorCode.RECONCILIATION_INVALID, 'shift close rejects stored id that contradicts the Firestore document id');
  assert(JSON.stringify(mismatchedIdClose.store) === mismatchedIdCloseState, 'rejected corrupted close leaves all controlled state unchanged');
  const mismatchedIdReceipt = memoryFirestore({ ...seed, [`tenants/${tenantId}/shifts/shift-1`]: { ...baseShift, id: 'forged-shift-id' } });
  await rejects(() => getCurrentShiftReceipt('token', 'sale-1', { adminAuth: auth, adminFirestore: mismatchedIdReceipt.db }), CheckoutErrorCode.RECEIPT_UNAVAILABLE, 'receipt retrieval rejects stored id that contradicts the Firestore document id');

  const corrupt = memoryFirestore({ ...seed, [`tenants/${tenantId}/shifts/shift-1`]: { ...baseShift, totalShiftSales: 1 } });
  await rejects(() => closeBentaCashierShift('token', { shiftId: 'shift-1', endingCashCentavos: 0 }, { adminAuth: auth, adminFirestore: corrupt.db }), CheckoutErrorCode.RECONCILIATION_INVALID, 'inconsistent shift aggregates fail closed');
  assert(corrupt.store[`tenants/${tenantId}/shifts/shift-1`].status === 'open', 'corrupt shift remains open and unmodified');
  const legacy = memoryFirestore({ ...seed, [`tenants/${tenantId}/shifts/shift-1`]: { tenantId, staffId: `staff_${staffId}`, status: 'open', startingCash: 100_000 } });
  await rejects(() => closeBentaCashierShift('token', { shiftId: 'shift-1', endingCashCentavos: 0 }, { adminAuth: auth, adminFirestore: legacy.db }), CheckoutErrorCode.RECONCILIATION_INVALID, 'legacy shift is rejected without historical repair');
  assert(legacy.store[`tenants/${tenantId}/shifts/shift-1`].reconciliationVersion === undefined, 'legacy shift is not mutated');

  for (const [name, changes] of [
    ['closed shift', { shift: { status: 'closed' } }],
    ['other Cashier sale', { sale: { staffAccountId: 'other', actorId: 'staff_other' } }],
    ['legacy unattributed sale', { sale: { shiftId: undefined, staffAccountId: undefined, actorId: undefined } }],
    ['wrong module sale', { sale: { moduleId: 'build-stack' } }]
  ] as const) {
    const denied = memoryFirestore({ ...seed,
      [`tenants/${tenantId}/shifts/shift-1`]: { ...baseShift, ...(changes.shift || {}) },
      [`tenants/${tenantId}/sales/sale-1`]: { ...seed[`tenants/${tenantId}/sales/sale-1`], ...(changes.sale || {}) }
    });
    await rejects(() => getCurrentShiftReceipt('token', 'sale-1', { adminAuth: auth, adminFirestore: denied.db }), CheckoutErrorCode.RECEIPT_UNAVAILABLE, `${name} receipt denied`);
  }

  assert(SHIFT_RECONCILIATION_VERSION === 1, 'explicit reconciliation schema version is stable');
  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
