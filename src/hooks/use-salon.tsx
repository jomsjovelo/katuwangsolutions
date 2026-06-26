'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { SalonAppointmentModel, SalonAppointmentSchema } from '@/lib/schemas/salon';
import { createConverter } from '@/firebase';

export function useSalonAppointments() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const salonQuery = React.useMemo(() => {
    if (!currentTenant || !db) return null;
    
    // Only fetch today's appointments to prevent infinite loading / massive data dumps over time
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return query(
      collection(db, 'tenants', currentTenant.id, 'salon_appointments').withConverter(createConverter(SalonAppointmentSchema)),
      where('createdAt', '>=', today),
      orderBy('createdAt', 'desc')
    );
  }, [currentTenant?.id, db]);

  const { data, loading, error } = useCollection<SalonAppointmentModel>(salonQuery);

  const { waitingAppointments, inChairAppointments, doneAppointments } = React.useMemo(() => {
    return {
      waitingAppointments: data.filter(a => a.status === 'Waiting'),
      inChairAppointments: data.filter(a => a.status === 'In Chair'),
      doneAppointments: data.filter(a => a.status === 'Done')
    };
  }, [data]);

  return { 
    appointments: data, 
    waitingAppointments,
    inChairAppointments,
    doneAppointments,
    loading, 
    error 
  };
}
