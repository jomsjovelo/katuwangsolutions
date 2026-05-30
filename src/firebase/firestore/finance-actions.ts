import { getFirestore, doc, collection, serverTimestamp, setDoc, updateDoc, increment } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { TransactionSchema, EmployeeSchema, PayoutRecordSchema } from '@/lib/schemas/finance';
import { runTransactionResilient } from './resilient-transaction';

export const getKatuwangDb = () => initializeFirebase().db;

export async function addTransaction(tenantId: string, amountCentavos: number, type: 'income' | 'expense', description: string, category?: string) {
  const db = getKatuwangDb();
  
  // 1. Validate the transaction using Zod
  const validated = TransactionSchema.parse({
    tenantId,
    accountId: 'master-cash', // Hardcoded master account for MVP
    amount: amountCentavos,
    type,
    category: category as any,
    description,
    date: new Date(),
  });

  await runTransactionResilient(db, async (transaction) => {
    // 2. Read the Master Cash Account balance
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    const masterAccountSnap = await transaction.get(masterAccountRef);
    
    let currentBalance = 0;
    if (!masterAccountSnap.exists()) {
      // Create the master account if it doesn't exist
      transaction.set(masterAccountRef, {
        id: 'master-cash',
        tenantId,
        name: 'Main Cash Register',
        type: 'asset',
        balance: type === 'income' ? amountCentavos : -amountCentavos,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      // 4. Write Phase: Update Balance using increment
      transaction.set(masterAccountRef, {
        balance: increment(type === 'income' ? amountCentavos : -amountCentavos),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // 5. Write Phase: Record the Transaction
    const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
    const newTxRef = doc(transactionsRef);
    
    transaction.set(newTxRef, {
      ...validated,
      id: newTxRef.id,
      createdAt: serverTimestamp()
    });
  });

  return true;
}

export async function addEmployee(tenantId: string, employeeData: any) {
  const db = getKatuwangDb();
  
  const validated = EmployeeSchema.parse({
    ...employeeData,
    tenantId,
  });

  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const newEmpRef = doc(employeesRef);

  await setDoc(newEmpRef, {
    ...validated,
    id: newEmpRef.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return newEmpRef.id;
}

export async function updateEmployeeDays(tenantId: string, employeeId: string, daysWorked: number, valeDeduction: number) {
  if (daysWorked < 0 || isNaN(daysWorked) || valeDeduction < 0 || isNaN(valeDeduction)) {
    throw new Error("Invalid input values for days worked or vale.");
  }
  const db = getKatuwangDb();
  const empRef = doc(db, 'tenants', tenantId, 'employees', employeeId);
  await updateDoc(empRef, {
    daysWorkedThisPeriod: daysWorked,
    outstandingVale: Math.round(valeDeduction * 100), // convert pesos to centavos safely
    updatedAt: serverTimestamp(),
  });
}

export async function recordPayout(
  tenantId: string,
  employeeId: string,
  employeeName: string,
  daysWorked: number,
  grossPayCentavos: number,
  valeDeductedCentavos: number,
  netPayCentavos: number
) {
  // Server-side recompute to prevent client-side manipulation
  const serverNetPay = grossPayCentavos - valeDeductedCentavos;
  if (serverNetPay !== netPayCentavos) {
    console.warn(`[Payroll Audit] netPay mismatch: client sent ${netPayCentavos}, server computed ${serverNetPay}. Using server value.`);
  }
  const finalNetPay = Math.max(0, serverNetPay); // net pay cannot be negative

  if (daysWorked < 0 || isNaN(daysWorked) || finalNetPay < 0 || isNaN(finalNetPay)) {
    throw new Error("Invalid payout values.");
  }

  const db = getKatuwangDb();
  let payoutId = '';

  await runTransactionResilient(db, async (transaction) => {
    // 1. Save payout record
    const payoutsRef = collection(db, 'tenants', tenantId, 'employees', employeeId, 'payouts');
    const newPayoutRef = doc(payoutsRef);
    payoutId = newPayoutRef.id;

    transaction.set(newPayoutRef, {
      id: payoutId,
      tenantId,
      employeeId,
      employeeName,
      daysWorked,
      grossPay: grossPayCentavos,
      valeDeducted: valeDeductedCentavos,
      netPay: finalNetPay, // Always use server-computed value
      paidAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    // 2. Reset employee's period counters after payout
    const empRef = doc(db, 'tenants', tenantId, 'employees', employeeId);
    transaction.update(empRef, {
      daysWorkedThisPeriod: 0,
      outstandingVale: 0,
      updatedAt: serverTimestamp(),
    });

    // 3. Log the payout as an expense in the ledger
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    const masterAccountSnap = await transaction.get(masterAccountRef);
    
    if (!masterAccountSnap.exists()) {
      transaction.set(masterAccountRef, {
        id: 'master-cash',
        tenantId,
        name: 'Main Cash Register',
        type: 'asset',
        balance: -finalNetPay, // Deduct the payout using server-computed value
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      transaction.set(masterAccountRef, {
        balance: increment(-finalNetPay),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // 4. Record transaction in ledger
    const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
    const newTxRef = doc(transactionsRef);
    transaction.set(newTxRef, {
      id: newTxRef.id,
      tenantId,
      accountId: 'master-cash',
      amount: finalNetPay, // Use server-computed net pay
      type: 'expense',
      category: 'Salary',
      description: `Sahod: ${employeeName}`,
      date: new Date(),
      createdAt: serverTimestamp()
    });
  });

  return payoutId;
}
