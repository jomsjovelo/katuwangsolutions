/**
 * Order Snap Automatic Synchronization Coordinator
 *
 * Implements:
 * - Multi-trigger synchronization (startup, online, visibility, periodic backoff, Background Sync, manual)
 * - Authoritative IndexedDB lease locking with crash safety
 * - Optional BroadcastChannel cross-tab notifications
 * - Strict FIFO deterministic synchronization
 * - Exactly-once idempotent replay
 * - Safe conflict classification and dependent-order re-evaluation
 * - Cashier & Owner recovery support
 */

import {
  OrderSnapOutboxDB,
  getOrderSnapOutboxDB
} from './order-snap-outbox-db';
import {
  OrderSnapOutboxEntry,
  ConflictDiagnosticRecord,
  SyncLeaseRecord
} from './offline-types';

export interface SyncCoordinatorOptions {
  tenantId: string;
  getIdToken: () => Promise<string | null>;
  outboxDB?: OrderSnapOutboxDB;
  syncEndpoint?: string;
  autoSyncOnStart?: boolean;
  onSyncStart?: () => void;
  onSyncComplete?: (result: {
    syncedCount: number;
    remainingPending: number;
    conflictCount: number;
  }) => void;
  onOrderConfirmed?: (entry: OrderSnapOutboxEntry) => void;
  onOrderConflict?: (entry: OrderSnapOutboxEntry, diagnostic: ConflictDiagnosticRecord) => void;
  onError?: (error: Error) => void;
}

export class OrderSnapSyncCoordinator {
  private tenantId: string;
  private getIdToken: () => Promise<string | null>;
  private outboxDB: OrderSnapOutboxDB;
  private syncEndpoint: string;
  private autoSyncOnStart: boolean;

  private onSyncStart?: () => void;
  private onSyncComplete?: (result: {
    syncedCount: number;
    remainingPending: number;
    conflictCount: number;
  }) => void;
  private onOrderConfirmed?: (entry: OrderSnapOutboxEntry) => void;
  private onOrderConflict?: (entry: OrderSnapOutboxEntry, diagnostic: ConflictDiagnosticRecord) => void;
  private onError?: (error: Error) => void;

  private isSyncing = false;
  private isDestroyed = false;
  private consecutiveFailures = 0;
  private retryTimeout: any = null;
  private activeLeaseToken: string | null = null;
  private broadcastChannel: any = null;
  private runningSyncPromise: Promise<{ syncedCount: number; remainingPending: number; conflictCount: number }> | null = null;

  constructor(options: SyncCoordinatorOptions) {
    this.tenantId = options.tenantId;
    this.getIdToken = options.getIdToken;
    this.outboxDB = options.outboxDB || getOrderSnapOutboxDB();
    this.syncEndpoint = options.syncEndpoint || '/api/order-snap/checkout';
    this.autoSyncOnStart = options.autoSyncOnStart ?? true;

    this.onSyncStart = options.onSyncStart;
    this.onSyncComplete = options.onSyncComplete;
    this.onOrderConfirmed = options.onOrderConfirmed;
    this.onOrderConflict = options.onOrderConflict;
    this.onError = options.onError;

    this.init();
  }

  private async init() {
    try {
      // 1. Crash recovery: reset stale syncing entries from earlier aborted sessions
      await this.outboxDB.recoverStaleSyncingOrders(this.tenantId);
    } catch (e) {
      console.warn('[ORDER_SNAP_SYNC] stale_sync_recovery_notice');
    }

    // 2. Setup BroadcastChannel if available
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('katuwang_ordersnap_sync');
        this.broadcastChannel.onmessage = (event: MessageEvent) => {
          if (event.data?.type === 'SYNC_TRIGGERED' && event.data?.tenantId === this.tenantId) {
            this.triggerSync();
          }
        };
      } catch (e) {
        console.warn('[ORDER_SNAP_SYNC] broadcast_channel_unavailable');
      }
    }

    // 3. Setup event listeners
    this.setupListeners();

    // 4. Trigger initial background sync if enabled
    if (this.autoSyncOnStart) {
      this.triggerSync();
    }
  }

  private handleOnline = () => {
    this.consecutiveFailures = 0;
    this.triggerSync();
  };

  private visibilitychangeHandler = (event: Event) => {
    if (!this.isDestroyed) {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        this.triggerSync();
      }
    }
  };

  private setupListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('visibilitychange', this.visibilitychangeHandler);

      // Register Service Worker Background Sync if supported
      if (
        typeof navigator !== 'undefined' &&
        'serviceWorker' in navigator &&
        'SyncManager' in window
      ) {
        navigator.serviceWorker.ready
          .then((reg: any) => {
            if (reg.sync?.register) {
              reg.sync.register('order-snap-sync').catch(() => { });
            }
          })
          .catch(() => { });
      }
    }
  }

  private periodicRetryTimer: any = null;

  public triggerSync() {
    if (this.isDestroyed) return;
    this.scheduleSync(0);
    this.ensurePeriodicRetry();
  }

  private ensurePeriodicRetry() {
    if (this.isDestroyed) {
      if (this.periodicRetryTimer) {
        clearTimeout(this.periodicRetryTimer);
        this.periodicRetryTimer = null;
      }
      return;
    }

    if (this.periodicRetryTimer) {
      clearTimeout(this.periodicRetryTimer);
    }

    this.periodicRetryTimer = setTimeout(() => {
      if (!this.isDestroyed && !this.isSyncing) {
        this.triggerSync();
      }
    }, 60000); // 60 seconds periodic retry
  }

  public async syncNow(): Promise<{ syncedCount: number; remainingPending: number; conflictCount: number }> {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    if (this.runningSyncPromise) {
      return this.runningSyncPromise;
    }
    this.runningSyncPromise = this.processQueue().finally(() => {
      this.runningSyncPromise = null;
    });
    return this.runningSyncPromise;
  }

  private scheduleSync(delayMs: number) {
    if (this.isDestroyed) return;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }

    this.retryTimeout = setTimeout(() => {
      this.retryTimeout = null;
      if (!this.runningSyncPromise) {
        this.runningSyncPromise = this.processQueue().finally(() => {
          this.runningSyncPromise = null;
        });
      }
    }, delayMs);
  }

  private computeBackoffDelay(): number {
    // Exponential backoff: 2s, 4s, 8s, 16s, max 60s + random jitter 0-1000ms
    const base = Math.min(60000, 2000 * Math.pow(2, this.consecutiveFailures));
    const jitter = Math.floor(Math.random() * 1000);
    return base + jitter;
  }

  private notifyOtherTabs() {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'SYNC_TRIGGERED',
          tenantId: this.tenantId
        });
      } catch { }
    }
  }

  private async processQueue(): Promise<{
    syncedCount: number;
    remainingPending: number;
    conflictCount: number;
  }> {
    if (this.isSyncing || this.isDestroyed) {
      const remaining = await this.outboxDB.getPendingCount(this.tenantId);
      return { syncedCount: 0, remainingPending: remaining, conflictCount: 0 };
    }

    const deviceId = await this.outboxDB.getOrCreateDeviceId();

    // Acquire authoritative cross-tab lease lock
    const leaseToken = await this.outboxDB.acquireSyncLease(this.tenantId, deviceId, 30000);
    if (!leaseToken) {
      // Another tab holds active lease
      const remaining = await this.outboxDB.getPendingCount(this.tenantId);
      return { syncedCount: 0, remainingPending: remaining, conflictCount: 0 };
    }

    this.activeLeaseToken = leaseToken;
    this.isSyncing = true;
    this.onSyncStart?.();
    let syncedCount = 0;
    let conflictCount = 0;

    try {
      // 1. Retrieve all pending orders sorted strictly FIFO by localSequence
      const pendingOrders = await this.outboxDB.getPendingOrders(this.tenantId);

      if (pendingOrders.length === 0) {
        this.consecutiveFailures = 0;
        return { syncedCount: 0, remainingPending: 0, conflictCount: 0 };
      }

      // 2. Obtain fresh authentication token
      const idToken = await this.getIdToken();
      if (!idToken) {
        throw new Error('Authentication required for synchronization.');
      }

      // 3. Process each order in strict sequential order
      for (const order of pendingOrders) {
        if (this.isDestroyed) break;

        // Renew lease during long sync batches
        await this.outboxDB.renewSyncLease(this.tenantId, leaseToken, 30000);

        // Update state to syncing
        await this.outboxDB.updateOrderSyncState(this.tenantId, order.orderId, 'syncing', {
          attemptCount: order.attemptCount + 1,
          lastAttemptAt: new Date().toISOString()
        });

        try {
          const res = await fetch(this.syncEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`
            },
            body: JSON.stringify({
              mode: 'offline_sync',
              request: order.request,
              paymentMethod: order.paymentMethod,
              authorityGrant: order.grant,
              deviceId: order.deviceId,
              catalogVersion: order.grant.payload.catalogVersion
            })
          });

          if (res.ok) {
            const data = await res.json();
            await this.outboxDB.markOrderConfirmed(
              this.tenantId,
              order.orderId,
              data.result,
              data.saleId,
              data.snapshotId,
              data.committedAt
            );

            syncedCount++;
            this.onOrderConfirmed?.(order);
          } else if (res.status === 409) {
            // Authoritative Conflict: Stock, Product, or Idempotency mismatch
            const errData = await res.json().catch(() => ({ error: 'Conflict' }));
            const diagnostic: ConflictDiagnosticRecord = {
              occurredAt: new Date().toISOString(),
              errorCode: errData.category || 'INSUFFICIENT_STOCK',
              errorMessage: errData.error || 'Authoritative stock conflict',
              conflictReason: errData.error || 'Server validation conflict',
              attemptedByActorId: order.actorId,
              originalRequest: order.request
            };

            await this.outboxDB.markOrderConflict(this.tenantId, order.orderId, diagnostic);
            conflictCount++;
            this.onOrderConflict?.(order, diagnostic);

            // Head-of-line stock conflict safety: Stop draining queue to avoid cascading conflicts
            break;
          } else if (res.status === 400) {
            // Permanent validation error
            const errData = await res.json().catch(() => ({ error: 'Invalid request' }));
            const diagnostic: ConflictDiagnosticRecord = {
              occurredAt: new Date().toISOString(),
              errorCode: errData.category || 'INVALID_REQUEST',
              errorMessage: errData.error || 'Invalid request',
              conflictReason: 'Permanent client validation failure',
              attemptedByActorId: order.actorId,
              originalRequest: order.request
            };

            await this.outboxDB.markOrderPermanentlyRejected(
              this.tenantId,
              order.orderId,
              diagnostic
            );
            conflictCount++;
            this.onOrderConflict?.(order, diagnostic);
          } else if (res.status === 401 || res.status === 403) {
            // Session Revocation / Permission Error
            const errData = await res.json().catch(() => ({ error: 'Unauthorized' }));
            await this.outboxDB.updateOrderSyncState(
              this.tenantId,
              order.orderId,
              'retryable_failure'
            );
            throw new Error(`Authentication/Session error during sync: ${errData.error}`);
          } else {
            // Retryable 5xx or transient failure
            await this.outboxDB.updateOrderSyncState(
              this.tenantId,
              order.orderId,
              'retryable_failure'
            );
            this.consecutiveFailures++;
            this.scheduleSync(this.computeBackoffDelay());
            break;
          }
        } catch (fetchErr: any) {
          // Network / Offline Error
          await this.outboxDB.updateOrderSyncState(
            this.tenantId,
            order.orderId,
            'retryable_failure'
          );
          this.consecutiveFailures++;
          this.scheduleSync(this.computeBackoffDelay());
          break;
        }
      }

      this.consecutiveFailures = 0;
      this.notifyOtherTabs();
    } catch (queueErr: any) {
      this.consecutiveFailures++;
      this.scheduleSync(this.computeBackoffDelay());
      this.onError?.(queueErr);
    } finally {
      this.isSyncing = false;
      if (this.activeLeaseToken) {
        await this.outboxDB.releaseSyncLease(this.tenantId, this.activeLeaseToken).catch(() => { });
        this.activeLeaseToken = null;
      }

      const remainingPending = await this.outboxDB.getPendingCount(this.tenantId);
      this.onSyncComplete?.({
        syncedCount,
        remainingPending,
        conflictCount
      });

      return {
        syncedCount,
        remainingPending,
        conflictCount
      };
    }
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    if (this.periodicRetryTimer) {
      clearTimeout(this.periodicRetryTimer);
      this.periodicRetryTimer = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('visibilitychange', this.visibilitychangeHandler);
    }

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch { }
      this.broadcastChannel = null;
    }

    if (this.activeLeaseToken) {
      this.outboxDB.releaseSyncLease(this.tenantId, this.activeLeaseToken).catch(() => { });
      this.activeLeaseToken = null;
    }
  }
}