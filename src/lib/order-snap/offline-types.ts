/**
 * Order Snap Offline-First Architecture Types & State Machine
 *
 * Enforces Katuwang Solutions offline-first standards:
 * - Fail-closed lifecycle state machine
 * - Tenant-safe partitioning
 * - Cashier-safe operational catalog caching (zero COGS/margin exposure)
 * - Same-device projected reservations with conflict blocking
 * - Authoritative lease coordination
 * - Asymmetric authority certificates (ECDSA P-256 / SHA-256)
 * - Strict WebAuthn credential binding for offline unlock
 */

import { z } from 'zod';
import {
  OrderIngestionRequest,
  OrderIngestionRequestSchema
} from './order-ingestion';
import {
  RedactedOrFullResult,
  OrderSnapErrorCode
} from '../server/order-snap-finalizer';

export const ORDER_SNAP_OUTBOX_DB_NAME = 'katuwang_ordersnap_outbox' as const;
export const ORDER_SNAP_OUTBOX_DB_VERSION = 2;
export const ORDER_SNAP_GRANT_KEY_ID_V1 = 'v1' as const;
export const ORDER_SNAP_GRANT_KEY_ID_V2 = 'v2' as const; // For asymmetric certificate
export const MAX_ORDER_SNAP_OFFLINE_GRANT_LIFETIME_SECONDS = 12 * 60 * 60; // 12 hours max offline lifetime
export const ORDER_SNAP_ALLOWED_TENDERS = ['cash'] as const;
export const ORDER_SNAP_AUTHORIZED_MODULE_IDS = ['order-snap', 'timpla-track', 'bite-snap'] as const;

// ---------------------------------------------------------------------------
// 1. LIFECYCLE STATES & VALIDATION
// ---------------------------------------------------------------------------

export const ORDER_OUTBOX_STATES = [
  'draft',
  'pending_sync',
  'syncing',
  'confirmed',
  'retryable_failure',
  'conflict',
  'permanently_rejected'
] as const;

export type OrderOutboxSyncState = (typeof ORDER_OUTBOX_STATES)[number];

const VALID_TRANSITIONS: Record<OrderOutboxSyncState, readonly OrderOutboxSyncState[]> = {
  draft: ['pending_sync', 'permanently_rejected'],
  pending_sync: ['syncing', 'permanently_rejected'],
  syncing: ['confirmed', 'retryable_failure', 'conflict', 'permanently_rejected', 'pending_sync'],
  retryable_failure: ['syncing', 'permanently_rejected', 'pending_sync'],
  conflict: ['permanently_rejected', 'pending_sync'], // Owner can resolve/retry or cancel
  confirmed: [], // Terminal
  permanently_rejected: [] // Terminal
};

export function isValidStateTransition(
  currentState: OrderOutboxSyncState,
  nextState: OrderOutboxSyncState
): boolean {
  if (currentState === nextState) return true;
  const allowed = VALID_TRANSITIONS[currentState];
  return allowed ? allowed.includes(nextState) : false;
}

// ---------------------------------------------------------------------------
// 2. CASHIER-SAFE OFFLINE CATALOG CONTRACTS
// ---------------------------------------------------------------------------

export interface OperationalIngredientConsumption {
  readonly ingredientId: string;
  readonly quantityMinorDelta: number; // positive consumption magnitude in minor units
  readonly unit: string;
}

export interface OfflineRecipeComponent {
  readonly ingredientId: string;
  readonly quantityMinor: number;
  readonly unit: string;
}

export interface OfflineRecipeVersion {
  readonly recipeVersionId: string;
  readonly menuItemId: string;
  readonly versionNumber: number;
  readonly isActive: boolean;
  readonly components: ReadonlyArray<OfflineRecipeComponent>;
}

export interface OfflineMenuItem {
  readonly menuItemId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly category: string;
  readonly basePriceCentavos: number;
  readonly activeRecipeVersionId: string;
  readonly isActive: boolean;
  readonly modifierGroupIds?: ReadonlyArray<string>;
}

export interface OfflineModifierOption {
  readonly optionId: string;
  readonly name: string;
  readonly priceDeltaCentavos: number;
  readonly ingredientDeltas?: ReadonlyArray<OperationalIngredientConsumption>;
}

export interface OfflineModifierGroup {
  readonly modifierGroupId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly minSelections: number;
  readonly maxSelections: number;
  readonly isRequired: boolean;
  readonly options: ReadonlyArray<OfflineModifierOption>;
}

export interface OfflineIngredientStock {
  readonly ingredientId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly unit: string;
  readonly stockQuantityMinor: number;
  readonly isActive: boolean;
}

export interface OfflineCatalogSnapshot {
  readonly tenantId: string;
  readonly catalogVersion: string;
  readonly syncedAt: string;
  readonly menuItems: ReadonlyArray<OfflineMenuItem>;
  readonly recipes: ReadonlyArray<OfflineRecipeVersion>;
  readonly modifierGroups: ReadonlyArray<OfflineModifierGroup>;
  readonly ingredients: ReadonlyArray<OfflineIngredientStock>;
}

// ---------------------------------------------------------------------------
// 3. INGREDIENT RESERVATION CONTRACTS
// ---------------------------------------------------------------------------

export const RESERVATION_STATUSES = ['active', 'committed', 'blocked', 'released'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export interface ProjectedIngredientReservation {
  readonly reservationId: string;
  readonly tenantId: string;
  readonly orderId: string;
  readonly ingredientId: string;
  readonly reservedQuantityMinor: number;
  readonly unit: string;
  readonly createdAt: string;
  status: ReservationStatus;
}

// ---------------------------------------------------------------------------
// 4. OUTBOX ENTRY & RECEIPT CONTRACTS
// ---------------------------------------------------------------------------

export interface ProvisionalReceiptLine {
  readonly menuItemId: string;
  readonly menuItemName: string;
  readonly quantity: number;
  readonly unitPriceCentavos: number;
  readonly lineTotalCentavos: number;
  readonly selectedModifiers: ReadonlyArray<{
    readonly modifierOptionId: string;
    readonly modifierOptionName: string;
    readonly priceDeltaCentavos: number;
  }>;
}

export interface ProvisionalOrderReceipt {
  readonly provisionalReceiptNumber: string;
  readonly isProvisional: true;
  readonly orderId: string;
  readonly tenantId: string;
  readonly deviceId: string;
  readonly localSequence: number;
  readonly cashierDisplayName?: string;
  readonly items: ReadonlyArray<ProvisionalReceiptLine>;
  readonly subtotalCentavos: number;
  readonly totalRevenueCentavos: number;
  readonly cashTenderedCentavos: number;
  readonly changeCentavos: number;
  readonly paymentMethod: 'cash';
  readonly clientCreatedAt: string;
  readonly status: 'pending_sync';
}

export interface OrderSnapPublicProvisionalReceipt {
  readonly provisionalReceiptNumber: string;
  readonly isProvisional: true;
  readonly orderId: string;
  readonly items: ReadonlyArray<ProvisionalReceiptLine>;
  readonly subtotalCentavos: number;
  readonly totalRevenueCentavos: number;
  readonly cashTenderedCentavos: number;
  readonly changeCentavos: number;
  readonly paymentMethod: 'cash';
  readonly clientCreatedAt: string;
  readonly status: 'pending_sync';
}

export interface ConflictDiagnosticRecord {
  readonly occurredAt: string;
  readonly errorCode: OrderSnapErrorCode | string;
  readonly errorMessage: string;
  readonly conflictReason: string;
  readonly attemptedByActorId: string;
  readonly originalRequest: OrderIngestionRequest;
}

export interface OrderSnapOutboxEntry {
  readonly orderId: string;
  readonly idempotencyKey: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly staffAccountId: string;
  readonly actorRole: 'cashier' | 'owner';
  readonly deviceId: string;
  readonly localSequence: number;
  readonly request: OrderIngestionRequest;
  readonly paymentMethod: 'cash';
  readonly cashTenderedCentavos: number;
  readonly clientCreatedAt: string;
  readonly provisionalReceiptNumber: string;
  readonly grant: OrderSnapAuthorityGrant; // Immutable server-issued authority grant bound to this order

  syncState: OrderOutboxSyncState;
  attemptCount: number;
  lastAttemptAt?: string;
  conflictDiagnostic?: ConflictDiagnosticRecord;

  // Authoritative server confirmation
  serverResult?: RedactedOrFullResult;
  serverSaleId?: string;
  serverSnapshotId?: string;
  serverCommittedAt?: string;
}

// ---------------------------------------------------------------------------
// 5. OFFLINE AUTHORITY & BOOTSTRAP CONTRACTS
// ---------------------------------------------------------------------------

// Legacy HMAC grant (version v1)
export interface OrderSnapAuthorityHmacGrantPayload {
  readonly grantId: string;
  readonly moduleId: 'order-snap' | 'timpla-track' | 'bite-snap';
  readonly tenantId: string;
  readonly staffAccountId: string;
  readonly actorId: string;
  readonly authUid: string;
  readonly sessionVersion: number;
  readonly role: 'cashier' | 'owner';
  readonly displayName: string;
  readonly deviceId: string;
  readonly catalogVersion: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly allowedTenders: readonly ['cash'];
}

export interface OrderSnapAuthorityHmacGrant {
  readonly payload: OrderSnapAuthorityHmacGrantPayload;
  readonly signature: string; // 64 hex characters (HMAC-SHA256)
  readonly keyId: string;
  readonly algorithm?: 'HS256';
}

export type OrderSnapAuthorityGrantPayload = OrderSnapAuthorityHmacGrantPayload;

// Asymmetric Authority Certificate (version 2)
export interface OrderSnapAuthorityCertificatePayload {
  readonly version: 2;
  readonly algorithm: 'ES256';
  readonly keyId: string; // e.g. "v2"
  readonly grantId: string;
  readonly moduleId: 'order-snap' | 'timpla-track' | 'bite-snap';
  readonly tenantId: string;
  readonly staffAccountId: string;
  readonly actorId: string;
  readonly authUid: string;
  readonly role: 'cashier' | 'owner';
  readonly displayName: string;
  readonly sessionVersion: number;
  readonly deviceId: string;
  readonly catalogVersion: string;
  readonly allowedTenders: readonly ['cash'];
  readonly issuedAt: number;
  readonly expiresAt: number;
  // Strict WebAuthn bindings
  readonly credentialIdFingerprint: string; // SHA-256 of raw credential ID (64 hex characters)
  readonly credentialPublicKeyFingerprint: string; // SHA-256 of SPKI public key (64 hex characters)
  readonly rpId: string;
  readonly expectedOrigin: string;
  readonly requireUserPresence: boolean;
  readonly requireUserVerification: boolean;
}

export interface OrderSnapAuthorityCertificate {
  readonly payload: OrderSnapAuthorityCertificatePayload;
  readonly signature: string; // Exactly 128 hex characters (ECDSA P-256 IEEE-P1363 raw 64-byte r || s)
  readonly keyId: string; // e.g. "v2"
  readonly algorithm: 'ES256';
}

// Discriminated / Union type for grants
export type OrderSnapAuthorityGrant =
  | OrderSnapAuthorityCertificate
  | OrderSnapAuthorityHmacGrant;

export function isAuthorityCertificate(grant: any): grant is OrderSnapAuthorityCertificate {
  return (
    grant !== null &&
    typeof grant === 'object' &&
    'payload' in grant &&
    'signature' in grant &&
    'keyId' in grant &&
    grant.payload !== null &&
    typeof grant.payload === 'object' &&
    grant.payload.version === 2
  );
}

// WebAuthn credential stored locally after online provisioning
export interface OrderSnapWebAuthnCredential {
  readonly credentialId: string; // base64url encoded credential ID
  readonly publicKeySpki: string; // base64 encoded SPKI public key
  readonly rpId: string; // RP ID for this credential
  readonly counter?: number; // Last verified sign counter
}

export interface OrderSnapPersistedAuthority {
  readonly tenantId: string;
  readonly staffAccountId: string;
  readonly deviceId: string;
  readonly grant: OrderSnapAuthorityGrant;
  readonly catalogVersion: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly isLocalLocked: boolean;
  readonly updatedAt: number;
  readonly webAuthnCredential?: OrderSnapWebAuthnCredential;
}

// ---------------------------------------------------------------------------
// 6. LEASE LOCK & META STATE CONTRACTS
// ---------------------------------------------------------------------------

export interface SyncLeaseRecord {
  readonly tenantId: string;
  readonly deviceId: string;
  readonly leaseToken: string;
  readonly acquiredAt: number; // ms
  readonly expiresAt: number;  // ms
}

export interface DeviceMetaRecord {
  readonly key: string;
  readonly value: any;
  readonly updatedAt: number;
}

// ---------------------------------------------------------------------------
// 7. SCHEMAS FOR RUNTIME CORRUPTION VALIDATION
// ---------------------------------------------------------------------------

export const OfflineCatalogSnapshotSchema = z.object({
  tenantId: z.string().min(1),
  catalogVersion: z.string().min(1),
  syncedAt: z.string().min(1),
  menuItems: z.array(
    z.object({
      menuItemId: z.string().min(1),
      tenantId: z.string().min(1),
      name: z.string().min(1),
      category: z.string().min(1),
      basePriceCentavos: z.number().int().nonnegative(),
      activeRecipeVersionId: z.string().min(1),
      isActive: z.boolean(),
      modifierGroupIds: z.array(z.string()).optional()
    })
  ),
  recipes: z.array(
    z.object({
      recipeVersionId: z.string().min(1),
      menuItemId: z.string().min(1),
      versionNumber: z.number().int().positive(),
      isActive: z.boolean(),
      components: z.array(
        z.object({
          ingredientId: z.string().min(1),
          quantityMinor: z.number().int().positive(),
          unit: z.string().min(1)
        })
      )
    })
  ),
  modifierGroups: z.array(
    z.object({
      modifierGroupId: z.string().min(1),
      tenantId: z.string().min(1),
      name: z.string().min(1),
      minSelections: z.number().int().nonnegative(),
      maxSelections: z.number().int().positive(),
      isRequired: z.boolean(),
      options: z.array(
        z.object({
          optionId: z.string().min(1),
          name: z.string().min(1),
          priceDeltaCentavos: z.number().int(),
          ingredientDeltas: z
            .array(
              z.object({
                ingredientId: z.string().min(1),
                quantityMinorDelta: z.number().int().positive(),
                unit: z.string().min(1)
              })
            )
            .optional()
        })
      )
    })
  ),
  ingredients: z.array(
    z.object({
      ingredientId: z.string().min(1),
      tenantId: z.string().min(1),
      name: z.string().min(1),
      unit: z.string().min(1),
      stockQuantityMinor: z.number().int().nonnegative(),
      isActive: z.boolean()
    })
  )
});

export const OrderSnapAuthorityHmacGrantPayloadSchema = z
  .object({
    grantId: z.string().min(1),
    moduleId: z.enum(ORDER_SNAP_AUTHORIZED_MODULE_IDS),
    tenantId: z.string().min(1),
    staffAccountId: z.string().min(1),
    actorId: z.string().min(1),
    authUid: z.string().min(1),
    sessionVersion: z.number().int().nonnegative(),
    role: z.enum(['cashier', 'owner']),
    displayName: z.string().min(1),
    deviceId: z.string().min(1),
    catalogVersion: z.string().min(1),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    allowedTenders: z.tuple([z.literal('cash')])
  })
  .strict()
  .refine((data) => data.expiresAt > data.issuedAt, {
    message: 'expiresAt must be strictly greater than issuedAt',
    path: ['expiresAt']
  })
  .refine(
    (data) => data.expiresAt - data.issuedAt <= MAX_ORDER_SNAP_OFFLINE_GRANT_LIFETIME_SECONDS,
    {
      message: `Offline grant lifetime exceeds maximum allowed (${MAX_ORDER_SNAP_OFFLINE_GRANT_LIFETIME_SECONDS} seconds)`,
      path: ['expiresAt']
    }
  )
  .refine(
    (data) => {
      if (data.role === 'owner') {
        return (
          data.staffAccountId === `owner_${data.authUid}` &&
          data.actorId === `owner_${data.authUid}`
        );
      }
      if (data.role === 'cashier') {
        return data.actorId === `staff_${data.staffAccountId}`;
      }
      return false;
    },
    {
      message: 'Actor ID and staff account ID must match canonical role format',
      path: ['actorId']
    }
  );

export const OrderSnapAuthorityHmacGrantSchema = z
  .object({
    payload: OrderSnapAuthorityHmacGrantPayloadSchema,
    signature: z
      .string()
      .regex(/^[0-9a-f]{64}$/i, 'Signature must be exactly 64 hexadecimal characters (HMAC-SHA256)'),
    keyId: z.literal(ORDER_SNAP_GRANT_KEY_ID_V1)
  })
  .strict();

export const OrderSnapAuthorityCertificatePayloadSchema = z
  .object({
    version: z.literal(2),
    algorithm: z.literal('ES256'),
    keyId: z.string().min(1),
    grantId: z.string().min(1),
    moduleId: z.enum(ORDER_SNAP_AUTHORIZED_MODULE_IDS),
    tenantId: z.string().min(1),
    staffAccountId: z.string().min(1),
    actorId: z.string().min(1),
    authUid: z.string().min(1),
    role: z.enum(['cashier', 'owner']),
    displayName: z.string().min(1),
    sessionVersion: z.number().int().nonnegative(),
    deviceId: z.string().min(1),
    catalogVersion: z.string().min(1),
    allowedTenders: z.tuple([z.literal('cash')]),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    credentialIdFingerprint: z.string().regex(/^[0-9a-f]{64}$/i, 'Must be 64 hex characters (SHA-256)'),
    credentialPublicKeyFingerprint: z.string().regex(/^[0-9a-f]{64}$/i, 'Must be 64 hex characters (SHA-256)'),
    rpId: z.string().min(1),
    expectedOrigin: z.string().min(1),
    requireUserPresence: z.boolean(),
    requireUserVerification: z.boolean()
  })
  .strict()
  .refine((data) => data.expiresAt > data.issuedAt, {
    message: 'expiresAt must be strictly greater than issuedAt',
    path: ['expiresAt']
  })
  .refine(
    (data) => data.expiresAt - data.issuedAt <= MAX_ORDER_SNAP_OFFLINE_GRANT_LIFETIME_SECONDS,
    {
      message: `Offline certificate lifetime exceeds maximum allowed (${MAX_ORDER_SNAP_OFFLINE_GRANT_LIFETIME_SECONDS} seconds)`,
      path: ['expiresAt']
    }
  )
  .refine(
    (data) => {
      if (data.role === 'owner') {
        return (
          data.staffAccountId === `owner_${data.authUid}` &&
          data.actorId === `owner_${data.authUid}`
        );
      }
      if (data.role === 'cashier') {
        return data.actorId === `staff_${data.staffAccountId}`;
      }
      return false;
    },
    {
      message: 'Actor ID and staff account ID must match canonical role format',
      path: ['actorId']
    }
  );

export const OrderSnapAuthorityCertificateSchema = z
  .object({
    payload: OrderSnapAuthorityCertificatePayloadSchema,
    signature: z
      .string()
      .regex(/^[0-9a-f]{128}$/i, 'Signature must be exactly 128 hexadecimal characters (ECDSA P-256 IEEE-P1363)'),
    keyId: z.string().min(1),
    algorithm: z.literal('ES256')
  })
  .strict()
  .refine((data) => data.keyId === data.payload.keyId, {
    message: 'Envelope keyId must match payload keyId',
    path: ['keyId']
  })
  .refine((data) => data.algorithm === data.payload.algorithm, {
    message: 'Envelope algorithm must match payload algorithm',
    path: ['algorithm']
  });

// Union schema for grants
export const OrderSnapAuthorityGrantSchema = z.union([
  OrderSnapAuthorityCertificateSchema,
  OrderSnapAuthorityHmacGrantSchema
]);

export const OrderSnapOutboxEntrySchema = z
  .object({
    orderId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    tenantId: z.string().min(1),
    actorId: z.string().min(1),
    staffAccountId: z.string().min(1),
    actorRole: z.enum(['cashier', 'owner']),
    deviceId: z.string().min(1),
    localSequence: z.number().int().positive(),
    request: OrderIngestionRequestSchema,
    paymentMethod: z.literal('cash'),
    cashTenderedCentavos: z.number().int().nonnegative(),
    clientCreatedAt: z.string().min(1),
    provisionalReceiptNumber: z.string().min(1),
    grant: OrderSnapAuthorityGrantSchema,
    syncState: z.enum(ORDER_OUTBOX_STATES),
    attemptCount: z.number().int().nonnegative(),
    lastAttemptAt: z.string().optional(),
    conflictDiagnostic: z
      .object({
        occurredAt: z.string(),
        errorCode: z.string(),
        errorMessage: z.string(),
        conflictReason: z.string(),
        attemptedByActorId: z.string(),
        originalRequest: OrderIngestionRequestSchema
      })
      .optional(),
    serverResult: z.any().optional(),
    serverSaleId: z.string().optional(),
    serverSnapshotId: z.string().optional(),
    serverCommittedAt: z.string().optional()
  })
  .strict()
  .refine(
    (data) => {
      const g = data.grant;
      if (g && typeof g === 'object' && 'payload' in g) {
        const payload = g.payload;
        return (
          payload.tenantId === data.tenantId &&
          payload.staffAccountId === data.staffAccountId &&
          payload.actorId === data.actorId &&
          payload.role === data.actorRole &&
          payload.deviceId === data.deviceId &&
          payload.tenantId === data.request.tenantId &&
          payload.staffAccountId === data.request.staffAccountId
        );
      }
      return false;
    },
    {
      message: 'Authority grant bindings do not match outbox entry identity fields',
      path: ['grant']
    }
  );

export const ProjectedIngredientReservationSchema = z.object({
  reservationId: z.string().min(1),
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  ingredientId: z.string().min(1),
  reservedQuantityMinor: z.number().int().positive(),
  unit: z.string().min(1),
  createdAt: z.string().min(1),
  status: z.enum(RESERVATION_STATUSES)
});

export const OrderSnapWebAuthnCredentialSchema = z
  .object({
    credentialId: z.string().min(1),
    publicKeySpki: z.string().min(1),
    rpId: z.string().min(1),
    counter: z.number().int().nonnegative().optional()
  })
  .strict();

export const OrderSnapPersistedAuthoritySchema = z
  .object({
    tenantId: z.string().min(1),
    staffAccountId: z.string().min(1),
    deviceId: z.string().min(1),
    grant: OrderSnapAuthorityGrantSchema,
    catalogVersion: z.string().min(1),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    isLocalLocked: z.boolean(),
    updatedAt: z.number().int().positive(),
    webAuthnCredential: OrderSnapWebAuthnCredentialSchema.optional()
  })
  .strict()
  .refine(
    (data) => {
      const g = data.grant;
      if (g && typeof g === 'object' && 'payload' in g) {
        const payload = g.payload;
        return (
          data.tenantId === payload.tenantId &&
          data.staffAccountId === payload.staffAccountId &&
          data.deviceId === payload.deviceId &&
          data.catalogVersion === payload.catalogVersion &&
          data.issuedAt === payload.issuedAt &&
          data.expiresAt === payload.expiresAt
        );
      }
      return false;
    },
    {
      message: 'Persisted authority top-level fields must strictly match signed grant payload',
      path: ['grant']
    }
  )
  .refine((data) => data.expiresAt > data.issuedAt, {
    message: 'expiresAt must be strictly greater than issuedAt',
    path: ['expiresAt']
  })
  .refine(
    (data) => data.expiresAt - data.issuedAt <= MAX_ORDER_SNAP_OFFLINE_GRANT_LIFETIME_SECONDS,
    {
      message: `Persisted authority lifetime exceeds maximum allowed (${MAX_ORDER_SNAP_OFFLINE_GRANT_LIFETIME_SECONDS} seconds)`,
      path: ['expiresAt']
    }
  );

// ---------------------------------------------------------------------------
// 8. TYPED ORDER-LIFECYCLE RECONCILIATION
// ---------------------------------------------------------------------------

/**
 * Public lifecycle status union mapped deterministically from outbox states.
 * Deliberately small; raw outbox states are not exposed.
 */
export const ORDER_SNAP_LIFECYCLE_STATUSES = [
  'pending',
  'syncing',
  'retrying',
  'confirmed',
  'conflict',
  'rejected'
] as const;

export type OrderSnapLifecycleStatus = (typeof ORDER_SNAP_LIFECYCLE_STATUSES)[number];

/**
 * Maps an internal outbox sync state to the public lifecycle status.
 * Fail-closed: unknown states map to 'retrying' rather than leaking raw values.
 */
export function mapOutboxStateToLifecycleStatus(
  state: OrderOutboxSyncState
): OrderSnapLifecycleStatus {
  switch (state) {
    case 'draft':
      return 'pending';
    case 'pending_sync':
      return 'pending';
    case 'syncing':
      return 'syncing';
    case 'retryable_failure':
      return 'retrying';
    case 'confirmed':
      return 'confirmed';
    case 'conflict':
      return 'conflict';
    case 'permanently_rejected':
      return 'rejected';
    default:
      return 'retrying';
  }
}

/**
 * Sanitized public lifecycle record for a single order.
 * Deliberately excludes: authority grants, actor identity, staff account IDs,
 * tenant IDs, device IDs, raw request payloads, certificates, tokens,
 * signatures, public keys, and conflict diagnostics.
 */
export interface SanitizedOrderLifecycle {
  readonly orderId: string;
  readonly provisionalReceiptNumber: string;
  readonly status: OrderSnapLifecycleStatus;
  readonly serverSaleId?: string;
  readonly serverCommittedAt?: string;
}

/**
 * Deterministic projection from a controller-owned outbox entry to the
 * sanitized public lifecycle record. Returns a frozen object so callers
 * cannot mutate controller-owned lifecycle state.
 */
export function projectToSanitizedLifecycle(
  entry: OrderSnapOutboxEntry
): SanitizedOrderLifecycle {
  return Object.freeze({
    orderId: entry.orderId,
    provisionalReceiptNumber: entry.provisionalReceiptNumber,
    status: mapOutboxStateToLifecycleStatus(entry.syncState),
    ...(entry.serverSaleId ? { serverSaleId: entry.serverSaleId } : {}),
    ...(entry.serverCommittedAt ? { serverCommittedAt: entry.serverCommittedAt } : {})
  });
}

/**
 * Deterministic projection from the internal provisional receipt to the
 * public receipt that omits tenantId, deviceId, cashierDisplayName,
 * localSequence, and all authority/identity data.
 */
export function projectToPublicProvisionalReceipt(
  receipt: ProvisionalOrderReceipt
): OrderSnapPublicProvisionalReceipt {
  return Object.freeze({
    provisionalReceiptNumber: receipt.provisionalReceiptNumber,
    isProvisional: receipt.isProvisional,
    orderId: receipt.orderId,
    items: Object.freeze(
      receipt.items.map(line =>
        Object.freeze({
          menuItemId: line.menuItemId,
          menuItemName: line.menuItemName,
          quantity: line.quantity,
          unitPriceCentavos: line.unitPriceCentavos,
          lineTotalCentavos: line.lineTotalCentavos,
          selectedModifiers: Object.freeze(
            line.selectedModifiers.map(mod =>
              Object.freeze({
                modifierOptionId: mod.modifierOptionId,
                modifierOptionName: mod.modifierOptionName,
                priceDeltaCentavos: mod.priceDeltaCentavos
              })
            )
          )
        })
      )
    ),
    subtotalCentavos: receipt.subtotalCentavos,
    totalRevenueCentavos: receipt.totalRevenueCentavos,
    cashTenderedCentavos: receipt.cashTenderedCentavos,
    changeCentavos: receipt.changeCentavos,
    paymentMethod: receipt.paymentMethod,
    clientCreatedAt: receipt.clientCreatedAt,
    status: receipt.status
  });
}

/**
 * Typed public result of acceptOfflineOrder().
 * Exposes only the provisional receipt and a sanitized lifecycle record.
 * Does NOT expose the complete outbox entry, authority grant, actor identity,
 * request payload, certificate, token, signature, or conflict diagnostic.
 */
export interface OrderSnapCashCheckoutResult {
  readonly success: true;
  readonly provisionalReceipt: OrderSnapPublicProvisionalReceipt;
  readonly lifecycle: SanitizedOrderLifecycle;
}