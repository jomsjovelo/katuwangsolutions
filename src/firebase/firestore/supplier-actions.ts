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
  writeBatch
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { SupplierProfile, PurchaseOrder } from '@/lib/schemas/supplier';

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
 * - If Fresh Tally, creates fresh expiration batch
 * - If Paid, logs expense to Ledger Flow
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
    poNumber: finalPoNumber,
    createdAt: serverTimestamp(),
  });

  // 2. Increment stock & update cost price for each product
  poData.items.forEach((item) => {
    const prodRef = doc(db, 'tenants', tenantId, 'products', item.productId);
    batch.update(prodRef, {
      currentStock: increment(item.quantity),
      costPrice: item.unitCostCentavos, // Update latest purchase unit cost
      ...(item.unitSalePriceCentavos ? { salePrice: item.unitSalePriceCentavos } : {}),
      updatedAt: serverTimestamp(),
    });

    // If Fresh Tally, create fresh expiration batch
    if (moduleType === 'fresh-tally') {
      const freshBatchRef = doc(collection(db, 'tenants', tenantId, 'fresh_batches'));
      const expiryDays = 7; // Default 7-day freshness window for produce
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

  // 3. Ledger Flow Expense Integration (if Paid)
  if (poData.paymentStatus === 'paid') {
    const txRef = doc(collection(db, 'tenants', tenantId, 'transactions'));
    batch.set(txRef, {
      type: 'EXPENSE',
      category: 'Supplier Payout',
      amount: poData.totalAmountCentavos,
      notes: `Restock PO: ${finalPoNumber} - ${poData.supplierName}`,
      paymentMethod: poData.paymentMethod === 'supplier_credit' ? 'CASH' : poData.paymentMethod.toUpperCase(),
      createdAt: serverTimestamp(),
      createdBy: userId,
    });
  }

  // 4. Credit Tracker Integration (if Credit / Utang sa Supplier)
  if (poData.paymentStatus === 'credit_unpaid' || poData.paymentMethod === 'supplier_credit') {
    const creditRef = doc(collection(db, 'tenants', tenantId, 'credit_accounts'));
    batch.set(creditRef, {
      borrowerName: poData.supplierName,
      type: 'payable', // We owe supplier
      amountCentavos: poData.totalAmountCentavos,
      description: `Utang sa Supplier (PO #${finalPoNumber})`,
      status: 'UNPAID',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30-day term
      createdAt: serverTimestamp(),
      createdBy: userId,
    });
  }

  await batch.commit();
  return poId;
}
