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
  }, []);

  // During initial render (SSR and first hydration), we render the provider
  // with undefined values. The provider handles this gracefully.
  return (
    <FirebaseProvider 
      app={services?.app as any} 
      db={services?.db as any} 
      auth={services?.auth as any}
    >
      {children}
    </FirebaseProvider>
  );
}
