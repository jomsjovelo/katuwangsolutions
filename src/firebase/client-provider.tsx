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
    const { app, db, auth } = initializeFirebase();
    setServices({ app, db, auth });
  }, []);

  // During SSR (Server Side Rendering), services will be null.
  // We MUST render the children so the server-rendered HTML matches the structure.
  // The Firebase context will be provided with undefined values initially, 
  // which will be updated once hydration completes and the services are initialized.
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
