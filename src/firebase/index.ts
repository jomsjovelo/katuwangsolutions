'use client';

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator
} from 'firebase/firestore';
import { getAuth, Auth, setPersistence, browserLocalPersistence, connectAuthEmulator } from 'firebase/auth';
import { firebaseConfig } from './config';

declare global {
  interface Window {
    __katuwang_firestore_persistence_active?: boolean;
  }
}

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let emulatorsConnected = false;

function parseLoopbackEmulatorEndpoint(value: string, label: string): { host: string; port: number } {
  const match = /^(127\.0\.0\.1|localhost):(\d{1,5})$/.exec(value);
  const port = match ? Number.parseInt(match[2], 10) : 0;
  if (!match || port < 1 || port > 65535) {
    throw new Error(`[SECURITY_FAIL_CLOSED] Invalid ${label} emulator endpoint.`);
  }
  return { host: match[1], port };
}

export function isFirestorePersistenceActive(): boolean {
  if (typeof window !== 'undefined') {
    return window.__katuwang_firestore_persistence_active ?? false;
  }
  return false;
}

function connectClientEmulators(authInstance: Auth, dbInstance: Firestore) {
  if (emulatorsConnected) return;
  const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
  if (useEmulator) {
    const isNode = typeof window === 'undefined';
    const isLoopback = isNode || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isDemoProject = typeof firebaseConfig.projectId === 'string' && firebaseConfig.projectId.startsWith('demo-');

    if (!isLoopback || !isDemoProject) {
      throw new Error(
        `[SECURITY_FAIL_CLOSED] Emulator mode refused: Hostname '${isNode ? 'node' : window.location.hostname}' or Project ID '${firebaseConfig.projectId}' violates emulator isolation requirements. Project ID must start with 'demo-'.`
      );
    }

    try {
      const authEndpoint = parseLoopbackEmulatorEndpoint(
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099',
        'Auth'
      );
      const firestoreEndpoint = parseLoopbackEmulatorEndpoint(
        process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080',
        'Firestore'
      );
      connectAuthEmulator(authInstance, `http://${authEndpoint.host}:${authEndpoint.port}`, { disableWarnings: true });
      connectFirestoreEmulator(dbInstance, firestoreEndpoint.host, firestoreEndpoint.port);
      emulatorsConnected = true;
      console.info(
        `[FIREBASE_EMULATOR] Connected client SDKs to local Auth (${authEndpoint.port}) and Firestore (${firestoreEndpoint.port}).`
      );
    } catch (err: any) {
      if (!err.message?.includes('already been called') && !err.message?.includes('already started')) {
        console.error('[FIREBASE_EMULATOR] Failed connecting to local emulators:', err);
        throw err;
      }
      emulatorsConnected = true;
    }
  }
}

export interface FirestoreCacheInitDeps {
  initializeFirestoreFn?: typeof initializeFirestore;
  getFirestoreFn?: typeof getFirestore;
  persistentCacheFactory?: () => any;
  memoryCacheFactory?: () => any;
  targetWindow?: (Window & typeof globalThis) | { __katuwang_firestore_persistence_active?: boolean };
}

export function initFirestoreCacheStrategy(
  appInstance: FirebaseApp,
  deps: FirestoreCacheInitDeps = {}
): { db: Firestore; isPersistent: boolean } {
  const initFn = deps.initializeFirestoreFn || initializeFirestore;
  const getFn = deps.getFirestoreFn || getFirestore;
  const persistentFactory = deps.persistentCacheFactory || (() => persistentLocalCache({ tabManager: persistentMultipleTabManager() }));
  const memoryFactory = deps.memoryCacheFactory || (() => memoryLocalCache());
  const win = deps.targetWindow !== undefined ? deps.targetWindow : (typeof window !== 'undefined' ? window : undefined);

  let dbInstance: Firestore;
  let isPersistent = false;

  try {
    dbInstance = initFn(appInstance, {
      localCache: persistentFactory()
    });
    isPersistent = true;
    if (win) {
      win.__katuwang_firestore_persistence_active = true;
    }
  } catch (err) {
    console.warn('[FIRESTORE_CACHE] Failed to initialize persistentLocalCache (multi-tab/IndexedDB), falling back to memoryLocalCache:', err);
    try {
      dbInstance = initFn(appInstance, {
        localCache: memoryFactory()
      });
    } catch {
      dbInstance = getFn(appInstance);
    }
    isPersistent = false;
    if (win) {
      win.__katuwang_firestore_persistence_active = false;
    }
  }

  return { db: dbInstance, isPersistent };
}

export function handleHmrFirestoreState(
  appInstance: FirebaseApp,
  deps: FirestoreCacheInitDeps = {}
): { db: Firestore; isPersistent: boolean } {
  const getFn = deps.getFirestoreFn || getFirestore;
  const win = deps.targetWindow !== undefined ? deps.targetWindow : (typeof window !== 'undefined' ? window : undefined);

  let dbInstance: Firestore;
  let isPersistent = false;

  try {
    dbInstance = getFn(appInstance);
    if (win) {
      if (win.__katuwang_firestore_persistence_active === undefined) {
        win.__katuwang_firestore_persistence_active = false;
      }
      isPersistent = win.__katuwang_firestore_persistence_active === true;
    }
  } catch {
    return initFirestoreCacheStrategy(appInstance, deps);
  }

  return { db: dbInstance, isPersistent };
}

export function initializeFirebase(deps?: FirestoreCacheInitDeps) {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);

    const cacheResult = initFirestoreCacheStrategy(app, deps);
    db = cacheResult.db;

    connectClientEmulators(auth, db);

    if (typeof window !== 'undefined') {
      setPersistence(auth, browserLocalPersistence).catch(console.error);
    }
  } else {
    app = getApps()[0];
    const hmrResult = handleHmrFirestoreState(app, deps);
    db = hmrResult.db;
    auth = getAuth(app);
    connectClientEmulators(auth, db);
  }

  return { app, db, auth };
}

export { FirebaseProvider, useFirebase, useFirebaseApp, useFirestore, useAuth } from './provider';
export { FirebaseClientProvider } from './client-provider';
export { useUser } from './auth/use-user';
export { useCollection } from './firestore/use-collection';
export { useDoc } from './firestore/use-doc';
export { createConverter } from './firestore/converter';
