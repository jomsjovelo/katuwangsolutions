import test from 'node:test';
import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';
import { finalizeCashierSaleIntent } from '../src/lib/server/benta-cashier-intent-finalizer';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-katuwang-offline-test';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

if (!PROJECT_ID.startsWith('demo-')) {
  throw new Error(`Refusing tests against non-demo project '${PROJECT_ID}'`);
}

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const appName = 'hybrid-measured-isolated-test';
const adminApp = admin.apps.find((a) => a?.name === appName) || admin.initializeApp({ projectId: PROJECT_ID }, appName);
const db = adminApp.firestore();
const auth = adminApp.auth();

test('Isolated Measured Inventory 9500 -> 7500 (Cashier UI Regression)', async (t) => {
  // === Isolated fixture: entirely separate tenant/staff/shift/product so
  // accumulated totals do not leak into or from the shared vertical-slice suite.
  const tenantId = `tenant_measured_${Date.now()}`;
  const staffAccountId = 'staff_measured_cashier1';
  const cashierAuthUid = `cashier_measured_uid_${Date.now()}`;
  const shiftId = `shift_measured_${Date.now()}`;
  const intentId = `intent_measured_${Date.now()}`;

  let cashierIdToken: string;

  await t.test('setup: isolated measured-product tenant, staff, shift', async () => {
    await db.collection('tenants').doc(tenantId).set({
      id: tenantId,
      name: 'Measured Demo Store',
      ownerUid: 'owner_measured_uid',
      moduleType: 'benta-snap',
      subscriptionStatus: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('tenants').doc(tenantId).collection('staff_accounts').doc(staffAccountId).set({
      id: staffAccountId,
      tenantId,
      username: 'measuredcashier',
      usernameLower: 'measuredcashier',
      displayName: 'Measured Cashier',
      role: 'cashier',
      status: 'active',
      sessionVersion: 1,
      authUid: cashierAuthUid,
      activeShiftId: shiftId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    try {
      await auth.deleteUser(cashierAuthUid);
    } catch {}

    await auth.createUser({
      uid: cashierAuthUid,
      displayName: 'Measured Cashier'
    });

    await auth.setCustomUserClaims(cashierAuthUid, {
      role: 'cashier',
      tenantId,
      staffAccountId,
      sessionVersion: 1
    });

    const customToken = await auth.createCustomToken(cashierAuthUid, {
      role: 'cashier',
      tenantId,
      staffAccountId,
      sessionVersion: 1
    });

    const verifyRes = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    });
    const verifyData = await verifyRes.json() as any;
    cashierIdToken = verifyData.idToken;
    assert.ok(cashierIdToken);

    await db.collection('tenants').doc(tenantId).collection('products').doc('prod_nails').set({
      id: 'prod_nails',
      tenantId,
      name: 'Bakal Na Lagari 1kg',
      unit: 'kg',
      quantityScale: 3,
      sellingUnit: 'kg',
      quantityMode: 'measured',
      salePrice: 11500,
      costPrice: 9500,
      stockQuantityMinor: 9500,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('tenants').doc(tenantId).collection('accounts').doc('master-cash').set({
      id: 'master-cash',
      tenantId,
      name: 'Main Cash Register',
      type: 'asset',
      balance: 0,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('tenants').doc(tenantId).collection('shifts').doc(shiftId).set({
      id: shiftId,
      tenantId,
      moduleId: 'benta-snap',
      staffId: `staff_${staffAccountId}`,
      staffAccountId,
      openedBy: `staff_${staffAccountId}`,
      status: 'open',
      reconciliationVersion: 1,
      startingCash: 0,
      cashSales: 0,
      gcashSales: 0,
      mayaSales: 0,
      totalShiftSales: 0,
      electronicReceipts: 0,
      physicalCashAdjustments: 0,
      saleCount: 0,
      openedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await t.test('initial stock is exactly 9500 minor units (9.500 kg)', async () => {
    const nailsSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_nails').get();
    assert.strictEqual(nailsSnap.data()?.stockQuantityMinor, 9500, 'Initial stock must be exactly 9500');
  });

  await t.test('finalize 2 kg Nails sale (quantityMinor 2000) reduces stock to 7500', async () => {
    await db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(intentId).set({
      schemaVersion: 2,
      intentId,
      tenantId,
      authUid: cashierAuthUid,
      staffAccountId,
      shiftId,
      tender: 'cash',
      items: [
        {
          productId: 'prod_nails',
          quantityMode: 'measured',
          quantityMinor: 2000,
          quantityScale: 3,
          sellingUnit: 'kg',
          observedUnitPriceCentavos: 11500,
          observedSubtotalCentavos: 23000
        }
      ],
      itemCount: 1,
      offlineAuthorityDigest: 'measured_isolated_digest',
      observedTotalCentavos: 23000,
      cashTenderedCentavos: 25000,
      changeRequiredCentavos: 2000,
      clientCreatedAt: new Date().toISOString(),
      status: 'pending'
    });

    const result = await finalizeCashierSaleIntent(cashierIdToken, {
      tenantId,
      intentId
    }, { adminFirestore: db, adminAuth: auth });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'accepted');
    assert.strictEqual(result.receipt?.totalCentavos, 23000, 'Isolated sale total must be exactly ₱230 (23000 centavos)');
    assert.ok(result.saleId);

    const nailsSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_nails').get();
    assert.strictEqual(nailsSnap.data()?.stockQuantityMinor, 7500,
      'After 2 kg sale (2000 minor units), stock must be exactly 7500');

    // Isolated shift totals — only this sale
    const shiftSnap = await db.collection('tenants').doc(tenantId).collection('shifts').doc(shiftId).get();
    assert.strictEqual(shiftSnap.data()?.cashSales, 23000, 'Isolated shift cashSales must be exactly ₱230');
    assert.strictEqual(shiftSnap.data()?.totalShiftSales, 23000, 'Isolated shift totalShiftSales must be exactly ₱230');
    assert.strictEqual(shiftSnap.data()?.saleCount, 1, 'Isolated shift saleCount must be exactly 1');

    const intentSnap = await db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(intentId).get();
    assert.strictEqual(intentSnap.data()?.status, 'accepted');
    assert.strictEqual(intentSnap.data()?.authoritativeSaleId, result.saleId);
  });

  await t.test('replay of same intent does not double-decrement; stock remains exactly 7500', async () => {
    const replayResult = await finalizeCashierSaleIntent(cashierIdToken, {
      tenantId,
      intentId
    }, { adminFirestore: db, adminAuth: auth });

    assert.strictEqual(replayResult.success, true);
    assert.strictEqual(replayResult.status, 'accepted');

    const nailsSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_nails').get();
    assert.strictEqual(nailsSnap.data()?.stockQuantityMinor, 7500,
      'Replay must NOT double-decrement: stock stays at 7500');

    const shiftSnap = await db.collection('tenants').doc(tenantId).collection('shifts').doc(shiftId).get();
    assert.strictEqual(shiftSnap.data()?.saleCount, 1, 'Replay must NOT increment saleCount');
    assert.strictEqual(shiftSnap.data()?.cashSales, 23000, 'Replay must NOT change cashSales');
  });
});