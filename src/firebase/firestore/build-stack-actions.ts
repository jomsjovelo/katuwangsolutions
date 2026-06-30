import { doc, collection, serverTimestamp, increment } from 'firebase/firestore';
import { getKatuwangDb } from './retail-actions';
import { runTransactionResilient } from './resilient-transaction';
import { CartItem } from './retail-actions';

export async function processBatchDispatch(
  tenantId: string, 
  projectId: string, 
  projectName: string, 
  cartItems: CartItem[], 
  userId: string = 'admin'
) {
  if (!tenantId) throw new Error("Tenant ID is required.");
  if (!projectId) throw new Error("Please select an active project.");
  if (!cartItems || cartItems.length === 0) throw new Error("Cart is empty.");

  const db = getKatuwangDb();

  await runTransactionResilient(db, async (transaction) => {
    // 1. Read Phase
    const productDocs: Record<string, { ref: ReturnType<typeof doc>; newStock: number }> = {};
    let totalDispatchCost = 0;

    for (const item of cartItems) {
      if (item.quantity <= 0) throw new Error(`Invalid quantity for ${item.name}.`);

      const productRef = doc(db, 'tenants', tenantId, 'products', item.productId);
      const productSnap = await transaction.get(productRef);
      
      if (!productSnap.exists()) {
        throw new Error(`Product ${item.name} does not exist.`);
      }
      
      const productData = productSnap.data();
      const currentStock = productData.currentStock || 0;
      const salePrice = productData.salePrice || 0;
      
      if (currentStock < item.quantity) {
        throw new Error(`Hindi sapat ang stock para sa ${item.name} (Available lang: ${currentStock}).`);
      }

      productDocs[item.productId] = {
        ref: productRef,
        newStock: currentStock - item.quantity
      };

      totalDispatchCost += Math.round(salePrice * item.quantity);
    }

    const projectRef = doc(db, 'tenants', tenantId, 'projects', projectId);
    const projectSnap = await transaction.get(projectRef);
    if (!projectSnap.exists()) {
      throw new Error(`Project does not exist.`);
    }

    // 2. Write Phase
    
    // Update Project Cost
    transaction.update(projectRef, {
      totalMaterialCost: increment(totalDispatchCost),
      updatedAt: serverTimestamp()
    });

    const descriptionItems = [];

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
        type: 'dispatch',
        quantity: -item.quantity,
        projectId,
        balanceAfter: pDoc.newStock,
        performedBy: userId,
        createdAt: serverTimestamp()
      });

      descriptionItems.push(`${item.quantity}x ${item.name}`);
    }

    const fullDescription = descriptionItems.join(', ');

    // Add Global Analytics Sync (B2B Sale on Credit)
    const salesRef = collection(db, 'tenants', tenantId, 'sales');
    const newSaleRef = doc(salesRef);
    transaction.set(newSaleRef, {
      id: newSaleRef.id,
      tenantId,
      module: 'build-stack',
      items: cartItems.map(item => ({ 
        name: `${item.quantity}x ${item.name} to ${projectName}`, 
        quantity: item.quantity, 
        price: item.price 
      })),
      totalAmount: totalDispatchCost,
      paymentMethod: 'palista', // It's a credit sale for the project
      createdAt: serverTimestamp()
    });

    // Record it in the unified Credit Tracker
    const creditsRef = collection(db, 'tenants', tenantId, 'retail_credits');
    const newCreditRef = doc(creditsRef);
    transaction.set(newCreditRef, {
      id: newCreditRef.id,
      tenantId,
      type: 'receivable',
      name: `Project: ${projectName}`,
      amount: totalDispatchCost,
      paidAmount: 0,
      status: 'unpaid',
      creditDate: serverTimestamp(),
      relatedSaleId: newSaleRef.id,
      description: `Build Stack Dispatch: ${fullDescription}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}
