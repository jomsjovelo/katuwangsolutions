/**
 * Offline Budget Queue Utility for Budget Mo
 * Handles IndexedDB storage for offline transaction queueing and automatic sync replay.
 */

export interface QueuedTransaction {
  queueId: string;
  tenantId: string;
  type: 'income' | 'expense';
  amountCentavos: number;
  category: string;
  note: string;
  date?: string;
  createdAtTimestamp: number;
}

const DB_NAME = 'katuwang_budget_offline_db';
const STORE_NAME = 'budget_transaction_queue';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'queueId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Enqueues a transaction locally when offline.
 */
export async function enqueueOfflineTransaction(
  item: Omit<QueuedTransaction, 'queueId' | 'createdAtTimestamp'>
): Promise<string> {
  const db = await openDB();
  const queueId = `offline_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const record: QueuedTransaction = {
    ...item,
    queueId,
    createdAtTimestamp: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => resolve(queueId);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves all pending queued transactions for a specific tenant.
 */
export async function getQueuedTransactions(tenantId?: string): Promise<QueuedTransaction[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results: QueuedTransaction[] = request.result || [];
        if (tenantId) {
          resolve(results.filter((item) => item.tenantId === tenantId));
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('Failed to access offline queue IndexedDB:', e);
    return [];
  }
}

/**
 * Removes a transaction from the queue after it has been synced to Firestore.
 */
export async function removeQueuedTransaction(queueId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(queueId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clears all queued transactions for a tenant.
 */
export async function clearQueuedTransactions(tenantId?: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    if (!tenantId) {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } else {
      const request = store.getAll();
      request.onsuccess = () => {
        const items: QueuedTransaction[] = request.result || [];
        const tenantItems = items.filter((i) => i.tenantId === tenantId);
        tenantItems.forEach((i) => store.delete(i.queueId));
        resolve();
      };
      request.onerror = () => reject(request.error);
    }
  });
}
