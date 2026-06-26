'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { CarwashOrderModel, CarwashOrderSchema } from '@/lib/schemas/carwash';
import { createConverter } from '@/firebase';

export function useCarwashOrders() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const carwashQuery = React.useMemo(() => {
    return currentTenant && db
      ? query(
          collection(db, 'tenants', currentTenant.id, 'carwash_orders').withConverter(createConverter(CarwashOrderSchema)),
          orderBy('createdAt', 'desc'),
          limit(300)
        )
      : null;
  }, [currentTenant?.id, db]);

  const { data, loading, error } = useCollection<CarwashOrderModel>(carwashQuery);

  const { scheduledOrders, queuedOrders, washingOrders, dryingOrders, readyOrders, completedOrders } = React.useMemo(() => {
    return {
      scheduledOrders: data.filter(o => o.status === 'Scheduled'),
      queuedOrders: data.filter(o => o.status === 'Queued'),
      washingOrders: data.filter(o => o.status === 'Washing'),
      dryingOrders: data.filter(o => o.status === 'Drying'),
      readyOrders: data.filter(o => o.status === 'Ready'),
      completedOrders: data.filter(o => o.status === 'Completed')
    };
  }, [data]);

  return { 
    orders: data, 
    scheduledOrders,
    queuedOrders,
    washingOrders,
    dryingOrders,
    readyOrders,
    completedOrders,
    loading, 
    error 
  };
}
