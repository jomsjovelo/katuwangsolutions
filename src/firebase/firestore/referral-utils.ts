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
    for (let i = 0; i < 4; i++) {
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
