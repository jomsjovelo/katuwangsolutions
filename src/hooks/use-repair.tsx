'use client';

import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { RepairJobModel, RepairJobSchema } from '@/lib/schemas/repair';
import { createConverter } from '@/firebase';

export function useRepairJobs() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const repairQuery = currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'repair_jobs').withConverter(createConverter(RepairJobSchema)),
        orderBy('createdAt', 'desc')
      )
    : null;

  const { data, loading, error } = useCollection<RepairJobModel>(repairQuery);

  const queuedJobs = data.filter(j => j.status === 'Queued');
  const repairingJobs = data.filter(j => j.status === 'Repairing');
  const readyJobs = data.filter(j => j.status === 'Ready');
  const releasedJobs = data.filter(j => j.status === 'Released');

  return { 
    jobs: data, 
    queuedJobs,
    repairingJobs,
    readyJobs,
    releasedJobs,
    loading, 
    error 
  };
}
