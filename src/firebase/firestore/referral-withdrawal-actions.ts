import { initializeFirebase } from '../index';
import { 
  collection, 
  doc, 
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { runTransactionResilient } from './resilient-transaction';

export async function submitReferralWithdrawal(
  uid: string,
  ownerName: string,
  ownerEmail: string,
  tenantName: string,
  role: 'owner' | 'staff',
  amountPesos: number,
  paymentMethod: 'gcash' | 'maya',
  accountName: string,
  accountNumber: string
): Promise<string> {
  const { db } = initializeFirebase();
  
  let newDocId = '';

  await runTransactionResilient(db, async (transaction) => {
    const userRef = doc(db, 'users', uid);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists()) {
      throw new Error("User profile not found.");
    }

    const userData = userSnap.data();
    const currentEarnings = userData?.referralEarnings || 0;
    const currentAvailable = userData?.availableBalance !== undefined ? userData.availableBalance : currentEarnings;
    
    if (currentAvailable < 200) {
      throw new Error("Minimum withdrawal amount is ₱200.");
    }
    
    if (amountPesos !== currentAvailable) {
      throw new Error("Withdrawal amount must match total available balance.");
    }

    // Deduct the earnings atomically from availableBalance only
    transaction.update(userRef, {
      availableBalance: currentAvailable - amountPesos,
      updatedAt: serverTimestamp()
    });

    // Create the withdrawal request
    const withdrawalRef = doc(collection(db, 'referral_withdrawals'));
    newDocId = withdrawalRef.id;

    transaction.set(withdrawalRef, {
      id: newDocId,
      uid,
      ownerName,
      ownerEmail,
      tenantName,
      role,
      amountPesos,
      paymentMethod,
      accountName,
      accountNumber,
      status: 'pending',
      requestedAt: serverTimestamp(),
      processedAt: null,
      processedBy: null
    });
  });

  return newDocId;
}

export async function markWithdrawalPaid(
  withdrawalId: string, 
  adminEmail: string
): Promise<void> {
  const { db } = initializeFirebase();
  const withdrawalRef = doc(db, 'referral_withdrawals', withdrawalId);
  
  await updateDoc(withdrawalRef, {
    status: 'paid',
    processedAt: serverTimestamp(),
    processedBy: adminEmail
  });
}

export async function rejectWithdrawal(
  withdrawalId: string,
  uid: string,
  amountPesos: number,
  adminEmail: string
): Promise<void> {
  const { db } = initializeFirebase();

  await runTransactionResilient(db, async (transaction) => {
    const withdrawalRef = doc(db, 'referral_withdrawals', withdrawalId);
    const userRef = doc(db, 'users', uid);
    
    const [withdrawalSnap, userSnap] = await Promise.all([
      transaction.get(withdrawalRef),
      transaction.get(userRef)
    ]);

    if (!withdrawalSnap.exists()) throw new Error("Withdrawal request not found.");
    if (!userSnap.exists()) throw new Error("User profile not found.");
    if (withdrawalSnap.data()?.status !== 'pending') throw new Error("Only pending requests can be rejected.");

    const currentEarnings = userSnap.data()?.referralEarnings || 0;
    const currentAvailable = userSnap.data()?.availableBalance || currentEarnings; // Fallback to earnings if availableBalance is missing

    // Refund the user's available balance
    transaction.update(userRef, {
      availableBalance: currentAvailable + amountPesos,
      updatedAt: serverTimestamp()
    });

    // Mark withdrawal as rejected
    transaction.update(withdrawalRef, {
      status: 'rejected',
      processedAt: serverTimestamp(),
      processedBy: adminEmail
    });
  });
}
