import { 
  doc, 
  serverTimestamp, 
  collection,
} from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { ProductSchema, InventoryTransactionSchema } from '@/lib/schemas/inventory';
import { runTransactionResilient } from './resilient-transaction';

/**
 * Atomic stock adjustment
 * 1. Updates currentStock in 'products' document
 * 2. Records history in 'inventory_transactions' collection
 */
export async function adjustStock(
  productId: string, 
  tenantId: string, 
  userId: string,
  payload: {
    type: 'sale' | 'restock' | 'adjustment' | 'return';
    quantity: number; // Positive for restock, negative for sale
    note?: string;
  }
) {
  const { db } = initializeFirebase();
  const productRef = doc(db, 'tenants', tenantId, 'products', productId);
  const transactionRef = doc(collection(db, 'tenants', tenantId, 'inventory_transactions'));

  try {
    const updatedStock = await runTransactionResilient(db, async (transaction) => {
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists()) {
        throw new Error('Product not found');
      }

      const currentData = productSnap.data();
      const newStock = (currentData.currentStock || 0) + payload.quantity;

      if (newStock < 0) {
        throw new Error('Insufficient stock for this transaction');
      }

      // Validate transaction log data
      const logData = InventoryTransactionSchema.parse({
        tenantId,
        productId,
        type: payload.type,
        quantity: payload.quantity,
        balanceAfter: newStock,
        note: payload.note || '',
        performedBy: userId,
      });

      // Update Product
      transaction.update(productRef, {
        currentStock: newStock,
        updatedAt: serverTimestamp()
      });

      // Log Transaction
      transaction.set(transactionRef, {
        ...logData,
        createdAt: serverTimestamp()
      });

      return newStock;
    });

    return { success: true, newStock: updatedStock };
  } catch (error: any) {
    console.error('Inventory transaction failed:', error);
    throw new Error(error.message || 'Inventory update failed');
  }
}

/**
 * Creates a new product in the tenant's inventory
 */
export async function addProduct(tenantId: string, productData: any) {
  const { db } = initializeFirebase();
  const productRef = doc(collection(db, 'tenants', tenantId, 'products'));
  
  // Validate data before writing
  const validatedData = ProductSchema.parse({
    ...productData,
    tenantId,
  });

  await runTransactionResilient(db, async (transaction) => {
    transaction.set(productRef, {
      ...validatedData,
      id: productRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  
  return productRef.id;
}
