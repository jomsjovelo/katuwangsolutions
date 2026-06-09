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

/**
 * Updates an existing product in the tenant's inventory
 */
export async function updateProduct(tenantId: string, productId: string, productData: any) {
  const { db } = initializeFirebase();
  const productRef = doc(db, 'tenants', tenantId, 'products', productId);
  
  // Validate data before writing
  const validatedData = ProductSchema.parse({
    ...productData,
    id: productId,
    tenantId,
  });

  await runTransactionResilient(db, async (transaction) => {
    transaction.update(productRef, {
      ...validatedData,
      updatedAt: serverTimestamp()
    });
  });
  
  return true;
}

/**
 * Deletes a product from the tenant's inventory
 */
export async function deleteProduct(tenantId: string, productId: string) {
  const { db } = initializeFirebase();
  const productRef = doc(db, 'tenants', tenantId, 'products', productId);
  
  await runTransactionResilient(db, async (transaction) => {
    transaction.delete(productRef);
  });
  
  return true;
}

/**
 * Perform a physical inventory audit
 * Calculates shrinkage cost and adjusts stock to match actual count
 */
export async function logInventoryAudit(
  tenantId: string,
  userId: string,
  productId: string,
  expectedStock: number,
  actualStock: number,
  notes: string = ''
) {
  const { db } = initializeFirebase();
  const productRef = doc(db, 'tenants', tenantId, 'products', productId);
  const auditRef = doc(collection(db, 'tenants', tenantId, 'inventory_audits'));
  const transactionRef = doc(collection(db, 'tenants', tenantId, 'inventory_transactions'));

  try {
    const result = await runTransactionResilient(db, async (transaction) => {
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists()) {
        throw new Error('Product not found');
      }

      const product = productSnap.data();
      const difference = actualStock - expectedStock;
      
      // Calculate financial impact (negative cost = money lost)
      const shrinkCostCentavos = difference < 0 ? Math.abs(difference) * (product.costPrice || 0) : 0;

      // 1. Record Audit Event
      transaction.set(auditRef, {
        tenantId,
        productId,
        productName: product.name,
        expectedStock,
        actualStock,
        difference,
        shrinkCostCentavos,
        notes,
        performedBy: userId,
        createdAt: serverTimestamp()
      });

      // 2. Adjust Stock
      transaction.update(productRef, {
        currentStock: actualStock,
        updatedAt: serverTimestamp()
      });

      // 3. Log Transaction History
      const logData = InventoryTransactionSchema.parse({
        tenantId,
        productId,
        type: 'adjustment',
        quantity: difference,
        balanceAfter: actualStock,
        note: `Physical Audit: ${notes}`,
        performedBy: userId,
      });

      transaction.set(transactionRef, {
        ...logData,
        createdAt: serverTimestamp()
      });

      return { difference, shrinkCostCentavos };
    });

    return { success: true, ...result };
  } catch (error: any) {
    console.error('Inventory audit failed:', error);
    throw new Error(error.message || 'Inventory audit failed');
  }
}
