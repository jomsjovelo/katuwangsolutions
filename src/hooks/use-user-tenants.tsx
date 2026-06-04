'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { Tenant } from '@/store/use-tenant-store';
import { useTenantStore } from '@/store/use-tenant-store';

export function useUserTenants() {
  const { user, loading: userLoading } = useUser();
  const db = useFirestore();

  const ownerQuery = useMemo(() => {
    return user && db
      ? query(collection(db, 'tenants'), where('ownerUid', '==', user.uid))
      : null;
  }, [user?.uid, db]);

  const staffQuery = useMemo(() => {
    return user && db
      ? query(collection(db, 'tenants'), where('staffUids', 'array-contains', user.uid))
      : null;
  }, [user?.uid, db]);

  const { data: ownerTenants, loading: ownerLoading } = useCollection<Tenant>(ownerQuery as any);
  const { data: staffTenants, loading: staffLoading, error } = useCollection<Tenant>(staffQuery as any);

  const loading = userLoading || ownerLoading || staffLoading;

  // Memoize the merged/deduped/sorted tenant list so its reference is stable
  const uniqueTenants = useMemo(() => {
    const merged = [...ownerTenants, ...staffTenants];
    const deduped = Array.from(new Map(merged.map(t => [t.id, t])).values());
    deduped.sort((a, b) => {
      const timeA = (a.createdAt as any)?.seconds ?? 0;
      const timeB = (b.createdAt as any)?.seconds ?? 0;
      return timeB - timeA;
    });
    return deduped;
  }, [ownerTenants, staffTenants]);

  // Track the last hash we pushed to the store so we never call setAllTenants twice for identical data
  const lastSyncedHashRef = useRef<string>('');

  useEffect(() => {
    if (loading) return;
    const hash = uniqueTenants.map(t => t.id).join(',');
    if (hash === lastSyncedHashRef.current) return;
    lastSyncedHashRef.current = hash;
    // Read actions directly from the store singleton — NOT via hook selector.
    // This way we never need to put them in the dependency array, which was
    // the direct cause of the infinite "Maximum update depth" loop.
    const { setAllTenants, setLoading } = useTenantStore.getState();
    setAllTenants(uniqueTenants);
    setLoading(false);
  // uniqueTenants reference only changes when the real Firestore data changes (memoized above)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, uniqueTenants]);

  return { tenants: uniqueTenants, loading, error };
}
