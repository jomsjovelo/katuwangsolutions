'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { LaundryOrderModel, LaundryOrderSchema } from '@/lib/schemas/laundry';
import { createConverter } from '@/firebase';

export function useLaundry() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const laundryQuery = React.useMemo(() => {
    return currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'laundry_orders').withConverter(createConverter(LaundryOrderSchema)),
        orderBy('createdAt', 'desc'),
        limit(300)
      )
    : null;
  }, [currentTenant?.id, db]);

  const { data, loading, error } = useCollection<LaundryOrderModel>(laundryQuery);

  const { queuedOrders, washingOrders, readyOrders, claimedOrders } = React.useMemo(() => {
    return {
      queuedOrders: data.filter(o => o.status === 'Queued'),
      washingOrders: data.filter(o => o.status === 'Washing'),
      readyOrders: data.filter(o => o.status === 'Ready'),
      claimedOrders: data.filter(o => o.status === 'Claimed')
    };
  }, [data]);

  return { 
    orders: data, 
    queuedOrders,
    washingOrders,
    readyOrders,
    claimedOrders,
    loading, 
    error 
  };
}
