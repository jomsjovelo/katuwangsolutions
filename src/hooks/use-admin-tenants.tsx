import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc, updateDoc, getDocs, writeBatch, serverTimestamp, addDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';
import { Tenant, SubscriptionStatus, PricingTier } from '@/store/use-tenant-store';

export interface AdminTenant extends Tenant {
  ownerEmail?: string;
}

export function useAdminTenants() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { db } = initializeFirebase();
    const tenantsRef = collection(db, 'tenants');

    const unsubscribeTenants = onSnapshot(tenantsRef, 
      (snapshot) => {
        const tenantData: AdminTenant[] = [];
        snapshot.forEach((doc) => {
          tenantData.push({ id: doc.id, ...doc.data() } as AdminTenant);
        });
        
        // After getting tenants, fetch ONLY the users who are owners to map emails
        const ownerUids = Array.from(new Set(tenantData.map(t => t.ownerUid)));
        
        Promise.all(ownerUids.map(uid => getDoc(doc(db, 'users', uid))))
          .then((userDocs) => {
            const userEmails: Record<string, string> = {};
            userDocs.forEach(uSnap => {
              if (uSnap.exists()) {
                const data = uSnap.data();
                if (data.email) userEmails[uSnap.id] = data.email;
              }
            });
            
            const enrichedTenants = tenantData.map(t => ({
              ...t,
              ownerEmail: userEmails[t.ownerUid] || 'Unknown Email'
            }));
            
            setTenants(enrichedTenants);
            setLoading(false);
            setError(null);
          })
          .catch(err => {
            console.error("Error fetching users for admin:", err);
            setTenants(tenantData);
            setLoading(false);
          });
      },
      (err) => {
        console.error('Error fetching admin tenants:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribeTenants();
  }, []);

  const updateTenantStatus = async (tenant: AdminTenant, status: SubscriptionStatus) => {
    try {
      const { db } = initializeFirebase();
      const auth = getAuth();
      const adminUser = auth.currentUser;
      const tenantRef = doc(db, 'tenants', tenant.id);
      
      const batch = writeBatch(db);
      batch.update(tenantRef, { subscriptionStatus: status });
      
      // If approving from pending, write a billing log and process referral
      if (tenant.subscriptionStatus === 'pending' && status === 'active') {
        const amount = tenant.pricingTier === 'promo_99' ? 99 : tenant.pricingTier === 'standard_199' ? 199 : 499;
        const logRef = doc(collection(db, 'billing_logs'));
        batch.set(logRef, {
          tenantId: tenant.id,
          tenantName: tenant.name,
          pricingTier: tenant.pricingTier,
          amount: amount,
          type: 'activation',
          timestamp: serverTimestamp()
        });

        // Process referral
        const anyTenant = tenant as any;
        if (anyTenant.referredBy && !anyTenant.referralPaid) {
          const { query, where, increment } = await import('firebase/firestore');
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('referralCode', '==', anyTenant.referredBy));
          const qSnap = await getDocs(q);
          
          if (!qSnap.empty) {
            const referrerDoc = qSnap.docs[0];
            batch.update(referrerDoc.ref, {
              referralEarnings: increment(10)
            });
            batch.update(tenantRef, {
              referralPaid: true
            });
          }
        }
      }
      
      
      if (adminUser) {
        await addDoc(collection(db, 'admin_logs'), {
          adminUid: adminUser.uid,
          adminEmail: adminUser.email || 'Unknown',
          action: 'UPDATE_TENANT_STATUS',
          details: `Changed status to ${status} for ${tenant.name}`,
          targetId: tenant.id,
          timestamp: serverTimestamp()
        });
      }

      await batch.commit();
    } catch (err) {
      console.error('Failed to update tenant status:', err);
      throw err;
    }
  };

  const updateTenantPricing = async (id: string, tier: PricingTier) => {
    try {
      const { db } = initializeFirebase();
      const auth = getAuth();
      const adminUser = auth.currentUser;
      const tenantRef = doc(db, 'tenants', id);
      await updateDoc(tenantRef, { pricingTier: tier });

      if (adminUser) {
        await addDoc(collection(db, 'admin_logs'), {
          adminUid: adminUser.uid,
          adminEmail: adminUser.email || 'Unknown',
          action: 'UPDATE_TENANT_PRICING',
          details: `Changed pricing to ${tier} for tenant ${id}`,
          targetId: id,
          timestamp: serverTimestamp()
        });
      }
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

      const auth = getAuth();
      const adminUser = auth.currentUser;
      if (adminUser) {
        await addDoc(collection(db, 'admin_logs'), {
          adminUid: adminUser.uid,
          adminEmail: adminUser.email || 'Unknown',
          action: 'ANNIHILATE_TENANT',
          details: `Permanently purged tenant ${id}`,
          targetId: id,
          timestamp: serverTimestamp()
        });
      }
    } catch (err) {
      console.error('Failed to annihilate tenant:', err);
      throw err;
    }
  };

  const updateNextBillingDate = async (id: string, date: Date | null) => {
    try {
      const { db } = initializeFirebase();
      const tenantRef = doc(db, 'tenants', id);
      await updateDoc(tenantRef, { nextBillingDate: date });
    } catch (err) {
      console.error('Failed to update billing date:', err);
      throw err;
    }
  };

  return { tenants, loading, error, updateTenantStatus, updateTenantPricing, updateNextBillingDate, annihilateTenant };
}
