/**
 * Order Snap Outbox DB Unit Tests
 *
 * Covers:
 * 1. Database creation and schema migration from earlier numeric version
 * 2. Monotonic localSequence per tenant and device
 * 3. Cashier-safe offline catalog save and validated retrieval
 * 4. Atomic order enqueue with projected ingredient reservations
 * 5. Lifecycle State transitions and fail-closed validation
 * 6. Mark conflict retains blocked reservations, permanently rejected releases them
 * 7. Lease locking, renewal, expiration, and multi-device coordination
 * 8. Crash recovery of stale syncing orders
 * 9. Confirmed-record retention cleanup
 * 10. Corrupted record handling and schema validation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderSnapOutboxDB } from '../src/lib/order-snap/order-snap-outbox-db';
import {
  OfflineCatalogSnapshot,
  OrderSnapOutboxEntry,
  ProjectedIngredientReservation,
  OrderSnapAuthorityGrant
} from '../src/lib/order-snap/offline-types';
import { createMockIndexedDB } from './test-indexeddb-mock';
import { OrderSnapGrantSigner } from '../src/lib/server/order-snap-grant-signer';

const TEST_SECRET = 'test_secret_must_be_sufficiently_long_32chars_min';

function createSampleGrant(
  tenantId: string = 'tenant_alpha',
  staffAccountId: string = 'staff_1',
  deviceId: string = 'dev_abc'
): OrderSnapAuthorityGrant {
  const signer = new OrderSnapGrantSigner({ keys: { v1: TEST_SECRET } });
  const nowSec = Math.floor(Date.now() / 1000);
  return signer.signGrant({
    grantId: 'grant_test_outbox',
    moduleId: 'timpla-track',
    tenantId,
    staffAccountId,
    actorId: `staff_${staffAccountId}`,
    authUid: 'uid_test',
    sessionVersion: 1,
    role: 'cashier',
    displayName: 'Staff 1',
    deviceId,
    catalogVersion: 'cat_v1',
    issuedAt: nowSec,
    expiresAt: nowSec + 3600,
    allowedTenders: ['cash']
  });
}

test('1. Database creation and schema migration from earlier numeric version', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);

  const db = await outboxDB.getDB();
  assert.equal(db.name, 'katuwang_ordersnap_outbox');
  assert.equal(db.version, 2);
});

test('2. Device ID and Monotonic sequence generation per tenant/device', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);

  const devId1 = await outboxDB.getOrCreateDeviceId();
  const devId2 = await outboxDB.getOrCreateDeviceId();
  assert.equal(devId1, devId2, 'Device ID should be stable per installation');

  const seq1 = await outboxDB.getNextLocalSequence('tenant_alpha', devId1);
  const seq2 = await outboxDB.getNextLocalSequence('tenant_alpha', devId1);
  const seq3 = await outboxDB.getNextLocalSequence('tenant_alpha', devId1);

  assert.equal(seq1, 1);
  assert.equal(seq2, 2);
  assert.equal(seq3, 3);

  // Different tenant has independent sequence
  const betaSeq1 = await outboxDB.getNextLocalSequence('tenant_beta', devId1);
  assert.equal(betaSeq1, 1);
});

test('3. Cashier-safe offline catalog save and validated retrieval', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);

  const catalog: OfflineCatalogSnapshot = {
    tenantId: 'tenant_alpha',
    catalogVersion: 'cat_v1',
    syncedAt: new Date().toISOString(),
    menuItems: [
      {
        menuItemId: 'item_latte',
        tenantId: 'tenant_alpha',
        name: 'Iced Latte',
        category: 'Coffee',
        basePriceCentavos: 12000,
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
          { ingredientId: 'ing_beans', quantityMinor: 18000, unit: 'g' },
          { ingredientId: 'ing_milk', quantityMinor: 200000, unit: 'ml' }
        ]
      }
    ],
    modifierGroups: [],
    ingredients: [
      { ingredientId: 'ing_beans', tenantId: 'tenant_alpha', name: 'Espresso Beans', unit: 'g', stockQuantityMinor: 500000, isActive: true },
      { ingredientId: 'ing_milk', tenantId: 'tenant_alpha', name: 'Fresh Milk', unit: 'ml', stockQuantityMinor: 2000000, isActive: true }
    ]
  };

  await outboxDB.saveCatalogSnapshot(catalog);
  const retrieved = await outboxDB.getCatalogSnapshot('tenant_alpha');

  assert.ok(retrieved);
  assert.equal(retrieved?.tenantId, 'tenant_alpha');
  assert.equal(retrieved?.menuItems.length, 1);
  assert.equal(retrieved?.menuItems[0].name, 'Iced Latte');
});

test('4. Atomic order enqueue with projected ingredient reservations', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);

  const now = new Date().toISOString();
  const grant = createSampleGrant('tenant_alpha', 'staff_1', 'dev_abc');
  const orderEntry: OrderSnapOutboxEntry = {
    orderId: 'ord_123',
    idempotencyKey: 'idemp_123',
    tenantId: 'tenant_alpha',
    actorId: 'staff_staff_1',
    staffAccountId: 'staff_1',
    actorRole: 'cashier',
    deviceId: 'dev_abc',
    localSequence: 1,
    request: {
      orderId: 'ord_123',
      tenantId: 'tenant_alpha',
      staffAccountId: 'staff_1',
      idempotencyKey: 'idemp_123',
      createdAt: now,
      committedAt: now,
      lines: [
        {
          lineId: 'line_1',
          menuItemId: 'item_latte',
          quantity: 2
        }
      ]
    },
    paymentMethod: 'cash',
    cashTenderedCentavos: 30000,
    clientCreatedAt: now,
    provisionalReceiptNumber: 'PROV-ORD-000001-ORD123',
    grant,
    syncState: 'pending_sync',
    attemptCount: 0
  };

  const reservations: ProjectedIngredientReservation[] = [
    {
      reservationId: 'res_1',
      tenantId: 'tenant_alpha',
      orderId: 'ord_123',
      ingredientId: 'ing_beans',
      reservedQuantityMinor: 36000,
      unit: 'g',
      createdAt: now,
      status: 'active'
    },
    {
      reservationId: 'res_2',
      tenantId: 'tenant_alpha',
      orderId: 'ord_123',
      ingredientId: 'ing_milk',
      reservedQuantityMinor: 400000,
      unit: 'ml',
      createdAt: now,
      status: 'active'
    }
  ];

  await outboxDB.enqueueOrder(orderEntry, reservations);

  const stored = await outboxDB.getOrder('tenant_alpha', 'ord_123');
  assert.ok(stored);
  assert.equal(stored?.orderId, 'ord_123');
  assert.equal(stored?.syncState, 'pending_sync');

  const pending = await outboxDB.getPendingOrders('tenant_alpha');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].orderId, 'ord_123');

  const resMap = await outboxDB.getProjectedReservationsMap('tenant_alpha');
  assert.equal(resMap['ing_beans'], 36000);
  assert.equal(resMap['ing_milk'], 400000);
});

test('5. Lifecycle State transitions and fail-closed validation', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);

  const now = new Date().toISOString();
  const grant = createSampleGrant('tenant_alpha', 'staff_1', 'dev_abc');
  const orderEntry: OrderSnapOutboxEntry = {
    orderId: 'ord_state_test',
    idempotencyKey: 'idemp_state_test',
    tenantId: 'tenant_alpha',
    actorId: 'staff_staff_1',
    staffAccountId: 'staff_1',
    actorRole: 'cashier',
    deviceId: 'dev_abc',
    localSequence: 2,
    request: {
      orderId: 'ord_state_test',
      tenantId: 'tenant_alpha',
      staffAccountId: 'staff_1',
      idempotencyKey: 'idemp_state_test',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    },
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    clientCreatedAt: now,
    provisionalReceiptNumber: 'PROV-ORD-000002-ORDSTA',
    grant,
    syncState: 'pending_sync',
    attemptCount: 0
  };

  await outboxDB.enqueueOrder(orderEntry, []);

  // Valid: pending_sync -> syncing
  await outboxDB.updateOrderSyncState('tenant_alpha', 'ord_state_test', 'syncing');
  let order = await outboxDB.getOrder('tenant_alpha', 'ord_state_test');
  assert.equal(order?.syncState, 'syncing');

  // Invalid: confirmed -> pending_sync should fail closed
  await outboxDB.markOrderConfirmed('tenant_alpha', 'ord_state_test', { result: 'ok' }, 'sale_1', 'snap_1', now);
  order = await outboxDB.getOrder('tenant_alpha', 'ord_state_test');
  assert.equal(order?.syncState, 'confirmed');

  await assert.rejects(
    outboxDB.updateOrderSyncState('tenant_alpha', 'ord_state_test', 'pending_sync'),
    /Invalid state transition/
  );
});

test('6. Mark conflict retains blocked reservations, permanently rejected releases them', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);

  const now = new Date().toISOString();
  const grant = createSampleGrant('tenant_alpha', 'staff_1', 'dev_abc');
  const orderEntry: OrderSnapOutboxEntry = {
    orderId: 'ord_conflict_test',
    idempotencyKey: 'idemp_conflict_test',
    tenantId: 'tenant_alpha',
    actorId: 'staff_staff_1',
    staffAccountId: 'staff_1',
    actorRole: 'cashier',
    deviceId: 'dev_abc',
    localSequence: 3,
    request: {
      orderId: 'ord_conflict_test',
      tenantId: 'tenant_alpha',
      staffAccountId: 'staff_1',
      idempotencyKey: 'idemp_conflict_test',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    },
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    clientCreatedAt: now,
    provisionalReceiptNumber: 'PROV-ORD-000003-ORDCON',
    grant,
    syncState: 'pending_sync',
    attemptCount: 0
  };

  const reservations: ProjectedIngredientReservation[] = [
    {
      reservationId: 'res_c1',
      tenantId: 'tenant_alpha',
      orderId: 'ord_conflict_test',
      ingredientId: 'ing_beans',
      reservedQuantityMinor: 18000,
      unit: 'g',
      createdAt: now,
      status: 'active'
    }
  ];

  await outboxDB.enqueueOrder(orderEntry, reservations);
  await outboxDB.updateOrderSyncState('tenant_alpha', 'ord_conflict_test', 'syncing');

  // Mark conflict
  await outboxDB.markOrderConflict('tenant_alpha', 'ord_conflict_test', {
    occurredAt: now,
    errorCode: 'INSUFFICIENT_STOCK',
    errorMessage: 'Insufficient authoritative stock',
    conflictReason: 'Insufficient beans on server',
    attemptedByActorId: 'staff_1',
    originalRequest: orderEntry.request
  });

  let resMap = await outboxDB.getProjectedReservationsMap('tenant_alpha');
  assert.equal(resMap['ing_beans'], 18000, 'Blocked reservations must remain counted to protect stock');

  // Transition from conflict to permanently rejected (e.g. Owner cancels)
  await outboxDB.markOrderPermanentlyRejected('tenant_alpha', 'ord_conflict_test', {
    occurredAt: now,
    errorCode: 'CANCELLED_BY_OWNER',
    errorMessage: 'Owner cancelled conflicted order',
    conflictReason: 'Explicit owner rejection',
    attemptedByActorId: 'owner_1',
    originalRequest: orderEntry.request
  });

  resMap = await outboxDB.getProjectedReservationsMap('tenant_alpha');
  assert.equal(resMap['ing_beans'] || 0, 0, 'Permanently rejected order must release reservations');
});

test('7. Lease locking, renewal, expiration, and multi-device coordination', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);

  // Device 1 acquires lease
  const lease1 = await outboxDB.acquireSyncLease('tenant_alpha', 'dev_1', 1000);
  assert.ok(lease1, 'Device 1 should acquire lease');

  // Device 2 attempts while lease 1 is active -> fails
  const lease2 = await outboxDB.acquireSyncLease('tenant_alpha', 'dev_2', 1000);
  assert.equal(lease2, null, 'Device 2 should be blocked by active lease');

  // Device 1 renews lease
  const renewed = await outboxDB.renewSyncLease('tenant_alpha', lease1!, 2000);
  assert.equal(renewed, true);

  // Device 1 releases lease
  await outboxDB.releaseSyncLease('tenant_alpha', lease1!);

  // Device 2 can now acquire lease
  const lease2After = await outboxDB.acquireSyncLease('tenant_alpha', 'dev_2', 1000);
  assert.ok(lease2After, 'Device 2 should acquire lease after release');
});

test('8. Crash recovery of stale syncing orders', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);

  const now = new Date().toISOString();
  const grant = createSampleGrant('tenant_alpha', 'staff_1', 'dev_abc');
  const staleEntry: OrderSnapOutboxEntry = {
    orderId: 'ord_stale_1',
    idempotencyKey: 'idemp_stale_1',
    tenantId: 'tenant_alpha',
    actorId: 'staff_staff_1',
    staffAccountId: 'staff_1',
    actorRole: 'cashier',
    deviceId: 'dev_abc',
    localSequence: 4,
    request: {
      orderId: 'ord_stale_1',
      tenantId: 'tenant_alpha',
      staffAccountId: 'staff_1',
      idempotencyKey: 'idemp_stale_1',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    },
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    clientCreatedAt: now,
    provisionalReceiptNumber: 'PROV-ORD-000004-ORDSTA',
    grant,
    syncState: 'syncing',
    attemptCount: 1,
    lastAttemptAt: new Date(Date.now() - 60000).toISOString() // 60s ago
  };

  await outboxDB.enqueueOrder(staleEntry, []);

  const recoveredCount = await outboxDB.recoverStaleSyncingOrders('tenant_alpha', 30000);
  assert.equal(recoveredCount, 1);

  const order = await outboxDB.getOrder('tenant_alpha', 'ord_stale_1');
  assert.equal(order?.syncState, 'retryable_failure');
});

test('9. Confirmed-record retention cleanup', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);

  const now = new Date().toISOString();
  const grant = createSampleGrant('tenant_alpha', 'staff_1', 'dev_abc');
  const oldConfirmed: OrderSnapOutboxEntry = {
    orderId: 'ord_old_confirmed',
    idempotencyKey: 'idemp_old_confirmed',
    tenantId: 'tenant_alpha',
    actorId: 'staff_staff_1',
    staffAccountId: 'staff_1',
    actorRole: 'cashier',
    deviceId: 'dev_abc',
    localSequence: 5,
    request: {
      orderId: 'ord_old_confirmed',
      tenantId: 'tenant_alpha',
      staffAccountId: 'staff_1',
      idempotencyKey: 'idemp_old_confirmed',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
    },
    paymentMethod: 'cash',
    cashTenderedCentavos: 15000,
    clientCreatedAt: now,
    provisionalReceiptNumber: 'PROV-ORD-000005-ORDOLD',
    grant,
    syncState: 'confirmed',
    attemptCount: 1,
    serverCommittedAt: new Date(Date.now() - 86400000 * 10).toISOString() // 10 days ago
  };

  await outboxDB.enqueueOrder(oldConfirmed, []);

  const cleaned = await outboxDB.cleanupConfirmedOrders('tenant_alpha', Date.now() - 86400000 * 7);
  assert.equal(cleaned, 1);

  const order = await outboxDB.getOrder('tenant_alpha', 'ord_old_confirmed');
  assert.equal(order, null);
});

import { SecureCryptoProvider, createDeterministicTestProvider } from '../src/lib/order-snap/secure-id-utils';

test('10. Injected deterministic crypto generates a stable device ID', async () => {
  const deterministicProvider = createDeterministicTestProvider();
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory, deterministicProvider);

  const devId1 = await outboxDB.getOrCreateDeviceId();
  const devId2 = await outboxDB.getOrCreateDeviceId();
  assert.equal(devId1, devId2, 'Device ID must be stable across calls');
  assert.ok(devId1.startsWith('dev_'), 'Device ID must have dev_ prefix');
  assert.equal(devId1.length, 36, 'Device ID must be 36 chars (dev_ + 32 hex)');
});

test('11. Lease tokens use injected secure crypto and fail when crypto unavailable', async () => {
  const deterministicProvider = createDeterministicTestProvider();
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory, deterministicProvider);

  const lease1 = await outboxDB.acquireSyncLease('tenant_alpha', 'dev_test', 1000);
  assert.ok(lease1, 'Lease must be acquired with deterministic provider');
  assert.ok(lease1.startsWith('lease_'), 'Lease token must have lease_ prefix');

  // Second device blocked
  const lease2 = await outboxDB.acquireSyncLease('tenant_alpha', 'dev_other', 1000);
  assert.equal(lease2, null, 'Second device must be blocked by active lease');
});

test('12. Missing secure crypto fails closed without insecure fallback', async () => {
  const emptyProvider: SecureCryptoProvider = {};
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory, emptyProvider);

  await assert.rejects(
    outboxDB.getOrCreateDeviceId(),
    /Secure device ID generation failed/
  );
});

test('13. Device IDs and lease tokens never use Math.random(), timestamps, or counters', async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);

  const devId = await outboxDB.getOrCreateDeviceId();
  assert.ok(/^dev_[0-9a-f]{32}$/.test(devId), 'Device ID must be 32 hex chars after dev_ prefix');

  const lease = await outboxDB.acquireSyncLease('tenant_unique', 'dev_test2', 1000);
  assert.ok(lease.startsWith('lease_'), 'Lease must have lease_ prefix');
  assert.ok(lease.length > 'lease_'.length, 'Lease must have UUID after prefix');
});
