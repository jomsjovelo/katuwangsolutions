import test from 'node:test';
import assert from 'node:assert/strict';

import { OrderSnapController } from '../../src/lib/order-snap/order-snap-controller';
import { OrderSnapOutboxDB } from '../../src/lib/order-snap/order-snap-outbox-db';
import { createMockIndexedDB } from '../test-indexeddb-mock';
import { OrderSnapLogoutGuard } from '../../src/lib/order-snap/order-snap-logout-guard';
import {
  OrderSnapAuthorityManager,
  EstablishAuthorityParams,
  EstablishAuthorityResult,
} from '../../src/lib/order-snap/order-snap-authority-manager';
import {
  OrderSnapSyncCoordinatorFactory,
} from '../../src/lib/order-snap/order-snap-controller';

class CountingLogoutGuard extends OrderSnapLogoutGuard {
  callCount = 0;

  constructor(outboxDB: OrderSnapOutboxDB) {
    super(outboxDB);
  }

  override performSafeLogoutCleanup(): void {
    this.callCount += 1;
    super.performSafeLogoutCleanup();
  }
}

class SuccessfulAuthorityManager extends OrderSnapAuthorityManager {
  override async establishOnlineAuthority(
    params: EstablishAuthorityParams
  ): Promise<EstablishAuthorityResult> {
    const nowSeconds = Math.floor(Date.now() / 1000);

    return {
      success: true,
      state: 'online-authorized',
      session: Object.freeze({
        grantId: 'grant_logout_test',
        moduleId: 'order-snap',
        tenantId: params.tenantId,
        staffAccountId: 'staff_verified_from_authority',
        actorId: 'actor_verified_from_authority',
        authUid: 'firebase_logout_selector',
        sessionVersion: 1,
        role: 'cashier',
        displayName: 'Verified Cashier',
        deviceId: params.deviceId,
        catalogVersion: params.catalogVersion,
        issuedAt: nowSeconds,
        expiresAt: nowSeconds + 3600,
        allowedTenders: ['cash'] as const,
        isLocalLocked: false,
      }),
    };
  }
}

test('logout uses the injected Order Snap guard and clears only in-memory authority', async () => {
  const outboxDB = new OrderSnapOutboxDB(createMockIndexedDB());

  const tenantId = 'tenant_logout_test';
  const catalogVersion = 'catalog_logout_test';

  await outboxDB.saveCatalogSnapshot({
    tenantId,
    catalogVersion,
    syncedAt: new Date(0).toISOString(),
    menuItems: [],
    recipes: [],
    modifierGroups: [],
    ingredients: [],
  });

  let coordinatorCreateCount = 0;
  let coordinatorDestroyCount = 0;

  const syncCoordinatorFactory: OrderSnapSyncCoordinatorFactory = () => {
    coordinatorCreateCount += 1;
    return {
      destroy: () => {
        coordinatorDestroyCount += 1;
      },
      triggerSync: () => {},
    };
  };

  const guard = new CountingLogoutGuard(outboxDB);
  const authorityManager = new SuccessfulAuthorityManager(outboxDB);

  const controller = new OrderSnapController({
    tenantId,
    authUid: 'firebase_logout_selector',
    outboxDB,
    logoutGuard: guard,
    authorityManager,
    syncCoordinatorFactory,
    getIdToken: async () => 'test_token',
  });

  try {
    await controller.initialize();

    const stateAfterInit = controller.getState();
    assert.equal(stateAfterInit.authorityState, 'online-authorized', 'controller should initialize online');

    // Verify exactly one fake coordinator was created during initialization
    assert.equal(coordinatorCreateCount, 1, 'exactly one fake coordinator should be created during initialization');

    // First logout cleanup
    await controller.performLogoutCleanup();

    assert.equal(guard.callCount, 1, 'guard cleanup should be called exactly once');

    const stateAfterFirst = controller.getState();

    assert.equal(stateAfterFirst.authorityState, 'uninitialized', 'authority state should be uninitialized after logout');
    assert.equal(stateAfterFirst.session, null, 'session should be null after logout');
    assert.equal(stateAfterFirst.canCheckoutOffline, false, 'offline checkout should be disabled after logout');
    assert.equal(stateAfterFirst.isSyncing, false, 'sync should not be active after logout');
    assert.equal(stateAfterFirst.pendingCount, 0, 'pending count should be 0 after logout');
    assert.equal(stateAfterFirst.isOnline, true, 'online status should remain true');

    // First logout should destroy the fake coordinator exactly once
    assert.equal(coordinatorDestroyCount, 1, 'fake coordinator should be destroyed exactly once on first logout');

    // Second logout cleanup
    await controller.performLogoutCleanup();

    assert.equal(guard.callCount, 2, 'guard cleanup should be called exactly twice');

    // Second logout should NOT destroy the coordinator again (already destroyed)
    assert.equal(coordinatorDestroyCount, 1, 'fake coordinator should not be destroyed again on second logout');

    const stateAfterSecond = controller.getState();

    assert.equal(stateAfterSecond.authorityState, 'uninitialized', 'authority state should remain uninitialized after second logout');
    assert.equal(stateAfterSecond.session, null, 'session should remain null after second logout');
    assert.equal(stateAfterSecond.canCheckoutOffline, false, 'offline checkout should remain disabled');
    assert.equal(stateAfterSecond.isSyncing, false, 'sync should remain inactive');
    assert.equal(stateAfterSecond.pendingCount, 0, 'pending count should remain 0');
  } finally {
    controller.destroy();

    // Ensure fake coordinator destroy count remains exactly one after final destruction
    assert.equal(coordinatorDestroyCount, 1, 'fake coordinator destroy count should remain exactly one after final destruction');
  }
});