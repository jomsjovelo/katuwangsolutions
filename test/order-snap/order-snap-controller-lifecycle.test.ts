import test from 'node:test';
import assert from 'node:assert/strict';

import { OrderSnapController } from '../../src/lib/order-snap/order-snap-controller';
import { OrderSnapOutboxDB } from '../../src/lib/order-snap/order-snap-outbox-db';
import { createMockIndexedDB } from '../test-indexeddb-mock';
import {
  OrderSnapSyncCoordinatorFactory,
} from '../../src/lib/order-snap/order-snap-controller';

test('destroy during deferred token acquisition prevents post-destroy publication', async () => {
  const originalWindowDescriptor =
    Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalNavigatorDescriptor =
    Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  const addedListeners = new Map<string, EventListenerOrEventListenerObject[]>();
  const removedListeners = new Map<string, EventListenerOrEventListenerObject[]>();

  const recordListener = (
    target: Map<string, EventListenerOrEventListenerObject[]>,
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void => {
    const listeners = target.get(type) ?? [];
    listeners.push(listener);
    target.set(type, listeners);
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject
      ): void => {
        recordListener(addedListeners, type, listener);
      },
      removeEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject
      ): void => {
        recordListener(removedListeners, type, listener);
      },
    },
  });

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      onLine: true,
    },
  });

  const outboxDB = new OrderSnapOutboxDB(createMockIndexedDB());

  const tenantId = 'tenant_lifecycle_test';
  const catalogVersion = 'catalog_lifecycle_test';

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

  const syncCoordinatorFactory: OrderSnapSyncCoordinatorFactory = () => {
    coordinatorCreateCount += 1;

    return {
      destroy: () => {},
      triggerSync: () => {},
    };
  };

  let tokenCallCount = 0;
  let releaseToken!: (value: string | null) => void;

  const deferredToken = new Promise<string | null>((resolve) => {
    releaseToken = resolve;
  });

  const controller = new OrderSnapController({
    tenantId,
    authUid: 'firebase_lifecycle_selector',
    outboxDB,
    syncCoordinatorFactory,
    getIdToken: () => {
      tokenCallCount += 1;
      return deferredToken;
    },
  });

  let notificationCount = 0;

  const unsubscribe = controller.subscribe(() => {
    notificationCount += 1;
  });

  try {
    const initPromise = controller.initialize();

    for (let attempt = 0; attempt < 50 && tokenCallCount === 0; attempt += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1);
      });
    }

    assert.equal(tokenCallCount, 1, 'token acquisition should have started');

    controller.destroy();

    const snapshotAfterDestroy = controller.getState();

    releaseToken('test_token');

    await initPromise;

    assert.equal(coordinatorCreateCount, 0, 'no sync coordinator should be created after destroy');

    const state = controller.getState();

    assert.strictEqual(state, snapshotAfterDestroy, 'getState() must return the exact same snapshot reference captured after destroy');

    assert.equal(state.authorityState, 'uninitialized', 'authority state should remain uninitialized after destroy during token acquisition');

    assert.equal(state.session, null, 'no session should be published after destroy');

    assert.equal(state.canCheckoutOffline, false, 'canCheckoutOffline should be false after destroy');

    const finalNotificationCount = notificationCount;

    releaseToken('second_token');

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assert.equal(notificationCount, finalNotificationCount, 'notification count must not increase after deferred token resolves post-destroy');

    const finalState = controller.getState();
    assert.strictEqual(finalState, snapshotAfterDestroy, 'getState() must still return the exact same snapshot reference');
  } finally {
    unsubscribe();

    controller.destroy();

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