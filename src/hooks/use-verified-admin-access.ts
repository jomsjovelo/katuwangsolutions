import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { resolveAdminStatus } from '@/lib/auth/admin-claim-resolver';

export type AdminAccessState = 'pending' | 'allowed' | 'denied';

/**
 * Resolves Command Center access before privileged browser queries are enabled.
 * Firestore rules remain the enforcement boundary; this prevents premature and
 * noisy cross-tenant queries while authentication is still resolving.
 */
export function useVerifiedAdminAccess(
  user: User | null,
  authLoading: boolean,
): AdminAccessState {
  const [state, setState] = useState<AdminAccessState>('pending');

  useEffect(() => {
    let cancelled = false;

    if (authLoading) {
      setState('pending');
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setState('denied');
      return () => {
        cancelled = true;
      };
    }

    setState('pending');
    user.getIdTokenResult()
      .then(async (tokenResult) => {
        const { db } = initializeFirebase();
        const allowed = await resolveAdminStatus(
          tokenResult.claims,
          user.uid,
          async (uid) => {
            const snapshot = await getDoc(doc(db, 'admins', uid));
            return {
              exists: snapshot.exists(),
              data: () => snapshot.data(),
            };
          },
        );
        if (!cancelled) setState(allowed ? 'allowed' : 'denied');
      })
      .catch(() => {
        if (!cancelled) setState('denied');
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  return state;
}
