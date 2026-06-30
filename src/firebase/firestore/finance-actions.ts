import { getFirestore, doc, collection, serverTimestamp, setDoc, updateDoc, increment } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { TransactionSchema, EmployeeSchema, PayoutRecordSchema } from '@/lib/schemas/finance';
import { runTransactionResilient } from './resilient-transaction';
import { logAuditEvent } from './audit-actions';

export const getKatuwangDb = () => initializeFirebase().db;

export async function addTransaction(
  tenantId: string, 
  amountCentavos: number, 
  type: 'income' | 'expense', 
  description: string, 
  category?: string,
  userId?: string,
  userName?: string,
  shiftId?: string
) {
  const db = getKatuwangDb();
  
  if (amountCentavos <= 0 || !Number.isInteger(amountCentavos)) {
    throw new Error("Transaction amount must be a positive whole integer in centavos.");
  }
  
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

    // 6. Global Analytics Sync (If Income)
    if (type === 'income') {
      const salesRef = collection(db, 'tenants', tenantId, 'sales');
      const newSaleRef = doc(salesRef);
      transaction.set(newSaleRef, {
        id: newSaleRef.id,
        tenantId,
        module: 'ledger-flow',
        items: [{ name: description || category || 'Manual Income', quantity: 1, price: amountCentavos }],
        totalAmount: amountCentavos,
        paymentMethod: 'cash',
        createdAt: serverTimestamp()
      });
    }
  });

  if (type === 'expense' && userId && userName) {
    await logAuditEvent(tenantId, userId, userName, {
      type: 'payout_expense',
      description: `Recorded expense of ₱${(amountCentavos / 100).toFixed(2)} for ${category || 'Uncategorized'}: ${description}`,
      meta: { amountCentavos, category, description, shiftId }
    });
  }

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

export async function deleteEmployee(tenantId: string, employeeId: string, userId: string, userName: string) {
  const db = getKatuwangDb();
  
  const empRef = doc(db, 'tenants', tenantId, 'employees', employeeId);
  const { getDoc } = await import('firebase/firestore');
  const empSnap = await getDoc(empRef);
  if (!empSnap.exists()) throw new Error("Employee not found.");
  
  const empData = empSnap.data();
  
  await updateDoc(empRef, {
    isActive: false,
    updatedAt: serverTimestamp(),
  });
  
  const { logAuditEvent } = await import('./audit-actions');
  logAuditEvent(tenantId, userId, userName, {
    type: 'delete_record',
    description: `Deleted employee: ${empData.name}`,
    meta: { employeeId, employeeName: empData.name }
  } as any);
  
  return true;
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
  commissionsCentavos: number = 0,
  valeDeductedCentavos: number,
  govtDeductionsCentavos: number,
  netPayCentavos: number,
  userId?: string,
  userName?: string,
  shiftId?: string
) {
  // Server-side recompute to prevent client-side manipulation
  const serverNetPay = grossPayCentavos + commissionsCentavos - valeDeductedCentavos - govtDeductionsCentavos;
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
    // 1. Gather all reads
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    const masterAccountSnap = await transaction.get(masterAccountRef);

    // 2. Perform all writes
    // Save payout record
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
      commissions: commissionsCentavos,
      valeDeducted: valeDeductedCentavos,
      govtDeducted: govtDeductionsCentavos,
      netPay: finalNetPay, // Always use server-computed value
      paidAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    // Reset employee's period counters after payout
    const empRef = doc(db, 'tenants', tenantId, 'employees', employeeId);
    transaction.update(empRef, {
      daysWorkedThisPeriod: 0,
      outstandingVale: 0,
      updatedAt: serverTimestamp(),
    });

    // Log the payout as an expense in the ledger
    
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

  if (userId && userName) {
    // We already computed finalNetPay, so let's recalculate it outside or log inside?
    // We can just compute it again for the log.
    const finalNetPay = Math.max(0, grossPayCentavos - valeDeductedCentavos - govtDeductionsCentavos);
    await logAuditEvent(tenantId, userId, userName, {
      type: 'payout_expense',
      description: `Payroll payout for ${employeeName}: ₱${(finalNetPay / 100).toFixed(2)}`,
      meta: { employeeId, employeeName, grossPayCentavos, finalNetPay, shiftId }
    });
  }

  return payoutId;
}

export async function deleteTransaction(
  tenantId: string,
  transactionId: string,
  userId: string,
  userName: string
) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const txRef = doc(db, 'tenants', tenantId, 'transactions', transactionId);
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists()) throw new Error("Transaction not found.");
    
    const txData = txSnap.data();
    const amount = txData.amount || 0;
    const type = txData.type; // 'income' or 'expense'
    
    // Reverse Master Cash
    if (amount > 0) {
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      if (masterAccountSnap.exists()) {
        const adjustment = type === 'income' ? -amount : amount; // reverse what was done
        transaction.update(masterAccountRef, {
          balance: increment(adjustment),
          updatedAt: serverTimestamp()
        });
      }
    }
    
    transaction.delete(txRef);
    
    const { logAuditEvent } = await import('./audit-actions');
    logAuditEvent(tenantId, userId, userName, {
      type: 'void_transaction',
      description: `Voided ${type} transaction: ${txData.description || txData.category} (₱${(amount / 100).toFixed(2)})`,
      meta: { transactionId, amount, type }
    } as any);
  });
  
  return true;
}
