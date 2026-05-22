import { getFirestore, doc, collection, serverTimestamp, setDoc } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { FoodOrderSchema } from '@/lib/schemas/food';
import { runTransactionResilient } from './resilient-transaction';

export const getKatuwangDb = () => initializeFirebase().db;

export async function addFoodOrder(tenantId: string, tableNumber: string, items: any[], totalAmountCentavos: number) {
  const db = getKatuwangDb();
  
  // Validate using Zod schema
  const validated = FoodOrderSchema.parse({
    tenantId,
    orderNumber: `A${Math.floor(Math.random() * 90) + 10}`, // Random order number A10-A99
    tableNumber,
    orderType: 'dine_in',
    status: 'pending',
    items,
    totalAmount: totalAmountCentavos,
  });

  const ordersRef = collection(db, 'tenants', tenantId, 'food_orders');
  const newOrderRef = doc(ordersRef);

  await setDoc(newOrderRef, {
    ...validated,
    id: newOrderRef.id,
    createdAt: serverTimestamp(),
  });

  return newOrderRef.id;
}

export async function updateFoodOrderStatus(tenantId: string, orderId: string, newStatus: 'pending' | 'preparing' | 'served' | 'paid', amountCentavos?: number, tableNumber?: string) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const orderRef = doc(db, 'tenants', tenantId, 'food_orders', orderId);
    
    // Update the Order Status
    const updateData: any = { 
      status: newStatus,
      updatedAt: serverTimestamp()
    };
    
    transaction.update(orderRef, updateData);

    // ERP INTEGRATION: If the food is served (or paid), automatically deposit the money into the Master Cash Ledger!
    if (newStatus === 'served' && amountCentavos && amountCentavos > 0) {
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
        description: `Food Order: ${tableNumber || 'Takeout'}`,
        date: new Date(),
        createdAt: serverTimestamp()
      });
    }
  });

  return true;
}
