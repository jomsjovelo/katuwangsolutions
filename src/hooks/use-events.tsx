'use client';

import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { EventModel, EventSchema } from '@/lib/schemas/events';
import { createConverter } from '@/firebase';

export function useEvents() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const eventsQuery = currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'events').withConverter(createConverter(EventSchema)),
        orderBy('eventDate', 'asc')
      )
    : null;

  const { data, loading, error } = useCollection<EventModel>(eventsQuery);

  const upcomingEvents = data.filter(e => e.status === 'Upcoming');
  const ongoingEvents = data.filter(e => e.status === 'Ongoing');
  const pastEvents = data.filter(e => e.status === 'Done');

  return { 
    events: data, 
    upcomingEvents,
    ongoingEvents,
    pastEvents,
    loading, 
    error 
  };
}
