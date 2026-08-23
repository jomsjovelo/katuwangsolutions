import test from 'node:test';
import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';
import { finalizeCashierSaleIntent, validateAndAggregateIntentItems } from '../src/lib/server/benta-cashier-intent-finalizer';
import { submitHybridCashSale } from '../src/lib/client/hybrid-cash-checkout-manager';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-katuwang-offline-test';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

// 1. Isolation Guard
if (!PROJECT_ID.startsWith('demo-')) {
  throw new Error(`Refusing tests against non-demo project '${PROJECT_ID}'`);
}

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const appName = 'hybrid-cash-slice-emulator-test';
const adminApp = admin.apps.find((a) => a?.name === appName) || admin.initializeApp({ projectId: PROJECT_ID }, appName);
const db = adminApp.firestore();
const auth = adminApp.auth();

test('B-Hybrid Cash Vertical Slice Live Emulator Suite', async (t) => {
  const tenantId = `tenant_hybrid_${Date.now()}`;
  const staffAccountId = 'staff_hybrid_cashier1';
  const cashierAuthUid = `cashier_hybrid_uid_${Date.now()}`;
  const shiftId = `shift_hybrid_${Date.now()}`;

  let cashierCustomToken: string;
  let cashierIdToken: string;

  await t.test('1. Setup Isolated Tenant, Staff, Shift, Products in Emulator', async () => {
    // Tenant
    await db.collection('tenants').doc(tenantId).set({
      id: tenantId,
      name: 'Hybrid Demo Store',
      ownerUid: 'owner_hybrid_uid',
      moduleType: 'benta-snap',
      subscriptionStatus: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Staff Account
    await db.collection('tenants').doc(tenantId).collection('staff_accounts').doc(staffAccountId).set({
      id: staffAccountId,
      tenantId,
      username: 'hybridcashier',
      usernameLower: 'hybridcashier',
      displayName: 'Hybrid Cashier',
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
      displayName: 'Hybrid Cashier'
    });

    await auth.setCustomUserClaims(cashierAuthUid, {
      role: 'cashier',
      tenantId,
      staffAccountId,
      sessionVersion: 1
    });

    cashierCustomToken = await auth.createCustomToken(cashierAuthUid, {
      role: 'cashier',
      tenantId,
      staffAccountId,
      sessionVersion: 1
    });

    // Exchange custom token for ID token via Auth emulator REST API
    const verifyRes = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cashierCustomToken, returnSecureToken: true })
    });

    const verifyData = await verifyRes.json() as any;
    cashierIdToken = verifyData.idToken;
    assert.ok(cashierIdToken, 'Should receive valid ID token from Auth emulator');

    // Products
    await db.collection('tenants').doc(tenantId).collection('products').doc('prod_rice').set({
      id: 'prod_rice',
      tenantId,
      name: 'Sinandomeng Rice 1kg',
      unit: 'kg',
      salePrice: 5500, // ₱55.00
      costPrice: 4200, // ₱42.00
      currentStock: 50,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('tenants').doc(tenantId).collection('products').doc('prod_sardines').set({
      id: 'prod_sardines',
      tenantId,
      name: 'Ligo Sardines Red',
      unit: 'can',
      salePrice: 2800, // ₱28.00
      costPrice: 2100, // ₱21.00
      currentStock: 10,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Master Cash Account
    await db.collection('tenants').doc(tenantId).collection('accounts').doc('master-cash').set({
      id: 'master-cash',
      tenantId,
      name: 'Main Cash Register',
      type: 'asset',
      balance: 100000, // ₱1,000.00
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Shift
    await db.collection('tenants').doc(tenantId).collection('shifts').doc(shiftId).set({
      id: shiftId,
      tenantId,
      moduleId: 'benta-snap',
      staffId: `staff_${staffAccountId}`,
      staffAccountId,
      openedBy: `staff_${staffAccountId}`,
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
      openedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  const intentId1 = `intent_${Date.now()}_1`;

  await t.test('2. Store Valid Immutable Cash Sale Intent in Emulator', async () => {
    const intentRef = db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(intentId1);

    await intentRef.set({
      schemaVersion: 1,
      intentId: intentId1,
      tenantId,
      authUid: cashierAuthUid,
      staffAccountId,
      shiftId,
      tender: 'cash',
      items: [
        { productId: 'prod_rice', quantity: 2, observedUnitPriceCentavos: 5500, observedSubtotalCentavos: 11000 },
        { productId: 'prod_sardines', quantity: 1, observedUnitPriceCentavos: 2800, observedSubtotalCentavos: 2800 }
      ],
      itemCount: 3,
      observedCatalogDigest: 'digest_test_123',
      observedTotalCentavos: 13800,
      cashTenderedCentavos: 15000,
      changeRequiredCentavos: 1200,
      clientCreatedAt: new Date().toISOString(),
      status: 'pending'
    });

    const snap = await intentRef.get();
    assert.strictEqual(snap.exists, true);
    assert.strictEqual(snap.data()?.status, 'pending');
  });

  await t.test('3. Server Authoritative Finalization: Atomically Decrements Stock, Creates Sale, Ledger, Shift Totals', async () => {
    const result = await finalizeCashierSaleIntent(cashierIdToken, {
      tenantId,
      intentId: intentId1
    }, { adminFirestore: db, adminAuth: auth });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'accepted');
    assert.ok(result.saleId);
    assert.strictEqual(result.receipt?.totalCentavos, 13800);

    // Verify stock decremented
    const riceSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_rice').get();
    assert.strictEqual(riceSnap.data()?.currentStock, 48); // 50 - 2

    const sardineSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_sardines').get();
    assert.strictEqual(sardineSnap.data()?.currentStock, 9); // 10 - 1

    // Verify sale document exists
    const saleSnap = await db.collection('tenants').doc(tenantId).collection('sales').doc(result.saleId!).get();
    assert.strictEqual(saleSnap.exists, true);
    assert.strictEqual(saleSnap.data()?.totalAmount, 13800);

    // Verify master cash updated
    const cashSnap = await db.collection('tenants').doc(tenantId).collection('accounts').doc('master-cash').get();
    assert.strictEqual(cashSnap.data()?.balance, 113800); // 100000 + 13800

    // Verify shift totals
    const shiftSnap = await db.collection('tenants').doc(tenantId).collection('shifts').doc(shiftId).get();
    assert.strictEqual(shiftSnap.data()?.cashSales, 13800);
    assert.strictEqual(shiftSnap.data()?.totalShiftSales, 13800);
    assert.strictEqual(shiftSnap.data()?.saleCount, 1);

    // Verify intent status updated
    const intentSnap = await db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(intentId1).get();
    assert.strictEqual(intentSnap.data()?.status, 'accepted');
    assert.strictEqual(intentSnap.data()?.authoritativeSaleId, result.saleId);
  });

  await t.test('4. Idempotent Replay of Already Finalized Intent Returns Exact Same Receipt Without Re-decrementing Stock', async () => {
    const replayResult = await finalizeCashierSaleIntent(cashierIdToken, {
      tenantId,
      intentId: intentId1
    }, { adminFirestore: db, adminAuth: auth });

    assert.strictEqual(replayResult.success, true);
    assert.strictEqual(replayResult.status, 'accepted');

    // Re-verify stock remains exactly 48, not 46
    const riceSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_rice').get();
    assert.strictEqual(riceSnap.data()?.currentStock, 48);

    // Re-verify shift count remains 1
    const shiftSnap = await db.collection('tenants').doc(tenantId).collection('shifts').doc(shiftId).get();
    assert.strictEqual(shiftSnap.data()?.saleCount, 1);
  });

  const intentId2 = `intent_${Date.now()}_insufficient_stock`;

  await t.test('5. Stock Insufficiency: Marks Intent needs_review With Zero Financial Mutations', async () => {
    // Attempt to buy 100 sardines when only 9 left
    await db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(intentId2).set({
      schemaVersion: 1,
      intentId: intentId2,
      tenantId,
      authUid: cashierAuthUid,
      staffAccountId,
      shiftId,
      tender: 'cash',
      items: [
        { productId: 'prod_sardines', quantity: 100, observedUnitPriceCentavos: 2800, observedSubtotalCentavos: 280000 }
      ],
      itemCount: 100,
      observedTotalCentavos: 280000,
      cashTenderedCentavos: 300000,
      changeRequiredCentavos: 20000,
      clientCreatedAt: new Date().toISOString(),
      status: 'pending'
    });

    const result = await finalizeCashierSaleIntent(cashierIdToken, {
      tenantId,
      intentId: intentId2
    }, { adminFirestore: db, adminAuth: auth });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'needs_review');

    // Verify stock untouched
    const sardineSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_sardines').get();
    assert.strictEqual(sardineSnap.data()?.currentStock, 9);

    // Verify master cash untouched
    const cashSnap = await db.collection('tenants').doc(tenantId).collection('accounts').doc('master-cash').get();
    assert.strictEqual(cashSnap.data()?.balance, 113800);

    // Verify shift count untouched
    const shiftSnap = await db.collection('tenants').doc(tenantId).collection('shifts').doc(shiftId).get();
    assert.strictEqual(shiftSnap.data()?.saleCount, 1);
  });

  await t.test('6. Deterministic Product Aggregation across duplicate item lines', async () => {
    const raw = [
      { productId: 'prod_rice', quantity: 2 },
      { productId: 'prod_sardines', quantity: 1 },
      { productId: 'prod_rice', quantity: 3 }
    ];
    const aggregated = validateAndAggregateIntentItems(raw);
    assert.strictEqual(aggregated.length, 2);
    assert.strictEqual(aggregated.find(x => x.productId === 'prod_rice')?.quantity, 5);
    assert.strictEqual(aggregated.find(x => x.productId === 'prod_sardines')?.quantity, 1);
  });

  const intentId3 = `intent_${Date.now()}_insufficient_cash`;

  await t.test('7. Negative Test: Insufficient Cash Tendered is Rejected as rejected_tampered', async () => {
    // Total is 5500, but cash tendered is only 3000
    await db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(intentId3).set({
      schemaVersion: 1,
      intentId: intentId3,
      tenantId,
      authUid: cashierAuthUid,
      staffAccountId,
      shiftId,
      tender: 'cash',
      items: [{ productId: 'prod_rice', quantity: 1, observedUnitPriceCentavos: 5500, observedSubtotalCentavos: 5500 }],
      itemCount: 1,
      observedTotalCentavos: 5500,
      cashTenderedCentavos: 3000,
      changeRequiredCentavos: 0,
      clientCreatedAt: new Date().toISOString(),
      status: 'pending'
    });

    const result = await finalizeCashierSaleIntent(cashierIdToken, {
      tenantId,
      intentId: intentId3
    }, { adminFirestore: db, adminAuth: auth });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'rejected_tampered');

    // Verify stock remains untouched at 48
    const riceSnap = await db.collection('tenants').doc(tenantId).collection('products').doc('prod_rice').get();
    assert.strictEqual(riceSnap.data()?.currentStock, 48);
  });

  const intentId4 = `intent_${Date.now()}_malformed_qty`;

  await t.test('8. Negative Test: Non-safe/fractional quantity rejected as rejected_tampered', async () => {
    await db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(intentId4).set({
      schemaVersion: 1,
      intentId: intentId4,
      tenantId,
      authUid: cashierAuthUid,
      staffAccountId,
      shiftId,
      tender: 'cash',
      items: [{ productId: 'prod_rice', quantity: -5 }],
      itemCount: -5,
      observedTotalCentavos: 5500,
      cashTenderedCentavos: 10000,
      changeRequiredCentavos: 4500,
      clientCreatedAt: new Date().toISOString(),
      status: 'pending'
    });

    const result = await finalizeCashierSaleIntent(cashierIdToken, {
      tenantId,
      intentId: intentId4
    }, { adminFirestore: db, adminAuth: auth });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'rejected_tampered');
  });

  await t.test('9. Durable Local Acceptance: returns provisional receipt upon local observation without awaiting server acknowledgement', async () => {
    let locallyObserved = false;
    let serverAcknowledged = false;

    const { provisionalReceipt, intentId } = await submitHybridCashSale({
      tenantId,
      staffAccountId,
      authUid: cashierAuthUid,
      shiftId,
      cashierDisplayName: 'Hybrid Cashier',
      catalogDigest: 'digest_123',
      items: [
        { productId: 'prod_rice', name: 'Rice 1kg', unit: 'kg', quantity: 1, salePriceCentavos: 5500 }
      ],
      cashTenderedCentavos: 6000
    }, {
      injectedSetIntent: async (tId, iId, docData) => {
        // Asynchronously initiate write (server ack takes 5 seconds, simulating offline / slow network)
        setTimeout(() => {
          serverAcknowledged = true;
          db.collection('tenants').doc(tId).collection('cashier_sale_intents').doc(iId).set(docData);
        }, 5000);
      },
      injectedLocalObserver: async () => {
        // Fast local observation (e.g. 5ms)
        await new Promise((resolve) => setTimeout(resolve, 5));
        locallyObserved = true;
      }
    });

    assert.ok(intentId);
    assert.strictEqual(locallyObserved, true, 'Must observe in local cache before returning');
    assert.strictEqual(serverAcknowledged, false, 'Provisional receipt must NOT block on server acknowledgement');
    assert.ok(provisionalReceipt.receiptNumber.startsWith('PROV-'));
    assert.strictEqual(provisionalReceipt.totalCentavos, 5500);
  });

  await t.test('10. Durable Local Acceptance: Local rejection or timeout fails closed', async () => {
    await assert.rejects(
      async () => {
        await submitHybridCashSale({
          tenantId,
          staffAccountId,
          authUid: cashierAuthUid,
          shiftId,
          cashierDisplayName: 'Hybrid Cashier',
          items: [
            { productId: 'prod_rice', name: 'Rice 1kg', unit: 'kg', quantity: 1, salePriceCentavos: 5500 }
          ],
          cashTenderedCentavos: 6000
        }, {
          localAcceptanceTimeoutMs: 50,
          injectedLocalObserver: async () => {
            // Simulate broken storage or timeout
            await new Promise((_, reject) => setTimeout(() => reject(new Error('Storage failure')), 20));
          }
        });
      },
      /Storage failure/,
      'Local storage rejection must reject checkout and retain cart'
    );
  });
});
