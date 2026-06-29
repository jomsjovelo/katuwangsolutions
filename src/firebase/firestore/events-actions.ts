import { doc, collection, serverTimestamp, increment } from 'firebase/firestore';
import { initializeFirebase } from '../index';

export const getKatuwangDb = () => initializeFirebase().db;
import { runTransactionResilient } from './resilient-transaction';
import { EventModel } from '@/lib/schemas/events';

export async function completeEvent(
  tenantId: string,
  eventId: string,
  amountCentavos: number,
  description: string,
  discountCentavos: number = 0,
  discountType?: 'percentage' | 'fixed'
) {
  if (amountCentavos < 0 || isNaN(amountCentavos)) {
    throw new Error('Invalid payment amount.');
  }

  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    // 1. Gather all reads first
    const eventRef = doc(db, 'tenants', tenantId, 'events', eventId);
    const eventSnap = await transaction.get(eventRef);
    if (!eventSnap.exists()) {
      throw new Error('Event not found.');
    }

    const eventData = eventSnap.data();
    const contractPrice = eventData.contractPrice || 0;
    const alreadyPaid = eventData.amountPaid || 0;
    const remainingBalance = Math.max(0, contractPrice - alreadyPaid);
    let finalAmount = remainingBalance > 0 ? remainingBalance : amountCentavos;
    const subtotalAmount = finalAmount;
    finalAmount = Math.max(0, finalAmount - discountCentavos);

    let masterAccountSnap = null;
    let masterAccountRef = null;
    if (finalAmount > 0) {
      masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    // 2. Perform all writes
    // Update the Event Status and mark as fully paid
    transaction.update(eventRef, { 
      status: 'Done',
      amountPaid: contractPrice,
      updatedAt: serverTimestamp()
    });

    // ERP INTEGRATION: Deposit the remaining balance into the Master Cash Ledger
    if (finalAmount > 0 && masterAccountRef && masterAccountSnap) {
      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: finalAmount,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.update(masterAccountRef, {
          balance: increment(finalAmount),
          updatedAt: serverTimestamp()
        });
      }

      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: finalAmount,
        type: 'income',
        category: 'Events',
        description,
        date: new Date(),
        createdAt: serverTimestamp()
      });

      // SYNC TO GLOBAL ANALYTICS
      const salesRef = collection(db, 'tenants', tenantId, 'sales');
      const newSaleRef = doc(salesRef);
      transaction.set(newSaleRef, {
        id: newSaleRef.id,
        tenantId,
        module: 'events',
        items: [{ productId: eventId, name: description, price: subtotalAmount, quantity: 1 }],
        subtotalAmount: subtotalAmount,
        discountAmount: discountCentavos,
        discountType: discountType || 'none',
        totalAmount: finalAmount,
        paymentMethod: 'cash',
        createdAt: serverTimestamp()
      });
    }
  });

  return true;
}

export async function recordEventPayment(
  tenantId: string,
  eventId: string,
  paymentCentavos: number,
  description: string,
  discountCentavos: number = 0,
  discountType?: 'percentage' | 'fixed'
) {
  if (paymentCentavos <= 0 || isNaN(paymentCentavos)) {
    throw new Error('Invalid payment amount.');
  }

  const db = getKatuwangDb();

  await runTransactionResilient(db, async (transaction) => {
    // 1. Gather all reads
    const eventRef = doc(db, 'tenants', tenantId, 'events', eventId);
    const eventSnap = await transaction.get(eventRef);
    if (!eventSnap.exists()) {
      throw new Error('Event not found.');
    }

    const eventData = eventSnap.data() as EventModel;
    const contractPrice = eventData.contractPrice || 0;
    const alreadyPaid = eventData.amountPaid || 0;
    const remainingBalance = Math.max(0, contractPrice - alreadyPaid);

    const subtotalAmount = paymentCentavos;
    const finalAmount = Math.max(0, paymentCentavos - discountCentavos);

    if (finalAmount > remainingBalance) {
      throw new Error(`Sobra: Payment exceeds the remaining balance.`);
    }

    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    const masterAccountSnap = await transaction.get(masterAccountRef);

    // 2. Perform writes
    transaction.update(eventRef, {
      amountPaid: alreadyPaid + finalAmount + discountCentavos,
      updatedAt: serverTimestamp(),
      ...(finalAmount + discountCentavos >= remainingBalance ? { status: 'completed' as const } : {})
    });

    // Deposit to Master Cash
    if (finalAmount > 0) {
      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: finalAmount,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.update(masterAccountRef, {
          balance: increment(finalAmount),
          updatedAt: serverTimestamp()
        });
      }
    }

    // Record Ledger Entry
    if (finalAmount > 0) {
      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: finalAmount,
        type: 'income',
        category: 'Events',
        description,
        date: new Date(),
        createdAt: serverTimestamp()
      });
    }

    // SYNC TO GLOBAL ANALYTICS
    const salesRef = collection(db, 'tenants', tenantId, 'sales');
    const newSaleRef = doc(salesRef);
    transaction.set(newSaleRef, {
      id: newSaleRef.id,
      tenantId,
      module: 'events',
      items: [{ productId: eventId, name: description, price: subtotalAmount, quantity: 1 }],
      subtotalAmount: subtotalAmount,
      discountAmount: discountCentavos,
      discountType: discountType || 'none',
      totalAmount: finalAmount,
      paymentMethod: 'cash',
      createdAt: serverTimestamp()
    });
  });

  return true;
}

export async function payEventVendor(
  tenantId: string,
  eventId: string,
  vendorIdx: number,
  vendorCostCentavos: number,
  description: string
) {
  if (vendorCostCentavos < 0 || isNaN(vendorCostCentavos)) {
    throw new Error('Invalid vendor cost.');
  }

  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    // 1. Gather all reads first
    const eventRef = doc(db, 'tenants', tenantId, 'events', eventId);
    const eventSnap = await transaction.get(eventRef);
    if (!eventSnap.exists()) {
      throw new Error('Event not found.');
    }

    const eventData = eventSnap.data() as EventModel;
    const vendors = eventData.vendors || [];
    
    if (!vendors[vendorIdx]) {
      throw new Error('Vendor not found.');
    }

    if (vendors[vendorIdx].status === 'Paid') {
      throw new Error('Vendor is already paid.');
    }

    let masterAccountSnap = null;
    let masterAccountRef = null;
    if (vendorCostCentavos > 0) {
      masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    // 2. Perform all writes
    // Update Vendor Status
    vendors[vendorIdx].status = 'Paid';
    transaction.update(eventRef, { 
      vendors,
      updatedAt: serverTimestamp()
    });

    // ERP INTEGRATION: Deduct the money from the Master Cash Ledger
    if (vendorCostCentavos > 0 && masterAccountRef && masterAccountSnap) {
      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: -vendorCostCentavos,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.update(masterAccountRef, {
          balance: increment(-vendorCostCentavos),
          updatedAt: serverTimestamp()
        });
      }

      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: vendorCostCentavos,
        type: 'expense',
        category: 'Event Vendor',
        description,
        date: new Date(),
        createdAt: serverTimestamp()
      });
    }
  });

  return true;
}

export async function addGuestToEvent(
  tenantId: string,
  eventId: string,
  guestName: string,
  tableOrSeat: string,
  mealPref: string
) {
  if (!guestName.trim()) throw new Error('Guest name is required.');

  const db = getKatuwangDb();
  const guestsRef = collection(db, 'tenants', tenantId, 'events', eventId, 'guests');
  const newGuestRef = doc(guestsRef);

  const { setDoc } = await import('firebase/firestore');
  await setDoc(newGuestRef, {
    id: newGuestRef.id,
    name: guestName.trim(),
    tableOrSeat: tableOrSeat.trim() || 'TBD',
    mealPref: mealPref.trim() || 'None',
    checkedIn: false,
    createdAt: serverTimestamp(),
  });

  return newGuestRef.id;
}

export async function toggleGuestCheckIn(
  tenantId: string,
  eventId: string,
  guestId: string,
  checkedIn: boolean
) {
  const db = getKatuwangDb();
  const { updateDoc } = await import('firebase/firestore');
  const guestRef = doc(db, 'tenants', tenantId, 'events', eventId, 'guests', guestId);
  await updateDoc(guestRef, {
    checkedIn,
    checkedInAt: checkedIn ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEvent(
  tenantId: string,
  eventId: string,
  userId: string,
  userName: string
) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const eventRef = doc(db, 'tenants', tenantId, 'events', eventId);
    const eventSnap = await transaction.get(eventRef);
    if (!eventSnap.exists()) throw new Error("Event not found.");
    
    const eventData = eventSnap.data() as EventModel;
    const amountPaid = eventData.amountPaid || 0;
    
    // Reverse the payments made (from Master Cash)
    if (amountPaid > 0) {
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      if (masterAccountSnap.exists()) {
        transaction.update(masterAccountRef, {
          balance: increment(-amountPaid),
          updatedAt: serverTimestamp()
        });
      }
    }
    
    transaction.delete(eventRef);
    
    const { logAuditEvent } = await import('./audit-actions');
    logAuditEvent(tenantId, userId, userName, {
      type: 'void_transaction',
      description: `Deleted Event "${eventData.title}" and refunded ₱${(amountPaid / 100).toFixed(2)}.`,
      meta: { eventId, amountRefunded: amountPaid }
    });
  });
  
  return true;
}
