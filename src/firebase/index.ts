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
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    
    // We wrap browser APIs in a try/catch or typeof window check to prevent SSR crashes
    if (typeof window !== 'undefined') {
      setPersistence(auth, browserLocalPersistence).catch(console.error);
      
      // Use memoryLocalCache to completely bypass any corrupted IndexedDB state in the browser
      db = initializeFirestore(app, {
        localCache: memoryLocalCache()
      });
    } else {
      // On the server, we just use the default Firestore instance
      db = getFirestore(app);
    }
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
