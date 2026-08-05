import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  increment,
  writeBatch,
  setDoc
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { SupplierProfile, PurchaseOrder } from '@/lib/schemas/supplier';
import { runTransactionResilient } from './resilient-transaction';
import { logAuditEvent } from './audit-actions';

const { db } = initializeFirebase();

/**
 * Real-time listener for tenant suppliers
 */
export function subscribeTenantSuppliers(
  tenantId: string, 
  onSuccess: (suppliers: SupplierProfile[]) => void, 
  onError?: (err: any) => void
) {
  if (!tenantId) return () => {};
  
  const suppliersRef = collection(db, 'tenants', tenantId, 'suppliers');
  const q = query(suppliersRef, orderBy('name', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const list: SupplierProfile[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as SupplierProfile));
    onSuccess(list);
  }, (err) => {
    console.error("Error fetching suppliers:", err);
    if (onError) onError(err);
  });
}

/**
 * Add a new supplier profile
 */
export async function addSupplier(tenantId: string, data: Partial<SupplierProfile>): Promise<string> {
  if (!tenantId) throw new Error("Tenant ID required");
  const suppliersRef = collection(db, 'tenants', tenantId, 'suppliers');
  const newDoc = await addDoc(suppliersRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return newDoc.id;
}

/**
 * Update an existing supplier profile
 */
export async function updateSupplier(tenantId: string, supplierId: string, data: Partial<SupplierProfile>): Promise<void> {
  if (!tenantId || !supplierId) throw new Error("Tenant ID and Supplier ID required");
  const suppRef = doc(db, 'tenants', tenantId, 'suppliers', supplierId);
  await updateDoc(suppRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Real-time listener for Purchase Orders
 */
export function subscribeTenantPurchaseOrders(
  tenantId: string,
  onSuccess: (orders: PurchaseOrder[]) => void,
  onError?: (err: any) => void
) {
  if (!tenantId) return () => {};

  const ordersRef = collection(db, 'tenants', tenantId, 'purchase_orders');
  const q = query(ordersRef, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const list: PurchaseOrder[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as PurchaseOrder));
    onSuccess(list);
  }, (err) => {
    console.error("Error fetching purchase orders:", err);
    if (onError) onError(err);
  });
}

/**
 * Execute a new Purchase Order / Restock Delivery
 * - Writes PO document
 * - Atomically increments product inventory stocks & updates cost price
 * - Deducts cash from master-cash drawer if paid via cash/cash_drawer
 * - Logs inventory transactions history
 * - If Fresh Tally, creates fresh expiration batch
 * - If Credit, logs payable to Credit Tracker (Utang sa Supplier)
 */
export async function createPurchaseOrder(
  tenantId: string,
  poData: Omit<PurchaseOrder, 'id' | 'createdAt'>,
  userId: string,
  moduleType?: string
): Promise<string> {
  if (!tenantId) throw new Error("Tenant ID required");

  const batch = writeBatch(db);

  // 1. Create Purchase Order Document
  const poRef = doc(collection(db, 'tenants', tenantId, 'purchase_orders'));
  const poId = poRef.id;

  const finalPoNumber = poData.poNumber || `PO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(100 + Math.random() * 900)}`;

  batch.set(poRef, {
    ...poData,
    id: poId,
    poNumber: finalPoNumber,
    status: poData.status || 'received',
    createdAt: serverTimestamp(),
  });

  // 2. Increment stock & update cost price for each product + record inventory transaction
  poData.items.forEach((item) => {
    const prodRef = doc(db, 'tenants', tenantId, 'products', item.productId);
    batch.update(prodRef, {
      currentStock: increment(item.quantity),
      costPrice: item.unitCostCentavos,
      ...(item.unitSalePriceCentavos ? { salePrice: item.unitSalePriceCentavos } : {}),
      updatedAt: serverTimestamp(),
    });

    const invTxRef = doc(collection(db, 'tenants', tenantId, 'inventory_transactions'));
    batch.set(invTxRef, {
      tenantId,
      productId: item.productId,
      type: 'restock',
      quantity: item.quantity,
      note: `Restock PO #${finalPoNumber} (${poData.supplierName})`,
      poId: poId,
      performedBy: userId,
      createdAt: serverTimestamp()
    });

    // If Fresh Tally, create fresh expiration batch
    if (moduleType === 'fresh-tally') {
      const freshBatchRef = doc(collection(db, 'tenants', tenantId, 'fresh_batches'));
      const expiryDays = 7;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + expiryDays);

      batch.set(freshBatchRef, {
        productName: item.productName,
        productId: item.productId,
        quantity: item.quantity,
        supplier: poData.supplierName,
        supplierId: poData.supplierId,
        costCentavos: item.unitCostCentavos,
        expirationDate: expiryDate.toISOString(),
        receivedDate: new Date().toISOString(),
        poNumber: finalPoNumber,
        status: 'active',
        createdAt: serverTimestamp(),
      });
    }
  });

  // 3. Cash Drawer & Ledger Expense Integration
  if (poData.paymentStatus === 'paid' || poData.paymentMethod === 'cash_drawer' || poData.paymentMethod === 'cash') {
    // Deduct cash from master-cash account
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    batch.set(masterAccountRef, {
      balance: increment(-poData.totalAmountCentavos),
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Record cash movement transaction
    const txRef = doc(collection(db, 'tenants', tenantId, 'transactions'));
    batch.set(txRef, {
      id: txRef.id,
      tenantId,
      accountId: 'master-cash',
      amount: poData.totalAmountCentavos,
      type: 'expense',
      category: 'Restock / Inventory Purchase',
      description: `Purchase Order (#${finalPoNumber}) - ${poData.supplierName}`,
      poId: poId,
      paymentMethod: poData.paymentMethod || 'cash_drawer',
      date: new Date(),
      createdAt: serverTimestamp(),
      createdBy: userId,
    });
  }

  // 4. Credit Tracker Integration (if Credit / Utang sa Supplier)
  if (poData.paymentStatus === 'credit_unpaid' || poData.paymentMethod === 'supplier_credit') {
    const creditRef = doc(collection(db, 'tenants', tenantId, 'credit_accounts'));
    batch.set(creditRef, {
      borrowerName: poData.supplierName,
      type: 'payable',
      amountCentavos: poData.totalAmountCentavos,
      description: `Utang sa Supplier (PO #${finalPoNumber})`,
      status: 'UNPAID',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: serverTimestamp(),
      createdBy: userId,
    });
  }

  await batch.commit();
  return poId;
}

/**
 * Void a purchase order atomically:
 * - Reverses inventory stock for all items
 * - Restores cash to master-cash drawer if paid via cash/cash_drawer
 * - Logs audit event & marks PO status as 'voided' to maintain audit trail
 */
export async function voidPurchaseOrder(
  tenantId: string,
  poId: string,
  userId: string,
  userName: string
): Promise<boolean> {
  if (!tenantId || !poId) throw new Error("Tenant ID and PO ID required");
  
  const poRef = doc(db, 'tenants', tenantId, 'purchase_orders', poId);
  const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');

  await runTransactionResilient(db, async (transaction) => {
    const poSnap = await transaction.get(poRef);
    if (!poSnap.exists()) throw new Error("Purchase order not found");
    const poData = poSnap.data();

    if (poData.status === 'voided') throw new Error("Purchase order is already voided");

    // 1. Reverse product stock
    const items = poData.items || [];
    for (const item of items) {
      if (item.productId) {
        const prodRef = doc(db, 'tenants', tenantId, 'products', item.productId);
        const prodSnap = await transaction.get(prodRef);
        if (prodSnap.exists()) {
          const currentStock = prodSnap.data().currentStock || 0;
          transaction.update(prodRef, {
            currentStock: Math.max(0, currentStock - item.quantity),
            updatedAt: serverTimestamp()
          });
        }
      }
    }

    // 2. Reverse cash drawer if paid from cash drawer
    if (poData.paymentStatus === 'paid' || poData.paymentMethod === 'cash_drawer' || poData.paymentMethod === 'cash') {
      transaction.set(masterAccountRef, {
        balance: increment(poData.totalAmountCentavos || 0),
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: poData.totalAmountCentavos || 0,
        type: 'income',
        category: 'Purchase Reversal',
        description: `Void Purchase Order #${poData.poNumber || poId}`,
        poId: poId,
        createdAt: serverTimestamp(),
        createdBy: userId
      });
    }

    // 3. Mark PO as voided (soft status update to preserve audit history)
    transaction.update(poRef, {
      status: 'voided',
      paymentStatus: 'voided',
      voidedAt: serverTimestamp(),
      voidedBy: userId
    });

    logAuditEvent(tenantId, userId, userName, {
      type: 'void_purchase',
      description: `Voided purchase order ${poData.poNumber || poId} (₱${((poData.totalAmountCentavos || 0) / 100).toFixed(2)}) and reversed inventory.`,
      meta: { poId, totalAmount: poData.totalAmountCentavos }
    });
  });

  return true;
}
