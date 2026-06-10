import { 
  doc, 
  getDoc,
  updateDoc,
  collection, 
  query, 
  where, 
  getDocs,
  setDoc,
  orderBy,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { runTransactionResilient } from './resilient-transaction';

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

  await runTransactionResilient(db, async (transaction) => {
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

    const userProfileRef = doc(db, 'users', userUid);

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

    // Configure User Profile as Staff member
    transaction.update(userProfileRef, {
      role: 'staff',
      tenantId: inviteData.tenantId,
      moduleType: inviteData.moduleType,
      updatedAt: serverTimestamp()
    });
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
 * Handles unified Login & Registration for Team Members using a Business Code.
 * If login fails (user not found), it uses the Business Code to auto-register them.
 */
export async function loginOrRegisterStaff(email: string, password: string, businessCode?: string) {
  const { auth, db } = initializeFirebase();

  try {
    // Attempt standard login first
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error: any) {
    // If login fails, check if they provided a business code for auto-registration
    if (error.code === 'auth/invalid-credential' && businessCode) {
      // Validate business code first
      const codeRef = doc(db, 'business_codes', businessCode);
      const codeSnap = await getDoc(codeRef);
      
      if (!codeSnap.exists()) {
        throw new Error('Invalid Business Code.');
      }

      const tenantId = codeSnap.data().tenantId;
      const moduleType = codeSnap.data().moduleType || 'rental'; // fallback

      // Try to register the new staff member
      try {
        const { createUserWithEmailAndPassword } = await import('firebase/auth');
        const newUserCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = newUserCredential.user.uid;

        // Generate Unique 4-Char Referral Code
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
          throw new Error("Failed to generate a unique referral code.");
        }

        // Atomic write to create user profile and link to tenant
        await runTransactionResilient(db, async (transaction) => {
          const userRef = doc(db, 'users', uid);
          const tenantRef = doc(db, 'tenants', tenantId);
          const refCodeDoc = doc(db, 'referral_codes', referralCode);

          // Check if tenant exists
          const tenantSnap = await transaction.get(tenantRef);
          if (!tenantSnap.exists()) {
            throw new Error("Business not found.");
          }

          const refCodeSnap = await transaction.get(refCodeDoc);
          if (refCodeSnap.exists()) {
             throw new Error("Collision during transaction for referral code.");
          }

          transaction.set(refCodeDoc, {
            uid: uid,
            createdAt: serverTimestamp(),
          });

          // Create User Profile
          transaction.set(userRef, {
            uid: uid,
            email: email,
            role: 'staff',
            tenantId: tenantId,
            moduleType: tenantSnap.data().moduleType || moduleType,
            referralCode: referralCode,
            referralEarnings: 0,
            subscriptionStatus: 'pending', // Requires payment verification
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // Add to Tenant's staff list
          transaction.update(tenantRef, {
            staffUids: arrayUnion(uid),
            updatedAt: serverTimestamp(),
          });
        });

        return { success: true, user: newUserCredential.user, isNewRegistration: true };
      } catch (registrationError: any) {
        // If email is already in use, it means they typed the wrong password during standard login
        if (registrationError.code === 'auth/email-already-in-use') {
          throw new Error('Invalid email or password.');
        }
        
        // Clean up orphaned auth user if transaction failed
        if (auth.currentUser) {
           await auth.currentUser.delete().catch(console.error);
        }
        throw new Error(registrationError.message || 'Registration failed. Please try again.');
      }
    }

    // Re-throw original error if no business code or different error
    throw error;
  }
}
