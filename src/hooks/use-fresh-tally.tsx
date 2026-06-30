'use client';

import { useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { FreshBatch, FreshWasteLog } from '@/lib/schemas/fresh-tally';

export function useFreshTally() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  // 1. Fetch active batches (not depleted) ordered by expiryDate (soonest first)
  const activeBatchesQuery = useMemo(() => {
    return currentTenant && db
      ? query(
          collection(db, 'tenants', currentTenant.id, 'fresh_batches'),
          where('status', 'in', ['fresh', 'sell-first', 'expired']),
          orderBy('expiryDate', 'asc'),
          limit(200)
        )
      : null;
  }, [currentTenant?.id, db]);

  // 2. Fetch recent waste logs
  const wasteLogsQuery = useMemo(() => {
    return currentTenant && db
      ? query(
          collection(db, 'tenants', currentTenant.id, 'fresh_waste_logs'),
          orderBy('createdAt', 'desc'),
          limit(100)
        )
      : null;
  }, [currentTenant?.id, db]);

  const batches = useCollection<FreshBatch>(activeBatchesQuery as any);
  const wasteLogs = useCollection<FreshWasteLog>(wasteLogsQuery as any);

  return {
    activeBatches: batches.data,
    batchesLoading: batches.loading,
    batchesError: batches.error,
    
    wasteLogs: wasteLogs.data,
    wasteLogsLoading: wasteLogs.loading
  };
}
