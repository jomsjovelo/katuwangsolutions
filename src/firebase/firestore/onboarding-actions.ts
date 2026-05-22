import { 
  doc, 
  runTransaction, 
  serverTimestamp, 
  collection 
} from 'firebase/firestore';
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
    await runTransaction(db, async (transaction) => {
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    return { success: true };
  } catch (error: any) {
    console.error('Registration failed:', error);
    throw new Error(error.message || 'Registration failed. Please try again.');
  }
}

