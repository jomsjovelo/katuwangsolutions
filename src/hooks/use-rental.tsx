'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
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
          orderBy('createdAt', 'desc')
        )
      : null;
  }, [currentTenant?.id, db]);

  const bookingsQuery = React.useMemo(() => {
    return currentTenant && db
      ? query(
          collection(db, 'tenants', currentTenant.id, 'rental_bookings').withConverter(createConverter(RentalBookingSchema)),
          orderBy('startDate', 'asc')
        )
      : null;
  }, [currentTenant?.id, db]);

  const customersQuery = React.useMemo(() => {
    return currentTenant && db
      ? query(
          collection(db, 'tenants', currentTenant.id, 'rental_customers').withConverter(createConverter(RentalCustomerSchema)),
          orderBy('createdAt', 'desc')
        )
      : null;
  }, [currentTenant?.id, db]);

  const inventory = useCollection<RentalInventoryModel>(inventoryQuery);
  const bookings = useCollection<RentalBookingModel>(bookingsQuery);
  const customers = useCollection<RentalCustomerModel>(customersQuery);

  const activeBookings = bookings.data.filter(b => b.status === 'active');
  const reservedBookings = bookings.data.filter(b => b.status === 'reserved');

  return { 
    inventory: inventory.data, 
    inventoryLoading: inventory.loading,
    inventoryError: inventory.error,
    bookings: bookings.data,
    activeBookings,
    reservedBookings,
    bookingsLoading: bookings.loading,
    bookingsError: bookings.error,
    customers: customers.data,
    customersLoading: customers.loading,
    customersError: customers.error
  };
}
