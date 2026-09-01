/**
 * Order Snap Client-Side Catalog Hydrator
 *
 * Transforms an authorized server catalog response into a tenant-validated,
 * persistent offline snapshot for cashier-safe offline order validation.
 *
 * Invariants:
 * 1. Accepts injected dependencies for deterministic unit testing
 * 2. Never accesses window or navigator during module import
 * 3. Validates entire response with OfflineCatalogSnapshotSchema
 * 4. Never overwrites cached catalog on any failure
 * 5. Returns controlled status object for UI integration
 */

import {
  OrderSnapOutboxDB,
  getOrderSnapOutboxDB
} from './order-snap-outbox-db';
import {
  OfflineCatalogSnapshot,
  OfflineCatalogSnapshotSchema
} from './offline-types';

export type CatalogHydratorFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface CatalogHydratorOptions {
  fetchFn: CatalogHydratorFetch;
  outboxDB: OrderSnapOutboxDB;
  getCurrentTenant: () => string | null;
  catalogEndpoint: string;
  authToken: string;
}

export interface CatalogHydrateSuccess {
  success: true;
  catalogVersion: string;
  syncedAt: string;
  tenantId: string;
}

export interface CatalogHydrateFailure {
  success: false;
  error: 'network_error' | 'auth_error' | 'validation_error' | 'tenant_mismatch' | 'persistence_error';
  message: string;
}

export type CatalogHydrateResult = CatalogHydrateSuccess | CatalogHydrateFailure;

export async function hydrateOrderSnapCatalog(
  options: CatalogHydratorOptions
): Promise<CatalogHydrateResult> {
  const { fetchFn, outboxDB, getCurrentTenant, catalogEndpoint, authToken } = options;

  const currentTenant = getCurrentTenant();
  if (!currentTenant) {
    return {
      success: false,
      error: 'auth_error',
      message: 'No authenticated tenant available'
    };
  }

  let response: Response;
  try {
    response = await fetchFn(catalogEndpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
  } catch {
    return {
      success: false,
      error: 'network_error',
      message: 'Network request failed'
    };
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) {
      return {
        success: false,
        error: 'auth_error',
        message: 'Authentication failed'
      };
    }
    return {
      success: false,
      error: 'network_error',
      message: 'Server error'
    };
  }

  let rawData: unknown;
  try {
    rawData = await response.json();
  } catch {
    return {
      success: false,
      error: 'validation_error',
      message: 'Invalid response format'
    };
  }

  let validatedCatalog: OfflineCatalogSnapshot;
  try {
    validatedCatalog = OfflineCatalogSnapshotSchema.parse(rawData);
  } catch {
    return {
      success: false,
      error: 'validation_error',
      message: 'Response failed schema validation'
    };
  }

  if (validatedCatalog.tenantId !== currentTenant) {
    return {
      success: false,
      error: 'tenant_mismatch',
      message: 'Tenant mismatch'
    };
  }

  try {
    await outboxDB.saveCatalogSnapshot(validatedCatalog);
  } catch {
    return {
      success: false,
      error: 'persistence_error',
      message: 'Failed to persist catalog snapshot'
    };
  }

  return {
    success: true,
    catalogVersion: validatedCatalog.catalogVersion,
    syncedAt: validatedCatalog.syncedAt,
    tenantId: validatedCatalog.tenantId
  };
}

export function createCatalogHydrator(
  customFetch?: CatalogHydratorFetch,
  customOutboxDB?: OrderSnapOutboxDB,
  customGetCurrentTenant?: () => string | null,
  customCatalogEndpoint?: string,
  customAuthToken?: string
): CatalogHydratorOptions {
  const baseUrl = process.env.NEXT_PUBLIC_ORDER_SNAP_API_BASE_URL || '/api/order-snap';
  const catalogEndpoint = customCatalogEndpoint ?? `${baseUrl}/catalog`;
  const authToken = customAuthToken ?? '';

  return {
    fetchFn: customFetch ?? ((url: string, init?: RequestInit) => fetch(url, init)),
    outboxDB: customOutboxDB ?? getOrderSnapOutboxDB(),
    getCurrentTenant: customGetCurrentTenant ?? (() => null),
    catalogEndpoint,
    authToken
  };
}