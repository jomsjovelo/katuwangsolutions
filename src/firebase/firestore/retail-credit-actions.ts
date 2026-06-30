import { getFirestore, doc, collection, serverTimestamp, setDoc, increment, Timestamp } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { runTransactionResilient } from './resilient-transaction';
import { logAuditEvent } from './audit-actions';

const getKatuwangDb = () => initializeFirebase().db;

export interface RetailCreditEntry {
  id?: string;
  tenantId: string;
  type: 'receivable' | 'payable'; // receivable = customer owes us, payable = we owe supplier
  name: string;
  amount: number; // original credit amount in centavos
  paidAmount: number; // accumulated payments in centavos
  status: 'unpaid' | 'partial' | 'paid';
  creditDate: Timestamp; // when the credit was incurred
  description?: string;
  relatedSaleId?: string;
  items?: { productId?: string; name: string; quantity: number; price: number }[];
}

export async function addRetailCredit(
  data: Omit<RetailCreditEntry, 'id' | 'paidAmount' | 'status'>,
  updateStock: boolean = false
) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    // Stage 1: Perform all GETs
    const productDocsToUpdate: { ref: ReturnType<typeof doc>; newStock: number }[] = [];

    if (updateStock && data.items && data.items.length > 0) {
      for (const item of data.items) {
        if (item.productId && !item.productId.startsWith('misc-')) {
          const productRef = doc(db, 'tenants', data.tenantId, 'products', item.productId);
          const productSnap = await transaction.get(productRef);
          
          if (productSnap.exists()) {
            const productData = productSnap.data();
            const currentStock = productData.currentStock || 0;
            
            let newStock = currentStock;
            if (data.type === 'payable') {
              newStock = currentStock + item.quantity;
            } else if (data.type === 'receivable') {
              newStock = currentStock - item.quantity;
              if (newStock < 0) {
                throw new Error(`Hindi sapat ang stock para sa ${item.name} (Kulang ng ${Math.abs(newStock)}).`);
              }
            }

            productDocsToUpdate.push({
              ref: productRef,
              newStock
            });
          }
        }
      }
    }

    // Stage 2: Perform SETs and UPDATEs
    for (const p of productDocsToUpdate) {
      transaction.update(p.ref, {
        currentStock: p.newStock,
        updatedAt: serverTimestamp()
      });
    }

    const creditsRef = collection(db, 'tenants', data.tenantId, 'retail_credits');
    const newCreditRef = doc(creditsRef);
    
    transaction.set(newCreditRef, {
      ...data,
      id: newCreditRef.id,
      paidAmount: 0,
      status: 'unpaid',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}

export async function recordRetailCreditPayment(
  tenantId: string, 
  creditId: string, 
  paymentAmount: number, // in centavos
  discountCentavos: number = 0,
  discountType?: 'percentage' | 'fixed',
  discountReason?: string,
  userId?: string,
  userName?: string,
  shiftId?: string
) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const creditRef = doc(db, 'tenants', tenantId, 'retail_credits', creditId);
    const creditSnap = await transaction.get(creditRef);
    
    if (!creditSnap.exists()) {
      throw new Error("Credit record not found.");
    }
    
    const credit = creditSnap.data() as RetailCreditEntry;
    
    // Calculate new paid amount and status.
    const newPaidAmount = (credit.paidAmount || 0) + paymentAmount + discountCentavos;
    let newStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
    
    if (newPaidAmount >= credit.amount) {
      newStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'partial';
    }

    // Handle Master Cash Ledger integration
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    const masterAccountSnap = await transaction.get(masterAccountRef);

    // Update the credit record
    transaction.update(creditRef, {
      paidAmount: newPaidAmount,
      status: newStatus,
      updatedAt: serverTimestamp()
    });

    // Determine cash flow direction
    // Receivable payment = Income (Cash in)
    // Payable payment = Expense (Cash out)
    const isIncome = credit.type === 'receivable';
    // Discount is NOT cash flow, so we only track the actual paymentAmount as cash movement.
    const cashFlowAmount = isIncome ? paymentAmount : -paymentAmount;

    if (!masterAccountSnap.exists()) {
      // If master cash doesn't exist, we create it (even if negative, to track perfectly)
      transaction.set(masterAccountRef, {
        id: 'master-cash',
        tenantId,
        name: 'Main Cash Register',
        type: 'asset',
        balance: cashFlowAmount,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      transaction.set(masterAccountRef, {
        balance: increment(cashFlowAmount),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // Record the specific transaction in the ledger
    const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
    const newTxRef = doc(transactionsRef);
    transaction.set(newTxRef, {
      id: newTxRef.id,
      tenantId,
      accountId: 'master-cash',
      amount: paymentAmount, // positive amount for the transaction log
      type: isIncome ? 'income' : 'expense',
      category: isIncome ? 'Accounts Receivable Payment' : 'Accounts Payable Settlement',
      description: `Payment for ${credit.name} - ${credit.description || 'Credit Settlement'}`,
      date: new Date(),
      createdAt: serverTimestamp(),
      discountCentavos,
      discountType,
      discountReason
    });

    if (discountCentavos > 0 && userId && userName) {
      logAuditEvent(tenantId, userId, userName, {
        type: 'apply_discount',
        description: `Applied ${discountType === 'percentage' ? 'percentage' : 'fixed'} discount of ₱${(discountCentavos / 100).toFixed(2)} to credit payment. Reason: ${discountReason || 'None'}`,
        meta: { creditId, discountCentavos, discountType, discountReason, shiftId }
      });
    }
  });
}
