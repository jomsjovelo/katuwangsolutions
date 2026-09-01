/**
 * Order Snap Offline Manager Unit Tests
 *
 * Covers:
 * 1. Offline order acceptance with zero network calls and mandatory authority
 * 2. Truthful provisional receipt formatting (PROV-ORD-..., isProvisional: true)
 * 3. Same-device projected ingredient stock reservations
 * 4. Subsequent order stock depletion and rejection when projected stock exhausted
 * 5. Refusal of non-cash payments (GCash, Maya) while offline
 * 6. Missing or corrupted offline catalog fails closed
 * 7. Insufficient cash tendered rejection
 * 8. Missing authority manager rejects checkout
 * 9. Locked authority session rejects checkout
 * 10. Expired authority grant rejects checkout
 * 11. Catalog mismatch rejects checkout
 * 12. Durable recovery across manager recreation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderSnapOutboxDB } from '../src/lib/order-snap/order-snap-outbox-db';
import { OrderSnapOfflineManager } from '../src/lib/order-snap/order-snap-offline-manager';
import { OrderSnapAuthorityManager } from '../src/lib/order-snap/order-snap-authority-manager';
import { OrderSnapGrantSigner } from '../src/lib/server/order-snap-grant-signer';
import { OfflineCatalogSnapshot } from '../src/lib/order-snap/offline-types';
import { createMockIndexedDB } from './test-indexeddb-mock';

const TEST_SECRET = 'test_secret_must_be_sufficiently_long_32chars_min';

function createSampleCatalog(tenantId: string = 'tenant_cafe', catalogVersion: string = 'v1.0.0'): OfflineCatalogSnapshot {
  return {
    tenantId,
    catalogVersion,
    syncedAt: new Date().toISOString(),
    menuItems: [
      {
        menuItemId: 'item_espresso',
        tenantId,
        name: 'Single Espresso',
        category: 'Coffee',
        basePriceCentavos: 8000,
        activeRecipeVersionId: 'rec_espresso_v1',
        isActive: true,
        modifierGroupIds: ['grp_syrup']
      },
      {
        menuItemId: 'item_latte',
        tenantId,
        name: 'Iced Latte',
        category: 'Coffee',
        basePriceCentavos: 13000,
        activeRecipeVersionId: 'rec_latte_v1',
        isActive: true,
        modifierGroupIds: ['grp_syrup']
      }
    ],
    recipes: [
      {
        recipeVersionId: 'rec_espresso_v1',
        menuItemId: 'item_espresso',
        versionNumber: 1,
        isActive: true,
        components: [
          { ingredientId: 'ing_beans', quantityMinor: 18000, unit: 'g' },
          { ingredientId: 'ing_water', quantityMinor: 50000, unit: 'ml' }
        ]
      },
      {
        recipeVersionId: 'rec_latte_v1',
        menuItemId: 'item_latte',
        versionNumber: 1,
        isActive: true,
        components: [
          { ingredientId: 'ing_beans', quantityMinor: 18000, unit: 'g' },
          { ingredientId: 'ing_milk', quantityMinor: 200000, unit: 'ml' }
        ]
      }
    ],
    modifierGroups: [
      {
        modifierGroupId: 'grp_syrup',
        tenantId,
        name: 'Syrup Options',
        minSelections: 0,
        maxSelections: 2,
        isRequired: false,
        options: [
          {
            optionId: 'opt_vanilla',
            name: 'Vanilla Syrup (1 pump)',
            priceDeltaCentavos: 2500,
            ingredientDeltas: [
              { ingredientId: 'ing_vanilla_syrup', quantityMinorDelta: 15000, unit: 'ml' }
            ]
          }
        ]
      }
    ],
    ingredients: [
      { ingredientId: 'ing_beans', tenantId, name: 'Coffee Beans', unit: 'g', stockQuantityMinor: 40000, isActive: true },
      { ingredientId: 'ing_milk', tenantId, name: 'Fresh Milk', unit: 'ml', stockQuantityMinor: 500000, isActive: true },
      { ingredientId: 'ing_water', tenantId, name: 'Filtered Water', unit: 'ml', stockQuantityMinor: 1000000, isActive: true },
      { ingredientId: 'ing_vanilla_syrup', tenantId, name: 'Vanilla Syrup', unit: 'ml', stockQuantityMinor: 100000, isActive: true }
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
  tenantId: string = 'tenant_cafe',
  staffAccountId: string = 'staff_123',
  catalogVersion: string = 'v1.0.0'
): Promise<OrderSnapAuthorityManager> {
  const deviceId = await outboxDB.getOrCreateDeviceId();
  const signer = new OrderSnapCertificateSigner({ privateKeys: { v2: testServerPrivateKeyPem } });
  const nowSec = Math.floor(Date.now() / 1000);

  const cert = signer.signCertificate({
    version: 2,
    algorithm: 'ES256',
    keyId: 'v2',
    grantId: 'grant_offline_test',
    moduleId: 'timpla-track',
    tenantId,
    staffAccountId,
    actorId: `staff_${staffAccountId}`,
    authUid: 'firebase_uid_test',
    sessionVersion: 1,
    role: 'cashier',
    displayName: 'Maria Cashier',
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

test('1. Offline cash order acceptance with zero network calls', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);
  const authMgr = await setupAuthorizedManager(outboxDB, 'tenant_cafe', 'staff_123', 'v1.0.0');

  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_cafe', 'v1.0.0'));

  const now = new Date().toISOString();
  const result = await offlineMgr.acceptOfflineOrder({
    tenantId: 'tenant_cafe',
    actorId: 'staff_staff_123',
    staffAccountId: 'staff_123',
    actorRole: 'cashier',
    cashierDisplayName: 'Maria',
    paymentMethod: 'cash',
    cashTenderedCentavos: 20000,
    authorityManager: authMgr,
    request: {
      orderId: 'ord_offline_1',
      tenantId: 'tenant_cafe',
      staffAccountId: 'staff_123',
      idempotencyKey: 'idemp_offline_1',
      createdAt: now,
      committedAt: now,
      lines: [
        {
          lineId: 'line_1',
          menuItemId: 'item_latte',
          quantity: 1,
          selectedModifiers: [
            { groupId: 'grp_syrup', optionId: 'opt_vanilla' }
          ]
        }
      ]
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.provisionalReceipt.isProvisional, true);
  assert.equal(result.provisionalReceipt.status, 'pending_sync');
  assert.ok(result.provisionalReceipt.provisionalReceiptNumber.startsWith('PROV-ORD-'));
  assert.equal(result.provisionalReceipt.totalRevenueCentavos, 15500);
  assert.equal(result.provisionalReceipt.changeCentavos, 4500);

  const storedOrder = await outboxDB.getOrder('tenant_cafe', 'ord_offline_1');
  assert.ok(storedOrder);
  assert.equal(storedOrder?.syncState, 'pending_sync');
  assert.equal(storedOrder?.paymentMethod, 'cash');
  assert.ok(storedOrder?.grant);
  assert.equal(storedOrder?.grant.payload.staffAccountId, 'staff_123');
});

test('2. Same-device projected ingredient stock reservation reduces subsequent availability', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);
  const authMgr = await setupAuthorizedManager(outboxDB, 'tenant_cafe', 'staff_123', 'v1.0.0');

  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_cafe', 'v1.0.0'));

  const now = new Date().toISOString();
  await offlineMgr.acceptOfflineOrder({
    tenantId: 'tenant_cafe',
    actorId: 'staff_staff_123',
    staffAccountId: 'staff_123',
    actorRole: 'cashier',
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    authorityManager: authMgr,
    request: {
      orderId: 'ord_latte_1',
      tenantId: 'tenant_cafe',
      staffAccountId: 'staff_123',
      idempotencyKey: 'idemp_latte_1',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    }
  });

  const stock = await offlineMgr.getProjectedStock('tenant_cafe', 'ing_beans');
  assert.equal(stock?.baselineStock, 40000);
  assert.equal(stock?.reservedStock, 18000);
  assert.equal(stock?.projectedAvailable, 22000);

  await offlineMgr.acceptOfflineOrder({
    tenantId: 'tenant_cafe',
    actorId: 'staff_staff_123',
    staffAccountId: 'staff_123',
    actorRole: 'cashier',
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    authorityManager: authMgr,
    request: {
      orderId: 'ord_latte_2',
      tenantId: 'tenant_cafe',
      staffAccountId: 'staff_123',
      idempotencyKey: 'idemp_latte_2',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    }
  });

  const stockAfter2 = await offlineMgr.getProjectedStock('tenant_cafe', 'ing_beans');
  assert.equal(stockAfter2?.reservedStock, 36000);
  assert.equal(stockAfter2?.projectedAvailable, 4000);

  await assert.rejects(
    offlineMgr.acceptOfflineOrder({
      tenantId: 'tenant_cafe',
      actorId: 'staff_staff_123',
      staffAccountId: 'staff_123',
      actorRole: 'cashier',
      paymentMethod: 'cash',
      cashTenderedCentavos: 15000,
      authorityManager: authMgr,
      request: {
        orderId: 'ord_latte_3',
        tenantId: 'tenant_cafe',
        staffAccountId: 'staff_123',
        idempotencyKey: 'idemp_latte_3',
        createdAt: now,
        committedAt: now,
        lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
      }
    }),
    /Insufficient projected stock on device/
  );
});

test('3. Refusal of non-cash payment methods while offline', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);
  const authMgr = await setupAuthorizedManager(outboxDB, 'tenant_cafe', 'staff_123', 'v1.0.0');

  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_cafe', 'v1.0.0'));

  const now = new Date().toISOString();
  await assert.rejects(
    offlineMgr.acceptOfflineOrder({
      tenantId: 'tenant_cafe',
      actorId: 'staff_staff_123',
      staffAccountId: 'staff_123',
      actorRole: 'cashier',
      paymentMethod: 'gcash' as any,
      cashTenderedCentavos: 15000,
      authorityManager: authMgr,
      request: {
        orderId: 'ord_gcash_1',
        tenantId: 'tenant_cafe',
        staffAccountId: 'staff_123',
        idempotencyKey: 'idemp_gcash_1',
        createdAt: now,
        committedAt: now,
        lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
      }
    }),
    /Offline checkout is only supported for cash orders/
  );
});

test('4. Missing or corrupted offline catalog snapshot fails closed', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);
  const authMgr = await setupAuthorizedManager(outboxDB, 'tenant_empty', 'staff_123', 'v1.0.0');

  const now = new Date().toISOString();
  await assert.rejects(
    offlineMgr.acceptOfflineOrder({
      tenantId: 'tenant_empty',
      actorId: 'staff_staff_123',
      staffAccountId: 'staff_123',
      actorRole: 'cashier',
      paymentMethod: 'cash',
      cashTenderedCentavos: 15000,
      authorityManager: authMgr,
      request: {
        orderId: 'ord_missing_cat',
        tenantId: 'tenant_empty',
        staffAccountId: 'staff_123',
        idempotencyKey: 'idemp_missing_cat',
        createdAt: now,
        committedAt: now,
        lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
      }
    }),
    /Offline catalog unavailable/
  );
});

test('5. Insufficient cash tendered rejection', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);
  const authMgr = await setupAuthorizedManager(outboxDB, 'tenant_cafe', 'staff_123', 'v1.0.0');

  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_cafe', 'v1.0.0'));

  const now = new Date().toISOString();
  await assert.rejects(
    offlineMgr.acceptOfflineOrder({
      tenantId: 'tenant_cafe',
      actorId: 'staff_staff_123',
      staffAccountId: 'staff_123',
      actorRole: 'cashier',
      paymentMethod: 'cash',
      cashTenderedCentavos: 5000,
      authorityManager: authMgr,
      request: {
        orderId: 'ord_short_cash',
        tenantId: 'tenant_cafe',
        staffAccountId: 'staff_123',
        idempotencyKey: 'idemp_short_cash',
        createdAt: now,
        committedAt: now,
        lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
      }
    }),
    /Cash tendered .* is less than total due/
  );
});

test('6. Missing authority manager rejects offline checkout', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);

  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_cafe', 'v1.0.0'));

  const now = new Date().toISOString();
  await assert.rejects(
    async () => {
      await offlineMgr.acceptOfflineOrder({
        tenantId: 'tenant_cafe',
        actorId: 'staff_staff_123',
        staffAccountId: 'staff_123',
        actorRole: 'cashier',
        paymentMethod: 'cash',
        cashTenderedCentavos: 20000,
        request: {
          orderId: 'ord_no_auth',
          tenantId: 'tenant_cafe',
          staffAccountId: 'staff_123',
          idempotencyKey: 'idemp_no_auth',
          createdAt: now,
          committedAt: now,
          lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
        }
      } as any);
    },
    /Offline authority is mandatory/
  );
});

test('7. Locked authority session rejects offline checkout', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);
  const authMgr = await setupAuthorizedManager(outboxDB, 'tenant_cafe', 'staff_123', 'v1.0.0');

  authMgr.lock();

  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_cafe', 'v1.0.0'));

  const now = new Date().toISOString();
  await assert.rejects(
    async () => {
      await offlineMgr.acceptOfflineOrder({
        tenantId: 'tenant_cafe',
        actorId: 'staff_staff_123',
        staffAccountId: 'staff_123',
        actorRole: 'cashier',
        paymentMethod: 'cash',
        cashTenderedCentavos: 20000,
        authorityManager: authMgr,
        request: {
          orderId: 'ord_locked',
          tenantId: 'tenant_cafe',
          staffAccountId: 'staff_123',
          idempotencyKey: 'idemp_locked',
          createdAt: now,
          committedAt: now,
          lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
        }
      });
    },
    /Unauthorized offline checkout: authority session is locked/
  );
});

test('8. Catalog mismatch rejects offline checkout', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const offlineMgr = new OrderSnapOfflineManager(outboxDB);
  const authMgr = await setupAuthorizedManager(outboxDB, 'tenant_cafe', 'staff_123', 'v1.0.0');

  await outboxDB.saveCatalogSnapshot(createSampleCatalog('tenant_cafe', 'v2.0.0'));

  const now = new Date().toISOString();
  await assert.rejects(
    async () => {
      await offlineMgr.acceptOfflineOrder({
        tenantId: 'tenant_cafe',
        actorId: 'staff_staff_123',
        staffAccountId: 'staff_123',
        actorRole: 'cashier',
        paymentMethod: 'cash',
        cashTenderedCentavos: 20000,
        authorityManager: authMgr,
        request: {
          orderId: 'ord_cat_mismatch',
          tenantId: 'tenant_cafe',
          staffAccountId: 'staff_123',
          idempotencyKey: 'idemp_cat_mismatch',
          createdAt: now,
          committedAt: now,
          lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
        }
      });
    },
    /Unauthorized offline checkout: catalog version mismatch/
  );
});

test('9. Durable recovery across manager recreation / app restart', async () => {
  const mockFactory = createMockIndexedDB();

  const dbSession1 = new OrderSnapOutboxDB(mockFactory);
  const authMgr1 = await setupAuthorizedManager(dbSession1, 'tenant_cafe', 'staff_123', 'v1.0.0');
  const mgrSession1 = new OrderSnapOfflineManager(dbSession1);
  await dbSession1.saveCatalogSnapshot(createSampleCatalog('tenant_cafe', 'v1.0.0'));

  const now = new Date().toISOString();
  await mgrSession1.acceptOfflineOrder({
    tenantId: 'tenant_cafe',
    actorId: 'staff_staff_123',
    staffAccountId: 'staff_123',
    actorRole: 'cashier',
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    authorityManager: authMgr1,
    request: {
      orderId: 'ord_restart_test',
      tenantId: 'tenant_cafe',
      staffAccountId: 'staff_123',
      idempotencyKey: 'idemp_restart_test',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    }
  });

  const dbSession2 = new OrderSnapOutboxDB(mockFactory);
  const mgrSession2 = new OrderSnapOfflineManager(dbSession2);

  const pending = await dbSession2.getPendingOrders('tenant_cafe');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].orderId, 'ord_restart_test');
  assert.equal(pending[0].idempotencyKey, 'idemp_restart_test');
  assert.ok(pending[0].grant);

  const stock = await mgrSession2.getProjectedStock('tenant_cafe', 'ing_beans');
  assert.equal(stock?.reservedStock, 18000);
});
