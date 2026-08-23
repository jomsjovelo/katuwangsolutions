import {
  JournalEntry,
  JournalSaleEntry,
  JournalShiftCloseEntry,
  JournalItemLine,
  JournalEntryStatus,
  JournalMetaState,
  OfflineAuthGrant,
  CatalogSnapshot,
  ReceiptMappingRecord,
  OFFLINE_JOURNAL_DB_NAME,
  OFFLINE_JOURNAL_DB_VERSION
} from './offline-types';
import { TrustedDeviceLocalRecord } from './webauthn-types';

export interface AppendJournalParams {
  tenantId: string;
  staffAccountId: string;
  shiftId: string;
  grantId: string;
  snapshotId: string;
  idempotencyKey: string;
  clientTimestamp: string;
  items: JournalItemLine[];
  subtotalCentavos: number;
  totalCentavos: number;
  cashTenderedCentavos: number;
  changeCentavos: number;
}

export function generateRandomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const VALID_TRANSITIONS: Record<JournalEntryStatus, JournalEntryStatus[]> = {
  pending_sync: ['in_flight', 'accepted', 'accepted_variance', 'needs_review', 'rejected_tampered', 'retryable_error'],
  retryable_error: ['in_flight', 'accepted', 'accepted_variance', 'needs_review', 'rejected_tampered', 'retryable_error'],
  in_flight: ['accepted', 'accepted_variance', 'needs_review', 'rejected_tampered', 'retryable_error'],
  accepted: [],
  accepted_variance: [],
  needs_review: [],
  rejected_tampered: []
};

export class JournalDB {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private isSupported: boolean;

  constructor() {
    this.isSupported = typeof window !== 'undefined' && 'indexedDB' in window;
  }

  async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    if (!this.isSupported) {
      throw new Error('indexeddb_unsupported');
    }

    this.dbPromise = new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(OFFLINE_JOURNAL_DB_NAME, OFFLINE_JOURNAL_DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          if (!db.objectStoreNames.contains('journal_entries')) {
            const journalStore = db.createObjectStore('journal_entries', { keyPath: 'entryId' });
            journalStore.createIndex('by_scoped_shift', ['tenantId', 'staffAccountId', 'shiftId'], { unique: false });
            journalStore.createIndex('by_scoped_seq', ['tenantId', 'staffAccountId', 'shiftId', 'seqIndex'], { unique: true });
            journalStore.createIndex('by_status', 'status', { unique: false });
            journalStore.createIndex('by_created', 'createdAtTimestamp', { unique: false });
          }

          if (!db.objectStoreNames.contains('grants')) {
            const grantStore = db.createObjectStore('grants', { keyPath: 'payload.grantId' });
            grantStore.createIndex('by_scoped_shift', ['payload.tenantId', 'payload.staffAccountId', 'payload.shiftId'], { unique: false });
          }

          if (!db.objectStoreNames.contains('catalog_cache')) {
            db.createObjectStore('catalog_cache', { keyPath: 'snapshotKey' });
          }

          if (!db.objectStoreNames.contains('meta_state')) {
            db.createObjectStore('meta_state', { keyPath: 'key' });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('indexeddb_open_failed'));
      } catch (e) {
        reject(e);
      }
    });

    return this.dbPromise;
  }

  /**
   * Executes an action under Web Locks API coordination (or direct fallback).
   */
  async withLock<T>(lockName: string, action: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.request) {
      return await navigator.locks.request(lockName, async () => {
        return await action();
      });
    }

    return await action();
  }

  /**
   * Saves or updates an OfflineAuthGrant scoped by tenant and shift.
   */
  async saveGrant(grant: OfflineAuthGrant): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['grants'], 'readwrite');
      const store = tx.objectStore('grants');
      store.put(grant);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('grant_save_failed'));
    });
  }

  /**
   * Gets the active grant strictly scoped by tenantId, staffAccountId, and shiftId.
   */
  async getScopedGrant(tenantId: string, staffAccountId: string, shiftId: string): Promise<OfflineAuthGrant | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['grants'], 'readonly');
      const store = tx.objectStore('grants');
      const index = store.index('by_scoped_shift');
      const req = index.getAll([tenantId, staffAccountId, shiftId]);
      req.onsuccess = () => {
        const results: OfflineAuthGrant[] = req.result || [];
        resolve(results.length > 0 ? results[results.length - 1] : null);
      };
      req.onerror = () => reject(req.error || new Error('grant_read_failed'));
    });
  }

  /**
   * Caches a catalog snapshot locally keyed by `${tenantId}:${snapshotId}`.
   */
  async saveCatalogSnapshot(snapshot: CatalogSnapshot): Promise<void> {
    const db = await this.getDB();
    const snapshotKey = `${snapshot.tenantId}:${snapshot.snapshotId}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['catalog_cache'], 'readwrite');
      const store = tx.objectStore('catalog_cache');
      store.put({ ...snapshot, snapshotKey });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('catalog_snapshot_save_failed'));
    });
  }

  /**
   * Gets the cached catalog snapshot by tenantId and snapshotId.
   */
  async getCatalogSnapshot(tenantId: string, snapshotId: string): Promise<CatalogSnapshot | null> {
    const db = await this.getDB();
    const snapshotKey = `${tenantId}:${snapshotId}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['catalog_cache'], 'readonly');
      const store = tx.objectStore('catalog_cache');
      const req = store.get(snapshotKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('catalog_snapshot_read_failed'));
    });
  }

  /**
   * Appends an untrusted offline transaction claim to the append-only journal atomically.
   * Fully scoped by tenantId + staffAccountId + shiftId.
   */
  async appendJournalEntry(params: AppendJournalParams): Promise<JournalSaleEntry> {
    if (!params.tenantId || !params.staffAccountId || !params.shiftId || !params.grantId || !params.snapshotId) {
      throw new Error('missing_required_journal_parameters');
    }

    if (!Array.isArray(params.items) || params.items.length === 0) {
      throw new Error('invalid_items_array');
    }

    if (!Number.isSafeInteger(params.totalCentavos) || params.totalCentavos < 0 ||
        !Number.isSafeInteger(params.cashTenderedCentavos) || params.cashTenderedCentavos < params.totalCentavos) {
      throw new Error('invalid_centavos_amount_or_insufficient_tender');
    }

    const seenProducts = new Set<string>();
    for (const item of params.items) {
      if (!item.productId || typeof item.productId !== 'string' || seenProducts.has(item.productId)) {
        throw new Error(`duplicate_or_invalid_product_line: ${item.productId}`);
      }
      seenProducts.add(item.productId);

      if (!Number.isInteger(item.quantity) || item.quantity <= 0 ||
          !Number.isSafeInteger(item.unitPriceCentavos) || item.unitPriceCentavos < 0) {
        throw new Error(`invalid_quantity_or_price for product: ${item.productId}`);
      }
    }

    const lockName = `katuwang_journal_${params.tenantId}_${params.staffAccountId}_${params.shiftId}`;

    return await this.withLock(lockName, async () => {
      const db = await this.getDB();

      return new Promise<JournalSaleEntry>((resolve, reject) => {
        const tx = db.transaction(['journal_entries', 'meta_state'], 'readwrite');
        const journalStore = tx.objectStore('journal_entries');
        const metaStore = tx.objectStore('meta_state');

        const seqKey = `seq_${params.tenantId}_${params.staffAccountId}_${params.shiftId}`;
        const seqReq = metaStore.get(seqKey);

        let createdEntry: JournalSaleEntry | null = null;

        seqReq.onsuccess = () => {
          const currentMeta = seqReq.result as JournalMetaState | undefined;
          const seqIndex = ((currentMeta?.value as number) || 0) + 1;

          const entryId = generateRandomUuid();
          const shiftSuffix = params.shiftId.slice(-4).toUpperCase();
          const provisionalReceiptNumber = `PROV-${shiftSuffix}-${seqIndex}`;

          createdEntry = {
            entryId,
            seqIndex,
            idempotencyKey: params.idempotencyKey || generateRandomUuid(),
            grantId: params.grantId,
            snapshotId: params.snapshotId,
            tenantId: params.tenantId,
            staffAccountId: params.staffAccountId,
            shiftId: params.shiftId,
            clientTimestamp: params.clientTimestamp,
            items: params.items,
            subtotalCentavos: params.subtotalCentavos,
            totalCentavos: params.totalCentavos,
            paymentMethod: 'cash',
            cashTenderedCentavos: params.cashTenderedCentavos,
            changeCentavos: params.changeCentavos,
            provisionalReceiptNumber,
            status: 'pending_sync',
            retryCount: 0,
            createdAtTimestamp: Date.now()
          };

          journalStore.put(createdEntry);
          metaStore.put({
            key: seqKey,
            value: seqIndex,
            updatedAt: Date.now()
          });
        };

        tx.oncomplete = () => {
          if (createdEntry) {
            resolve(createdEntry);
          } else {
            reject(new Error('journal_entry_creation_failed'));
          }
        };

        tx.onerror = () => reject(tx.error || new Error('journal_transaction_failed'));
      });
    });
  }

  /**
   * Retrieves all pending entries in strict FIFO sequence.
   * Can be scoped by tenantId + staffAccountId + shiftId, or unscoped across all shifts.
   */
  async getPendingEntries(
    tenantIdOrLimit?: string | number,
    staffAccountId?: string,
    shiftId?: string,
    limit?: number
  ): Promise<JournalEntry[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['journal_entries'], 'readonly');
      const store = tx.objectStore('journal_entries');

      if (typeof tenantIdOrLimit === 'string' && staffAccountId && shiftId) {
        const index = store.index('by_scoped_shift');
        const req = index.getAll([tenantIdOrLimit, staffAccountId, shiftId]);

        req.onsuccess = () => {
          const allEntries: JournalEntry[] = req.result || [];
          const pending = allEntries
            .filter((e) => e.status === 'pending_sync' || e.status === 'retryable_error')
            .sort((a, b) => a.seqIndex - b.seqIndex);
          resolve(limit ? pending.slice(0, limit) : pending);
        };
        req.onerror = () => reject(req.error || new Error('journal_read_failed'));
      } else {
        const req = store.getAll();
        const maxLimit = typeof tenantIdOrLimit === 'number' ? tenantIdOrLimit : limit;

        req.onsuccess = () => {
          const allEntries: JournalEntry[] = req.result || [];
          const pending = allEntries
            .filter((e) => e.status === 'pending_sync' || e.status === 'retryable_error')
            .sort((a, b) => (a.createdAtTimestamp || 0) - (b.createdAtTimestamp || 0) || a.seqIndex - b.seqIndex);
          resolve(maxLimit ? pending.slice(0, maxLimit) : pending);
        };
        req.onerror = () => reject(req.error || new Error('journal_read_failed'));
      }
    });
  }

  /**
   * Recovers any stale in_flight entries left behind by an unexpected crash or reload.
   * Durably transitions them to retryable_error so they are safely picked up for retry.
   */
  async recoverStaleInFlightEntries(): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['journal_entries'], 'readwrite');
      const store = tx.objectStore('journal_entries');
      const req = store.getAll();

      req.onsuccess = () => {
        const allEntries: JournalEntry[] = req.result || [];
        const inFlight = allEntries.filter((e) => e.status === 'in_flight');
        for (const entry of inFlight) {
          entry.status = 'retryable_error';
          entry.lastError = 'Recovered stale in-flight entry on startup/crash';
          entry.retryCount = (entry.retryCount || 0) + 1;
          store.put(entry);
        }
        resolve(inFlight.length);
      };
      req.onerror = () => reject(req.error || new Error('journal_recover_in_flight_failed'));
    });
  }

  /**
   * Updates the durable outcome of a journal entry with enforced state transitions.
   * Never deletes records. Quarantines poison/tampered records with details.
   */
  async updateEntryStatus(
    entryId: string,
    newStatus: JournalEntryStatus,
    extra: { serverSaleId?: string; authoritativeReceiptNumber?: string; lastError?: string; retryCount?: number } = {}
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['journal_entries'], 'readwrite');
      const store = tx.objectStore('journal_entries');
      const getReq = store.get(entryId);

      getReq.onsuccess = () => {
        const entry: JournalEntry | undefined = getReq.result;
        if (!entry) {
          reject(new Error(`journal_entry_not_found: ${entryId}`));
          return;
        }

        const allowedNext = VALID_TRANSITIONS[entry.status] || [];
        if (!allowedNext.includes(newStatus)) {
          reject(new Error(`invalid_status_transition: from ${entry.status} to ${newStatus}`));
          return;
        }

        const updated: JournalEntry = {
          ...entry,
          status: newStatus,
          ...(extra.serverSaleId !== undefined ? { serverSaleId: extra.serverSaleId } : {}),
          ...(extra.authoritativeReceiptNumber !== undefined ? { authoritativeReceiptNumber: extra.authoritativeReceiptNumber } : {}),
          ...(extra.lastError !== undefined ? { lastError: extra.lastError } : {}),
          ...(extra.retryCount !== undefined ? { retryCount: extra.retryCount } : {}),
          ...(newStatus === 'accepted' || newStatus === 'accepted_variance' ? { syncedAtTimestamp: Date.now() } : {})
        };

        store.put(updated);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('journal_status_update_failed'));
    });
  }

  /**
   * Computes shift summary totals from local journal records scoped by tenantId + staffAccountId + shiftId.
   */
  async getShiftJournalSummary(tenantId: string, staffAccountId: string, shiftId: string): Promise<{
    confirmedSalesCount: number;
    confirmedCashCentavos: number;
    pendingSalesCount: number;
    pendingCashCentavos: number;
    reviewRequiredCount: number;
    reviewRequiredCentavos: number;
  }> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['journal_entries'], 'readonly');
      const store = tx.objectStore('journal_entries');
      const index = store.index('by_scoped_shift');
      const req = index.getAll([tenantId, staffAccountId, shiftId]);

      req.onsuccess = () => {
        const entries: JournalEntry[] = req.result || [];

        let confirmedSalesCount = 0;
        let confirmedCashCentavos = 0;
        let pendingSalesCount = 0;
        let pendingCashCentavos = 0;
        let reviewRequiredCount = 0;
        let reviewRequiredCentavos = 0;

        for (const e of entries) {
          if (e.kind === 'shift_close') continue;
          const sale = e as JournalSaleEntry;
          if (sale.status === 'accepted' || sale.status === 'accepted_variance') {
            confirmedSalesCount++;
            confirmedCashCentavos += sale.totalCentavos;
          } else if (sale.status === 'pending_sync' || sale.status === 'in_flight' || sale.status === 'retryable_error') {
            pendingSalesCount++;
            pendingCashCentavos += sale.totalCentavos;
          } else if (sale.status === 'needs_review') {
            reviewRequiredCount++;
            reviewRequiredCentavos += sale.totalCentavos;
          }
        }

        resolve({
          confirmedSalesCount,
          confirmedCashCentavos,
          pendingSalesCount,
          pendingCashCentavos,
          reviewRequiredCount,
          reviewRequiredCentavos
        });
      };

      req.onerror = () => reject(req.error || new Error('journal_summary_read_failed'));
    });
  }

  /**
   * Retrieves or creates a durable installation ID in IndexedDB meta_state.
   * Mirrors to localStorage, ensuring that clearing localStorage alone does not create an installation ID mismatch.
   */
  async getOrCreateInstallationId(): Promise<string> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['meta_state'], 'readwrite');
      const store = tx.objectStore('meta_state');
      const getReq = store.get('pos_installation_id');

      getReq.onsuccess = () => {
        let installationId = getReq.result?.value;
        if (!installationId && typeof localStorage !== 'undefined') {
          installationId = localStorage.getItem('katuwang_installation_id');
        }

        if (!installationId || typeof installationId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(installationId)) {
          installationId = `inst_${generateRandomUuid().replace(/-/g, '').slice(0, 24)}`;
        }

        store.put({ key: 'pos_installation_id', value: installationId, updatedAt: Date.now() });

        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('katuwang_installation_id', installationId);
          } catch {
            // best-effort mirror
          }
        }

        resolve(installationId);
      };

      tx.onerror = () => {
        // Fallback to localStorage or random if IndexedDB transaction fails
        let fallback = typeof localStorage !== 'undefined' ? localStorage.getItem('katuwang_installation_id') : null;
        if (!fallback) fallback = `inst_${generateRandomUuid().replace(/-/g, '').slice(0, 24)}`;
        resolve(fallback);
      };
    });
  }

  /**
   * Caches the signed offline grant, client catalog snapshot, exact bootstrap metadata, and stock baseline into IndexedDB.
   */
  async saveAuthorityContext(
    grant: OfflineAuthGrant,
    snapshot: { snapshotId: string; catalogDigest: string; productCount: number; products: Record<string, any> },
    bootstrapMeta?: {
      tenantDisplayName?: string;
      cashierDisplayName?: string;
      currentShift?: any;
    },
    stockBaseline?: Record<string, number>,
    stockCapturedAtIso?: string
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['grants', 'catalog_cache', 'meta_state'], 'readwrite');
      const grantStore = tx.objectStore('grants');
      const catalogStore = tx.objectStore('catalog_cache');
      const metaStore = tx.objectStore('meta_state');

      grantStore.put(grant);
      catalogStore.put({
        snapshotKey: `${grant.payload.tenantId}:${snapshot.snapshotId}`,
        tenantId: grant.payload.tenantId,
        snapshotId: snapshot.snapshotId,
        catalogDigest: snapshot.catalogDigest,
        productCount: snapshot.productCount,
        products: snapshot.products,
        cachedAt: Date.now()
      });

      if (bootstrapMeta) {
        metaStore.put({
          key: `meta_bootstrap_${grant.payload.tenantId}_${grant.payload.staffAccountId}_${grant.payload.shiftId}`,
          value: bootstrapMeta,
          updatedAt: Date.now()
        });
      }

      if (stockBaseline) {
        metaStore.put({
          key: `stock_baseline_${grant.payload.tenantId}_${grant.payload.staffAccountId}_${grant.payload.shiftId}`,
          value: {
            stockBaseline,
            stockCapturedAtIso: stockCapturedAtIso || new Date().toISOString()
          },
          updatedAt: Date.now()
        });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('save_authority_context_failed'));
    });
  }

  /**
   * Retrieves active offline grant, cached public catalog snapshot, exact bootstrap metadata, and stock baseline.
   */
  async getAuthorityContext(tenantId: string, staffAccountId: string, shiftId: string): Promise<{
    grant: OfflineAuthGrant | null;
    snapshot: any | null;
    bootstrapMeta: { tenantDisplayName?: string; cashierDisplayName?: string; currentShift?: any } | null;
    stockBaseline: Record<string, number> | null;
    stockCapturedAtIso: string | null;
  }> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['grants', 'catalog_cache', 'meta_state'], 'readonly');
      const grantStore = tx.objectStore('grants');
      const metaStore = tx.objectStore('meta_state');
      const index = grantStore.index('by_scoped_shift');
      const req = index.getAll([tenantId, staffAccountId, shiftId]);

      req.onsuccess = () => {
        const grants: OfflineAuthGrant[] = req.result || [];
        const activeGrant = grants.find((g) => g.payload && g.payload.shiftId === shiftId) || null;

        if (!activeGrant) {
          resolve({ grant: null, snapshot: null, bootstrapMeta: null, stockBaseline: null, stockCapturedAtIso: null });
          return;
        }

        const catalogStore = tx.objectStore('catalog_cache');
        const snapReq = catalogStore.get(`${tenantId}:${activeGrant.payload.snapshotId}`);
        const metaReq = metaStore.get(`meta_bootstrap_${tenantId}_${staffAccountId}_${shiftId}`);
        const stockReq = metaStore.get(`stock_baseline_${tenantId}_${staffAccountId}_${shiftId}`);

        let snapshotResult: any = null;
        let metaResult: any = null;
        let stockResult: any = null;
        let pending = 3;

        const checkDone = () => {
          pending--;
          if (pending === 0) {
            resolve({
              grant: activeGrant,
              snapshot: snapshotResult,
              bootstrapMeta: metaResult?.value || null,
              stockBaseline: stockResult?.value?.stockBaseline || null,
              stockCapturedAtIso: stockResult?.value?.stockCapturedAtIso || null
            });
          }
        };

        snapReq.onsuccess = () => {
          snapshotResult = snapReq.result || null;
          checkDone();
        };
        snapReq.onerror = () => checkDone();

        metaReq.onsuccess = () => {
          metaResult = metaReq.result || null;
          checkDone();
        };
        metaReq.onerror = () => checkDone();

        stockReq.onsuccess = () => {
          stockResult = stockReq.result || null;
          checkDone();
        };
        stockReq.onerror = () => checkDone();
      };

      req.onerror = () => reject(req.error || new Error('get_authority_context_failed'));
    });
  }

  /**
   * Durably records an idempotent provisional shift-close entry in IndexedDB and freezes further checkout.
   */
  async appendShiftCloseEntry(params: {
    tenantId: string;
    staffAccountId: string;
    shiftId: string;
    grantId: string;
    snapshotId: string;
    endingCashCentavos: number;
    notes?: string;
  }): Promise<JournalShiftCloseEntry> {
    const lockName = `katuwang_journal_${params.tenantId}_${params.staffAccountId}_${params.shiftId}`;

    return await this.withLock(lockName, async () => {
      const db = await this.getDB();

      return new Promise<JournalShiftCloseEntry>((resolve, reject) => {
        const tx = db.transaction(['journal_entries', 'meta_state'], 'readwrite');
        const journalStore = tx.objectStore('journal_entries');
        const metaStore = tx.objectStore('meta_state');

        const closeMetaKey = `shift_closed_${params.tenantId}_${params.staffAccountId}_${params.shiftId}`;
        const closeMetaReq = metaStore.get(closeMetaKey);

        closeMetaReq.onsuccess = () => {
          const existingCloseMeta = closeMetaReq.result as JournalMetaState | undefined;
          if (existingCloseMeta && typeof (existingCloseMeta.value as any)?.entryId === 'string') {
            // Idempotent: return existing shift close record
            const existingEntryReq = journalStore.get((existingCloseMeta.value as any).entryId);
            existingEntryReq.onsuccess = () => {
              if (existingEntryReq.result) {
                resolve(existingEntryReq.result as JournalShiftCloseEntry);
              } else {
                proceedWithNewClose();
              }
            };
            existingEntryReq.onerror = () => proceedWithNewClose();
            return;
          }

          proceedWithNewClose();
        };

        const proceedWithNewClose = () => {
          const seqKey = `seq_${params.tenantId}_${params.staffAccountId}_${params.shiftId}`;
          const seqReq = metaStore.get(seqKey);

          let createdEntry: JournalShiftCloseEntry | null = null;

          seqReq.onsuccess = () => {
            const currentMeta = seqReq.result as JournalMetaState | undefined;
            const seqIndex = ((currentMeta?.value as number) || 0) + 1;
            const entryId = generateRandomUuid();

            const closeIdempotencyKey = generateRandomUuid();
            createdEntry = {
              entryId,
              kind: 'shift_close',
              seqIndex,
              idempotencyKey: closeIdempotencyKey,
              closeIdempotencyKey,
              grantId: params.grantId,
              snapshotId: params.snapshotId,
              tenantId: params.tenantId,
              staffAccountId: params.staffAccountId,
              shiftId: params.shiftId,
              clientTimestamp: new Date().toISOString(),
              endingCashCentavos: params.endingCashCentavos,
              notes: params.notes,
              status: 'pending_sync',
              retryCount: 0,
              createdAtTimestamp: Date.now()
            };

            journalStore.put(createdEntry);
            metaStore.put({
              key: seqKey,
              value: seqIndex,
              updatedAt: Date.now()
            });
            metaStore.put({
              key: closeMetaKey,
              value: { entryId, closedAt: Date.now(), endingCashCentavos: params.endingCashCentavos, notes: params.notes },
              updatedAt: Date.now()
            });
          };

          tx.oncomplete = () => {
            if (createdEntry) resolve(createdEntry);
            else reject(new Error('shift_close_entry_creation_failed'));
          };
          tx.onerror = () => reject(tx.error || new Error('shift_close_transaction_failed'));
        };

        closeMetaReq.onerror = () => proceedWithNewClose();
      });
    });
  }

  /**
   * Checks whether the given shift has been frozen / provisionally closed locally.
   */
  async isShiftProvisionallyClosed(tenantId: string, staffAccountId: string, shiftId: string): Promise<boolean> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(['meta_state'], 'readonly');
      const metaStore = tx.objectStore('meta_state');
      const req = metaStore.get(`shift_closed_${tenantId}_${staffAccountId}_${shiftId}`);
      req.onsuccess = () => resolve(!!req.result?.value);
      req.onerror = () => resolve(false);
    });
  }

  /**
   * Retrieves the most recently issued offline authorization grant from IndexedDB.
   */
  async getLatestGrant(): Promise<OfflineAuthGrant | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['grants'], 'readonly');
      const store = tx.objectStore('grants');
      const req = store.getAll();

      req.onsuccess = () => {
        const grants: OfflineAuthGrant[] = req.result || [];
        if (grants.length === 0) {
          resolve(null);
          return;
        }
        grants.sort((a, b) => (b.payload?.issuedAt || 0) - (a.payload?.issuedAt || 0));
        resolve(grants[0]);
      };

      req.onerror = () => reject(req.error || new Error('get_latest_grant_failed'));
    });
  }

  /**
   * Computes pure projected stock deductions for all pending offline claims in a shift.
   * Never mutates the underlying catalog snapshot.
   */
  async getPendingDeductionsMap(tenantId: string, staffAccountId: string, shiftId: string): Promise<Record<string, number>> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['journal_entries'], 'readonly');
      const store = tx.objectStore('journal_entries');
      const index = store.index('by_scoped_shift');
      const req = index.getAll([tenantId, staffAccountId, shiftId]);

      req.onsuccess = () => {
        const entries: JournalEntry[] = req.result || [];
        const deductions: Record<string, number> = {};

        for (const e of entries) {
          if (e.kind === 'shift_close') continue;
          const sale = e as JournalSaleEntry;
          if (sale.status === 'pending_sync' || sale.status === 'in_flight' || sale.status === 'retryable_error') {
            for (const item of sale.items || []) {
              deductions[item.productId] = (deductions[item.productId] || 0) + item.quantity;
            }
          }
        }

        resolve(deductions);
      };

      req.onerror = () => reject(req.error || new Error('get_pending_deductions_failed'));
    });
  }

  /**
   * Sets generic metadata in meta_state.
   */
  async setMetaState<T>(key: string, value: T): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['meta_state'], 'readwrite');
      const store = tx.objectStore('meta_state');
      store.put({ key, value, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('set_meta_state_failed'));
    });
  }

  /**
   * Retrieves generic metadata from meta_state.
   */
  async getMetaState<T>(key: string): Promise<{ key: string; value: T; updatedAt: number } | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['meta_state'], 'readonly');
      const store = tx.objectStore('meta_state');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('get_meta_state_failed'));
    });
  }

  /**
   * Gets all journal entries for a scoped shift sorted by seqIndex.
   */
  async getJournalEntriesForShift(tenantId: string, staffAccountId: string, shiftId: string): Promise<JournalEntry[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['journal_entries'], 'readonly');
      const store = tx.objectStore('journal_entries');
      const index = store.index('by_scoped_shift');
      const req = index.getAll([tenantId, staffAccountId, shiftId]);
      req.onsuccess = () => {
        const entries: JournalEntry[] = req.result || [];
        entries.sort((a, b) => a.seqIndex - b.seqIndex);
        resolve(entries);
      };
      req.onerror = () => reject(req.error || new Error('get_journal_entries_failed'));
    });
  }

  /**
   * Durably saves trusted device record in meta_state.
   */
  async saveTrustedDevice(record: TrustedDeviceLocalRecord): Promise<void> {
    const key = `trusted_device_${record.tenantId}_${record.staffAccountId}_${record.installationId}`;
    await this.setMetaState(key, record);
  }

  /**
   * Retrieves trusted device record from meta_state.
   */
  async getTrustedDevice(tenantId: string, staffAccountId: string, installationId: string): Promise<TrustedDeviceLocalRecord | null> {
    const key = `trusted_device_${tenantId}_${staffAccountId}_${installationId}`;
    const meta = await this.getMetaState<TrustedDeviceLocalRecord>(key);
    return meta ? meta.value : null;
  }

  /**
   * Atomically updates signature counter of the trusted device.
   */
  async updateTrustedDeviceCounter(tenantId: string, staffAccountId: string, installationId: string, newCounter: number): Promise<void> {
    const key = `trusted_device_${tenantId}_${staffAccountId}_${installationId}`;
    const current = await this.getTrustedDevice(tenantId, staffAccountId, installationId);
    if (current) {
      current.counter = newCounter;
      await this.setMetaState(key, current);
    }
  }

  /**
   * Durably persists mapping from provisional receipt number to authoritative server receipt.
   */
  async saveReceiptMapping(mapping: ReceiptMappingRecord): Promise<void> {
    const key = `receipt_map_${mapping.provisionalReceiptNumber}`;
    await this.setMetaState(key, mapping);
  }

  /**
   * Retrieves authoritative receipt mapping by provisional receipt number.
   */
  async getReceiptMapping(provisionalReceiptNumber: string): Promise<ReceiptMappingRecord | null> {
    const key = `receipt_map_${provisionalReceiptNumber}`;
    const meta = await this.getMetaState<ReceiptMappingRecord>(key);
    return meta ? meta.value : null;
  }

  /**
   * Asserts that all sales in the shift prior to close sequence have reached terminal accepted status.
   * Throws if any earlier entry is pending, in-flight, retryable, needs-review, or tampered.
   */
  async assertAllPriorSalesTerminal(tenantId: string, staffAccountId: string, shiftId: string, closeSeqIndex: number): Promise<void> {
    const entries = await this.getJournalEntriesForShift(tenantId, staffAccountId, shiftId);
    for (const e of entries) {
      if (e.seqIndex < closeSeqIndex && e.kind !== 'shift_close') {
        const sale = e as JournalSaleEntry;
        if (sale.status !== 'accepted' && sale.status !== 'accepted_variance') {
          throw new Error(`shift_close_blocked_by_unresolved_claim: entry ${sale.entryId} is in status '${sale.status}'`);
        }
      }
    }
  }
}

let globalJournalDB: JournalDB | null = null;

export function getJournalDB(): JournalDB {
  if (!globalJournalDB) {
    globalJournalDB = new JournalDB();
  }
  return globalJournalDB;
}
