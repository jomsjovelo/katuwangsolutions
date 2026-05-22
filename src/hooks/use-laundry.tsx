'use client';

import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { LaundryOrderModel, LaundryOrderSchema } from '@/lib/schemas/laundry';
import { createConverter } from '@/firebase';

export function useLaundry() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const laundryQuery = currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'laundry_orders').withConverter(createConverter(LaundryOrderSchema)),
        orderBy('createdAt', 'desc')
      )
    : null;

  const { data, loading, error } = useCollection<LaundryOrderModel>(laundryQuery);

  const queuedOrders = data.filter(o => o.status === 'Queued');
  const washingOrders = data.filter(o => o.status === 'Washing');
  const readyOrders = data.filter(o => o.status === 'Ready');
  const claimedOrders = data.filter(o => o.status === 'Claimed');

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
