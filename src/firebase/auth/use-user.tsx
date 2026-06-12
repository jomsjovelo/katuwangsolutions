'use client';

import { useState, useEffect } from 'react';
import { User, onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { useAuth } from '../provider';

export function useUser() {
  const auth = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [auth]);

  // Process redirect result exactly once on mount (e.g. after Google sign-in redirect)
  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth).catch((err) => {
      // Only log actual errors, not the expected null result
      if (err?.code !== 'auth/null-user') {
        console.error('Redirect Auth Error:', err);
      }
    });
    // Empty dep array: run once per auth instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, loading };
}

