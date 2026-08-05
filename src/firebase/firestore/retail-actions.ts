import { getFirestore, doc, collection, serverTimestamp, setDoc, increment, Timestamp, query, where, getDocs } from 'firebase/firestore';
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
  costPrice?: number;
  unit?: string;
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

    // 1. Read Phase: Read all product documents, parent wholesale packs, and master cash account
    const productDocs: Record<string, { ref: ReturnType<typeof doc>; newStock: number }> = {};
    const parentUpdates: Record<string, { ref: ReturnType<typeof doc>; newStock: number }> = {};

    for (const item of cart) {
      if (item.quantity <= 0 || isNaN(item.quantity)) {
        throw new Error(`Invalid quantity for ${item.name}.`);
      }

      // Bypass inventory check for custom/misc items
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
      let currentStock = productData.currentStock || 0;
      const secureDbPrice = productData.salePrice || 0;

      // Auto Wholesale-to-Tingi unboxing read if stock is low
      if (currentStock < item.quantity && productData.wholesaleParentId) {
        const parentRef = doc(db, 'tenants', tenantId, 'products', productData.wholesaleParentId);
        const parentSnap = await transaction.get(parentRef);
        if (parentSnap.exists()) {
          const parentData = parentSnap.data();
          if ((parentData.currentStock || 0) > 0) {
            const packQty = productData.packQuantity || 24;
            const updatedParentStock = Math.max(0, (parentData.currentStock || 0) - 1);
            parentUpdates[productData.wholesaleParentId] = {
              ref: parentRef,
              newStock: updatedParentStock
            };
            currentStock += packQty;
          }
        }
      }

      if (currentStock < item.quantity) {
        throw new Error(`Hindi sapat ang stock para sa ${item.name} (Available lang: ${currentStock}).`);
      }
      
      // Use item.price if item was custom weighted / custom priced, otherwise use secure DB price
      const priceToUse = (item.price && item.price !== secureDbPrice) ? item.price : secureDbPrice;
      secureTotalAmount += Math.round(priceToUse * item.quantity);

      productDocs[item.productId] = {
        ref: productRef,
        newStock: currentStock - item.quantity
      };
    }

    // 1.5 Read Phase: Master Cash Ledger (All reads MUST happen before any write)
    let masterAccountSnap = null;
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    if (secureTotalAmount > 0 && paymentMethod !== 'utang') {
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    // 2. Write Phase: Execute all pending updates (parent wholesale boxes + tingi products)
    Object.values(parentUpdates).forEach(({ ref, newStock }) => {
      transaction.update(ref, {
        currentStock: newStock,
        updatedAt: serverTimestamp()
      });
    });

    for (const item of cart) {
      if (!item.productId.startsWith('misc-') && productDocs[item.productId]) {
        const newStock = productDocs[item.productId].newStock;
        transaction.update(productDocs[item.productId].ref, {
          currentStock: newStock,
          updatedAt: serverTimestamp()
        });

        // Record stock movement history
        const invTxRef = doc(collection(db, 'tenants', tenantId, 'inventory_transactions'));
        transaction.set(invTxRef, {
          tenantId,
          productId: item.productId,
          type: 'sale',
          quantity: -item.quantity,
          balanceAfter: newStock,
          note: `POS Sale (${paymentMethod})`,
          performedBy: userId || 'cashier',
          createdAt: serverTimestamp()
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
      discountReason: discountReason || '',
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
        saleId: saleDocId,
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
  const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
  
  // Find matching master ledger transactions
  const ledgerTxQuery = query(collection(db, 'tenants', tenantId, 'transactions'), where('saleId', '==', saleId));
  const ledgerTxSnap = await getDocs(ledgerTxQuery);

  // Find matching credit record
  const creditQuery = query(collection(db, 'tenants', tenantId, 'retail_credits'), where('relatedSaleId', '==', saleId));
  const creditSnap = await getDocs(creditQuery);

  await runTransactionResilient(db, async (transaction) => {
    // 1. Read the sale
    const saleSnap = await transaction.get(saleRef);
    if (!saleSnap.exists()) throw new Error("Sale not found.");
    
    const saleData = saleSnap.data();
    const items = saleData.items || [];
    const totalAmount = saleData.totalAmount || 0;
    const paymentMethod = saleData.paymentMethod || 'cash';

    // Read master cash account if cash payment
    let masterSnap: any = null;
    if (paymentMethod === 'cash') {
      masterSnap = await transaction.get(masterAccountRef);
    }
    
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
    
    // 3. Update stock & log inventory movement history
    for (const item of items) {
      if (item.productId && !item.productId.startsWith('misc-') && productDocs[item.productId]) {
        const newStock = productDocs[item.productId].currentStock + item.quantity;
        transaction.update(productDocs[item.productId].ref, {
          currentStock: newStock,
          updatedAt: serverTimestamp()
        });

        const invTxRef = doc(collection(db, 'tenants', tenantId, 'inventory_transactions'));
        transaction.set(invTxRef, {
          tenantId,
          productId: item.productId,
          type: 'return',
          quantity: item.quantity,
          balanceAfter: newStock,
          note: `Voided Sale Reversal`,
          performedBy: userId || 'store-owner',
          createdAt: serverTimestamp()
        });
      }
    }

    // 4. Reverse cash ledger if cash sale
    if (paymentMethod === 'cash') {
      transaction.set(masterAccountRef, {
        balance: increment(-totalAmount),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    
    // 5. Delete corresponding master ledger & credit transactions
    ledgerTxSnap.docs.forEach(d => transaction.delete(d.ref));
    creditSnap.docs.forEach(d => transaction.delete(d.ref));

    // 6. Delete the sale record
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
 * Edit and update an existing retail sale transaction
 */
export async function updateSaleTransaction(
  tenantId: string,
  saleId: string,
  updatedData: {
    items: CartItem[];
    paymentMethod: string;
    discountCentavos: number;
    discountType?: 'percentage' | 'fixed';
    discountReason?: string;
    palistaName?: string;
  },
  userId: string,
  userName: string
): Promise<boolean> {
  const db = getKatuwangDb();
  const saleRef = doc(db, 'tenants', tenantId, 'sales', saleId);
  const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');

  // Find matching master ledger transactions & credit entries
  const ledgerTxQuery = query(collection(db, 'tenants', tenantId, 'transactions'), where('saleId', '==', saleId));
  const ledgerTxSnap = await getDocs(ledgerTxQuery);

  const creditQuery = query(collection(db, 'tenants', tenantId, 'retail_credits'), where('relatedSaleId', '==', saleId));
  const creditSnap = await getDocs(creditQuery);

  await runTransactionResilient(db, async (transaction) => {
    // 1. Read existing sale
    const saleSnap = await transaction.get(saleRef);
    if (!saleSnap.exists()) throw new Error("Transaksyon hindi nahanap.");

    const oldSale = saleSnap.data();
    const oldItems: CartItem[] = oldSale.items || [];
    const oldPaymentMethod = oldSale.paymentMethod || 'cash';
    const oldTotalAmount = oldSale.totalAmount || 0;

    // Map quantities
    const oldQtyMap: Record<string, number> = {};
    for (const item of oldItems) {
      if (item.productId && !item.productId.startsWith('misc-')) {
        oldQtyMap[item.productId] = (oldQtyMap[item.productId] || 0) + item.quantity;
      }
    }

    const newQtyMap: Record<string, number> = {};
    let secureSubtotal = 0;
    for (const item of updatedData.items) {
      if (item.quantity <= 0 || isNaN(item.quantity)) {
        throw new Error(`Maling quantity para sa ${item.name}.`);
      }
      secureSubtotal += Math.round(item.price * item.quantity);
      if (item.productId && !item.productId.startsWith('misc-')) {
        newQtyMap[item.productId] = (newQtyMap[item.productId] || 0) + item.quantity;
      }
    }

    const allProductIds = Array.from(new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)]));

    // 2. Read products & master cash account for stock and ledger adjustments
    const masterAccountSnap = await transaction.get(masterAccountRef);

    const productDataMap: Record<string, { ref: ReturnType<typeof doc>; currentStock: number }> = {};
    for (const pId of allProductIds) {
      const pRef = doc(db, 'tenants', tenantId, 'products', pId);
      const pSnap = await transaction.get(pRef);
      if (pSnap.exists()) {
        productDataMap[pId] = {
          ref: pRef,
          currentStock: pSnap.data().currentStock || 0
        };
      }
    }

    // Check stock availability for increases
    for (const pId of allProductIds) {
      const oldQty = oldQtyMap[pId] || 0;
      const newQty = newQtyMap[pId] || 0;
      const diff = newQty - oldQty; // Positive means extra stock needed
      if (diff > 0 && productDataMap[pId]) {
        if (productDataMap[pId].currentStock < diff) {
          throw new Error(`Kulang ang stock para sa item ID ${pId} (Available: ${productDataMap[pId].currentStock}, kailangan: ${diff}).`);
        }
      }
    }

    const newDiscount = Math.min(secureSubtotal, updatedData.discountCentavos || 0);
    const newTotalAmount = Math.max(0, secureSubtotal - newDiscount);

    // ---------------- WRITE PHASE (ALL WRITES AFTER READS) ----------------

    // 1. Apply stock diff updates
    for (const pId of allProductIds) {
      const oldQty = oldQtyMap[pId] || 0;
      const newQty = newQtyMap[pId] || 0;
      const diff = newQty - oldQty;
      if (diff !== 0 && productDataMap[pId]) {
        transaction.update(productDataMap[pId].ref, {
          currentStock: productDataMap[pId].currentStock - diff,
          updatedAt: serverTimestamp()
        });
      }
    }

    // 2. Ledger Cash Adjustments
    if (oldPaymentMethod === 'cash' && updatedData.paymentMethod === 'cash') {
      const cashDiff = newTotalAmount - oldTotalAmount;
      if (cashDiff !== 0) {
        transaction.set(masterAccountRef, {
          balance: increment(cashDiff),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    } else if (oldPaymentMethod === 'cash' && updatedData.paymentMethod !== 'cash') {
      transaction.set(masterAccountRef, {
        balance: increment(-oldTotalAmount),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else if (oldPaymentMethod !== 'cash' && updatedData.paymentMethod === 'cash') {
      transaction.set(masterAccountRef, {
        balance: increment(newTotalAmount),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // 4. Update Sale Document
    transaction.update(saleRef, {
      items: updatedData.items,
      subtotalAmount: secureSubtotal,
      discountAmount: newDiscount,
      discountType: updatedData.discountType || 'none',
      discountReason: updatedData.discountReason || '',
      totalAmount: newTotalAmount,
      paymentMethod: updatedData.paymentMethod,
      palistaName: updatedData.palistaName || '',
      isEdited: true,
      updatedAt: serverTimestamp()
    });

    // Update matching master ledger transactions
    ledgerTxSnap.docs.forEach(d => {
      transaction.update(d.ref, {
        amount: newTotalAmount,
        description: `Retail Sale (${updatedData.paymentMethod})`,
        updatedAt: serverTimestamp()
      });
    });

    // Sync linked credit record
    if (updatedData.paymentMethod === 'palista' || updatedData.paymentMethod === 'utang') {
      const pName = updatedData.palistaName?.trim() || 'Palista Customer';
      if (creditSnap.docs.length > 0) {
        transaction.update(creditSnap.docs[0].ref, {
          name: pName,
          amount: newTotalAmount,
          items: updatedData.items.map(c => ({
            productId: c.productId,
            name: c.name,
            quantity: c.quantity,
            price: c.price
          })),
          updatedAt: serverTimestamp()
        });
      } else {
        const creditsRef = collection(db, 'tenants', tenantId, 'retail_credits');
        const newCreditRef = doc(creditsRef);
        transaction.set(newCreditRef, {
          id: newCreditRef.id,
          tenantId,
          type: 'receivable',
          name: pName,
          amount: newTotalAmount,
          paidAmount: 0,
          status: 'unpaid',
          creditDate: serverTimestamp(),
          relatedSaleId: saleId,
          description: `Benta Snap Palista Checkout`,
          items: updatedData.items.map(c => ({
            productId: c.productId,
            name: c.name,
            quantity: c.quantity,
            price: c.price
          })),
          createdAt: serverTimestamp()
        });
      }
    } else {
      // Payment method changed away from palista -> remove credit record
      creditSnap.docs.forEach(d => transaction.delete(d.ref));
    }

    // 5. Audit Log
    logAuditEvent(tenantId, userId, userName, {
      type: 'edit_sale',
      description: `Edited sale ${saleId}. Old Total: ₱${(oldTotalAmount / 100).toFixed(2)}, New Total: ₱${(newTotalAmount / 100).toFixed(2)}.`,
      meta: { saleId, oldTotalAmount, newTotalAmount, newPaymentMethod: updatedData.paymentMethod }
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
    
    // Reverse project total cost
    const projectSnap = await transaction.get(projectRef);

    // Reverse product stock
    if (productSnap.exists()) {
      transaction.update(productRef, {
        currentStock: increment(qty),
        updatedAt: serverTimestamp()
      });
    }
    
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
        throw new Error(`Hindi sapat ang stock para sa ${item.name} (Available lang: ${currentStock}).`);
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

export async function addRetailExpense(
  tenantId: string,
  amountCentavos: number,
  category: string,
  note?: string,
  performedBy?: string
) {
  if (amountCentavos <= 0) throw new Error('Halaga ng gastos (Amount) must be greater than zero');
  const db = getKatuwangDb();
  const txRef = collection(db, 'tenants', tenantId, 'transactions');
  const newTxRef = doc(txRef);

  await setDoc(newTxRef, {
    id: newTxRef.id,
    tenantId,
    type: 'expense',
    amount: amountCentavos,
    category: category || 'General Expense',
    note: note || '',
    performedBy: performedBy || 'store-owner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return newTxRef.id;
}
