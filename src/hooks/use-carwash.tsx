'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
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
          orderBy('createdAt', 'desc')
        )
      : null;
  }, [currentTenant?.id, db]);

  const { data, loading, error } = useCollection<CarwashOrderModel>(carwashQuery);

  const scheduledOrders = data.filter(o => o.status === 'Scheduled');
  const queuedOrders = data.filter(o => o.status === 'Queued');
  const washingOrders = data.filter(o => o.status === 'Washing');
  const dryingOrders = data.filter(o => o.status === 'Drying');
  const readyOrders = data.filter(o => o.status === 'Ready');
  const completedOrders = data.filter(o => o.status === 'Completed');

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
