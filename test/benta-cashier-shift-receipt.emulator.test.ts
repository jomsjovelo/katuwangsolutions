import * as admin from 'firebase-admin';
import { CheckoutError, CheckoutErrorCode, completeBentaCashierCheckout } from '../src/lib/server/benta-cashier-checkout';
import { closeBentaCashierShift, getCurrentShiftReceipt } from '../src/lib/server/benta-cashier-shift-receipt';

const PROJECT_ID = 'demo-katuwang-shift-receipt';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!PROJECT_ID.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(EMULATOR_HOST)) throw new Error('SECURITY_FAIL_CLOSED: emulator isolation violation');
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;
const app = admin.apps.find((candidate): candidate is admin.app.App => candidate !== null && candidate.name === 'shift-receipt-emulator') || admin.initializeApp({ projectId: PROJECT_ID }, 'shift-receipt-emulator');
const db = app.firestore();

let passed = 0;
let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
async function rejects(fn: () => Promise<unknown>, codes: CheckoutErrorCode | CheckoutErrorCode[], message: string) {
  const expected = Array.isArray(codes) ? codes : [codes];
  try { await fn(); assert(false, message); } catch (error) { assert(error instanceof CheckoutError && expected.includes(error.code), message); }
}

const suffix = Date.now().toString(36);
const tenantId = `tenant_shift_${suffix}`;
const otherTenantId = `tenant_other_${suffix}`;
const staffId = 'cashier-1';
const uid = 'cashier-auth-1';
const tenantRef = db.collection('tenants').doc(tenantId);
const auth = { verifyIdToken: async (token: string) => {
  if (token === 'valid') return { uid, role: 'cashier', tenantId, staffAccountId: staffId, sessionVersion: 7 };
  if (token === 'different-cashier') return { uid: 'cashier-auth-2', role: 'cashier', tenantId, staffAccountId: 'cashier-2', sessionVersion: 1 };
  if (token === 'other-tenant') return { uid: 'other-uid', role: 'cashier', tenantId: otherTenantId, staffAccountId: 'other-cashier', sessionVersion: 1 };
  throw new Error('invalid');
} } as any;
const service = { adminAuth: auth, adminFirestore: db };
let keyCounter = 0;
function key() { return `223e4567-e89b-42d3-a456-${(426614174000 + keyCounter++).toString().padStart(12, '0')}`; }
function request(shiftId: string, productId: string, paymentMethod: 'cash' | 'gcash' | 'maya' = 'cash') {
  return { idempotencyKey: key(), moduleId: 'benta-snap', shiftId, items: [{ productId, quantity: 1 }], paymentMethod };
}
const reconciliation = { reconciliationVersion: 1, cashSales: 0, gcashSales: 0, mayaSales: 0, totalShiftSales: 0, electronicReceipts: 0, physicalCashAdjustments: 0, saleCount: 0 };
async function seedShift(id: string, status = 'open', overrides: Record<string, unknown> = {}) {
  await Promise.all([
    tenantRef.collection('shifts').doc(id).set({ id, tenantId, moduleId: 'benta-snap', staffAccountId: staffId, staffId: `staff_${staffId}`, openedBy: `staff_${staffId}`, status, startingCash: 100_000, ...reconciliation, ...overrides }),
    tenantRef.collection('staff_accounts').doc(staffId).update({ activeShiftId: id })
  ]);
}

async function seed() {
  await Promise.all([
    tenantRef.set({ moduleType: 'benta-snap', subscriptionStatus: 'active' }),
    tenantRef.collection('staff_accounts').doc(staffId).set({ tenantId, authUid: uid, sessionVersion: 7, status: 'active', username: 'Maria' }),
    tenantRef.collection('staff_accounts').doc('cashier-2').set({ tenantId, authUid: 'cashier-auth-2', sessionVersion: 1, status: 'active', username: 'Jose' }),
    tenantRef.collection('accounts').doc('master-cash').set({ id: 'master-cash', tenantId, balance: 0 }),
    tenantRef.collection('products').doc('p-cash').set({ tenantId, isActive: true, name: 'Cash Item', unit: 'pc', salePrice: 10_000, costPrice: 5_000, currentStock: 20 }),
    tenantRef.collection('products').doc('p-gcash').set({ tenantId, isActive: true, name: 'GCash Item', unit: 'pc', salePrice: 20_000, costPrice: 10_000, currentStock: 20 }),
    tenantRef.collection('products').doc('p-maya').set({ tenantId, isActive: true, name: 'Maya Item', unit: 'pc', salePrice: 30_000, costPrice: 15_000, currentStock: 20 }),
    db.collection('tenants').doc(otherTenantId).set({ moduleType: 'benta-snap', subscriptionStatus: 'active' }),
    db.collection('tenants').doc(otherTenantId).collection('staff_accounts').doc('other-cashier').set({ tenantId: otherTenantId, authUid: 'other-uid', sessionVersion: 1, status: 'active' })
  ]);
  await seedShift('shift-main');
}

async function main() {
  console.log(`BENTA SHIFT / RECEIPT FIRESTORE EMULATOR ${PROJECT_ID} @ ${EMULATOR_HOST}`);
  await seed();

  const cashRequest = request('shift-main', 'p-cash', 'cash');
  const cashReceipt = await completeBentaCashierCheckout('valid', cashRequest, service);
  await completeBentaCashierCheckout('valid', request('shift-main', 'p-gcash', 'gcash'), service);
  await completeBentaCashierCheckout('valid', request('shift-main', 'p-maya', 'maya'), service);
  const shift = (await tenantRef.collection('shifts').doc('shift-main').get()).data()!;
  assert(shift.cashSales === 10_000 && shift.gcashSales === 20_000 && shift.mayaSales === 30_000 && shift.totalShiftSales === 60_000, 'Cash, GCash, Maya and total shift sales reconcile');
  assert(shift.electronicReceipts === 50_000 && shift.physicalCashAdjustments === 0, 'wallet sales are electronic receipts and never physical cash adjustments');

  const currentReceipt = await getCurrentShiftReceipt('valid', cashReceipt.saleId, service);
  assert(currentReceipt.saleId === cashReceipt.saleId && !JSON.stringify(currentReceipt).includes('costPrice'), 'own current-open-shift receipt is sanitized');
  const cashBeforeRetry = (await tenantRef.collection('accounts').doc('master-cash').get()).data()!.balance;
  await completeBentaCashierCheckout('valid', cashRequest, service);
  const afterRetry = (await tenantRef.collection('shifts').doc('shift-main').get()).data()!;
  assert(afterRetry.saleCount === 3 && afterRetry.totalShiftSales === 60_000 && (await tenantRef.collection('accounts').doc('master-cash').get()).data()!.balance === cashBeforeRetry, 'identical retry duplicates no shift or master-cash effect');
  await rejects(() => completeBentaCashierCheckout('valid', { ...cashRequest, items: [{ productId: 'p-cash', quantity: 2 }] }, service), CheckoutErrorCode.IDEMPOTENCY_CONFLICT, 'conflicting idempotency reuse rejected');
  const beforeFailure = JSON.stringify(afterRetry);
  await rejects(() => completeBentaCashierCheckout('valid', request('shift-main', 'missing-product'), service), CheckoutErrorCode.PRODUCT_UNAVAILABLE, 'failed checkout rejected');
  assert(JSON.stringify((await tenantRef.collection('shifts').doc('shift-main').get()).data()) === beforeFailure, 'failed checkout leaves shift aggregates unchanged');

  const summary = await closeBentaCashierShift('valid', { shiftId: 'shift-main', endingCashCentavos: 110_000 }, service);
  assert(summary.totalShiftSales === 60_000 && summary.electronicReceipts === 50_000 && summary.expectedPhysicalCashCentavos === 110_000 && summary.discrepancyCentavos === 0, 'opening 1000 + cash 100 yields physical 1100 while wallets remain electronic');
  const replayState = async () => ({
    shift: (await tenantRef.collection('shifts').doc('shift-main').get()).data(),
    stock: (await tenantRef.collection('products').doc('p-cash').get()).data()!.currentStock,
    masterCash: (await tenantRef.collection('accounts').doc('master-cash').get()).data()!.balance,
    sales: (await tenantRef.collection('sales').where('shiftId', '==', 'shift-main').get()).size,
    movements: (await tenantRef.collection('inventory_transactions').where('shiftId', '==', 'shift-main').get()).size,
    ledger: (await tenantRef.collection('transactions').where('shiftId', '==', 'shift-main').get()).size,
    audit: (await tenantRef.collection('audit_log').where('shiftId', '==', 'shift-main').get()).size,
    idempotency: (await tenantRef.collection('cashier_checkout_idempotency').get()).docs.map((document) => ({ id: document.id, data: document.data() }))
  });
  const beforeClosedReplay = JSON.stringify(await replayState());
  const replayedReceipt = await completeBentaCashierCheckout('valid', cashRequest, service);
  assert(replayedReceipt.saleId === cashReceipt.saleId, 'identical retry after shift close returns original receipt');
  assert(JSON.stringify(await replayState()) === beforeClosedReplay, 'closed-shift identical retry changes no sale, stock, movement, ledger, audit, master-cash, idempotency, or shift aggregate');
  await rejects(() => completeBentaCashierCheckout('valid', { ...cashRequest, items: [{ productId: 'p-cash', quantity: 2 }] }, service), CheckoutErrorCode.IDEMPOTENCY_CONFLICT, 'conflicting idempotency reuse after close still fails');
  await tenantRef.collection('staff_accounts').doc(staffId).update({ status: 'disabled' });
  await rejects(() => completeBentaCashierCheckout('valid', cashRequest, service), CheckoutErrorCode.SESSION_INVALID, 'disabled Cashier cannot replay completed receipt');
  await tenantRef.collection('staff_accounts').doc(staffId).update({ status: 'active', sessionVersion: 8 });
  await rejects(() => completeBentaCashierCheckout('valid', cashRequest, service), CheckoutErrorCode.SESSION_INVALID, 'stale session cannot replay completed receipt');
  await tenantRef.collection('staff_accounts').doc(staffId).update({ sessionVersion: 7 });
  await rejects(() => completeBentaCashierCheckout('different-cashier', cashRequest, service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'different Cashier cannot replay another Cashier receipt');
  await rejects(() => completeBentaCashierCheckout('other-tenant', cashRequest, service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'cross-tenant identity cannot replay receipt');
  await rejects(() => completeBentaCashierCheckout('valid', request('shift-main', 'p-cash'), service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'genuinely new checkout after close still fails');
  await rejects(() => getCurrentShiftReceipt('valid', cashReceipt.saleId, service), CheckoutErrorCode.RECEIPT_UNAVAILABLE, 'closed-shift receipt denied');

  await seedShift('shift-close-first');
  const stockBeforeCloseFirst = (await tenantRef.collection('products').doc('p-cash').get()).data()!.currentStock;
  const cashBeforeCloseFirst = (await tenantRef.collection('accounts').doc('master-cash').get()).data()!.balance;
  await closeBentaCashierShift('valid', { shiftId: 'shift-close-first', endingCashCentavos: 100_000 }, service);
  await rejects(() => completeBentaCashierCheckout('valid', request('shift-close-first', 'p-cash'), service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'closing first causes checkout to fail');
  assert((await tenantRef.collection('products').doc('p-cash').get()).data()!.currentStock === stockBeforeCloseFirst && (await tenantRef.collection('accounts').doc('master-cash').get()).data()!.balance === cashBeforeCloseFirst, 'close-first checkout failure has zero stock and financial effects');

  await seedShift('shift-checkout-first');
  await completeBentaCashierCheckout('valid', request('shift-checkout-first', 'p-cash'), service);
  const checkoutFirstClose = await closeBentaCashierShift('valid', { shiftId: 'shift-checkout-first', endingCashCentavos: 110_000 }, service);
  assert(checkoutFirstClose.cashSales === 10_000 && checkoutFirstClose.expectedPhysicalCashCentavos === 110_000 && checkoutFirstClose.saleCount === 1, 'checkout-first close includes committed sale');

  await seedShift('shift-concurrent');
  const concurrentRequest = request('shift-concurrent', 'p-cash');
  const concurrent = await Promise.allSettled([
    completeBentaCashierCheckout('valid', concurrentRequest, service),
    closeBentaCashierShift('valid', { shiftId: 'shift-concurrent', endingCashCentavos: 100_000 }, service)
  ]);
  const concurrentShift = (await tenantRef.collection('shifts').doc('shift-concurrent').get()).data()!;
  const concurrentSales = await tenantRef.collection('sales').where('shiftId', '==', 'shift-concurrent').get();
  const serialized = (concurrent.every((result) => result.status === 'fulfilled') && concurrentShift.saleCount === 1 && concurrentSales.size === 1 && concurrentShift.reconciliationSummary.totalShiftSales === 10_000) ||
    (concurrent.filter((result) => result.status === 'fulfilled').length === 1 && concurrentShift.saleCount === 0 && concurrentSales.size === 0);
  assert(serialized && concurrentShift.status === 'closed', 'concurrent checkout and close serialize to one valid outcome');

  await seedShift('shift-corrupt', 'open', { totalShiftSales: 1 });
  await rejects(() => closeBentaCashierShift('valid', { shiftId: 'shift-corrupt', endingCashCentavos: 0 }, service), CheckoutErrorCode.RECONCILIATION_INVALID, 'corrupt aggregates fail closed');
  assert((await tenantRef.collection('shifts').doc('shift-corrupt').get()).data()!.status === 'open', 'corrupt shift remains open');
  await tenantRef.collection('shifts').doc('shift-corrupt').update({ status: 'closed' });
  await tenantRef.collection('shifts').doc('shift-legacy').set({ tenantId, staffId: `staff_${staffId}`, status: 'open', startingCash: 100_000 });
  await tenantRef.collection('staff_accounts').doc(staffId).update({ activeShiftId: 'shift-legacy' });
  await rejects(() => closeBentaCashierShift('valid', { shiftId: 'shift-legacy', endingCashCentavos: 0 }, service), CheckoutErrorCode.RECONCILIATION_INVALID, 'legacy shift rejected without mutation');
  await rejects(() => completeBentaCashierCheckout('valid', request('shift-legacy', 'p-cash'), service), CheckoutErrorCode.RECONCILIATION_INVALID, 'legacy shift rejected by checkout');
  await tenantRef.collection('shifts').doc('shift-legacy').update({ status: 'closed' });
  await seedShift('shift-other-owner', 'open', { staffId: 'staff_other' });
  await rejects(() => closeBentaCashierShift('valid', { shiftId: 'shift-other-owner', endingCashCentavos: 0 }, service), CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED, 'shift belonging to another Cashier is denied');

  await seedShift('shift-receipt-open');
  const own = await completeBentaCashierCheckout('valid', request('shift-receipt-open', 'p-cash'), service);
  const ownSaleRef = tenantRef.collection('sales').doc(own.saleId);
  const ownSale = (await ownSaleRef.get()).data()!;
  await ownSaleRef.update({ staffAccountId: 'other', actorId: 'staff_other' });
  await rejects(() => getCurrentShiftReceipt('valid', own.saleId, service), CheckoutErrorCode.RECEIPT_UNAVAILABLE, 'other-Cashier receipt denied');
  await ownSaleRef.set(ownSale);
  await ownSaleRef.update({ moduleId: 'build-stack' });
  await rejects(() => getCurrentShiftReceipt('valid', own.saleId, service), CheckoutErrorCode.RECEIPT_UNAVAILABLE, 'wrong-module receipt denied');
  await ownSaleRef.set(ownSale);
  await tenantRef.collection('sales').doc('legacy-sale').set({ tenantId, totalAmount: 1, items: [] });
  await rejects(() => getCurrentShiftReceipt('valid', 'legacy-sale', service), CheckoutErrorCode.RECEIPT_UNAVAILABLE, 'unattributed legacy receipt denied');
  await rejects(() => getCurrentShiftReceipt('other-tenant', own.saleId, service), CheckoutErrorCode.RECEIPT_UNAVAILABLE, 'cross-tenant receipt denied');

  await tenantRef.update({ moduleType: 'build-stack' });
  await rejects(() => closeBentaCashierShift('valid', { shiftId: 'shift-receipt-open', endingCashCentavos: 0 }, service), CheckoutErrorCode.CHECKOUT_UNAVAILABLE, 'wrong module close denied');
  await tenantRef.update({ moduleType: 'benta-snap' });
  await tenantRef.collection('staff_accounts').doc(staffId).update({ status: 'disabled' });
  await rejects(() => closeBentaCashierShift('valid', { shiftId: 'shift-receipt-open', endingCashCentavos: 0 }, service), CheckoutErrorCode.SESSION_INVALID, 'disabled Cashier close denied');
  await tenantRef.collection('staff_accounts').doc(staffId).update({ status: 'active', sessionVersion: 8 });
  await rejects(() => closeBentaCashierShift('valid', { shiftId: 'shift-receipt-open', endingCashCentavos: 0 }, service), CheckoutErrorCode.SESSION_INVALID, 'stale Cashier close denied');

  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
