import { getFirestore, doc, collection, serverTimestamp, setDoc, increment } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { FoodOrderSchema } from '@/lib/schemas/food';
import { runTransactionResilient } from './resilient-transaction';

export const getKatuwangDb = () => initializeFirebase().db;

export async function addFoodOrder(tenantId: string, tableNumber: string, items: any[], discountCentavos: number = 0, customerPhone?: string, referrerCode?: string, paymentMethod: string = 'cash', gcashRef?: string) {
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
      secureTotalAmount += Math.round(secureDbPrice * item.quantity);
      
      // Enforce the secure price inside the items array we will save
      validatedItems.push({
        ...item,
        price: secureDbPrice
      });
    }

    const finalAmount = Math.max(0, secureTotalAmount - discountCentavos);

    // Read Phase for Ledger
    let masterAccountSnap: any = null;
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    if (finalAmount > 0) {
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    // Validate using Zod schema
    const validated = FoodOrderSchema.parse({
      tenantId,
      orderNumber: `A${Date.now() % 100000}`, // Time-based — collision-resistant in busy kitchens
      tableNumber,
      orderType: 'dine_in',
      status: 'pending',
      items: validatedItems,
      totalAmount: finalAmount, // Secure server calculated total minus discount
      customerPhone,
      referrerCode,
    });

    const ordersRef = collection(db, 'tenants', tenantId, 'food_orders');
    const newOrderRef = doc(ordersRef);
    orderId = newOrderRef.id;

    transaction.set(newOrderRef, {
      ...validated,
      id: newOrderRef.id,
      paymentMethod,
      createdAt: serverTimestamp(),
    });

    // Write Phase for Ledger & Analytics
    if (finalAmount > 0 && masterAccountSnap) {
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
        description: `Food Order: ${tableNumber || 'Takeout'} (${paymentMethod})`,
        date: new Date(),
        createdAt: serverTimestamp()
      });

      const salesRef = collection(db, 'tenants', tenantId, 'sales');
      const newSaleRef = doc(salesRef);
      const saleRecord: Record<string, unknown> = {
        id: newSaleRef.id,
        tenantId,
        module: 'food',
        items: validatedItems,
        totalAmount: finalAmount,
        paymentMethod: paymentMethod,
        createdAt: serverTimestamp()
      };
      if (gcashRef) saleRecord.gcashRef = gcashRef;
      transaction.set(newSaleRef, saleRecord);
    }
  });

  return orderId;
}

export async function updateFoodOrderStatus(tenantId: string, orderId: string, newStatus: 'pending' | 'preparing' | 'served' | 'paid', amountCentavos?: number, tableNumber?: string) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    // --- READ PHASE ---
    const orderRef = doc(db, 'tenants', tenantId, 'food_orders', orderId);
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error("Order not found");
    const orderData = orderSnap.data();
    
    if (orderData.status === newStatus) {
      return; // Prevent double-execution
    }

    // Read Phase: Pre-fetch Menu items for Recipe Yield Deduction
    const menuSnaps: Record<string, any> = {};
    if (newStatus === 'served' && orderData.items && Array.isArray(orderData.items)) {
      for (const item of orderData.items) {
        if (!menuSnaps[item.menuItemId]) {
          const menuRef = doc(db, 'tenants', tenantId, 'menu_items', item.menuItemId);
          const snap = await transaction.get(menuRef);
          if (snap.exists()) {
            menuSnaps[item.menuItemId] = snap.data();
          }
        }
      }
    }

    // --- WRITE PHASE ---
    const updateData: any = { 
      status: newStatus,
      updatedAt: serverTimestamp()
    };
    transaction.update(orderRef, updateData);

    // RECIPE YIELD DEDUCTION: If the food is SERVED, deduct raw ingredients
    if (newStatus === 'served' && orderData.items && Array.isArray(orderData.items)) {
      for (const item of orderData.items) {
        const menuData = menuSnaps[item.menuItemId];
        if (menuData && menuData.recipe && Array.isArray(menuData.recipe)) {
          for (const req of menuData.recipe) {
            const ingRef = doc(db, 'tenants', tenantId, 'ingredients', req.ingredientId);
            const deductAmount = req.amount * item.quantity;
            transaction.update(ingRef, {
              currentStock: increment(-deductAmount),
              updatedAt: serverTimestamp()
            });
          }
        }
      }
    }
  });

  return true;
}

export async function deleteFoodOrder(
  tenantId: string,
  orderId: string,
  userId: string,
  userName: string
) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const orderRef = doc(db, 'tenants', tenantId, 'food_orders', orderId);
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error("Order not found.");
    
    const orderData = orderSnap.data();
    
    // Reverse ingredients if served
    if (orderData.status === 'served' && orderData.items && Array.isArray(orderData.items)) {
      for (const item of orderData.items) {
        const menuRef = doc(db, 'tenants', tenantId, 'menu_items', item.menuItemId);
        const menuSnap = await transaction.get(menuRef);
        if (menuSnap.exists()) {
          const menuData = menuSnap.data();
          if (menuData.recipe && Array.isArray(menuData.recipe)) {
            for (const req of menuData.recipe) {
              const ingRef = doc(db, 'tenants', tenantId, 'ingredients', req.ingredientId);
              const deductAmount = req.amount * item.quantity;
              transaction.update(ingRef, {
                currentStock: increment(deductAmount),
                updatedAt: serverTimestamp()
              });
            }
          }
        }
      }
    }
    
    transaction.delete(orderRef);
    
    // Log the void
    const { logAuditEvent } = await import('./audit-actions');
    logAuditEvent(tenantId, userId, userName, {
      type: 'void_sale',
      description: `Voided/Deleted food order #${orderData.orderNumber || orderId}.`,
      meta: { orderId }
    });
  });

  return true;
}
