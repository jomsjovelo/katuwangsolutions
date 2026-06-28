import { doc, collection, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { runTransactionResilient } from './resilient-transaction';

export const getKatuwangDb = () => initializeFirebase().db;

export async function setupRooms(tenantId: string, roomNames: string[]) {
  const db = getKatuwangDb();
  
  const promises = roomNames.map(name => {
    const roomRef = doc(collection(db, 'tenants', tenantId, 'rooms'));
    return setDoc(roomRef, {
      id: roomRef.id,
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

export async function renameRoom(tenantId: string, roomId: string, newName: string) {
  const db = getKatuwangDb();
  const roomRef = doc(db, 'tenants', tenantId, 'rooms', roomId);
  await updateDoc(roomRef, {
    name: newName.trim(),
    updatedAt: serverTimestamp()
  });
  return true;
}

export async function deleteRoom(tenantId: string, roomId: string) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const roomRef = doc(db, 'tenants', tenantId, 'rooms', roomId);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found");
    if (roomSnap.data().status !== 'available') {
      throw new Error("Cannot delete a room that is currently occupied");
    }
    transaction.delete(roomRef);
  });
  
  return true;
}

// Sets a room to occupied and links the appointment
export async function occupyRoom(tenantId: string, roomId: string, appointmentId: string) {
  const db = getKatuwangDb();
  const roomRef = doc(db, 'tenants', tenantId, 'rooms', roomId);
  await updateDoc(roomRef, {
    status: 'occupied',
    currentAppointmentId: appointmentId,
    occupiedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return true;
}

// Sets a room back to available
export async function releaseRoom(tenantId: string, roomId: string) {
  const db = getKatuwangDb();
  const roomRef = doc(db, 'tenants', tenantId, 'rooms', roomId);
  await updateDoc(roomRef, {
    status: 'available',
    currentAppointmentId: null,
    occupiedAt: null,
    updatedAt: serverTimestamp()
  });
  return true;
}
