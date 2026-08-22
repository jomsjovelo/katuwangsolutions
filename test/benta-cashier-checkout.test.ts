import * as admin from 'firebase-admin';
import {
  CheckoutError, CheckoutErrorCode, checkoutFingerprint, checkoutIdempotencyDocumentId,
  completeBentaCashierCheckout, validateCheckoutRequest
} from '../src/lib/server/benta-cashier-checkout';

let passed = 0;
let failed = 0;
function assert(value: unknown, message: string) {
  if (value) { console.log(`  PASS ${message}`); passed++; }
  else { console.error(`  FAIL ${message}`); failed++; }
}
async function rejects(fn: () => unknown | Promise<unknown>, code: CheckoutErrorCode, message: string) {
  try { await fn(); assert(false, message); }
  catch (error) { assert(error instanceof CheckoutError && error.code === code, message); }
}

const request = {
  idempotencyKey: '123e4567-e89b-42d3-a456-426614174000', moduleId: 'benta-snap' as const, shiftId: 'shift-1',
  items: [{ productId: 'product-1', quantity: 2 }], paymentMethod: 'cash' as const
};

function mockFirestore(seed: Record<string, any>, failCommit = false) {
  let sequence = 0;
  const store = structuredClone(seed);
  const collection = (path: string): any => ({
    doc: (id?: string) => {
      const docId = id || `generated-${++sequence}`;
      const fullPath = `${path}/${docId}`;
      return { id: docId, path: fullPath, collection: (name: string) => collection(`${fullPath}/${name}`) };
    }
  });
  const snapshot = (ref: any, source: Record<string, any>) => ({ id: ref.id, exists: source[ref.path] !== undefined, data: () => source[ref.path] });
  const db = {
    collection,
    runTransaction: async (work: (transaction: any) => Promise<any>) => {
      const staged = structuredClone(store);
      const transaction = {
        getAll: async (...refs: any[]) => refs.map((ref) => snapshot(ref, staged)),
        create: (ref: any, data: any) => { if (staged[ref.path] !== undefined) throw new Error('already exists'); staged[ref.path] = data; },
        update: (ref: any, data: any) => { if (staged[ref.path] === undefined) throw new Error('missing'); staged[ref.path] = { ...staged[ref.path], ...data }; },
        set: (ref: any, data: any, options?: { merge?: boolean }) => { staged[ref.path] = options?.merge ? { ...(staged[ref.path] || {}), ...data } : data; }
      };
      const result = await work(transaction);
      if (failCommit) throw new Error('injected transaction failure');
      Object.keys(store).forEach((key) => delete store[key]);
      Object.assign(store, staged);
      return result;
    }
  };
  return { db: db as any, store };
}

const auth = { verifyIdToken: async () => ({ uid: 'cashier-auth-1', role: 'cashier', tenantId: 'tenant-1', staffAccountId: 'cashier-1', sessionVersion: 3 }) } as any;
const seed = {
  'tenants/tenant-1': { moduleType: 'benta-snap', subscriptionStatus: 'active' },
  'tenants/tenant-1/staff_accounts/cashier-1': { tenantId: 'tenant-1', authUid: 'cashier-auth-1', sessionVersion: 3, status: 'active', username: 'Maria', activeShiftId: 'shift-1' },
  'tenants/tenant-1/shifts/shift-1': { id: 'shift-1', tenantId: 'tenant-1', moduleId: 'benta-snap', staffAccountId: 'cashier-1', staffId: 'staff_cashier-1', openedBy: 'staff_cashier-1', status: 'open', startingCash: 1000, reconciliationVersion: 1, cashSales: 0, gcashSales: 0, mayaSales: 0, totalShiftSales: 0, electronicReceipts: 0, physicalCashAdjustments: 0, saleCount: 0 },
  'tenants/tenant-1/products/product-1': { tenantId: 'tenant-1', isActive: true, name: 'Rice', unit: 'bag', salePrice: 1250, costPrice: 900, currentStock: 5 },
  'tenants/tenant-1/accounts/master-cash': { balance: 5000 }
};

async function main() {
  console.log('BENTA CASHIER CHECKOUT UNIT / SERVICE TESTS');
  assert(validateCheckoutRequest(request).items.length === 1, 'strict valid request accepted');
  const invalids: unknown[] = [
    { ...request, discount: 1 }, { ...request, tenantId: 'tenant-1' }, { ...request, total: 1 },
    { ...request, paymentReference: 'not-for-cash' }, { ...request, paymentMethod: 'gcash', paymentReference: 'bad@ref' },
    { ...request, items: [{ productId: 'p', quantity: 1 }, { productId: 'p', quantity: 2 }] },
    { ...request, items: [{ productId: 'p', quantity: 1.5 }] }, { ...request, idempotencyKey: 'not-a-uuid' },
    { ...request, items: [{ productId: 'product-1', quantity: 1, price: 1, costPrice: 1 }] }
  ];
  for (const invalid of invalids) await rejects(() => validateCheckoutRequest(invalid), CheckoutErrorCode.INVALID_REQUEST, 'prohibited or malformed input rejected');
  const reordered = { ...request, items: [{ productId: 'b', quantity: 1 }, { productId: 'a', quantity: 2 }] };
  const reorderedAgain = { ...request, items: [...reordered.items].reverse() };
  assert(checkoutFingerprint('cashier-1', reordered) === checkoutFingerprint('cashier-1', reorderedAgain), 'fingerprint canonicalizes product order');
  assert(checkoutIdempotencyDocumentId('cashier-1', request.idempotencyKey).length === 64, 'idempotency ID is a SHA-256 digest');
  assert(!checkoutIdempotencyDocumentId('cashier-1', request.idempotencyKey).includes('cashier-1'), 'idempotency ID hides raw actor and key');

  const memory = mockFirestore(seed);
  const receipt = await completeBentaCashierCheckout('token', request, { adminAuth: auth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000) });
  assert(receipt.totalCentavos === 2500 && receipt.subtotalCentavos === 2500, 'authoritative integer-centavo total calculated');
  assert(!JSON.stringify(receipt).includes('900') && !('paymentReference' in receipt), 'receipt excludes cost and payment reference');
  assert(memory.store['tenants/tenant-1/products/product-1'].currentStock === 3, 'stock deducted exactly');
  assert(memory.store['tenants/tenant-1/accounts/master-cash'].balance === 7500, 'master cash increased exactly once');
  const shift = memory.store['tenants/tenant-1/shifts/shift-1'];
  assert(shift.cashSales === 2500 && shift.totalShiftSales === 2500 && shift.electronicReceipts === 0 && shift.saleCount === 1, 'cash checkout atomically updates versioned shift aggregates');
  const sale = Object.entries(memory.store).find(([key]) => key.includes('/sales/'))?.[1] as any;
  assert(sale.subtotalAmount === 2500 && sale.discountAmount === 0, 'sale keeps authoritative totals and zero discount');
  assert(sale.items[0].price === 1250 && sale.items[0].costPrice === 900 && sale.items[0].lineTotal === 2500, 'persisted item uses established Owner-compatible price and costPrice fields');
  assert(sale.items[0].unitPriceCentavos === undefined && sale.items[0].costPriceCentavos === undefined, 'persisted item does not introduce a duplicate price schema');
  const retry = await completeBentaCashierCheckout('token', request, { adminAuth: auth, adminFirestore: memory.db });
  assert(retry.saleId === receipt.saleId && memory.store['tenants/tenant-1/products/product-1'].currentStock === 3 && memory.store['tenants/tenant-1/shifts/shift-1'].saleCount === 1, 'identical retry returns original receipt without stock or shift mutation');
  await rejects(() => completeBentaCashierCheckout('token', { ...request, items: [{ productId: 'product-1', quantity: 1 }] }, { adminAuth: auth, adminFirestore: memory.db }), CheckoutErrorCode.IDEMPOTENCY_CONFLICT, 'conflicting idempotency reuse rejected');
  memory.store['tenants/tenant-1/shifts/shift-1'].status = 'closed';
  const closedReplayState = JSON.stringify(memory.store);
  const closedReplay = await completeBentaCashierCheckout('token', request, { adminAuth: auth, adminFirestore: memory.db });
  assert(closedReplay.saleId === receipt.saleId && JSON.stringify(memory.store) === closedReplayState, 'identical completed replay after shift close returns original receipt with zero mutation');
  await rejects(() => completeBentaCashierCheckout('token', { ...request, items: [{ productId: 'product-1', quantity: 1 }] }, { adminAuth: auth, adminFirestore: memory.db }), CheckoutErrorCode.IDEMPOTENCY_CONFLICT, 'conflicting completed-key reuse after close remains an idempotency conflict');
  await rejects(() => completeBentaCashierCheckout('token', { ...request, idempotencyKey: '323e4567-e89b-42d3-a456-426614174001' }, { adminAuth: auth, adminFirestore: memory.db }), CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED, 'genuinely new checkout after close is rejected');

  const failing = mockFirestore(seed, true);
  await rejects(() => completeBentaCashierCheckout('token', request, { adminAuth: auth, adminFirestore: failing.db }), CheckoutErrorCode.SERVICE_UNAVAILABLE, 'transaction failure is sanitized');
  assert(failing.store['tenants/tenant-1/products/product-1'].currentStock === 5 && !Object.keys(failing.store).some((key) => key.includes('/sales/')), 'failed transaction leaves no partial effects');
  const badAuth = { verifyIdToken: async () => { throw new Error('token details'); } } as any;
  await rejects(() => completeBentaCashierCheckout('token-secret', request, { adminAuth: badAuth, adminFirestore: memory.db }), CheckoutErrorCode.AUTHENTICATION_REQUIRED, 'token failure is sanitized');
  const stale = mockFirestore({ ...seed, 'tenants/tenant-1/staff_accounts/cashier-1': { ...seed['tenants/tenant-1/staff_accounts/cashier-1'], sessionVersion: 4 } });
  await rejects(() => completeBentaCashierCheckout('token', request, { adminAuth: auth, adminFirestore: stale.db }), CheckoutErrorCode.SESSION_INVALID, 'stale authoritative session rejected');
  const mismatchedProduct = mockFirestore({ ...seed, 'tenants/tenant-1/products/product-1': { ...seed['tenants/tenant-1/products/product-1'], tenantId: 'tenant-other' } });
  await rejects(() => completeBentaCashierCheckout('token', request, { adminAuth: auth, adminFirestore: mismatchedProduct.db }), CheckoutErrorCode.PRODUCT_UNAVAILABLE, 'product document with mismatched authoritative tenantId rejected');
  const legacyShift = mockFirestore({ ...seed, 'tenants/tenant-1/shifts/shift-1': { tenantId: 'tenant-1', staffId: 'staff_cashier-1', status: 'open', startingCash: 1000 } });
  await rejects(() => completeBentaCashierCheckout('token', request, { adminAuth: auth, adminFirestore: legacyShift.db }), CheckoutErrorCode.RECONCILIATION_INVALID, 'legacy unversioned shift fails closed without mutation');
  const mismatchedShiftId = mockFirestore({ ...seed, 'tenants/tenant-1/shifts/shift-1': { ...seed['tenants/tenant-1/shifts/shift-1'], id: 'forged-shift-id' } });
  const mismatchedShiftState = JSON.stringify(mismatchedShiftId.store);
  await rejects(() => completeBentaCashierCheckout('token', request, { adminAuth: auth, adminFirestore: mismatchedShiftId.db }), CheckoutErrorCode.RECONCILIATION_INVALID, 'checkout rejects stored shift id that contradicts the Firestore document id');
  assert(JSON.stringify(mismatchedShiftId.store) === mismatchedShiftState, 'corrupted bidirectional checkout shift remains completely unchanged');

  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
