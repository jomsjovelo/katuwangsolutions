'use client';

import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { GymMembershipModel, GymMembershipSchema } from '@/lib/schemas/gym';
import { createConverter } from '@/firebase';

export function useGymMemberships() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const gymQuery = currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'gym_memberships').withConverter(createConverter(GymMembershipSchema)),
        orderBy('createdAt', 'desc')
      )
    : null;

  const { data, loading, error } = useCollection<GymMembershipModel>(gymQuery);

  // Group members
  const activeMembers = data.filter(m => m.status === 'Active');
  const expiredMembers = data.filter(m => m.status === 'Expired');
  
  // For Recent Check-ins, we filter those who checked in within the last 24 hours.
  // We'll just filter by lastCheckIn presence and sort them in UI, or just show the ones checked in today.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const recentCheckIns = data.filter(m => {
    if (!m.lastCheckIn) return false;
    const checkInDate = m.lastCheckIn.toDate ? m.lastCheckIn.toDate() : new Date(m.lastCheckIn);
    return checkInDate >= today;
  }).sort((a, b) => {
    const timeA = a.lastCheckIn?.toDate ? a.lastCheckIn.toDate().getTime() : new Date(a.lastCheckIn).getTime();
    const timeB = b.lastCheckIn?.toDate ? b.lastCheckIn.toDate().getTime() : new Date(b.lastCheckIn).getTime();
    return timeB - timeA;
  });

  return { 
    members: data, 
    activeMembers,
    expiredMembers,
    recentCheckIns,
    loading, 
    error 
  };
}
