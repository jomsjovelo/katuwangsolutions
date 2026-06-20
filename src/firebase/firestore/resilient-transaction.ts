import { 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  runTransaction,
  DocumentReference,
  UpdateData,
  WithFieldValue,
  DocumentData
} from 'firebase/firestore';

// Guard against concurrent offline checkouts causing race conditions
let isOfflineCheckoutInProgress = false;

/**
 * Mock transaction object that implements standard Firestore transaction methods
 * using resilient offline-first getDoc/setDoc/updateDoc APIs.
 * FIX S1-4: All writes are now collected into promises and awaited via flushAll()
 * to eliminate silent data loss from fire-and-forget patterns.
 */
class OfflineTransaction {
  private writePromises: Promise<void>[] = [];

  async get(ref: DocumentReference) {
    // Read directly from IndexedDB persistent cache
    return await getDoc(ref);
  }

  update(ref: DocumentReference, data: UpdateData<DocumentData>) {
    // Collect write promise — do NOT fire-and-forget
    this.writePromises.push(
      updateDoc(ref, data).catch((err: Error) => {
        // Re-throw so flushAll() propagates the error to the caller
        throw new Error(`Offline update failed for ${ref.path}: ${err.message}`);
      })
    );
    return this;
  }

  set(ref: DocumentReference, data: WithFieldValue<DocumentData>) {
    // Collect write promise — do NOT fire-and-forget
    this.writePromises.push(
      setDoc(ref, data).catch((err: Error) => {
        throw new Error(`Offline set failed for ${ref.path}: ${err.message}`);
      })
    );
    return this;
  }

  delete(ref: DocumentReference) {
    // Collect write promise — do NOT fire-and-forget
    this.writePromises.push(
      deleteDoc(ref).catch((err: Error) => {
        throw new Error(`Offline delete failed for ${ref.path}: ${err.message}`);
      })
    );
    return this;
  }

  /**
   * Await all queued write promises. Must be called after updateFunction completes.
   * Throws if any write failed, surfacing the error to the vendor instead of silently losing data.
   */
  async flushAll(): Promise<void> {
    await Promise.all(this.writePromises);
  }
}

/**
 * A highly resilient transaction wrapper for Katuwang Solutions.
 * If the user is online, it routes writes through standard ACID Firestore Transactions.
 * If the user is offline, it gracefully falls back to local cache updates so that 
 * open-air wet market (palengke) POS transactions never fail or lock.
 */
export async function runTransactionResilient(
  db: any, 
  updateFunction: (transaction: any) => Promise<any>
): Promise<any> {
  const isBrowserOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (isBrowserOffline) {
    // Prevent concurrent offline checkouts from racing each other
    if (isOfflineCheckoutInProgress) {
      throw new Error('Kasalukuyang may naka-queue na offline checkout. Mangyaring maghintay.');
    }

    isOfflineCheckoutInProgress = true;
    try {
      console.warn("Katuwang Resilient Engine: Offline state detected. running in local cache...");
      const mockTx = new OfflineTransaction();
      await updateFunction(mockTx);
      // CRITICAL: await all collected write promises before returning success
      await mockTx.flushAll();
    } finally {
      isOfflineCheckoutInProgress = false;
    }
    return;
  }

  try {
    return await runTransaction(db, updateFunction);
  } catch (e) {
      const error = e as Error & { code?: string };
    const offlineCodes = ['unavailable', 'failed-precondition', 'offline', 'network-error'];
    const isOfflineErr = offlineCodes.some(
      (code: string) => error.code === code || error.message?.toLowerCase().includes(code)
    );

    if (isOfflineErr) {
      console.warn("Katuwang Resilient Engine: Transaction online connection lost. Falling back to local cache...", error);
      const mockTx = new OfflineTransaction();
      await updateFunction(mockTx);
      // CRITICAL: await all collected write promises before returning success
      await mockTx.flushAll();
      return;
    }

    // Rethrow actual logical errors (e.g. Insufficient Stock) so validation fails properly
    throw error;
  }
}
