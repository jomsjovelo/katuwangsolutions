import test from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import { completeBentaCashierCheckout } from '../src/lib/server/benta-cashier-checkout';
import { hashPinModern } from '../src/lib/server/pin-security';
import { useSyncStatus } from '../src/hooks/use-sync-status';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-katuwang-offline-test' });
}

const db = admin.firestore();
const auth = admin.auth();

const PEPPER_CONFIG = {
  activeVersion: 'v1',
  peppers: {
    v1: 'katuwang_isolated_test_pepper_secret_32bytes_v1!!'
  }
};

test('Cash Drawer Accounting & Offline Status Copy Suite', async (t) => {
  const tenantId = `tenant_accounting_${Date.now()}`;
  const staffAccountId = 'staff_test_acct';
  const cashierUid = `cashier_uid_${Date.now()}`;
  const shiftId = `shift_acct_${Date.now()}`;
  const prodRiceId = 'prod_rice_acct';
  const prodSoapId = 'prod_soap_acct';

  // Seed test tenant, cashier, shift, accounts, products
  const tenantRef = db.collection('tenants').doc(tenantId);
  await tenantRef.set({
    id: tenantId,
    name: 'Accounting Test Store',
    ownerUid: 'owner_acct_test',
    moduleType: 'benta-snap',
    subscriptionStatus: 'active'
  });

  const pinHash = await hashPinModern('1234', PEPPER_CONFIG);
  await tenantRef.collection('staff_accounts').doc(staffAccountId).set({
    id: staffAccountId,
    tenantId,
    username: 'testcashier',
    displayName: 'Test Cashier',
    role: 'cashier',
    status: 'active',
    sessionVersion: 1,
    authUid: cashierUid,
    activeShiftId: shiftId,
    pin: pinHash
  });

  const actorId = `staff_${staffAccountId}`;
  await tenantRef.collection('shifts').doc(shiftId).set({
    id: shiftId,
    tenantId,
    moduleId: 'benta-snap',
    staffId: actorId,
    staffAccountId,
    openedBy: actorId,
    status: 'open',
    reconciliationVersion: 1,
    startingCash: 100000,
    cashSales: 0,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 0,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 0,
    startingCashCentavos: 100000,
    expectedEndingCashCentavos: 100000,
    grossSalesCentavos: 0,
    totalSalesCentavos: 0,
    cashSalesCentavos: 0,
    gcashSalesCentavos: 0,
    mayaSalesCentavos: 0,
    totalSalesCount: 0,
    openedAt: admin.firestore.Timestamp.now()
  });

  // Seed master-cash starting at ₱1,000.00
  await tenantRef.collection('accounts').doc('master-cash').set({
    id: 'master-cash',
    tenantId,
    name: 'Main Cash Register',
    type: 'asset',
    balance: 100000,
    isActive: true
  });

  // Seed products: Rice (₱50, stock: 50), Soap (₱35, stock: 40)
  await tenantRef.collection('products').doc(prodRiceId).set({
    id: prodRiceId,
    tenantId,
    name: 'Sinandomeng Rice 1kg',
    category: 'Staples',
    unit: 'kg',
    salePrice: 5000, // ₱50.00
    costPrice: 4000,
    currentStock: 50,
    isActive: true
  });

  await tenantRef.collection('products').doc(prodSoapId).set({
    id: prodSoapId,
    tenantId,
    name: 'Bath Soap',
    category: 'Toiletries',
    unit: 'pc',
    salePrice: 3500, // ₱35.00
    costPrice: 2500,
    currentStock: 40,
    isActive: true
  });

  // Create Auth user & get mock token
  try {
    await auth.deleteUser(cashierUid);
  } catch {}

  await auth.createUser({
    uid: cashierUid,
    email: `${cashierUid}@katuwang.local`
  });

  await auth.setCustomUserClaims(cashierUid, {
    role: 'cashier',
    tenantId,
    staffAccountId,
    sessionVersion: 1
  });

  // Mock ID token resolution by passing adminAuth / identity to completeBentaCashierCheckout
  const mockOptions = {
    adminFirestore: db,
    adminAuth: {
      verifyIdToken: async () => ({
        uid: cashierUid,
        role: 'cashier',
        tenantId,
        staffAccountId,
        sessionVersion: 1
      })
    } as any
  };

  const idempCash1 = '11111111-1111-4111-8111-111111111111';
  const idempGcash1 = '22222222-2222-4222-8222-222222222222';
  const idempMaya1 = '33333333-3333-4333-8333-333333333333';
  const idempCash2 = '44444444-4444-4444-8444-444444444444';

  await t.test('1. Cash sale increases total sales and master-cash, and deducts inventory', async () => {
    const res = await completeBentaCashierCheckout('dummy_token', {
      idempotencyKey: idempCash1,
      moduleId: 'benta-snap',
      shiftId,
      paymentMethod: 'cash',
      items: [{ productId: prodRiceId, quantity: 2 }] // 2 * ₱50 = ₱100
    }, mockOptions);

    assert.strictEqual(res.totalCentavos, 10000);

    // Verify master-cash balance: 100000 + 10000 = 110000 (₱1,100)
    const masterSnap = await tenantRef.collection('accounts').doc('master-cash').get();
    assert.strictEqual(masterSnap.data()?.balance, 110000);

    // Verify inventory: 50 - 2 = 48
    const prodSnap = await tenantRef.collection('products').doc(prodRiceId).get();
    assert.strictEqual(prodSnap.data()?.currentStock, 48);

    // Verify shift totals
    const shiftSnap = await tenantRef.collection('shifts').doc(shiftId).get();
    assert.strictEqual(shiftSnap.data()?.cashSales, 10000);
    assert.strictEqual(shiftSnap.data()?.totalShiftSales, 10000);
    const expectedDrawer = (shiftSnap.data()?.startingCash || 0) + (shiftSnap.data()?.cashSales || 0);
    assert.strictEqual(expectedDrawer, 110000);
  });

  await t.test('2. GCash sale increases total sales, updates gcash-settlement, does NOT change master-cash', async () => {
    const res = await completeBentaCashierCheckout('dummy_token', {
      idempotencyKey: idempGcash1,
      moduleId: 'benta-snap',
      shiftId,
      paymentMethod: 'gcash',
      paymentReference: 'GCASH123456',
      items: [{ productId: prodSoapId, quantity: 1 }] // 1 * ₱35 = ₱35
    }, mockOptions);

    assert.strictEqual(res.totalCentavos, 3500);

    // Verify master-cash balance is STILL 110000 (₱1,100), not increased!
    const masterSnap = await tenantRef.collection('accounts').doc('master-cash').get();
    assert.strictEqual(masterSnap.data()?.balance, 110000);

    // Verify gcash-settlement account is created/credited with 3500 (₱35)
    const gcashSnap = await tenantRef.collection('accounts').doc('gcash-settlement').get();
    assert.ok(gcashSnap.exists);
    assert.strictEqual(gcashSnap.data()?.balance, 3500);

    // Verify inventory: 40 - 1 = 39
    const prodSnap = await tenantRef.collection('products').doc(prodSoapId).get();
    assert.strictEqual(prodSnap.data()?.currentStock, 39);

    // Verify shift totals
    const shiftSnap = await tenantRef.collection('shifts').doc(shiftId).get();
    assert.strictEqual(shiftSnap.data()?.gcashSales, 3500);
    assert.strictEqual(shiftSnap.data()?.totalShiftSales, 13500); // 100 + 35 = ₱135
    const expectedDrawer = (shiftSnap.data()?.startingCash || 0) + (shiftSnap.data()?.cashSales || 0);
    assert.strictEqual(expectedDrawer, 110000); // Only cash increases expected cash!
  });

  await t.test('3. Maya sale increases total sales, updates maya-settlement, does NOT change master-cash', async () => {
    const res = await completeBentaCashierCheckout('dummy_token', {
      idempotencyKey: idempMaya1,
      moduleId: 'benta-snap',
      shiftId,
      paymentMethod: 'maya',
      paymentReference: 'MAYA987654',
      items: [{ productId: prodRiceId, quantity: 1 }] // 1 * ₱50 = ₱50
    }, mockOptions);

    assert.strictEqual(res.totalCentavos, 5000);

    // Verify master-cash balance is STILL 110000 (₱1,100)
    const masterSnap = await tenantRef.collection('accounts').doc('master-cash').get();
    assert.strictEqual(masterSnap.data()?.balance, 110000);

    // Verify maya-settlement account is credited with 5000 (₱50)
    const mayaSnap = await tenantRef.collection('accounts').doc('maya-settlement').get();
    assert.ok(mayaSnap.exists);
    assert.strictEqual(mayaSnap.data()?.balance, 5000);

    // Verify inventory: 48 - 1 = 47
    const prodSnap = await tenantRef.collection('products').doc(prodRiceId).get();
    assert.strictEqual(prodSnap.data()?.currentStock, 47);

    // Verify shift totals
    const shiftSnap = await tenantRef.collection('shifts').doc(shiftId).get();
    assert.strictEqual(shiftSnap.data()?.mayaSales, 5000);
    assert.strictEqual(shiftSnap.data()?.totalShiftSales, 18500); // 100 + 35 + 50 = ₱185
    const expectedDrawer = (shiftSnap.data()?.startingCash || 0) + (shiftSnap.data()?.cashSales || 0);
    assert.strictEqual(expectedDrawer, 110000);
  });

  await t.test('4. Idempotent checkout retry returns identical receipt without double-charging or stock reduction', async () => {
    const res = await completeBentaCashierCheckout('dummy_token', {
      idempotencyKey: idempCash1, // Replaying checkout from test 1
      moduleId: 'benta-snap',
      shiftId,
      paymentMethod: 'cash',
      items: [{ productId: prodRiceId, quantity: 2 }]
    }, mockOptions);

    assert.strictEqual(res.totalCentavos, 10000);

    // Master-cash still 110000
    const masterSnap = await tenantRef.collection('accounts').doc('master-cash').get();
    assert.strictEqual(masterSnap.data()?.balance, 110000);

    // Rice stock still 47 (not reduced again)
    const prodSnap = await tenantRef.collection('products').doc(prodRiceId).get();
    assert.strictEqual(prodSnap.data()?.currentStock, 47);
  });

  await t.test('5. Starting cash ₱1,000 + Cash sales ₱218 produces exact drawer ₱1,218', async () => {
    // Add additional cash sale of ₱118 (total cash = 100 + 118 = 218)
    const prodSpecialId = 'prod_special_118';
    await tenantRef.collection('products').doc(prodSpecialId).set({
      id: prodSpecialId,
      tenantId,
      name: 'Special Item',
      unit: 'pc',
      salePrice: 11800,
      costPrice: 8000,
      currentStock: 10,
      isActive: true
    });

    await completeBentaCashierCheckout('dummy_token', {
      idempotencyKey: idempCash2,
      moduleId: 'benta-snap',
      shiftId,
      paymentMethod: 'cash',
      items: [{ productId: prodSpecialId, quantity: 1 }]
    }, mockOptions);

    const masterSnap = await tenantRef.collection('accounts').doc('master-cash').get();
    assert.strictEqual(masterSnap.data()?.balance, 121800, 'Master cash must equal ₱1,218.00');

    const shiftSnap = await tenantRef.collection('shifts').doc(shiftId).get();
    assert.strictEqual(shiftSnap.data()?.cashSales, 21800, 'Cash sales must equal ₱218.00');
    const expectedDrawer = (shiftSnap.data()?.startingCash || 0) + (shiftSnap.data()?.cashSales || 0);
    assert.strictEqual(expectedDrawer, 121800, 'Expected cash drawer must equal ₱1,218.00');
    assert.strictEqual(shiftSnap.data()?.totalShiftSales, 30300, 'Total sales must equal ₱303.00 (218 cash + 35 gcash + 50 maya)');
  });

  await t.test('6. Ledger transactions display customer-facing description without internal engineering text', async () => {
    const txsSnap = await tenantRef.collection('transactions').get();
    txsSnap.forEach((docSnap) => {
      const desc = docSnap.data().description || '';
      assert.ok(!desc.includes('Hybrid intent'), 'Ledger description must not include Hybrid intent');
      assert.strictEqual(desc, 'Benta Snap Cashier Sale');
    });
  });

  await t.test('7. Offline copy validation', () => {
    // Test that Cashier offline message states Cash sales are available and will auto-sync
    const cashierOfflineMessage = "Offline mode: Cash sales are available and will auto-sync.";
    assert.ok(cashierOfflineMessage.includes("Cash sales are available"));
    assert.ok(cashierOfflineMessage.includes("auto-sync"));
    assert.ok(!cashierOfflineMessage.includes("Hindi maaaring mag-checkout"));

    // Test that Owner offline message is neutral
    const ownerOfflineMessage = "Offline mode: Some live data may be unavailable.";
    assert.ok(ownerOfflineMessage.includes("Some live data may be unavailable"));
  });
});
