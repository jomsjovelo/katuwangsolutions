import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { ShiftRecord } from '@/firebase/firestore/shift-actions';
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { useStaffSession } from '@/store/use-staff-session';

export function useShift() {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const staffSession = useStaffSession(state => state.staffSession);
  const isStaffValid = useStaffSession(state => state.isSessionValid());
  const currentStaff = isStaffValid ? staffSession : null;
  const effectiveStaffId = user?.uid || (currentStaff ? `staff_${currentStaff.staffAccountId}` : null);

  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTenant || !effectiveStaffId) {
      setActiveShift(null);
      setLoading(false);
      return;
    }

    const { db } = initializeFirebase();
    const shiftsRef = collection(db, 'tenants', currentTenant.id, 'shifts');
    const q = query(
      shiftsRef,
      where('staffId', '==', effectiveStaffId),
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
  }, [currentTenant, effectiveStaffId]);

  return { activeShift, loading };
}
