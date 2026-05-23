import { getFirestore, doc, collection, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
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
    if (masterAccountSnap.exists()) {
      currentBalance = masterAccountSnap.data().balance || 0;
    } else {
      // Create the master account if it doesn't exist
      transaction.set(masterAccountRef, {
        id: 'master-cash',
        tenantId,
        name: 'Main Cash Register',
        type: 'asset',
        balance: 0,
        isActive: true,
        createdAt: serverTimestamp(),
      });
    }

    // 3. Calculate New Balance
    const newBalance = type === 'income' 
      ? currentBalance + amountCentavos 
      : currentBalance - amountCentavos;

    // 4. Write Phase: Update Balance
    transaction.update(masterAccountRef, {
      balance: newBalance,
      updatedAt: serverTimestamp()
    });

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
  const db = getKatuwangDb();
  const empRef = doc(db, 'tenants', tenantId, 'employees', employeeId);
  await updateDoc(empRef, {
    daysWorkedThisPeriod: daysWorked,
    outstandingVale: valeDeduction * 100, // convert pesos to centavos
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
  const db = getKatuwangDb();

  // 1. Save payout record
  const payoutsRef = collection(db, 'tenants', tenantId, 'employees', employeeId, 'payouts');
  const newPayoutRef = doc(payoutsRef);
  await setDoc(newPayoutRef, {
    id: newPayoutRef.id,
    tenantId,
    employeeId,
    employeeName,
    daysWorked,
    grossPay: grossPayCentavos,
    valeDeducted: valeDeductedCentavos,
    netPay: netPayCentavos,
    paidAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  // 2. Reset employee's period counters after payout
  const empRef = doc(db, 'tenants', tenantId, 'employees', employeeId);
  await updateDoc(empRef, {
    daysWorkedThisPeriod: 0,
    outstandingVale: 0,
    updatedAt: serverTimestamp(),
  });

  // 3. Log the payout as an expense in the ledger
  await addTransaction(tenantId, netPayCentavos, 'expense', `Sahod: ${employeeName}`);

  return newPayoutRef.id;
}
