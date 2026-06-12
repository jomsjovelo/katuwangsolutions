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

export async function updateTripStatus(tenantId: string, tripId: string, newStatus: 'planned' | 'loading' | 'in_transit' | 'arrived' | 'completed' | 'cancelled', signatureData?: string, paymentMethod: 'cash' | 'palista' = 'cash') {
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

    // ERP INTEGRATION: If the trip is completed, deposit the delivery fee into the Ledger (if cash)
    // AND deduct the trip expenses (Gas/Toll)
    if (newStatus === 'completed' && masterAccountRef && masterAccountSnap) {
      // If payment was Palista, the fee was already charged to credit, so cash impact is only expenses
      const cashEarned = paymentMethod === 'cash' ? deliveryFee : 0;
      const netImpact = cashEarned - tripExpenses;

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
      if (cashEarned > 0) {
        const newTxRef = doc(transactionsRef);
        transaction.set(newTxRef, {
          id: newTxRef.id,
          tenantId,
          accountId: 'master-cash',
          amount: cashEarned,
          type: 'income',
          category: 'Sales',
          description: `Delivery Fee to: ${tripData.destination || 'Client'}`,
          date: new Date(),
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
