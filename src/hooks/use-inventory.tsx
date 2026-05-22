'use client';

import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { Product, ProductSchema } from '@/lib/schemas/inventory';
import { createConverter } from '@/firebase';

export function useInventory() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const inventoryQuery = currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'products').withConverter(createConverter(ProductSchema)),
        orderBy('name', 'asc')
      )
    : null;

  const { data, loading, error } = useCollection<Product>(inventoryQuery);

  // Derived state for dashboard widgets
  const lowStockItems = data.filter(item => item.currentStock <= item.minStock);
  const outOfStockItems = data.filter(item => item.currentStock === 0);

  return { 
    products: data, 
    lowStockItems,
    outOfStockItems,
    loading, 
    error 
  };
}
