import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

export interface SystemStats {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  pendingTenants: number;
  mrr: number;
  promoCount: number;
  standardCount: number;
  enterpriseCount: number;
  focCount: number;
}

export function useAdminStats(enabled: boolean = true) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { db } = initializeFirebase();
      const tenantsRef = collection(db, 'tenants');

      // Execute extremely fast aggregation queries (Costs exactly 1 read per query regardless of collection size)
      const [
        totalSnap,
        activeSnap,
        suspendedSnap,
        pendingSnap,
        promoSnap,
        standardSnap,
        enterpriseSnap,
        focSnap
      ] = await Promise.all([
        getCountFromServer(tenantsRef),
        getCountFromServer(query(tenantsRef, where('subscriptionStatus', '==', 'active'))),
        getCountFromServer(query(tenantsRef, where('subscriptionStatus', '==', 'suspended'))),
        getCountFromServer(query(tenantsRef, where('subscriptionStatus', '==', 'pending'))),
        getCountFromServer(query(tenantsRef, where('subscriptionStatus', '==', 'active'), where('pricingTier', '==', 'promo_99'))),
        getCountFromServer(query(tenantsRef, where('subscriptionStatus', '==', 'active'), where('pricingTier', '==', 'standard_199'))),
        getCountFromServer(query(tenantsRef, where('subscriptionStatus', '==', 'active'), where('pricingTier', '==', 'enterprise'))),
        getCountFromServer(query(tenantsRef, where('subscriptionStatus', '==', 'active'), where('pricingTier', '==', 'foc')))
      ]);

      const promoCount = promoSnap.data().count;
      const standardCount = standardSnap.data().count;
      const enterpriseCount = enterpriseSnap.data().count;
      const focCount = focSnap.data().count;

      // Calculate MRR instantly based on live pricing tier counts
      // Note: We use the default prices here. In a true enterprise setup, this would pull from system config.
      const calculatedMrr = (promoCount * 99) + (standardCount * 199) + (enterpriseCount * 499) + (focCount * 0);

      setStats({
        totalTenants: totalSnap.data().count,
        activeTenants: activeSnap.data().count,
        suspendedTenants: suspendedSnap.data().count,
        pendingTenants: pendingSnap.data().count,
        mrr: calculatedMrr,
        promoCount,
        standardCount,
        enterpriseCount,
        focCount
      });
      setError(null);
    } catch (e) {
      const err = e as Error & { code?: string };
      console.error('Failed to load system stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      fetchStats();
    }
  }, [fetchStats, enabled]);

  return { stats, loading, error, refreshStats: fetchStats };
}
