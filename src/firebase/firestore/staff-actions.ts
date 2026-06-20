import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp, collection, query, where, getDocs, setDoc, arrayRemove } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { runTransactionResilient } from './resilient-transaction';
import { generateUniqueReferralCode } from './referral-utils';

/**
 * Cleanly logs in an existing user.
 * Assumes the user already exists in the database.
 */
export async function loginUser(email: string, password: string) {
  const { auth } = initializeFirebase();

  try {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (e) {
      const error = e as Error & { code?: string };
    if (error.code === 'auth/invalid-credential') {
      throw new Error('Invalid email or password.');
    }
    console.error('Login failed:', error);
    throw new Error(error.message || 'Login failed. Please try again.');
  }
}

/**
 * Registers a NEW staff member using a Business Code.
 * Validates the code, creates the auth account, and securely links the profile to the tenant.
 */
export async function registerStaff(
  email: string,
  password: string,
  businessCode: string,
  fullName?: string,
  birthday?: string,
  gender?: string,
  address?: string,
  referredBy?: string
) {
  const { db } = initializeFirebase();

  try {
    // 1. Verify Business Code first before Auth
    const codeSnap = await getDoc(doc(db, 'business_codes', businessCode.toUpperCase()));
    if (!codeSnap.exists()) {
      throw new Error('Invalid Business Code. Please check and try again.');
    }

    let ownerUid = codeSnap.data().ownerUid;
    const fallbackTenantId = codeSnap.data().tenantId;

    try {
      // 2. Create the user in Auth FIRST so we have permission to read tenants
      const { createUserWithEmailAndPassword } = await import('firebase/auth');
      const { auth } = initializeFirebase();
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      if (!ownerUid && fallbackTenantId) {
        const fallbackSnap = await getDoc(doc(db, 'tenants', fallbackTenantId));
        if (fallbackSnap.exists()) {
          ownerUid = fallbackSnap.data().ownerUid;
        }
      }

      if (!ownerUid) {
        await userCredential.user.delete().catch(console.error);
        throw new Error('Invalid Business Code. Could not determine store owner.');
      }

      let assignedTenantId = fallbackTenantId || '';
      let assignedModuleType = 'rental';
      let assignedRole = 'pending_staff';

      if (assignedTenantId) {
        const tenantSnap = await getDoc(doc(db, 'tenants', assignedTenantId));
        if (tenantSnap.exists()) {
          assignedModuleType = tenantSnap.data().moduleType || 'rental';
        }
      }

      // Generate unique referral code for this staff member
      const referralCode = await generateUniqueReferralCode(db);

      // 3. Atomic Database Setup
      try {
        await runTransactionResilient(db, async (transaction) => {
          const userRef = doc(db, 'users', uid);
          const refCodeDoc = doc(collection(db, 'referral_codes'), referralCode);
          
          // Claim the referral code
          transaction.set(refCodeDoc, { uid: uid });

          // Create User Profile
          transaction.set(userRef, {
            uid: uid,
            fullName: fullName || email.split('@')[0],
            email: email,
            personalPhone: '',
            birthday: birthday || '',
            gender: gender || 'Prefer not to say',
            address: address || '',
            role: assignedRole,
            tenantId: assignedTenantId,
            moduleType: assignedModuleType,
            approvalStatus: 'pending_owner',
            enterpriseOwnerUid: ownerUid,
            referralCode: referralCode,
            referralEarnings: 0,
            referredBy: referredBy || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

        return { success: true, user: userCredential.user };
      } catch (transactionError: any) {
        // Rollback Auth user if DB setup fails
        await userCredential.user.delete().catch(console.error);
        throw transactionError;
      }
    } catch (e) {
      const error = e as Error & { code?: string };
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('An account with this email already exists. Please log in directly.');
      }
      console.error('Staff registration failed:', error);
      throw new Error(error.message || 'Registration failed. Please try again.');
    }
  } catch (e) {
    throw e;
  }
}
/**
 * Logs a Time-In or Time-Out entry for a staff member.
 * When Time-Out, also increments daysWorkedThisPeriod on the employee.
 */
export async function logAttendance(
  tenantId: string,
  employeeId: string,
  employeeName: string,
  type: 'time_in' | 'time_out'
) {
  const { db } = initializeFirebase();
  const attendanceRef = collection(db, 'tenants', tenantId, 'attendance');
  const newRef = doc(attendanceRef);

  await setDoc(newRef, {
    id: newRef.id,
    employeeId,
    employeeName,
    type,
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  // When timing out, increment daysWorkedThisPeriod by 1
  if (type === 'time_out') {
    const empRef = doc(db, 'tenants', tenantId, 'employees', employeeId);
    const empSnap = await getDoc(empRef);
    const currentDays = empSnap.data()?.daysWorkedThisPeriod || 0;
    await updateDoc(empRef, {
      daysWorkedThisPeriod: currentDays + 1,
      updatedAt: serverTimestamp(),
    });
  }

  return newRef.id;
}


/**
 * Creates a new pending staff invitation.
 */
export async function sendStaffInvite(tenantId: string, tenantName: string, moduleType: string, email: string) {
  const { db } = initializeFirebase();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail) {
    throw new Error('Kinakailangan po ang email address ng inyong helper.');
  }

  // Check if a pending invite already exists for this tenant and email
  const invitesRef = collection(db, 'invites');
  const duplicateQuery = query(
    invitesRef, 
    where('tenantId', '==', tenantId), 
    where('email', '==', cleanEmail), 
    where('status', '==', 'pending')
  );
  
  const duplicateSnap = await getDocs(duplicateQuery);
  if (!duplicateSnap.empty) {
    throw new Error('May pending invite na po na ipinadala sa email na ito.');
  }

  // Save the invite
  const newInviteRef = doc(invitesRef);
  await updateDoc(newInviteRef as any, {
    id: newInviteRef.id,
    tenantId,
    tenantName,
    moduleType,
    email: cleanEmail,
    role: 'staff',
    status: 'pending',
    createdAt: serverTimestamp()
  } as any).catch(async () => {
    // If updateDoc fails (e.g., document doesn't exist yet because updateDoc expects existing), use setDoc equivalent or basic set
    const { setDoc } = await import('firebase/firestore');
    await setDoc(newInviteRef, {
      id: newInviteRef.id,
      tenantId,
      tenantName,
      moduleType,
      email: cleanEmail,
      role: 'staff',
      status: 'pending',
      createdAt: serverTimestamp()
    });
  });

  return newInviteRef.id;
}

/**
 * Atomically accepts an invitation and configures roles/tenants.
 */
export async function acceptStaffInvite(inviteId: string, userUid: string) {
  const { db } = initializeFirebase();

  const userProfileRef = doc(db, 'users', userUid);
  // We need to use dynamic import for getDoc since it might not be at the top level
  const { getDoc } = await import('firebase/firestore');
  const userSnapDoc = await getDoc(userProfileRef);
  const hasCode = userSnapDoc.exists() && userSnapDoc.data()?.referralCode;

  let preGeneratedCode = '';
  if (!hasCode) {
    preGeneratedCode = await generateUniqueReferralCode(db);
  }

  await runTransactionResilient(db, async (transaction) => {
    // 1. Gather all reads
    const inviteRef = doc(db, 'invites', inviteId);
    const inviteSnap = await transaction.get(inviteRef);

    if (!inviteSnap.exists()) {
      throw new Error('Hindi nahanap ang invitation record.');
    }

    const inviteData = inviteSnap.data();
    if (inviteData.status !== 'pending') {
      throw new Error('Ang invitation na ito ay hindi na pending.');
    }

    const tenantRef = doc(db, 'tenants', inviteData.tenantId);
    const tenantSnap = await transaction.get(tenantRef);

    if (!tenantSnap.exists()) {
      throw new Error('Hindi nahanap ang tindahan na nag-invite sa inyo.');
    }

    const userSnap = await transaction.get(userProfileRef);
    
    let refCodeDoc = null;
    let collisionCheck = null;
    if (!hasCode && preGeneratedCode) {
      refCodeDoc = doc(db, 'referral_codes', preGeneratedCode);
      collisionCheck = await transaction.get(refCodeDoc);
      if (collisionCheck.exists()) {
        throw new Error('Collision detected. Please try accepting the invite again.');
      }
    }

    // 2. Perform all writes
    // Update invite status
    transaction.update(inviteRef, { 
      status: 'accepted',
      updatedAt: serverTimestamp()
    });

    // Add UID to tenant's staffUids array
    transaction.update(tenantRef, {
      staffUids: arrayUnion(userUid),
      updatedAt: serverTimestamp()
    });
    
    let userUpdates: any = {
      role: 'staff',
      tenantId: inviteData.tenantId,
      moduleType: inviteData.moduleType,
      updatedAt: serverTimestamp()
    };

    if (!hasCode && preGeneratedCode && refCodeDoc) {
      transaction.set(refCodeDoc, { uid: userUid, createdAt: serverTimestamp() });
      userUpdates.referralCode = preGeneratedCode;
      if (!userSnap.exists() || userSnap.data()?.referralEarnings === undefined) {
        userUpdates.referralEarnings = 0;
      }
    }

    transaction.update(userProfileRef, userUpdates);
  });

  return true;
}

/**
 * Rejects a staff invitation.
 */
export async function rejectStaffInvite(inviteId: string) {
  const { db } = initializeFirebase();
  const inviteRef = doc(db, 'invites', inviteId);
  await updateDoc(inviteRef, {
    status: 'rejected',
    updatedAt: serverTimestamp()
  });
  return true;
}

/**
 * Removes a staff member from a tenant, resetting their role to guest.
 */
export async function removeStaffMember(tenantId: string, staffUid: string) {
  const { db } = initializeFirebase();

  await runTransactionResilient(db, async (transaction) => {
    const tenantRef = doc(db, 'tenants', tenantId);
    const userProfileRef = doc(db, 'users', staffUid);

    // Remove staff member UID from tenant's staffUids array
    transaction.update(tenantRef, {
      staffUids: arrayRemove(staffUid),
      updatedAt: serverTimestamp()
    });

    // Reset helper user profile
    transaction.update(userProfileRef, {
      role: 'guest',
      tenantId: '',
      moduleType: '',
      updatedAt: serverTimestamp()
    });
  });

  return true;
}



/**
 * Regenerates the business code for a tenant.
 */
export async function regenerateBusinessCode(tenantId: string, currentCode: string) {
  const { db } = initializeFirebase();
  const { doc, getDoc } = await import('firebase/firestore');

  // Generate a new unique 7-character code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let isUnique = false;
  let codeToUse = '';
  
  let attempts = 0;
  while (!isUnique && attempts < 10) {
    codeToUse = Array.from({ length: 7 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    const bSnap = await getDoc(doc(db, 'business_codes', codeToUse));
    const rSnap = await getDoc(doc(db, 'referral_codes', codeToUse));
    if (!bSnap.exists() && !rSnap.exists()) isUnique = true;
    attempts++;
  }

  if (!isUnique) throw new Error('Could not generate a unique code. Please try again.');

  await runTransactionResilient(db, async (transaction) => {
    const newCodeRef = doc(db, 'business_codes', codeToUse);
    const oldCodeRef = doc(db, 'business_codes', currentCode);
    const tenantRef = doc(db, 'tenants', tenantId);

    // Create the new code document
    transaction.set(newCodeRef, { tenantId: tenantId });
    
    // Update the tenant
    transaction.update(tenantRef, { businessCode: codeToUse });

    // Delete the old code document
    transaction.delete(oldCodeRef);
  });

  return codeToUse;
}

/**
 * Approves a pending staff member and assigns them to a specific tenant/module.
 */
export async function approveStaff(staffUid: string, tenantId: string, moduleType: string) {
  const { db } = initializeFirebase();
  const { doc, serverTimestamp, arrayUnion } = await import('firebase/firestore');

  await runTransactionResilient(db, async (transaction) => {
    const userRef = doc(db, 'users', staffUid);
    // Update user profile
    transaction.update(userRef, {
      approvalStatus: 'pending_admin',
      tenantId: tenantId,
      moduleType: moduleType,
      updatedAt: serverTimestamp()
    });
  });

  return true;
}

/**
 * Rejects a pending staff member.
 */
export async function rejectStaff(staffUid: string) {
  const { db } = initializeFirebase();
  const { doc, serverTimestamp } = await import('firebase/firestore');

  await runTransactionResilient(db, async (transaction) => {
    const userRef = doc(db, 'users', staffUid);
    const snap = await transaction.get(userRef);
    
    if (!snap.exists()) {
      console.warn(`Attempted to reject staff ${staffUid} but record does not exist.`);
      return;
    }
    
    // Set to rejected, effectively locking them out
    transaction.update(userRef, {
      approvalStatus: 'rejected',
      role: 'guest',
      updatedAt: serverTimestamp()
    });
  });

  return true;
}

