import { initializeFirebase } from '../index';
import { 
  collection, 
  doc, 
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

async function submitWithdrawalDecision(
  withdrawalId: string,
  action: 'mark_paid' | 'reject',
): Promise<void> {
  const { auth } = initializeFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication is required.');

  const token = await user.getIdToken();
  const response = await fetch(`/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/decision`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action }),
  });

  if (!response.ok) {
    throw new Error(response.status === 409
      ? 'This withdrawal has already been resolved or requires review.'
      : 'Withdrawal processing is temporarily unavailable.');
  }
}

export async function markWithdrawalPaid(withdrawalId: string): Promise<void> {
  await submitWithdrawalDecision(withdrawalId, 'mark_paid');
}

export async function rejectWithdrawal(withdrawalId: string): Promise<void> {
  await submitWithdrawalDecision(withdrawalId, 'reject');
}
