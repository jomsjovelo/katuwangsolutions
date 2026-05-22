import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { Tenant, SubscriptionStatus, PricingTier } from '@/store/use-tenant-store';

export function useAdminTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { db } = initializeFirebase();
    const tenantsRef = collection(db, 'tenants');

    const unsubscribe = onSnapshot(tenantsRef, 
      (snapshot) => {
        const tenantData: Tenant[] = [];
        snapshot.forEach((doc) => {
          tenantData.push({ id: doc.id, ...doc.data() } as Tenant);
        });
        setTenants(tenantData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching admin tenants:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const updateTenantStatus = async (id: string, status: SubscriptionStatus) => {
    try {
      const { db } = initializeFirebase();
      const tenantRef = doc(db, 'tenants', id);
      await updateDoc(tenantRef, { subscriptionStatus: status });
    } catch (err) {
      console.error('Failed to update tenant status:', err);
      throw err;
    }
  };

  const updateTenantPricing = async (id: string, tier: PricingTier) => {
    try {
      const { db } = initializeFirebase();
      const tenantRef = doc(db, 'tenants', id);
      await updateDoc(tenantRef, { pricingTier: tier });
    } catch (err) {
      console.error('Failed to update tenant pricing:', err);
      throw err;
    }
  };

  return { tenants, loading, error, updateTenantStatus, updateTenantPricing };
}
