import { doc, collection, serverTimestamp, increment } from 'firebase/firestore';
import { initializeFirebase } from '../index';

export const getKatuwangDb = () => initializeFirebase().db;
import { runTransactionResilient } from './resilient-transaction';
import { EventModel } from '@/lib/schemas/events';

export async function completeEvent(
  tenantId: string,
  eventId: string,
  amountCentavos: number,
  description: string
) {
  if (amountCentavos < 0 || isNaN(amountCentavos)) {
    throw new Error('Invalid payment amount.');
  }

  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const eventRef = doc(db, 'tenants', tenantId, 'events', eventId);
    const eventSnap = await transaction.get(eventRef);

    if (!eventSnap.exists()) {
      throw new Error('Event not found.');
    }

    const eventData = eventSnap.data();
    // 2D: Compute the remaining balance server-side (do not trust caller's amountCentavos)
    const contractPrice = eventData.contractPrice || 0;
    const alreadyPaid = eventData.amountPaid || 0;
    const remainingBalance = Math.max(0, contractPrice - alreadyPaid);
    const finalAmount = remainingBalance > 0 ? remainingBalance : amountCentavos;

    // Update the Event Status and mark as fully paid
    transaction.update(eventRef, { 
      status: 'Done',
      amountPaid: contractPrice,
      updatedAt: serverTimestamp()
    });

    // ERP INTEGRATION: Deposit the remaining balance into the Master Cash Ledger
    if (finalAmount > 0) {
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      
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
        amount: finalAmount, // Server-computed remaining balance
        type: 'income',
        category: 'Events',
        description,
        date: new Date(),
        createdAt: serverTimestamp()
      });
    }
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

    // Update Vendor Status
    vendors[vendorIdx].status = 'Paid';
    transaction.update(eventRef, { 
      vendors,
      updatedAt: serverTimestamp()
    });

    // ERP INTEGRATION: Deduct the money from the Master Cash Ledger
    if (vendorCostCentavos > 0) {
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      
      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: -vendorCostCentavos, // Initialize with negative if it didn't exist
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
