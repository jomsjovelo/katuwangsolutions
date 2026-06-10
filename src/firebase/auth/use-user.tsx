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

    // Explicitly process the redirect result to ensure Firebase finalizes the login
    getRedirectResult(auth).then((result) => {
      console.log("Redirect Auth Result:", result);
      if (result?.user) {
        console.log("Successfully caught redirect user:", result.user.email);
      }
    }).catch((err) => {
      console.error("Redirect Auth Error:", err);
    });

    return () => unsubscribe();
  }, [auth]);

  return { user, loading };
}
