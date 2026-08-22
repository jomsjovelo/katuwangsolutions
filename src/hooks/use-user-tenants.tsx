'use client';

import { useEffect, useMemo } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { Tenant } from '@/store/use-tenant-store';
import { useTenantStore } from '@/store/use-tenant-store';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';

export function useUserTenants() {
  const { user, loading: userLoading } = useUser();
  const db = useFirestore();
  const isCashier = useSecureCashierStore(state => state.isCashierAuthenticated);

  const ownerQuery = useMemo(() => {
    return user && db && !isCashier
      ? query(collection(db, 'tenants'), where('ownerUid', '==', user.uid))
      : null;
  }, [user?.uid, db, isCashier]);

  const staffQuery = useMemo(() => {
    return user && db && !isCashier
      ? query(collection(db, 'tenants'), where('staffUids', 'array-contains', user.uid))
      : null;
  }, [user?.uid, db, isCashier]);

  const { data: ownerTenants, loading: ownerLoading } = useCollection<Tenant>(ownerQuery as any);
  const { data: staffTenants, loading: staffLoading, error } = useCollection<Tenant>(staffQuery as any);

  const loading = isCashier ? false : (userLoading || ownerLoading || staffLoading);

  // Memoize the merged/deduped/sorted tenant list
  const uniqueTenants = useMemo(() => {
    if (isCashier) return [];
    const merged = [...ownerTenants, ...staffTenants];
    const deduped = Array.from(new Map(merged.map(t => [t.id, t])).values());
    deduped.sort((a, b) => {
      const timeA = (a.createdAt as any)?.seconds ?? 0;
      const timeB = (b.createdAt as any)?.seconds ?? 0;
      return timeB - timeA;
    });
    return deduped;
  }, [ownerTenants, staffTenants, isCashier]);

  const hasActiveTenant = !!useTenantStore(state => state.activeTenant);

  useEffect(() => {
    if (isCashier) return;
    if (loading) {
      if (hasActiveTenant) {
        useTenantStore.getState().setLoading(false);
      }
      return;
    }
    const { setAllTenants, setLoading } = useTenantStore.getState();
    setAllTenants(uniqueTenants);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, uniqueTenants, isCashier, hasActiveTenant]);

  if (isCashier) {
    return { tenants: [], loading: false, error: null };
  }

  return { tenants: uniqueTenants, loading: hasActiveTenant ? false : loading, error };
}
