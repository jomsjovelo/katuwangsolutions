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
            if (!err.message?.includes('Missing or insufficient permissions') && err.code !== 'permission-denied') {
              console.error("Error fetching users for admin:", err);
            }
            setTenants(tenantData);
            setLoading(false);
          });
      },
      (err) => {
        if (!err.message?.includes('Missing or insufficient permissions') && err.code !== 'permission-denied') {
          console.error('Error fetching admin tenants:', err);
        }
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
      
      // If approving from pending → active: write billing log and process referral
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

        // Process referral credit
        const anyTenant = tenant as any;
        if (anyTenant.referredBy && !anyTenant.referralPaid) {
          const { query, where, increment } = await import('firebase/firestore');
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('referralCode', '==', anyTenant.referredBy));
          const qSnap = await getDocs(q);
          
          if (!qSnap.empty) {
            const totalModules = 1 + (tenant.unlockedModules?.length || 0);
            const rewardAmount = totalModules * 10;
            const referrerDoc = qSnap.docs[0];
            batch.update(referrerDoc.ref, { 
              referralEarnings: increment(rewardAmount),
              availableBalance: increment(rewardAmount)
            });
            
            const historyRef = doc(collection(db, 'users', referrerDoc.id, 'referral_history'));
            batch.set(historyRef, {
              referredTenantId: tenant.id,
              referredTenantName: tenant.name,
              referredOwnerEmail: tenant.ownerEmail || '',
              amountEarned: rewardAmount,
              type: 'activation',
              creditedAt: serverTimestamp(),
            });

            batch.update(tenantRef, { 
              referralPaid: true,
              lastReferralPaidAt: serverTimestamp()
            });
          }
        }
      }

      // If reactivating from suspended → active: write a reactivation billing log
      if (tenant.subscriptionStatus === 'suspended' && status === 'active') {
        const amount = tenant.pricingTier === 'promo_99' ? 99 : tenant.pricingTier === 'standard_199' ? 199 : 499;
        const logRef = doc(collection(db, 'billing_logs'));
        batch.set(logRef, {
          tenantId: tenant.id,
          tenantName: tenant.name,
          pricingTier: tenant.pricingTier,
          amount: amount,
          type: 'reactivation',
          timestamp: serverTimestamp()
        });

        // Process recurring referral credit on renewal
        const anyTenant = tenant as any;
        if (anyTenant.referredBy) {
          const lastPaidMillis = anyTenant.lastReferralPaidAt?.seconds ? anyTenant.lastReferralPaidAt.seconds * 1000 : 0;
          const daysSinceLastPaid = (Date.now() - lastPaidMillis) / (1000 * 60 * 60 * 24);
          
          if (daysSinceLastPaid > 20) {
            const { query, where, increment } = await import('firebase/firestore');
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('referralCode', '==', anyTenant.referredBy));
            const qSnap = await getDocs(q);
            
            if (!qSnap.empty) {
              const totalModules = 1 + (tenant.unlockedModules?.length || 0);
              const rewardAmount = totalModules * 10;
              const referrerDoc = qSnap.docs[0];
              batch.update(referrerDoc.ref, { 
                referralEarnings: increment(rewardAmount),
                availableBalance: increment(rewardAmount)
              });
              
              const historyRef = doc(collection(db, 'users', referrerDoc.id, 'referral_history'));
              batch.set(historyRef, {
                referredTenantId: tenant.id,
                referredTenantName: tenant.name,
                referredOwnerEmail: tenant.ownerEmail || '',
                amountEarned: rewardAmount,
                type: 'renewal',
                creditedAt: serverTimestamp(),
              });

              batch.update(tenantRef, { lastReferralPaidAt: serverTimestamp() });
            }
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

  const toggleTenantModule = async (id: string, currentModules: string[] | undefined, moduleId: string) => {
    try {
      const { db } = initializeFirebase();
      const auth = getAuth();
      const adminUser = auth.currentUser;
      const tenantRef = doc(db, 'tenants', id);
      
      const current = currentModules || [];
      const isRemoving = current.includes(moduleId);
      const { arrayUnion, arrayRemove } = await import('firebase/firestore');

      await updateDoc(tenantRef, { 
        unlockedModules: isRemoving ? arrayRemove(moduleId) : arrayUnion(moduleId) 
      });

      if (adminUser) {
        await addDoc(collection(db, 'admin_logs'), {
          adminUid: adminUser.uid,
          adminEmail: adminUser.email || 'Unknown',
          action: 'TOGGLE_TENANT_MODULE',
          details: `${isRemoving ? 'Removed' : 'Added'} module ${moduleId} for tenant ${id}`,
          targetId: id,
          timestamp: serverTimestamp()
        });
      }
    } catch (err) {
      console.error('Failed to toggle tenant module:', err);
      throw err;
    }
  };

  const annihilateTenant = async (id: string) => {
    try {
      const { db } = initializeFirebase();
      
      // ALL known subcollections — exhaustive list to prevent orphaned Firestore data
      const KNOWN_SUBCOLLECTIONS = [
        'products',
        'transactions',
        'inventory_transactions',
        'inventory_audits',
        'food_orders',
        'menu_items',
        'ingredients',
        'jobs',
        'support_tickets',
        'gym_memberships',
        'rental_inventory',
        'rental_bookings',
        'rental_customers',
        'accounts',
        'loyalty_customers',
        'announcements',
        'fleet',
        'events',
        'spa_services',
        'salon_services',
        'users',
      ];

      const allDocs: any[] = [];
      for (const subcol of KNOWN_SUBCOLLECTIONS) {
        const snap = await getDocs(collection(db, 'tenants', id, subcol));
        snap.docs.forEach(d => allDocs.push(d));
      }

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
          details: `Permanently purged tenant ${id} and all ${KNOWN_SUBCOLLECTIONS.length} subcollections`,
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

  const processTenantRenewal = async (tenant: AdminTenant) => {
    try {
      const { db } = initializeFirebase();
      const auth = getAuth();
      const adminUser = auth.currentUser;
      const tenantRef = doc(db, 'tenants', tenant.id);
      
      const batch = writeBatch(db);
      
      // 1. Extend billing date by 30 days
      const currentBillingDate = tenant.nextBillingDate 
        ? new Date(typeof tenant.nextBillingDate === 'object' && 'seconds' in tenant.nextBillingDate ? (tenant.nextBillingDate as any).seconds * 1000 : tenant.nextBillingDate as any)
        : new Date();
      
      // If current billing date is in the past, renew from today. If in future, extend it.
      const baseDate = currentBillingDate < new Date() ? new Date() : currentBillingDate;
      const nextDate = new Date(baseDate);
      nextDate.setDate(nextDate.getDate() + 30);
      
      // 2. Add Billing Log
      const amount = tenant.pricingTier === 'promo_99' ? 99 : tenant.pricingTier === 'standard_199' ? 199 : 499;
      const logRef = doc(collection(db, 'billing_logs'));
      batch.set(logRef, {
        tenantId: tenant.id,
        tenantName: tenant.name,
        pricingTier: tenant.pricingTier,
        amount: amount,
        type: 'renewal',
        timestamp: serverTimestamp()
      });

      // 3. Process referral credit
      let paidReferralNow = false;
      const anyTenant = tenant as any;
      if (anyTenant.referredBy) {
        const lastPaidMillis = anyTenant.lastReferralPaidAt?.seconds ? anyTenant.lastReferralPaidAt.seconds * 1000 : 0;
        const daysSinceLastPaid = (Date.now() - lastPaidMillis) / (1000 * 60 * 60 * 24);
        
        if (daysSinceLastPaid > 20) {
          const { query, where, increment } = await import('firebase/firestore');
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('referralCode', '==', anyTenant.referredBy));
          const qSnap = await getDocs(q);
          
          if (!qSnap.empty) {
            const totalModules = 1 + (tenant.unlockedModules?.length || 0);
            const rewardAmount = totalModules * 10;
            const referrerDoc = qSnap.docs[0];
            batch.update(referrerDoc.ref, { 
              referralEarnings: increment(rewardAmount),
              availableBalance: increment(rewardAmount)
            });
            
            const historyRef = doc(collection(db, 'users', referrerDoc.id, 'referral_history'));
            batch.set(historyRef, {
              referredTenantId: tenant.id,
              referredTenantName: tenant.name,
              referredOwnerEmail: tenant.ownerEmail || '',
              amountEarned: rewardAmount,
              type: 'renewal',
              creditedAt: serverTimestamp(),
            });
            paidReferralNow = true;
          }
        }
      }

      batch.update(tenantRef, { 
        nextBillingDate: nextDate,
        subscriptionStatus: 'active',
        ...(paidReferralNow && { lastReferralPaidAt: serverTimestamp() })
      });

      if (adminUser) {
        await addDoc(collection(db, 'admin_logs'), {
          adminUid: adminUser.uid,
          adminEmail: adminUser.email || 'Unknown',
          action: 'PROCESS_RENEWAL',
          details: `Processed 30-day renewal for tenant ${tenant.name}`,
          targetId: tenant.id,
          timestamp: serverTimestamp()
        });
      }

      await batch.commit();
    } catch (err) {
      console.error('Failed to process renewal:', err);
      throw err;
    }
  };

  return { tenants, loading, error, updateTenantStatus, updateTenantPricing, toggleTenantModule, updateNextBillingDate, processTenantRenewal, annihilateTenant };
}
