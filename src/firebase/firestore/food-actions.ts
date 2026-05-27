import { getFirestore, doc, collection, serverTimestamp, setDoc, increment } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { FoodOrderSchema } from '@/lib/schemas/food';
import { runTransactionResilient } from './resilient-transaction';

export const getKatuwangDb = () => initializeFirebase().db;

export async function addFoodOrder(tenantId: string, tableNumber: string, items: any[], totalAmountCentavos: number) {
  const db = getKatuwangDb();
  let orderId = '';
  
  await runTransactionResilient(db, async (transaction) => {
    let secureTotalAmount = 0;
    const validatedItems = [];

    // Read all menu items to calculate the real price
    for (const item of items) {
      if (item.quantity <= 0 || isNaN(item.quantity)) {
        throw new Error(`Invalid quantity for ${item.name}`);
      }

      const menuRef = doc(db, 'tenants', tenantId, 'menu_items', item.menuItemId);
      const menuSnap = await transaction.get(menuRef);
      
      if (!menuSnap.exists()) {
        throw new Error(`Menu item ${item.name} not found.`);
      }

      const secureDbPrice = menuSnap.data().price || 0;
      secureTotalAmount += secureDbPrice * item.quantity;
      
      // Enforce the secure price inside the items array we will save
      validatedItems.push({
        ...item,
        price: secureDbPrice
      });
    }

    // Validate using Zod schema
    const validated = FoodOrderSchema.parse({
      tenantId,
      orderNumber: `A${Math.floor(Math.random() * 90) + 10}`,
      tableNumber,
      orderType: 'dine_in',
      status: 'pending',
      items: validatedItems,
      totalAmount: secureTotalAmount, // Secure server calculated total
    });

    const ordersRef = collection(db, 'tenants', tenantId, 'food_orders');
    const newOrderRef = doc(ordersRef);
    orderId = newOrderRef.id;

    transaction.set(newOrderRef, {
      ...validated,
      id: newOrderRef.id,
      createdAt: serverTimestamp(),
    });
  });

  return orderId;
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
    if (newStatus === 'served' && amountCentavos !== undefined && amountCentavos > 0) {
      if (isNaN(amountCentavos)) {
        throw new Error("Invalid payment amount for ledger recording.");
      }

      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      
      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: amountCentavos, // Initialize with this amount
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        // Add the income to the balance safely using increment
        transaction.update(masterAccountRef, {
          balance: increment(amountCentavos),
          updatedAt: serverTimestamp()
        });
      }

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
