import * as admin from 'firebase-admin';
import { completeBentaCashierCheckout } from '../src/lib/server/benta-cashier-checkout';
import { CheckoutError, CheckoutErrorCode } from '../src/lib/server/cashier-server-authorization';

const PROJECT_ID = 'demo-katuwang-checkout-measured-emu';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!PROJECT_ID.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(EMULATOR_HOST)) throw new Error('SECURITY_FAIL_CLOSED: emulator isolation violation');
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const app = admin.apps.find((c): c is admin.app.App => c !== null && c.name === 'benta-checkout-measured-emulator') || admin.initializeApp({ projectId: PROJECT_ID }, 'benta-checkout-measured-emulator');
const db = app.firestore();

let passed = 0; let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
async function rejects(fn: () => Promise<unknown>, code: CheckoutErrorCode, message: string) { try { await fn(); assert(false, message); } catch (error) { assert(error instanceof CheckoutError && error.code === code, message); } }

async function main() {
  console.log(`BENTA CASHIER CHECKOUT MEASURED EMULATOR TEST ${PROJECT_ID} @ ${EMULATOR_HOST}`);

  const tenantId = `tenant_${Date.now().toString(36)}`;
  const tenantRef = db.collection('tenants').doc(tenantId);
  const staffRef = tenantRef.collection('staff_accounts').doc('cashier-1');
  const shiftRef = tenantRef.collection('shifts').doc('shift-1');

  await tenantRef.set({ moduleType: 'benta-snap', subscriptionStatus: 'active' });
  await staffRef.set({ tenantId, authUid: 'uid-1', sessionVersion: 1, status: 'active', activeShiftId: 'shift-1' });
  await shiftRef.set({
    id: 'shift-1', tenantId, moduleId: 'benta-snap', staffAccountId: 'cashier-1',
    staffId: 'staff_cashier-1', openedBy: 'staff_cashier-1', status: 'open',
    reconciliationVersion: 1, startingCash: 0, cashSales: 0, gcashSales: 0,
    mayaSales: 0, totalShiftSales: 0, electronicReceipts: 0,
    physicalCashAdjustments: 0, saleCount: 0
  });
  await tenantRef.collection('accounts').doc('master-cash').set({ id: 'master-cash', balance: 0 });

  await tenantRef.collection('products').doc('product-measured').set({
    tenantId, isActive: true, name: 'Rice', unit: 'kg', salePrice: 35000, costPrice: 20000,
    currentStock: 7, quantityMode: 'measured', stockQuantityMinor: 9500, quantityScale: 3
  });

  await tenantRef.collection('products').doc('product-discrete').set({
    tenantId, isActive: true, name: 'Coke', unit: 'btl', salePrice: 20000, costPrice: 15000,
    currentStock: 10
  });

  const auth = { verifyIdToken: async (token: string) => {
    if (token === 'valid') return { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: 'cashier-1', sessionVersion: 1 };
    throw new Error('invalid token');
  }} as any;
  const service = { adminAuth: auth, adminFirestore: db };

  // 1. Measured Checkout
  const validRequest = {
    idempotencyKey: '123e4567-e89b-42d3-a456-426614174000', moduleId: 'benta-snap' as const, shiftId: 'shift-1', paymentMethod: 'cash' as const,
    items: [{ productId: 'product-measured', quantityMode: 'measured' as const, quantityMinor: 2000, quantityScale: 3, sellingUnit: 'kg' }]
  };

  const receipt = await completeBentaCashierCheckout('valid', validRequest, service);
  assert(receipt.totalCentavos === 70000, 'server-authoritative unit price and precise line total calculated');
  assert(receipt.items[0].quantityMinor === 2000 && receipt.items[0].quantityMode === 'measured' && receipt.items[0].quantityScale === 3, 'historical receipt retains measured fields');

  const productSnap = await tenantRef.collection('products').doc('product-measured').get();
  assert(productSnap.data()!.stockQuantityMinor === 7500, 'exactly decrements stockQuantityMinor (9500 -> 7500)');
  assert(productSnap.data()!.currentStock === 7, 'legacy currentStock unchanged');

  // Idempotent replay
  await completeBentaCashierCheckout('valid', validRequest, service);
  assert((await tenantRef.collection('products').doc('product-measured').get()).data()!.stockQuantityMinor === 7500, 'replay remains 7500');

  // Movement check
  const movementsSnap = await tenantRef.collection('inventory_transactions').where('saleId', '==', receipt.saleId).get();
  const movement = movementsSnap.docs[0].data();
  assert(movement.quantityMode === 'measured' && movement.quantityMinorChange === -2000 && movement.newStockQuantityMinor === 7500 && movement.previousStockQuantityMinor === 9500, 'exact measured movement fields');

  // 2. Insufficient stock
  const overRequest = {
    idempotencyKey: '123e4567-e89b-42d3-a456-426614174001', moduleId: 'benta-snap' as const, shiftId: 'shift-1', paymentMethod: 'cash' as const,
    items: [{ productId: 'product-measured', quantityMode: 'measured' as const, quantityMinor: 8000, quantityScale: 3, sellingUnit: 'kg' }]
  };
  await rejects(() => completeBentaCashierCheckout('valid', overRequest, service), CheckoutErrorCode.INSUFFICIENT_STOCK, 'insufficient stock causes zero mutations');
  assert((await tenantRef.collection('products').doc('product-measured').get()).data()!.stockQuantityMinor === 7500, 'stock untouched on failure');

  // 3. Malformed payload rejected
  const badRequest = {
    idempotencyKey: '123e4567-e89b-42d3-a456-426614174002', moduleId: 'benta-snap' as const, shiftId: 'shift-1', paymentMethod: 'cash' as const,
    items: [{ productId: 'product-measured', quantityMode: 'measured' as const, quantityMinor: 1000, quantityScale: 99, sellingUnit: 'kg' }] // bad scale
  };
  await rejects(() => completeBentaCashierCheckout('valid', badRequest, service), CheckoutErrorCode.INVALID_REQUEST, 'malformed scale/unit/minor quantities are rejected');

  // Parity tests: Quantity mode mismatch rejection with zero mutations in emulator
  // 1. Measured product sent with discrete payload
  const measuredAsDiscreteRequest = {
    idempotencyKey: '123e4567-e89b-42d3-a456-426614174005', moduleId: 'benta-snap' as const, shiftId: 'shift-1', paymentMethod: 'cash' as const,
    items: [{ productId: 'product-measured', quantity: 2 }]
  };
  await rejects(() => completeBentaCashierCheckout('valid', measuredAsDiscreteRequest, service), CheckoutErrorCode.PRODUCT_UNAVAILABLE, 'measured product rejects discrete payload in emulator');
  assert((await tenantRef.collection('products').doc('product-measured').get()).data()!.stockQuantityMinor === 7500, 'stockQuantityMinor untouched on discrete mismatch');

  // 2. Discrete product sent with measured payload
  const discreteAsMeasuredRequest = {
    idempotencyKey: '123e4567-e89b-42d3-a456-426614174006', moduleId: 'benta-snap' as const, shiftId: 'shift-1', paymentMethod: 'cash' as const,
    items: [{ productId: 'product-discrete', quantityMode: 'measured' as const, quantityMinor: 1000, quantityScale: 3, sellingUnit: 'btl' }]
  };
  await rejects(() => completeBentaCashierCheckout('valid', discreteAsMeasuredRequest, service), CheckoutErrorCode.PRODUCT_UNAVAILABLE, 'discrete product rejects measured payload in emulator');
  assert((await tenantRef.collection('products').doc('product-discrete').get()).data()!.currentStock === 10, 'currentStock untouched on measured mismatch');

  // 4. Mixed cart
  const mixedRequest = {
    idempotencyKey: '123e4567-e89b-42d3-a456-426614174003', moduleId: 'benta-snap' as const, shiftId: 'shift-1', paymentMethod: 'cash' as const,
    items: [
      { productId: 'product-measured', quantityMode: 'measured' as const, quantityMinor: 500, quantityScale: 3, sellingUnit: 'kg' },
      { productId: 'product-discrete', quantity: 3 }
    ]
  };
  const mixedReceipt = await completeBentaCashierCheckout('valid', mixedRequest, service);
  assert(mixedReceipt.totalCentavos === 77500, 'discrete and mixed carts remain correct with exact integer centavos');
  assert((await tenantRef.collection('products').doc('product-measured').get()).data()!.stockQuantityMinor === 7000, 'mixed cart measured item decrements');
  assert((await tenantRef.collection('products').doc('product-discrete').get()).data()!.currentStock === 7, 'mixed cart discrete item accurately decrements currentStock (10 -> 7)');

  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
