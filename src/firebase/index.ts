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

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let emulatorsConnected = false;
let isPersistenceActive = false;

export function isFirestorePersistenceActive(): boolean {
  return isPersistenceActive;
}

function connectClientEmulators(authInstance: Auth, dbInstance: Firestore) {
  if (emulatorsConnected) return;
  const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
  if (useEmulator && typeof window !== 'undefined') {
    const isLoopback = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isDemoProject = typeof firebaseConfig.projectId === 'string' && firebaseConfig.projectId.startsWith('demo-');

    if (!isLoopback || !isDemoProject) {
      throw new Error(
        `[SECURITY_FAIL_CLOSED] Emulator mode refused: Hostname '${window.location.hostname}' or Project ID '${firebaseConfig.projectId}' violates emulator isolation requirements. Project ID must start with 'demo-'.`
      );
    }

    try {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080);
      emulatorsConnected = true;
      console.info('[FIREBASE_EMULATOR] Connected client SDKs to local Auth (9099) and Firestore (8080).');
    } catch (err: any) {
      if (!err.message?.includes('already been called') && !err.message?.includes('already started')) {
        console.error('[FIREBASE_EMULATOR] Failed connecting to local emulators:', err);
        throw err;
      }
      emulatorsConnected = true;
    }
  }
}

export function initializeFirebase() {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);

    // Initialize Firestore with Persistent Local Cache (IndexedDB) for web/PWA offline durability
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
      isPersistenceActive = true;
    } catch (err) {
      console.warn('[FIRESTORE_CACHE] Failed to initialize persistentLocalCache (multi-tab/IndexedDB), falling back to memoryLocalCache:', err);
      try {
        db = initializeFirestore(app, {
          localCache: memoryLocalCache()
        });
      } catch {
        db = getFirestore(app);
      }
      isPersistenceActive = false;
    }

    connectClientEmulators(auth, db);

    if (typeof window !== 'undefined') {
      setPersistence(auth, browserLocalPersistence).catch(console.error);
    }
  } else {
    app = getApps()[0];
    try {
      db = getFirestore(app);
    } catch {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    }
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
