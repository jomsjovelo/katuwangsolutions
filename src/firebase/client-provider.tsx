'use client';

import React, { useEffect, useState } from 'react';
import { initializeFirebase } from './index';
import { FirebaseProvider } from './provider';
import { FirebaseApp } from 'firebase/app';
import { Firestore } from 'firebase/firestore';
import { Auth } from 'firebase/auth';

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  const [services, setServices] = useState<{
    app: FirebaseApp;
    db: Firestore;
    auth: Auth;
  } | null>(null);

  useEffect(() => {
    // Only initialize on the client
    const { app, db, auth } = initializeFirebase();
    setServices({ app, db, auth });

    // Register mobile PWA Service Worker for offline boot support in production ONLY
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
              console.log('Katuwang PWA: Service Worker registered successfully scope:', registration.scope);
            })
            .catch((err) => {
              console.warn('Katuwang PWA: Service Worker registration failed:', err);
            });
        });
      } else {
        // In development mode, unregister any active service worker to prevent stale asset caching
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
      }
    }
  }, []);

  // During initial render (SSR and first hydration), we render the provider
  // with undefined values. The provider handles this gracefully.
  return (
    <FirebaseProvider 
      app={services?.app as FirebaseApp} 
      db={services?.db as Firestore} 
      auth={services?.auth as Auth}
    >
      {children}
    </FirebaseProvider>
  );
}
