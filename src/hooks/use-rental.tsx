'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { RentalInventoryModel, RentalBookingModel, RentalCustomerModel, RentalInventorySchema, RentalBookingSchema, RentalCustomerSchema } from '@/lib/schemas/rental';
import { createConverter } from '@/firebase';

export function useRental() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const inventoryQuery = React.useMemo(() => {
    return currentTenant && db
      ? query(
          collection(db, 'tenants', currentTenant.id, 'rental_inventory').withConverter(createConverter(RentalInventorySchema)),
          orderBy('createdAt', 'desc'),
          limit(300)
        )
      : null;
  }, [currentTenant?.id, db]);

  const bookingsQuery = React.useMemo(() => {
    return currentTenant && db
      ? query(
          collection(db, 'tenants', currentTenant.id, 'rental_bookings').withConverter(createConverter(RentalBookingSchema)),
          orderBy('startDate', 'asc'),
          limit(300)
        )
      : null;
  }, [currentTenant?.id, db]);

  const inventory = useCollection<RentalInventoryModel>(inventoryQuery);
  const bookings = useCollection<RentalBookingModel>(bookingsQuery);

  const { activeBookings, reservedBookings } = React.useMemo(() => {
    return {
      activeBookings: bookings.data.filter(b => b.status === 'active'),
      reservedBookings: bookings.data.filter(b => b.status === 'reserved')
    };
  }, [bookings.data]);

  return { 
    inventory: inventory.data, 
    inventoryLoading: inventory.loading,
    inventoryError: inventory.error,
    bookings: bookings.data,
    activeBookings,
    reservedBookings,
    bookingsLoading: bookings.loading,
    bookingsError: bookings.error
  };
}
