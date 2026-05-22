import { getFirestore, doc, collection, serverTimestamp, setDoc } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { ProductSchema } from '@/lib/schemas/inventory';
import { runTransactionResilient } from './resilient-transaction';

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
  gcashRef?: string
): Promise<string> {
  if (cart.length === 0) throw new Error('Cart is empty');

  const db = getKatuwangDb();
  let saleDocId = '';
  
  // We use runTransactionResilient to execute locally when offline and sync automatically
  await runTransactionResilient(db, async (transaction) => {
    // 1. First, read all the product documents to ensure we have enough stock.
    const productDocs: Record<string, { ref: ReturnType<typeof doc>; newStock: number }> = {};
    for (const item of cart) {
      const productRef = doc(db, 'tenants', tenantId, 'products', item.productId);
      const productSnap = await transaction.get(productRef);
      
      if (!productSnap.exists()) {
        throw new Error(`Product ${item.name} does not exist.`);
      }
      
      const currentStock = productSnap.data().currentStock || 0;
      if (currentStock < item.quantity) {
        throw new Error(`Not enough stock for ${item.name}. Available: ${currentStock}`);
      }
      
      // Store the doc reference and new stock for the write phase
      productDocs[item.productId] = {
        ref: productRef,
        newStock: currentStock - item.quantity
      };
    }

    // 2. Write Phase: Deduct inventory
    for (const item of cart) {
      transaction.update(productDocs[item.productId].ref, {
        currentStock: productDocs[item.productId].newStock,
        updatedAt: serverTimestamp()
      });
    }

    // 3. Write Phase: Record the Sale
    const salesRef = collection(db, 'tenants', tenantId, 'sales');
    const newSaleRef = doc(salesRef);
    saleDocId = newSaleRef.id; // Capture the real Firestore ID before write
    
    const saleRecord: Record<string, unknown> = {
      id: newSaleRef.id,
      tenantId,
      items: cart,
      totalAmount: totalAmountCentavos,
      paymentMethod,
      createdAt: serverTimestamp()
    };

    // Store GCash reference number if provided for audit trail
    if (gcashRef) {
      saleRecord.gcashRef = gcashRef;
    }

    transaction.set(newSaleRef, saleRecord);
  });

  return saleDocId; // Return the real Firestore document ID
}
