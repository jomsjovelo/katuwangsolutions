import test from 'node:test';
import assert from 'node:assert/strict';

import { OrderSnapController } from '../../src/lib/order-snap/order-snap-controller';
import { OrderSnapOutboxDB } from '../../src/lib/order-snap/order-snap-outbox-db';
import { createMockIndexedDB } from '../test-indexeddb-mock';
import {
  EstablishAuthorityParams,
  EstablishAuthorityResult,
  OrderSnapAuthorityManager,
  RestoreOfflineAuthoritySafeParams,
  RestoreOfflineAuthoritySafeResult,
} from '../../src/lib/order-snap/order-snap-authority-manager';
import {
  OrderSnapSyncCoordinatorFactory,
} from '../../src/lib/order-snap/order-snap-controller';

function createController(): OrderSnapController {
  return new OrderSnapController({
    tenantId: 'tenant_controller_test',
    authUid: 'firebase_uid_selector_only',
    getIdToken: async () => null,
  });
}

class SuccessfulAuthorityManager extends OrderSnapAuthorityManager {
  establishCallCount = 0;

  override async establishOnlineAuthority(
    params: EstablishAuthorityParams
  ): Promise<EstablishAuthorityResult> {
    this.establishCallCount += 1;

    const nowSeconds = Math.floor(Date.now() / 1000);

    return {
      success: true,
      state: 'online-authorized',
      session: Object.freeze({
        grantId: 'grant_controller_test',
        moduleId: 'order-snap',
        tenantId: params.tenantId,
        staffAccountId: 'staff_verified_from_authority',
        actorId: 'staff_staff_verified_from_authority',
        authUid: 'firebase_uid_selector_only',
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

class CapturingOfflineAuthorityManager extends OrderSnapAuthorityManager {
  receivedParams: RestoreOfflineAuthoritySafeParams | null = null;

  override async restoreOfflineAuthoritySafe(
    params: RestoreOfflineAuthoritySafeParams
  ): Promise<RestoreOfflineAuthoritySafeResult> {
    this.receivedParams = Object.freeze({ ...params });

    const nowSeconds = Math.floor(Date.now() / 1000);

    return {
      success: true,
      state: 'offline-locked',
      session: Object.freeze({
        grantId: 'grant_offline_controller_test',
        moduleId: 'order-snap',
        tenantId: params.tenantId,
        staffAccountId: 'staff_verified_offline',
        actorId: 'staff_staff_verified_offline',
        authUid: params.authUid,
        sessionVersion: 1,
        role: 'cashier',
        displayName: 'Verified Offline Cashier',
        deviceId: params.deviceId,
        catalogVersion: params.currentCatalogVersion,
        issuedAt: nowSeconds,
        expiresAt: nowSeconds + 3600,
        allowedTenders: ['cash'] as const,
        isLocalLocked: true,
      }),
    };
  }
}

test('getState returns a stable immutable snapshot', () => {
  const controller = createController();

  try {
    const first = controller.getState();
    const second = controller.getState();

    assert.strictEqual(second, first);
    assert.equal(Object.isFrozen(first), true);

    const serialized = JSON.stringify(first);

    for (const forbiddenField of [
      'authorityCertificate',
      'authorityGrant',
      'credentialPublicKey',
      'idToken',
      'signatureBase64Url',
    ]) {
      assert.equal(serialized.includes(forbiddenField), false);
    }
  } finally {
    controller.destroy();
  }
});

test('a public notification boundary replaces the cached snapshot once', () => {
  const controller = createController();
  let notificationCount = 0;

  const unsubscribe = controller.subscribe(() => {
    notificationCount += 1;
  });

  try {
    const before = controller.getState();

    controller.clearAuthority();

    const after = controller.getState();
    const repeated = controller.getState();

    assert.notStrictEqual(after, before);
    assert.strictEqual(repeated, after);
    assert.equal(Object.isFrozen(after), true);
    assert.equal(notificationCount, 1);
  } finally {
    unsubscribe();
    controller.destroy();
  }
});

test('concurrent initialize calls share one initialization', async () => {
  const outboxDB = new OrderSnapOutboxDB(createMockIndexedDB());

  let tokenCallCount = 0;
  let releaseToken!: (value: string | null) => void;

  const deferredToken = new Promise<string | null>((resolve) => {
    releaseToken = resolve;
  });

  const controller = new OrderSnapController({
    tenantId: 'tenant_initialize_test',
    authUid: 'firebase_uid_selector_only',
    outboxDB,
    getIdToken: () => {
      tokenCallCount += 1;
      return deferredToken;
    },
  });

  try {
    const firstInitialization = controller.initialize();
    const secondInitialization = controller.initialize();

    for (let attempt = 0; attempt < 20 && tokenCallCount === 0; attempt += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1);
      });
    }

    assert.equal(tokenCallCount, 1);

    releaseToken(null);

    await Promise.all([
      firstInitialization,
      secondInitialization,
    ]);

    assert.equal(tokenCallCount, 1);
    assert.equal(controller.getState().authorityState, 'unauthorized');
  } finally {
    controller.destroy();
  }
});

test('repeated initialization creates one sync coordinator', async () => {
  const tenantId = 'tenant_coordinator_test';
  const catalogVersion = 'catalog_coordinator_test';

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

  const authorityManager = new SuccessfulAuthorityManager(outboxDB);

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

  const controller = new OrderSnapController({
    tenantId,
    authUid: 'firebase_uid_selector_only',
    outboxDB,
    authorityManager,
    syncCoordinatorFactory,
    getIdToken: async () => 'test_id_token',
  });

  try {
    await Promise.all([
      controller.initialize(),
      controller.initialize(),
    ]);

    await controller.initialize();

    assert.equal(authorityManager.establishCallCount, 1);
    assert.equal(coordinatorCreateCount, 1);
    assert.equal(
      controller.getState().authorityState,
      'online-authorized'
    );
  } finally {
    controller.destroy();
  }

  assert.equal(coordinatorDestroyCount, 1);
});

test('destroy removes the exact browser listeners once', async () => {
  type Listener = EventListenerOrEventListenerObject;

  const originalWindowDescriptor =
    Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalNavigatorDescriptor =
    Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  const addedListeners = new Map<string, Listener[]>();
  const removedListeners = new Map<string, Listener[]>();

  const recordListener = (
    target: Map<string, Listener[]>,
    type: string,
    listener: Listener
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
        listener: Listener
      ): void => {
        recordListener(addedListeners, type, listener);
      },
      removeEventListener: (
        type: string,
        listener: Listener
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

  const controller = new OrderSnapController({
    tenantId: 'tenant_listener_test',
    authUid: 'firebase_uid_selector_only',
    outboxDB,
    getIdToken: async () => null,
  });

  try {
    await Promise.all([
      controller.initialize(),
      controller.initialize(),
    ]);

    const addedOnline = addedListeners.get('online') ?? [];
    const addedOffline = addedListeners.get('offline') ?? [];

    assert.equal(addedOnline.length, 1);
    assert.equal(addedOffline.length, 1);

    controller.destroy();
    controller.destroy();

    const removedOnline = removedListeners.get('online') ?? [];
    const removedOffline = removedListeners.get('offline') ?? [];

    assert.equal(removedOnline.length, 1);
    assert.equal(removedOffline.length, 1);

    assert.strictEqual(removedOnline[0], addedOnline[0]);
    assert.strictEqual(removedOffline[0], addedOffline[0]);
  } finally {
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

test('online authority identity is copied only from the authority result', async () => {
  const tenantId = 'tenant_identity_test';
  const catalogVersion = 'catalog_identity_test';
  const firebaseUid = 'firebase_uid_selector_only';
  const staffAccountId = 'staff_verified_from_authority';

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

  const authorityManager = new SuccessfulAuthorityManager(outboxDB);

  const syncCoordinatorFactory: OrderSnapSyncCoordinatorFactory = () => {
    return {
      destroy: () => {},
      triggerSync: () => {},
    };
  };

  const controller = new OrderSnapController({
    tenantId,
    authUid: firebaseUid,
    outboxDB,
    authorityManager,
    syncCoordinatorFactory,
    getIdToken: async () => 'test_id_token',
  });

  try {
    await controller.initialize();

    const state = controller.getState();

    assert.equal(state.authorityState, 'online-authorized');
    assert.ok(state.session !== null, 'session should exist');

    const session = state.session!;

    assert.equal(session.authUid, firebaseUid, 'authUid should match Firebase UID selector');
    assert.equal(session.staffAccountId, staffAccountId, 'staffAccountId should come from authority result');
    assert.notEqual(session.staffAccountId, firebaseUid, 'staffAccountId must not equal Firebase UID');
    assert.equal(session.actorId, 'staff_staff_verified_from_authority', 'actorId should come from authority result');
    assert.equal(session.role, 'cashier', 'role should come from authority result');
    assert.equal(session.displayName, 'Verified Cashier', 'displayName should come from authority result');
  } finally {
    controller.destroy();
  }
});

test('offline restoration receives selector inputs and remains locked', async () => {
  type Listener = EventListenerOrEventListenerObject;

  const originalWindowDescriptor =
    Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalNavigatorDescriptor =
    Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  const addedListeners = new Map<string, Listener[]>();
  const removedListeners = new Map<string, Listener[]>();

  const recordListener = (
    target: Map<string, Listener[]>,
    type: string,
    listener: Listener
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
        listener: Listener
      ): void => {
        recordListener(addedListeners, type, listener);
      },
      removeEventListener: (
        type: string,
        listener: Listener
      ): void => {
        recordListener(removedListeners, type, listener);
      },
    },
  });

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      onLine: false,
    },
  });

  const outboxDB = new OrderSnapOutboxDB(createMockIndexedDB());

  const tenantId = 'tenant_offline_restore_test';
  const catalogVersion = 'catalog_offline_restore_test';

  await outboxDB.saveCatalogSnapshot({
    tenantId,
    catalogVersion,
    syncedAt: new Date(0).toISOString(),
    menuItems: [],
    recipes: [],
    modifierGroups: [],
    ingredients: [],
  });

  const authorityManager = new CapturingOfflineAuthorityManager(outboxDB);

  const syncCoordinatorFactory: OrderSnapSyncCoordinatorFactory = () => {
    return {
      destroy: () => {},
      triggerSync: () => {},
    };
  };

  let tokenCallCount = 0;

  const controller = new OrderSnapController({
    tenantId,
    authUid: 'firebase_offline_selector',
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

    assert.equal(tokenCallCount, 0, 'token-provider call count is zero because startup is offline');

    const receivedParams = authorityManager.receivedParams;
    assert.ok(receivedParams !== null, 'receivedParams is not null');

    assert.equal(receivedParams.tenantId, tenantId, 'received tenantId matches');
    assert.ok(receivedParams.deviceId && receivedParams.deviceId.length > 0, 'received deviceId is nonempty');
    assert.equal(receivedParams.currentCatalogVersion, catalogVersion, 'received currentCatalogVersion matches');
    assert.equal(receivedParams.authUid, 'firebase_offline_selector', 'received authUid equals firebase_offline_selector');

    const state = controller.getState();

    assert.equal(state.authorityState, 'offline-locked', 'controller authority state is offline-locked');
    assert.ok(state.session !== null, 'controller session exists');

    const session = state.session!;
    assert.equal(session.isLocalLocked, true, 'session.isLocalLocked is true');
    assert.equal(session.staffAccountId, 'staff_verified_offline', 'session.staffAccountId is staff_verified_offline');
    assert.notEqual(session.staffAccountId, 'firebase_offline_selector', 'session.staffAccountId is not equal to the Firebase UID');
  } finally {
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