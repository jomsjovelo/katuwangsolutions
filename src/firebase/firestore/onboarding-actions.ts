import { 
  doc, 
  serverTimestamp, 
  collection,
  getDoc
} from 'firebase/firestore';
import { runTransactionResilient } from './resilient-transaction';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirebase } from '../index';
import { BusinessInfoSchema, AccountSchema } from '@/lib/schemas/onboarding';
import { generateUniqueReferralCode } from './referral-utils';
import { getModulePricing } from '@/lib/pricing';
import { isValidCtaSource } from '@/lib/conversion-events';
import { normalizeModuleId, isValidActiveModuleId, type BentaBusinessProfile } from '@/lib/app-data';

export interface RegistrationDependencies {
  initializeFirebase: typeof initializeFirebase;
  createUser: typeof createUserWithEmailAndPassword;
  getDocument: typeof getDoc;
  document: typeof doc;
  collectionRef: typeof collection;
  runTransaction: typeof runTransactionResilient;
  timestamp: typeof serverTimestamp;
  fetchRequest: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const productionRegistrationDependencies: RegistrationDependencies = {
  initializeFirebase,
  createUser: createUserWithEmailAndPassword,
  getDocument: getDoc,
  document: doc,
  collectionRef: collection,
  runTransaction: runTransactionResilient,
  timestamp: serverTimestamp,
  fetchRequest: (input, init) => fetch(input, init),
};

function buildSanitizedAcquisitionData(raw: any, timestamp: typeof serverTimestamp) {
  if (!raw || typeof raw !== 'object') return null;

  const sanitized: Record<string, any> = {};

  if (
    typeof raw.landingPath === 'string' &&
    raw.landingPath.startsWith('/') &&
    raw.landingPath.length <= 120 &&
    !raw.landingPath.includes('://') &&
    !raw.landingPath.includes('?') &&
    !raw.landingPath.includes('#') &&
    !raw.landingPath.includes('@') &&
    !raw.landingPath.includes('\\') &&
    !/[\x00-\x1F\x7F]/.test(raw.landingPath)
  ) {
    sanitized.landingPath = raw.landingPath;
  }

  const sanitizeUtm = (val: any): string | undefined => {
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim();
    if (!trimmed || trimmed.length > 100) return undefined;
    if (
      trimmed.includes('@') ||
      trimmed.includes('://') ||
      trimmed.includes('/') ||
      trimmed.includes('\\') ||
      /[\x00-\x1F\x7F]/.test(trimmed) ||
      /[^a-zA-Z0-9 _.-]/.test(trimmed)
    ) {
      return undefined;
    }
    return trimmed;
  };

  const utmSource = sanitizeUtm(raw.utmSource);
  if (utmSource) sanitized.utmSource = utmSource;

  const utmMedium = sanitizeUtm(raw.utmMedium);
  if (utmMedium) sanitized.utmMedium = utmMedium;

  const utmCampaign = sanitizeUtm(raw.utmCampaign);
  if (utmCampaign) sanitized.utmCampaign = utmCampaign;

  const utmContent = sanitizeUtm(raw.utmContent);
  if (utmContent) sanitized.utmContent = utmContent;

  if (isValidCtaSource(raw.ctaSource)) {
    sanitized.ctaSource = raw.ctaSource;
  }

  if (Object.keys(sanitized).length > 0) {
    sanitized.capturedAt = timestamp();
    return sanitized;
  }

  return null;
}

export async function registerNewTenant(
  onboardingData: any,
  injectedDependencies?: Partial<RegistrationDependencies>
) {
  const dependencies = injectedDependencies
    ? { ...productionRegistrationDependencies, ...injectedDependencies }
    : productionRegistrationDependencies;
  const { auth, db } = dependencies.initializeFirebase();

  // Validate inputs
  const businessInfo = BusinessInfoSchema.parse({
    fullName: onboardingData.fullName,
    birthday: onboardingData.birthday,
    gender: onboardingData.gender,
    address: onboardingData.address,
    businessName: onboardingData.businessName,
    businessProfile: onboardingData.businessProfile,
  });

  const accountInfo = AccountSchema.parse({
    email: onboardingData.email,
    password: onboardingData.password,
    confirmPassword: onboardingData.confirmPassword,
  });

  // Authoritative Module Canonicalization & Validation Boundary
  const rawAppId = String(onboardingData.appId || '').trim().toLowerCase();
  const canonicalModuleId = normalizeModuleId(rawAppId);

  if (!canonicalModuleId || !isValidActiveModuleId(canonicalModuleId)) {
    throw new Error(`Ang napiling module (${onboardingData.appId || 'unknown'}) ay hindi aktibo o hindi magagamit.`);
  }

  let resolvedBusinessProfile: BentaBusinessProfile | undefined = undefined;
  if (canonicalModuleId === 'benta-snap') {
    const validProfiles: BentaBusinessProfile[] = ['standard-retail', 'fresh-goods', 'hardware-supplies', 'wholesale'];
    if (businessInfo.businessProfile && validProfiles.includes(businessInfo.businessProfile as BentaBusinessProfile)) {
      resolvedBusinessProfile = businessInfo.businessProfile as BentaBusinessProfile;
    } else if (rawAppId === 'fresh-tally') {
      resolvedBusinessProfile = 'fresh-goods';
    } else if (rawAppId === 'build-stack') {
      resolvedBusinessProfile = 'hardware-supplies';
    } else {
      resolvedBusinessProfile = 'standard-retail';
    }
  }

  const acquisitionData = buildSanitizedAcquisitionData(onboardingData.acquisition, dependencies.timestamp);

  try {
    // 1. Create Auth User
    const userCredential = await dependencies.createUser(
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
      const codeRef = dependencies.document(db, 'business_codes', unifiedCode);
      const refRef = dependencies.document(db, 'referral_codes', unifiedCode);
      const [codeSnap, refSnap] = await Promise.all([
        dependencies.getDocument(codeRef),
        dependencies.getDocument(refRef),
      ]);
      
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
      await dependencies.runTransaction(db, async (transaction) => {
        // Double-check inside transaction (optional but safe)
        const codeRef = dependencies.document(db, 'business_codes', businessCode);
        const codeSnap = await transaction.get(codeRef);
        if (codeSnap.exists()) {
           throw new Error("Collision during transaction. Please try again.");
        }

        const refCodeDoc = dependencies.document(db, 'referral_codes', referralCode);
        const refCodeSnap = await transaction.get(refCodeDoc);
        if (refCodeSnap.exists()) {
           throw new Error("Collision during transaction for referral code.");
        }

        // Create Tenant Doc
        const tenantRef = dependencies.document(dependencies.collectionRef(db, 'tenants'));
        const tenantId = tenantRef.id;

        transaction.set(codeRef, {
          ownerUid: uid,
          tenantId: tenantId,
          businessName: businessInfo.businessName,
          ownerEmail: accountInfo.email,
          createdAt: dependencies.timestamp(),
        });

        transaction.set(refCodeDoc, {
          uid: uid,
          createdAt: dependencies.timestamp(),
        });

        const tenantData: Record<string, any> = {
          id: tenantId,
          name: businessInfo.businessName,
          searchableName: businessInfo.businessName.toLowerCase(),
          ownerUid: uid,
          ownerEmail: accountInfo.email,
          businessCode: businessCode,
          pricingTier: getModulePricing(canonicalModuleId).pricingTier,
          nextBillingDate: null,
          subscriptionStatus: 'pending',
          contactPhone: '',
          address: businessInfo.address,
          moduleType: canonicalModuleId,
          staffUids: [],
          referredBy: onboardingData.referredBy || null,
          acquisition: acquisitionData,
          createdAt: dependencies.timestamp(),
          updatedAt: dependencies.timestamp(),
          settings: {
            theme: 'default'
          }
        };

        if (canonicalModuleId === 'benta-snap') {
          tenantData.businessProfile = resolvedBusinessProfile;
        }

        transaction.set(tenantRef, tenantData);

        // Create User Profile Doc
        const userRef = dependencies.document(db, 'users', uid);
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
          moduleType: canonicalModuleId,
          referralCode: referralCode,
          referralEarnings: 0,
          termsAccepted: onboardingData.termsAccepted || false,
          termsAcceptedAt: onboardingData.termsAccepted ? dependencies.timestamp() : null,
          createdAt: dependencies.timestamp(),
          updatedAt: dependencies.timestamp(),
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
    let emailDeliveryFailed = false;
    try {
      const idToken = await userCredential.user.getIdToken();
      // Using custom backend email sender with authenticated ID Token
      const res = await dependencies.fetchRequest('/api/auth/send-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ email: userCredential.user.email }),
      });
      if (!res.ok) {
        throw new Error('Failed to send custom verification email');
      }
      console.log('Email verification sent.');
    } catch (verifyError) {
      console.error('Failed to send verification email:', verifyError);
      emailDeliveryFailed = true;
      // We don't throw here because the user account is already created
    }

    return { success: true, emailDeliveryFailed };
  } catch (e) {
      const error = e as Error & { code?: string };
    console.error('Registration failed:', error);
    throw new Error(error.message || 'Registration failed. Please try again.');
  }
}
