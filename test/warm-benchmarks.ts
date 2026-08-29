import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';
import { executeCashierLogoutCoordinator } from '../src/lib/client/secure-benta-cashier-client';
import { submitHybridCashSale } from '../src/lib/client/hybrid-cash-checkout-manager';
import { finalizeCashierSaleIntent } from '../src/lib/server/benta-cashier-intent-finalizer';
import { revokeStaffSession } from '../src/lib/server/staff-logout-handler';

// ============================================================================
// 1. STRICT EMULATOR & LOOPBACK ISOLATION GUARDS (EXACT PATTERN MATCHING)
// ============================================================================
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-katuwang-offline-test';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const DEV_SERVER_ORIGIN = process.env.DEV_SERVER_ORIGIN || 'http://localhost:9002';

const HOST_PATTERN = /^(127\.0\.0\.1|localhost):\d+$/;
const LOOPBACK_ORIGIN_PATTERN = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;

if (!PROJECT_ID.startsWith('demo-')) {
  console.error(`[ISOLATION_FAILURE] Refusing execution: PROJECT_ID '${PROJECT_ID}' does not start with 'demo-'`);
  process.exitCode = 1;
  throw new Error(`Isolation check failed: PROJECT_ID must start with 'demo-'`);
}

if (!HOST_PATTERN.test(FIRESTORE_HOST)) {
  console.error(`[ISOLATION_FAILURE] Refusing execution: FIRESTORE_EMULATOR_HOST '${FIRESTORE_HOST}' does not match ${HOST_PATTERN}`);
  process.exitCode = 1;
  throw new Error(`Isolation check failed: FIRESTORE_EMULATOR_HOST must match /^(127\\.0\\.0\\.1|localhost):\\d+$/`);
}

if (!HOST_PATTERN.test(AUTH_HOST)) {
  console.error(`[ISOLATION_FAILURE] Refusing execution: FIREBASE_AUTH_EMULATOR_HOST '${AUTH_HOST}' does not match ${HOST_PATTERN}`);
  process.exitCode = 1;
  throw new Error(`Isolation check failed: FIREBASE_AUTH_EMULATOR_HOST must match /^(127\\.0\\.0\\.1|localhost):\\d+$/`);
}

if (!LOOPBACK_ORIGIN_PATTERN.test(DEV_SERVER_ORIGIN)) {
  console.error(`[ISOLATION_FAILURE] Refusing execution: DEV_SERVER_ORIGIN '${DEV_SERVER_ORIGIN}' does not match ${LOOPBACK_ORIGIN_PATTERN}`);
  process.exitCode = 1;
  throw new Error(`Isolation check failed: DEV_SERVER_ORIGIN must match /^http:\\/\\/(127\\.0\\.0\\.1|localhost):\\d+$/`);
}

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const adminApp = admin.apps.length === 0 ? admin.initializeApp({ projectId: PROJECT_ID }) : admin.app();
const db = adminApp.firestore();
const auth = adminApp.auth();

async function runBenchmarks() {
  console.log('================================================================');
  console.log('KATUWANG BENCHMARK & HARD-ASSERTION SUITE (EMULATOR + HTTP API)');
  console.log(`Project: ${PROJECT_ID} | Firestore: ${FIRESTORE_HOST} | Auth: ${AUTH_HOST}`);
  console.log(`Target HTTP Origin: ${DEV_SERVER_ORIGIN}`);
  console.log('================================================================\n');

  const tenantId = `tenant_bench_${Date.now()}`;
  const staffAccountId = `staff_bench_${Date.now()}`;
  const cashierAuthUid = `cashier_bench_uid_${Date.now()}`;
  const shiftId = `shift_bench_${Date.now()}`;

  // Seed Isolated Tenant
  await db.collection('tenants').doc(tenantId).set({
    id: tenantId,
    name: 'Benchmark Store',
    ownerUid: 'owner_bench_uid',
    moduleType: 'benta-snap',
    subscriptionStatus: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Seed Staff Account (starts at sessionVersion: 1)
  await db.collection('tenants').doc(tenantId).collection('staff_accounts').doc(staffAccountId).set({
    id: staffAccountId,
    tenantId,
    username: 'benchcashier',
    usernameLower: 'benchcashier',
    displayName: 'Benchmark Cashier',
    role: 'cashier',
    status: 'active',
    sessionVersion: 1,
    authUid: cashierAuthUid,
    activeShiftId: shiftId,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Seed Shift
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

  // Seed Master Cash Account
  await db.collection('tenants').doc(tenantId).collection('accounts').doc('master-cash').set({
    id: 'master-cash',
    tenantId,
    name: 'Main Cash Register',
    type: 'asset',
    balance: 100000,
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Seed Product: Starting Stock = 10,000 minor units (10.000 kg)
  const INITIAL_STOCK_MINOR = 10000;
  const productRef = db.collection('tenants').doc(tenantId).collection('products').doc('prod_rice_bench');
  await productRef.set({
    id: 'prod_rice_bench',
    tenantId,
    name: 'Jasmine Rice 1kg',
    quantityMode: 'measured',
    quantityScale: 3,
    sellingUnit: 'kg',
    unit: 'kg',
    price: 5000,
    salePrice: 5000,
    costPrice: 3500,
    stockQuantityMinor: INITIAL_STOCK_MINOR,
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Setup Auth User and Claims
  try { await auth.deleteUser(cashierAuthUid); } catch {}
  await auth.createUser({ uid: cashierAuthUid, displayName: 'Benchmark Cashier' });
  await auth.setCustomUserClaims(cashierAuthUid, {
    role: 'cashier',
    tenantId,
    staffAccountId,
    sessionVersion: 1,
    activeShiftId: shiftId
  });

  async function getFreshIdToken(sessionVersion: number): Promise<string> {
    await auth.setCustomUserClaims(cashierAuthUid, {
      role: 'cashier',
      tenantId,
      staffAccountId,
      sessionVersion,
      activeShiftId: shiftId
    });

    const customToken = await auth.createCustomToken(cashierAuthUid, {
      role: 'cashier',
      tenantId,
      staffAccountId,
      sessionVersion
    });

    const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    });
    const data = (await res.json()) as any;
    assert.ok(data.idToken, 'Auth emulator must return valid idToken');
    return data.idToken;
  }

  const cashierIdTokenV1 = await getFreshIdToken(1);

  // --------------------------------------------------------------------------
  // SECTION 1: FIVE WARM CASHIER CHECKOUTS (SERVER PRIMITIVE MICROBENCHMARKS)
  // --------------------------------------------------------------------------
  console.log('--- 1. FIVE WARM CASHIER CHECKOUTS (Server Primitive / Emulator Microbenchmarks) ---');
  console.log('Note: Direct Admin calls measure server primitive/emulator transaction latency.');
  console.log('      Browser IndexedDB acceptance is instrumented and awaiting human verification.\n');

  const checkoutResults: {
    run: number;
    intentCreationMs: number;
    serverFinalizationMs: number;
    totalMs: number;
    remainingStockMinor: number;
  }[] = [];

  for (let i = 1; i <= 5; i++) {
    const intentId = `bench-intent-${i}-${Date.now()}`;
    const t0 = performance.now();
    let writePromise: Promise<void> | null = null;

    // 1. Submit hybrid cash intent
    await submitHybridCashSale({
      tenantId,
      staffAccountId,
      authUid: cashierAuthUid,
      shiftId,
      cashierDisplayName: 'Benchmark Cashier',
      items: [{
        productId: 'prod_rice_bench',
        name: 'Jasmine Rice 1kg',
        unit: 'kg',
        quantityMode: 'measured',
        quantityMinor: 1000, // Exactly 1.000 kg (1000 minor units)
        quantityScale: 3,
        sellingUnit: 'kg',
        salePriceCentavos: 5000
      }],
      cashTenderedCentavos: 5000,
      idempotencyKey: intentId
    }, {
      injectedSetIntent: (tId, iId, docData) => {
        const p = db.collection('tenants').doc(tId).collection('cashier_sale_intents').doc(iId).set(docData);
        writePromise = p;
        return p;
      },
      injectedLocalObserver: async (tId, iId) => {
        if (writePromise) {
          await writePromise;
        }
        const snap = await db.collection('tenants').doc(tId).collection('cashier_sale_intents').doc(iId).get();
        assert.ok(snap.exists, `Intent document ${iId} must exist in store`);
      }
    });

    const tIntentCreated = performance.now();
    const intentCreationMs = tIntentCreated - t0;

    // 2. Server-authoritative finalization
    const tFinalizeStart = performance.now();
    await finalizeCashierSaleIntent(
      cashierIdTokenV1,
      { tenantId, intentId },
      { adminAuth: auth, adminFirestore: db }
    );
    const tFinalizeEnd = performance.now();
    const serverFinalizationMs = tFinalizeEnd - tFinalizeStart;

    const prodSnap = await productRef.get();
    const currentStockMinor = prodSnap.data()?.stockQuantityMinor;

    checkoutResults.push({
      run: i,
      intentCreationMs: Number(intentCreationMs.toFixed(2)),
      serverFinalizationMs: Number(serverFinalizationMs.toFixed(2)),
      totalMs: Number((tFinalizeEnd - t0).toFixed(2)),
      remainingStockMinor: currentStockMinor
    });
  }

  console.table(checkoutResults);

  // Hard Assertions after Section 1
  console.log('\n--- VERIFYING HARD INVENTORY & FINANCIAL ASSERTIONS (SECTION 1) ---');
  const prodSnapSection1 = await productRef.get();
  const stockSection1 = prodSnapSection1.data()?.stockQuantityMinor;
  console.log(`Initial stock: 10000 | Expected after 5 sales: 5000 | Actual: ${stockSection1}`);
  assert.strictEqual(stockSection1, 5000, 'Five 1kg sales must decrement stock from 10,000 to exactly 5,000 minor units');

  const salesSnapSection1 = await db.collection('tenants').doc(tenantId).collection('sales').get();
  console.log(`Sales documents created: ${salesSnapSection1.size} (Expected: 5)`);
  assert.strictEqual(salesSnapSection1.size, 5, 'Exactly 5 sales documents must exist');

  const movementsSnapSection1 = await db.collection('tenants').doc(tenantId).collection('inventory_movements').get();
  console.log(`Inventory movements created: ${movementsSnapSection1.size} (Expected: 5)`);
  assert.strictEqual(movementsSnapSection1.size, 5, 'Exactly 5 inventory movement documents must exist');

  // --------------------------------------------------------------------------
  // SECTION 2: THREE WARM CASHIER LOGOUT RUNS (1→2→3→4)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. THREE WARM CASHIER LOGOUT RUNS (Session Rotation Microbenchmarks) ---');
  console.log('Note: Direct revokeStaffSession() measures transaction and identity verification primitive latency.\n');

  const logoutResults: {
    run: number;
    serverRevocationMs: number;
    totalMs: number;
    newSessionVersion: number;
  }[] = [];

  for (let version = 1; version <= 3; version++) {
    const currentIdToken = await getFreshIdToken(version);
    let tServer = 0;
    const tStart = performance.now();

    await executeCashierLogoutCoordinator({
      getIdToken: async () => currentIdToken,
      serverLogoutFn: async (token: string) => {
        const t0 = performance.now();
        const res = await revokeStaffSession(token, { adminAuth: auth, adminFirestore: db });
        tServer = performance.now() - t0;
        return res;
      },
      firebaseSignOutFn: async () => {},
      onLocalStateCleanup: () => {},
      onRedirect: () => {}
    });

    const tTotal = performance.now() - tStart;
    const staffSnap = await db.collection('tenants').doc(tenantId).collection('staff_accounts').doc(staffAccountId).get();
    const updatedVersion = staffSnap.data()?.sessionVersion;

    logoutResults.push({
      run: version,
      serverRevocationMs: Number(tServer.toFixed(2)),
      totalMs: Number(tTotal.toFixed(2)),
      newSessionVersion: updatedVersion
    });

    assert.strictEqual(updatedVersion, version + 1, `Logout run ${version} must increment sessionVersion to ${version + 1}`);
  }

  console.table(logoutResults);

  const staffSnapSection2 = await db.collection('tenants').doc(tenantId).collection('staff_accounts').doc(staffAccountId).get();
  const sessionVersionSection2 = staffSnapSection2.data()?.sessionVersion;
  console.log(`Session version after 3 logouts: ${sessionVersionSection2} (Expected: 4)`);
  assert.strictEqual(sessionVersionSection2, 4, 'Session version must be exactly 4 after 3 sequential logouts');

  // --------------------------------------------------------------------------
  // SECTION 3: REAL LOCALHOST HTTP API ROUTE BENCHMARKS & HARD ASSERTIONS
  // --------------------------------------------------------------------------
  console.log('\n--- 3. REAL LOCALHOST HTTP API ROUTE BENCHMARKS ---');
  console.log(`Target: ${DEV_SERVER_ORIGIN}\n`);

  // 3A. Real HTTP POST to /api/auth/staff-logout (sessionVersion 4 -> 5)
  console.log('Testing real HTTP POST to /api/auth/staff-logout...');
  const idTokenV4 = await getFreshIdToken(4);
  const tHttpLogoutStart = performance.now();
  const httpLogoutRes = await fetch(`${DEV_SERVER_ORIGIN}/api/auth/staff-logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idTokenV4}`
    }
  });
  const tHttpLogoutEnd = performance.now();
  const httpLogoutDuration = tHttpLogoutEnd - tHttpLogoutStart;

  assert.strictEqual(httpLogoutRes.status, 200, `HTTP /api/auth/staff-logout failed with status ${httpLogoutRes.status}`);
  const httpLogoutData = (await httpLogoutRes.json()) as any;
  assert.deepStrictEqual(httpLogoutData, { success: true }, 'HTTP /api/auth/staff-logout must return { success: true }');

  const staffSnapAfterHttpLogout = await db.collection('tenants').doc(tenantId).collection('staff_accounts').doc(staffAccountId).get();
  const sessionVersionAfterHttp = staffSnapAfterHttpLogout.data()?.sessionVersion;
  console.log(`Staff sessionVersion after HTTP logout: ${sessionVersionAfterHttp} (Expected: 5)`);
  assert.strictEqual(sessionVersionAfterHttp, 5, 'HTTP /api/auth/staff-logout must increment sessionVersion exactly from 4 to 5');
  console.log(`[HTTP_PERF_STAFF_LOGOUT] Completed in ${httpLogoutDuration.toFixed(2)}ms (Status: 200, SessionVersion: 5)\n`);

  // 3B. Real HTTP POST to /api/cashier/benta-finalize-intent (Isolated Intent 6)
  console.log('Testing real HTTP POST to /api/cashier/benta-finalize-intent...');
  const idTokenV5 = await getFreshIdToken(5);
  const httpIntentId = `bench-http-intent-6-${Date.now()}`;

  // Submit isolated pending intent directly to Firestore
  await db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(httpIntentId).set({
    intentId: httpIntentId,
    tenantId,
    shiftId,
    staffAccountId,
    authUid: cashierAuthUid,
    status: 'pending',
    paymentMethod: 'cash',
    items: [{
      productId: 'prod_rice_bench',
      name: 'Jasmine Rice 1kg',
      unit: 'kg',
      quantityMode: 'measured',
      quantityMinor: 1000, // 1.000 kg sale
      quantityScale: 3,
      sellingUnit: 'kg',
      salePriceCentavos: 5000
    }],
    totalAmountCentavos: 5000,
    cashTenderedCentavos: 5000,
    idempotencyKey: httpIntentId,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const tHttpFinalizeStart = performance.now();
  const httpFinalizeRes = await fetch(`${DEV_SERVER_ORIGIN}/api/cashier/benta-finalize-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idTokenV5}`
    },
    body: JSON.stringify({ tenantId, intentId: httpIntentId })
  });
  const tHttpFinalizeEnd = performance.now();
  const httpFinalizeDuration = tHttpFinalizeEnd - tHttpFinalizeStart;

  assert.strictEqual(httpFinalizeRes.status, 200, `HTTP /api/cashier/benta-finalize-intent failed with status ${httpFinalizeRes.status}`);
  const httpFinalizeData = (await httpFinalizeRes.json()) as any;
  assert.strictEqual(httpFinalizeData.success, true, 'Finalize intent result must have success: true');
  assert.strictEqual(httpFinalizeData.status, 'accepted', 'Finalize intent status must be accepted');

  // Hard Assertions for HTTP Intent Finalization
  const prodSnapAfterHttp = await productRef.get();
  const stockAfterHttp = prodSnapAfterHttp.data()?.stockQuantityMinor;
  console.log(`Stock after HTTP finalization: ${stockAfterHttp} (Expected: 4000)`);
  assert.strictEqual(stockAfterHttp, 4000, 'HTTP finalization of 1kg sale must decrement stock from 5000 to exactly 4000 minor units');

  const intentSnap = await db.collection('tenants').doc(tenantId).collection('cashier_sale_intents').doc(httpIntentId).get();
  const intentData = intentSnap.data();
  assert.strictEqual(intentData?.status, 'accepted', 'Intent status in Firestore must be accepted');
  const finalizedSaleId = intentData?.authoritativeSaleId || intentData?.finalization?.saleId || httpFinalizeData.receipt?.saleId;
  assert.ok(finalizedSaleId, 'Intent resolution must contain saleId');

  const saleSnap = await db.collection('tenants').doc(tenantId).collection('sales').doc(finalizedSaleId).get();
  assert.ok(saleSnap.exists, 'Authoritative sale document must exist for HTTP finalized intent');

  const movementQuery = await db.collection('tenants').doc(tenantId).collection('inventory_movements')
    .where('saleId', '==', finalizedSaleId).get();
  assert.strictEqual(movementQuery.size, 1, 'Exactly one inventory movement must exist for the HTTP finalized intent');

  console.log(`[HTTP_PERF_FINALIZE_INTENT] Completed in ${httpFinalizeDuration.toFixed(2)}ms (Status: 200, Stock: 4000)`);

  // 3C. Idempotent Replay via HTTP
  console.log('Testing idempotent replay of /api/cashier/benta-finalize-intent via HTTP...');
  const tReplayStart = performance.now();
  const httpReplayRes = await fetch(`${DEV_SERVER_ORIGIN}/api/cashier/benta-finalize-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idTokenV5}`
    },
    body: JSON.stringify({ tenantId, intentId: httpIntentId })
  });
  const tReplayEnd = performance.now();
  const replayDuration = tReplayEnd - tReplayStart;

  assert.strictEqual(httpReplayRes.status, 200, `HTTP replay failed with status ${httpReplayRes.status}`);
  const httpReplayData = (await httpReplayRes.json()) as any;
  assert.strictEqual(httpReplayData.success, true, 'Replay must succeed');
  assert.strictEqual(httpReplayData.status, 'accepted', 'Replay status must remain accepted');
  assert.strictEqual(httpReplayData.receipt?.saleId, finalizedSaleId, 'Replay must return exact same saleId');

  const prodSnapAfterReplay = await productRef.get();
  const stockAfterReplay = prodSnapAfterReplay.data()?.stockQuantityMinor;
  console.log(`Stock after replay: ${stockAfterReplay} (Expected: 4000)`);
  assert.strictEqual(stockAfterReplay, 4000, 'Idempotent replay must cause ZERO second stock decrement');

  const totalSalesSnap = await db.collection('tenants').doc(tenantId).collection('sales').get();
  assert.strictEqual(totalSalesSnap.size, 6, 'Total sales count must remain exactly 6 (5 local + 1 HTTP)');

  const totalMovementsSnap = await db.collection('tenants').doc(tenantId).collection('inventory_movements').get();
  assert.strictEqual(totalMovementsSnap.size, 6, 'Total movements count must remain exactly 6 (5 local + 1 HTTP)');

  console.log(`[HTTP_PERF_REPLAY] Completed in ${replayDuration.toFixed(2)}ms (Zero mutations verified)\n`);

  console.log('================================================================');
  console.log('ALL BENCHMARKS, ISOLATION GUARDS, AND HARD ASSERTIONS PASSED');
  console.log('================================================================\n');
}

runBenchmarks()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('[BENCHMARK_ERROR]', err);
    process.exitCode = 1;
  });
