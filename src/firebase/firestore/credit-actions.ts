import { 
  getFirestore, 
  collection, 
  addDoc, 
  doc, 
  runTransaction,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { initializeFirebase } from '../index';

const db = initializeFirebase().db;

export interface Borrower {
  id: string;
  name: string;
  phone: string;
  limit: number;       // in centavos
  outstanding: number; // in centavos
  dailyDue: number;    // in centavos
  status: 'active' | 'fully_paid';
  createdAt: Timestamp;
}

export interface CreditTransaction {
  id: string;
  type: 'loan' | 'payment';
  amount: number;      // in centavos
  interest: number;    // in centavos
  timestamp: Timestamp;
}

/**
 * Register a new borrower profile
 */
export async function addBorrower(
  tenantId: string,
  name: string,
  phone: string,
  limitPesos: number,
  dailyDuePesos: number
) {
  try {
    const borrowersRef = collection(db, 'tenants', tenantId, 'borrowers');
    const newDoc = await addDoc(borrowersRef, {
      name,
      phone: phone.trim(),
      limit: Math.round(limitPesos * 100),
      outstanding: 0,
      dailyDue: Math.round(dailyDuePesos * 100),
      status: 'fully_paid',
      createdAt: serverTimestamp()
    });
    return newDoc.id;
  } catch (e: any) {
    console.error("Failed to add borrower doc", e);
    throw e;
  }
}

/**
 * Record a new loan in an atomic transaction
 */
export async function recordLoan(
  tenantId: string,
  borrowerId: string,
  loanAmountPesos: number,
  interestPesos: number,
  dailyDuePesos: number
) {
  const borrowerRef = doc(db, 'tenants', tenantId, 'borrowers', borrowerId);
  const transactionsRef = collection(db, 'tenants', tenantId, 'borrowers', borrowerId, 'transactions');
  
  try {
    await runTransaction(db, async (transaction) => {
      const bSnap = await transaction.get(borrowerRef);
      if (!bSnap.exists()) {
        throw new Error("Ang borrower ay hindi nahanap sa database.");
      }

      const data = bSnap.data();
      const currentOutstanding = data.outstanding || 0;
      const creditLimit = data.limit || 0;
      
      const addedDebt = Math.round((loanAmountPesos + interestPesos) * 100);
      const newOutstanding = currentOutstanding + addedDebt;
      
      if (newOutstanding > creditLimit) {
        throw new Error(`Hindi maaari: Ang utang ay lalampas sa Credit Limit na ₱${(creditLimit / 100).toFixed(0)}.`);
      }

      // Update borrower status & totals
      transaction.update(borrowerRef, {
        outstanding: newOutstanding,
        dailyDue: Math.round(dailyDuePesos * 100),
        status: 'active'
      });

      // Append transaction sub-collection entry
      const newTxDocRef = doc(transactionsRef);
      transaction.set(newTxDocRef, {
        type: 'loan',
        amount: Math.round(loanAmountPesos * 100),
        interest: Math.round(interestPesos * 100),
        timestamp: serverTimestamp()
      });
    });
    return true;
  } catch (e: any) {
    console.error("Loan transaction failed", e);
    throw e;
  }
}

/**
 * Record a payment/bawas atomically
 */
export async function recordPayment(
  tenantId: string,
  borrowerId: string,
  paymentAmountPesos: number
) {
  const borrowerRef = doc(db, 'tenants', tenantId, 'borrowers', borrowerId);
  const transactionsRef = collection(db, 'tenants', tenantId, 'borrowers', borrowerId, 'transactions');

  try {
    await runTransaction(db, async (transaction) => {
      const bSnap = await transaction.get(borrowerRef);
      if (!bSnap.exists()) {
        throw new Error("Ang borrower ay hindi nahanap sa database.");
      }

      const data = bSnap.data();
      const currentOutstanding = data.outstanding || 0;
      const paymentCentavos = Math.round(paymentAmountPesos * 100);

      if (paymentCentavos > currentOutstanding) {
        throw new Error(`Sobra: Ang ibinabayad na ₱${paymentAmountPesos} ay higit sa utang na ₱${(currentOutstanding / 100).toFixed(2)}.`);
      }

      const newOutstanding = Math.max(0, currentOutstanding - paymentCentavos);
      const newStatus = newOutstanding === 0 ? 'fully_paid' : 'active';

      transaction.update(borrowerRef, {
        outstanding: newOutstanding,
        status: newStatus
      });

      const newTxDocRef = doc(transactionsRef);
      transaction.set(newTxDocRef, {
        type: 'payment',
        amount: paymentCentavos,
        interest: 0,
        timestamp: serverTimestamp()
      });
    });
    return true;
  } catch (e: any) {
    console.error("Payment transaction failed", e);
    throw e;
  }
}
