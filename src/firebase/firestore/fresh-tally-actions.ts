import { doc, collection, serverTimestamp, increment } from 'firebase/firestore';
import { getKatuwangDb } from './retail-actions';
import { runTransactionResilient } from './resilient-transaction';
import { CartItem } from './retail-actions';

export async function processBatchWaste(
  tenantId: string, 
  cartItems: CartItem[], 
  reason: string,
  userId: string = 'admin'
) {
  if (!tenantId) throw new Error("Tenant ID is required.");
  if (!cartItems || cartItems.length === 0) throw new Error("Cart is empty.");

  const db = getKatuwangDb();

  await runTransactionResilient(db, async (transaction) => {
    // 1. Read Phase
    const productDocs: Record<string, { ref: ReturnType<typeof doc>; newStock: number }> = {};
    let totalWasteCost = 0;

    for (const item of cartItems) {
      if (item.quantity <= 0) throw new Error(`Invalid quantity for ${item.name}.`);

      const productRef = doc(db, 'tenants', tenantId, 'products', item.productId);
      const productSnap = await transaction.get(productRef);
      
      if (!productSnap.exists()) {
        throw new Error(`Product ${item.name} does not exist.`);
      }
      
      const productData = productSnap.data();
      const currentStock = productData.currentStock || 0;
      
      if (currentStock < item.quantity) {
        throw new Error(`Hindi sapat ang stock para sa ${item.name} (Available lang: ${currentStock}).`);
      }

      productDocs[item.productId] = {
        ref: productRef,
        newStock: currentStock - item.quantity
      };

      totalWasteCost += (productData.costPrice || 0) * item.quantity;
    }

    // 2. Write Phase
    for (const item of cartItems) {
      const pDoc = productDocs[item.productId];
      
      // Update inventory stock
      transaction.update(pDoc.ref, {
        currentStock: pDoc.newStock,
        updatedAt: serverTimestamp()
      });

      // Record transaction history
      const txRef = doc(collection(db, 'tenants', tenantId, 'inventory_transactions'));
      transaction.set(txRef, {
        tenantId,
        productId: item.productId,
        type: 'adjustment',
        quantity: -item.quantity,
        reason: `Fresh Tally Waste Log: ${reason}`,
        balanceAfter: pDoc.newStock,
        performedBy: userId,
        createdAt: serverTimestamp()
      });
    }

    // 3. Optional: we could log total waste cost globally if needed, 
    // but standard adjustment tx records the inventory drop nicely.
  });
}
