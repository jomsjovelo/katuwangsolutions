// Order Snap Outbox DB Implementation

/**
 * Order Snap Versioned IndexedDB Outbox Manager
 *
 * Implements durable, tenant-partitioned storage:
 * - Stable DB name: `katuwang_ordersnap_outbox`
 * - Migration-safe IndexedDB versioning
 * - Compound tenant-safe keys and indexes
 * - Validated reads on every entry (fail-closed corruption protection)
 * - Atomic enqueue with monotonic sequence generation
 * - Same-device projected ingredient reservation tracking
 * - Crash-safe lease locking for cross-tab coordination
 */

/**
 * Narrow type containing ONLY the mutable lifecycle fields of an outbox entry.
 * All protected fields (request, grant, tenantId, staffAccountId, actorId, actorRole,
 * deviceId, orderId, idempotencyKey, localSequence, paymentMethod, cashTenderedCentavos,
 * clientCreatedAt, provisionalReceiptNumber, and idempotency data) are intentionally absent.
 * This is the ONLY type accepted by updateOrderSyncState.
 */
export interface OutboxLifecycleUpdate {
  readonly attemptCount?: number;
  readonly lastAttemptAt?: string;
}

import {
  ORDER_SNAP_OUTBOX_DB_NAME,
  ORDER_SNAP_OUTBOX_DB_VERSION,
  OrderSnapOutboxEntry,
  OrderSnapOutboxEntrySchema,
  ProjectedIngredientReservation,
  ProjectedIngredientReservationSchema,
  OfflineCatalogSnapshot,
  OfflineCatalogSnapshotSchema,
  OrderSnapPersistedAuthority,
  OrderSnapPersistedAuthoritySchema,
  OrderOutboxSyncState,
  isValidStateTransition,
  SyncLeaseRecord,
  ConflictDiagnosticRecord
} from './offline-types';
import { SecureCryptoProvider, secureRandomHex, generateSecureId } from './secure-id-utils';

export class OrderSnapOutboxDB {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private customIndexedDB?: IDBFactory;
  private readonly cryptoProvider?: SecureCryptoProvider;

  constructor(customIndexedDB?: IDBFactory, cryptoProvider?: SecureCryptoProvider) {
    this.customIndexedDB = customIndexedDB;
    this.cryptoProvider = cryptoProvider;
  }

  private getFactory(): IDBFactory {
    if (this.customIndexedDB) return this.customIndexedDB;
    if (typeof window !== 'undefined' && window.indexedDB) return window.indexedDB;
    if (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB) {
      return (globalThis as any).indexedDB;
    }
    throw new Error('IndexedDB is not available in the current environment.');
  }

  public async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const factory = this.getFactory();
      const request = factory.open(ORDER_SNAP_OUTBOX_DB_NAME, ORDER_SNAP_OUTBOX_DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = request.result;
        const oldVersion = event.oldVersion;

        // Version 1 Schema Migration
        if (oldVersion < 1) {
          // 1. Order Outbox Store
          if (!db.objectStoreNames.contains('order_outbox')) {
            const outboxStore = db.createObjectStore('order_outbox', {
              keyPath: ['tenantId', 'orderId']
            });
            outboxStore.createIndex('by_tenant_idemp', ['tenantId', 'idempotencyKey'], { unique: true });
            outboxStore.createIndex('by_tenant_device_seq', ['tenantId', 'deviceId', 'localSequence'], { unique: true });
            outboxStore.createIndex('by_tenant_actor_state', ['tenantId', 'actorId', 'syncState'], { unique: false });
            outboxStore.createIndex('by_tenant_state_seq', ['tenantId', 'syncState', 'localSequence'], { unique: false });
          }

          // 2. Projected Ingredient Reservations Store
          if (!db.objectStoreNames.contains('projected_reservations')) {
            const resStore = db.createObjectStore('projected_reservations', {
              keyPath: 'reservationId'
            });
            resStore.createIndex('by_tenant_ingredient', ['tenantId', 'ingredientId'], { unique: false });
            resStore.createIndex('by_tenant_order', ['tenantId', 'orderId'], { unique: false });
          }

          // 3. Offline Catalog Store
          if (!db.objectStoreNames.contains('offline_catalog')) {
            db.createObjectStore('offline_catalog', { keyPath: 'tenantId' });
          }

          // 4. Sync Leases Store
          if (!db.objectStoreNames.contains('sync_leases')) {
            db.createObjectStore('sync_leases', { keyPath: 'tenantId' });
          }

          // 5. Meta State Store
          if (!db.objectStoreNames.contains('meta_state')) {
            db.createObjectStore('meta_state', { keyPath: 'key' });
          }
        }

        // Version 2 Schema Migration — Dedicated Offline Authority Grants Store
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('authority_grants')) {
            const authStore = db.createObjectStore('authority_grants', {
              keyPath: ['tenantId', 'staffAccountId', 'deviceId']
            });
            authStore.createIndex('by_tenant', 'tenantId', { unique: false });
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open Order Snap IndexedDB outbox.'));
      request.onblocked = () => reject(new Error('Order Snap IndexedDB outbox open request blocked.'));
    });

    return this.dbPromise;
  }

  // ---------------------------------------------------------------------------
  // DEVICE & SEQUENCE GENERATION
  // ---------------------------------------------------------------------------

  public async getOrCreateDeviceId(): Promise<string> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['meta_state'], 'readwrite');
      const store = tx.objectStore('meta_state');
      const req = store.get('device_id');

req.onsuccess = () => {
         if (req.result && typeof req.result.value === 'string' && req.result.value.length > 0) {
           resolve(req.result.value);
           return;
         }

        try {
          const secureHex = secureRandomHex(16, this.cryptoProvider);
          const newId = `dev_${secureHex}`;
          store.put({ key: 'device_id', value: newId, updatedAt: Date.now() });
          tx.oncomplete = () => resolve(newId);
        } catch (err) {
          reject(new Error('Secure device ID generation failed'));
        }
       };

      req.onerror = () => reject(req.error || new Error('Failed to read deviceId'));
      tx.onerror = () => reject(tx.error || new Error('Transaction failed for deviceId'));
    });
  }

  public async getNextLocalSequence(tenantId: string, deviceId: string): Promise<number> {
    const db = await this.getDB();
    const seqKey = `seq_${tenantId}_${deviceId}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['meta_state'], 'readwrite');
      const store = tx.objectStore('meta_state');
      const req = store.get(seqKey);

      req.onsuccess = () => {
        let currentSeq = 0;
        if (req.result && Number.isSafeInteger(req.result.value)) {
          currentSeq = req.result.value;
        }
        const nextSeq = currentSeq + 1;
        store.put({ key: seqKey, value: nextSeq, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(nextSeq);
      };

      req.onerror = () => reject(req.error || new Error(`Failed to read sequence for ${seqKey}`));
      tx.onerror = () => reject(tx.error || new Error(`Sequence transaction failed for ${seqKey}`));
    });
  }

  // ---------------------------------------------------------------------------
  // OFFLINE CATALOG MANAGEMENT
  // ---------------------------------------------------------------------------

  public async saveCatalogSnapshot(snapshot: OfflineCatalogSnapshot): Promise<void> {
    const validated = OfflineCatalogSnapshotSchema.parse(snapshot);
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['offline_catalog'], 'readwrite');
      const store = tx.objectStore('offline_catalog');
      store.put(validated);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to save offline catalog snapshot'));
    });
  }

  public async getCatalogSnapshot(tenantId: string): Promise<OfflineCatalogSnapshot | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['offline_catalog'], 'readonly');
      const store = tx.objectStore('offline_catalog');
      const req = store.get(tenantId);

      req.onsuccess = () => {
        if (!req.result) {
          resolve(null);
          return;
        }
        try {
          const validated = OfflineCatalogSnapshotSchema.parse(req.result);
          resolve(validated as OfflineCatalogSnapshot);
        } catch (err) {
          console.error('[OUTBOX_DB] Corrupted offline catalog snapshot detected.');
          resolve(null); // Fail-closed on corrupted catalog
        }
      };

      req.onerror = () => reject(req.error || new Error('Failed to read offline catalog snapshot'));
    });
  }

  // ---------------------------------------------------------------------------
  // OUTBOX ENQUEUE & CRUD
  // ---------------------------------------------------------------------------

  public async enqueueOrder(
    entry: OrderSnapOutboxEntry,
    reservations: ProjectedIngredientReservation[]
  ): Promise<void> {
    const validatedEntry = OrderSnapOutboxEntrySchema.parse(entry);
    const validatedReservations = reservations.map((r) =>
      ProjectedIngredientReservationSchema.parse(r)
    );

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['order_outbox', 'projected_reservations'], 'readwrite');
      const outboxStore = tx.objectStore('order_outbox');
      const resStore = tx.objectStore('projected_reservations');

      outboxStore.add(validatedEntry);

      for (const res of validatedReservations) {
        resStore.add(res);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to atomically enqueue order and reservations'));
    });
  }

  public async getOrder(tenantId: string, orderId: string): Promise<OrderSnapOutboxEntry | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['order_outbox'], 'readonly');
      const store = tx.objectStore('order_outbox');
      const req = store.get([tenantId, orderId]);

      req.onsuccess = () => {
        if (!req.result) {
          resolve(null);
          return;
        }
        try {
          const validated = OrderSnapOutboxEntrySchema.parse(req.result);
          resolve(validated as OrderSnapOutboxEntry);
        } catch (err) {
          console.error('[OUTBOX_DB] Corrupted outbox entry detected.');
          resolve(null);
        }
      };

      req.onerror = () => reject(req.error || new Error(`Failed to get order ${orderId}`));
    });
  }

  public async getPendingOrders(
    tenantId: string,
    actorId?: string
  ): Promise<OrderSnapOutboxEntry[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['order_outbox'], 'readonly');
      const store = tx.objectStore('order_outbox');
      const req = store.getAll();

      req.onsuccess = () => {
        const rawList: any[] = req.result || [];
        const validEntries: OrderSnapOutboxEntry[] = [];

        for (const item of rawList) {
          if (item.tenantId !== tenantId) continue;
          if (actorId && item.actorId !== actorId) continue;

          // Include pending_sync, syncing, and retryable_failure
          if (
            item.syncState === 'pending_sync' ||
            item.syncState === 'syncing' ||
            item.syncState === 'retryable_failure'
          ) {
            try {
              const validated = OrderSnapOutboxEntrySchema.parse(item);
              validEntries.push(validated as OrderSnapOutboxEntry);
            } catch (err) {
              console.error('[OUTBOX_DB] Skipping corrupted pending order.');
            }
          }
        }

        // Strict FIFO ordering by localSequence ascending
        validEntries.sort((a, b) => a.localSequence - b.localSequence);
        resolve(validEntries);
      };

      req.onerror = () => reject(req.error || new Error('Failed to retrieve pending orders'));
    });
  }

  public async getAllTenantOrders(
    tenantId: string,
    actorId?: string
  ): Promise<OrderSnapOutboxEntry[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['order_outbox'], 'readonly');
      const store = tx.objectStore('order_outbox');
      const req = store.getAll();

      req.onsuccess = () => {
        const rawList: any[] = req.result || [];
        const validEntries: OrderSnapOutboxEntry[] = [];

        for (const item of rawList) {
          if (item.tenantId !== tenantId) continue;
          if (actorId && item.actorId !== actorId) continue;

          try {
            const validated = OrderSnapOutboxEntrySchema.parse(item);
            validEntries.push(validated as OrderSnapOutboxEntry);
          } catch (err) {
            console.error('[OUTBOX_DB] Skipping corrupted order record.');
          }
        }

        validEntries.sort((a, b) => a.localSequence - b.localSequence);
        resolve(validEntries);
      };

      req.onerror = () => reject(req.error || new Error('Failed to retrieve tenant orders'));
    });
  }

  public async updateOrderSyncState(
    tenantId: string,
    orderId: string,
    nextState: OrderOutboxSyncState,
    updates?: OutboxLifecycleUpdate
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['order_outbox'], 'readwrite');
      const store = tx.objectStore('order_outbox');
      const req = store.get([tenantId, orderId]);

      req.onsuccess = () => {
        if (!req.result) {
          reject(new Error(`Order ${orderId} not found for state update`));
          return;
        }

        const currentEntry = req.result as OrderSnapOutboxEntry;
        if (!isValidStateTransition(currentEntry.syncState, nextState)) {
          reject(
            new Error(
              `Invalid state transition for order ${orderId}: ${currentEntry.syncState} -> ${nextState}`
            )
          );
          return;
        }

        // Only mutable lifecycle fields are permitted; all protected fields are copied verbatim
        const updatedEntry: OrderSnapOutboxEntry = {
          ...currentEntry,
          syncState: nextState,
          attemptCount: updates?.attemptCount ?? currentEntry.attemptCount,
          lastAttemptAt: updates?.lastAttemptAt ?? new Date().toISOString()
        };

        const validated = OrderSnapOutboxEntrySchema.parse(updatedEntry);
        store.put(validated);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Failed to update state for order ${orderId}`));
    });
  }

  public async markOrderConfirmed(
    tenantId: string,
    orderId: string,
    serverResult: any,
    saleId: string,
    snapshotId: string,
    committedAt: string
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['order_outbox', 'projected_reservations'], 'readwrite');
      const outboxStore = tx.objectStore('order_outbox');
      const resStore = tx.objectStore('projected_reservations');

      const req = outboxStore.get([tenantId, orderId]);
      req.onsuccess = () => {
        if (!req.result) {
          reject(new Error(`Order ${orderId} not found to confirm`));
          return;
        }

        const entry = req.result as OrderSnapOutboxEntry;
        if (!isValidStateTransition(entry.syncState, 'confirmed')) {
          reject(new Error(`Cannot confirm order ${orderId} from state ${entry.syncState}`));
          return;
        }

        entry.syncState = 'confirmed';
        entry.serverResult = serverResult;
        entry.serverSaleId = saleId;
        entry.serverSnapshotId = snapshotId;
        entry.serverCommittedAt = committedAt;

        outboxStore.put(OrderSnapOutboxEntrySchema.parse(entry));

        // Mark associated reservations as committed
        const resIndex = resStore.index('by_tenant_order');
        const resReq = resIndex.getAll([tenantId, orderId]);
        resReq.onsuccess = () => {
          for (const res of resReq.result || []) {
            res.status = 'committed';
            resStore.put(ProjectedIngredientReservationSchema.parse(res));
          }
        };
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Failed to confirm order ${orderId}`));
    });
  }

  public async markOrderConflict(
    tenantId: string,
    orderId: string,
    diagnostic: ConflictDiagnosticRecord
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['order_outbox', 'projected_reservations'], 'readwrite');
      const outboxStore = tx.objectStore('order_outbox');
      const resStore = tx.objectStore('projected_reservations');

      const req = outboxStore.get([tenantId, orderId]);
      req.onsuccess = () => {
        if (!req.result) {
          reject(new Error(`Order ${orderId} not found for conflict marking`));
          return;
        }

        const entry = req.result as OrderSnapOutboxEntry;
        if (!isValidStateTransition(entry.syncState, 'conflict')) {
          reject(new Error(`Cannot mark conflict on order ${orderId} from state ${entry.syncState}`));
          return;
        }

        entry.syncState = 'conflict';
        entry.conflictDiagnostic = diagnostic;
        entry.lastAttemptAt = new Date().toISOString();

        outboxStore.put(OrderSnapOutboxEntrySchema.parse(entry));

        // Reservations are blocked (retained to prevent subsequent orders from silently consuming unconfirmed stock)
        const resIndex = resStore.index('by_tenant_order');
        const resReq = resIndex.getAll([tenantId, orderId]);
        resReq.onsuccess = () => {
          for (const res of resReq.result || []) {
            res.status = 'blocked';
            resStore.put(ProjectedIngredientReservationSchema.parse(res));
          }
        };
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Failed to mark conflict on order ${orderId}`));
    });
  }

  public async markOrderPermanentlyRejected(
    tenantId: string,
    orderId: string,
    diagnostic: ConflictDiagnosticRecord
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['order_outbox', 'projected_reservations'], 'readwrite');
      const outboxStore = tx.objectStore('order_outbox');
      const resStore = tx.objectStore('projected_reservations');

      const req = outboxStore.get([tenantId, orderId]);
      req.onsuccess = () => {
        if (!req.result) {
          reject(new Error(`Order ${orderId} not found for rejection`));
          return;
        }

        const entry = req.result as OrderSnapOutboxEntry;
        if (!isValidStateTransition(entry.syncState, 'permanently_rejected')) {
          reject(
            new Error(
              `Cannot permanently reject order ${orderId} from state ${entry.syncState}`
            )
          );
          return;
        }

        entry.syncState = 'permanently_rejected';
        entry.conflictDiagnostic = diagnostic;
        entry.lastAttemptAt = new Date().toISOString();

        outboxStore.put(OrderSnapOutboxEntrySchema.parse(entry));

        // Release reservations cleanly
        const resIndex = resStore.index('by_tenant_order');
        const resReq = resIndex.getAll([tenantId, orderId]);
        resReq.onsuccess = () => {
          for (const res of resReq.result || []) {
            res.status = 'released';
            resStore.put(ProjectedIngredientReservationSchema.parse(res));
          }
        };
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Failed to reject order ${orderId}`));
    });
  }

  // ---------------------------------------------------------------------------
  // PROJECTED INGREDIENT RESERVATION QUERIES
  // ---------------------------------------------------------------------------

  public async getProjectedReservationsMap(tenantId: string): Promise<Record<string, number>> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['projected_reservations'], 'readonly');
      const store = tx.objectStore('projected_reservations');
      const req = store.getAll();

      req.onsuccess = () => {
        const reservations: ProjectedIngredientReservation[] = req.result || [];
        const map: Record<string, number> = {};

        for (const res of reservations) {
          if (res.tenantId !== tenantId) continue;
          // Count active and blocked reservations
          if (res.status === 'active' || res.status === 'blocked') {
            map[res.ingredientId] = (map[res.ingredientId] || 0) + res.reservedQuantityMinor;
          }
        }

        resolve(map);
      };

      req.onerror = () => reject(req.error || new Error('Failed to get projected reservations map'));
    });
  }

  // ---------------------------------------------------------------------------
  // LEASE LOCK & CRASH RECOVERY
  // ---------------------------------------------------------------------------

  public async acquireSyncLease(
    tenantId: string,
    deviceId: string,
    leaseDurationMs: number = 30000
  ): Promise<string | null> {
    const db = await this.getDB();
const now = Date.now();
     let leaseToken: string;
     try {
       leaseToken = `lease_${generateSecureId('', this.cryptoProvider)}`;
     } catch (err) {
       throw new Error('Secure lease token generation failed');
     }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['sync_leases'], 'readwrite');
      const store = tx.objectStore('sync_leases');
      const req = store.get(tenantId);

      req.onsuccess = () => {
        const currentLease = req.result as SyncLeaseRecord | undefined;

        if (currentLease && currentLease.expiresAt > now && currentLease.deviceId !== deviceId) {
          // Valid lease held by another device/tab
          resolve(null);
          return;
        }

        const newLease: SyncLeaseRecord = {
          tenantId,
          deviceId,
          leaseToken,
          acquiredAt: now,
          expiresAt: now + leaseDurationMs
        };

        store.put(newLease);
        tx.oncomplete = () => resolve(leaseToken);
      };

      req.onerror = () => reject(req.error || new Error('Failed to check sync lease'));
      tx.onerror = () => reject(tx.error || new Error('Lease transaction failed'));
    });
  }

  public async renewSyncLease(
    tenantId: string,
    leaseToken: string,
    leaseDurationMs: number = 30000
  ): Promise<boolean> {
    const db = await this.getDB();
    const now = Date.now();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['sync_leases'], 'readwrite');
      const store = tx.objectStore('sync_leases');
      const req = store.get(tenantId);

      req.onsuccess = () => {
        const currentLease = req.result as SyncLeaseRecord | undefined;
        if (!currentLease || currentLease.leaseToken !== leaseToken) {
          resolve(false);
          return;
        }

        const updated: SyncLeaseRecord = {
          ...currentLease,
          expiresAt: now + leaseDurationMs
        };

        store.put(updated);
        tx.oncomplete = () => resolve(true);
      };

      req.onerror = () => reject(req.error || new Error('Failed to renew lease'));
      tx.onerror = () => reject(tx.error || new Error('Lease renewal transaction failed'));
    });
  }

  public async releaseSyncLease(tenantId: string, leaseToken: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['sync_leases'], 'readwrite');
      const store = tx.objectStore('sync_leases');
      const req = store.get(tenantId);

      req.onsuccess = () => {
        const current = req.result as SyncLeaseRecord | undefined;
        if (current && current.leaseToken === leaseToken) {
          store.delete(tenantId);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to release sync lease'));
    });
  }

  public async recoverStaleSyncingOrders(
    tenantId: string,
    staleThresholdMs: number = 30000
  ): Promise<number> {
    const db = await this.getDB();
    const now = Date.now();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['order_outbox'], 'readwrite');
      const store = tx.objectStore('order_outbox');
      const req = store.getAll();

      req.onsuccess = () => {
        const list: any[] = req.result || [];
        let recoveredCount = 0;

        for (const item of list) {
          if (item.tenantId !== tenantId || item.syncState !== 'syncing') continue;

          const lastAttempt = item.lastAttemptAt ? new Date(item.lastAttemptAt).getTime() : 0;
          if (now - lastAttempt > staleThresholdMs) {
            item.syncState = 'retryable_failure';
            store.put(OrderSnapOutboxEntrySchema.parse(item));
            recoveredCount++;
          }
        }

        tx.oncomplete = () => resolve(recoveredCount);
      };

      req.onerror = () => reject(req.error || new Error('Failed to recover stale syncing orders'));
      tx.onerror = () => reject(tx.error || new Error('Crash recovery transaction failed'));
    });
  }

  public async cleanupConfirmedOrders(
    tenantId: string,
    olderThanTimestampMs: number
  ): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['order_outbox', 'projected_reservations'], 'readwrite');
      const outboxStore = tx.objectStore('order_outbox');
      const resStore = tx.objectStore('projected_reservations');
      const req = outboxStore.getAll();

      req.onsuccess = () => {
        const list: any[] = req.result || [];
        let cleanedCount = 0;

        for (const item of list) {
          if (item.tenantId !== tenantId || item.syncState !== 'confirmed') continue;

          const committedAtMs = item.serverCommittedAt
            ? new Date(item.serverCommittedAt).getTime()
            : 0;

          if (committedAtMs > 0 && committedAtMs < olderThanTimestampMs) {
            outboxStore.delete([tenantId, item.orderId]);

            // Clean associated committed reservations
            const resIndex = resStore.index('by_tenant_order');
            const resReq = resIndex.getAll([tenantId, item.orderId]);
            resReq.onsuccess = () => {
              for (const r of resReq.result || []) {
                resStore.delete(r.reservationId);
              }
            };

            cleanedCount++;
          }
        }

        tx.oncomplete = () => resolve(cleanedCount);
      };

      req.onerror = () => reject(req.error || new Error('Failed to cleanup confirmed orders'));
      tx.onerror = () => reject(tx.error || new Error('Cleanup transaction failed'));
    });
  }

  public async getPendingCount(tenantId: string, actorId?: string): Promise<number> {
    const pending = await this.getPendingOrders(tenantId, actorId);
    return pending.length;
  }

  public async saveAuthority(authority: OrderSnapPersistedAuthority): Promise<void> {
    // Invariant: Persisted authority records MUST ALWAYS be stored locally locked (isLocalLocked: true)
    const recordToSave: OrderSnapPersistedAuthority = {
      ...authority,
      isLocalLocked: true
    };
    const validated = OrderSnapPersistedAuthoritySchema.parse(recordToSave);
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['authority_grants'], 'readwrite');
      const store = tx.objectStore('authority_grants');
      store.put(validated);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to persist authority grant'));
    });
  }

  /**
   * Transactionally reloads and updates the verified WebAuthn sign counter.
   * Enforces zero-counter and strictly increasing counter policies inside a single IndexedDB transaction.
   * Atomically rejects concurrent rollbacks or stale overwrites.
   */
  public async updateAuthorityCounterAtomic(
    tenantId: string,
    staffAccountId: string,
    deviceId: string,
    returnedCounter: number
  ): Promise<{ success: boolean; error?: string; updatedCounter?: number; effectiveCounter?: number }> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      let isSettled = false;
      const settle = (res: { success: boolean; error?: string; updatedCounter?: number; effectiveCounter?: number }) => {
        if (!isSettled) {
          isSettled = true;
          resolve(res);
        }
      };

      const tx = db.transaction(['authority_grants'], 'readwrite');
      const store = tx.objectStore('authority_grants');
      const key = [tenantId, staffAccountId, deviceId];
      const req = store.get(key);

      req.onsuccess = () => {
        if (!req.result) {
          try { tx.abort(); } catch {}
          settle({ success: false, error: 'authority_record_not_found' });
          return;
        }

        let persisted: OrderSnapPersistedAuthority;
        try {
          persisted = OrderSnapPersistedAuthoritySchema.parse(req.result);
        } catch {
          try { tx.abort(); } catch {}
          settle({ success: false, error: 'corrupted_authority_record' });
          return;
        }

        if (!persisted.webAuthnCredential) {
          try { tx.abort(); } catch {}
          settle({ success: false, error: 'no_webauthn_credential' });
          return;
        }

        const storedCounter = persisted.webAuthnCredential.counter || 0;

        // Counter policy & preservation:
        // 1. stored 0, returned 0: accept and preserve 0.
        // 2. stored 0, returned positive: accept and store the returned positive counter.
        // 3. stored positive, returned higher positive: accept and store the returned counter.
        // 4. stored positive, returned equal/lower positive: reject as replay/rollback.
        // 5. stored positive, returned 0: accept under counter-unsupported rule, but preserve existing positive stored counter. Never overwrite with zero.
        let effectiveCounter: number;
        if (storedCounter === 0) {
          effectiveCounter = returnedCounter;
        } else {
          // storedCounter > 0
          if (returnedCounter === 0) {
            effectiveCounter = storedCounter;
          } else if (returnedCounter > storedCounter) {
            effectiveCounter = returnedCounter;
          } else {
            settle({
              success: false,
              error: 'authenticator_clone_or_rollback_detected'
            });
            try { tx.abort(); } catch {}
            return;
          }
        }

        // Prepare updated record: keep isLocalLocked: true strictly
        const updatedRecord: OrderSnapPersistedAuthority = {
          ...persisted,
          isLocalLocked: true,
          updatedAt: Date.now(),
          webAuthnCredential: {
            ...persisted.webAuthnCredential,
            counter: effectiveCounter
          }
        };

        const validated = OrderSnapPersistedAuthoritySchema.parse(updatedRecord);
        store.put(validated);

        tx.oncomplete = () => {
          settle({ success: true, updatedCounter: effectiveCounter, effectiveCounter });
        };
      };

      req.onerror = () => {
        settle({ success: false, error: 'transaction_failed' });
      };

      tx.onerror = () => {
        settle({ success: false, error: 'transaction_aborted' });
      };
      tx.onabort = () => {
        settle({ success: false, error: 'transaction_aborted' });
      };
    });
  }

  public async getAuthority(
    tenantId: string,
    staffAccountId: string,
    deviceId: string
  ): Promise<OrderSnapPersistedAuthority | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['authority_grants'], 'readonly');
      const store = tx.objectStore('authority_grants');
      const req = store.get([tenantId, staffAccountId, deviceId]);

      req.onsuccess = () => {
        if (!req.result) {
          resolve(null);
          return;
        }
        try {
          const validated = OrderSnapPersistedAuthoritySchema.parse(req.result);
          resolve(validated as OrderSnapPersistedAuthority);
        } catch (err) {
          console.error('[OUTBOX_DB] Corrupted authority grant record detected.');
          resolve(null); // Fail-closed on corrupted authority grant
        }
      };

      req.onerror = () => reject(req.error || new Error('Failed to read authority grant'));
    });
  }

  public async clearAuthority(
    tenantId: string,
    staffAccountId: string,
    deviceId: string
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['authority_grants'], 'readwrite');
      const store = tx.objectStore('authority_grants');
      store.delete([tenantId, staffAccountId, deviceId]);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to delete authority grant'));
    });
  }

  public async clearAllAuthorityForTenant(tenantId: string): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['authority_grants'], 'readwrite');
      const store = tx.objectStore('authority_grants');
      const index = store.index('by_tenant');
      const req = index.getAll(tenantId);

      req.onsuccess = () => {
        const records: OrderSnapPersistedAuthority[] = req.result || [];
        for (const record of records) {
          store.delete([record.tenantId, record.staffAccountId, record.deviceId]);
        }
        tx.oncomplete = () => resolve(records.length);
      };

      req.onerror = () => reject(req.error || new Error('Failed to query authority grants for tenant'));
      tx.onerror = () => reject(tx.error || new Error('Transaction failed during tenant authority clearance'));
    });
  }

  /**
   * Returns schema-validated persisted authority candidates for a given tenant and device.
   * Performs an IndexedDB readonly transaction.
   * Validates every returned record with OrderSnapPersistedAuthoritySchema.
   * Skips corrupted records using a fixed diagnostic category without logging raw data or exception objects.
   * Returns immutable records.
   */
  public async getAuthorityCandidatesForTenantDevice(
    tenantId: string,
    deviceId: string
  ): Promise<readonly OrderSnapPersistedAuthority[]> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(['authority_grants'], 'readonly');
      const store = tx.objectStore('authority_grants');
      const index = store.index('by_tenant');
      const req = index.getAll(tenantId);

      req.onsuccess = () => {
        const allRecords: unknown[] = req.result || [];
        const validated: OrderSnapPersistedAuthority[] = [];

        for (const record of allRecords) {
          if ((record as OrderSnapPersistedAuthority).deviceId !== deviceId) {
            continue;
          }
          try {
            const validatedRecord = OrderSnapPersistedAuthoritySchema.parse(record) as OrderSnapPersistedAuthority;
            validated.push(Object.freeze(validatedRecord));
          } catch {
            console.error('[OUTBOX_DB] Skipping corrupted authority candidate record.');
          }
        }

        resolve(validated);
      };

      req.onerror = () => resolve([]);
      tx.onerror = () => resolve([]);
    });
  }
}

let globalOrderSnapOutboxDB: OrderSnapOutboxDB | null = null;

export function getOrderSnapOutboxDB(): OrderSnapOutboxDB {
  if (!globalOrderSnapOutboxDB) {
    globalOrderSnapOutboxDB = new OrderSnapOutboxDB();
  }
  return globalOrderSnapOutboxDB;
}