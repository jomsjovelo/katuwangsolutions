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

  if (!services) return null;

  return (
    <FirebaseProvider app={services.app} db={services.db} auth={services.auth}>
      {children}
    </FirebaseProvider>
  );
}
