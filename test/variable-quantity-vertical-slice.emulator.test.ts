import test from 'node:test';
import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';
import { finalizeCashierSaleIntent, validateAndAggregateIntentItems } from '../src/lib/server/benta-cashier-intent-finalizer';
import { computeLineFinancials } from '../src/lib/shared/quantity-math';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-katuwang-offline-test';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

// Isolation Guard
if (!PROJECT_ID.startsWith('demo-')) {
  throw new Error(`Refusing tests against non-demo project '${PROJECT_ID}'`);
}

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.NO_GCE_CHECK = 'true';
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'demo-api-key';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
process.env.BENTA_CASHIER_CHECKOUT_ENABLED = 'true';
process.env.BENTA_CASHIER_HYBRID_ENABLED = 'true';


const appName = 'var-qty-slice-emulator-test';
const adminApp = admin.apps.find((a) => a?.name === appName) || admin.initializeApp({ projectId: PROJECT_ID }, appName);
const db = adminApp.firestore();
const auth = adminApp.auth();

test('Variable Quantity Mixed-Cart & Adaptive Profile Vertical Slice Suite', async (t) => {
  const tenantId = `tenant_varqty_${Date.now()}`;
  const staffAccountId = 'staff_varqty_cashier1';
  const cashierAuthUid = `cashier_varqty_uid_${Date.now()}`;
  const shiftId = `shift_varqty_${Date.now()}`;

  let cashierIdToken: string;
  let clientAuthInstance: any;
  let clientDbInstance: any;
  let clientAppInstance: any;

  await t.test('1. Setup Isolated Fresh Goods Tenant, Staff, Shift & Products', async () => {
    // Tenant
    await db.collection('tenants').doc(tenantId).set({
      id: tenantId,
      name: 'Fresh Harvest Demo',
      ownerUid: 'owner_varqty_uid',
      moduleType: 'benta-snap',
      businessProfile: 'fresh_goods',
      subscriptionStatus: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Staff Account
    await db.collection('tenants').doc(tenantId).collection('staff_accounts').doc(staffAccountId).set({
      id: staffAccountId,
      tenantId,
      username: 'freshcashier',
      usernameLower: 'freshcashier',
      displayName: 'Fresh Cashier',
      role: 'cashier',
      status: 'active',
      sessionVersion: 1,
      authUid: cashierAuthUid,
      activeShiftId: shiftId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Auth User with custom claims
    try {
      await auth.deleteUser(cashierAuthUid);
    } catch {}

    await auth.createUser({
      uid: cashierAuthUid,
      displayName: 'Fresh Cashier'
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

    // Exchange custom token for ID token via Auth Emulator
    const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    });
    const authData = await res.json();
    assert.ok(authData.idToken, 'Must receive valid idToken from emulator');
    cashierIdToken = authData.idToken;

    // Setup Owner credentials for client SDK calls
    const ownerUid = 'owner_varqty_uid';
    try {
      await auth.deleteUser(ownerUid);
    } catch {}
    await auth.createUser({ uid: ownerUid, displayName: 'Store Owner' });
    await auth.setCustomUserClaims(ownerUid, { role: 'owner', tenantId });
    const ownerCustomToken = await auth.createCustomToken(ownerUid, { role: 'owner', tenantId });

    const { initializeFirebase } = await import('../src/firebase/index');
    const initRes = initializeFirebase();
    clientAuthInstance = initRes.auth;
    clientDbInstance = initRes.db;
    clientAppInstance = initRes.app;
    const { signInWithCustomToken } = await import('firebase/auth');
    await signInWithCustomToken(clientAuthInstance, ownerCustomToken);


    // Shift
    await db.collection('tenants').doc(tenantId).collection('shifts').doc(shiftId).set({
      id: shiftId,
      tenantId,
      moduleId: 'benta-snap',
      staffAccountId,
      staffId: `staff_${staffAccountId}`,
      openedBy: `staff_${staffAccountId}`,
      status: 'open',
      startingCash: 200000,
      cashSales: 0,
      gcashSales: 0,
      mayaSales: 0,
      totalShiftSales: 0,
      electronicReceipts: 0,
      physicalCashAdjustments: 0,
      saleCount: 0,
      reconciliationVersion: 1,
      openedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Products:
    // 1. Measured: Pork Liempo @ ₱280.00/kg (28000 centavos), Cost ₱220.00 (22000 centavos), Stock 50.000 kg (50000 minor)
    await db.collection('tenants').doc(tenantId).collection('products').doc('prod_liempo').set({
      id: 'prod_liempo',
      tenantId,
      name: 'Pork Liempo',
      salePrice: 28000,
      costPrice: 22000,
      quantityMode: 'measured',
      sellingUnit: 'kg',
      quantityScale: 3,
      stockQuantityMinor: 50000,
      currentStock: 50,
      unit: 'kg',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Discrete: Vinegar Bottle @ ₱35.00 (3500 centavos), Cost ₱25.00 (2500 centavos), Stock 20 btl
    await db.collection('tenants').doc(tenantId).collection('products').doc('prod_vinegar').set({
      id: 'prod_vinegar',
      tenantId,
      name: 'Vinegar 350ml',
      salePrice: 3500,
      costPrice: 2500,
      quantityMode: 'discrete',
      currentStock: 20,
      unit: 'btl',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await t.test('2. Process and Finalize Mixed-Cart Intent (Schema v2: Measured + Discrete)', async () => {
    const intentId = `intent_mix_${Date.now()}`;
    const intentRef = db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(intentId);

    // Mixed cart:
    // Item 1: 1.250 kg Pork Liempo -> 28000 * 1250 / 1000 = 35000 centavos (₱350.00)
    // Item 2: 2 btl Vinegar -> 3500 * 2 = 7000 centavos (₱70.00)
    // Total = 42000 centavos (₱420.00)
    const expectedSubtotal = 42000;

    await intentRef.set({
      schemaVersion: 2,
      intentId,
      tenantId,
      authUid: cashierAuthUid,
      staffAccountId,
      shiftId,
      tender: 'cash',
      items: [
        {
          productId: 'prod_liempo',
          quantityMode: 'measured',
          quantityMinor: 1250,
          quantityScale: 3,
          sellingUnit: 'kg',
          observedUnitPriceCentavos: 28000,
          observedSubtotalCentavos: 35000
        },
        {
          productId: 'prod_vinegar',
          quantityMode: 'discrete',
          quantity: 2,
          observedUnitPriceCentavos: 3500,
          observedSubtotalCentavos: 7000
        }
      ],
      itemCount: 2,
      observedTotalCentavos: expectedSubtotal,
      cashTenderedCentavos: 50000,
      changeRequiredCentavos: 8000,
      clientCreatedAt: new Date().toISOString(),
      status: 'pending'
    });

    const result = await finalizeCashierSaleIntent(cashierIdToken, { tenantId, intentId }, {
      adminAuth: auth,
      adminFirestore: db
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'accepted');
    assert.ok(result.saleId, 'Must create sale document');
    assert.equal(result.receipt?.totalCentavos, expectedSubtotal);

    // Verify product stock updates:
    // Liempo: 50000 - 1250 = 48750 minor (48.750 kg)
    const liempoSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_liempo').get();
    assert.equal(liempoSnap.data()?.stockQuantityMinor, 48750);

    // Vinegar: 20 - 2 = 18 btl
    const vinegarSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_vinegar').get();
    assert.equal(vinegarSnap.data()?.currentStock, 18);

    // Verify shift aggregate increment
    const shiftSnap = await db.collection('tenants').doc(tenantId).collection('shifts').doc(shiftId).get();
    assert.equal(shiftSnap.data()?.cashSales, expectedSubtotal);
    assert.equal(shiftSnap.data()?.totalShiftSales, expectedSubtotal);
    assert.equal(shiftSnap.data()?.saleCount, 1);
  });

  await t.test('3. Verify Backward Compatibility for Schema v1 Legacy Discrete Intents', async () => {
    const intentId = `intent_v1_${Date.now()}`;
    const intentRef = db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(intentId);

    // Schema v1 intent (integer quantity, no quantityMode)
    await intentRef.set({
      schemaVersion: 1,
      intentId,
      tenantId,
      authUid: cashierAuthUid,
      staffAccountId,
      shiftId,
      tender: 'cash',
      items: [
        {
          productId: 'prod_vinegar',
          quantity: 3,
          observedUnitPriceCentavos: 3500,
          observedSubtotalCentavos: 10500
        }
      ],
      itemCount: 3,
      observedTotalCentavos: 10500,
      cashTenderedCentavos: 10500,
      changeRequiredCentavos: 0,
      clientCreatedAt: new Date().toISOString(),
      status: 'pending'
    });

    const result = await finalizeCashierSaleIntent(cashierIdToken, { tenantId, intentId }, {
      adminAuth: auth,
      adminFirestore: db
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'accepted');

    // Vinegar stock: 18 - 3 = 15
    const vinegarSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_vinegar').get();
    assert.equal(vinegarSnap.data()?.currentStock, 15);
  });

  await t.test('4. Owner 1.25 kg Measured Checkout via processCheckout', async () => {
    const { processCheckout } = await import('../src/firebase/firestore/retail-actions');
    
    // Pork Liempo stock before: 48750 minor units (48.750 kg)
    const saleId = await processCheckout(
      tenantId,
      [
        {
          productId: 'prod_liempo',
          name: 'Pork Liempo',
          price: 28000,
          quantity: 1,
          quantityMode: 'measured',
          quantityMinor: 1250,
          quantityScale: 3,
          sellingUnit: 'kg'
        }
      ],
      35000,
      'cash'
    );

    assert.ok(saleId, 'Must return saleId');

    // Verify stock deduction: 48750 - 1250 = 47500 minor (47.500 kg)
    const liempoSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_liempo').get();
    assert.equal(liempoSnap.data()?.stockQuantityMinor, 47500);

    // Verify sale document persisted canonical fields
    const saleSnap = await db.collection('tenants').doc(tenantId).collection('sales').doc(saleId).get();
    const saleData = saleSnap.data();
    assert.equal(saleData?.totalAmount, 35000);
    assert.equal(saleData?.items?.length, 1);
    const item = saleData?.items?.[0];
    assert.equal(item.quantityMode, 'measured');
    assert.equal(item.quantityMinor, 1250);
    assert.equal(item.quantityScale, 3);
    assert.equal(item.sellingUnit, 'kg');
    assert.equal(item.unitPriceCentavos, 28000);
    assert.equal(item.unitCostCentavos, 22000);
    assert.equal(item.lineSubtotalCentavos, 35000);
    assert.equal(item.lineCostCentavos, 27500);
  });

  await t.test('5. Hardware 2.5 m Measured Wire Checkout (scale 3, meter unit)', async () => {
    const { processCheckout } = await import('../src/firebase/firestore/retail-actions');

    // Create hardware wire product: ₱40.00/m (4000 centavos), Cost ₱25.00/m (2500 centavos), Stock 100.000 m (100000 minor)
    await db.collection('tenants').doc(tenantId).collection('products').doc('prod_wire').set({
      id: 'prod_wire',
      tenantId,
      name: 'Electrical Wire THHN #12',
      salePrice: 4000,
      costPrice: 2500,
      quantityMode: 'measured',
      sellingUnit: 'm',
      quantityScale: 3,
      stockQuantityMinor: 100000,
      minStockMinor: 10000, // 10.000 m low stock threshold
      unit: 'm',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Checkout 2.500 m wire: 2500 minor units
    // Total = 4000 * 2500 / 1000 = 10000 centavos (₱100.00)
    // Cost = 2500 * 2500 / 1000 = 6250 centavos (₱62.50)
    const saleId = await processCheckout(
      tenantId,
      [
        {
          productId: 'prod_wire',
          name: 'Electrical Wire THHN #12',
          price: 4000,
          quantity: 1,
          quantityMode: 'measured',
          quantityMinor: 2500,
          quantityScale: 3,
          sellingUnit: 'm'
        }
      ],
      10000,
      'cash'
    );

    assert.ok(saleId);
    const wireSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_wire').get();
    assert.equal(wireSnap.data()?.stockQuantityMinor, 97500); // 100000 - 2500 = 97500 (97.500 m)

    const saleSnap = await db.collection('tenants').doc(tenantId).collection('sales').doc(saleId).get();
    const item = saleSnap.data()?.items?.[0];
    assert.equal(item.quantityMode, 'measured');
    assert.equal(item.quantityMinor, 2500);
    assert.equal(item.sellingUnit, 'm');
    assert.equal(item.lineSubtotalCentavos, 10000);
    assert.equal(item.lineCostCentavos, 6250);
  });

  await t.test('6. Authoritative Product Binding Failures Reject as rejected_tampered with 0 Stock Deductions', async () => {
    // 6a: Discrete submitted against measured product (Pork Liempo)
    const intentIdMismatch = `intent_tamper_mode_${Date.now()}`;
    await db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(intentIdMismatch).set({
      schemaVersion: 2,
      intentId: intentIdMismatch,
      tenantId,
      authUid: cashierAuthUid,
      staffAccountId,
      shiftId,
      tender: 'cash',
      items: [{ productId: 'prod_liempo', quantityMode: 'discrete', quantity: 2, observedUnitPriceCentavos: 28000, observedSubtotalCentavos: 56000 }],
      itemCount: 2,
      observedTotalCentavos: 56000,
      cashTenderedCentavos: 60000,
      changeRequiredCentavos: 4000,
      clientCreatedAt: new Date().toISOString(),
      status: 'pending'
    });

    const resMismatch = await finalizeCashierSaleIntent(cashierIdToken, { tenantId, intentId: intentIdMismatch }, { adminAuth: auth, adminFirestore: db });
    assert.equal(resMismatch.status, 'rejected_tampered');

    // 6b: Wrong Unit (submitted 'm' against Pork Liempo 'kg')
    const intentIdUnit = `intent_tamper_unit_${Date.now()}`;
    await db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(intentIdUnit).set({
      schemaVersion: 2,
      intentId: intentIdUnit,
      tenantId,
      authUid: cashierAuthUid,
      staffAccountId,
      shiftId,
      tender: 'cash',
      items: [{ productId: 'prod_liempo', quantityMode: 'measured', quantityMinor: 1000, quantityScale: 3, sellingUnit: 'm', observedUnitPriceCentavos: 28000, observedSubtotalCentavos: 28000 }],
      itemCount: 1,
      observedTotalCentavos: 28000,
      cashTenderedCentavos: 30000,
      changeRequiredCentavos: 2000,
      clientCreatedAt: new Date().toISOString(),
      status: 'pending'
    });

    const resUnit = await finalizeCashierSaleIntent(cashierIdToken, { tenantId, intentId: intentIdUnit }, { adminAuth: auth, adminFirestore: db });
    assert.equal(resUnit.status, 'rejected_tampered');

    // Verify Pork stock remained untouched at 47500
    const liempoSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_liempo').get();
    assert.equal(liempoSnap.data()?.stockQuantityMinor, 47500);
  });

  await t.test('7. Insufficient Measured Stock Fails Closed as needs_review with 0 Financial Writes', async () => {
    const intentIdInsuff = `intent_insuff_${Date.now()}`;
    // Requested 100.000 kg (100000 minor units), available is 47500 minor units
    await db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(intentIdInsuff).set({
      schemaVersion: 2,
      intentId: intentIdInsuff,
      tenantId,
      authUid: cashierAuthUid,
      staffAccountId,
      shiftId,
      tender: 'cash',
      items: [{ productId: 'prod_liempo', quantityMode: 'measured', quantityMinor: 100000, quantityScale: 3, sellingUnit: 'kg', observedUnitPriceCentavos: 28000, observedSubtotalCentavos: 2800000 }],
      itemCount: 1,
      observedTotalCentavos: 2800000,
      cashTenderedCentavos: 3000000,
      changeRequiredCentavos: 200000,
      clientCreatedAt: new Date().toISOString(),
      status: 'pending'
    });

    const resInsuff = await finalizeCashierSaleIntent(cashierIdToken, { tenantId, intentId: intentIdInsuff }, { adminAuth: auth, adminFirestore: db });
    assert.equal(resInsuff.status, 'needs_review');
    assert.equal(resInsuff.success, false);

    // Verify stock is still 47500
    const liempoSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_liempo').get();
    assert.equal(liempoSnap.data()?.stockQuantityMinor, 47500);
  });

  await t.test('8. Void Sale Exactly Restores 1.25 kg Stock and Ledger Balance (Prevents Double Restoration)', async () => {
    const { processCheckout, deleteSale } = await import('../src/firebase/firestore/retail-actions');

    // 1. Create a 1.250 kg sale
    const saleId = await processCheckout(
      tenantId,
      [
        {
          productId: 'prod_liempo',
          name: 'Pork Liempo',
          price: 28000,
          quantity: 1,
          quantityMode: 'measured',
          quantityMinor: 1250,
          quantityScale: 3,
          sellingUnit: 'kg'
        }
      ],
      35000,
      'cash'
    );

    // Stock before void: 47500 - 1250 = 46250
    let liempoSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_liempo').get();
    assert.equal(liempoSnap.data()?.stockQuantityMinor, 46250);

    // 2. Void the sale
    const voidResult = await deleteSale(tenantId, saleId, 'owner_uid', 'Owner Test');
    assert.equal(voidResult, true);

    // Stock after void: 46250 + 1250 = 47500
    liempoSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_liempo').get();
    assert.equal(liempoSnap.data()?.stockQuantityMinor, 47500);

    // 3. Second void attempt must fail (sale record no longer exists) -> prevents double stock/cash restoration
    await assert.rejects(async () => {
      await deleteSale(tenantId, saleId, 'owner_uid', 'Owner Test');
    });

    // Stock remains 47500
    liempoSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_liempo').get();
    assert.equal(liempoSnap.data()?.stockQuantityMinor, 47500);
  });

  await t.test('9. Shift Report and COGS Reconcile Canonical Financial Fields Exactly', async () => {
    try {
      const { fetchCashierShiftReport } = await import('../src/lib/server/benta-cashier-shift-report');

      const reportRes = await fetchCashierShiftReport(cashierIdToken, shiftId, { adminAuth: auth, adminFirestore: db });
      assert.ok(reportRes);
      const report = reportRes.currentReport;
      assert.ok(report);
      assert.equal(report.shiftId, shiftId);
      assert.ok(typeof report.totalGrossSalesCentavos === 'number' && report.totalGrossSalesCentavos > 0);
      assert.ok(typeof report.aggregateCogsCentavos === 'number' && report.aggregateCogsCentavos > 0);
      assert.ok(typeof report.aggregateGrossProfitCentavos === 'number');
      assert.equal(report.aggregateGrossProfitCentavos, report.totalGrossSalesCentavos - (report.aggregateCogsCentavos || 0));
    } catch (err: any) {
      console.error('TEST 9 ERROR:', err);
      throw err;
    }
  });

  await t.test('10. Business Profile Normalization & Non-destructive Invariant Switching', async () => {
    const { normalizeBentaProfile } = await import('../src/lib/app-data');

    // Normalization rules
    assert.equal(normalizeBentaProfile(undefined), 'general_retail');
    assert.equal(normalizeBentaProfile(''), 'general_retail');
    assert.equal(normalizeBentaProfile('standard-retail'), 'general_retail');
    assert.equal(normalizeBentaProfile('general_retail'), 'general_retail');
    assert.equal(normalizeBentaProfile('fresh-goods'), 'fresh_goods');
    assert.equal(normalizeBentaProfile('fresh_goods'), 'fresh_goods');
    assert.equal(normalizeBentaProfile('hardware-supplies'), 'hardware_supply');
    assert.equal(normalizeBentaProfile('hardware_supply'), 'hardware_supply');

    // Invariant switching: updating tenant profile to hardware_supply leaves product data intact
    await db.collection('tenants').doc(tenantId).update({
      businessProfile: 'hardware_supply',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const liempoSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_liempo').get();
    assert.equal(liempoSnap.data()?.stockQuantityMinor, 47500);
    assert.equal(liempoSnap.data()?.salePrice, 28000);
  });

  // Resource Cleanup
  try {
    if (clientAuthInstance) {
      const { signOut } = await import('firebase/auth');
      await signOut(clientAuthInstance);
    }
  } catch {}

  try {
    if (clientDbInstance) {
      const { terminate } = await import('firebase/firestore');
      await terminate(clientDbInstance);
    }
  } catch {}

  try {
    if (clientAppInstance) {
      const { deleteApp } = await import('firebase/app');
      await deleteApp(clientAppInstance);
    }
  } catch {}

  try {
    if (typeof (db as any).terminate === 'function') {
      await (db as any).terminate();
    }
    await adminApp.delete();
  } catch {}

  try {
    const http = await import('http');
    const https = await import('https');
    http.globalAgent.destroy();
    https.globalAgent.destroy();
  } catch {}
});
