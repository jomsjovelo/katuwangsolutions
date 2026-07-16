import { doc, collection, serverTimestamp, increment, Timestamp } from 'firebase/firestore';
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
  paidAmount: number; // accumulated payments in centavos (always ≤ amount)
  status: 'unpaid' | 'partial' | 'paid';
  creditDate: Timestamp; // when the credit was incurred
  description?: string;
  relatedSaleId?: string;
  items?: { productId?: string; name: string; quantity: number; price: number }[];
  paymentCount?: number; // total number of payments recorded
}

export interface CreditPaymentRecord {
  id: string;
  creditId: string;
  paidAt: Timestamp;
  amountCentavos: number;      // actual cash received from payer
  discountCentavos: number;    // goodwill / discount written off
  netAppliedCentavos: number;  // amount applied to balance (capped at remaining)
  changeCentavos: number;      // overpayment returned to payer (cash out)
  balanceBefore: number;       // remaining balance before this payment
  balanceAfter: number;        // remaining balance after this payment
  paymentNumber: number;       // which payment # this is (1st, 2nd, etc.)
  paidBy: string | null;             // userId
  paidByName: string | null;
  shiftId: string | null;             // shiftId
  discountType: 'percentage' | 'fixed' | null;
  discountReason: string | null;
  paymentMethod: string;
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
      paymentCount: 0,
      status: 'unpaid',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}

export async function recordRetailCreditPayment(
  tenantId: string, 
  creditId: string, 
  paymentAmount: number, // cash received from payer, in centavos
  discountCentavos: number = 0,
  discountType?: 'percentage' | 'fixed',
  discountReason?: string,
  userId?: string,
  userName?: string,
  shiftId?: string,
  paymentMethod: string = 'cash'
) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const creditRef = doc(db, 'tenants', tenantId, 'retail_credits', creditId);
    const creditSnap = await transaction.get(creditRef);
    
    if (!creditSnap.exists()) {
      throw new Error("Credit record not found.");
    }
    
    const credit = creditSnap.data() as RetailCreditEntry;
    const currentPaid = credit.paidAmount || 0;
    const remaining = credit.amount - currentPaid;

    // --- Smart math ---
    // Total that would be applied to balance (payment + any forgiven discount)
    const totalApplied = paymentAmount + discountCentavos;
    // Cap: never apply more than what's still owed
    const netAppliedCentavos = Math.min(totalApplied, remaining);
    // Change = what the payer gets back (only cash overpay, not discount)
    const cashApplied = Math.min(paymentAmount, Math.max(0, remaining - discountCentavos));
    const changeCentavos = paymentAmount - cashApplied;

    const newPaidAmount = currentPaid + netAppliedCentavos;
    const balanceAfter = credit.amount - newPaidAmount;

    let newStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
    if (newPaidAmount >= credit.amount) {
      newStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'partial';
    }

    const paymentNumber = (credit.paymentCount || 0) + 1;

    // Handle Master Cash Ledger integration
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    const masterAccountSnap = await transaction.get(masterAccountRef);

    // Update the credit record
    transaction.update(creditRef, {
      paidAmount: newPaidAmount, // always ≤ credit.amount
      paymentCount: paymentNumber,
      status: newStatus,
      updatedAt: serverTimestamp()
    });

    // Write per-payment audit record to subcollection
    const paymentsRef = collection(db, 'tenants', tenantId, 'retail_credits', creditId, 'payments');
    const newPaymentRef = doc(paymentsRef);
    transaction.set(newPaymentRef, {
      id: newPaymentRef.id,
      creditId,
      paidAt: serverTimestamp(),
      amountCentavos: paymentAmount,         // full cash handed over
      discountCentavos,                       // discount forgiven
      netAppliedCentavos,                     // what actually reduced the balance
      changeCentavos,                         // cash returned to payer
      balanceBefore: remaining,
      balanceAfter,
      paymentNumber,
      paidBy: userId || null,
      paidByName: userName || null,
      shiftId: shiftId || null,
      discountType: discountType || null,
      discountReason: discountReason || null,
      paymentMethod,
    } as CreditPaymentRecord);

    // Determine cash flow direction
    // Receivable payment = Income (Cash in)
    // Payable payment = Expense (Cash out)
    const isIncome = credit.type === 'receivable';
    // Only actual cash collected (not discount) moves through the ledger
    const cashFlowAmount = isIncome ? cashApplied : -cashApplied;

    if (!masterAccountSnap.exists()) {
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

    // Record the specific transaction in the master ledger
    const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
    const newTxRef = doc(transactionsRef);
    transaction.set(newTxRef, {
      id: newTxRef.id,
      tenantId,
      accountId: 'master-cash',
      amount: cashApplied, // only actual cash movement
      type: isIncome ? 'income' : 'expense',
      category: isIncome ? 'Accounts Receivable Payment' : 'Accounts Payable Settlement',
      description: `Payment #${paymentNumber} for ${credit.name}${credit.description ? ` - ${credit.description}` : ''} (${paymentMethod})${changeCentavos > 0 ? ` (Sukli: ₱${(changeCentavos/100).toFixed(2)})` : ''}`,
      date: new Date(),
      createdAt: serverTimestamp(),
      discountCentavos,
      discountType: discountType || null,
      discountReason: discountReason || null,
      changeCentavos,
      creditId,
      paymentMethod,
    });

    if (discountCentavos > 0 && userId && userName) {
      logAuditEvent(tenantId, userId, userName, {
        type: 'apply_discount',
        description: `Applied ${discountType === 'percentage' ? 'percentage' : 'fixed'} discount of ₱${(discountCentavos / 100).toFixed(2)} to credit payment for ${credit.name}. Reason: ${discountReason || 'None'}`,
        meta: { creditId, discountCentavos, discountType, discountReason, shiftId, paymentNumber }
      });
    }
  });
}

