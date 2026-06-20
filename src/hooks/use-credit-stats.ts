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
    
    // 1. Listen to Capital Entries
    const capitalRef = collection(db, 'tenants', currentTenant.id, 'capital_entries');
    pendingUnsubs++;
    const unsubCapital = onSnapshot(capitalRef, (snap) => {
      let sum = 0;
      snap.forEach(doc => {
        sum += (doc.data().amount || 0);
      });
      setTotalCapital(sum);
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

    // 3. Listen to Borrowers for Total Outstanding
    const borrowersRef = collection(db, 'tenants', currentTenant.id, 'borrowers');
    pendingUnsubs++;
    const unsubBorrowers = onSnapshot(borrowersRef, (snap) => {
      let sum = 0;
      snap.forEach(doc => {
        sum += (doc.data().outstanding || 0);
      });
      setTotalOutstanding(sum);
      pendingUnsubs--;
      if (pendingUnsubs === 0) setLoading(false);
    });

    return () => {
      unsubCapital();
      unsubCash();
      unsubBorrowers();
    };
  }, [currentTenant]);

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
