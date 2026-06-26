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

  const { upcomingEvents, ongoingEvents, pastEvents } = React.useMemo(() => {
    return {
      upcomingEvents: data.filter(e => e.status === 'Upcoming'),
      ongoingEvents: data.filter(e => e.status === 'Ongoing'),
      pastEvents: data.filter(e => e.status === 'Done')
    };
  }, [data]);

  return { 
    events: data, 
    upcomingEvents,
    ongoingEvents,
    pastEvents,
    loading, 
    error 
  };
}
