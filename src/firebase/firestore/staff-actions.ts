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
