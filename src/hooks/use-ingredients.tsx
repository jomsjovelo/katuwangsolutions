'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { Ingredient, IngredientSchema } from '@/lib/schemas/ingredients';
import { createConverter } from '@/firebase';

export function useIngredients() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const ingredientsQuery = React.useMemo(() => {
    return currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'ingredients').withConverter(createConverter(IngredientSchema)),
        orderBy('name', 'asc')
      )
    : null;
  }, [currentTenant?.id, db]);

  const { data, loading, error } = useCollection<Ingredient>(ingredientsQuery);

  const activeIngredients = data.filter(item => item.isActive);

  return { 
    ingredients: data, 
    activeIngredients,
    loading, 
    error 
  };
}
