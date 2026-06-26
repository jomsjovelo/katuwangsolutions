'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { SpaAppointmentModel, SpaAppointmentSchema } from '@/lib/schemas/spa';
import { createConverter } from '@/firebase';

export function useSpaAppointments() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const spaQuery = React.useMemo(() => {
    return currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'spa_appointments').withConverter(createConverter(SpaAppointmentSchema)),
        orderBy('createdAt', 'desc'),
        limit(300)
      )
    : null;
  }, [currentTenant?.id, db]);

  const { data, loading, error } = useCollection<SpaAppointmentModel>(spaQuery);

  const { scheduledAppointments, waitingAppointments, inSessionAppointments, restingAppointments, doneAppointments } = React.useMemo(() => {
    return {
      scheduledAppointments: data.filter(a => a.status === 'Scheduled'),
      waitingAppointments: data.filter(a => a.status === 'Waiting'),
      inSessionAppointments: data.filter(a => a.status === 'In Session'),
      restingAppointments: data.filter(a => a.status === 'Resting'),
      doneAppointments: data.filter(a => a.status === 'Done')
    };
  }, [data]);

  return { 
    appointments: data, 
    scheduledAppointments,
    waitingAppointments,
    inSessionAppointments,
    restingAppointments,
    doneAppointments,
    loading, 
    error 
  };
}
