import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OrderSnapController,
  OrderSnapSyncCoordinatorFactory,
} from '../../src/lib/order-snap/order-snap-controller';
import {
  OrderSnapAuthorityManager,
  RestoreOfflineAuthoritySafeParams,
  RestoreOfflineAuthoritySafeResult,
} from '../../src/lib/order-snap/order-snap-authority-manager';
import { OrderSnapOutboxDB } from '../../src/lib/order-snap/order-snap-outbox-db';
import { createMockIndexedDB } from '../test-indexeddb-mock';

class FixedOfflineAuthorityManager extends OrderSnapAuthorityManager {
  constructor(
    outboxDB: OrderSnapOutboxDB,
    private readonly fixedResult: RestoreOfflineAuthoritySafeResult
  ) {
    super(outboxDB);
  }

  override async restoreOfflineAuthoritySafe(
    _params: RestoreOfflineAuthoritySafeParams
  ): Promise<RestoreOfflineAuthoritySafeResult> {
    return this.fixedResult;
  }
}

test('offline restoration failures remain fail closed', async () => {
  const originalWindowDescriptor =
    Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalNavigatorDescriptor =
    Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      onLine: false,
    },
  });

  const cases: ReadonlyArray<{
    readonly label: string;
    readonly result: RestoreOfflineAuthoritySafeResult;
  }> = [
    {
      label: 'no valid authority',
      result: {
        success: false,
        state: 'unauthorized',
        reason: 'no_valid_authority',
      },
    },
    {
      label: 'ambiguous authority',
      result: {
        success: false,
        state: 'unauthorized',
        reason: 'ambiguous_authority',
      },
    },
    {
      label: 'catalog mismatch',
      result: {
        success: false,
        state: 'catalog-mismatch',
        reason: 'catalog_mismatch',
      },
    },
  ];

  try {
    for (const testCase of cases) {
      const tenantId = `tenant_${testCase.label.replaceAll(' ', '_')}`;
      const catalogVersion = 'catalog_failure_test';
      const authUid = 'firebase_failure_selector';

      const outboxDB = new OrderSnapOutboxDB(createMockIndexedDB());

      await outboxDB.saveCatalogSnapshot({
        tenantId,
        catalogVersion,
        syncedAt: new Date(0).toISOString(),
        menuItems: [],
        recipes: [],
        modifierGroups: [],
        ingredients: [],
      });

      const authorityManager = new FixedOfflineAuthorityManager(
        outboxDB,
        testCase.result
      );

      const syncCoordinatorFactory: OrderSnapSyncCoordinatorFactory =
        () => ({
          destroy: () => {},
          triggerSync: () => {},
        });

      let tokenCallCount = 0;

      const controller = new OrderSnapController({
        tenantId,
        authUid,
        outboxDB,
        authorityManager,
        syncCoordinatorFactory,
        getIdToken: async () => {
          tokenCallCount += 1;
          return null;
        },
      });

      try {
        await controller.initialize();

        const state = controller.getState();

        assert.equal(
          state.authorityState,
          testCase.result.state,
          testCase.label
        );
        assert.equal(state.session, null, testCase.label);
        assert.equal(
          state.canCheckoutOffline,
          false,
          testCase.label
        );
        assert.equal(tokenCallCount, 0, testCase.label);
      } finally {
        controller.destroy();
      }
    }
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(
        globalThis,
        'window',
        originalWindowDescriptor
      );
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }

    if (originalNavigatorDescriptor) {
      Object.defineProperty(
        globalThis,
        'navigator',
        originalNavigatorDescriptor
      );
    } else {
      Reflect.deleteProperty(globalThis, 'navigator');
    }
  }
});