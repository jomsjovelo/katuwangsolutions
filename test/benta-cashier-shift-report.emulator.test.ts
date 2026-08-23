import { test } from 'node:test';
import assert from 'node:assert';
import * as admin from 'firebase-admin';
import { fetchCashierShiftReport } from '../src/lib/server/benta-cashier-shift-report';
import { hashPinModern } from '../src/lib/server/pin-security';
import { CheckoutErrorCode } from '../src/lib/server/cashier-server-authorization';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-katuwang-offline-test';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.BENTA_CASHIER_CHECKOUT_ENABLED = 'true';
process.env.BENTA_CASHIER_HYBRID_ENABLED = 'true';

const appName = 'cashier-shift-report-test-app-2';
const adminApp = admin.apps.find((a) => a?.name === appName) || admin.initializeApp({ projectId: PROJECT_ID }, appName);
const db = adminApp.firestore();
const auth = adminApp.auth();

test('Cashier Shift Report Server Authorization & Historical COGS Suite', async (t) => {
  const tenantId = `tenant_rep_${Date.now()}`;
  const cashierUid1 = `cashier_rep_1_${Date.now()}`;
  const staffAccountId1 = `staff_rep_1_${Date.now()}`;
  const shiftId1 = `shift_rep_1_${Date.now()}`;

  const cashierUid2 = `cashier_rep_2_${Date.now()}`;
  const staffAccountId2 = `staff_rep_2_${Date.now()}`;
  const shiftId2 = `shift_rep_2_${Date.now()}`;

  const shiftIdIncomplete = `shift_rep_incomp_${Date.now()}`;

  let cashierIdToken1 = '';
  let cashierIdToken2 = '';

  await t.test('1. Setup Isolated Tenant, Products, Shifts, and Canonical Sales Fixture in Emulator', async () => {
    const pepperSecret = process.env.STAFF_PIN_PEPPER_V1 || 'katuwang_local_dev_pepper_secret_v1_12345';
    const pinHash = await hashPinModern('1234', { peppers: { v1: pepperSecret }, activeVersion: 'v1' });

    // 1. Tenant
    await db.collection('tenants').doc(tenantId).set({
      id: tenantId,
      name: 'Shift Report Test Store',
      moduleType: 'benta-snap',
      subscriptionStatus: 'active'
    });

    // 2. Staff Accounts
    await db.collection('tenants').doc(tenantId).collection('staff_accounts').doc(staffAccountId1).set({
      id: staffAccountId1,
      tenantId,
      username: 'cashier1',
      displayName: 'Report Cashier 1',
      role: 'cashier',
      status: 'active',
      sessionVersion: 1,
      pinHash,
      authUid: cashierUid1,
      activeShiftId: shiftId1
    });

    await db.collection('tenants').doc(tenantId).collection('staff_accounts').doc(staffAccountId2).set({
      id: staffAccountId2,
      tenantId,
      username: 'cashier2',
      displayName: 'Report Cashier 2',
      role: 'cashier',
      status: 'active',
      sessionVersion: 1,
      pinHash,
      authUid: cashierUid2,
      activeShiftId: shiftId2
    });

    // 3. Auth Users + Custom Claims
    await auth.createUser({ uid: cashierUid1, displayName: 'Report Cashier 1' }).catch(() => {});
    await auth.setCustomUserClaims(cashierUid1, {
      role: 'cashier',
      tenantId,
      staffAccountId: staffAccountId1,
      sessionVersion: 1
    });

    await auth.createUser({ uid: cashierUid2, displayName: 'Report Cashier 2' }).catch(() => {});
    await auth.setCustomUserClaims(cashierUid2, {
      role: 'cashier',
      tenantId,
      staffAccountId: staffAccountId2,
      sessionVersion: 1
    });

    // 4. Products in catalog (Present-day cost)
    await db.collection('tenants').doc(tenantId).collection('products').doc('prod_coke').set({
      id: 'prod_coke',
      name: 'Coke 1.5L',
      salePrice: 7000,
      costPrice: 5000, // Current product cost: ₱50.00
      currentStock: 100,
      isActive: true,
      tenantId
    });

    await db.collection('tenants').doc(tenantId).collection('products').doc('prod_bread').set({
      id: 'prod_bread',
      name: 'Tasty Bread',
      salePrice: 6000,
      costPrice: 4000, // Current product cost: ₱40.00
      currentStock: 100,
      isActive: true,
      tenantId
    });

    // 5. Open Shifts
    await db.collection('tenants').doc(tenantId).collection('shifts').doc(shiftId1).set({
      id: shiftId1,
      tenantId,
      moduleId: 'benta-snap',
      staffAccountId: staffAccountId1,
      status: 'open',
      startingCash: 50000, // ₱500.00
      openedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('tenants').doc(tenantId).collection('shifts').doc(shiftId2).set({
      id: shiftId2,
      tenantId,
      moduleId: 'benta-snap',
      staffAccountId: staffAccountId2,
      status: 'open',
      startingCash: 80000, // ₱800.00
      openedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('tenants').doc(tenantId).collection('shifts').doc(shiftIdIncomplete).set({
      id: shiftIdIncomplete,
      tenantId,
      moduleId: 'benta-snap',
      staffAccountId: staffAccountId1,
      status: 'closed',
      startingCash: 20000,
      openedAt: admin.firestore.FieldValue.serverTimestamp(),
      closedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 6. Canonical Finalized Sales in Cashier 1's Shift 1:
    // Sale 1 (Cash): 2x Coke (salePrice: ₱70, historical costPrice: ₱50) -> totalAmount: 14000
    await db.collection('tenants').doc(tenantId).collection('sales').doc('sale_1').set({
      id: 'sale_1',
      tenantId,
      shiftId: shiftId1,
      staffAccountId: staffAccountId1,
      paymentMethod: 'cash',
      subtotalAmount: 14000,
      discountAmount: 0,
      totalAmount: 14000, // Canonical field
      items: [
        { productId: 'prod_coke', name: 'Coke 1.5L', quantity: 2, price: 7000, costPrice: 5000, lineTotal: 14000 }
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Sale 2 (GCash): 1x Bread (salePrice: ₱60, historical costPrice: ₱40) -> totalAmount: 6000
    await db.collection('tenants').doc(tenantId).collection('sales').doc('sale_2').set({
      id: 'sale_2',
      tenantId,
      shiftId: shiftId1,
      staffAccountId: staffAccountId1,
      paymentMethod: 'gcash',
      subtotalAmount: 6000,
      discountAmount: 0,
      totalAmount: 6000, // Canonical field
      items: [
        { productId: 'prod_bread', name: 'Tasty Bread', quantity: 1, price: 6000, costPrice: 4000, lineTotal: 6000 }
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Sale 3: In Shift 1, but belongs to Cashier 2 (should be EXCLUDED from Cashier 1 report)
    await db.collection('tenants').doc(tenantId).collection('sales').doc('sale_rogue').set({
      id: 'sale_rogue',
      tenantId,
      shiftId: shiftId1,
      staffAccountId: staffAccountId2,
      paymentMethod: 'cash',
      subtotalAmount: 50000,
      discountAmount: 0,
      totalAmount: 50000,
      items: [
        { productId: 'prod_coke', name: 'Coke 1.5L', quantity: 5, price: 7000, costPrice: 5000, lineTotal: 50000 }
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Sale 4: In Shift Incomplete, has an item with missing costPrice
    await db.collection('tenants').doc(tenantId).collection('sales').doc('sale_missing_cost').set({
      id: 'sale_missing_cost',
      tenantId,
      shiftId: shiftIdIncomplete,
      staffAccountId: staffAccountId1,
      paymentMethod: 'cash',
      subtotalAmount: 8000,
      discountAmount: 0,
      totalAmount: 8000,
      items: [
        { productId: 'prod_coke', name: 'Coke 1.5L', quantity: 1, price: 8000 /* missing costPrice */, lineTotal: 8000 }
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 7. Add a pending B-Hybrid intent (should NOT be counted in authoritative report)
    await db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc('intent_pending_1').set({
      id: 'intent_pending_1',
      tenantId,
      shiftId: shiftId1,
      staffAccountId: staffAccountId1,
      status: 'pending',
      items: [{ productId: 'prod_coke', quantity: 1, observedUnitPriceCentavos: 7000, observedSubtotalCentavos: 7000 }]
    });

    // Real tokens
    const customToken1 = await auth.createCustomToken(cashierUid1);
    const customToken2 = await auth.createCustomToken(cashierUid2);

    const res1 = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken1, returnSecureToken: true })
    });
    cashierIdToken1 = (await res1.json()).idToken;

    const res2 = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken2, returnSecureToken: true })
    });
    cashierIdToken2 = (await res2.json()).idToken;
  });

  await t.test('2. Assertion 1 & 2: Uses canonical totalAmount and item-level historical costPrice', async () => {
    const report = await fetchCashierShiftReport(cashierIdToken1, shiftId1, {
      adminAuth: auth,
      adminFirestore: db
    });

    const current = report.currentReport;
    // Canonical totalAmount sum: 14000 (Sale 1) + 6000 (Sale 2) = 20000 (Sale rogue excluded)
    assert.strictEqual(current.totalGrossSalesCentavos, 20000);
    assert.strictEqual(current.cashSalesCentavos, 14000);
    assert.strictEqual(current.gcashSalesCentavos, 6000);
    assert.strictEqual(current.saleCount, 2, 'Rogue sale from another cashier must be excluded');

    // Historical COGS: (2 * 5000) + (1 * 4000) = 14000
    assert.strictEqual(current.aggregateCogsCentavos, 14000);
    // Gross profit: 20000 - 14000 = 6000
    assert.strictEqual(current.aggregateGrossProfitCentavos, 6000);
    assert.strictEqual(current.profitComplete, true);
  });

  await t.test('3. Assertion 3: Modifying current product cost in catalog does NOT rewrite historical profit', async () => {
    // Mutate catalog product costPrice from ₱50 to ₱100
    await db.collection('tenants').doc(tenantId).collection('products').doc('prod_coke').update({
      costPrice: 10000
    });

    const report = await fetchCashierShiftReport(cashierIdToken1, shiftId1, {
      adminAuth: auth,
      adminFirestore: db
    });

    const current = report.currentReport;
    // Historical COGS remains 14000, profit remains 6000
    assert.strictEqual(current.aggregateCogsCentavos, 14000, 'Historical COGS must not change when catalog cost is edited');
    assert.strictEqual(current.aggregateGrossProfitCentavos, 6000);
  });

  await t.test('4. Assertion 4: Cross-cashier shift access is rejected with OPERATION_NOT_PERMITTED', async () => {
    await assert.rejects(
      async () => {
        await fetchCashierShiftReport(cashierIdToken1, shiftId2, {
          adminAuth: auth,
          adminFirestore: db
        });
      },
      (err: any) => {
        assert.strictEqual(err.code, CheckoutErrorCode.OPERATION_NOT_PERMITTED);
        return true;
      }
    );
  });

  await t.test('5. Assertion 5: Missing historical cost marks profitComplete false instead of inflating profit', async () => {
    const report = await fetchCashierShiftReport(cashierIdToken1, shiftIdIncomplete, {
      adminAuth: auth,
      adminFirestore: db
    });

    const current = report.currentReport;
    assert.strictEqual(current.totalGrossSalesCentavos, 8000);
    assert.strictEqual(current.profitComplete, false, 'Missing item costPrice must mark profitComplete false');
    assert.strictEqual(current.aggregateCogsCentavos, null);
    assert.strictEqual(current.aggregateGrossProfitCentavos, null, 'Must not report inflated gross profit');
  });

  await t.test('6. Assertion 6: Pending B-Hybrid offline intents remain provisional and excluded from authoritative totals', async () => {
    const report = await fetchCashierShiftReport(cashierIdToken1, shiftId1, {
      adminAuth: auth,
      adminFirestore: db
    });

    const current = report.currentReport;
    // Gross sales remains 20000 (pending intent of 7000 is NOT added)
    assert.strictEqual(current.totalGrossSalesCentavos, 20000);
    assert.strictEqual(current.saleCount, 2);
  });

  await t.test('7. Assertion 7: Active shift is resolved directly by staffAccount.activeShiftId when targetShiftId is omitted', async () => {
    // Calling without targetShiftId resolves shiftId1 from staffAccount1.activeShiftId
    const report = await fetchCashierShiftReport(cashierIdToken1, undefined, {
      adminAuth: auth,
      adminFirestore: db
    });

    assert.strictEqual(report.currentReport.shiftId, shiftId1);
    assert.strictEqual(report.currentReport.totalGrossSalesCentavos, 20000);
    assert.strictEqual(report.historicalShifts.length, 1);
    assert.strictEqual(report.historicalShifts[0].shiftId, shiftId1);
  });

  await t.test('8. Assertion 8: Cross-tenant shift access is strictly rejected', async () => {
    const otherTenantId = `other_tenant_${Date.now()}`;
    await db.collection('tenants').doc(otherTenantId).set({
      id: otherTenantId,
      name: 'Foreign Store',
      moduleType: 'benta-snap',
      subscriptionStatus: 'active'
    });
    const foreignShiftId = `foreign_shift_${Date.now()}`;
    await db.collection('tenants').doc(otherTenantId).collection('shifts').doc(foreignShiftId).set({
      id: foreignShiftId,
      tenantId: otherTenantId,
      staffAccountId: staffAccountId1,
      status: 'open',
      startingCash: 50000,
      openedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Cashier 1 authenticated for tenantId tries to access foreignShiftId (not present in tenantId.shifts)
    await assert.rejects(
      async () => {
        await fetchCashierShiftReport(cashierIdToken1, foreignShiftId, {
          adminAuth: auth,
          adminFirestore: db
        });
      },
      (err: any) => {
        assert.strictEqual(err.code, CheckoutErrorCode.INVALID_REQUEST);
        return true;
      }
    );
  });
});
