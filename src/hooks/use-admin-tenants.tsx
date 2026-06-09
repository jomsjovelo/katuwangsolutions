import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, getDocs, writeBatch } from 'firebase/firestore';
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

  const annihilateTenant = async (id: string) => {
    try {
      const { db } = initializeFirebase();
      
      // We must delete subcollections first to avoid orphaned data
      const productsSnap = await getDocs(collection(db, 'tenants', id, 'products'));
      const transactionsSnap = await getDocs(collection(db, 'tenants', id, 'transactions'));
      const invTransSnap = await getDocs(collection(db, 'tenants', id, 'inventory_transactions'));
      const invAuditsSnap = await getDocs(collection(db, 'tenants', id, 'inventory_audits'));

      const allDocs = [
        ...productsSnap.docs,
        ...transactionsSnap.docs,
        ...invTransSnap.docs,
        ...invAuditsSnap.docs
      ];

      // Execute batched deletes in chunks of 450 (Firestore limit is 500)
      const chunks = [];
      for (let i = 0; i < allDocs.length; i += 450) {
        chunks.push(allDocs.slice(i, i + 450));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // Finally, delete the parent tenant document
      const tenantRef = doc(db, 'tenants', id);
      const finalBatch = writeBatch(db);
      finalBatch.delete(tenantRef);
      await finalBatch.commit();

    } catch (err) {
      console.error('Failed to annihilate tenant:', err);
      throw err;
    }
  };

  return { tenants, loading, error, updateTenantStatus, updateTenantPricing, annihilateTenant };
}
