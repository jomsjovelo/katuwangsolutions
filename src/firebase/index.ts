'use client';

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { firebaseConfig } from './config';

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

export function initializeFirebase() {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);

    // FIX S2-1: Migrate from deprecated enableMultiTabIndexedDbPersistence (removed in Firebase v10+)
    // to initializeFirestore with persistentLocalCache + persistentMultipleTabManager.
    // This ensures offline IndexedDB persistence works correctly on Firebase ^11.9.1.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });

  } else {
    app = getApps()[0];
    // FIX S2-2: Always use initializeFirestore — never getFirestore() after persistentLocalCache init
    // getFirestore() would return a different instance without the persistence config
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
    auth = getAuth(app);
  }

  return { app, db, auth };
}

export { FirebaseProvider, useFirebase, useFirebaseApp, useFirestore, useAuth } from './provider';
export { FirebaseClientProvider } from './client-provider';
export { useUser } from './auth/use-user';
export { useCollection } from './firestore/use-collection';
export { useDoc } from './firestore/use-doc';
export { createConverter } from './firestore/converter';
