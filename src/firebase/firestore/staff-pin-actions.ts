import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  query, 
  where, 
  serverTimestamp 
} from 'firebase/firestore';
import { initializeFirebase } from '../index';

export interface StaffAccount {
  id: string;
  tenantId: string;
  username: string;
  usernameLower: string;
  pinHash: string;
  status: 'active' | 'disabled';
  createdAt: any;
  lastLoginAt: any | null;
}

/**
  * Simple SHA-256 helper for PIN hashing
  */
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback string manipulation if crypto.subtle is unavailable
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'fallback_' + Math.abs(hash).toString(16);
}

/**
 * Creates a new PIN-based staff account under a tenant.
 * - Enforces 1 free staff account limit per tenant
 * - Enforces global username uniqueness
 * - Hashes 4-digit PIN
 */
export async function createStaffAccount(
  tenantId: string,
  username: string,
  pin: string
): Promise<StaffAccount> {
  const { db } = initializeFirebase();

  const cleanUsername = username.trim();
  const cleanPin = pin.trim();

  if (!cleanUsername || cleanUsername.length < 2) {
    throw new Error('Ang username ay dapat 2 o higit pang letra.');
  }

  if (!/^\d{4}$/.exec(cleanPin)) {
    throw new Error('Ang PIN ay dapat 4-digit na numero (hal. 1234).');
  }

  const usernameLower = cleanUsername.toLowerCase();

  // 1. Check if global username is already taken in staff_usernames collection
  const globalUserRef = doc(db, 'staff_usernames', usernameLower);
  const globalUserSnap = await getDoc(globalUserRef);

  if (globalUserSnap.exists()) {
    throw new Error(`Ang username na "${cleanUsername}" ay nakuha na. Pumili ng ibang username.`);
  }

  // 2. Check tenant 1-free-staff limit
  const staffRef = collection(db, 'tenants', tenantId, 'staff_accounts');
  const existingSnap = await getDocs(staffRef);

  const activeStaffList = existingSnap.docs.map(d => d.data());
  if (activeStaffList.length >= 1) {
    throw new Error('Nagamit mo na ang inyong 1 Libreng Cashier Account. Mag-upgrade upang magdagdag ng higit pa.');
  }

  // 3. Create PIN hash
  const pinHash = await hashPin(cleanPin);

  // 4. Save to subcollection & claim username globally
  const newStaffRef = doc(staffRef);
  const staffData: any = {
    id: newStaffRef.id,
    tenantId,
    username: cleanUsername,
    usernameLower,
    pinHash,
    status: 'active',
    createdAt: serverTimestamp(),
    lastLoginAt: null
  };

  // Claim global username first to prevent concurrent registration
  await setDoc(globalUserRef, {
    username: cleanUsername,
    usernameLower,
    tenantId,
    staffAccountId: newStaffRef.id,
    createdAt: serverTimestamp()
  });

  try {
    await setDoc(newStaffRef, staffData);
  } catch (err) {
    // Rollback global username claim if subcollection write fails
    await deleteDoc(globalUserRef).catch(console.warn);
    throw err;
  }

  return staffData;
}

/**
 * Verifies staff login using Business Code + Username + 4-digit PIN.
 */
export async function verifyStaffLogin(
  businessCode: string,
  username: string,
  pin: string
): Promise<{ tenantId: string; staffAccount: StaffAccount; tenantName?: string; moduleType?: string }> {
  const { db } = initializeFirebase();

  const cleanCode = businessCode.trim().toUpperCase();
  const cleanUsername = username.trim().toLowerCase();
  const cleanPin = pin.trim();

  if (!cleanCode) throw new Error('Ilagay ang Business Code ng inyong tindahan.');
  if (!cleanUsername) throw new Error('Ilagay ang inyong Username.');
  if (!cleanPin) throw new Error('Ilagay ang 4-digit PIN.');

  // 1. Lookup Business Code
  const codeSnap = await getDoc(doc(db, 'business_codes', cleanCode));
  if (!codeSnap.exists()) {
    throw new Error('Maling Business Code. Paki-check at subukan muli.');
  }

  const tenantId = codeSnap.data().tenantId;
  if (!tenantId) {
    throw new Error('Hindi nahanap ang tindahan gamit ang Business Code na ito.');
  }

  // 2. Fetch tenant info
  const tenantSnap = await getDoc(doc(db, 'tenants', tenantId));
  const tenantData = tenantSnap.exists() ? tenantSnap.data() : {};

  // 3. Find Staff Account by username (scoped to tenant or global lookup)
  const staffQuery = query(
    collection(db, 'tenants', tenantId, 'staff_accounts'),
    where('usernameLower', '==', cleanUsername)
  );
  const staffSnap = await getDocs(staffQuery);

  if (staffSnap.empty) {
    throw new Error('Maling Username o hindi mahanap ang Cashier Account sa tindahang ito.');
  }

  const staffDoc = staffSnap.docs[0];
  const staffAccount = staffDoc.data() as StaffAccount;

  if (staffAccount.status === 'disabled') {
    throw new Error('Ang inyong Cashier Account ay na-disable ng may-ari.');
  }

  // 4. Verify PIN hash
  const inputPinHash = await hashPin(cleanPin);
  if (staffAccount.pinHash !== inputPinHash) {
    throw new Error('Maling 4-digit PIN. Subukan muli.');
  }

  // 5. Update last login timestamp
  await updateDoc(doc(db, 'tenants', tenantId, 'staff_accounts', staffAccount.id), {
    lastLoginAt: serverTimestamp()
  });

  return {
    tenantId,
    staffAccount,
    tenantName: tenantData.name || 'Store',
    moduleType: tenantData.moduleType || 'benta-snap'
  };
}

/**
 * Removes a PIN-based staff account and releases the username.
 */
export async function removeStaffAccount(tenantId: string, staffAccountId: string, usernameLower?: string) {
  const { db } = initializeFirebase();

  let cleanUsernameLower = usernameLower ? usernameLower.toLowerCase() : '';

  if (!cleanUsernameLower) {
    const snap = await getDoc(doc(db, 'tenants', tenantId, 'staff_accounts', staffAccountId));
    if (snap.exists()) {
      cleanUsernameLower = (snap.data().usernameLower || snap.data().username || '').toLowerCase();
    }
  }

  // Delete from tenant subcollection
  await deleteDoc(doc(db, 'tenants', tenantId, 'staff_accounts', staffAccountId));

  // Release global username
  if (cleanUsernameLower) {
    await deleteDoc(doc(db, 'staff_usernames', cleanUsernameLower)).catch(console.warn);
  }

  return true;
}

/**
 * Resets the 4-digit PIN for a staff account.
 */
export async function resetStaffPin(tenantId: string, staffAccountId: string, newPin: string) {
  const { db } = initializeFirebase();
  const cleanPin = newPin.trim();

  if (!/^\d{4}$/.exec(cleanPin)) {
    throw new Error('Ang bagong PIN ay dapat 4-digit na numero.');
  }

  const pinHash = await hashPin(cleanPin);
  await updateDoc(doc(db, 'tenants', tenantId, 'staff_accounts', staffAccountId), {
    pinHash,
    updatedAt: serverTimestamp()
  });

  return true;
}
