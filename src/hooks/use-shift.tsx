'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { ShiftRecord } from '@/firebase/firestore/shift-actions';
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';

export function useShift() {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const isCashier = useSecureCashierStore(state => state.isCashierAuthenticated);
  const cashierShift = useSecureCashierStore(state => state.activeShift);

  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isCashier) {
      if (cashierShift) {
        setActiveShift({
          id: cashierShift.id,
          tenantId: currentTenant?.id || '',
          staffId: user?.uid || '',
          staffName: 'Cashier',
          status: 'open',
          startingCash: cashierShift.startingCashCentavos,
          cashSales: 0,
          totalSales: 0,
          salesCount: 0,
          openedAt: cashierShift.openedAt as any
        } as ShiftRecord);
      } else {
        setActiveShift(null);
      }
      setLoading(false);
      return;
    }

    if (!currentTenant || !user?.uid) {
      setActiveShift(null);
      setLoading(false);
      return;
    }

    const { db } = initializeFirebase();
    const shiftsRef = collection(db, 'tenants', currentTenant.id, 'shifts');
    const q = query(
      shiftsRef,
      where('staffId', '==', user.uid),
      where('status', '==', 'open'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setActiveShift(null);
      } else {
        const doc = snapshot.docs[0];
        setActiveShift({ id: doc.id, ...doc.data() } as ShiftRecord);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching active shift:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentTenant, user?.uid, isCashier, cashierShift]);

  return { activeShift, loading };
}
