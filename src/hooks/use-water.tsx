'use client';

import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { WaterDeliveryModel, WaterDeliverySchema } from '@/lib/schemas/water';
import { createConverter } from '@/firebase';

export function useWaterDeliveries() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const waterQuery = currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'water_deliveries').withConverter(createConverter(WaterDeliverySchema)),
        orderBy('createdAt', 'desc')
      )
    : null;

  const { data, loading, error } = useCollection<WaterDeliveryModel>(waterQuery);

  const pendingOrders = data.filter(o => o.status === 'Pending');
  const outForDeliveryOrders = data.filter(o => o.status === 'Out for Delivery');
  const deliveredOrders = data.filter(o => o.status === 'Delivered');

  return { 
    orders: data, 
    pendingOrders,
    outForDeliveryOrders,
    deliveredOrders,
    loading, 
    error 
  };
}
