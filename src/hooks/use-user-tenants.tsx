'use client';

import { useUser } from '@/firebase/auth/use-user';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { Tenant } from '@/store/use-tenant-store';
import { useEffect } from 'react';
import { useTenantStore } from '@/store/use-tenant-store';

export function useUserTenants() {
  const { user, loading: userLoading } = useUser();
  const db = useFirestore();
  const setAllTenants = useTenantStore((state) => state.setAllTenants);
  const setLoading = useTenantStore((state) => state.setLoading);

  const ownerQuery = user && db 
    ? query(
        collection(db, 'tenants'), 
        where('ownerUid', '==', user.uid),
        orderBy('createdAt', 'desc')
      )
    : null;

  const staffQuery = user && db 
    ? query(
        collection(db, 'tenants'), 
        where('staffUids', 'array-contains', user.uid),
        orderBy('createdAt', 'desc')
      )
    : null;

  const { data: ownerTenants, loading: ownerLoading, error: ownerError } = useCollection<Tenant>(ownerQuery as any);
  const { data: staffTenants, loading: staffLoading, error: staffError } = useCollection<Tenant>(staffQuery as any);

  // Merge, deduplicate, and sort tenants
  const merged = [...ownerTenants, ...staffTenants];
  const uniqueTenants = Array.from(new Map(merged.map(t => [t.id, t])).values());
  
  // Sort by createdAt desc
  uniqueTenants.sort((a, b) => {
    const timeA = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
    const timeB = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
    return timeB - timeA;
  });

  const loading = userLoading || ownerLoading || staffLoading;
  const error = ownerError || staffError;

  useEffect(() => {
    if (!loading) {
      setAllTenants(uniqueTenants);
      setLoading(false);
    }
  }, [uniqueTenants, loading, setAllTenants, setLoading]);

  return { tenants: uniqueTenants, loading, error };
}
