import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';

export function useFarmHarvests() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const [harvests, setHarvests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    if (!currentTenant?.id || !db) return;

    const q = query(
      collection(db, 'tenants', currentTenant.id, 'farm_harvests'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setHarvests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Farm harvests subscription error:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentTenant?.id, db]);

  return { harvests, loading, error };
}
