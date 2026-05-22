import { getFirestore, doc, collection, serverTimestamp, setDoc } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { TripSchema } from '@/lib/schemas/logistics';
import { runTransactionResilient } from './resilient-transaction';

export const getKatuwangDb = () => initializeFirebase().db;

export async function addTrip(tenantId: string, origin: string, destination: string, loadDescription: string) {
  const db = getKatuwangDb();
  
  // Validate using Zod schema
  const validated = TripSchema.parse({
    tenantId,
    origin,
    destination,
    loadDescription,
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

export async function updateTripStatus(tenantId: string, tripId: string, newStatus: 'planned' | 'loading' | 'in_transit' | 'arrived' | 'completed' | 'cancelled', amountCentavos?: number, destination?: string) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const tripRef = doc(db, 'tenants', tenantId, 'trips', tripId);
    
    // Update the Trip Status
    const updateData: any = { 
      status: newStatus,
      updatedAt: serverTimestamp()
    };
    
    transaction.update(tripRef, updateData);

    // ERP INTEGRATION: If the trip is completed, automatically deposit the delivery fee into the Master Cash Ledger!
    if (newStatus === 'completed' && amountCentavos && amountCentavos > 0) {
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

      // Add the income to the balance
      transaction.update(masterAccountRef, {
        balance: currentBalance + amountCentavos,
        updatedAt: serverTimestamp()
      });

      // Record the transaction receipt
      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: amountCentavos,
        type: 'income',
        description: `Delivery Fee to: ${destination || 'Client'}`,
        date: new Date(),
        createdAt: serverTimestamp()
      });
    }
  });

  return true;
}
