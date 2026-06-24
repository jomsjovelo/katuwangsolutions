import { getFirestore, doc, collection, serverTimestamp, setDoc, increment, Timestamp } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { runTransactionResilient } from './resilient-transaction';

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
}

export async function addRetailCredit(data: Omit<RetailCreditEntry, 'id' | 'paidAmount' | 'status'>) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
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
  paymentAmount: number // in centavos
) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const creditRef = doc(db, 'tenants', tenantId, 'retail_credits', creditId);
    const creditSnap = await transaction.get(creditRef);
    
    if (!creditSnap.exists()) {
      throw new Error("Credit record not found.");
    }
    
    const credit = creditSnap.data() as RetailCreditEntry;
    
    // Calculate new paid amount and status
    const newPaidAmount = (credit.paidAmount || 0) + paymentAmount;
    let newStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
    
    if (newPaidAmount >= credit.amount) {
      newStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'partial';
    }

    // Update the credit record
    transaction.update(creditRef, {
      paidAmount: newPaidAmount,
      status: newStatus,
      updatedAt: serverTimestamp()
    });

    // Handle Master Cash Ledger integration
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    const masterAccountSnap = await transaction.get(masterAccountRef);
    
    // Determine cash flow direction
    // Receivable payment = Income (Cash in)
    // Payable payment = Expense (Cash out)
    const isIncome = credit.type === 'receivable';
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
      createdAt: serverTimestamp()
    });
  });
}
