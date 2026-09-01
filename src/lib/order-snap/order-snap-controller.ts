/**
 * Order Snap Client Controller
 *
 * Manages the client-side lifecycle of Order Snap for a specific tenant and staff session.
 * Compose the authority manager, offline manager, sync coordinator, and catalog hydrator.
 *
 * Design:
 * - No async work in constructor; explicit initialize() returns Promise
 * - Canonical identity (staffAccountId, actorId, role, displayName) comes ONLY from verified authority
 * - One teardown path; no duplicate listeners; no placeholder token providers
 * - Tenant/user changes destroy prior controller and erase in-memory unlock state
 * - Logout invokes OrderSnapLogoutGuard and clears persisted authority without touching Benta
 * - Immutable sanitized snapshots for useSyncExternalStore subscription
 */

import {
  OrderSnapAuthorityManager,
  AuthorityState,
  SanitizedOrderSnapSession,
  EstablishAuthorityParams,
  RestoreAuthorityParams,
  WebAuthnUnlockOptions,
} from './order-snap-authority-manager';
import { OrderSnapOfflineManager } from './order-snap-offline-manager';
import { OrderSnapSyncCoordinator, SyncCoordinatorOptions } from './order-snap-sync-coordinator';
import {
  hydrateOrderSnapCatalog,
  createCatalogHydrator,
  CatalogHydrateResult,
} from './catalog-hydrator';
import { getOrderSnapOutboxDB, OrderSnapOutboxDB } from './order-snap-outbox-db';
import { OrderSnapLogoutGuard, getOrderSnapLogoutGuard } from './order-snap-logout-guard';
import { OfflineCatalogSnapshot, type OrderSnapCashCheckoutResult, type SanitizedOrderLifecycle, type OrderSnapLifecycleStatus, projectToSanitizedLifecycle, projectToPublicProvisionalReceipt } from './offline-types';
import { OrderSnapErrorCode } from '../server/order-snap-finalizer';

export interface OrderSnapSyncCoordinatorPort {
  destroy(): void;
  triggerSync(): void;
}

export type OrderSnapSyncCoordinatorFactory = (
  options: SyncCoordinatorOptions
) => OrderSnapSyncCoordinatorPort;

export interface OrderSnapControllerDependencies {
  readonly tenantId: string;
  readonly authUid: string;
  readonly getIdToken: () => Promise<string | null>;
  readonly outboxDB?: OrderSnapOutboxDB;
  readonly authorityManager?: OrderSnapAuthorityManager;
  readonly offlineManager?: OrderSnapOfflineManager;
readonly syncCoordinatorFactory?: OrderSnapSyncCoordinatorFactory;
  readonly catalogEndpoint?: string;
  readonly authorityEndpoint?: string;
  readonly logoutGuard?: OrderSnapLogoutGuard;
}

export interface OrderSnapControllerState {
  readonly authorityState: AuthorityState;
  readonly session: SanitizedOrderSnapSession | null;
  readonly isOnline: boolean;
  readonly pendingCount: number;
  readonly isSyncing: boolean;
  readonly syncMessage: string;
  readonly catalog: OfflineCatalogSnapshot | null;
  readonly catalogVersion: string | null;
  readonly catalogSyncedAt: string | null;
  readonly canCheckoutOffline: boolean;
}

type StateListener = (state: OrderSnapControllerState) => void;

export class OrderSnapController {
  private readonly tenantId: string;
  private readonly authUid: string;
  private readonly getIdToken: () => Promise<string | null>;
  private readonly outboxDB: OrderSnapOutboxDB;
  private readonly authorityManager: OrderSnapAuthorityManager;
  private readonly offlineManager: OrderSnapOfflineManager;
  private readonly logoutGuard: OrderSnapLogoutGuard;
private syncCoordinator: OrderSnapSyncCoordinatorPort | null = null;
  private readonly syncCoordinatorFactory: OrderSnapSyncCoordinatorFactory;

  private deviceId: string | null = null;

  private authorityState: AuthorityState = 'uninitialized';
  private currentSession: SanitizedOrderSnapSession | null = null;
  private isOnline: boolean = true;
  private pendingCount: number = 0;
  private isSyncing: boolean = false;
  private syncMessage: string = 'Initializing...';
  private catalog: OfflineCatalogSnapshot | null = null;
  private catalogVersion: string | null = null;
  private catalogSyncedAt: string | null = null;
  private initialized: boolean = false;
  private destroyed: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  private cachedState: OrderSnapControllerState | null = null;

  private readonly listeners = new Set<StateListener>();
  private readonly lifecycleListeners = new Set<(record: SanitizedOrderLifecycle) => void>();
  private onlineListener: (() => void) | null = null;
  private offlineListener: (() => void) | null = null;

  constructor(deps: OrderSnapControllerDependencies) {
    this.tenantId = deps.tenantId;
    this.authUid = deps.authUid;
    this.getIdToken = deps.getIdToken;
    this.outboxDB = deps.outboxDB ?? getOrderSnapOutboxDB();
    this.authorityManager = deps.authorityManager ?? new OrderSnapAuthorityManager(this.outboxDB);
    this.offlineManager = deps.offlineManager ?? new OrderSnapOfflineManager(this.outboxDB);
    this.logoutGuard = deps.logoutGuard ?? getOrderSnapLogoutGuard();
    this.syncCoordinatorFactory =
    deps.syncCoordinatorFactory ??
    ((options) => new OrderSnapSyncCoordinator(options));
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): OrderSnapControllerState {
    if (!this.cachedState) {
      this.cachedState = Object.freeze({
        authorityState: this.authorityState,
        session: this.currentSession,
        isOnline: this.isOnline,
        pendingCount: this.pendingCount,
        isSyncing: this.isSyncing,
        syncMessage: this.syncMessage,
        catalog: this.catalog,
        catalogVersion: this.catalogVersion,
        catalogSyncedAt: this.catalogSyncedAt,
        canCheckoutOffline: this.authorityState === 'online-authorized' || this.authorityState === 'offline-unlocked',
      });
    }
    return this.cachedState;
  }

  private notify(): void {
    this.cachedState = null;
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  async initialize(): Promise<void> {
    // Prevent duplicate initialization
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (this.initialized || this.destroyed) {
      return Promise.resolve();
    }

    this.initializationPromise = (async () => {
      try {
        await this.initializeInternal();
      } finally {
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  private async initializeInternal(): Promise<void> {
    try {
      this.deviceId = await this.outboxDB.getOrCreateDeviceId();
      if (this.destroyed) return;

      if (typeof window !== 'undefined') {
        this.onlineListener = () => this.setOnline(true);
        this.offlineListener = () => this.setOnline(false);
        window.addEventListener('online', this.onlineListener);
        window.addEventListener('offline', this.offlineListener);
        this.setOnline(navigator.onLine);
      }

      await this.loadCachedCatalog();
      if (this.destroyed) return;

      if (this.isOnline) {
        await this.initializeOnline();
      } else {
        await this.initializeOffline();
      }
      if (this.destroyed) return;

      this.initialized = true;
      this.notify();
    } catch (error) {
      if (this.destroyed) return;
      this.cleanupOnInitializationFailure();
      console.error('[ORDER_SNAP_CONTROLLER] Initialization failed');
      throw error;
    }
  }

  private cleanupOnInitializationFailure(): void {
    // Remove window listeners if they were installed
    if (this.onlineListener && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineListener);
      window.removeEventListener('offline', this.offlineListener!);
      this.onlineListener = null;
      this.offlineListener = null;
    }

    // Destroy coordinator if one was created during this failed attempt
    if (this.syncCoordinator) {
      this.syncCoordinator.destroy();
      this.syncCoordinator = null;
    }

    // Clear in-memory authority/session state (but not persisted data)
    this.currentSession = null;
    this.authorityState = 'unauthorized';
    this.notify();
  }

  private async loadCachedCatalog(): Promise<void> {
    const catalog = await this.outboxDB.getCatalogSnapshot(this.tenantId);
    if (catalog) {
      this.catalog = catalog;
      this.catalogVersion = catalog.catalogVersion;
      this.catalogSyncedAt = catalog.syncedAt;
    }
  }

  private async initializeOnline(): Promise<void> {
    const token = await this.getIdToken();
    if (this.destroyed) return;
    if (!token) {
      this.authorityState = 'unauthorized';
      this.notify();
      return;
    }

    // First hydrate catalog if we don't have it
    if (!this.catalogVersion) {
      const hydrateResult = await this.hydrateCatalog(token);
      if (this.destroyed) return;
      if (!hydrateResult.success) {
        this.authorityState = 'unauthorized';
        this.notify();
        return;
      }
    }

    // Establish authority using the verified token
    const establishResult = await this.authorityManager.establishOnlineAuthority({
      idToken: token,
      tenantId: this.tenantId,
      deviceId: this.deviceId!,
      catalogVersion: this.catalogVersion!,
    });
    if (this.destroyed) return;

    if (establishResult.success) {
      this.currentSession = establishResult.session ?? null;
      this.authorityState = establishResult.state;
    } else {
      this.authorityState = establishResult.state;
    }

    this.startSyncCoordinator(token);
    this.notify();
  }

  private async initializeOffline(): Promise<void> {
    if (!this.catalogVersion) {
      this.authorityState = 'unauthorized';
      this.notify();
      return;
    }

    const restoreResult = await this.authorityManager.restoreOfflineAuthoritySafe({
      tenantId: this.tenantId,
      deviceId: this.deviceId!,
      currentCatalogVersion: this.catalogVersion!,
      authUid: this.authUid,
    });
    if (this.destroyed) return;

    if (restoreResult.success) {
      this.currentSession = restoreResult.session ?? null;
      this.authorityState = restoreResult.state;
    } else {
      this.authorityState = restoreResult.state;
    }

    this.startSyncCoordinator(null);
    this.notify();
  }

  private async hydrateCatalog(token: string): Promise<CatalogHydrateResult> {
    const hydrator = createCatalogHydrator(
      undefined,
      this.outboxDB,
      () => this.tenantId,
      undefined,
      token
    );
    return hydrateOrderSnapCatalog(hydrator);
  }

  private startSyncCoordinator(initialToken: string | null): void {
    if (this.destroyed) return;
    if (this.syncCoordinator) {
      this.syncCoordinator.destroy();
    }

    const getIdTokenFn = async (): Promise<string | null> => {
      if (this.destroyed) return null;
      return this.getIdToken();
    };

    const syncOptions: SyncCoordinatorOptions = {
      tenantId: this.tenantId,
      getIdToken: getIdTokenFn,
      outboxDB: this.outboxDB,
      syncEndpoint: '/api/order-snap/checkout',
      autoSyncOnStart: false, // We'll start it explicitly after authority is established
      onSyncStart: () => {
        if (this.destroyed) return;
        this.isSyncing = true;
        this.syncMessage = 'Syncing...';
        this.notify();
      },
      onSyncComplete: (result) => {
        if (this.destroyed) return;
        this.isSyncing = false;
        this.pendingCount = result.remainingPending;
        if (result.remainingPending > 0) {
          this.syncMessage = `${result.remainingPending} pending order${result.remainingPending > 1 ? 's' : ''}`;
        } else {
          this.syncMessage = this.isOnline ? 'All orders synced.' : 'Offline. Changes will sync when online.';
        }
        if (result.syncedCount > 0) {
          this.syncMessage += ` (Synced ${result.syncedCount} order${result.syncedCount > 1 ? 's' : ''})`;
        }
        if (result.conflictCount > 0) {
          this.syncMessage += ` (${result.conflictCount} conflict${result.conflictCount > 1 ? 's' : ''})`;
        }
        this.notify();
      },
      onOrderConfirmed: (entry) => {
        if (this.destroyed) return;
        const orderId = entry.orderId;
        this.pendingCount = Math.max(0, this.pendingCount - 1);
        this.notify();
        this.refreshedLifecyclePublish(orderId);
      },
      onOrderConflict: (entry) => {
        if (this.destroyed) return;
        const orderId = entry.orderId;
        this.syncMessage = 'An order needs attention.';
        this.notify();
        this.refreshedLifecyclePublish(orderId);
      },
      onError: () => {
        if (this.destroyed) return;
        console.error('[ORDER_SNAP_SYNC] Sync error');
        this.syncMessage = 'Sync error. Will retry.';
        this.notify();
      },
    };

this.syncCoordinator = this.syncCoordinatorFactory(syncOptions);
  }

  private setOnline(online: boolean): void {
    if (this.destroyed) return;
    if (this.isOnline === online) return;
    this.isOnline = online;
    if (online) {
      this.syncMessage = 'Online';
      this.syncCoordinator?.triggerSync();
    } else {
      this.syncMessage = 'Offline';
    }
    this.notify();
  }

  async establishOnlineAuthority(): Promise<{ success: boolean; state: AuthorityState; session?: SanitizedOrderSnapSession; error?: string }> {
    if (!this.isOnline || !this.deviceId || !this.catalogVersion) {
      return { success: false, state: this.authorityState, error: 'Preconditions not met' };
    }

    const token = await this.getIdToken();
    if (!token) {
      return { success: false, state: 'unauthorized', error: 'No ID token' };
    }

    const result = await this.authorityManager.establishOnlineAuthority({
      idToken: token,
      tenantId: this.tenantId,
      deviceId: this.deviceId,
      catalogVersion: this.catalogVersion,
    });

    if (result.success) {
      this.currentSession = result.session ?? null;
      this.authorityState = result.state;
      this.startSyncCoordinator(token);
    } else {
      this.authorityState = result.state;
    }

    this.notify();
    return result;
  }

  async restoreOfflineAuthority(): Promise<{ success: boolean; state: AuthorityState; session?: SanitizedOrderSnapSession; reason?: string }> {
    if (!this.deviceId || !this.catalogVersion) {
      return { success: false, state: this.authorityState, reason: 'Preconditions not met' };
    }

    const result = await this.authorityManager.restoreOfflineAuthority({
      tenantId: this.tenantId,
      deviceId: this.deviceId!,
      currentCatalogVersion: this.catalogVersion,
    });

    if (result.success) {
      this.currentSession = result.session ?? null;
      this.authorityState = result.state;
    } else {
      this.authorityState = result.state;
    }

    this.notify();
    return result;
  }

  async attemptWebAuthnUnlock(options: WebAuthnUnlockOptions = {}): Promise<{ success: boolean; error?: string }> {
    if (this.authorityState !== 'offline-locked') {
      return { success: false, error: 'Authority not locked' };
    }

    const result = await this.authorityManager.attemptWebAuthnUnlock(options);
    if (result.success && this.currentSession) {
      this.authorityState = 'offline-unlocked';
      // Note: We don't modify the currentSession's isLocalLocked here because
      // the session stored in the controller is the "canonical" session from authority manager
      // The isLocked state is derived from authorityState
    }
    this.notify();
    return result;
  }

  lock(): void {
    if (this.currentSession) {
      this.authorityManager.lock();
      this.authorityState = 'offline-locked';
      this.notify();
    }
  }

  clearAuthority(): void {
    this.authorityManager.clearAuthority();
    this.authorityState = 'uninitialized';
    this.currentSession = null;
    this.notify();
  }

  async acceptOfflineOrder(request: {
    lines: ReadonlyArray<{
      lineId: string;
      menuItemId: string;
      quantity: number;
      selectedModifiers: ReadonlyArray<{ groupId: string; optionId: string }>;
    }>;
    cashTenderedCentavos: number;
    idempotencyKey: string;
  }): Promise<OrderSnapCashCheckoutResult> {
    if (this.authorityState !== 'online-authorized' && this.authorityState !== 'offline-unlocked') {
      throw new Error('Offline checkout requires unlocked authority');
    }
    if (!this.catalog) {
      throw new Error('No cached catalog available');
    }
    if (!this.catalogVersion) {
      throw new Error('No catalog version available');
    }

    // Build OrderIngestionRequest from the cart
    const ingestionRequest = {
      orderId: request.idempotencyKey.replace('idemp_', 'ord_'),
      tenantId: this.tenantId,
      staffAccountId: this.getStaffAccountIdFromSession(),
      idempotencyKey: request.idempotencyKey,
      createdAt: new Date().toISOString(),
      committedAt: new Date().toISOString(),
      lines: request.lines.map(line => ({
        lineId: line.lineId,
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        selectedModifiers: line.selectedModifiers.map(mod => ({
          groupId: mod.groupId,
          optionId: mod.optionId,
        })),
      })),
    };

    const result = await this.offlineManager.acceptOfflineOrder({
      tenantId: this.tenantId,
      actorId: this.getActorIdFromSession(),
      staffAccountId: this.getStaffAccountIdFromSession(),
      actorRole: this.getRoleFromSession(),
      cashierDisplayName: this.getDisplayNameFromSession(),
      request: ingestionRequest,
      paymentMethod: 'cash',
      cashTenderedCentavos: request.cashTenderedCentavos,
      idempotencyKey: request.idempotencyKey,
      orderId: ingestionRequest.orderId,
      authorityManager: this.authorityManager,
    });

    this.pendingCount = await this.outboxDB.getPendingCount(this.tenantId);
    const lifecycle = projectToSanitizedLifecycle(result.outboxEntry);
    this.publishLifecycle(lifecycle);
    this.notify();

    return {
      success: true,
      provisionalReceipt: projectToPublicProvisionalReceipt(result.provisionalReceipt),
      lifecycle,
    };
  }

   /**
    * Public tenant-scoped lifecycle lookup.
    * Reads through the injected outbox DB, scoped to the controller's tenant.
    * Returns only the sanitized projection; never the raw outbox entry.
    */
   public async getOrderLifecycle(orderId: string): Promise<SanitizedOrderLifecycle | null> {
     if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
       return null;
     }
     if (this.destroyed) return null;
     try {
       const entry = await this.outboxDB.getOrder(this.tenantId, orderId);
       if (!entry) return null;
       return projectToSanitizedLifecycle(entry);
     } catch {
       return null;
     }
   }

   /**
    * Subscribe to sanitized order-lifecycle updates.
    * Listeners receive only the frozen sanitized record.
    */
   public subscribeToLifecycle(listener: (record: SanitizedOrderLifecycle) => void): () => void {
     if (this.destroyed) {
       return () => {};
     }
     this.lifecycleListeners.add(listener);
     return () => this.lifecycleListeners.delete(listener);
   }

   private publishLifecycle(record: SanitizedOrderLifecycle): void {
     if (this.destroyed) return;
     for (const listener of this.lifecycleListeners) {
       listener(record);
     }
   }

   /**
    * Re-reads the current persisted entry for an orderId from the outbox DB
    * and publishes the sanitized lifecycle. Checks destruction before and
    * after the async lookup. Lookup failure is suppressed.
    */
   private refreshedLifecyclePublish(orderId: string): void {
     if (this.destroyed) return;
     this.outboxDB.getOrder(this.tenantId, orderId).then((refreshed) => {
       if (this.destroyed || !refreshed) return;
       this.publishLifecycle(projectToSanitizedLifecycle(refreshed));
     }).catch(() => {
       // lookup failure - suppress without raw logging
     });
   }

  private getStaffAccountIdFromSession(): string {
    return this.currentSession?.staffAccountId ?? '';
  }

  private getActorIdFromSession(): string {
    return this.currentSession?.actorId ?? '';
  }

  private getRoleFromSession(): 'cashier' | 'owner' {
    return this.currentSession?.role ?? 'cashier';
  }

  private getDisplayNameFromSession(): string {
    return this.currentSession?.displayName ?? '';
  }

  async getPendingCount(): Promise<number> {
    this.pendingCount = await this.outboxDB.getPendingCount(this.tenantId);
    this.notify();
    return this.pendingCount;
  }

  triggerSync(): void {
    this.syncCoordinator?.triggerSync();
  }

  async performLogoutCleanup(): Promise<void> {
    this.logoutGuard.performSafeLogoutCleanup();
    this.clearAuthority();
    if (this.syncCoordinator) {
      this.syncCoordinator.destroy();
      this.syncCoordinator = null;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.onlineListener && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineListener);
      window.removeEventListener('offline', this.offlineListener!);
      this.onlineListener = null;
      this.offlineListener = null;
    }

    if (this.syncCoordinator) {
      this.syncCoordinator.destroy();
      this.syncCoordinator = null;
    }

    this.clearAuthority();
    this.listeners.clear();
    this.lifecycleListeners.clear();
  }
}
