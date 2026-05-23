'use client';

import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { SpaAppointmentModel, SpaAppointmentSchema } from '@/lib/schemas/spa';
import { createConverter } from '@/firebase';

export function useSpaAppointments() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const spaQuery = currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'spa_appointments').withConverter(createConverter(SpaAppointmentSchema)),
        orderBy('createdAt', 'desc')
      )
    : null;

  const { data, loading, error } = useCollection<SpaAppointmentModel>(spaQuery);

  const waitingAppointments = data.filter(a => a.status === 'Waiting');
  const inSessionAppointments = data.filter(a => a.status === 'In Session');
  const restingAppointments = data.filter(a => a.status === 'Resting');
  const doneAppointments = data.filter(a => a.status === 'Done');

  return { 
    appointments: data, 
    waitingAppointments,
    inSessionAppointments,
    restingAppointments,
    doneAppointments,
    loading, 
    error 
  };
}
