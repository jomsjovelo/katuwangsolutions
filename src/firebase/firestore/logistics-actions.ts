import { getFirestore, doc, collection, serverTimestamp, setDoc, increment } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { TripSchema } from '@/lib/schemas/logistics';
import { runTransactionResilient } from './resilient-transaction';

export const getKatuwangDb = () => initializeFirebase().db;

export async function addTrip(tenantId: string, origin: string, destination: string, loadDescription: string, driverName: string, plateNumber: string, deliveryFeeCentavos: number) {
  if (deliveryFeeCentavos < 0 || isNaN(deliveryFeeCentavos)) {
    throw new Error('Invalid delivery fee.');
  }
  const db = getKatuwangDb();
  
  // Validate using Zod schema
  const validated = TripSchema.parse({
    tenantId,
    origin,
    destination,
    loadDescription,
    driverName,
    plateNumber,
    deliveryFee: deliveryFeeCentavos,
    tripExpenses: 0,
    status: 'planned',
  });

  const tripsRef = collection(db, 'tenants', tenantId, 'trips');
  const newTripRef = doc(tripsRef);

  await setDoc(newTripRef, {
    ...validated,
    id: newTripRef.id,
    createdAt: serverTimestamp(),
  });

  return newTripRef.id;
}

export async function updateTripExpenses(tenantId: string, tripId: string, additionalExpensesCentavos: number) {
  if (additionalExpensesCentavos <= 0 || isNaN(additionalExpensesCentavos)) {
    throw new Error('Invalid expense amount.');
  }
  const db = getKatuwangDb();
  await runTransactionResilient(db, async (transaction) => {
    const tripRef = doc(db, 'tenants', tenantId, 'trips', tripId);
    const tripSnap = await transaction.get(tripRef);
    if (!tripSnap.exists()) throw new Error('Trip not found');
    
    transaction.update(tripRef, {
      tripExpenses: increment(additionalExpensesCentavos),
      updatedAt: serverTimestamp()
    });
  });
}

export async function updateTripStatus(tenantId: string, tripId: string, newStatus: 'planned' | 'loading' | 'in_transit' | 'arrived' | 'completed' | 'cancelled', signatureData?: string, paymentMethod: string = 'cash') {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const tripRef = doc(db, 'tenants', tenantId, 'trips', tripId);
    const tripSnap = await transaction.get(tripRef);
    if (!tripSnap.exists()) throw new Error('Trip not found');
    const tripData = tripSnap.data();
    
    // 1. Gather all reads
    let masterAccountSnap = null;
    let masterAccountRef = null;
    const deliveryFee = tripData.deliveryFee || 0;
    const tripExpenses = tripData.tripExpenses || 0;

    if (newStatus === 'completed' && (deliveryFee > 0 || tripExpenses > 0)) {
      masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    // 2. Perform all writes
    // Update the Trip Status
    const updatePayload: any = {
      status: newStatus,
      updatedAt: serverTimestamp()
    };
    if (signatureData) {
      updatePayload.signatureData = signatureData;
    }
    
    transaction.update(tripRef, updatePayload);

    // ERP INTEGRATION: If the trip is completed, deposit the delivery fee into the Ledger
    // AND deduct the trip expenses (Gas/Toll)
    if (newStatus === 'completed' && masterAccountRef && masterAccountSnap) {
      const revenue = deliveryFee;
      const netImpact = revenue - tripExpenses;

      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: netImpact,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        // Apply net impact to balance atomically
        transaction.update(masterAccountRef, {
          balance: increment(netImpact),
          updatedAt: serverTimestamp()
        });
      }

      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');

      // Record the Income
      if (revenue > 0) {
        const newTxRef = doc(transactionsRef);
        transaction.set(newTxRef, {
          id: newTxRef.id,
          tenantId,
          accountId: 'master-cash',
          amount: revenue,
          type: 'income',
          category: 'Sales',
          description: `Delivery Fee to: ${tripData.destination || 'Client'} (${paymentMethod})`,
          date: new Date(),
          createdAt: serverTimestamp()
        });

        const salesRef = collection(db, 'tenants', tenantId, 'sales');
        const newSaleRef = doc(salesRef);
        transaction.set(newSaleRef, {
          id: newSaleRef.id,
          tenantId,
          module: 'logistics',
          items: [{ name: `Delivery: ${tripData.origin} to ${tripData.destination}`, quantity: 1, price: revenue }],
          totalAmount: revenue,
          paymentMethod: paymentMethod,
          createdAt: serverTimestamp()
        });
      }

      // Record the Expense
      if (tripExpenses > 0) {
        const expenseTxRef = doc(transactionsRef);
        transaction.set(expenseTxRef, {
          id: expenseTxRef.id,
          tenantId,
          accountId: 'master-cash',
          amount: tripExpenses,
          type: 'expense',
          category: 'Transport',
          description: `Gas/Toll: ${tripData.destination || 'Client'}`,
          date: new Date(),
          createdAt: serverTimestamp()
        });
      }
    }
  });

  return true;
}

export async function deleteTrip(
  tenantId: string,
  tripId: string,
  userId: string,
  userName: string
): Promise<void> {
  const db = getKatuwangDb();

  await runTransactionResilient(db, async (transaction) => {
    // 1. Read Phase
    const tripRef = doc(db, 'tenants', tenantId, 'trips', tripId);
    const tripSnap = await transaction.get(tripRef);

    if (!tripSnap.exists()) {
      throw new Error("Trip does not exist.");
    }

    const tripData = tripSnap.data();

    const deliveryFee = tripData.deliveryFee || 0;
    const tripExpenses = tripData.tripExpenses || 0;

    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    let masterAccountSnap = null;

    if (tripData.status === 'completed' && (deliveryFee > 0 || tripExpenses > 0)) {
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    // 2. Write Phase
    // Revert Cash
    if (tripData.status === 'completed' && masterAccountSnap && masterAccountSnap.exists()) {
      const netImpact = deliveryFee - tripExpenses;
      
      transaction.update(masterAccountRef, {
        balance: increment(-netImpact),
        updatedAt: serverTimestamp()
      });

      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');

      if (deliveryFee > 0) {
        const newTxRef = doc(transactionsRef);
        transaction.set(newTxRef, {
          id: newTxRef.id,
          tenantId,
          accountId: 'master-cash',
          amount: -deliveryFee,
          type: 'expense',
          category: 'Refund',
          description: `Void Delivery Fee to: ${tripData.destination || 'Client'}`,
          date: new Date(),
          createdAt: serverTimestamp()
        });
      }

      if (tripExpenses > 0) {
        const expenseTxRef = doc(transactionsRef);
        transaction.set(expenseTxRef, {
          id: expenseTxRef.id,
          tenantId,
          accountId: 'master-cash',
          amount: -tripExpenses, // It was deducted, now we refund the deduction
          type: 'income',
          category: 'Refund',
          description: `Void Gas/Toll Expense for Trip: ${tripData.destination || 'Client'}`,
          date: new Date(),
          createdAt: serverTimestamp()
        });
      }
    }

    // Delete the trip
    transaction.delete(tripRef);

    // Audit Log
    const { logAuditEvent } = await import('@/firebase/firestore/audit-actions');
    await logAuditEvent(tenantId, userId, userName, {
      type: 'void_sale', // Reusing void_sale for now
      description: `Voided Trip: ${tripData.origin} to ${tripData.destination}`,
      meta: {
        module: 'logistics',
        targetId: tripId,
        driver: tripData.driverName,
        status: tripData.status,
        deliveryFee,
        tripExpenses
      }
    });
  });
}
