'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { WaterDeliveryModel, WaterDeliverySchema } from '@/lib/schemas/water';
import { createConverter } from '@/firebase';

export function useWaterDeliveries() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const waterQuery = React.useMemo(() => {
    return currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'water_deliveries').withConverter(createConverter(WaterDeliverySchema)),
        orderBy('createdAt', 'desc'),
        limit(300)
      )
    : null;
  }, [currentTenant?.id, db]);

  const { data, loading, error } = useCollection<WaterDeliveryModel>(waterQuery);

  const { pendingOrders, outForDeliveryOrders, deliveredOrders } = React.useMemo(() => {
    return {
      pendingOrders: data.filter(o => o.status === 'Pending'),
      outForDeliveryOrders: data.filter(o => o.status === 'Out for Delivery'),
      deliveredOrders: data.filter(o => o.status === 'Delivered')
    };
  }, [data]);

  return { 
    orders: data, 
    pendingOrders,
    outForDeliveryOrders,
    deliveredOrders,
    loading, 
    error 
  };
}
