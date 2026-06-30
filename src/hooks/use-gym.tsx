'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { GymMembershipModel, GymMembershipSchema } from '@/lib/schemas/gym';
import { createConverter } from '@/firebase';

export function useGymMemberships() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const gymQuery = React.useMemo(() => {
    return currentTenant && db
      ? query(
          collection(db, 'tenants', currentTenant.id, 'gym_memberships').withConverter(createConverter(GymMembershipSchema)),
          orderBy('createdAt', 'desc'),
          limit(500)
        )
      : null;
  }, [currentTenant?.id, db]);

  const { data, loading, error } = useCollection<GymMembershipModel>(gymQuery);

  const { activeMembers, expiredMembers, recentCheckIns } = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Dynamically calculate status based on expiresAt
    const processedData = data.map(m => {
      if (m.status === 'Active' && m.expiresAt) {
        const expDate = m.expiresAt.toDate ? m.expiresAt.toDate() : new Date(m.expiresAt as any);
        if (expDate < today) {
          return { ...m, status: 'Expired' };
        }
      }
      return m;
    });
    
    return {
      activeMembers: processedData.filter(m => m.status === 'Active'),
      expiredMembers: processedData.filter(m => m.status === 'Expired'),
      recentCheckIns: processedData.filter(m => {
        if (!m.lastCheckIn) return false;
        const checkInDate = m.lastCheckIn.toDate ? m.lastCheckIn.toDate() : new Date(m.lastCheckIn as any);
        return checkInDate >= today;
      }).sort((a, b) => {
        const timeA = a.lastCheckIn?.toDate ? a.lastCheckIn.toDate().getTime() : new Date(a.lastCheckIn as any).getTime();
        const timeB = b.lastCheckIn?.toDate ? b.lastCheckIn.toDate().getTime() : new Date(b.lastCheckIn as any).getTime();
        return timeB - timeA;
      })
    };
  }, [data]);

  return { 
    members: data, 
    activeMembers,
    expiredMembers,
    recentCheckIns,
    loading, 
    error 
  };
}
