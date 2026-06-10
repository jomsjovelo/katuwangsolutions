import { 
  doc, 
  serverTimestamp, 
  collection,
  getDoc
} from 'firebase/firestore';
import { runTransactionResilient } from './resilient-transaction';
import { 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { initializeFirebase } from '../index';
import { BusinessInfoSchema, AccountSchema } from '@/lib/schemas/onboarding';

export async function registerNewTenant(onboardingData: any) {
  const { auth, db } = initializeFirebase();

  // Validate inputs
  const businessInfo = BusinessInfoSchema.parse({
    fullName: onboardingData.fullName,
    businessName: onboardingData.businessName,
  });

  const accountInfo = AccountSchema.parse({
    email: onboardingData.email,
    password: onboardingData.password,
  });

  try {
    // 1. Create Auth User
    const userCredential = await createUserWithEmailAndPassword(
      auth, 
      accountInfo.email, 
      accountInfo.password
    );
    const uid = userCredential.user.uid;

    // 2. Generate Unique 4-Digit Code
    let businessCode = '';
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      businessCode = Math.floor(1000 + Math.random() * 9000).toString();
      const codeRef = doc(db, 'business_codes', businessCode);
      const codeSnap = await getDoc(codeRef);
      if (!codeSnap.exists()) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error("Failed to generate a unique business code. Please try again.");
    }

    // 2.5 Generate Unique 4-Char Referral Code
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

    // 3. Atomic Firestore Write
    try {
      await runTransactionResilient(db, async (transaction) => {
        // Double-check inside transaction (optional but safe)
        const codeRef = doc(db, 'business_codes', businessCode);
        const codeSnap = await transaction.get(codeRef);
        if (codeSnap.exists()) {
           throw new Error("Collision during transaction. Please try again.");
        }

        const refCodeDoc = doc(db, 'referral_codes', referralCode);
        const refCodeSnap = await transaction.get(refCodeDoc);
        if (refCodeSnap.exists()) {
           throw new Error("Collision during transaction for referral code.");
        }

        // Create Tenant Doc
        const tenantRef = doc(collection(db, 'tenants'));
        const tenantId = tenantRef.id;

        transaction.set(codeRef, {
          tenantId: tenantId,
          businessName: businessInfo.businessName,
          ownerEmail: accountInfo.email,
          createdAt: serverTimestamp(),
        });

        transaction.set(refCodeDoc, {
          uid: uid,
          createdAt: serverTimestamp(),
        });

        transaction.set(tenantRef, {
          id: tenantId,
          name: businessInfo.businessName,
          businessPhone: '', // Removed for frictionless onboarding
          moduleType: onboardingData.appId,
          pricingTier: 'promo_99',
          subscriptionStatus: 'pending', // Waiting for GCash verification
          ownerUid: uid,
          staffUids: [],
          businessCode: businessCode,
          referredBy: onboardingData.referredBy || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Create User Profile Doc
        const userRef = doc(db, 'users', uid);
        transaction.set(userRef, {
          uid: uid,
          fullName: businessInfo.fullName,
          email: accountInfo.email,
          personalPhone: '', // Removed for frictionless onboarding
          address: '', // Removed for frictionless onboarding
          role: 'owner',
          tenantId: tenantId,
          moduleType: onboardingData.appId,
          referralCode: referralCode,
          referralEarnings: 0,
          termsAccepted: onboardingData.termsAccepted || false,
          termsAcceptedAt: onboardingData.termsAccepted ? serverTimestamp() : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    } catch (transactionError: any) {
      // CLEANUP: If Firestore fails, delete the orphaned Auth user
      try {
        await userCredential.user.delete();
        console.log("Cleaned up orphaned auth user after transaction failure.");
      } catch (cleanupError) {
        console.error("Failed to cleanup orphaned auth user:", cleanupError);
      }
      throw transactionError; // Re-throw to be caught by the outer block
    }

    return { success: true };
  } catch (error: any) {
    console.error('Registration failed:', error);
    throw new Error(error.message || 'Registration failed. Please try again.');
  }
}

