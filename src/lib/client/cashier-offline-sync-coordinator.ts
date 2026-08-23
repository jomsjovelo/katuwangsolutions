import { getJournalDB, JournalDB } from '../offline/journal-db';
import {
  OfflineClaimSyncRequest,
  OfflineClaimSyncResponse,
  MAX_SYNC_CLAIMS_PER_BATCH
} from '../offline/offline-types';

export interface SyncCoordinatorOptions {
  getIdToken: () => Promise<string | null>;
  journalDB?: JournalDB;
  syncEndpoint?: string;
  reconciliationEndpoint?: string;
  onSyncComplete?: (result: { syncedCount: number; remainingPending: number }) => void;
  onReceiptReconciled?: (provisionalReceiptNumber: string, authoritativeReceiptNumber: string) => void;
  onError?: (error: Error) => void;
}

export class CashierOfflineSyncCoordinator {
  private getIdToken: () => Promise<string | null>;
  private journalDB: JournalDB;
  private syncEndpoint: string;
  private reconciliationEndpoint: string;
  private onSyncComplete?: (result: { syncedCount: number; remainingPending: number }) => void;
  private onReceiptReconciled?: (provisionalReceiptNumber: string, authoritativeReceiptNumber: string) => void;
  private onError?: (error: Error) => void;

  private reconciledReceipts = new Map<string, string>();
  private isSyncing = false;
  private retryTimeout: any = null;
  private consecutiveFailures = 0;
  private isDestroyed = false;

  constructor(options: SyncCoordinatorOptions) {
    this.getIdToken = options.getIdToken;
    this.journalDB = options.journalDB || getJournalDB();
    this.syncEndpoint = options.syncEndpoint || '/api/cashier/benta-sync-claims';
    this.reconciliationEndpoint = options.reconciliationEndpoint || '/api/cashier/benta-shift-reconciliation';
    this.onSyncComplete = options.onSyncComplete;
    this.onReceiptReconciled = options.onReceiptReconciled;
    this.onError = options.onError;

    this.init();
  }

  private async init() {
    try {
      // Startup recovery: durably transition any stranded in_flight entries to retryable_error
      await this.journalDB.recoverStaleInFlightEntries();
    } catch (e) {
      console.warn('[SYNC_COORDINATOR] Startup in-flight recovery warning:', e);
    }
    this.setupListeners();
  }

  private setupListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('visibilitychange', this.handleVisibility);
    }
  }

  private handleOnline = () => {
    this.consecutiveFailures = 0;
    this.triggerSync();
  };

  private handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.triggerSync();
    }
  };

  public destroy() {
    this.isDestroyed = true;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('visibilitychange', this.handleVisibility);
    }
  }

  public getAuthoritativeReceiptNumber(provisionalReceiptNumber: string): string | undefined {
    return this.reconciledReceipts.get(provisionalReceiptNumber);
  }

  /**
   * Triggers single-flight synchronization of all pending offline claims and shift close records.
   * Synchronizes earlier sales in FIFO order before calling authenticated shift reconciliation.
   */
  public async triggerSync(): Promise<{
    syncedCount: number;
    remainingPending: number;
  }> {
    if (this.isSyncing || this.isDestroyed) {
      return { syncedCount: 0, remainingPending: 0 };
    }

    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' && !navigator.onLine) {
      return { syncedCount: 0, remainingPending: 0 };
    }

    this.isSyncing = true;
    let submittedEntries: any[] = [];
    const resolvedEntryIds = new Set<string>();

    try {
      const idToken = await this.getIdToken();
      if (!idToken) {
        this.isSyncing = false;
        return { syncedCount: 0, remainingPending: 0 };
      }

      // Fetch pending sync entries in strict FIFO sequence order
      const pendingEntries = await this.journalDB.getPendingEntries(MAX_SYNC_CLAIMS_PER_BATCH);
      if (pendingEntries.length === 0) {
        this.isSyncing = false;
        this.consecutiveFailures = 0;
        return { syncedCount: 0, remainingPending: 0 };
      }

      // Group entries by shift to fetch the matching offline grant
      const firstEntry = pendingEntries[0];
      submittedEntries = pendingEntries.filter((e: any) => e.shiftId === firstEntry.shiftId);

      const saleEntries = submittedEntries.filter((e: any) => e.kind !== 'shift_close');
      const shiftCloseEntries = submittedEntries.filter((e: any) => e.kind === 'shift_close');

      let syncedBatchCount = 0;

      // 1. Process Sale Entries First
      if (saleEntries.length > 0) {
        const authorityContext = await this.journalDB.getAuthorityContext(
          firstEntry.tenantId,
          firstEntry.staffAccountId,
          firstEntry.shiftId
        );

        if (!authorityContext.grant) {
          console.warn(`[SYNC_COORDINATOR] No offline grant found in IndexedDB for shift ${firstEntry.shiftId}`);
          this.isSyncing = false;
          return { syncedCount: 0, remainingPending: submittedEntries.length };
        }

        // Mark submitted sale entries in_flight in IndexedDB
        for (const entry of saleEntries) {
          await this.journalDB.updateEntryStatus(entry.entryId, 'in_flight').catch(() => {});
        }

        const syncPayload: OfflineClaimSyncRequest = {
          grant: authorityContext.grant,
          claims: saleEntries.map((e: any) => ({
            entryId: e.entryId,
            seqIndex: e.seqIndex,
            idempotencyKey: e.idempotencyKey,
            clientTimestamp: e.clientTimestamp,
            items: (e.items || []).map((it: any) => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPriceCentavos: it.unitPriceCentavos
            })),
            paymentMethod: 'cash',
            cashTenderedCentavos: e.cashTenderedCentavos,
            totalCentavos: e.totalCentavos
          }))
        };

        const response = await fetch(this.syncEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify(syncPayload)
        });

        if (!response.ok) {
          throw new Error(`Sync HTTP error: ${response.status}`);
        }

        const result: OfflineClaimSyncResponse = await response.json();
        if (!result || !Array.isArray(result.results)) {
          throw new Error('Invalid sync response format');
        }

        for (const res of result.results) {
          if (!res || !res.entryId) continue;
          resolvedEntryIds.add(res.entryId);

          const matchedEntry = saleEntries.find((e) => e.entryId === res.entryId);

          if (res.status === 'accepted' || res.status === 'accepted_with_inventory_variance') {
            const entryStatus = res.status === 'accepted' ? 'accepted' : 'accepted_variance';
            await this.journalDB.updateEntryStatus(res.entryId, entryStatus, {
              serverSaleId: res.saleId,
              authoritativeReceiptNumber: res.receiptNumber
            });
            syncedBatchCount++;

            if (matchedEntry?.provisionalReceiptNumber && (res.receiptNumber || res.saleId)) {
              const authNum = res.receiptNumber || res.saleId!;
              this.reconciledReceipts.set(matchedEntry.provisionalReceiptNumber, authNum);
              this.onReceiptReconciled?.(matchedEntry.provisionalReceiptNumber, authNum);

              // Durably persist receipt mapping to IndexedDB
              await this.journalDB.saveReceiptMapping({
                provisionalReceiptNumber: matchedEntry.provisionalReceiptNumber,
                serverSaleId: res.saleId || '',
                authoritativeReceiptNumber: authNum,
                tenantId: matchedEntry.tenantId,
                shiftId: matchedEntry.shiftId,
                reconciledAtTimestamp: Date.now()
              });
            }
          } else if (res.status === 'rejected_tampered') {
            // Strictly preserve rejected_tampered as distinct status
            await this.journalDB.updateEntryStatus(res.entryId, 'rejected_tampered', {
              lastError: res.reconciliationNotes || 'Cryptographic or structural tampering detected'
            });
          } else if (res.status === 'needs_review') {
            await this.journalDB.updateEntryStatus(res.entryId, 'needs_review', {
              lastError: res.reconciliationNotes || 'Under Owner review'
            });
          } else {
            const entry = saleEntries.find((e: any) => e.entryId === res.entryId);
            const currentRetries = entry?.retryCount || 0;
            await this.journalDB.updateEntryStatus(res.entryId, 'retryable_error', {
              retryCount: currentRetries + 1,
              lastError: res.reconciliationNotes || 'Server requested retry'
            });
          }
        }
      }

      // 2. Process Shift Close Record ONLY if all sales in the shift are terminal and accepted
      if (saleEntries.length === 0 && shiftCloseEntries.length > 0) {
        const closeEntry = shiftCloseEntries[0];

        try {
          // Gate: Assert all earlier sequence entries have reached accepted/accepted_variance status
          await this.journalDB.assertAllPriorSalesTerminal(
            closeEntry.tenantId,
            closeEntry.staffAccountId,
            closeEntry.shiftId,
            closeEntry.seqIndex
          );

          await this.journalDB.updateEntryStatus(closeEntry.entryId, 'in_flight').catch(() => {});

          const closeResponse = await fetch(this.reconciliationEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`
            },
            body: JSON.stringify({
              shiftId: closeEntry.shiftId,
              endingCashCentavos: closeEntry.endingCashCentavos,
              notes: closeEntry.notes,
              closeIdempotencyKey: closeEntry.closeIdempotencyKey || closeEntry.idempotencyKey
            })
          });

          if (!closeResponse.ok) {
            throw new Error(`Shift close reconciliation HTTP error: ${closeResponse.status}`);
          }

          resolvedEntryIds.add(closeEntry.entryId);
          await this.journalDB.updateEntryStatus(closeEntry.entryId, 'accepted');
          syncedBatchCount++;
        } catch (closeErr: any) {
          resolvedEntryIds.add(closeEntry.entryId);
          await this.journalDB.updateEntryStatus(closeEntry.entryId, 'retryable_error', {
            retryCount: (closeEntry.retryCount || 0) + 1,
            lastError: closeErr.message
          });
        }
      }

      // 3. Durably fail-safe any unacknowledged entries
      for (const entry of submittedEntries) {
        if (!resolvedEntryIds.has(entry.entryId)) {
          const currentRetries = entry.retryCount || 0;
          await this.journalDB.updateEntryStatus(entry.entryId, 'retryable_error', {
            retryCount: currentRetries + 1,
            lastError: 'Response missing or unacknowledged by server'
          }).catch(() => {});
        }
      }

      this.consecutiveFailures = 0;

      const remaining = await this.journalDB.getPendingEntries(100);
      const remainingCount = remaining.length;

      this.onSyncComplete?.({
        syncedCount: syncedBatchCount,
        remainingPending: remainingCount
      });

      // Chain next batch if remaining
      if (remainingCount > 0) {
        setTimeout(() => this.triggerSync(), 100);
      }

      return { syncedCount: syncedBatchCount, remainingPending: remainingCount };
    } catch (err: any) {
      this.consecutiveFailures++;
      console.warn(`[SYNC_COORDINATOR] Offline sync attempt failed (${this.consecutiveFailures}):`, err.message);

      // On network failure, durably transition all submitted entries to retryable_error
      for (const entry of submittedEntries) {
        if (!resolvedEntryIds.has(entry.entryId)) {
          const currentRetries = entry.retryCount || 0;
          await this.journalDB.updateEntryStatus(entry.entryId, 'retryable_error', {
            retryCount: currentRetries + 1,
            lastError: err.message || 'Network failure during sync'
          }).catch(() => {});
        }
      }

      this.onError?.(err);
      this.scheduleRetry();

      const remaining = await this.journalDB.getPendingEntries(100).catch(() => []);
      return { syncedCount: 0, remainingPending: remaining.length };
    } finally {
      this.isSyncing = false;
    }
  }

  private scheduleRetry() {
    if (this.isDestroyed || this.retryTimeout) return;

    // Exponential backoff capped at 60 seconds
    const delayMs = Math.min(60000, 1000 * Math.pow(2, Math.min(this.consecutiveFailures, 6)));
    this.retryTimeout = setTimeout(() => {
      this.retryTimeout = null;
      this.triggerSync();
    }, delayMs);
  }
}
