/**
 * Order Snap Safe Logout & Tenant Isolation Guard
 *
 * Implements:
 * - Pre-logout pending order verification
 * - Non-destructive logout policy (zero silent data loss of unsynced business orders)
 * - Explicit user-facing warnings with pending count
 * - Tenant partition isolation
 */

import {
  OrderSnapOutboxDB,
  getOrderSnapOutboxDB
} from './order-snap-outbox-db';
import { OrderSnapOutboxEntry } from './offline-types';

export interface PendingLogoutStatus {
  hasPending: boolean;
  pendingCount: number;
  pendingOrders: OrderSnapOutboxEntry[];
  warningMessage?: string;
}

export class OrderSnapLogoutGuard {
  private outboxDB: OrderSnapOutboxDB;

  constructor(outboxDB?: OrderSnapOutboxDB) {
    this.outboxDB = outboxDB || getOrderSnapOutboxDB();
  }

  /**
   * Inspects pending outbox queue before a staff member or owner logs out.
   */
  public async getPendingLogoutStatus(
    tenantId: string,
    actorId?: string
  ): Promise<PendingLogoutStatus> {
    const pendingOrders = await this.outboxDB.getPendingOrders(tenantId, actorId);
    const count = pendingOrders.length;

    if (count === 0) {
      return {
        hasPending: false,
        pendingCount: 0,
        pendingOrders: []
      };
    }

    const warningMessage =
      count === 1
        ? 'You have 1 pending offline order waiting to sync. Logging out will clear your current session, but your order remains safely stored on this device until synchronized.'
        : `You have ${count} pending offline orders waiting to sync. Logging out will clear your current session, but your orders remain safely stored on this device until synchronized.`;

    return {
      hasPending: true,
      pendingCount: count,
      pendingOrders,
      warningMessage
    };
  }

  /**
   * Performs non-destructive in-memory cleanup on logout.
   * NEVER deletes or purges the IndexedDB outbox.
   */
  public performSafeLogoutCleanup(): void {
    // Clear sensitive session caches if any in-memory references exist
    if (typeof window !== 'undefined' && (window as any).__orderSnapSessionCache) {
      delete (window as any).__orderSnapSessionCache;
    }
  }
}

let globalLogoutGuard: OrderSnapLogoutGuard | null = null;

export function getOrderSnapLogoutGuard(): OrderSnapLogoutGuard {
  if (!globalLogoutGuard) {
    globalLogoutGuard = new OrderSnapLogoutGuard();
  }
  return globalLogoutGuard;
}
