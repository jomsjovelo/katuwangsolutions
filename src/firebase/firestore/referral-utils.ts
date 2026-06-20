import { doc, getDoc, Firestore } from 'firebase/firestore';

/**
 * Generates a unique 4-character uppercase alphanumeric referral code.
 * Ensures the code does not already exist in the 'referral_codes' collection.
 */
export async function generateUniqueReferralCode(db: Firestore): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let referralCode = '';
  let isRefUnique = false;
  let refAttempts = 0;
  
  while (!isRefUnique && refAttempts < 10) {
    referralCode = '';
    for (let i = 0; i < 7; i++) {
      referralCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const refCodeSnap = await getDoc(doc(db, 'referral_codes', referralCode));
    if (!refCodeSnap.exists()) {
      isRefUnique = true;
    }
    refAttempts++;
  }

  if (!isRefUnique) {
    throw new Error("Failed to generate a unique referral code. Please try again.");
  }

  return referralCode;
}

/**
 * Universally processes a referral payout of exactly 10 points.
 * Call this inside a transaction, passing the transaction object.
 */
export async function processUniversalReferral(
  db: Firestore, 
  transaction: any, 
  referredByCode: string, 
  referredEntityId: string, 
  referredEntityType: 'store' | 'staff',
  rewardAmount: number = 10
) {
  const { collection, query, where, getDocs, doc, serverTimestamp, increment } = await import('firebase/firestore');

  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('referralCode', '==', referredByCode));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    const referrerDoc = querySnapshot.docs[0];
    const historyRef = doc(collection(db, 'users', referrerDoc.id, 'referral_history'));
    
    transaction.update(referrerDoc.ref, {
      referralEarnings: increment(rewardAmount),
      availableBalance: increment(rewardAmount),
      updatedAt: serverTimestamp()
    });
    
    transaction.set(historyRef, {
      amount: rewardAmount,
      referredEntityId: referredEntityId,
      entityType: referredEntityType,
      timestamp: serverTimestamp()
    });
  }
}
