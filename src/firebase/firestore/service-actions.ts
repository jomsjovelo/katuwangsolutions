import { getFirestore, doc, collection, serverTimestamp, setDoc } from 'firebase/firestore';
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
      
      let currentBalance = 0;
      if (masterAccountSnap.exists()) {
        currentBalance = masterAccountSnap.data().balance || 0;
      } else {
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

      // Add the income to the balance
      transaction.update(masterAccountRef, {
        balance: currentBalance + amountCentavos,
        updatedAt: serverTimestamp()
      });

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
