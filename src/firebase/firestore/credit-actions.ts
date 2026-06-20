import { 
  getFirestore, 
  collection, 
  addDoc, 
  doc, 
  serverTimestamp,
  increment,
  Timestamp,
  query,
  where,
  getDocs,
  orderBy
} from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { runTransactionResilient } from './resilient-transaction';
import { logAuditEvent } from './audit-actions';

const db = initializeFirebase().db;

export interface Borrower {
  id: string;
  name: string;
  phone: string;
  area?: string;       // Route or Area
  limit: number;       // in centavos
  outstanding: number; // in centavos
  dailyDue: number;    // in centavos
  status: 'active' | 'fully_paid';
  missedDays?: number; // tracked missed payment days
  totalPenalty?: number; // accumulated penalty centavos
  lastPaymentDate?: Timestamp; // for auto-overdue detection
  paymentSchedule?: 'daily' | 'weekly' | 'monthly' | 'custom';
  paymentIntervalDays?: number | null;
  createdAt: Timestamp;
}

export interface CreditTransaction {
  id: string;
  type: 'loan' | 'payment' | 'penalty' | 'restructure';
  amount: number;      // in centavos
  interest: number;    // in centavos
  note?: string;
  source?: string;
  startDate?: Timestamp; // For loans
  endDate?: Timestamp;   // For loans
  termDays?: number;     // For loans
  paymentSchedule?: 'daily' | 'weekly' | 'monthly' | 'custom';
  paymentIntervalDays?: number | null;
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
  dailyDuePesos: number,
  area?: string
) {
  if (isNaN(limitPesos) || limitPesos <= 0) throw new Error("Ang credit limit ay dapat valid at higit sa zero.");
  if (isNaN(dailyDuePesos) || dailyDuePesos <= 0) throw new Error("Ang arawang singil ay dapat valid at higit sa zero.");

  try {
    const borrowersRef = collection(db, 'tenants', tenantId, 'borrowers');
    const newDoc = await addDoc(borrowersRef, {
      name,
      phone: phone.trim(),
      area: area?.trim() || '',
      limit: Math.round(limitPesos * 100),
      outstanding: 0,
      dailyDue: Math.round(dailyDuePesos * 100),
      status: 'fully_paid',
      missedDays: 0,
      totalPenalty: 0,
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
  dailyDuePesos: number,
  termDays?: number,
  paymentSchedule: 'daily' | 'weekly' | 'monthly' | 'custom' = 'daily',
  paymentIntervalDays?: number
) {
  if (isNaN(loanAmountPesos) || loanAmountPesos <= 0) throw new Error("Ang halaga ng pautang ay dapat valid at higit sa zero.");
  if (isNaN(interestPesos) || interestPesos < 0) throw new Error("Ang interes ay hindi maaring negatibo o invalid.");
  if (isNaN(dailyDuePesos) || dailyDuePesos <= 0) throw new Error("Ang arawang singil ay dapat valid at higit sa zero.");

  const borrowerRef = doc(db, 'tenants', tenantId, 'borrowers', borrowerId);
  const transactionsRef = collection(db, 'tenants', tenantId, 'borrowers', borrowerId, 'transactions');
  
  try {
    await runTransactionResilient(db, async (transaction) => {
      // 1. Gather all reads first
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

      const loanAmountCentavos = Math.round(loanAmountPesos * 100);
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);

      // 2. Perform all writes
      // Update borrower status & totals
      transaction.update(borrowerRef, {
        outstanding: newOutstanding,
        dailyDue: Math.round(dailyDuePesos * 100),
        status: 'active',
        missedDays: 0, // Reset missed days on new loan
        paymentSchedule,
        paymentIntervalDays: paymentIntervalDays || null,
        updatedAt: serverTimestamp()
      });

      // Append transaction sub-collection entry
      const newTxDocRef = doc(transactionsRef);
      
      const loanData: any = {
        type: 'loan',
        amount: loanAmountCentavos,
        interest: Math.round(interestPesos * 100),
        timestamp: serverTimestamp(),
        paymentSchedule,
        paymentIntervalDays: paymentIntervalDays || null
      };
      
      if (termDays && termDays > 0) {
        loanData.termDays = termDays;
        loanData.startDate = serverTimestamp();
        // Calculate approximate end date based on term days
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + termDays);
        loanData.endDate = Timestamp.fromDate(endDate);
      }
      
      transaction.set(newTxDocRef, loanData);

      // ERP INTEGRATION: Deduct loan amount from master-cash (cash given to borrower)
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
    await runTransactionResilient(db, async (transaction) => {
      // 1. Gather all reads first
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

      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);

      // 2. Perform all writes
      const newOutstanding = Math.max(0, currentOutstanding - paymentCentavos);
      const newStatus = newOutstanding === 0 ? 'fully_paid' : 'active';

      transaction.update(borrowerRef, {
        outstanding: newOutstanding,
        status: newStatus,
        missedDays: 0, // Payment clears missed days streak
        lastPaymentDate: serverTimestamp(), // For auto-overdue detection
        updatedAt: serverTimestamp()
      });

      const newTxDocRef = doc(transactionsRef);
      transaction.set(newTxDocRef, {
        type: 'payment',
        amount: paymentCentavos,
        interest: 0,
        timestamp: serverTimestamp()
      });

      // ERP INTEGRATION: Deposit payment back into master-cash (borrower returning money)
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

      const salesRef = collection(db, 'tenants', tenantId, 'sales');
      const newSaleRef = doc(salesRef);
      transaction.set(newSaleRef, {
        id: newSaleRef.id,
        tenantId,
        module: '5-6-tracker',
        items: [{ name: `Loan Payment from ${data.name}`, quantity: 1, price: paymentCentavos }],
        totalAmount: paymentCentavos,
        paymentMethod: 'cash',
        createdAt: serverTimestamp()
      });
    });
    return true;
  } catch (e: any) {
    console.error("Payment transaction failed", e);
    throw e;
  }
}

/**
 * Apply a missed-day penalty to a borrower.
 * Standard 5-6 penalty: 5% of the daily due per missed day.
 */
export async function applyMissedDayPenalty(
  tenantId: string,
  borrowerId: string,
  penaltyRatePct: number = 5
) {
  const borrowerRef = doc(db, 'tenants', tenantId, 'borrowers', borrowerId);
  const transactionsRef = collection(db, 'tenants', tenantId, 'borrowers', borrowerId, 'transactions');

  await runTransactionResilient(db, async (transaction) => {
    // 1. Read first
    const bSnap = await transaction.get(borrowerRef);
    if (!bSnap.exists()) throw new Error('Borrower not found.');

    const data = bSnap.data();
    if (data.status !== 'active') throw new Error('Walang aktibong utang para may penalty.');

    const dailyDue = data.dailyDue || 0;
    const penaltyCentavos = Math.round(dailyDue * (penaltyRatePct / 100));
    const currentMissedDays = data.missedDays || 0;
    const currentPenalty = data.totalPenalty || 0;

    // 2. Write
    transaction.update(borrowerRef, {
      outstanding: increment(penaltyCentavos),
      missedDays: currentMissedDays + 1,
      totalPenalty: currentPenalty + penaltyCentavos,
      updatedAt: serverTimestamp(),
    });

    const newTxDocRef = doc(transactionsRef);
    transaction.set(newTxDocRef, {
      type: 'penalty',
      amount: penaltyCentavos,
      interest: 0,
      note: `Missed payment penalty (${penaltyRatePct}% of daily due)`,
      timestamp: serverTimestamp(),
    });
  });

  return true;
}

/**
 * Palista / Store Credit:
 * Charges a completed retail sale to the borrower's 5-6 Tracker account.
 * Auto-creates a borrower record if the name is new.
 */
export async function chargeRetailSaleToCredit(
  tenantId: string,
  borrowerName: string,
  amountCentavos: number,
  description: string
) {
  if (!borrowerName.trim()) throw new Error('Customer name is required for Palista.');
  if (amountCentavos <= 0) throw new Error('Amount must be greater than zero.');

  const borrowersRef = collection(db, 'tenants', tenantId, 'borrowers');
  const q = query(borrowersRef, where('name', '==', borrowerName.trim()));
  const snap = await getDocs(q);

  await runTransactionResilient(db, async (transaction) => {
    let borrowerRef: ReturnType<typeof doc>;
    let currentOutstanding = 0;

    if (!snap.empty) {
      borrowerRef = doc(db, 'tenants', tenantId, 'borrowers', snap.docs[0].id);
      const bSnap = await transaction.get(borrowerRef);
      currentOutstanding = bSnap.data()?.outstanding || 0;
    } else {
      borrowerRef = doc(borrowersRef);
    }

    const newOutstanding = currentOutstanding + amountCentavos;

    if (snap.empty) {
      transaction.set(borrowerRef, {
        id: borrowerRef.id,
        name: borrowerName.trim(),
        phone: '',
        limit: 99999900, // 999,999 pesos default limit
        outstanding: amountCentavos,
        dailyDue: Math.round(amountCentavos * 0.1),
        status: 'active',
        missedDays: 0,
        totalPenalty: 0,
        source: 'palista',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      transaction.update(borrowerRef, {
        outstanding: newOutstanding,
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    }

    const txRef = doc(collection(db, 'tenants', tenantId, 'borrowers', borrowerRef.id, 'transactions'));
    transaction.set(txRef, {
      type: 'loan',
      amount: amountCentavos,
      interest: 0,
      note: description,
      source: 'retail',
      timestamp: serverTimestamp(),
    });
  });

  return true;
}

/**
 * Fetch the transaction ledger for a specific borrower
 */
export async function getBorrowerLedger(tenantId: string, borrowerId: string): Promise<CreditTransaction[]> {
  const txRef = collection(db, 'tenants', tenantId, 'borrowers', borrowerId, 'transactions');
  const q = query(txRef, orderBy('timestamp', 'desc'));
  
  const snap = await getDocs(q);
  const ledger: CreditTransaction[] = [];
  
  snap.forEach(doc => {
    ledger.push({
      id: doc.id,
      ...doc.data()
    } as CreditTransaction);
  });
  
  return ledger;
}

/**
 * Edit an existing credit transaction
 */
export async function editCreditTransaction(
  tenantId: string,
  borrowerId: string,
  txId: string,
  updates: Partial<CreditTransaction>,
  userId: string,
  userName: string
) {
  const txRef = doc(db, 'tenants', tenantId, 'borrowers', borrowerId, 'transactions', txId);
  const borrowerRef = doc(db, 'tenants', tenantId, 'borrowers', borrowerId);
  
  await runTransactionResilient(db, async (transaction) => {
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists()) throw new Error("Transaction not found.");
    
    const currentData = txSnap.data() as CreditTransaction;
    const updateData: any = { ...updates, updatedAt: serverTimestamp() };
    
    // Only allow editing note, amount, interest for now. Reversing/recalculating is complex for amounts, 
    // but if it's just 'note' we can just update it.
    // If they changed the amount, we need to adjust the outstanding balance.
    if (updates.amount !== undefined && updates.amount !== currentData.amount) {
      const bSnap = await transaction.get(borrowerRef);
      if (!bSnap.exists()) throw new Error("Borrower not found.");
      
      const bData = bSnap.data();
      const difference = updates.amount - currentData.amount;
      
      let newOutstanding = bData.outstanding || 0;
      if (currentData.type === 'loan' || currentData.type === 'penalty') {
        newOutstanding += difference;
      } else if (currentData.type === 'payment') {
        // if payment amount increased, outstanding decreases
        newOutstanding -= difference;
      }
      
      newOutstanding = Math.max(0, newOutstanding);
      transaction.update(borrowerRef, {
        outstanding: newOutstanding,
        status: newOutstanding === 0 ? 'fully_paid' : 'active',
        updatedAt: serverTimestamp()
      });
    }

    transaction.update(txRef, updateData);
    
    // Log audit event but don't do it in the transaction
    logAuditEvent(tenantId, userId, userName, {
      type: 'edit_transaction',
      description: `Edited ${currentData.type} transaction for borrower ${borrowerId}`,
      meta: { txId, updates }
    });
  });
  return true;
}

/**
 * Delete a credit transaction and reverse its effects
 */
export async function deleteCreditTransaction(
  tenantId: string,
  borrowerId: string,
  txId: string,
  userId: string,
  userName: string
) {
  const txRef = doc(db, 'tenants', tenantId, 'borrowers', borrowerId, 'transactions', txId);
  const borrowerRef = doc(db, 'tenants', tenantId, 'borrowers', borrowerId);
  
  await runTransactionResilient(db, async (transaction) => {
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists()) throw new Error("Transaction not found.");
    
    const txData = txSnap.data() as CreditTransaction;
    
    const bSnap = await transaction.get(borrowerRef);
    if (!bSnap.exists()) throw new Error("Borrower not found.");
    
    const bData = bSnap.data();
    let currentOutstanding = bData.outstanding || 0;
    
    // Reverse the transaction
    if (txData.type === 'loan' || txData.type === 'penalty') {
      currentOutstanding -= txData.amount;
    } else if (txData.type === 'payment') {
      currentOutstanding += txData.amount;
    }
    
    currentOutstanding = Math.max(0, currentOutstanding);
    
    transaction.update(borrowerRef, {
      outstanding: currentOutstanding,
      status: currentOutstanding === 0 ? 'fully_paid' : 'active',
      updatedAt: serverTimestamp()
    });
    
    transaction.delete(txRef);
    
    // Log audit event
    logAuditEvent(tenantId, userId, userName, {
      type: 'delete_transaction',
      description: `Deleted ${txData.type} transaction of ${(txData.amount / 100).toFixed(2)} pesos for borrower ${bData.name}`,
      meta: { txId, amount: txData.amount, txType: txData.type, borrowerId, borrowerName: bData.name }
    });
  });
  return true;
}

export interface CapitalEntry {
  id: string;
  amount: number; // in centavos
  note?: string;
  timestamp: Timestamp;
}

/**
 * Record a capital injection to the lending business
 */
export async function recordCapitalInjection(
  tenantId: string,
  amountPesos: number,
  note: string,
  userId: string,
  userName: string
) {
  if (isNaN(amountPesos) || amountPesos <= 0) throw new Error("Ang halaga ng pondo ay dapat valid at higit sa zero.");

  const amountCentavos = Math.round(amountPesos * 100);
  const capitalRef = collection(db, 'tenants', tenantId, 'capital_entries');
  const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');

  await runTransactionResilient(db, async (transaction) => {
    const masterAccountSnap = await transaction.get(masterAccountRef);
    
    // 1. Add capital entry
    const newCapitalRef = doc(capitalRef);
    transaction.set(newCapitalRef, {
      amount: amountCentavos,
      note,
      timestamp: serverTimestamp(),
      userId,
      userName
    });

    // 2. Increase master cash
    if (!masterAccountSnap.exists()) {
      transaction.set(masterAccountRef, {
        id: 'master-cash',
        tenantId,
        name: 'Main Cash Register',
        type: 'asset',
        balance: amountCentavos,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      transaction.set(masterAccountRef, {
        balance: increment(amountCentavos),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // 3. Log into ledger
    const ledgerRef = collection(db, 'tenants', tenantId, 'transactions');
    const ledgerTxRef = doc(ledgerRef);
    transaction.set(ledgerTxRef, {
      id: ledgerTxRef.id,
      tenantId,
      accountId: 'master-cash',
      amount: amountCentavos,
      type: 'income',
      category: 'Capital',
      description: `Capital Injection: ${note}`,
      date: new Date(),
      createdAt: serverTimestamp()
    });
  });

  return true;
}
