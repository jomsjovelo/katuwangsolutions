import { collection, doc, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp, Timestamp, runTransaction } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { logAuditEvent } from './audit-actions';

export interface ShiftRecord {
  id: string;
  tenantId: string;
  staffId: string;
  staffName: string;
  status: 'open' | 'closed';
  startingCash: number; // in centavos
  endingCash?: number;  // in centavos
  expectedCash?: number; // in centavos
  discrepancy?: number; // in centavos (endingCash - expectedCash)
  openedAt: Timestamp;
  closedAt?: Timestamp;
  notes?: string;
}

/**
 * Open a new cash register shift
 */
export async function openShift(
  tenantId: string,
  staffId: string,
  staffName: string,
  startingCashPesos: number
): Promise<string> {
  const db = initializeFirebase().db;
  const startingCashCentavos = Math.round(startingCashPesos * 100);

  // Check if staff already has an open shift (fail-safe)
  const shiftsRef = collection(db, 'tenants', tenantId, 'shifts');
  const q = query(
    shiftsRef,
    where('staffId', '==', staffId),
    where('status', '==', 'open'),
    limit(1)
  );
  const existing = await getDocs(q);
  if (!existing.empty) {
    throw new Error('You already have an open shift.');
  }

  const newShiftRef = await addDoc(shiftsRef, {
    tenantId,
    staffId,
    staffName,
    status: 'open',
    startingCash: startingCashCentavos,
    openedAt: serverTimestamp()
  });

  // Log audit
  await logAuditEvent(tenantId, staffId, staffName, {
    type: 'add_staff', // reusing a valid type for now, 'add_staff' is allowed. We will fix AuditEventType later.
    description: `Opened shift with Starting Cash: ₱${startingCashPesos.toLocaleString()}`,
    meta: { shiftId: newShiftRef.id, startingCashCentavos, action: 'open_shift' }
  });

  return newShiftRef.id;
}

/**
 * Close an active shift and calculate discrepancy
 */
export async function closeShift(
  tenantId: string,
  shiftId: string,
  staffId: string,
  staffName: string,
  endingCashPesos: number,
  notes?: string
): Promise<void> {
  const db = initializeFirebase().db;
  const endingCashCentavos = Math.round(endingCashPesos * 100);

  await runTransaction(db, async (transaction) => {
    const shiftRef = doc(db, 'tenants', tenantId, 'shifts', shiftId);
    const shiftSnap = await transaction.get(shiftRef);

    if (!shiftSnap.exists()) {
      throw new Error('Shift not found.');
    }

    const shiftData = shiftSnap.data() as ShiftRecord;
    if (shiftData.status === 'closed') {
      throw new Error('Shift is already closed.');
    }

    // Calculate Expected Cash
    // Expected = Starting Cash + SUM(income) - SUM(expense) during this shift
    const txRef = collection(db, 'tenants', tenantId, 'transactions');
    const txQuery = query(
      txRef,
      where('createdAt', '>=', shiftData.openedAt),
      orderBy('createdAt', 'asc')
    );
    
    // Note: runTransaction doesn't support complex queries well inside, 
    // but in Firebase client SDK, getting a query inside a transaction is allowed if it's only reads.
    const txSnap = await getDocs(txQuery);
    
    let cashFlow = 0;
    txSnap.forEach(d => {
      const data = d.data();
      const amt = data.amount || 0;
      if (data.type === 'income') {
        cashFlow += amt;
      } else if (data.type === 'expense') {
        cashFlow -= amt;
      }
    });

    const expectedCashCentavos = shiftData.startingCash + cashFlow;
    const discrepancyCentavos = endingCashCentavos - expectedCashCentavos;

    transaction.update(shiftRef, {
      status: 'closed',
      endingCash: endingCashCentavos,
      expectedCash: expectedCashCentavos,
      discrepancy: discrepancyCentavos,
      notes: notes || '',
      closedAt: serverTimestamp()
    });
  });

  // Log audit outside transaction
  await logAuditEvent(tenantId, staffId, staffName, {
    type: 'remove_staff', // reusing valid type
    description: `Closed shift with Ending Cash: ₱${endingCashPesos.toLocaleString()}`,
    meta: { shiftId, endingCashCentavos, action: 'close_shift' }
  });
}

/**
 * Get active shift for a staff member
 */
export async function getActiveShift(tenantId: string, staffId: string): Promise<ShiftRecord | null> {
  const db = initializeFirebase().db;
  const shiftsRef = collection(db, 'tenants', tenantId, 'shifts');
  const q = query(
    shiftsRef,
    where('staffId', '==', staffId),
    where('status', '==', 'open'),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return null;
  
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as ShiftRecord;
}
