'use client';

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
  Firestore
} from 'firebase/firestore';
import { getAuth, Auth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { firebaseConfig } from './config';

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

export function initializeFirebase() {
  if (getApps().length === 0) {
    // First call: initialize the Firebase app and Firestore with offline persistence.
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    setPersistence(auth, browserLocalPersistence).catch(console.error);
    db = initializeFirestore(app, {
      // Using memoryLocalCache prevents IndexedDB corruption crashes 
      // during Next.js Fast Refresh and testing multiple accounts.
      localCache: memoryLocalCache()
    });
  } else {
    // Subsequent calls: the app and Firestore are already initialized.
    // We MUST use getFirestore() here — calling initializeFirestore() again
    // throws a fatal "settings can no longer be changed" error and crashes the app.
    app = getApps()[0];
    db = getFirestore(app);
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
