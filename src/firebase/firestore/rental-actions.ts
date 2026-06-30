import { getFirestore, doc, collection, serverTimestamp, setDoc, increment } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { runTransactionResilient } from './resilient-transaction';
import { logAuditEvent } from './audit-actions';

export const getKatuwangDb = () => initializeFirebase().db;

export async function processRentalBooking(
  tenantId: string,
  itemId: string,
  itemName: string,
  customerName: string,
  totalCost: number,
  paymentTiming: 'upfront' | 'return',
  paymentMethod?: string,
  gcashRef?: string,
  discountCentavos: number = 0,
  discountType?: 'percentage' | 'fixed',
  discountReason?: string
): Promise<string> {
  const db = getKatuwangDb();
  let bookingId = '';
  
  await runTransactionResilient(db, async (transaction) => {
    // 1. Read Phase
    const itemRef = doc(db, 'tenants', tenantId, 'rental_inventory', itemId);
    const itemSnap = await transaction.get(itemRef);
    
    if (!itemSnap.exists()) {
      throw new Error(`Item does not exist.`);
    }
    
    const currentAvail = itemSnap.data().availableQuantity || 0;
    if (currentAvail <= 0) {
      throw new Error('No available units for this item.');
    }

    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    let masterAccountSnap = null;
    if (paymentTiming === 'upfront' && totalCost > 0) {
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    // 2. Write Phase: Create Booking
    const bookingsRef = collection(db, 'tenants', tenantId, 'rental_bookings');
    const newBookingRef = doc(bookingsRef);
    bookingId = newBookingRef.id;

    transaction.set(newBookingRef, {
      itemId,
      itemName,
      customerId: 'guest',
      customerName,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000), // Default 1 day for now
      status: 'active',
      depositStatus: 'pending',
      paymentStatus: paymentTiming === 'upfront' ? 'paid' : 'unpaid',
      paymentMethod: paymentTiming === 'upfront' ? paymentMethod || 'cash' : null,
      totalCost,
      discountAmount: discountCentavos,
      discountType: discountType || 'none',
      discountReason,
      finalCost: Math.max(0, totalCost - (discountCentavos/100)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 3. Write Phase: Deduct Inventory
    transaction.update(itemRef, {
      availableQuantity: increment(-1),
      updatedAt: serverTimestamp(),
    });

    // 4. Write Phase: Record Sale & Ledger IF paying upfront
    if (paymentTiming === 'upfront' && totalCost > 0) {
      const subtotalCentavos = totalCost * 100;
      const finalCentavos = Math.max(0, subtotalCentavos - discountCentavos);
      
      const salesRef = collection(db, 'tenants', tenantId, 'sales');
      const newSaleRef = doc(salesRef);
      
      const saleRecord: Record<string, unknown> = {
        id: newSaleRef.id,
        tenantId,
        module: 'rental',
        items: [{ productId: itemId, name: `Rental: ${itemName}`, price: subtotalCentavos, quantity: 1 }],
        subtotalAmount: subtotalCentavos,
        discountAmount: discountCentavos,
        discountType: discountType || 'none',
        discountReason,
        totalAmount: finalCentavos,
        paymentMethod: paymentMethod || 'cash',
        createdAt: serverTimestamp()
      };
      if (gcashRef) saleRecord.gcashRef = gcashRef;
      
      transaction.set(newSaleRef, saleRecord);

      // Ledger update
      if (masterAccountSnap) {
        if (!masterAccountSnap.exists()) {
          transaction.set(masterAccountRef, {
            id: 'master-cash',
            tenantId,
            name: 'Main Cash Register',
            type: 'asset',
            balance: finalCentavos,
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } else {
          transaction.update(masterAccountRef, {
            balance: increment(finalCentavos),
            updatedAt: serverTimestamp()
          });
        }
        
        // Log to unified transactions for Ulat ng Negosyo
        const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
        const newTxRef = doc(transactionsRef);
        transaction.set(newTxRef, {
          id: newTxRef.id,
          tenantId,
          accountId: 'master-cash',
          amount: finalCentavos,
          type: 'income',
          category: 'Rental',
          description: `Rental Booking (${paymentMethod || 'cash'})`,
          date: new Date(),
          createdAt: serverTimestamp()
        });
      }
    }
  });

  return bookingId;
}

export async function processRentalReturn(
  tenantId: string,
  booking: any,
  paymentMethod?: string,
  gcashRef?: string,
  discountCentavos: number = 0,
  discountType?: 'percentage' | 'fixed',
  discountReason?: string,
  userId?: string,
  userName?: string,
  shiftId?: string
): Promise<void> {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    // 1. Read Phase
    const bookingRef = doc(db, 'tenants', tenantId, 'rental_bookings', booking.id);
    const itemRef = doc(db, 'tenants', tenantId, 'rental_inventory', booking.itemId);
    
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    let masterAccountSnap = null;
    
    // Only fetch ledger if payment is being settled on return
    if (booking.paymentStatus === 'unpaid' && booking.totalCost > 0) {
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    // 2. Write Phase: Update Booking
    transaction.update(bookingRef, { 
      status: 'returned', 
      paymentStatus: 'paid', // Mark as paid if it was unpaid
      paymentMethod: booking.paymentStatus === 'unpaid' ? paymentMethod : booking.paymentMethod,
      returnedAt: serverTimestamp(), 
      updatedAt: serverTimestamp() 
    });

    // 3. Write Phase: Increment Inventory
    transaction.update(itemRef, { 
      availableQuantity: increment(1), 
      updatedAt: serverTimestamp() 
    });

    // 4. Write Phase: Record Sale & Ledger IF paying on return
    if (booking.paymentStatus === 'unpaid' && booking.totalCost > 0) {
      const subtotalCentavos = booking.totalCost * 100;
      const finalCentavos = Math.max(0, subtotalCentavos - discountCentavos);
      
      const salesRef = collection(db, 'tenants', tenantId, 'sales');
      const newSaleRef = doc(salesRef);
      
      const saleRecord: Record<string, unknown> = {
        id: newSaleRef.id,
        tenantId,
        module: 'rental',
        items: [{ productId: booking.itemId, name: `Rental Return: ${booking.itemName}`, price: subtotalCentavos, quantity: 1 }],
        subtotalAmount: subtotalCentavos,
        discountAmount: discountCentavos,
        discountType: discountType || 'none',
        discountReason,
        totalAmount: finalCentavos,
        paymentMethod: paymentMethod || 'cash',
        createdAt: serverTimestamp()
      };
      if (gcashRef) saleRecord.gcashRef = gcashRef;

      transaction.set(newSaleRef, saleRecord);

      // Ledger update
      if (masterAccountSnap) {
        if (!masterAccountSnap.exists()) {
          transaction.set(masterAccountRef, {
            id: 'master-cash',
            tenantId,
            name: 'Main Cash Register',
            type: 'asset',
            balance: finalCentavos,
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } else {
          transaction.update(masterAccountRef, {
            balance: increment(finalCentavos),
            updatedAt: serverTimestamp()
          });
        }
        
        // Log to unified transactions for Ulat ng Negosyo
        const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
        const newTxRef = doc(transactionsRef);
        transaction.set(newTxRef, {
          id: newTxRef.id,
          tenantId,
          accountId: 'master-cash',
          amount: finalCentavos,
          type: 'income',
          category: 'Rental',
          description: `Rental Return Payment (${paymentMethod || 'cash'})`,
          date: new Date(),
          createdAt: serverTimestamp()
        });
      }
    }
  });

  if (discountCentavos > 0 && userId && userName) {
    await logAuditEvent(tenantId, userId, userName, {
      type: 'apply_discount',
      description: `Applied ${discountType === 'percentage' ? 'percentage' : 'fixed'} discount of ₱${(discountCentavos / 100).toFixed(2)} to rental return. Reason: ${discountReason || 'None'}`,
      meta: { bookingId: booking.id, discountCentavos, discountType, discountReason, shiftId }
    });
  }
}

export async function deleteRentalBooking(
  tenantId: string,
  bookingId: string,
  userId: string,
  userName: string
): Promise<void> {
  const db = getKatuwangDb();
  await runTransactionResilient(db, async (transaction) => {
    // 1. Read Phase
    const bookingRef = doc(db, 'tenants', tenantId, 'rental_bookings', bookingId);
    const bookingSnap = await transaction.get(bookingRef);

    if (!bookingSnap.exists()) {
      throw new Error("Booking does not exist.");
    }
    const booking = bookingSnap.data();

    let masterAccountSnap = null;
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');

    if (booking.paymentStatus === 'paid' && booking.totalCost > 0) {
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    // 2. Inventory Adjustment
    if (booking.status === 'active') {
      const itemRef = doc(db, 'tenants', tenantId, 'rental_inventory', booking.itemId);
      transaction.update(itemRef, {
        availableQuantity: increment(1),
        updatedAt: serverTimestamp()
      });
    }

    // 3. Cash Reversal
    if (booking.paymentStatus === 'paid' && booking.totalCost > 0) {
      const centavoAmount = booking.totalCost * 100;
      if (masterAccountSnap && masterAccountSnap.exists()) {
        transaction.update(masterAccountRef, {
          balance: increment(-centavoAmount),
          updatedAt: serverTimestamp()
        });

        const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
        const newTxRef = doc(transactionsRef);
        transaction.set(newTxRef, {
          id: newTxRef.id,
          tenantId,
          accountId: 'master-cash',
          amount: -centavoAmount,
          type: 'expense',
          category: 'Refund',
          description: `Void Rental Booking (${booking.itemName})`,
          date: new Date(),
          createdAt: serverTimestamp()
        });
      }
    }

    // 4. Delete the booking
    transaction.delete(bookingRef);

    // 5. Audit Log
    const { logAuditEvent } = await import('@/firebase/firestore/audit-actions');
    await logAuditEvent(tenantId, userId, userName, {
      type: 'void_transaction',
      description: `Voided Rental Booking: ${booking.customerName} - ${booking.itemName}`,
      meta: {
        module: 'rental',
        targetId: bookingId,
        totalCost: booking.totalCost,
        status: booking.status,
        reason: 'User deleted/voided booking via Dashboard'
      }
    });
  });
}
