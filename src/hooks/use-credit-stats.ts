import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useTenant } from '@/app/lib/tenant-context';
import { Borrower } from '@/firebase/firestore/credit-actions';

export function useCreditStats() {
  const { currentTenant } = useTenant();
  
  const [totalCapital, setTotalCapital] = useState(0);
  const [cashOnHand, setCashOnHand] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTenant) return;
    
    const { db } = initializeFirebase();
    let pendingUnsubs = 0;
    
    // 1. Listen to Master Stats
    const masterStatsRef = doc(db, 'tenants', currentTenant.id, 'accounts', 'master-stats');
    pendingUnsubs++;
    const unsubStats = onSnapshot(masterStatsRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setTotalCapital(data.totalCapital || 0);
        setTotalOutstanding(data.totalOutstanding || 0);
      } else {
        // Fallback: Aggregate and initialize if missing
        import('firebase/firestore').then(async ({ getDocs, setDoc }) => {
          let capitalSum = 0;
          let outstandingSum = 0;
          
          const capSnap = await getDocs(collection(db, 'tenants', currentTenant.id, 'capital_entries'));
          capSnap.forEach(doc => { capitalSum += (doc.data().amount || 0); });
          
          const borSnap = await getDocs(collection(db, 'tenants', currentTenant.id, 'borrowers'));
          borSnap.forEach(doc => { outstandingSum += (doc.data().outstanding || 0); });
          
          setTotalCapital(capitalSum);
          setTotalOutstanding(outstandingSum);
          
          await setDoc(masterStatsRef, {
            totalCapital: capitalSum,
            totalOutstanding: outstandingSum,
            updatedAt: new Date()
          });
        });
      }
      pendingUnsubs--;
      if (pendingUnsubs === 0) setLoading(false);
    });

    // 2. Listen to Master Cash (Cash on Hand)
    const masterCashRef = doc(db, 'tenants', currentTenant.id, 'accounts', 'master-cash');
    pendingUnsubs++;
    const unsubCash = onSnapshot(masterCashRef, (snap) => {
      if (snap.exists()) {
        setCashOnHand(snap.data().balance || 0);
      } else {
        setCashOnHand(0);
      }
      pendingUnsubs--;
      if (pendingUnsubs === 0) setLoading(false);
    });

    return () => {
      unsubStats();
      unsubCash();
    };
  }, [currentTenant?.id]);

  const totalAssets = cashOnHand + totalOutstanding;
  const generatedRevenue = totalAssets - totalCapital;

  return {
    totalCapitalPesos: totalCapital / 100,
    cashOnHandPesos: cashOnHand / 100,
    totalOutstandingPesos: totalOutstanding / 100,
    generatedRevenuePesos: generatedRevenue / 100,
    loading
  };
}
