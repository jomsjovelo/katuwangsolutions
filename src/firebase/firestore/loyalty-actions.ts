import { initializeFirebase } from '../index';
import { 
  collection, 
  doc, 
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp 
} from 'firebase/firestore';

const getDb = () => initializeFirebase().db;


// 1 point per 100 pesos (10,000 centavos)
const POINTS_PER_CENTAVO = 1 / 10000; 

export async function awardPoints(tenantId: string, phoneNumber: string, amountSpentCents: number) {
  if (!phoneNumber) return 0;
  
  // Format phone slightly if needed, but we assume exact match for now
  const customerId = phoneNumber.replace(/[^0-9+]/g, '');
  if (customerId.length < 10) return 0; // basic validation

  const pointsEarned = Math.floor(amountSpentCents * POINTS_PER_CENTAVO);
  
  if (pointsEarned <= 0) return 0;

  const customerRef = doc(getDb(), 'tenants', tenantId, 'customers', customerId);
  const snap = await getDoc(customerRef);

  if (!snap.exists()) {
    await setDoc(customerRef, {
      phoneNumber: customerId,
      pointsBalance: pointsEarned,
      lifetimeValueCents: amountSpentCents,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } else {
    await updateDoc(customerRef, {
      pointsBalance: increment(pointsEarned),
      lifetimeValueCents: increment(amountSpentCents),
      updatedAt: serverTimestamp()
    });
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
