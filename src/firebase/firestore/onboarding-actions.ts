import { 
  doc, 
  serverTimestamp, 
  collection,
  getDoc
} from 'firebase/firestore';
import { runTransactionResilient } from './resilient-transaction';
import { 
  createUserWithEmailAndPassword,
  sendEmailVerification
} from 'firebase/auth';
import { initializeFirebase } from '../index';
import { BusinessInfoSchema, AccountSchema } from '@/lib/schemas/onboarding';
import { generateUniqueReferralCode } from './referral-utils';

export async function registerNewTenant(onboardingData: any) {
  const { auth, db } = initializeFirebase();

  // Validate inputs
  const businessInfo = BusinessInfoSchema.parse({
    fullName: onboardingData.fullName,
    birthday: onboardingData.birthday,
    gender: onboardingData.gender,
    address: onboardingData.address,
    businessName: onboardingData.businessName,
  });

  const accountInfo = AccountSchema.parse({
    email: onboardingData.email,
    password: onboardingData.password,
    confirmPassword: onboardingData.confirmPassword,
  });

  try {
    // 1. Create Auth User
    const userCredential = await createUserWithEmailAndPassword(
      auth, 
      accountInfo.email, 
      accountInfo.password
    );
    const uid = userCredential.user.uid;

    // 2. Generate Unique Unified 6-Char Code
    let unifiedCode = '';
    let isUnique = false;
    let attempts = 0;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    while (!isUnique && attempts < 10) {
      unifiedCode = Array.from({ length: 7 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
      const codeRef = doc(db, 'business_codes', unifiedCode);
      const refRef = doc(db, 'referral_codes', unifiedCode);
      const [codeSnap, refSnap] = await Promise.all([getDoc(codeRef), getDoc(refRef)]);
      
      if (!codeSnap.exists() && !refSnap.exists()) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error("Failed to generate a unique unified code. Please try again.");
    }

    const businessCode = unifiedCode;
    const referralCode = unifiedCode;

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
          ownerUid: uid,
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
          searchableName: businessInfo.businessName.toLowerCase(),
          ownerUid: uid,
          ownerEmail: accountInfo.email,
          businessCode: businessCode,
          pricingTier: onboardingData.appId === 'budget-mo' ? 'promo_50' : 'promo_99',
          nextBillingDate: null,
          subscriptionStatus: 'pending',
          contactPhone: '',
          address: businessInfo.address,
          moduleType: onboardingData.appId,
          staffUids: [],
          referredBy: onboardingData.referredBy || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          settings: {
            theme: 'default'
          }
        });

        // Create User Profile Doc
        const userRef = doc(db, 'users', uid);
        transaction.set(userRef, {
          uid: uid,
          fullName: businessInfo.fullName,
          email: accountInfo.email,
          personalPhone: '', // Removed for frictionless onboarding
          birthday: businessInfo.birthday,
          gender: businessInfo.gender,
          address: businessInfo.address,
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

    // Send email verification as the very last step
    try {
      await sendEmailVerification(userCredential.user);
      console.log('Email verification sent.');
    } catch (verifyError) {
      console.error('Failed to send verification email:', verifyError);
      // We don't throw here because the user is already successfully created
    }

    return { success: true };
  } catch (e) {
      const error = e as Error & { code?: string };
    console.error('Registration failed:', error);
    throw new Error(error.message || 'Registration failed. Please try again.');
  }
}

