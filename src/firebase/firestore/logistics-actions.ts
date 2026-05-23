import { getFirestore, doc, collection, serverTimestamp, setDoc } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { TripSchema } from '@/lib/schemas/logistics';
import { runTransactionResilient } from './resilient-transaction';

export const getKatuwangDb = () => initializeFirebase().db;

export async function addTrip(tenantId: string, origin: string, destination: string, loadDescription: string, driverName: string, deliveryFeeCentavos: number) {
  const db = getKatuwangDb();
  
  // Validate using Zod schema
  const validated = TripSchema.parse({
    tenantId,
    origin,
    destination,
    loadDescription,
    driverName,
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
  const db = getKatuwangDb();
  await runTransactionResilient(db, async (transaction) => {
    const tripRef = doc(db, 'tenants', tenantId, 'trips', tripId);
    const tripSnap = await transaction.get(tripRef);
    if (!tripSnap.exists()) throw new Error('Trip not found');
    
    const currentExpenses = tripSnap.data().tripExpenses || 0;
    transaction.update(tripRef, {
      tripExpenses: currentExpenses + additionalExpensesCentavos,
      updatedAt: serverTimestamp()
    });
  });
}

export async function updateTripStatus(tenantId: string, tripId: string, newStatus: 'planned' | 'loading' | 'in_transit' | 'arrived' | 'completed' | 'cancelled') {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const tripRef = doc(db, 'tenants', tenantId, 'trips', tripId);
    const tripSnap = await transaction.get(tripRef);
    if (!tripSnap.exists()) throw new Error('Trip not found');
    const tripData = tripSnap.data();
    
    // Update the Trip Status
    transaction.update(tripRef, { 
      status: newStatus,
      updatedAt: serverTimestamp()
    });

    // ERP INTEGRATION: If the trip is completed, deposit the delivery fee into the Ledger
    // AND deduct the trip expenses (Gas/Toll)
    if (newStatus === 'completed') {
      const deliveryFee = tripData.deliveryFee || 0;
      const tripExpenses = tripData.tripExpenses || 0;
      
      if (deliveryFee > 0 || tripExpenses > 0) {
        const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
        const masterAccountSnap = await transaction.get(masterAccountRef);
        
        let currentBalance = 0;
        if (masterAccountSnap.exists()) {
          currentBalance = masterAccountSnap.data().balance || 0;
        } else {
          transaction.set(masterAccountRef, {
            id: 'master-cash',
            tenantId,
            name: 'Main Cash Register',
            type: 'asset',
            balance: 0,
            isActive: true,
            createdAt: serverTimestamp(),
          });
        }

        // Apply net impact to balance
        const newBalance = currentBalance + deliveryFee - tripExpenses;
        transaction.update(masterAccountRef, {
          balance: newBalance,
          updatedAt: serverTimestamp()
        });

        const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');

        // Record the Income
        if (deliveryFee > 0) {
          const newTxRef = doc(transactionsRef);
          transaction.set(newTxRef, {
            id: newTxRef.id,
            tenantId,
            accountId: 'master-cash',
            amount: deliveryFee,
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
    }
  });

  return true;
}
