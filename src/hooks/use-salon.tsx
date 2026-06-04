'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { SalonAppointmentModel, SalonAppointmentSchema } from '@/lib/schemas/salon';
import { createConverter } from '@/firebase';

export function useSalonAppointments() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const salonQuery = React.useMemo(() => {
    return currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'salon_appointments').withConverter(createConverter(SalonAppointmentSchema)),
        orderBy('createdAt', 'desc')
      )
    : null;
  }, [currentTenant?.id, db]);

  const { data, loading, error } = useCollection<SalonAppointmentModel>(salonQuery);

  const waitingAppointments = data.filter(a => a.status === 'Waiting');
  const inChairAppointments = data.filter(a => a.status === 'In Chair');
  const doneAppointments = data.filter(a => a.status === 'Done');

  return { 
    appointments: data, 
    waitingAppointments,
    inChairAppointments,
    doneAppointments,
    loading, 
    error 
  };
}
