import { getFirestore, doc, collection, serverTimestamp, setDoc, increment, Timestamp } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { ProductSchema } from '@/lib/schemas/inventory';
import { runTransactionResilient } from './resilient-transaction';
import { logAuditEvent } from './audit-actions';

// Always explicitly use the 'katuwang' database
export const getKatuwangDb = () => initializeFirebase().db;

export interface CartItem {
  productId: string;
  name: string;
  price: number; // in centavos
  quantity: number;
}

export async function addProduct(tenantId: string, productData: any) {
  const db = getKatuwangDb();
  
  // Validate using Zod schema
  const validated = ProductSchema.parse({
    ...productData,
    tenantId,
  });

  const productsRef = collection(db, 'tenants', tenantId, 'products');
  const newProductRef = doc(productsRef); // Auto-generate ID

  await setDoc(newProductRef, {
    ...validated,
    id: newProductRef.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return newProductRef.id;
}


export async function processCheckout(
  tenantId: string,
  cart: CartItem[],
  totalAmountCentavos: number,
  paymentMethod: string = 'cash',
  gcashRef?: string,
  discountCentavos: number = 0,
  discountType?: 'percentage' | 'fixed',
  discountReason?: string,
  userId?: string,
  userName?: string,
  shiftId?: string
): Promise<string> {
  if (cart.length === 0) throw new Error('Cart is empty');

  const db = getKatuwangDb();
  let saleDocId = '';
  
  // We use runTransactionResilient to execute locally when offline and sync automatically
  await runTransactionResilient(db, async (transaction) => {
    let secureTotalAmount = 0;

    // 1. First, read all the product documents to ensure we have enough stock and get valid prices.
    const productDocs: Record<string, { ref: ReturnType<typeof doc>; newStock: number }> = {};
    for (const item of cart) {
      if (item.quantity <= 0 || isNaN(item.quantity)) {
        throw new Error(`Invalid quantity for ${item.name}.`);
      }

      // Bypass inventory check for custom/misc items
      if (item.productId.startsWith('misc-')) {
        // For misc items, we trust the client price since there is no server truth
        secureTotalAmount += Math.round(item.price * item.quantity);
        continue;
      }

      const productRef = doc(db, 'tenants', tenantId, 'products', item.productId);
      const productSnap = await transaction.get(productRef);
      
      if (!productSnap.exists()) {
        throw new Error(`Product ${item.name} does not exist.`);
      }
      
      const productData = productSnap.data();
      const currentStock = productData.currentStock || 0;
      const secureDbPrice = productData.salePrice || 0;

      if (currentStock < item.quantity) {
        throw new Error(`Not enough stock for ${item.name}. Available: ${currentStock}`);
      }
      
      // Calculate total entirely on the server using secure DB prices and round to avoid fractional centavos
      secureTotalAmount += Math.round(secureDbPrice * item.quantity);

      // Store the doc reference and new stock for the write phase
      productDocs[item.productId] = {
        ref: productRef,
        newStock: currentStock - item.quantity
      };
    }

    // 1.5 Read Phase: Master Cash Ledger (Firestore requires all reads before writes)
    let masterAccountSnap = null;
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    if (secureTotalAmount > 0 && paymentMethod !== 'utang') {
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    // 2. Write Phase: Deduct inventory
    for (const item of cart) {
      if (!item.productId.startsWith('misc-')) {
        transaction.update(productDocs[item.productId].ref, {
          currentStock: productDocs[item.productId].newStock,
          updatedAt: serverTimestamp()
        });
      }
    }

    // 3. Write Phase: Record the Sale
    const salesRef = collection(db, 'tenants', tenantId, 'sales');
    const newSaleRef = doc(salesRef);
    saleDocId = newSaleRef.id; // Capture the real Firestore ID before write
    const finalAmount = Math.max(0, secureTotalAmount - discountCentavos);
    
    const saleRecord: Record<string, unknown> = {
      id: newSaleRef.id,
      tenantId,
      items: cart,
      subtotalAmount: secureTotalAmount,
      discountAmount: discountCentavos,
      discountType: discountType || 'none',
      discountReason,
      totalAmount: finalAmount,
      paymentMethod,
      createdAt: serverTimestamp()
    };

    // Store GCash reference number if provided for audit trail
    if (gcashRef) {
      saleRecord.gcashRef = gcashRef;
    }

    transaction.set(newSaleRef, saleRecord);

    // ERP INTEGRATION: Deposit the income into the Master Cash Ledger
    if (finalAmount > 0 && paymentMethod !== 'utang' && masterAccountSnap) {
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
        transaction.set(masterAccountRef, {
          balance: increment(finalAmount),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: finalAmount,
        type: 'income',
        category: 'Sales',
        description: `Retail Sale (${paymentMethod})`,
        date: new Date(),
        createdAt: serverTimestamp()
      });
    }
  });

  if (discountCentavos > 0 && userId && userName) {
    await logAuditEvent(tenantId, userId, userName, {
      type: 'apply_discount',
      description: `Applied ${discountType === 'percentage' ? 'percentage' : 'fixed'} discount of ₱${(discountCentavos / 100).toFixed(2)}. Reason: ${discountReason || 'None'}`,
      meta: { saleId: saleDocId, discountCentavos, discountType, discountReason, shiftId }
    });
  }

  return saleDocId; // Return the real Firestore document ID
}

/**
 * Void/Delete a retail sale and restore stock
 */
export async function deleteSale(
  tenantId: string,
  saleId: string,
  userId: string,
  userName: string
) {
  const db = getKatuwangDb();
  const saleRef = doc(db, 'tenants', tenantId, 'sales', saleId);
  
  await runTransactionResilient(db, async (transaction) => {
    // 1. Read the sale
    const saleSnap = await transaction.get(saleRef);
    if (!saleSnap.exists()) throw new Error("Sale not found.");
    
    const saleData = saleSnap.data();
    const items = saleData.items || [];
    const totalAmount = saleData.totalAmount || 0;
    
    // 2. Read products to restore stock
    const productDocs: Record<string, { ref: ReturnType<typeof doc>; currentStock: number }> = {};
    for (const item of items) {
      if (item.productId && !item.productId.startsWith('misc-')) {
        const productRef = doc(db, 'tenants', tenantId, 'products', item.productId);
        const productSnap = await transaction.get(productRef);
        if (productSnap.exists()) {
          productDocs[item.productId] = {
            ref: productRef,
            currentStock: productSnap.data().currentStock || 0
          };
        }
      }
    }
    
    // 3. Update stock
    for (const item of items) {
      if (item.productId && !item.productId.startsWith('misc-') && productDocs[item.productId]) {
        transaction.update(productDocs[item.productId].ref, {
          currentStock: productDocs[item.productId].currentStock + item.quantity,
          updatedAt: serverTimestamp()
        });
      }
    }
    
    // 4. Delete the sale record
    transaction.delete(saleRef);
    
    // Log the void
    logAuditEvent(tenantId, userId, userName, {
      type: 'void_sale',
      description: `Voided sale ${saleId} (₱${(totalAmount / 100).toFixed(2)}) and restored stock.`,
      meta: { saleId, totalAmount, itemsCount: items.length }
    });
  });
  
  return true;
}

/**
 * Void/Delete a build-stack dispatch
 */
export async function deleteDispatch(
  tenantId: string,
  txId: string,
  userId: string,
  userName: string
) {
  const db = getKatuwangDb();
  const txRef = doc(db, 'tenants', tenantId, 'inventory_transactions', txId);
  
  await runTransactionResilient(db, async (transaction) => {
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists()) throw new Error("Transaction not found.");
    
    const txData = txSnap.data();
    if (txData.type !== 'dispatch' || !txData.productId || !txData.projectId) {
      throw new Error("Invalid dispatch transaction.");
    }
    
    const qty = Math.abs(txData.quantity || 0);
    
    const productRef = doc(db, 'tenants', tenantId, 'products', txData.productId);
    const productSnap = await transaction.get(productRef);
    const salePrice = productSnap.exists() ? productSnap.data().salePrice || 0 : 0;
    const totalCost = Math.round(salePrice * qty);
    
    const projectRef = doc(db, 'tenants', tenantId, 'projects', txData.projectId);
    
    // Reverse product stock
    if (productSnap.exists()) {
      transaction.update(productRef, {
        currentStock: increment(qty),
        updatedAt: serverTimestamp()
      });
    }
    
    // Reverse project total cost
    const projectSnap = await transaction.get(projectRef);
    if (projectSnap.exists()) {
      transaction.update(projectRef, {
        totalMaterialCost: increment(-totalCost),
        updatedAt: serverTimestamp()
      });
    }
    
    // Delete the transaction
    transaction.delete(txRef);
    
    // Log the void
    logAuditEvent(tenantId, userId, userName, {
      type: 'void_sale',
      description: `Voided dispatch ${txId} and restored ${qty} items to stock.`,
      meta: { txId, qty }
    });
  });
  
  return true;
}

/**
 * Process a retail sale on credit (Palista / Utang)
 */
export async function processCreditCheckout(
  tenantId: string,
  cart: CartItem[],
  totalAmountCentavos: number,
  palistaName: string,
  palistaDate: Date,
  discountCentavos: number = 0,
  discountType?: 'percentage' | 'fixed',
  discountReason?: string,
  userId?: string,
  userName?: string,
  shiftId?: string
): Promise<string> {
  if (cart.length === 0) throw new Error('Cart is empty');
  if (!palistaName || palistaName.trim() === '') throw new Error('Customer name is required for credit.');

  const db = getKatuwangDb();
  let saleDocId = '';
  
  await runTransactionResilient(db, async (transaction) => {
    let secureTotalAmount = 0;

    const productDocs: Record<string, { ref: ReturnType<typeof doc>; newStock: number }> = {};
    for (const item of cart) {
      if (item.quantity <= 0 || isNaN(item.quantity)) {
        throw new Error(`Invalid quantity for ${item.name}.`);
      }

      if (item.productId.startsWith('misc-')) {
        secureTotalAmount += Math.round(item.price * item.quantity);
        continue;
      }

      const productRef = doc(db, 'tenants', tenantId, 'products', item.productId);
      const productSnap = await transaction.get(productRef);
      
      if (!productSnap.exists()) {
        throw new Error(`Product ${item.name} does not exist.`);
      }
      
      const productData = productSnap.data();
      const currentStock = productData.currentStock || 0;
      const secureDbPrice = productData.salePrice || 0;

      if (currentStock < item.quantity) {
        throw new Error(`Not enough stock for ${item.name}. Available: ${currentStock}`);
      }
      
      secureTotalAmount += Math.round(secureDbPrice * item.quantity);

      productDocs[item.productId] = {
        ref: productRef,
        newStock: currentStock - item.quantity
      };
    }

    for (const item of cart) {
      if (!item.productId.startsWith('misc-')) {
        transaction.update(productDocs[item.productId].ref, {
          currentStock: productDocs[item.productId].newStock,
          updatedAt: serverTimestamp()
        });
      }
    }

    const salesRef = collection(db, 'tenants', tenantId, 'sales');
    const newSaleRef = doc(salesRef);
    saleDocId = newSaleRef.id;
    
    const finalAmount = Math.max(0, secureTotalAmount - discountCentavos);

    transaction.set(newSaleRef, {
      id: newSaleRef.id,
      tenantId,
      module: 'retail',
      items: cart,
      subtotalAmount: secureTotalAmount,
      discountAmount: discountCentavos,
      discountType: discountType || 'none',
      discountReason,
      totalAmount: finalAmount,
      paymentMethod: 'palista',
      status: 'pending',
      palistaName,
      createdAt: serverTimestamp()
    });

    // Create the credit record
    const creditsRef = collection(db, 'tenants', tenantId, 'retail_credits');
    const newCreditRef = doc(creditsRef);
    
    transaction.set(newCreditRef, {
      id: newCreditRef.id,
      tenantId,
      type: 'receivable',
      name: palistaName,
      amount: finalAmount,
      paidAmount: 0,
      status: 'unpaid',
      creditDate: Timestamp.fromDate(palistaDate),
      relatedSaleId: newSaleRef.id,
      description: `Benta Snap Palista Checkout`,
      items: cart.map(c => ({
        productId: c.productId,
        name: c.name,
        quantity: c.quantity,
        price: c.price // Already stored in centavos from the CartItem interface
      })),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  if (discountCentavos > 0 && userId && userName) {
    await logAuditEvent(tenantId, userId, userName, {
      type: 'apply_discount',
      description: `Applied credit discount of ₱${(discountCentavos / 100).toFixed(2)}. Reason: ${discountReason || 'None'}`,
      meta: { saleId: saleDocId, discountCentavos, discountType, discountReason, shiftId }
    });
  }

  return saleDocId;
}
