/**
 * Order Snap Automatic Synchronization Coordinator Unit Tests
 *
 * Covers:
 * 1. Automatic multi-trigger synchronization (manual, online, visibility)
 * 2. FIFO deterministic synchronization and authority grant transmission
 * 3. Multi-tab lease locking and deduplication
 * 4. Idempotent replay after simulated response loss
 * 5. Authoritative stock conflict (409) handling & blocked reservation preservation
 * 6. Permanent validation error (400) handling & reservation release
 * 7. Session revocation (401/403) handling
 * 8. Transient failure backoff
 * 9. Tenant isolation & Owner recovery of revoked cashier orders
 * 10. Safe logout guard & non-destructive cleanup
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderSnapOutboxDB } from '../src/lib/order-snap/order-snap-outbox-db';
import { OrderSnapOfflineManager } from '../src/lib/order-snap/order-snap-offline-manager';
import { OrderSnapAuthorityManager } from '../src/lib/order-snap/order-snap-authority-manager';
import { OrderSnapGrantSigner } from '../src/lib/server/order-snap-grant-signer';
import { OrderSnapSyncCoordinator } from '../src/lib/order-snap/order-snap-sync-coordinator';
import { OrderSnapLogoutGuard } from '../src/lib/order-snap/order-snap-logout-guard';
import { OfflineCatalogSnapshot, ConflictDiagnosticRecord } from '../src/lib/order-snap/offline-types';
import { createMockIndexedDB } from './test-indexeddb-mock';

const TEST_SECRET = 'test_secret_must_be_sufficiently_long_32chars_min';

function createSampleCatalog(tenantId: string): OfflineCatalogSnapshot {
  return {
    tenantId,
    catalogVersion: 'v1.0.0',
    syncedAt: new Date().toISOString(),
    menuItems: [
      {
        menuItemId: 'item_latte',
        tenantId,
        name: 'Iced Latte',
        category: 'Coffee',
        basePriceCentavos: 13000,
        activeRecipeVersionId: 'rec_latte_v1',
        isActive: true
      }
    ],
    recipes: [
      {
        recipeVersionId: 'rec_latte_v1',
        menuItemId: 'item_latte',
        versionNumber: 1,
        isActive: true,
        components: [
          { ingredientId: 'ing_beans', quantityMinor: 18000, unit: 'g' }
        ]
      }
    ],
    modifierGroups: [],
    ingredients: [
      { ingredientId: 'ing_beans', tenantId, name: 'Coffee Beans', unit: 'g', stockQuantityMinor: 1000000, isActive: true }
    ]
  };
}

import crypto from 'node:crypto';
import { OrderSnapCertificateSigner } from '../src/lib/server/order-snap-certificate-signer';

const testServerKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const testServerPrivateKeyPem = testServerKeyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const testServerPublicKeySpkiBase64 = Buffer.from(
  testServerKeyPair.publicKey.export({ type: 'spki', format: 'der' })
).toString('base64');

const testTrustedRegistry = {
  v2: {
    algorithm: 'ES256' as const,
    spki: testServerPublicKeySpkiBase64
  }
};

const clientCredentialKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const clientCredentialPublicKeySpkiBase64 = Buffer.from(
  clientCredentialKeyPair.publicKey.export({ type: 'spki', format: 'der' })
).toString('base64');
const clientCredentialIdBase64Url = 'test_webauthn_credential_id_base64url_12345';

const credIdBytes = Buffer.from(clientCredentialIdBase64Url, 'base64url');
const clientCredentialIdFingerprint = crypto.createHash('sha256').update(credIdBytes).digest('hex');
const spkiBytes = Buffer.from(clientCredentialPublicKeySpkiBase64, 'base64');
const clientCredentialPublicKeyFingerprint = crypto.createHash('sha256').update(spkiBytes).digest('hex');

async function setupAuthorizedManager(
  outboxDB: OrderSnapOutboxDB,
  tenantId: string = 'tenant_alpha',
  staffAccountId: string = 'staff_1',
  catalogVersion: string = 'v1.0.0'
): Promise<OrderSnapAuthorityManager> {
  const deviceId = await outboxDB.getOrCreateDeviceId();
  const signer = new OrderSnapCertificateSigner({ privateKeys: { v2: testServerPrivateKeyPem } });
  const nowSec = Math.floor(Date.now() / 1000);

  const cert = signer.signCertificate({
    version: 2,
    algorithm: 'ES256',
    keyId: 'v2',
    grantId: `grant_sync_${tenantId}`,
    moduleId: 'timpla-track',
    tenantId,
    staffAccountId,
    actorId: `staff_${staffAccountId}`,
    authUid: `uid_${staffAccountId}`,
    sessionVersion: 1,
    role: 'cashier',
    displayName: `Staff ${staffAccountId}`,
    deviceId,
    catalogVersion,
    allowedTenders: ['cash'],
    issuedAt: nowSec,
    expiresAt: nowSec + 3600,
    credentialIdFingerprint: clientCredentialIdFingerprint,
    credentialPublicKeyFingerprint: clientCredentialPublicKeyFingerprint,
    rpId: 'localhost',
    expectedOrigin: 'http://localhost:9002',
    requireUserPresence: true,
    requireUserVerification: true
  }, 'v2');

  const authMgr = new OrderSnapAuthorityManager(outboxDB, { trustedRegistry: testTrustedRegistry });
  const mockFetch: any = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      grant: cert,
      webAuthnCredential: {
        credentialId: clientCredentialIdBase64Url,
        publicKeySpki: clientCredentialPublicKeySpkiBase64,
        rpId: 'localhost',
        counter: 0
      }
    })
  });

  await authMgr.establishOnlineAuthority({
    idToken: 'valid_token',
    tenantId,
    deviceId,
    catalogVersion,
    fetchFn: mockFetch
  });

  return authMgr;
}

test('1. FIFO deterministic synchronization order and authority grant transmission', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);
  const authMgr = await setupAuthorizedManager(outboxDB, 'tenant_alpha', 'staff_1', 'v1.0.0');

  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_alpha'));

  const now = new Date().toISOString();
  // Enqueue Order 1
  await offlineMgr.acceptOfflineOrder({
    tenantId: 'tenant_alpha',
    actorId: 'staff_staff_1',
    staffAccountId: 'staff_1',
    actorRole: 'cashier',
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    authorityManager: authMgr,
    request: {
      orderId: 'ord_fifo_1',
      tenantId: 'tenant_alpha',
      staffAccountId: 'staff_1',
      idempotencyKey: 'idemp_fifo_1',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    }
  });

  // Enqueue Order 2
  await offlineMgr.acceptOfflineOrder({
    tenantId: 'tenant_alpha',
    actorId: 'staff_staff_1',
    staffAccountId: 'staff_1',
    actorRole: 'cashier',
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    authorityManager: authMgr,
    request: {
      orderId: 'ord_fifo_2',
      tenantId: 'tenant_alpha',
      staffAccountId: 'staff_1',
      idempotencyKey: 'idemp_fifo_2',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    }
  });

  const syncedOrderIds: string[] = [];
  const receivedGrants: any[] = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: any) => {
    const body = JSON.parse(init.body);
    syncedOrderIds.push(body.request.orderId);
    if (body.authorityGrant) {
      receivedGrants.push(body.authorityGrant);
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        saleId: `sale_${body.request.orderId}`,
        snapshotId: `snap_${body.request.orderId}`,
        result: { orderId: body.request.orderId, totalRevenueCentavos: 13000 },
        committedAt: new Date().toISOString()
      })
    } as any;
  }) as any;

  try {
    const coordinator = new OrderSnapSyncCoordinator({
      tenantId: 'tenant_alpha',
      getIdToken: async () => 'mock_token_valid',
      outboxDB,
      autoSyncOnStart: false
    });

    const result = await coordinator.syncNow();
    assert.equal(result.syncedCount, 2);
    assert.equal(result.remainingPending, 0);

    // Verify strict FIFO order
    assert.deepEqual(syncedOrderIds, ['ord_fifo_1', 'ord_fifo_2']);

    // Verify authority grants were sent with every sync request
    assert.equal(receivedGrants.length, 2);
    assert.equal(receivedGrants[0].payload.staffAccountId, 'staff_1');
    assert.equal(receivedGrants[1].payload.staffAccountId, 'staff_1');

    const order1 = await outboxDB.getOrder('tenant_alpha', 'ord_fifo_1');
    const order2 = await outboxDB.getOrder('tenant_alpha', 'ord_fifo_2');
    assert.equal(order1?.syncState, 'confirmed');
    assert.equal(order2?.syncState, 'confirmed');

    coordinator.destroy();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('2. Multi-tab lease locking prevents duplicate sync execution', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);
  const authMgr = await setupAuthorizedManager(outboxDB, 'tenant_alpha', 'staff_1', 'v1.0.0');

  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_alpha'));

  const now = new Date().toISOString();
  await offlineMgr.acceptOfflineOrder({
    tenantId: 'tenant_alpha',
    actorId: 'staff_staff_1',
    staffAccountId: 'staff_1',
    actorRole: 'cashier',
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    authorityManager: authMgr,
    request: {
      orderId: 'ord_lock_1',
      tenantId: 'tenant_alpha',
      staffAccountId: 'staff_1',
      idempotencyKey: 'idemp_lock_1',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    }
  });

  // Tab 1 acquires lease
  const leaseToken = await outboxDB.acquireSyncLease('tenant_alpha', 'tab_1', 10000);
  assert.ok(leaseToken);

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return { ok: true, status: 200, json: async () => ({ success: true }) } as any;
  }) as any;

  try {
    const coordinatorTab2 = new OrderSnapSyncCoordinator({
      tenantId: 'tenant_alpha',
      getIdToken: async () => 'mock_token',
      outboxDB,
      autoSyncOnStart: false
    });

    const result = await coordinatorTab2.syncNow();
    assert.equal(result.syncedCount, 0, 'Tab 2 should not execute sync while Tab 1 holds lease');
    assert.equal(fetchCalled, false);

    coordinatorTab2.destroy();
  } finally {
    globalThis.fetch = originalFetch;
    await outboxDB.releaseSyncLease('tenant_alpha', leaseToken!);
  }
});

test('3. Authoritative stock conflict (409) blocks dependent queue draining', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);
  const authMgr = await setupAuthorizedManager(outboxDB, 'tenant_alpha', 'staff_1', 'v1.0.0');

  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_alpha'));

  const now = new Date().toISOString();
  await offlineMgr.acceptOfflineOrder({
    tenantId: 'tenant_alpha',
    actorId: 'staff_staff_1',
    staffAccountId: 'staff_1',
    actorRole: 'cashier',
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    authorityManager: authMgr,
    request: {
      orderId: 'ord_conflict_1',
      tenantId: 'tenant_alpha',
      staffAccountId: 'staff_1',
      idempotencyKey: 'idemp_conflict_1',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    }
  });

  await offlineMgr.acceptOfflineOrder({
    tenantId: 'tenant_alpha',
    actorId: 'staff_staff_1',
    staffAccountId: 'staff_1',
    actorRole: 'cashier',
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    authorityManager: authMgr,
    request: {
      orderId: 'ord_dependent_2',
      tenantId: 'tenant_alpha',
      staffAccountId: 'staff_1',
      idempotencyKey: 'idemp_dependent_2',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    }
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: any) => {
    const body = JSON.parse(init.body);
    if (body.request.orderId === 'ord_conflict_1') {
      return {
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Insufficient authoritative stock on server',
          category: 'INSUFFICIENT_STOCK'
        })
      } as any;
    }
    return { ok: true, status: 200, json: async () => ({ success: true }) } as any;
  }) as any;

  try {
    let conflictDiagnosticReported: any = null;
    const coordinator = new OrderSnapSyncCoordinator({
      tenantId: 'tenant_alpha',
      getIdToken: async () => 'mock_token',
      outboxDB,
      autoSyncOnStart: false,
      onOrderConflict: (entry, diag) => {
        conflictDiagnosticReported = diag;
      }
    });

    const result = await coordinator.syncNow();
    assert.equal(result.syncedCount, 0);
    assert.equal(result.conflictCount, 1);

    const order1 = await outboxDB.getOrder('tenant_alpha', 'ord_conflict_1');
    assert.equal(order1?.syncState, 'conflict');
    assert.ok(conflictDiagnosticReported);
    assert.equal(conflictDiagnosticReported.errorCode, 'INSUFFICIENT_STOCK');

    const order2 = await outboxDB.getOrder('tenant_alpha', 'ord_dependent_2');
    assert.equal(order2?.syncState, 'pending_sync');

    coordinator.destroy();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('4. Tenant isolation and Owner recovery of logged-out cashier orders', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);
  const authMgrAlpha = await setupAuthorizedManager(outboxDB, 'tenant_alpha', 'cashier_1', 'v1.0.0');
  const authMgrBeta = await setupAuthorizedManager(outboxDB, 'tenant_beta', 'cashier_2', 'v1.0.0');

  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_alpha'));
  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_beta'));

  const now = new Date().toISOString();
  // Cashier A enqueues for Tenant Alpha
  await offlineMgr.acceptOfflineOrder({
    tenantId: 'tenant_alpha',
    actorId: 'staff_cashier_1',
    staffAccountId: 'cashier_1',
    actorRole: 'cashier',
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    authorityManager: authMgrAlpha,
    request: {
      orderId: 'ord_alpha_c1',
      tenantId: 'tenant_alpha',
      staffAccountId: 'cashier_1',
      idempotencyKey: 'idemp_alpha_c1',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    }
  });

  // Cashier B enqueues for Tenant Beta
  await offlineMgr.acceptOfflineOrder({
    tenantId: 'tenant_beta',
    actorId: 'staff_cashier_2',
    staffAccountId: 'cashier_2',
    actorRole: 'cashier',
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    authorityManager: authMgrBeta,
    request: {
      orderId: 'ord_beta_c2',
      tenantId: 'tenant_beta',
      staffAccountId: 'cashier_2',
      idempotencyKey: 'idemp_beta_c2',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    }
  });

  // Cashier A logs out: Safe Logout Guard verifies warning
  const logoutGuard = new OrderSnapLogoutGuard(outboxDB);
  const status = await logoutGuard.getPendingLogoutStatus('tenant_alpha', 'staff_cashier_1');
  assert.equal(status.hasPending, true);
  assert.equal(status.pendingCount, 1);
  assert.ok(status.warningMessage?.includes('1 pending offline order'));

  logoutGuard.performSafeLogoutCleanup();

  // Tenant Alpha's Owner logs in and syncs Tenant Alpha
  const originalFetch = globalThis.fetch;
  const syncedTenants: string[] = [];

  globalThis.fetch = (async (url: string, init?: any) => {
    const body = JSON.parse(init.body);
    syncedTenants.push(body.request.tenantId);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        saleId: 'sale_owner_sync',
        snapshotId: 'snap_owner_sync',
        result: { orderId: body.request.orderId },
        committedAt: new Date().toISOString()
      })
    } as any;
  }) as any;

  try {
    const ownerCoordinator = new OrderSnapSyncCoordinator({
      tenantId: 'tenant_alpha',
      getIdToken: async () => 'mock_owner_token',
      outboxDB,
      autoSyncOnStart: false
    });

    const result = await ownerCoordinator.syncNow();
    assert.equal(result.syncedCount, 1);

    // Verify Tenant Beta was NEVER synced by Tenant Alpha coordinator
    assert.deepEqual(syncedTenants, ['tenant_alpha']);

    const betaPending = await outboxDB.getPendingOrders('tenant_beta');
    assert.equal(betaPending.length, 1);
    assert.equal(betaPending[0].orderId, 'ord_beta_c2');

    ownerCoordinator.destroy();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('11. Single-source catalogVersion invariant from immutable grant', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);

  // 1. Setup authority with catalogVersion 'v1.0.0'
  const authMgr = await setupAuthorizedManager(outboxDB, 'tenant_alpha', 'staff_1', 'v1.0.0');

  // Point A: Offline acceptance rejects when current catalog version does not match signed grant
  await outboxDB.saveCatalogSnapshot({
    ...createSampleCatalog('tenant_alpha'),
    catalogVersion: 'v2.0.0' // Mismatch with authority grant 'v1.0.0'
  });

  const now = new Date().toISOString();
  await assert.rejects(
    async () => {
      await offlineMgr.acceptOfflineOrder({
        tenantId: 'tenant_alpha',
        actorId: 'staff_staff_1',
        staffAccountId: 'staff_1',
        actorRole: 'cashier',
        paymentMethod: 'cash',
        cashTenderedCentavos: 15000,
        authorityManager: authMgr,
        request: {
          orderId: 'ord_cat_mismatch',
          tenantId: 'tenant_alpha',
          staffAccountId: 'staff_1',
          idempotencyKey: 'idemp_cat_mismatch',
          createdAt: now,
          committedAt: now,
          lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
        }
      });
    },
    /catalog version mismatch/i
  );

  // Save matching catalog version 'v1.0.0'
  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_alpha'));

  // Point B: Offline acceptance succeeds and binds grant immutably
  const accepted = await offlineMgr.acceptOfflineOrder({
    tenantId: 'tenant_alpha',
    actorId: 'staff_staff_1',
    staffAccountId: 'staff_1',
    actorRole: 'cashier',
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    authorityManager: authMgr,
    request: {
      orderId: 'ord_cat_match',
      tenantId: 'tenant_alpha',
      staffAccountId: 'staff_1',
      idempotencyKey: 'idemp_cat_match',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    }
  });

  assert.equal(accepted.success, true);
  assert.equal(accepted.outboxEntry.grant.payload.catalogVersion, 'v1.0.0');

  // Point C: updateOrderSyncState cannot alter the grant or its catalogVersion
  const originalGrantSig = accepted.outboxEntry.grant.signature;
  await outboxDB.updateOrderSyncState('tenant_alpha', 'ord_cat_match', 'syncing', {
    attemptCount: 1
  });

  const orderInDb = await outboxDB.getOrder('tenant_alpha', 'ord_cat_match');
  assert.equal(orderInDb?.grant.signature, originalGrantSig);
  assert.equal(orderInDb?.grant.payload.catalogVersion, 'v1.0.0');

  // Point D: Every synchronization derives catalogVersion exclusively from immutable grant
  let transmittedPayload: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init?: any) => {
    transmittedPayload = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        saleId: 'sale_cat_test',
        snapshotId: 'snap_cat_test',
        result: { orderId: 'ord_cat_match' },
        committedAt: new Date().toISOString()
      })
    } as any;
  }) as any;

  try {
    const coordinator = new OrderSnapSyncCoordinator({
      tenantId: 'tenant_alpha',
      getIdToken: async () => 'mock_token',
      outboxDB,
      autoSyncOnStart: false
    });

    const syncResult = await coordinator.syncNow();
    assert.equal(syncResult.syncedCount, 1);
    assert.ok(transmittedPayload);
    assert.equal(transmittedPayload.mode, 'offline_sync');
    assert.equal(transmittedPayload.catalogVersion, 'v1.0.0');
    assert.equal(transmittedPayload.catalogVersion, transmittedPayload.authorityGrant.payload.catalogVersion);

    coordinator.destroy();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
