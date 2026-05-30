import { getFirestore, doc, collection, serverTimestamp, setDoc, increment } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { JobSchema, JobStatus } from '@/lib/schemas/services';
import { runTransactionResilient } from './resilient-transaction';

export const getKatuwangDb = () => initializeFirebase().db;

export async function addJob(tenantId: string, customerName: string, serviceName: string, amountCentavos: number) {
  const db = getKatuwangDb();
  
  // Validate using Zod schema
  const validated = JobSchema.parse({
    tenantId,
    serviceId: serviceName, // Treating serviceName as ID for MVP simplicity
    customerName,
    amount: amountCentavos,
    status: 'pending',
  });

  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const newJobRef = doc(jobsRef);

  await setDoc(newJobRef, {
    ...validated,
    id: newJobRef.id,
    createdAt: serverTimestamp(),
  });

  return newJobRef.id;
}

export async function updateJobStatus(tenantId: string, jobId: string, newStatus: JobStatus, amountCentavos?: number, customerName?: string) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const jobRef = doc(db, 'tenants', tenantId, 'jobs', jobId);
    
    // Update the Job Status
    const updateData: any = { 
      status: newStatus,
      updatedAt: serverTimestamp()
    };
    
    if (newStatus === 'in_progress') updateData.startedAt = serverTimestamp();
    if (newStatus === 'completed') updateData.completedAt = serverTimestamp();
    
    transaction.update(jobRef, updateData);

    // ERP INTEGRATION: If the job is completed, automatically deposit the money into the Master Cash Ledger!
    if (newStatus === 'completed' && amountCentavos && amountCentavos > 0) {
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      
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
        // Add the income to the balance
        transaction.set(masterAccountRef, {
          balance: increment(amountCentavos),
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
        amount: amountCentavos,
        type: 'income',
        description: `Service Income: ${customerName || 'Customer'}`,
        date: new Date(),
        createdAt: serverTimestamp()
      });
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
  extraUpdates: any = {}
) {
  if (amountCentavos < 0 || isNaN(amountCentavos)) {
    throw new Error('Invalid payment amount.');
  }

  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const orderRef = doc(db, 'tenants', tenantId, collectionName, orderId);
    
    // Update the Order Status
    const updateData: any = { 
      status,
      paymentStatus: 'Paid',
      updatedAt: serverTimestamp(),
      ...extraUpdates
    };
    
    transaction.update(orderRef, updateData);

    // ERP INTEGRATION: Deposit the money into the Master Cash Ledger!
    if (amountCentavos > 0) {
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      
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
        category: 'Services',
        description,
        date: new Date(),
        createdAt: serverTimestamp()
      });
    }
  });

  return true;
}

export async function registerGymMember(
  tenantId: string, 
  memberName: string, 
  planType: string, 
  amountCentavos: number,
  isDaily: boolean
) {
  if (amountCentavos < 0 || isNaN(amountCentavos)) {
    throw new Error('Invalid payment amount.');
  }

  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
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
      createdAt: serverTimestamp(),
      lastCheckIn: serverTimestamp(),
    };
    if (!isDaily) {
      memberData.expiresAt = expiresAt;
    }
    
    transaction.set(memberRef, memberData);

    // ERP INTEGRATION
    if (amountCentavos > 0) {
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      
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
        description: `Gym Registration: ${memberName} (${planType})`,
        date: new Date(),
        createdAt: serverTimestamp()
      });
    }
  });

  return true;
}

export async function renewGymMember(
  tenantId: string, 
  memberId: string,
  memberName: string,
  planType: string, 
  amountCentavos: number
) {
  if (amountCentavos < 0 || isNaN(amountCentavos)) {
    throw new Error('Invalid payment amount.');
  }

  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
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
    if (amountCentavos > 0) {
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      
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
        description: `Gym Renewal: ${memberName} (${planType})`,
        date: new Date(),
        createdAt: serverTimestamp()
      });
    }
  });

  return true;
}
