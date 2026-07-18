import { doc, collection, serverTimestamp, setDoc, increment, getDocs, query, Timestamp, writeBatch } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { runTransactionResilient } from './resilient-transaction';
import { logAuditEvent } from './audit-actions';

export const getKatuwangDb = () => initializeFirebase().db;

export interface RoomData {
  roomNumber: string;
  type: string;
  rateCentavos: number;
  shortTimeRatesCentavos?: {
    '3h'?: number;
    '6h'?: number;
    '8h'?: number;
    '12h'?: number;
  };
  capacity: number;
  bedType: string;
  status: 'Available' | 'Occupied' | 'Cleaning';
  extraPaxFeeCentavos?: number;
}

export async function addRoom(tenantId: string, data: RoomData): Promise<void> {
  const db = getKatuwangDb();
  
  // enforce max 25 rooms
  const roomsRef = collection(db, 'tenants', tenantId, 'rooms');
  const snap = await getDocs(query(roomsRef));
  const activeRoomsCount = snap.docs.filter(doc => !doc.data().deletedAt).length;
  if (activeRoomsCount >= 25) {
    throw new Error('Maximum of 25 rooms allowed for Tsek-In module.');
  }

  const newRef = doc(roomsRef);
  await setDoc(newRef, {
    id: newRef.id,
    ...data,
    status: 'Available',
    createdAt: serverTimestamp(),
  });
}

export async function updateCategoryRates(
  tenantId: string, 
  categoryName: string, 
  newRateCentavos: number,
  shortTimeRatesCentavos?: { '3h'?: number, '6h'?: number, '8h'?: number, '12h'?: number },
  extraPaxFeeCentavos?: number
) {
  const db = getKatuwangDb();
  const roomsRef = collection(db, 'tenants', tenantId, 'rooms');
  const snap = await getDocs(query(roomsRef));
  
  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.type === categoryName && !data.deletedAt) {
      batch.update(d.ref, { 
        rateCentavos: newRateCentavos,
        ...(shortTimeRatesCentavos ? { shortTimeRatesCentavos } : {}),
        ...(extraPaxFeeCentavos !== undefined ? { extraPaxFeeCentavos } : {})
      });
    }
  });
  await batch.commit();
}

export async function updateRoomStatus(tenantId: string, roomId: string, status: 'Available' | 'Occupied' | 'Cleaning') {
  const db = getKatuwangDb();
  const roomRef = doc(db, 'tenants', tenantId, 'rooms', roomId);
  await setDoc(roomRef, { status }, { merge: true });
}

export async function deleteRoom(tenantId: string, roomId: string) {
  const db = getKatuwangDb();
  const roomRef = doc(db, 'tenants', tenantId, 'rooms', roomId);
  await setDoc(roomRef, { deletedAt: serverTimestamp() }, { merge: true });
}

export interface BookingData {
  roomId: string;
  roomName: string;
  guestName: string;
  contactInfo: string;
  checkInDate: Date;
  nights: number;
  paymentMethod: string;
  initialPaymentCentavos: number;
  rateCentavos: number;
  extraPax: number;
  extraPaxCostCentavos: number;
  expectedCheckOutDate: Date;
  totalRoomCostCentavos: number;
  userId?: string;
  userName?: string;
}

export async function checkInGuest(tenantId: string, data: BookingData) {
  const db = getKatuwangDb();
  await runTransactionResilient(db, async (transaction) => {
    const roomRef = doc(db, 'tenants', tenantId, 'rooms', data.roomId);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error('Room not found');
    if (roomSnap.data().status !== 'Available') throw new Error('Room is not available');

    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    const masterAccountSnap = data.initialPaymentCentavos > 0 ? await transaction.get(masterAccountRef) : null;

    transaction.update(roomRef, { status: 'Occupied' });

    const bookingsRef = collection(db, 'tenants', tenantId, 'bookings');
    const newBookingRef = doc(bookingsRef);
    
    transaction.set(newBookingRef, {
      id: newBookingRef.id,
      ...data,
      status: 'Active',
      createdAt: serverTimestamp(),
    });

    if (data.initialPaymentCentavos > 0 && masterAccountSnap) {
      const amountCentavos = data.initialPaymentCentavos;
      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: amountCentavos,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.set(masterAccountRef, {
          balance: increment(amountCentavos),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: amountCentavos,
        type: 'income',
        category: 'Check-In Payment',
        description: `Check-in advance payment for ${data.guestName} (Room ${data.roomName})`,
        paymentMethod: data.paymentMethod,
        status: 'completed',
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
        referenceId: newBookingRef.id,
        createdBy: data.userId || null,
        createdByName: data.userName || null,
      });
    }
  });
}

export async function checkOutGuest(
  tenantId: string,
  bookingId: string,
  roomId: string,
  extraChargesList: { description: string, amountCentavos: number }[],
  finalPaymentCentavos: number,
  paymentMethod: string,
  userId?: string,
  userName?: string,
  checkOutDate?: Date
) {
  const db = getKatuwangDb();
  await runTransactionResilient(db, async (transaction) => {
    const bookingRef = doc(db, 'tenants', tenantId, 'bookings', bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error('Booking not found');

    const bookingData = bookingSnap.data();
    
    // Read master account FIRST to satisfy Firestore read-before-write requirement
    const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
    let masterAccountSnap = null;
    if (finalPaymentCentavos !== 0) {
      masterAccountSnap = await transaction.get(masterAccountRef);
    }

    const roomRef = doc(db, 'tenants', tenantId, 'rooms', roomId);
    transaction.update(roomRef, { status: 'Cleaning' });

    const extraChargesCentavos = extraChargesList.reduce((acc, c) => acc + c.amountCentavos, 0);

    transaction.update(bookingRef, {
      status: 'CheckedOut',
      extraChargesCentavos,
      extraChargesList, // save breakdown
      finalPaymentCentavos,
      checkedOutAt: checkOutDate || serverTimestamp(),
    });

    if (finalPaymentCentavos !== 0 && masterAccountSnap) {
      const absPaymentCentavos = Math.abs(finalPaymentCentavos);
      const isRefund = finalPaymentCentavos < 0;

      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: finalPaymentCentavos,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.set(masterAccountRef, {
          balance: increment(finalPaymentCentavos),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: absPaymentCentavos,
        type: isRefund ? 'expense' : 'income',
        category: isRefund ? 'Refund / Change' : 'Check-Out Payment',
        description: isRefund 
          ? `Change/refund for ${bookingData.guestName} upon check-out` 
          : `Check-out balance settlement for ${bookingData.guestName}${extraChargesList.length > 0 ? `. Extra Charges: ${extraChargesList.map(c => `${c.description} (₱${(c.amountCentavos / 100).toLocaleString()})`).join(', ')}` : ''}`,
        paymentMethod,
        status: 'completed',
        date: checkOutDate || serverTimestamp(),
        createdAt: serverTimestamp(),
        referenceId: bookingId,
        createdBy: userId || null,
        createdByName: userName || null,
      });
    }
  });
}

export async function extendGuestStay(
  tenantId: string,
  bookingId: string,
  additionalHoursOrNightsStr: string,
  newExpectedCheckOutDate: Date,
  additionalCostCentavos: number,
  paymentCollectedCentavos: number,
  paymentMethod: string,
  userId?: string,
  userName?: string
) {
  const db = getKatuwangDb();
  await runTransactionResilient(db, async (transaction) => {
    const bookingRef = doc(db, 'tenants', tenantId, 'bookings', bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error('Booking not found');

    const bookingData = bookingSnap.data();

    transaction.update(bookingRef, {
      expectedCheckOutDate: newExpectedCheckOutDate,
      totalRoomCostCentavos: increment(additionalCostCentavos),
      initialPaymentCentavos: increment(paymentCollectedCentavos),
      nights: typeof bookingData.nights === 'number' && additionalHoursOrNightsStr.includes('Night') ? 
        increment(parseInt(additionalHoursOrNightsStr) || 0) : bookingData.nights
    });

    if (paymentCollectedCentavos > 0) {
      const paymentCentavos = paymentCollectedCentavos;
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      
      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: paymentCentavos,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.set(masterAccountRef, {
          balance: increment(paymentCentavos),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: paymentCentavos,
        type: 'income',
        category: 'Extension Payment',
        description: `Extension payment for ${bookingData.guestName} (${additionalHoursOrNightsStr})`,
        paymentMethod,
        status: 'completed',
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
        referenceId: bookingId,
        createdBy: userId || null,
        createdByName: userName || null,
      });
    }
  });
}
