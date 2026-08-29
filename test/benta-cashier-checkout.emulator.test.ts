import * as admin from 'firebase-admin';
import { CheckoutError, CheckoutErrorCode, completeBentaCashierCheckout } from '../src/lib/server/benta-cashier-checkout';

const PROJECT_ID = 'demo-katuwang-benta-checkout';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!PROJECT_ID.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(EMULATOR_HOST)) {
  throw new Error('SECURITY_FAIL_CLOSED: checkout emulator isolation violation');
}
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;
const app = admin.apps.find((candidate): candidate is admin.app.App => candidate !== null && candidate.name === 'benta-checkout-emulator') || admin.initializeApp({ projectId: PROJECT_ID }, 'benta-checkout-emulator');
const db = app.firestore();

let passed = 0;
let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
async function rejects(fn: () => Promise<unknown>, code: CheckoutErrorCode, message: string) {
  try { await fn(); assert(false, message); } catch (error) { assert(error instanceof CheckoutError && error.code === code, message); }
}

const runId = Date.now().toString(36);
const tenantId = `tenant_checkout_${runId}`;
const otherTenantId = `tenant_other_${runId}`;
const staffId = 'cashier-1';
const uid = 'cashier-auth-1';
const auth = {
  verifyIdToken: async (token: string) => {
    if (token === 'valid') return { uid, role: 'cashier', tenantId, staffAccountId: staffId, sessionVersion: 7 };
    if (token === 'other-tenant') return { uid: 'other-auth', role: 'cashier', tenantId: otherTenantId, staffAccountId: staffId, sessionVersion: 1 };
    throw new Error('invalid token');
  }
} as any;
let keySequence = 0;
function key() { return `123e4567-e89b-42d3-a456-${(426614174000 + keySequence++).toString().padStart(12, '0')}`; }
function payload(productId: string, quantity = 1, paymentMethod: 'cash' | 'gcash' | 'maya' = 'cash', paymentReference?: string) {
  return { idempotencyKey: key(), moduleId: 'benta-snap', shiftId: 'shift-1', items: [{ productId, quantity }], paymentMethod, ...(paymentReference ? { paymentReference } : {}) };
}

async function seed() {
  const tenant = db.collection('tenants').doc(tenantId);
  await Promise.all([
    tenant.set({ moduleType: 'benta-snap', subscriptionStatus: 'active' }),
    tenant.collection('staff_accounts').doc(staffId).set({ tenantId, authUid: uid, sessionVersion: 7, status: 'active', username: 'Maria', activeShiftId: 'shift-1' }),
    tenant.collection('shifts').doc('shift-1').set({ id: 'shift-1', tenantId, moduleId: 'benta-snap', staffAccountId: staffId, staffId: `staff_${staffId}`, openedBy: `staff_${staffId}`, status: 'open', startingCash: 100000, reconciliationVersion: 1, cashSales: 0, gcashSales: 0, mayaSales: 0, totalShiftSales: 0, electronicReceipts: 0, physicalCashAdjustments: 0, saleCount: 0 }),
    tenant.collection('accounts').doc('master-cash').set({ id: 'master-cash', tenantId, balance: 1000 }),
    tenant.collection('products').doc('p-cash').set({ tenantId, isActive: true, name: 'Cash Product', unit: 'pc', salePrice: 100, costPrice: 60, currentStock: 20 }),
    tenant.collection('products').doc('p-wallet').set({ tenantId, isActive: true, name: 'Wallet Product', unit: 'pc', salePrice: 250, costPrice: 150, currentStock: 20 }),
    tenant.collection('products').doc('p-final').set({ tenantId, isActive: true, name: 'Final Stock', unit: 'pc', salePrice: 500, costPrice: 300, currentStock: 2 }),
    tenant.collection('products').doc('p-mismatched-tenant').set({ tenantId: otherTenantId, isActive: true, name: 'Malformed Tenant Product', unit: 'pc', salePrice: 10, costPrice: 5, currentStock: 10 }),
    db.collection('tenants').doc(otherTenantId).set({ moduleType: 'benta-snap', subscriptionStatus: 'active' }),
    db.collection('tenants').doc(otherTenantId).collection('products').doc('foreign-only').set({ tenantId: otherTenantId, isActive: true, name: 'Foreign', unit: 'pc', salePrice: 1, costPrice: 1, currentStock: 99 })
  ]);
}

async function main() {
  console.log(`BENTA CHECKOUT FIRESTORE EMULATOR TESTS ${PROJECT_ID} @ ${EMULATOR_HOST}`);
  await seed();
  const service = { adminAuth: auth, adminFirestore: db };

  const cashRequest = payload('p-cash', 2);
  const cashReceipt = await completeBentaCashierCheckout('valid', cashRequest, service);
  assert(cashReceipt.totalCentavos === 200, 'Cash checkout commits authoritative total');
  const gcashReceipt = await completeBentaCashierCheckout('valid', payload('p-wallet', 1, 'gcash', 'GCASH-REF_1'), service);
  const mayaReceipt = await completeBentaCashierCheckout('valid', payload('p-wallet', 1, 'maya', 'MAYA/REF 2'), service);
  assert(gcashReceipt.paymentMethod === 'gcash' && mayaReceipt.paymentMethod === 'maya', 'GCash and Maya checkouts succeed');
  assert(!JSON.stringify(gcashReceipt).includes('GCASH-REF_1'), 'wallet reference never enters receipt');

  await db.collection('tenants').doc(tenantId).collection('products').doc('p-cash').update({ salePrice: 175 });
  const changedPrice = await completeBentaCashierCheckout('valid', payload('p-cash', 1), service);
  assert(changedPrice.totalCentavos === 175, 'price changed before transaction is loaded authoritatively');
  await rejects(() => completeBentaCashierCheckout('valid', payload('p-cash', 10_000), service), CheckoutErrorCode.INSUFFICIENT_STOCK, 'insufficient stock rejected');
  await rejects(() => completeBentaCashierCheckout('valid', payload('foreign-only'), service), CheckoutErrorCode.PRODUCT_UNAVAILABLE, 'cross-tenant product ID rejected');

  const retryRequest = payload('p-cash', 1);
  const first = await completeBentaCashierCheckout('valid', retryRequest, service);
  const beforeRetryStock = (await db.collection('tenants').doc(tenantId).collection('products').doc('p-cash').get()).data()!.currentStock;
  const second = await completeBentaCashierCheckout('valid', retryRequest, service);
  const afterRetryStock = (await db.collection('tenants').doc(tenantId).collection('products').doc('p-cash').get()).data()!.currentStock;
  assert(first.saleId === second.saleId && beforeRetryStock === afterRetryStock, 'identical idempotent retry has no financial mutation');
  await rejects(() => completeBentaCashierCheckout('valid', { ...retryRequest, items: [{ productId: 'p-cash', quantity: 2 }] }, service), CheckoutErrorCode.IDEMPOTENCY_CONFLICT, 'conflicting key reuse rejected');

  const concurrentA = payload('p-final', 2);
  const concurrentB = payload('p-final', 2);
  const concurrent = await Promise.allSettled([
    completeBentaCashierCheckout('valid', concurrentA, service),
    completeBentaCashierCheckout('valid', concurrentB, service)
  ]);
  assert(concurrent.filter((result) => result.status === 'fulfilled').length === 1, 'concurrent final-stock attempts commit exactly once');
  assert((await db.collection('tenants').doc(tenantId).collection('products').doc('p-final').get()).data()!.currentStock === 0, 'concurrent checkout cannot oversell stock');

  const saleSnap = await db.collection('tenants').doc(tenantId).collection('sales').doc(cashReceipt.saleId).get();
  const movements = await db.collection('tenants').doc(tenantId).collection('inventory_transactions').where('saleId', '==', cashReceipt.saleId).get();
  const ledger = await db.collection('tenants').doc(tenantId).collection('transactions').where('saleId', '==', cashReceipt.saleId).get();
  const audit = await db.collection('tenants').doc(tenantId).collection('audit_log').where('saleId', '==', cashReceipt.saleId).get();
  assert(saleSnap.exists && movements.size === 1 && ledger.size === 1 && audit.size === 1, 'sale has exactly one matching movement, ledger, and audit record');
  const sale = saleSnap.data()!;
  assert(sale.subtotalAmount === 200 && sale.totalAmount === 200 && sale.discountAmount === 0 && ledger.docs[0].data().amount === 200 && audit.docs[0].data().amountCentavos === 200, 'sale, ledger, audit, method, and amount reconcile');
  assert(sale.items[0].price === 100 && sale.items[0].costPrice === 60 && sale.items[0].lineTotal === 200, 'sale item uses authoritative Owner-compatible price, costPrice, and lineTotal fields');
  assert(sale.items[0].unitPriceCentavos === undefined && sale.items[0].costPriceCentavos === undefined, 'sale item does not persist a duplicate incompatible price schema');
  assert(!(cashReceipt.items[0] as any).costPrice && !(cashReceipt.items[0] as any).costPriceCentavos, 'cost remains server-side and absent from Cashier receipt');
  const currentCash = (await db.collection('tenants').doc(tenantId).collection('accounts').doc('master-cash').get()).data()!.balance;
  const currentGcash = (await db.collection('tenants').doc(tenantId).collection('accounts').doc('gcash-settlement').get()).data()!.balance;
  const currentMaya = (await db.collection('tenants').doc(tenantId).collection('accounts').doc('maya-settlement').get()).data()!.balance;
  assert(currentCash === 1000 + 200 + 175 + 175 + 1000 && currentGcash === 250 && currentMaya === 250, 'accounts reflect every committed cash and settlement payment exactly once');
  const shiftAggregates = (await db.collection('tenants').doc(tenantId).collection('shifts').doc('shift-1').get()).data()!;
  assert(shiftAggregates.cashSales === 1550 && shiftAggregates.gcashSales === 250 && shiftAggregates.mayaSales === 250 && shiftAggregates.totalShiftSales === 2050 && shiftAggregates.electronicReceipts === 500 && shiftAggregates.saleCount === 6, 'payment-specific shift aggregates reconcile exactly once per committed sale');

  const tenantRef = db.collection('tenants').doc(tenantId);
  await tenantRef.update({ moduleType: 'build-stack' });
  await rejects(() => completeBentaCashierCheckout('valid', payload('p-cash'), service), CheckoutErrorCode.CHECKOUT_UNAVAILABLE, 'wrong tenant module rejected');
  await tenantRef.update({ moduleType: 'benta-snap' });
  await tenantRef.collection('staff_accounts').doc(staffId).update({ status: 'disabled' });
  await rejects(() => completeBentaCashierCheckout('valid', payload('p-cash'), service), CheckoutErrorCode.SESSION_INVALID, 'disabled Cashier rejected');
  await tenantRef.collection('staff_accounts').doc(staffId).update({ status: 'active', sessionVersion: 8 });
  await rejects(() => completeBentaCashierCheckout('valid', payload('p-cash'), service), CheckoutErrorCode.SESSION_INVALID, 'stale session version rejected');
  await tenantRef.collection('staff_accounts').doc(staffId).update({ sessionVersion: 7 });
  await tenantRef.collection('shifts').doc('shift-1').update({ status: 'closed' });
  await rejects(() => completeBentaCashierCheckout('valid', payload('p-cash'), service), CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED, 'closed/wrong shift rejected');
  await tenantRef.collection('shifts').doc('shift-1').update({ status: 'open' });
  await rejects(() => completeBentaCashierCheckout('valid', payload('p-mismatched-tenant'), service), CheckoutErrorCode.PRODUCT_UNAVAILABLE, 'product document carrying a mismatched tenantId is rejected');

  const countsBefore = await Promise.all(['sales', 'inventory_transactions', 'transactions', 'audit_log'].map((name) => tenantRef.collection(name).get().then((snap) => snap.size)));
  const failingDb = { collection: db.collection.bind(db), runTransaction: async () => { throw new Error('injected transaction storage failure'); } } as any;
  await rejects(() => completeBentaCashierCheckout('valid', payload('p-cash'), { adminAuth: auth, adminFirestore: failingDb }), CheckoutErrorCode.SERVICE_UNAVAILABLE, 'injected transaction failure is fail-closed');
  const countsAfter = await Promise.all(['sales', 'inventory_transactions', 'transactions', 'audit_log'].map((name) => tenantRef.collection(name).get().then((snap) => snap.size)));
  assert(JSON.stringify(countsBefore) === JSON.stringify(countsAfter), 'injected transaction failure creates no partial effects');
  await rejects(() => completeBentaCashierCheckout('valid', { ...payload('p-cash'), discount: 1 }, service), CheckoutErrorCode.INVALID_REQUEST, 'discount input rejected at production boundary');
  await rejects(() => completeBentaCashierCheckout('valid', { ...payload('p-cash'), palista: true }, service), CheckoutErrorCode.INVALID_REQUEST, 'Palista input rejected at production boundary');
  await rejects(() => completeBentaCashierCheckout('valid', { ...payload('p-cash'), items: [{ productId: 'p-cash', quantity: 1, price: 1, costPrice: 1 }] }, service), CheckoutErrorCode.INVALID_REQUEST, 'client-submitted price and cost fields are rejected at production boundary');
  await rejects(() => completeBentaCashierCheckout('valid', payload('misc-manual'), service), CheckoutErrorCode.PRODUCT_UNAVAILABLE, 'miscellaneous item rejected');

  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
