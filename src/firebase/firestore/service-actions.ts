import { getFirestore, doc, collection, serverTimestamp, setDoc, updateDoc, increment } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { JobSchema, JobStatus } from '@/lib/schemas/services';
import { runTransactionResilient } from './resilient-transaction';
import { logAuditEvent } from './audit-actions';

export const getKatuwangDb = () => initializeFirebase().db;

export async function addJob(
  tenantId: string, 
  customerName: string, 
  serviceName: string, 
  amountCentavos: number, 
  phoneNumber?: string,
  extra?: { deviceModel?: string, laborCost?: number, partsCost?: number, technicianName?: string }
) {
  const db = getKatuwangDb();
  
  // Validate using Zod schema
  const validated = JobSchema.parse({
    tenantId,
    serviceId: serviceName, // Treating serviceName as ID for MVP simplicity
    customerName,
    amount: amountCentavos,
    status: 'pending',
    ...(extra || {})
  });

  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const newJobRef = doc(jobsRef);

  await setDoc(newJobRef, {
    ...validated,
    id: newJobRef.id,
    phoneNumber: phoneNumber || null,
    createdAt: serverTimestamp(),
  });

  return newJobRef.id;
}

export async function updateJobStatus(
  tenantId: string, 
  jobId: string, 
  newStatus: JobStatus, 
  amountCentavos?: number, 
  customerName?: string, 
  paymentMethod: string = 'cash', 
  gcashRef?: string, 
  discountCentavos: number = 0, 
  discountType?: 'percentage' | 'fixed', 
  discountReason?: string,
  userId?: string,
  userName?: string,
  shiftId?: string
) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    // 1. Gather all reads
    let masterAccountSnap = null;
    let masterAccountRef = null;
    if (newStatus === 'completed' && amountCentavos && amountCentavos > 0) {
      masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    const jobRef = doc(db, 'tenants', tenantId, 'jobs', jobId);
    const jobSnap = await transaction.get(jobRef);
    if (!jobSnap.exists()) throw new Error("Job not found");
    if (jobSnap.data().status === newStatus) {
      return; // prevent double execution
    }

    // 2. Perform all writes
    // Update the Job Status
    const updateData: any = { 
      status: newStatus,
      updatedAt: serverTimestamp()
    };
    
    if (newStatus === 'in_progress') updateData.startedAt = serverTimestamp();
    if (newStatus === 'completed') updateData.completedAt = serverTimestamp();
    if (discountReason) updateData.discountReason = discountReason;
    
    transaction.update(jobRef, updateData);

    // ERP INTEGRATION: If the job is completed, automatically deposit the money into the Master Cash Ledger!
    if (newStatus === 'completed' && amountCentavos && amountCentavos > 0 && masterAccountRef && masterAccountSnap) {
      const finalAmount = Math.max(0, amountCentavos - discountCentavos);
      
      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: finalAmount,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        // Add the income to the balance
        transaction.set(masterAccountRef, {
          balance: increment(finalAmount),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // Record the transaction receipt
      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: finalAmount,
        type: 'income',
        category: 'Services',
        description: `Service Income: ${customerName || 'Customer'} (${paymentMethod})`,
        date: new Date(),
        createdAt: serverTimestamp()
      });

      // Log discount audit
      if (discountCentavos > 0 && userId && userName) {
        logAuditEvent(tenantId, userId, userName, {
          type: 'apply_discount',
          description: `Applied ${discountType === 'percentage' ? 'percentage' : 'fixed'} discount of ₱${(discountCentavos / 100).toFixed(2)} to service job. Reason: ${discountReason || 'None'}`,
          meta: { jobId, discountCentavos, discountType, discountReason, shiftId }
        });
      }

      // Write to unified sales subcollection
      const salesRef = collection(db, 'tenants', tenantId, 'sales');
      const newSaleRef = doc(salesRef);
      const serviceName = jobSnap.data().serviceId || 'Service Job';
      
      const saleRecord: Record<string, unknown> = {
        id: newSaleRef.id,
        tenantId,
        module: 'service',
        items: [{ productId: jobId, name: serviceName, price: amountCentavos, quantity: 1 }],
        subtotalAmount: amountCentavos,
        discountAmount: discountCentavos,
        discountType: discountType || 'none',
        discountReason,
        totalAmount: finalAmount,
        paymentMethod: paymentMethod,
        createdAt: serverTimestamp()
      };
      if (gcashRef) saleRecord.gcashRef = gcashRef;
      
      transaction.set(newSaleRef, saleRecord);
    }
  });

  return true;
}

export async function completeServiceOrder(
  tenantId: string, 
  collectionName: string, 
  orderId: string, 
  status: string,
  amountCentavos: number, 
  description: string,
  therapistCommissionCentavos?: number,
  extraUpdates: any = {},
  paymentMethod: string = 'cash',
  gcashRef?: string,
  discountCentavos: number = 0,
  discountType?: 'percentage' | 'fixed',
  discountReason?: string,
  userId?: string,
  userName?: string,
  shiftId?: string
) {
  if (amountCentavos < 0 || isNaN(amountCentavos)) {
    throw new Error('Invalid payment amount.');
  }

  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    // 1. Gather all reads
    let masterAccountSnap = null;
    let masterAccountRef = null;
    if (amountCentavos > 0) {
      masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    const orderRef = doc(db, 'tenants', tenantId, collectionName, orderId);
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error("Order not found");
    if (orderSnap.data().status === status) {
      return; // prevent double execution
    }

    // 2. Perform all writes
    // Update the Order Status
    const updateData: any = { 
      status,
      paymentStatus: 'Paid',
      updatedAt: serverTimestamp(),
      ...extraUpdates
    };
    if (discountReason) updateData.discountReason = discountReason;
    
    // Auto-deduct parts from inventory if they were passed
    if (extraUpdates && extraUpdates.partsUsed && Array.isArray(extraUpdates.partsUsed)) {
      for (const part of extraUpdates.partsUsed) {
        if (part.productId && part.quantity) {
          const prodRef = doc(db, 'tenants', tenantId, 'products', part.productId);
          transaction.update(prodRef, {
            currentStock: increment(-part.quantity),
            updatedAt: serverTimestamp()
          });
        }
      }
      delete updateData.partsUsed; // Prevent overwriting the document's array if it's already there
    }
    
    if (therapistCommissionCentavos && therapistCommissionCentavos > 0) {
      updateData.therapistCommission = therapistCommissionCentavos;
    }
    
    transaction.update(orderRef, updateData);

    // ERP INTEGRATION: Deposit the money into the Master Cash Ledger!
    if (amountCentavos > 0 && masterAccountRef && masterAccountSnap) {
      const finalAmount = Math.max(0, amountCentavos - discountCentavos);
      
      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: finalAmount,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.set(masterAccountRef, {
          balance: increment(finalAmount),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: finalAmount,
        type: 'income',
        category: 'Services',
        description,
        date: new Date(),
        createdAt: serverTimestamp()
      });

      // Write to unified sales subcollection
      const salesRef = collection(db, 'tenants', tenantId, 'sales');
      const newSaleRef = doc(salesRef);
      
      const saleRecord: Record<string, unknown> = {
        id: newSaleRef.id,
        tenantId,
        module: 'service',
        items: [{ productId: orderId, name: description, price: amountCentavos, quantity: 1, ...(extraUpdates.partsUsed && { partsUsed: extraUpdates.partsUsed }) }],
        subtotalAmount: amountCentavos,
        discountAmount: discountCentavos,
        discountType: discountType || 'none',
        discountReason,
        totalAmount: finalAmount,
        paymentMethod: paymentMethod,
        createdAt: serverTimestamp()
      };
      if (gcashRef) saleRecord.gcashRef = gcashRef;
      
      transaction.set(newSaleRef, saleRecord);
    }
  });

  if (discountCentavos > 0 && userId && userName) {
    await logAuditEvent(tenantId, userId, userName, {
      type: 'apply_discount',
      description: `Applied ${discountType === 'percentage' ? 'percentage' : 'fixed'} discount of ₱${(discountCentavos / 100).toFixed(2)} to service order. Reason: ${discountReason || 'None'}`,
      meta: { orderId, collectionName, discountCentavos, discountType, discountReason, shiftId }
    });
  }

  return true;
}

export async function registerGymMember(
  tenantId: string, 
  memberName: string, 
  planType: string, 
  amountCentavos: number,
  isDaily: boolean,
  memberPhone?: string,
  referrerCode?: string,
  paymentMethod: string = 'cash',
  gcashRef?: string
) {
  if (amountCentavos < 0 || isNaN(amountCentavos)) {
    throw new Error('Invalid payment amount.');
  }

  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    // 1. Gather all reads
    let masterAccountSnap = null;
    let masterAccountRef = null;
    if (amountCentavos > 0) {
      masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    // 2. Perform all writes
    const memberRef = doc(collection(db, 'tenants', tenantId, 'gym_memberships'));
    
    const status = isDaily ? 'Drop-in' : 'Active';
    const expiresAt = new Date();
    if (!isDaily) {
      if (planType === '3-Month Plan') {
        expiresAt.setMonth(expiresAt.getMonth() + 3);
      } else {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }
    }

    const memberData: any = {
      tenantId,
      memberName,
      planType,
      status,
      amountDue: amountCentavos,
      paymentStatus: 'Paid',
      memberPhone: memberPhone || null,
      referrerCode: referrerCode || null,
      createdAt: serverTimestamp(),
      lastCheckIn: serverTimestamp(),
    };
    if (!isDaily) {
      memberData.expiresAt = expiresAt;
    }
    
    transaction.set(memberRef, memberData);

    // ERP INTEGRATION
    if (amountCentavos > 0 && masterAccountRef && masterAccountSnap) {
      
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

      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: amountCentavos,
        type: 'income',
        category: 'Gym',
        description: `Gym Registration: ${memberName} (${planType}) (${paymentMethod})`,
        date: new Date(),
        createdAt: serverTimestamp()
      });

      // Write to unified sales subcollection
      const salesRef = collection(db, 'tenants', tenantId, 'sales');
      const newSaleRef = doc(salesRef);
      
      const saleRecord: Record<string, unknown> = {
        id: newSaleRef.id,
        tenantId,
        module: 'service',
        items: [{ productId: memberRef.id, name: `Gym Registration: ${planType}`, price: amountCentavos, quantity: 1 }],
        totalAmount: amountCentavos,
        paymentMethod: paymentMethod,
        createdAt: serverTimestamp()
      };
      if (gcashRef) saleRecord.gcashRef = gcashRef;
      
      transaction.set(newSaleRef, saleRecord);
    }
  });

  // Award loyalty points and process referral reward after gym registration
  if (memberPhone && amountCentavos > 0) {
    try {
      const { awardPoints } = await import('@/firebase/firestore/loyalty-actions');
      await awardPoints(tenantId, memberPhone, amountCentavos, referrerCode);
    } catch (e) {
      console.error('Failed to award gym loyalty points:', e);
    }
  }

  return true;
}

export async function renewGymMember(
  tenantId: string, 
  memberId: string,
  memberName: string,
  planType: string, 
  amountCentavos: number,
  paymentMethod: string = 'cash',
  gcashRef?: string
) {
  if (amountCentavos < 0 || isNaN(amountCentavos)) {
    throw new Error('Invalid payment amount.');
  }

  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    // 1. Gather all reads
    let masterAccountSnap = null;
    let masterAccountRef = null;
    if (amountCentavos > 0) {
      masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    // 2. Perform all writes
    const memberRef = doc(db, 'tenants', tenantId, 'gym_memberships', memberId);
    
    const expiresAt = new Date();
    if (planType === '3-Month Plan') {
      expiresAt.setMonth(expiresAt.getMonth() + 3);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    transaction.update(memberRef, {
      status: 'Active',
      planType,
      amountDue: amountCentavos,
      paymentStatus: 'Paid',
      expiresAt: expiresAt,
      lastCheckIn: serverTimestamp(),
      updatedAt: serverTimestamp() 
    });

    // ERP INTEGRATION
    if (amountCentavos > 0 && masterAccountRef && masterAccountSnap) {
      
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

      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: amountCentavos,
        type: 'income',
        category: 'Gym',
        description: `Gym Renewal: ${memberName} (${planType}) (${paymentMethod})`,
        date: new Date(),
        createdAt: serverTimestamp()
      });

      // Write to unified sales subcollection
      const salesRef = collection(db, 'tenants', tenantId, 'sales');
      const newSaleRef = doc(salesRef);
      
      const saleRecord: Record<string, unknown> = {
        id: newSaleRef.id,
        tenantId,
        module: 'service',
        items: [{ productId: memberId, name: `Gym Renewal: ${planType}`, price: amountCentavos, quantity: 1 }],
        totalAmount: amountCentavos,
        paymentMethod: paymentMethod,
        createdAt: serverTimestamp()
      };
      if (gcashRef) saleRecord.gcashRef = gcashRef;
      
      transaction.set(newSaleRef, saleRecord);
    }
  });

  return true;
}

export async function deleteServiceOrder(
  tenantId: string, 
  collectionName: string, 
  orderId: string, 
  userId: string,
  userName: string
) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const orderRef = doc(db, 'tenants', tenantId, collectionName, orderId);
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error("Order not found");
    
    const data = orderSnap.data();
    // Some collections use amountDue, some use totalAmount, some use amount
    const paidAmount = data.amountDue || data.totalAmount || data.amount || 0;
    
    // Reverse Master Cash
    if (paidAmount > 0 && (data.paymentStatus === 'Paid' || data.status === 'completed' || data.status === 'Active' || data.status === 'Drop-in')) {
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      if (masterAccountSnap.exists()) {
        transaction.update(masterAccountRef, {
          balance: increment(-paidAmount),
          updatedAt: serverTimestamp()
        });
      }
    }
    
    transaction.delete(orderRef);
    
    const { logAuditEvent } = await import('./audit-actions');
    logAuditEvent(tenantId, userId, userName, {
      type: 'void_transaction',
      description: `Voided order in ${collectionName}: ${data.customerName || data.memberName || 'Customer'} (₱${(paidAmount / 100).toFixed(2)})`,
      meta: { orderId, amountRefunded: paidAmount, collectionName }
    });
  });
  
  return true;
}

export const addSalonAppointment = async (tenantId: string, data: any) => {
  const db = getKatuwangDb();
  const counterRef = doc(db, 'tenants', tenantId, 'counters', 'salon_queue');
  const apptRef = doc(collection(db, 'tenants', tenantId, 'salon_appointments'));

  await runTransactionResilient(db, async (transaction: any) => {
    const counterDoc = await transaction.get(counterRef);
    let newQueueNumber = 1;
    if (counterDoc.exists()) {
      newQueueNumber = (counterDoc.data().current || 0) + 1;
    }
    
    transaction.set(counterRef, { current: newQueueNumber }, { merge: true });
    
    transaction.set(apptRef, {
      ...data,
      tenantId,
      queueNumber: newQueueNumber,
      createdAt: serverTimestamp()
    });
  });
  
  return apptRef.id;
};
