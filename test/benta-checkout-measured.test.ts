import * as admin from 'firebase-admin';
import {
  CheckoutError, CheckoutErrorCode,
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

const auth = { verifyIdToken: async () => ({ uid: 'cashier-auth-1', role: 'cashier', tenantId: 'tenant-1', staffAccountId: 'cashier-1', sessionVersion: 3 }) } as any;

const seed = {
  'tenants/tenant-1': { moduleType: 'benta-snap', subscriptionStatus: 'active' },
  'tenants/tenant-1/staff_accounts/cashier-1': { tenantId: 'tenant-1', authUid: 'cashier-auth-1', sessionVersion: 3, status: 'active', username: 'Maria', activeShiftId: 'shift-1' },
  'tenants/tenant-1/shifts/shift-1': { id: 'shift-1', tenantId: 'tenant-1', moduleId: 'benta-snap', staffAccountId: 'cashier-1', staffId: 'staff_cashier-1', openedBy: 'staff_cashier-1', status: 'open', startingCash: 1000, reconciliationVersion: 1, cashSales: 0, gcashSales: 0, mayaSales: 0, totalShiftSales: 0, electronicReceipts: 0, physicalCashAdjustments: 0, saleCount: 0 },
  'tenants/tenant-1/products/product-measured': { tenantId: 'tenant-1', isActive: true, name: 'Pork', unit: 'kg', salePrice: 35000, costPrice: 28000, currentStock: 7, quantityMode: 'measured', quantityScale: 3, stockQuantityMinor: 7500 },
  'tenants/tenant-1/products/product-discrete': { tenantId: 'tenant-1', isActive: true, name: 'Eggs', unit: 'tray', salePrice: 20000, costPrice: 15000, currentStock: 10 },
  'tenants/tenant-1/accounts/master-cash': { balance: 5000 }
};

function mockFirestore(initialSeed: Record<string, any>) {
  let sequence = 0;
  const store = structuredClone(initialSeed);
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
      Object.keys(store).forEach((key) => delete store[key]);
      Object.assign(store, staged);
      return result;
    }
  };
  return { db: db as any, store };
}

async function main() {
  console.log('BENTA CASHIER CHECKOUT MEASURED ITEMS TESTS');

  // 1. Validation
  const validRequest = {
    idempotencyKey: '123e4567-e89b-42d3-a456-426614174000', moduleId: 'benta-snap' as const, shiftId: 'shift-1', paymentMethod: 'cash' as const,
    items: [
      { productId: 'product-measured', quantityMode: 'measured' as const, quantityMinor: 2000, quantityScale: 3, sellingUnit: 'kg' }
    ]
  };
  assert(validateCheckoutRequest(validRequest).items[0].quantityMinor === 2000, 'strictly validates measured items without stripping properties');

  const invalidRequests = [
    { ...validRequest, items: [{ productId: 'product-measured', quantityMode: 'measured', quantityMinor: 2000, quantityScale: 3 }] }, // missing sellingUnit
    { ...validRequest, items: [{ productId: 'product-measured', quantityMode: 'measured', quantityMinor: 2000, quantityScale: 3, sellingUnit: 'kg', quantity: 2 }] },
    { ...validRequest, items: [{ productId: 'product-measured', quantityMode: 'measured', quantityMinor: -500, quantityScale: 3, sellingUnit: 'kg' }] },
    { ...validRequest, items: [{ productId: 'product-measured', quantityMode: 'measured', quantityMinor: 2000.5, quantityScale: 3, sellingUnit: 'kg' }] }
  ];
  for (const invalid of invalidRequests) {
    await rejects(() => validateCheckoutRequest(invalid), CheckoutErrorCode.INVALID_REQUEST, 'rejects malformed measured items');
  }

  // 2. Execution
  const memory = mockFirestore(seed);
  const receipt = await completeBentaCashierCheckout('token', validRequest, { adminAuth: auth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000) });

  // 35000 centavos per kg (scale 3). 2000 minor units = 2.000 kg. Price = 35000 * 2000 / 1000 = 70000 centavos.
  assert(receipt.totalCentavos === 70000, 'server-authoritative unit price and precise line total calculated');
  assert(receipt.items[0].quantityMinor === 2000 && receipt.items[0].quantityMode === 'measured' && receipt.items[0].quantityScale === 3, 'historical receipt retains measured fields');

  assert(memory.store['tenants/tenant-1/products/product-measured'].stockQuantityMinor === 5500, 'exactly decrements stockQuantityMinor (7500 -> 5500)');
  assert(memory.store['tenants/tenant-1/products/product-measured'].currentStock === 7, 'does not mutate legacy discrete currentStock');

  const sale = Object.entries(memory.store).find(([key]) => key.includes('/sales/'))?.[1] as any;
  assert(sale.items[0].quantityMinor === 2000 && sale.items[0].lineTotal === 70000, 'sale document retains exact measured line items');

  const movement = Object.entries(memory.store).find(([key]) => key.includes('/inventory_transactions/'))?.[1] as any;
  assert(movement.quantityMode === 'measured' && movement.quantityMinorChange === -2000 && movement.newStockQuantityMinor === 5500 && movement.previousStockQuantityMinor === 7500, 'exact inventory movement fields using measured-movement schema');

  const shift = memory.store['tenants/tenant-1/shifts/shift-1'];
  assert(shift.cashSales === 70000 && shift.totalShiftSales === 70000, 'shift totals accurately reflect measured sale');

  // Idempotent Replay
  const stateBeforeReplay = JSON.stringify(memory.store);
  const replay = await completeBentaCashierCheckout('token', validRequest, { adminAuth: auth, adminFirestore: memory.db });
  assert(replay.saleId === receipt.saleId && JSON.stringify(memory.store) === stateBeforeReplay, 'idempotent replay results in zero second stock or financial mutation');

  // Insufficient measured stock rejection
  const tooMuchRequest = { ...validRequest, idempotencyKey: '987e6543-e89b-42d3-a456-426614174001', items: [{ productId: 'product-measured', quantityMode: 'measured' as const, quantityMinor: 6000, quantityScale: 3, sellingUnit: 'kg' }] };
  await rejects(() => completeBentaCashierCheckout('token', tooMuchRequest, { adminAuth: auth, adminFirestore: memory.db }), CheckoutErrorCode.INSUFFICIENT_STOCK, 'rejects insufficient measured stock with zero mutations');
  assert(memory.store['tenants/tenant-1/products/product-measured'].stockQuantityMinor === 5500, 'stock untouched on failure');

  // Parity tests: Quantity mode mismatch rejection with zero mutations
  const stateBeforeParity = JSON.stringify(memory.store);

  // 1. Measured product submitted with discrete payload
  const measuredAsDiscreteRequest = {
    idempotencyKey: '987e6543-e89b-42d3-a456-426614174004',
    moduleId: 'benta-snap' as const,
    shiftId: 'shift-1',
    paymentMethod: 'cash' as const,
    items: [{ productId: 'product-measured', quantity: 2 }]
  };
  await rejects(
    () => completeBentaCashierCheckout('token', measuredAsDiscreteRequest, { adminAuth: auth, adminFirestore: memory.db }),
    CheckoutErrorCode.PRODUCT_UNAVAILABLE,
    'rejects discrete payload for measured product with zero mutations'
  );
  assert(JSON.stringify(memory.store) === stateBeforeParity, 'zero mutations on measured product discrete payload mismatch');

  // 2. Discrete product submitted with measured payload
  const discreteAsMeasuredRequest = {
    idempotencyKey: '987e6543-e89b-42d3-a456-426614174005',
    moduleId: 'benta-snap' as const,
    shiftId: 'shift-1',
    paymentMethod: 'cash' as const,
    items: [{ productId: 'product-discrete', quantityMode: 'measured' as const, quantityMinor: 2000, quantityScale: 3, sellingUnit: 'tray' }]
  };
  await rejects(
    () => completeBentaCashierCheckout('token', discreteAsMeasuredRequest, { adminAuth: auth, adminFirestore: memory.db }),
    CheckoutErrorCode.PRODUCT_UNAVAILABLE,
    'rejects measured payload for discrete product with zero mutations'
  );
  assert(JSON.stringify(memory.store) === stateBeforeParity, 'zero mutations on discrete product measured payload mismatch');

  // Mixed cart execution
  const mixedRequest = {
    idempotencyKey: '987e6543-e89b-42d3-a456-426614174002', moduleId: 'benta-snap' as const, shiftId: 'shift-1', paymentMethod: 'cash' as const,
    items: [
      { productId: 'product-measured', quantityMode: 'measured' as const, quantityMinor: 500, quantityScale: 3, sellingUnit: 'kg' },
      { productId: 'product-discrete', quantity: 3 }
    ]
  };
  const mixedReceipt = await completeBentaCashierCheckout('token', mixedRequest, { adminAuth: auth, adminFirestore: memory.db, now: () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000) });
  assert(mixedReceipt.totalCentavos === 77500, 'mixed cart calculates total accurately with exact integer centavos');
  assert(memory.store['tenants/tenant-1/products/product-measured'].stockQuantityMinor === 5000, 'measured item decrements stockQuantityMinor');
  assert(memory.store['tenants/tenant-1/products/product-measured'].currentStock === 7, 'measured item does not mutate currentStock');
  assert(memory.store['tenants/tenant-1/products/product-discrete'].currentStock === 7, 'discrete item accurately decrements currentStock (10 -> 7)');

  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
