'use client';
import { useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, Timestamp, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { Sale } from '@/lib/schemas/sales';
import { startOfDay, endOfDay } from 'date-fns';

export type DateRangeOrDate = Date | { start: Date; end: Date };

export function useSales(selectedDate: DateRangeOrDate = new Date()) {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const start = Timestamp.fromDate(
    selectedDate instanceof Date ? startOfDay(selectedDate) : startOfDay(selectedDate.start)
  );
  const end = Timestamp.fromDate(
    selectedDate instanceof Date ? endOfDay(selectedDate) : endOfDay(selectedDate.end)
  );

  const salesQuery = useMemo(() => {
    return currentTenant && db
      ? query(
          collection(db, 'tenants', currentTenant.id, 'sales'),
          where('createdAt', '>=', start),
          where('createdAt', '<=', end),
          orderBy('createdAt', 'desc'),
          limit(200)
        )
      : null;
  }, [currentTenant?.id, db, start.seconds, end.seconds]);

  const { data, loading, error } = useCollection<Sale>(salesQuery as any);

  // Calculate daily total in centavos
  const dailyTotalCentavos = data.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
  const dailyTotalPesos = dailyTotalCentavos / 100;

  return { 
    sales: data, 
    dailyTotalPesos,
    dailyTotalCentavos,
    loading, 
    error 
  };
}
