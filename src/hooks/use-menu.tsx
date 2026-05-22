'use client';

import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { MenuItem, MenuItemSchema } from '@/lib/schemas/menu';
import { createConverter } from '@/firebase';

export function useMenu() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const menuQuery = currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'menu_items').withConverter(createConverter(MenuItemSchema)),
        orderBy('name', 'asc')
      )
    : null;

  const { data, loading, error } = useCollection<MenuItem>(menuQuery);

  const availableItems = data.filter(item => item.isAvailable);

  return { 
    menuItems: data, 
    availableItems,
    loading, 
    error 
  };
}
