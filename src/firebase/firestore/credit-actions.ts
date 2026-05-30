import { 
  getFirestore, 
  collection, 
  addDoc, 
  doc, 
  runTransaction,
  serverTimestamp,
  increment,
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
  if (isNaN(limitPesos) || limitPesos <= 0) throw new Error("Ang credit limit ay dapat valid at higit sa zero.");
  if (isNaN(dailyDuePesos) || dailyDuePesos <= 0) throw new Error("Ang arawang singil ay dapat valid at higit sa zero.");

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
  if (isNaN(loanAmountPesos) || loanAmountPesos <= 0) throw new Error("Ang halaga ng pautang ay dapat valid at higit sa zero.");
  if (isNaN(interestPesos) || interestPesos < 0) throw new Error("Ang interes ay hindi maaring negatibo o invalid.");
  if (isNaN(dailyDuePesos) || dailyDuePesos <= 0) throw new Error("Ang arawang singil ay dapat valid at higit sa zero.");

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
        status: 'active',
        updatedAt: serverTimestamp() // 3C: audit trail
      });

      // Append transaction sub-collection entry
      const newTxDocRef = doc(transactionsRef);
      transaction.set(newTxDocRef, {
        type: 'loan',
        amount: Math.round(loanAmountPesos * 100),
        interest: Math.round(interestPesos * 100),
        timestamp: serverTimestamp()
      });

      // ERP INTEGRATION: Deduct loan amount from master-cash (cash given to borrower)
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      const loanAmountCentavos = Math.round(loanAmountPesos * 100);

      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: -loanAmountCentavos,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.set(masterAccountRef, {
          balance: increment(-loanAmountCentavos),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      const ledgerRef = collection(db, 'tenants', tenantId, 'transactions');
      const ledgerTxRef = doc(ledgerRef);
      transaction.set(ledgerTxRef, {
        id: ledgerTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: loanAmountCentavos,
        type: 'expense',
        category: 'Lending',
        description: `Loan Released: ${addedDebt / 100} pesos`,
        date: new Date(),
        createdAt: serverTimestamp()
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
  if (isNaN(paymentAmountPesos) || paymentAmountPesos <= 0) throw new Error("Ang halaga ng bayad ay dapat valid at higit sa zero.");

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
        status: newStatus,
        updatedAt: serverTimestamp() // 3C: audit trail
      });

      const newTxDocRef = doc(transactionsRef);
      transaction.set(newTxDocRef, {
        type: 'payment',
        amount: paymentCentavos,
        interest: 0,
        timestamp: serverTimestamp()
      });

      // ERP INTEGRATION: Deposit payment back into master-cash (borrower returning money)
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);

      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: paymentCentavos,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.set(masterAccountRef, {
          balance: increment(paymentCentavos),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      const ledgerRef = collection(db, 'tenants', tenantId, 'transactions');
      const ledgerTxRef = doc(ledgerRef);
      transaction.set(ledgerTxRef, {
        id: ledgerTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: paymentCentavos,
        type: 'income',
        category: 'Lending',
        description: `Loan Payment Received`,
        date: new Date(),
        createdAt: serverTimestamp()
      });
    });
    return true;
  } catch (e: any) {
    console.error("Payment transaction failed", e);
    throw e;
  }
}
