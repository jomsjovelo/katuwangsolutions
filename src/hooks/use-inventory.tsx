'use client';

import { useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { Product, ProductSchema } from '@/lib/schemas/inventory';
import { createConverter } from '@/firebase';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';

export function useInventory() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const isCashier = useSecureCashierStore(state => state.isCashierAuthenticated);
  const cashierProducts = useSecureCashierStore(state => state.products);

  const inventoryQuery = useMemo(() => {
    return currentTenant && db && !isCashier
      ? query(
          collection(db, 'tenants', currentTenant.id, 'products').withConverter(createConverter(ProductSchema)),
          orderBy('name', 'asc'),
          limit(300)
        )
      : null;
  }, [currentTenant?.id, db, isCashier]);

  const { data: firestoreData, loading: firestoreLoading, error } = useCollection<Product>(inventoryQuery);

  if (isCashier) {
    const products = cashierProducts.map((p) => ({
      id: p.id,
      name: p.name,
      salePrice: p.salePrice,
      currentStock: p.currentStock,
      unit: p.unit,
      minStock: p.minStock ?? 5,
      sku: p.sku,
      barcode: p.barcode,
      category: p.category,
      isActive: true,
      tenantId: currentTenant?.id || '',
      createdAt: new Date().toISOString()
    })) as unknown as Product[];

    const lowStockItems = products.filter(item => item.currentStock <= item.minStock);
    const outOfStockItems = products.filter(item => item.currentStock === 0);

    return {
      products,
      lowStockItems,
      outOfStockItems,
      loading: false,
      error: null
    };
  }

  // Owner flow: derived from real-time Firestore query
  const lowStockItems = firestoreData.filter(item => item.currentStock <= item.minStock);
  const outOfStockItems = firestoreData.filter(item => item.currentStock === 0);

  return {
    products: firestoreData,
    lowStockItems,
    outOfStockItems,
    loading: firestoreLoading,
    error
  };
}
