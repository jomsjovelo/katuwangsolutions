import { getFirestore, doc, collection, serverTimestamp, setDoc, updateDoc, increment, getDoc, runTransaction, Timestamp, deleteDoc } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { BudgetTransactionSchema, DebtSchema, SavingsGoalSchema } from '@/lib/schemas/budget';
import { runTransactionResilient } from './resilient-transaction';

const getKatuwangDb = () => initializeFirebase().db;

export async function addBudgetTransaction(
  tenantId: string,
  type: 'income' | 'expense',
  amountCentavos: number,
  category: string,
  note: string,
  date?: string
) {
  const db = getKatuwangDb();
  
  const validated = BudgetTransactionSchema.parse({
    type,
    amountCentavos,
    category,
    note,
    date
  });

  const transactionsRef = collection(db, 'tenants', tenantId, 'budget_transactions');
  const newDocRef = doc(transactionsRef);

  const payload: any = {
    ...validated,
    id: newDocRef.id,
    createdAt: validated.date ? Timestamp.fromDate(new Date(validated.date)) : serverTimestamp(),
  };

  if (payload.date === undefined) {
    delete payload.date;
  }

  await setDoc(newDocRef, payload);

  // Also update master-cash for overall balance, because Budget Mo tracks actual cash.
  const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
  
  await runTransactionResilient(db, async (transaction) => {
    const masterAccountSnap = await transaction.get(masterAccountRef);
    if (!masterAccountSnap.exists()) {
      transaction.set(masterAccountRef, {
        id: 'master-cash',
        tenantId,
        name: 'Main Cash Register',
        type: 'asset',
        balance: type === 'income' ? amountCentavos : -amountCentavos,
        isActive: true,
        createdAt: serverTimestamp(),
      });
    } else {
      transaction.update(masterAccountRef, {
        balance: increment(type === 'income' ? amountCentavos : -amountCentavos),
        updatedAt: serverTimestamp()
      });
    }
  });

  return newDocRef.id;
}

export async function deleteBudgetTransaction(tenantId: string, transactionId: string) {
  const db = getKatuwangDb();
  const txRef = doc(db, 'tenants', tenantId, 'budget_transactions', transactionId);
  const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');

  await runTransactionResilient(db, async (transaction) => {
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists()) return;

    const txData = txSnap.data();
    
    // Reverse the effect on master-cash
    const amountToReverse = txData.type === 'income' ? -txData.amountCentavos : txData.amountCentavos;

    const masterSnap = await transaction.get(masterAccountRef);
    if (masterSnap.exists()) {
      transaction.update(masterAccountRef, {
        balance: increment(amountToReverse),
        updatedAt: serverTimestamp()
      });
    }

    transaction.delete(txRef);
  });
}

export async function editBudgetTransaction(
  tenantId: string, 
  transactionId: string, 
  updates: { amountCentavos?: number, category?: string, note?: string, date?: string }
) {
  const db = getKatuwangDb();
  const txRef = doc(db, 'tenants', tenantId, 'budget_transactions', transactionId);
  const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');

  await runTransactionResilient(db, async (transaction) => {
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists()) throw new Error("Transaction not found");

    const txData = txSnap.data();
    let masterCashDelta = 0;

    if (updates.amountCentavos !== undefined && updates.amountCentavos !== txData.amountCentavos) {
      const oldAmount = txData.amountCentavos;
      const newAmount = updates.amountCentavos;
      masterCashDelta = txData.type === 'income' ? (newAmount - oldAmount) : -(newAmount - oldAmount);
    }

    if (masterCashDelta !== 0) {
      const masterSnap = await transaction.get(masterAccountRef);
      if (masterSnap.exists()) {
        transaction.update(masterAccountRef, {
          balance: increment(masterCashDelta),
          updatedAt: serverTimestamp()
        });
      }
    }

    const payload: any = {
      ...updates,
      updatedAt: serverTimestamp()
    };
    if (payload.date) {
      payload.createdAt = Timestamp.fromDate(new Date(payload.date));
    }
    if (payload.date === undefined) delete payload.date;

    transaction.update(txRef, payload);
  });
}

export async function addDebtRecord(
  tenantId: string,
  creditorName: string,
  totalAmountCentavos: number,
  dueDate?: string,
  note?: string,
  isRecurring?: boolean
) {
  const db = getKatuwangDb();
  
  const validated = DebtSchema.parse({
    creditorName,
    totalAmountCentavos,
    remainingAmountCentavos: totalAmountCentavos,
    dueDate,
    note,
    status: 'active',
    isRecurring: isRecurring || false
  });

  const debtsRef = collection(db, 'tenants', tenantId, 'budget_debts');
  const newDocRef = doc(debtsRef);

  const payload: any = {
    ...validated,
    id: newDocRef.id,
    createdAt: serverTimestamp(),
  };
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

  await setDoc(newDocRef, payload);

  return newDocRef.id;
}

export async function logDebtPayment(
  tenantId: string,
  debtId: string,
  amountCentavos: number,
  note: string
) {
  const db = getKatuwangDb();
  const debtRef = doc(db, 'tenants', tenantId, 'budget_debts', debtId);
  const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
  
  await runTransactionResilient(db, async (transaction) => {
    const debtSnap = await transaction.get(debtRef);
    const masterSnap = await transaction.get(masterAccountRef);

    if (!debtSnap.exists()) throw new Error("Debt record not found");

    const data = debtSnap.data();
    if (data.status === 'paid') throw new Error("Debt is already paid");

    const newRemaining = data.isRecurring 
      ? data.remainingAmountCentavos 
      : Math.max(0, data.remainingAmountCentavos - amountCentavos);
    const newStatus = (!data.isRecurring && newRemaining === 0) ? 'paid' : 'active';

    transaction.update(debtRef, {
      remainingAmountCentavos: newRemaining,
      status: newStatus,
      updatedAt: serverTimestamp()
    });

    if (masterSnap.exists()) {
      transaction.update(masterAccountRef, {
        balance: increment(-amountCentavos),
        updatedAt: serverTimestamp()
      });
    } else {
      transaction.set(masterAccountRef, {
        id: 'master-cash',
        tenantId,
        name: 'Main Cash Register',
        type: 'asset',
        balance: -amountCentavos,
        isActive: true,
        createdAt: serverTimestamp(),
      });
    }

    const transactionsRef = collection(db, 'tenants', tenantId, 'budget_transactions');
    const newTxRef = doc(transactionsRef);
    transaction.set(newTxRef, {
      id: newTxRef.id,
      type: 'expense',
      amountCentavos,
      category: `Payment: ${data.creditorName}`,
      note: note || `Payment to ${data.creditorName}`,
      createdAt: serverTimestamp(),
    });
  });
}

export async function editDebtRecord(
  tenantId: string,
  debtId: string,
  updates: { creditorName?: string, totalAmountCentavos?: number, remainingAmountCentavos?: number, dueDate?: string, note?: string, isRecurring?: boolean }
) {
  const db = getKatuwangDb();
  const debtRef = doc(db, 'tenants', tenantId, 'budget_debts', debtId);
  const payload: any = { ...updates, updatedAt: serverTimestamp() };
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
  await updateDoc(debtRef, payload);
}

export async function deleteDebtRecord(tenantId: string, debtId: string) {
  const db = getKatuwangDb();
  const debtRef = doc(db, 'tenants', tenantId, 'budget_debts', debtId);
  await deleteDoc(debtRef);
}

export async function addSavingsGoal(
  tenantId: string,
  name: string,
  targetAmountCentavos: number
) {
  const db = getKatuwangDb();
  
  const validated = SavingsGoalSchema.parse({
    name,
    targetAmountCentavos,
    currentAmountCentavos: 0
  });

  const goalsRef = collection(db, 'tenants', tenantId, 'budget_goals');
  const newDocRef = doc(goalsRef);

  const payload: any = {
    ...validated,
    id: newDocRef.id,
    createdAt: serverTimestamp(),
  };
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

  await setDoc(newDocRef, payload);

  return newDocRef.id;
}

export async function allocateToSavings(
  tenantId: string,
  goalId: string,
  amountCentavos: number
) {
  const db = getKatuwangDb();
  const goalRef = doc(db, 'tenants', tenantId, 'budget_goals', goalId);
  const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');

  await runTransactionResilient(db, async (transaction) => {
    // 1. ALL READS FIRST
    const goalSnap = await transaction.get(goalRef);
    const masterSnap = await transaction.get(masterAccountRef);

    if (!goalSnap.exists()) throw new Error("Goal not found");

    // 2. ALL WRITES AFTER READS

    // Add to savings goal
    transaction.update(goalRef, {
      currentAmountCentavos: increment(amountCentavos),
      updatedAt: serverTimestamp()
    });

    // Log as a transfer/expense from main cash
    const transactionsRef = collection(db, 'tenants', tenantId, 'budget_transactions');
    const newTxRef = doc(transactionsRef);
    transaction.set(newTxRef, {
      id: newTxRef.id,
      type: 'expense',
      amountCentavos,
      category: 'Savings Transfer',
      note: `Allocated to ${goalSnap.data().name}`,
      createdAt: serverTimestamp(),
    });

    // Deduct from master-cash
    if (masterSnap.exists()) {
      transaction.update(masterAccountRef, {
        balance: increment(-amountCentavos),
        updatedAt: serverTimestamp()
      });
    } else {
      transaction.set(masterAccountRef, {
        id: 'master-cash',
        tenantId,
        name: 'Main Cash Register',
        type: 'asset',
        balance: -amountCentavos,
        isActive: true,
        createdAt: serverTimestamp(),
      });
    }
  });
}

export async function addBudgetEnvelope(tenantId: string, category: string, limitCentavos: number) {
  const db = getKatuwangDb();
  const envRef = collection(db, 'tenants', tenantId, 'budget_envelopes');
  const newDocRef = doc(envRef);
  await setDoc(newDocRef, {
    id: newDocRef.id,
    category,
    limitCentavos,
    createdAt: serverTimestamp()
  });
  return newDocRef.id;
}

export async function deleteBudgetEnvelope(tenantId: string, envelopeId: string) {
  const db = getKatuwangDb();
  await deleteDoc(doc(db, 'tenants', tenantId, 'budget_envelopes', envelopeId));
}

export async function editSavingsGoal(
  tenantId: string,
  goalId: string,
  updates: { name?: string, targetAmountCentavos?: number, currentAmountCentavos?: number }
) {
  const db = getKatuwangDb();
  const goalRef = doc(db, 'tenants', tenantId, 'budget_goals', goalId);
  const payload: any = { ...updates, updatedAt: serverTimestamp() };
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
  await updateDoc(goalRef, payload);
}

export async function deleteSavingsGoal(tenantId: string, goalId: string) {
  const db = getKatuwangDb();
  await deleteDoc(doc(db, 'tenants', tenantId, 'budget_goals', goalId));
}

export async function updateBudgetSettings(
  tenantId: string,
  settings: { persona: string, cycleType: string, paydayCycle: number, secondPaydayCycle: number }
) {
  const db = getKatuwangDb();
  const settingsRef = doc(db, 'tenants', tenantId, 'settings', 'budget');
  await setDoc(settingsRef, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

