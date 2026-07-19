import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc, updateDoc, getDocs, writeBatch, serverTimestamp, addDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';
import { Tenant, SubscriptionStatus, PricingTier } from '@/store/use-tenant-store';

export interface AdminTenant extends Tenant {
  ownerEmail?: string;
}

export function useAdminTenants(enabled: boolean = true) {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [pageStack, setPageStack] = useState<any[]>([]); // To go backwards

  const fetchTenants = async (direction: 'next' | 'prev' | 'initial' = 'initial') => {
    setLoading(true);
    try {
      const { db } = initializeFirebase();
      const { query, collection, orderBy, limit, startAfter, getDocs } = await import('firebase/firestore');
      
      let q = query(collection(db, 'tenants'), orderBy('createdAt', 'desc'), limit(50));

      if (direction === 'next' && lastVisible) {
        q = query(collection(db, 'tenants'), orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(50));
      } else if (direction === 'prev' && pageStack.length > 0) {
        const newStack = [...pageStack];
        newStack.pop(); // remove current page's start
        const prevPageStart = newStack.length > 0 ? newStack[newStack.length - 1] : null;
        setPageStack(newStack);
        
        q = prevPageStart ? 
          query(collection(db, 'tenants'), orderBy('createdAt', 'desc'), startAfter(prevPageStart), limit(50)) :
          query(collection(db, 'tenants'), orderBy('createdAt', 'desc'), limit(50));
      }

      const snap = await getDocs(q);
      
      // We no longer need N+1 query because ownerEmail is stored on the tenant document
      const data: AdminTenant[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminTenant));
      
      setTenants(data);
      if (snap.docs.length > 0) {
        const currentLastVisible = snap.docs[snap.docs.length - 1];
        if (direction === 'initial') {
           setPageStack([]);
        } else if (direction === 'next') {
           setPageStack([...pageStack, lastVisible]);
        }
        setLastVisible(currentLastVisible);
      }
      setError(null);
    } catch (e) {
      const err = e as Error & { code?: string };
      console.error('Error fetching admin tenants:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const searchTenants = async (searchTerm: string) => {
    if (!searchTerm) return fetchTenants('initial');
    setLoading(true);
    try {
      const { db } = initializeFirebase();
      const { query, collection, where, getDocs, limit } = await import('firebase/firestore');
      
      const term = searchTerm.toLowerCase().trim();
      let data: AdminTenant[] = [];

      // Try Email match (exact) if it contains @
      if (term.includes('@')) {
        const qEmail = query(collection(db, 'tenants'), where('ownerEmail', '==', term), limit(50));
        const snapEmail = await getDocs(qEmail);
        data = snapEmail.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminTenant));
      } else {
        // Try Business Name Prefix match
        const qName = query(
          collection(db, 'tenants'),
          where('searchableName', '>=', term),
          where('searchableName', '<=', term + '\uf8ff'),
          limit(50)
        );
        const snapName = await getDocs(qName);
        data = snapName.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminTenant));
      }

      setTenants(data);
      setError(null);
      // Reset pagination for search results
      setLastVisible(null);
      setPageStack([]);
    } catch (e) {
      const err = e as Error & { code?: string };
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (enabled) {
      fetchTenants('initial');
    }
  }, [enabled]);

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
        const amount = tenant.pricingTier === 'promo_50' ? 50 : tenant.pricingTier === 'promo_99' ? 99 : tenant.pricingTier === 'standard_100' ? 100 : tenant.pricingTier === 'standard_199' ? 199 : tenant.pricingTier === 'foc' ? 0 : 499;
        const logRef = doc(collection(db, 'billing_logs'));
        batch.set(logRef, {
          tenantId: tenant.id,
          tenantName: tenant.name,
          pricingTier: tenant.pricingTier,
          amount: amount,
          type: 'activation',
          timestamp: serverTimestamp()
        });

        // Queue Activation Email via Firebase Trigger Email extension
        if (tenant.ownerEmail) {
          const mailRef = doc(collection(db, 'mail'));
          batch.set(mailRef, {
            to: tenant.ownerEmail,
            message: {
              subject: "Ang iyong Katuwang Account ay ACTIVE na! 🎉",
              html: `
                <h2>Kumusta ${tenant.name},</h2>
                <p>Magandang balita! Ang iyong Katuwang account ay approved at active na.</p>
                <p>Maaari mo nang magamit ang lahat ng features ng system.</p>
                <br/>
                <a href="https://katuwang.com/dashboard" style="display:inline-block;padding:10px 20px;background:#0ea5e9;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Pumunta sa Dashboard</a>
                <br/><br/>
                <p>Salamat sa pagtitiwala sa Katuwang!</p>
              `
            }
          });
        }

        // Process referral credit
        const anyTenant = tenant as any;
        if (anyTenant.referredBy && !anyTenant.referralPaid) {
          const { query, where, increment } = await import('firebase/firestore');
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('referralCode', '==', anyTenant.referredBy));
          const qSnap = await getDocs(q);
          
          if (!qSnap.empty) {
            const modulesList = [tenant.moduleType, ...(tenant.unlockedModules || [])];
            let rewardAmount = 0;
            modulesList.forEach(m => {
              rewardAmount += (m === 'budget-mo') ? 5 : 10;
            });
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
        const amount = tenant.pricingTier === 'promo_50' ? 50 : tenant.pricingTier === 'promo_99' ? 99 : tenant.pricingTier === 'standard_100' ? 100 : tenant.pricingTier === 'standard_199' ? 199 : tenant.pricingTier === 'foc' ? 0 : 499;
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
              const modulesList = [tenant.moduleType, ...(tenant.unlockedModules || [])];
              let rewardAmount = 0;
              modulesList.forEach(m => {
                rewardAmount += (m === 'budget-mo') ? 5 : 10;
              });
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
      setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, subscriptionStatus: status } : t));
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
      setTenants(prev => prev.map(t => t.id === id ? { ...t, pricingTier: tier } : t));
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
      setTenants(prev => prev.map(t => {
        if (t.id === id) {
          const current = t.unlockedModules || [];
          return { ...t, unlockedModules: isRemoving ? current.filter(m => m !== moduleId) : [...current, moduleId] };
        }
        return t;
      }));
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
      setTenants(prev => prev.filter(t => t.id !== id));
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
      setTenants(prev => prev.map(t => t.id === id ? { ...t, nextBillingDate: date } : t));
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
      const amount = tenant.pricingTier === 'promo_50' ? 50 : tenant.pricingTier === 'promo_99' ? 99 : tenant.pricingTier === 'standard_100' ? 100 : tenant.pricingTier === 'standard_199' ? 199 : tenant.pricingTier === 'foc' ? 0 : 499;
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
            const modulesList = [tenant.moduleType, ...(tenant.unlockedModules || [])];
            let rewardAmount = 0;
            modulesList.forEach(m => {
              rewardAmount += (m === 'budget-mo') ? 5 : 10;
            });
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
      setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, subscriptionStatus: 'active', nextBillingDate: nextDate } : t));
    } catch (err) {
      console.error('Failed to process renewal:', err);
      throw err;
    }
  };

  return { 
    tenants, 
    loading, 
    error, 
    fetchTenants, 
    searchTenants, 
    hasPrevPage: pageStack.length > 0,
    hasNextPage: !!lastVisible,
    pendingCount: tenants.filter(t => t.subscriptionStatus === 'pending').length,
    updateTenantStatus, 
    updateTenantPricing, 
    toggleTenantModule, 
    updateNextBillingDate, 
    processTenantRenewal, 
    annihilateTenant 
  };
}
