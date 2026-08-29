import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { firebaseConfig } from '../src/firebase/config';

firebaseConfig.apiKey = 'AIzaSyDemoFakeKey1234567890';
firebaseConfig.projectId = 'demo-katuwang-persistence-test';

import {
  isFirestorePersistenceActive,
  initFirestoreCacheStrategy,
  handleHmrFirestoreState,
  initializeFirebase
} from '../src/firebase/index';
import { deleteApp, getApps, initializeApp } from 'firebase/app';

describe('Firestore Persistence Marker and Lifecycle State Machine', () => {
  beforeEach(async () => {
    for (const app of getApps()) {
      await deleteApp(app);
    }
    delete (globalThis as any).window;
  });

  afterEach(async () => {
    for (const app of getApps()) {
      await deleteApp(app);
    }
    delete (globalThis as any).window;
  });

  test('isFirestorePersistenceActive returns false when window is undefined (Node environment)', () => {
    assert.strictEqual(isFirestorePersistenceActive(), false);
  });

  test('isFirestorePersistenceActive resolves to false when marker is absent or unknown', () => {
    (globalThis as any).window = {};
    assert.strictEqual(isFirestorePersistenceActive(), false);

    (globalThis as any).window = { __katuwang_firestore_persistence_active: undefined };
    assert.strictEqual(isFirestorePersistenceActive(), false);
  });

  test('persistent-cache initialization success sets window marker to true via actual initialization logic', () => {
    const mockWindow: { __katuwang_firestore_persistence_active?: boolean } = {};
    const mockApp = { name: 'test-app' } as any;
    const mockFirestoreInstance = { type: 'firestore' } as any;

    let initCallCount = 0;
    const mockInitializeFirestore = (_app: any, settings: any) => {
      initCallCount++;
      return mockFirestoreInstance;
    };

    const result = initFirestoreCacheStrategy(mockApp, {
      initializeFirestoreFn: mockInitializeFirestore as any,
      targetWindow: mockWindow as any
    });

    assert.strictEqual(initCallCount, 1);
    assert.strictEqual(result.isPersistent, true);
    assert.strictEqual(mockWindow.__katuwang_firestore_persistence_active, true);
  });

  test('persistent-cache failure followed by memory fallback sets window marker to false', () => {
    const mockWindow: { __katuwang_firestore_persistence_active?: boolean } = {};
    const mockApp = { name: 'test-app' } as any;
    const mockMemoryFirestoreInstance = { type: 'memory-firestore' } as any;

    let initCallCount = 0;
    const mockInitializeFirestore = (_app: any, settings: any) => {
      initCallCount++;
      if (initCallCount === 1) {
        // First call fails (e.g. IndexedDB unavailable)
        throw new Error('IndexedDB unavailable');
      }
      // Second call (memory fallback) succeeds
      return mockMemoryFirestoreInstance;
    };

    const result = initFirestoreCacheStrategy(mockApp, {
      initializeFirestoreFn: mockInitializeFirestore as any,
      targetWindow: mockWindow as any
    });

    assert.strictEqual(initCallCount, 2, 'Must attempt persistent cache then fall back to memory cache');
    assert.strictEqual(result.isPersistent, false);
    assert.strictEqual(mockWindow.__katuwang_firestore_persistence_active, false);
  });

  test('HMR / reload logic preserves an established true marker', () => {
    const mockWindow: { __katuwang_firestore_persistence_active?: boolean } = {
      __katuwang_firestore_persistence_active: true
    };
    const mockApp = { name: 'test-app' } as any;
    const mockExistingFirestore = { type: 'existing-firestore' } as any;

    const mockGetFirestore = (_app: any) => mockExistingFirestore;

    const result = handleHmrFirestoreState(mockApp, {
      getFirestoreFn: mockGetFirestore as any,
      targetWindow: mockWindow as any
    });

    assert.strictEqual(result.isPersistent, true);
    assert.strictEqual(mockWindow.__katuwang_firestore_persistence_active, true, 'HMR must preserve true marker');
  });

  test('HMR / reload logic with missing marker fails closed to false', () => {
    const mockWindow: { __katuwang_firestore_persistence_active?: boolean } = {};
    const mockApp = { name: 'test-app' } as any;
    const mockExistingFirestore = { type: 'existing-firestore' } as any;

    const mockGetFirestore = (_app: any) => mockExistingFirestore;

    const result = handleHmrFirestoreState(mockApp, {
      getFirestoreFn: mockGetFirestore as any,
      targetWindow: mockWindow as any
    });

    assert.strictEqual(result.isPersistent, false);
    assert.strictEqual(mockWindow.__katuwang_firestore_persistence_active, false, 'Missing marker on HMR must fail closed to false');
  });

  test('initializeFirebase sets window marker via injected initialization dependencies', () => {
    (globalThis as any).window = {
      location: { hostname: 'localhost' }
    };

    const mockFirestoreInstance = { type: 'mock-firestore' } as any;
    const mockInitializeFirestore = () => mockFirestoreInstance;

    initializeFirebase({
      initializeFirestoreFn: mockInitializeFirestore as any
    });

    assert.strictEqual((globalThis as any).window.__katuwang_firestore_persistence_active, true);
    assert.strictEqual(isFirestorePersistenceActive(), true);
  });
});
