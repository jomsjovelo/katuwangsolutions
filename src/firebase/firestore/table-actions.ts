import { getFirestore, doc, collection, serverTimestamp, setDoc, increment, deleteDoc, updateDoc } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { runTransactionResilient } from './resilient-transaction';

export const getKatuwangDb = () => initializeFirebase().db;

export async function setupTables(tenantId: string, tableNames: string[]) {
  const db = getKatuwangDb();
  
  const promises = tableNames.map(name => {
    const tableRef = doc(collection(db, 'tenants', tenantId, 'tables'));
    return setDoc(tableRef, {
      id: tableRef.id,
      name: name.trim(),
      status: 'available',
      currentOrderIds: [],
      openedAt: null,
      guestCount: 0,
      runningTotal: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  await Promise.all(promises);
  return true;
}

export async function openTable(tenantId: string, tableId: string, guestCount: number) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const tableRef = doc(db, 'tenants', tenantId, 'tables', tableId);
    const tableSnap = await transaction.get(tableRef);
    
    if (!tableSnap.exists()) throw new Error("Table not found");
    if (tableSnap.data().status !== 'available') throw new Error("Table is not available");

    transaction.update(tableRef, {
      status: 'occupied',
      guestCount,
      openedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  return true;
}

export async function settleTable(tenantId: string, tableId: string, paymentMethod: string, gcashRef?: string) {
  const db = getKatuwangDb();
  
  let completedSaleItems: any[] = [];
  let finalRunningTotal = 0;

  await runTransactionResilient(db, async (transaction) => {
    completedSaleItems = [];
    const tableRef = doc(db, 'tenants', tenantId, 'tables', tableId);
    const tableSnap = await transaction.get(tableRef);
    
    if (!tableSnap.exists()) throw new Error("Table not found");
    const tableData = tableSnap.data();
    
    if (tableData.status === 'available') throw new Error("Table is already settled");

    const orderIds: string[] = tableData.currentOrderIds || [];
    const runningTotal = tableData.runningTotal || 0;
    finalRunningTotal = runningTotal;

    // Read all orders to combine items for the receipt and sale record
    for (const orderId of orderIds) {
      const orderRef = doc(db, 'tenants', tenantId, 'food_orders', orderId);
      const orderSnap = await transaction.get(orderRef);
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        if (orderData.items) {
          completedSaleItems = [...completedSaleItems, ...orderData.items];
        }
        // Mark order as paid
        transaction.update(orderRef, {
          status: 'paid',
          updatedAt: serverTimestamp()
        });
      }
    }

    // Ledger Writes
    if (runningTotal > 0) {
      const masterAccountRef = doc(db, 'tenants', tenantId, 'accounts', 'master-cash');
      const masterAccountSnap = await transaction.get(masterAccountRef);
      
      if (!masterAccountSnap.exists()) {
        transaction.set(masterAccountRef, {
          id: 'master-cash',
          tenantId,
          name: 'Main Cash Register',
          type: 'asset',
          balance: runningTotal,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.update(masterAccountRef, {
          balance: increment(runningTotal),
          updatedAt: serverTimestamp()
        });
      }

      const transactionsRef = collection(db, 'tenants', tenantId, 'transactions');
      const newTxRef = doc(transactionsRef);
      transaction.set(newTxRef, {
        id: newTxRef.id,
        tenantId,
        accountId: 'master-cash',
        amount: runningTotal,
        type: 'income',
        description: `Table Settle: ${tableData.name} (${paymentMethod})`,
        date: new Date(),
        createdAt: serverTimestamp()
      });

      const salesRef = collection(db, 'tenants', tenantId, 'sales');
      const newSaleRef = doc(salesRef);
      const saleRecord: Record<string, unknown> = {
        id: newSaleRef.id,
        tenantId,
        module: 'food',
        items: completedSaleItems,
        totalAmount: runningTotal,
        paymentMethod: paymentMethod,
        createdAt: serverTimestamp()
      };
      if (gcashRef) saleRecord.gcashRef = gcashRef;
      transaction.set(newSaleRef, saleRecord);
    }

    // Reset Table
    transaction.update(tableRef, {
      status: 'available',
      currentOrderIds: [],
      openedAt: null,
      guestCount: 0,
      runningTotal: 0,
      updatedAt: serverTimestamp()
    });
  });
  
  return { items: completedSaleItems, total: finalRunningTotal };
}

export async function resetTable(tenantId: string, tableId: string) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const tableRef = doc(db, 'tenants', tenantId, 'tables', tableId);
    const tableSnap = await transaction.get(tableRef);
    if (!tableSnap.exists()) throw new Error("Table not found");
    const tableData = tableSnap.data();

    // Void any pending/preparing/served orders
    const orderIds: string[] = tableData.currentOrderIds || [];
    for (const orderId of orderIds) {
      const orderRef = doc(db, 'tenants', tenantId, 'food_orders', orderId);
      transaction.update(orderRef, {
        status: 'voided',
        updatedAt: serverTimestamp()
      });
    }

    transaction.update(tableRef, {
      status: 'available',
      currentOrderIds: [],
      openedAt: null,
      guestCount: 0,
      runningTotal: 0,
      updatedAt: serverTimestamp()
    });
  });
  
  return true;
}

export async function renameTable(tenantId: string, tableId: string, newName: string) {
  const db = getKatuwangDb();
  const tableRef = doc(db, 'tenants', tenantId, 'tables', tableId);
  await updateDoc(tableRef, {
    name: newName.trim(),
    updatedAt: serverTimestamp()
  });
  return true;
}

export async function deleteTable(tenantId: string, tableId: string) {
  const db = getKatuwangDb();
  
  await runTransactionResilient(db, async (transaction) => {
    const tableRef = doc(db, 'tenants', tenantId, 'tables', tableId);
    const tableSnap = await transaction.get(tableRef);
    if (!tableSnap.exists()) throw new Error("Table not found");
    if (tableSnap.data().status !== 'available') {
      throw new Error("Cannot delete a table that is currently occupied");
    }
    transaction.delete(tableRef);
  });
  
  return true;
}
