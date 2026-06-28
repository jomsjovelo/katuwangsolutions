import { doc, collection, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { runTransactionResilient } from './resilient-transaction';

export const getKatuwangDb = () => initializeFirebase().db;

export async function setupChairs(tenantId: string, chairNames: string[]) {
  const db = getKatuwangDb();
  
  const promises = chairNames.map(name => {
    const chairRef = doc(collection(db, 'tenants', tenantId, 'chairs'));
    return setDoc(chairRef, {
      id: chairRef.id,
      name: name.trim(),
      status: 'available',
      currentAppointmentId: null,
      occupiedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  await Promise.all(promises);
  return true;
}

export async function renameChair(tenantId: string, chairId: string, newName: string) {
  const db = getKatuwangDb();
  const chairRef = doc(db, 'tenants', tenantId, 'chairs', chairId);
  await updateDoc(chairRef, {
    name: newName.trim(),
    updatedAt: serverTimestamp()
  });
  return true;
}

export async function deleteChair(tenantId: string, chairId: string) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const chairRef = doc(db, 'tenants', tenantId, 'chairs', chairId);
    const chairSnap = await transaction.get(chairRef);
    if (!chairSnap.exists()) throw new Error("Chair not found");
    if (chairSnap.data().status !== 'available') {
      throw new Error("Cannot delete a chair that is currently occupied");
    }
    transaction.delete(chairRef);
  });
  
  return true;
}

export async function occupyChair(tenantId: string, chairId: string, appointmentId: string) {
  const db = getKatuwangDb();
  const chairRef = doc(db, 'tenants', tenantId, 'chairs', chairId);
  await updateDoc(chairRef, {
    status: 'occupied',
    currentAppointmentId: appointmentId,
    occupiedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return true;
}

export async function releaseChair(tenantId: string, chairId: string) {
  const db = getKatuwangDb();
  const chairRef = doc(db, 'tenants', tenantId, 'chairs', chairId);
  await updateDoc(chairRef, {
    status: 'available',
    currentAppointmentId: null,
    occupiedAt: null,
    updatedAt: serverTimestamp()
  });
  return true;
}
