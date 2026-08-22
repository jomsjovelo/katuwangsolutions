import * as admin from 'firebase-admin';
import { getBentaCashierBootstrap } from '../src/lib/server/benta-cashier-bootstrap';
import { CheckoutError, CheckoutErrorCode, completeBentaCashierCheckout } from '../src/lib/server/benta-cashier-checkout';

const PROJECT_ID = 'demo-katuwang-benta-bootstrap';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!PROJECT_ID.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(EMULATOR_HOST)) throw new Error('SECURITY_FAIL_CLOSED: bootstrap emulator isolation violation');
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST; process.env.GCLOUD_PROJECT = PROJECT_ID;
const app = admin.apps.find((candidate): candidate is admin.app.App => candidate !== null && candidate.name === 'benta-bootstrap-emulator') || admin.initializeApp({ projectId: PROJECT_ID }, 'benta-bootstrap-emulator');
const db = app.firestore();
let passed = 0; let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
async function rejects(fn: () => Promise<unknown>, code: CheckoutErrorCode, message: string) { try { await fn(); assert(false, message); } catch (error) { assert(error instanceof CheckoutError && error.code === code, message); } }

const suffix = Date.now().toString(36); const tenantId = `tenant_bootstrap_${suffix}`; const tenantRef = db.collection('tenants').doc(tenantId);
const claims: Record<string, any> = {
  cashier1: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: 'cashier-1', sessionVersion: 1 },
  cashier2: { uid: 'uid-2', role: 'cashier', tenantId, staffAccountId: 'cashier-2', sessionVersion: 1 },
  stale: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: 'cashier-1', sessionVersion: 0 },
  wrongTenant: { uid: 'uid-x', role: 'cashier', tenantId: `missing_${suffix}`, staffAccountId: 'cashier-1', sessionVersion: 1 }
};
const auth = { verifyIdToken: async (token: string) => { if (!claims[token]) throw new Error('invalid'); return claims[token]; } } as any;
const service = { adminAuth: auth, adminFirestore: db };
const shift = {
  id: 'shift-1', tenantId, moduleId: 'benta-snap', staffAccountId: 'cashier-1', staffId: 'staff_cashier-1', openedBy: 'staff_cashier-1', status: 'open', reconciliationVersion: 1,
  startingCash: 100_000, cashSales: 0, gcashSales: 0, mayaSales: 0, totalShiftSales: 0, electronicReceipts: 0, physicalCashAdjustments: 0, saleCount: 0, openedAt: admin.firestore.Timestamp.now()
};
let keyCounter = 0; function key() { return `523e4567-e89b-42d3-a456-${(426614174000 + keyCounter++).toString().padStart(12, '0')}`; }

async function seed() {
  await Promise.all([
    tenantRef.set({ name: 'Bootstrap Store', moduleType: 'benta-snap', subscriptionStatus: 'active', ownerUid: 'owner-secret' }),
    tenantRef.collection('staff_accounts').doc('cashier-1').set({ tenantId, authUid: 'uid-1', sessionVersion: 1, status: 'active', username: 'Maria', pinHash: 'secret', activeShiftId: 'shift-1' }),
    tenantRef.collection('staff_accounts').doc('cashier-2').set({ tenantId, authUid: 'uid-2', sessionVersion: 1, status: 'active', username: 'Jose' }),
    tenantRef.collection('shifts').doc('shift-1').set(shift),
    tenantRef.collection('products').doc('p1').set({ tenantId, isActive: true, name: 'Rice', unit: 'bag', salePrice: 10_000, costPrice: 6_000, currentStock: 5, minStock: 1, supplier: 'secret' }),
    tenantRef.collection('products').doc('inactive').set({ tenantId, isActive: false, name: 'Old', unit: 'pc', salePrice: 1, costPrice: 1, currentStock: 1 }),
    tenantRef.collection('products').doc('cross').set({ tenantId: 'tenant-other', isActive: true, name: 'Cross', unit: 'pc', salePrice: 1, costPrice: 1, currentStock: 1 }),
    tenantRef.collection('products').doc('mismatch').set({ id: 'forged', tenantId, isActive: true, name: 'Mismatch', unit: 'pc', salePrice: 1, costPrice: 1, currentStock: 1 }),
    tenantRef.collection('accounts').doc('master-cash').set({ id: 'master-cash', tenantId, balance: 0 })
  ]);
}

async function captureShiftAuthorityState() {
  const [staff, shifts] = await Promise.all([
    tenantRef.collection('staff_accounts').get(), tenantRef.collection('shifts').get()
  ]);
  const serialize = (snapshot: admin.firestore.QuerySnapshot) => snapshot.docs
    .map((document) => ({ id: document.id, data: document.data() }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify({ staff: serialize(staff), shifts: serialize(shifts) });
}

async function main() {
  console.log(`BENTA CASHIER BOOTSTRAP EMULATOR ${PROJECT_ID} @ ${EMULATOR_HOST}`); await seed();
  const bootstrap = await getBentaCashierBootstrap('cashier1', service);
  assert(bootstrap.currentShift?.id === 'shift-1' && bootstrap.tenantId === tenantId && bootstrap.staffAccountId === 'cashier-1', 'valid authenticated Cashier receives authoritative active-shift bootstrap');
  assert(bootstrap.products.length === 1 && bootstrap.products[0].id === 'p1', 'catalogue excludes inactive, cross-tenant, and path-ID-contradictory products');
  const serialized = JSON.stringify(bootstrap);
  assert(!serialized.includes('costPrice') && !serialized.includes('supplier') && !serialized.includes('pinHash') && !serialized.includes('sessionVersion') && !serialized.includes('authUid') && !serialized.includes('owner-secret'), 'Emulator bootstrap response excludes cost and internal security metadata');
  assert((await getBentaCashierBootstrap('cashier2', service)).currentShift === null, 'consistent no-shift Cashier receives null currentShift');

  const expectAssociatedOpenFailure = async (token: string, label: string, shiftId: string, shiftData: Record<string, unknown>) => {
    const shiftRef = tenantRef.collection('shifts').doc(shiftId); await shiftRef.set(shiftData);
    const before = await captureShiftAuthorityState();
    await rejects(() => getBentaCashierBootstrap(token, service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, `${label} fails closed`);
    assert(await captureShiftAuthorityState() === before, `${label} is mutation-free`);
    await shiftRef.delete();
  };
  await expectAssociatedOpenFailure('cashier2', 'missing pointer with correct staffAccountId and corrupted staffId', 'orphan-account', {
    ...shift, id: 'orphan-account', staffAccountId: 'cashier-2', staffId: 'staff_corrupted', openedBy: 'staff_cashier-2'
  });
  await expectAssociatedOpenFailure('cashier2', 'missing pointer with correct staffId and corrupted staffAccountId', 'orphan-actor', {
    ...shift, id: 'orphan-actor', staffAccountId: 'other-cashier', staffId: 'staff_cashier-2', openedBy: 'staff_cashier-2'
  });
  await expectAssociatedOpenFailure('cashier1', 'valid pointer with second open shift for the same staffAccountId', 'duplicate-account', {
    ...shift, id: 'duplicate-account', staffId: 'staff_corrupted'
  });
  await expectAssociatedOpenFailure('cashier1', 'valid pointer with second open shift for the same staffId', 'duplicate-actor', {
    ...shift, id: 'duplicate-actor', staffAccountId: 'other-cashier'
  });

  bootstrap.products[0].salePrice = 1; bootstrap.products[0].currentStock = 999_999;
  await rejects(() => completeBentaCashierCheckout('cashier1', { idempotencyKey: key(), moduleId: 'benta-snap', shiftId: 'shift-1', items: [{ productId: 'p1', quantity: 1, price: 1, currentStock: 999_999 }], paymentMethod: 'cash' }, service), CheckoutErrorCode.INVALID_REQUEST, 'browser-supplied catalogue price and stock are rejected');
  const receipt = await completeBentaCashierCheckout('cashier1', { idempotencyKey: key(), moduleId: 'benta-snap', shiftId: 'shift-1', items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash' }, service);
  assert(receipt.totalCentavos === 10_000 && (await tenantRef.collection('products').doc('p1').get()).data()!.currentStock === 4, 'trusted checkout independently reloads authoritative price and stock');

  await tenantRef.collection('shifts').doc('shift-1').update({ id: 'forged' });
  await rejects(() => getBentaCashierBootstrap('cashier1', service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'stored/path shift-ID contradiction fails closed');
  await tenantRef.collection('shifts').doc('shift-1').update({ id: 'shift-1' });
  await tenantRef.collection('shifts').doc('orphan-2').set({ ...shift, id: 'orphan-2', staffAccountId: 'cashier-2', staffId: 'staff_cashier-2', openedBy: 'staff_cashier-2' });
  await rejects(() => getBentaCashierBootstrap('cashier2', service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'unexpected open shift without pointer fails closed');
  await rejects(() => getBentaCashierBootstrap('stale', service), CheckoutErrorCode.SESSION_INVALID, 'stale session fails closed');
  await rejects(() => getBentaCashierBootstrap('wrongTenant', service), CheckoutErrorCode.OPERATION_NOT_PERMITTED, 'wrong tenant fails closed');
  await tenantRef.update({ subscriptionStatus: 'suspended' });
  await rejects(() => getBentaCashierBootstrap('cashier1', service), CheckoutErrorCode.CHECKOUT_UNAVAILABLE, 'inactive subscription fails closed');
  await tenantRef.update({ subscriptionStatus: 'active' });
  console.log(`RESULT ${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
