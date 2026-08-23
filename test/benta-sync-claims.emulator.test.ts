import * as admin from 'firebase-admin';
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { handleBentaSyncClaims } from '../src/lib/server/benta-sync-claims-handler';
import { OfflineGrantSigner } from '../src/lib/server/offline-grant-signer';
import { CatalogSnapshotService } from '../src/lib/server/catalog-snapshot-service';
import { OfflineAuthGrantPayload, OfflineClaimSyncRequest } from '../src/lib/offline/offline-types';

const PROJECT_ID = 'demo-katuwang-offline-test';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

// 1. Strict Runtime Isolation Guards
if (!PROJECT_ID.startsWith('demo-') || (!EMULATOR_HOST.startsWith('127.0.0.1') && !EMULATOR_HOST.startsWith('localhost'))) {
  throw new Error(`[SECURITY_FAIL_CLOSED] Runtime isolation violation! Production configuration refused. Project: '${PROJECT_ID}', Host: '${EMULATOR_HOST}'`);
}

process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const appName = 'benta-sync-claims-emulator';
const adminApp = admin.apps.find((a) => a?.name === appName) || admin.initializeApp({ projectId: PROJECT_ID }, appName);
const db = adminApp.firestore();

function isEmulatorRunning(hostStr: string): Promise<boolean> {
  return new Promise((resolve) => {
    const [host, portStr] = hostStr.split(':');
    const port = parseInt(portStr || '8080', 10);
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host || '127.0.0.1');
  });
}

test('Secure Benta Cashier Offline Claims Reconciliation Live Emulator Suite', async (t) => {
  await t.test('1. Production Project Refusal & Isolation Check', () => {
    assert.ok(PROJECT_ID.startsWith('demo-'), 'Project must be a demo isolated project');
    assert.ok(EMULATOR_HOST.startsWith('127.0.0.1') || EMULATOR_HOST.startsWith('localhost'), 'Host must be local loopback');
  });

  const emulatorActive = await isEmulatorRunning(EMULATOR_HOST);
  assert.ok(emulatorActive, `Firestore emulator must be active at ${EMULATOR_HOST}. Fail-closed emulator requirement.`);

  const runId = Date.now();
  const tenantId = `tenant_off_${runId}`;
  const ownerUid = `owner_${runId}`;
  const cashierUid = `cashier_${runId}`;
  const staffAccountId = `staff_${runId}`;
  const shiftId = `shift_${runId}`;
  const grantId = `grant_${runId}`;

  const signer = new OfflineGrantSigner({
    keys: { v1: 'test_secret_key_for_offline_emulator_12345' }
  });

  const snapshotService = new CatalogSnapshotService({ db });

  // Seed Tenant, Staff, Shift, Master Cash, Products
  await t.test('2. Seed Isolated Production Fixtures in Live Emulator', async () => {
    const tenantRef = db.collection('tenants').doc(tenantId);

    // Tenant
    await tenantRef.set({
      id: tenantId,
      ownerUid,
      businessCode: `BIZ${runId.toString().slice(-4)}`,
      moduleType: 'benta-snap',
      subscriptionStatus: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Staff
    await tenantRef.collection('staff_accounts').doc(staffAccountId).set({
      id: staffAccountId,
      tenantId,
      authUid: cashierUid,
      displayName: 'Test Cashier',
      role: 'cashier',
      status: 'active',
      sessionVersion: 1,
      activeShiftId: shiftId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Shift (Full Production Schema)
    await tenantRef.collection('shifts').doc(shiftId).set({
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

    // Master Cash Register Account
    await tenantRef.collection('accounts').doc('master-cash').set({
      id: 'master-cash',
      tenantId,
      name: 'Main Cash Register',
      type: 'asset',
      balance: 100000,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Products
    await tenantRef.collection('products').doc('prod_rice').set({
      id: 'prod_rice',
      tenantId,
      name: 'Sinandomeng Rice 1kg',
      salePrice: 5500,
      costPrice: 4200,
      currentStock: 20,
      isActive: true
    });

    await tenantRef.collection('products').doc('prod_oil').set({
      id: 'prod_oil',
      tenantId,
      name: 'Cooking Oil 500ml',
      salePrice: 4000,
      costPrice: 2800,
      currentStock: 10,
      isActive: true
    });
  });

  // Create Snapshot & Signed Grant in Emulator
  let snapshot: any;
  let signedGrant: any;

  await t.test('3. Create Snapshot & Authoritative Server Grant Document in Emulator', async () => {
    const products = [
      { id: 'prod_rice', name: 'Sinandomeng Rice 1kg', salePrice: 5500, costPrice: 4200, unit: 'kg' },
      { id: 'prod_oil', name: 'Cooking Oil 500ml', salePrice: 4000, costPrice: 2800, unit: 'btl' }
    ];

    snapshot = await snapshotService.getOrCreateSnapshot(tenantId, products);
    assert.equal(snapshot.productCount, 2);

    const grantPayload: OfflineAuthGrantPayload = {
      grantId,
      tenantId,
      staffAccountId,
      authUid: cashierUid,
      sessionVersion: 1,
      shiftId,
      installationId: `inst_${runId}`,
      snapshotId: snapshot.snapshotId,
      catalogDigest: snapshot.catalogDigest,
      issuedAt: Math.floor(Date.now() / 1000),
      freshnessExpiresAt: Math.floor(Date.now() / 1000) + 86400,
      allowedTenders: ['cash']
    };

    signedGrant = signer.signGrant(grantPayload, 'v1');

    // Persist Authoritative Grant in Emulator
    await db.collection('tenants').doc(tenantId).collection('offline_grants').doc(grantId).set({
      grantId,
      tenantId,
      staffAccountId,
      authUid: cashierUid,
      sessionVersion: 1,
      shiftId,
      snapshotId: snapshot.snapshotId,
      catalogDigest: snapshot.catalogDigest,
      installationId: `inst_${runId}`,
      allowedTenders: ['cash'],
      status: 'active',
      issuedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  const mockAuth: any = {
    verifyIdToken: async () => ({
      uid: cashierUid,
      role: 'cashier',
      tenantId,
      staffAccountId,
      sessionVersion: 1
    })
  };

  const handlerOptions = {
    adminAuth: mockAuth,
    adminFirestore: db,
    grantSigner: signer,
    snapshotService,
    env: { BENTA_CASHIER_CHECKOUT_ENABLED: 'true', BENTA_CASHIER_OFFLINE_ENABLED: 'true' }
  };

  // Test 4: Full Atomic Accepted Transaction in Emulator
  let acceptedSaleId: string = '';
  await t.test('4. Atomic Accepted Transaction Execution with Full Financial Invariants in Emulator', async () => {
    const syncRequest: OfflineClaimSyncRequest = {
      grant: signedGrant,
      claims: [
        {
          entryId: `entry_1_${runId}`,
          seqIndex: 1,
          idempotencyKey: `idem_1_${runId}`,
          clientTimestamp: new Date().toISOString(),
          items: [
            { productId: 'prod_rice', quantity: 2, unitPriceCentavos: 5500 },
            { productId: 'prod_oil', quantity: 1, unitPriceCentavos: 4000 }
          ],
          paymentMethod: 'cash',
          cashTenderedCentavos: 15000,
          totalCentavos: 15000
        }
      ]
    };

    const response = await handleBentaSyncClaims('valid-token', syncRequest, handlerOptions);
    assert.equal(response.status, 200);
    const body = response.body as any;
    assert.equal(body.syncedCount, 1);
    assert.equal(body.results[0].status, 'accepted');
    acceptedSaleId = body.results[0].saleId;

    // Verify all 8 writes in Emulator
    const tenantRef = db.collection('tenants').doc(tenantId);

    // 1. Sale
    const saleSnap = await tenantRef.collection('sales').doc(acceptedSaleId).get();
    assert.ok(saleSnap.exists, 'Sale document must exist in emulator');
    const saleData = saleSnap.data()!;
    assert.equal(saleData.subtotalAmount, 15000);
    assert.equal(saleData.items[0].costPrice, 4200); // Historical cost preserved!

    // 2. Product stock decremented
    const riceSnap = await tenantRef.collection('products').doc('prod_rice').get();
    assert.equal(riceSnap.data()!.currentStock, 18); // 20 - 2

    const oilSnap = await tenantRef.collection('products').doc('prod_oil').get();
    assert.equal(oilSnap.data()!.currentStock, 9); // 10 - 1

    // 3. Inventory movements
    const movementsSnap = await tenantRef.collection('inventory_transactions').where('saleId', '==', acceptedSaleId).get();
    assert.equal(movementsSnap.docs.length, 2);

    // 4. Master Cash Register balance
    const cashSnap = await tenantRef.collection('accounts').doc('master-cash').get();
    assert.equal(cashSnap.data()!.balance, 115000); // 100000 + 15000

    // 5. Shift aggregates
    const shiftSnap = await tenantRef.collection('shifts').doc(shiftId).get();
    assert.equal(shiftSnap.data()!.cashSales, 15000);
    assert.equal(shiftSnap.data()!.saleCount, 1);

    // 6. Tenant Audit Log
    const auditSnap = await tenantRef.collection('audit_log').where('saleId', '==', acceptedSaleId).get();
    assert.equal(auditSnap.docs.length, 1);
    assert.equal(auditSnap.docs[0].data().action, 'accepted');

    // 7. Durable Offline Claim Document
    const claimSnap = await tenantRef.collection('offline_claims').where('saleId', '==', acceptedSaleId).get();
    assert.equal(claimSnap.docs.length, 1);
    assert.equal(claimSnap.docs[0].data().status, 'accepted');

    // 8. Idempotency Document
    const idemSnap = await tenantRef.collection('cashier_checkout_idempotency').where('saleId', '==', acceptedSaleId).get();
    assert.equal(idemSnap.docs.length, 1);
    assert.equal(idemSnap.docs[0].data().status, 'complete');
  });

  // Test 5: Replay Same-Key/Same-Payload in Emulator
  await t.test('5. Replay Same-Key/Same-Payload Returns Cached Receipt Without Re-decrementing Stock', async () => {
    const syncRequest: OfflineClaimSyncRequest = {
      grant: signedGrant,
      claims: [
        {
          entryId: `entry_1_${runId}`,
          seqIndex: 1,
          idempotencyKey: `idem_1_${runId}`,
          clientTimestamp: new Date().toISOString(),
          items: [
            { productId: 'prod_rice', quantity: 2, unitPriceCentavos: 5500 },
            { productId: 'prod_oil', quantity: 1, unitPriceCentavos: 4000 }
          ],
          paymentMethod: 'cash',
          cashTenderedCentavos: 15000,
          totalCentavos: 15000
        }
      ]
    };

    const response = await handleBentaSyncClaims('valid-token', syncRequest, handlerOptions);
    const body = response.body as any;
    assert.equal(body.results[0].saleId, acceptedSaleId);

    // Stock remained 18 and 9 (NOT double decremented!)
    const tenantRef = db.collection('tenants').doc(tenantId);
    const riceSnap = await tenantRef.collection('products').doc('prod_rice').get();
    assert.equal(riceSnap.data()!.currentStock, 18);
  });

  // Test 6: Terminal Outcome Protection / Retry After Revocation
  await t.test('6. Terminal Outcome Protection: Retrying Completed Claim After Grant Revocation Retains Accepted Status', async () => {
    // Revoke the authoritative grant in emulator
    await db.collection('tenants').doc(tenantId).collection('offline_grants').doc(grantId).update({
      status: 'revoked'
    });

    const syncRequest: OfflineClaimSyncRequest = {
      grant: signedGrant,
      claims: [
        {
          entryId: `entry_1_${runId}`,
          seqIndex: 1,
          idempotencyKey: `idem_1_${runId}`,
          clientTimestamp: new Date().toISOString(),
          items: [
            { productId: 'prod_rice', quantity: 2, unitPriceCentavos: 5500 },
            { productId: 'prod_oil', quantity: 1, unitPriceCentavos: 4000 }
          ],
          paymentMethod: 'cash',
          cashTenderedCentavos: 15000,
          totalCentavos: 15000
        }
      ]
    };

    const response = await handleBentaSyncClaims('valid-token', syncRequest, handlerOptions);
    const body = response.body as any;
    assert.equal(body.results[0].status, 'accepted');
    assert.equal(body.results[0].saleId, acceptedSaleId);
  });

  // Test 7: Deterministic Transaction Failure Proves Zero Partial Financial Writes
  await t.test('7. Injected Firestore Transaction Failure Leaves Zero Partial Financial Writes', async () => {
    // 1. Restore Authoritative Grant status to active before the test
    await db.collection('tenants').doc(tenantId).collection('offline_grants').doc(grantId).update({
      status: 'active'
    });

    const tenantRef = db.collection('tenants').doc(tenantId);
    const preRiceStock = (await tenantRef.collection('products').doc('prod_rice').get()).data()!.currentStock;
    const preCashBalance = (await tenantRef.collection('accounts').doc('master-cash').get()).data()!.balance;
    const preSalesCount = (await tenantRef.collection('sales').get()).docs.length;
    const preMovementsCount = (await tenantRef.collection('inventory_transactions').get()).docs.length;
    const preLedgerCount = (await tenantRef.collection('transactions').get()).docs.length;
    const preAuditCount = (await tenantRef.collection('audit_log').get()).docs.length;
    const preShiftData = (await tenantRef.collection('shifts').doc(shiftId).get()).data()!;

    const rollbackKey = `idem_rollback_${runId}`;

    // Create a custom db wrapper that throws an error after writes have been staged inside runTransaction
    const failingDb: any = {
      ...db,
      collection: (coll: string) => db.collection(coll),
      runTransaction: async (updateFn: any) => {
        return db.runTransaction(async (transaction) => {
          await updateFn(transaction);
          // Deterministically abort the transaction after all mutations were staged
          throw new Error('INJECTED_ABORT_TRANSACTION_FAILURE');
        });
      }
    };

    const failingOptions = {
      ...handlerOptions,
      adminFirestore: failingDb
    };

    const rollbackRequest: OfflineClaimSyncRequest = {
      grant: signedGrant,
      claims: [
        {
          entryId: `entry_rollback_${runId}`,
          seqIndex: 10,
          idempotencyKey: rollbackKey,
          clientTimestamp: new Date().toISOString(),
          items: [{ productId: 'prod_rice', quantity: 2, unitPriceCentavos: 5500 }],
          paymentMethod: 'cash',
          cashTenderedCentavos: 11000,
          totalCentavos: 11000
        }
      ]
    };

    const response = await handleBentaSyncClaims('valid-token', rollbackRequest, failingOptions);
    const body = response.body as any;
    assert.equal(body.results[0].status, 'retryable');
    assert.ok(body.results[0].error.includes('Database contention'));

    // Assert NO writes were committed in Firestore
    const postRiceStock = (await tenantRef.collection('products').doc('prod_rice').get()).data()!.currentStock;
    const postCashBalance = (await tenantRef.collection('accounts').doc('master-cash').get()).data()!.balance;
    const postSalesCount = (await tenantRef.collection('sales').get()).docs.length;
    const postMovementsCount = (await tenantRef.collection('inventory_transactions').get()).docs.length;
    const postLedgerCount = (await tenantRef.collection('transactions').get()).docs.length;
    const postAuditCount = (await tenantRef.collection('audit_log').get()).docs.length;
    const postShiftData = (await tenantRef.collection('shifts').doc(shiftId).get()).data()!;

    assert.equal(postRiceStock, preRiceStock, 'Stock must not change on aborted transaction');
    assert.equal(postCashBalance, preCashBalance, 'Cash balance must not change on aborted transaction');
    assert.equal(postSalesCount, preSalesCount, 'Zero sales must be committed');
    assert.equal(postMovementsCount, preMovementsCount, 'Zero movements must be committed');
    assert.equal(postLedgerCount, preLedgerCount, 'Zero ledger rows must be committed');
    assert.equal(postAuditCount, preAuditCount, 'Zero audit logs committed from aborted transaction');
    assert.equal(postShiftData.cashSales, preShiftData.cashSales, 'Shift cash sales must remain unchanged');
    assert.equal(postShiftData.saleCount, preShiftData.saleCount, 'Shift sale count must remain unchanged');
  });
});
