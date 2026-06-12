import { initializeFirebase } from '../index';
import { 
  collection, 
  doc, 
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  where,
  getDocs,
  limit
} from 'firebase/firestore';

const getDb = () => initializeFirebase().db;


// 1 point per 100 pesos (10,000 centavos)
const POINTS_PER_CENTAVO = 1 / 10000; 

// Generate a random 4-char alphanumeric code
function createRandomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Ensure it's unique in the tenant
async function generateReferralCode(tenantId: string): Promise<string> {
  const db = getDb();
  for (let i = 0; i < 5; i++) {
    const code = createRandomCode();
    const q = query(collection(db, 'tenants', tenantId, 'customers'), where('referralCode', '==', code), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return code;
    }
  }
  // Fallback to timestamp based if collision keeps happening
  return createRandomCode();
}

async function processReferralReward(tenantId: string, referrerCode: string) {
  if (!referrerCode) return;
  const db = getDb();
  const q = query(collection(db, 'tenants', tenantId, 'customers'), where('referralCode', '==', referrerCode), limit(1));
  const snapshot = await getDocs(q);
  
  if (!snapshot.empty) {
    const referrerDoc = snapshot.docs[0];
    await updateDoc(referrerDoc.ref, {
      totalReferrals: increment(1),
      pointsBalance: increment(20), // 20 points = ₱10 value
      updatedAt: serverTimestamp()
    });
  }
}

export async function awardPoints(tenantId: string, phoneNumber: string, amountSpentCents: number, referrerCode?: string) {
  if (!phoneNumber) return 0;
  
  // Format phone slightly if needed, but we assume exact match for now
  const customerId = phoneNumber.replace(/[^0-9+]/g, '');
  if (customerId.length < 10) return 0; // basic validation

  const pointsEarned = Math.floor(amountSpentCents * POINTS_PER_CENTAVO);
  
  if (pointsEarned <= 0) return 0;

  const customerRef = doc(getDb(), 'tenants', tenantId, 'customers', customerId);
  const snap = await getDoc(customerRef);

  if (!snap.exists()) {
    const newCode = await generateReferralCode(tenantId);
    await setDoc(customerRef, {
      phoneNumber: customerId,
      pointsBalance: pointsEarned,
      lifetimeValueCents: amountSpentCents,
      referralCode: newCode,
      referredBy: referrerCode || null,
      totalReferrals: 0,
      isFirstTransactionCompleted: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    if (referrerCode) {
      await processReferralReward(tenantId, referrerCode);
    }
  } else {
    const data = snap.data();
    const updates: any = {
      pointsBalance: increment(pointsEarned),
      lifetimeValueCents: increment(amountSpentCents),
      updatedAt: serverTimestamp()
    };
    
    // Backfill legacy users
    if (!data.referralCode) {
      updates.referralCode = await generateReferralCode(tenantId);
      updates.totalReferrals = 0;
    }

    let isFirstTx = data.isFirstTransactionCompleted;
    if (!isFirstTx) {
      updates.isFirstTransactionCompleted = true;
      const refCodeToReward = referrerCode || data.referredBy;
      if (refCodeToReward) {
        updates.referredBy = refCodeToReward;
        await processReferralReward(tenantId, refCodeToReward);
      }
    }

    await updateDoc(customerRef, updates);
  }

  return pointsEarned;
}

export async function redeemPoints(tenantId: string, phoneNumber: string, pointsToRedeem: number) {
  const customerId = phoneNumber.replace(/[^0-9+]/g, '');
  const customerRef = doc(getDb(), 'tenants', tenantId, 'customers', customerId);
  
  const snap = await getDoc(customerRef);
  if (!snap.exists()) throw new Error("Customer not found.");
  
  const currentPoints = snap.data().pointsBalance || 0;
  if (currentPoints < pointsToRedeem) {
    throw new Error("Insufficient points balance.");
  }

  await updateDoc(customerRef, {
    pointsBalance: increment(-pointsToRedeem),
    updatedAt: serverTimestamp()
  });

  return currentPoints - pointsToRedeem;
}

export async function getCustomerPoints(tenantId: string, phoneNumber: string) {
  const customerId = phoneNumber.replace(/[^0-9+]/g, '');
  if (!customerId) return 0;

  const customerRef = doc(getDb(), 'tenants', tenantId, 'customers', customerId);
  const snap = await getDoc(customerRef);
  
  if (snap.exists()) {
    return snap.data().pointsBalance || 0;
  }
  return 0;
}
