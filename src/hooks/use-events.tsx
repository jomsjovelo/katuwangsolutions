'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { EventModel, EventSchema } from '@/lib/schemas/events';
import { createConverter } from '@/firebase';

export function useEvents() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const eventsQuery = React.useMemo(() => {
    return currentTenant && db
      ? query(
          collection(db, 'tenants', currentTenant.id, 'events').withConverter(createConverter(EventSchema)),
          orderBy('eventDate', 'asc'),
          limit(300)
        )
      : null;
  }, [currentTenant?.id, db]);

  const { data, loading, error } = useCollection<EventModel>(eventsQuery);

  const { inquiryEvents, depositedEvents, prepEvents, eventDayEvents, completedEvents } = React.useMemo(() => {
    return {
      inquiryEvents: data.filter(e => e.status === 'Inquiry'),
      depositedEvents: data.filter(e => e.status === 'Deposited'),
      prepEvents: data.filter(e => e.status === 'Preparation'),
      eventDayEvents: data.filter(e => e.status === 'Event Day'),
      completedEvents: data.filter(e => e.status === 'Completed')
    };
  }, [data]);

  return { 
    events: data, 
    inquiryEvents,
    depositedEvents,
    prepEvents,
    eventDayEvents,
    completedEvents,
    loading, 
    error 
  };
}
