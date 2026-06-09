import { 
  doc, 
  serverTimestamp, 
  collection 
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

    // 2. Atomic Firestore Write
    try {
      await runTransactionResilient(db, async (transaction) => {
        // Create Tenant Doc
        const tenantRef = doc(collection(db, 'tenants'));
        const tenantId = tenantRef.id;

        transaction.set(tenantRef, {
          id: tenantId,
          name: businessInfo.businessName,
          businessPhone: '', // Removed for frictionless onboarding
          moduleType: onboardingData.appId,
          pricingTier: 'promo_99',
          subscriptionStatus: 'pending', // Waiting for GCash verification
          ownerUid: uid,
          staffUids: [],
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

