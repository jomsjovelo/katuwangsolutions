/**
 * Secure Benta Cashier Offline-First Platform Types (Version 2.3.0)
 * Reusable, versioned TypeScript contracts for offline authorization grants,
 * catalog snapshots, append-only journal entries, and claims reconciliation.
 */

export const BENTA_SNAP_MODULE_ID = 'benta-snap' as const;
export const OFFLINE_GRANT_KEY_ID_V1 = 'v1' as const;
export const OFFLINE_JOURNAL_DB_NAME = 'katuwang_pos_journal_v1' as const;
export const OFFLINE_JOURNAL_DB_VERSION = 1;
export const MAX_SYNC_CLAIMS_PER_BATCH = 20;

// ---------------------------------------------------------------------------
// 1. OFFLINE AUTHORIZATION GRANT CONTRACTS
// ---------------------------------------------------------------------------

export interface OfflineAuthGrantPayload {
  grantId: string;                     // UUID v4
  tenantId: string;                    // Authoritative tenant ID
  staffAccountId: string;              // Staff account document ID
  authUid: string;                     // Deterministic cashier UID (cashier_<hash>)
  sessionVersion: number;              // Staff session version integer
  shiftId: string;                     // Active shift document ID
  installationId: string;              // Untrusted random correlation identifier (UUID v4)
  credentialIdHash?: string;           // SHA-256 of registered WebAuthn credential ID (hex)
  credentialPublicKeyHash?: string;    // SHA-256 of registered WebAuthn public key (hex)
  snapshotId: string;                  // Bound catalog snapshot identifier
  catalogDigest: string;               // SHA-256 digest of public client catalog items
  issuedAt: number;                    // Epoch seconds (Server clock)
  allowedTenders: ('cash')[];          // Initial scope: Cash only
}

export interface OfflineAuthGrant {
  payload: OfflineAuthGrantPayload;
  signature: string;                   // HMAC-SHA256 hex digest
  keyId: string;                       // e.g. "v1"
}

export interface OfflineGrantSigningKey {
  keyId: string;
  secret: string;
}

// ---------------------------------------------------------------------------
// 2. IMMUTABLE CATALOG SNAPSHOT CONTRACTS
// ---------------------------------------------------------------------------

/**
 * Public client-visible catalog snapshot item (strictly immutable, hides costPrice and stock).
 */
export interface ClientCatalogSnapshotItem {
  id: string;
  name: string;
  salePriceCentavos: number;
  unit: string;
  category: string;
  sku: string;
  barcode: string;
  isActive: boolean;
  quantityMode?: 'discrete' | 'measured';
  sellingUnit?: string;
  quantityScale?: number;
}

/**
 * Server-authoritative catalog snapshot item (preserves historical cost).
 */
export interface ServerCatalogSnapshotItem extends ClientCatalogSnapshotItem {
  costPriceCentavos: number;           // Server-only historical cost
}

export interface CatalogSnapshot {
  snapshotId: string;                  // `snap_${tenantId}_${timestamp}`
  tenantId: string;
  createdAt: string;                   // ISO string
  catalogDigest: string;               // SHA-256 hex digest over public client fields
  serverCatalogDigest: string;         // SHA-256 hex digest over all authoritative server fields including costPrice
  productCount: number;
  isChunked?: boolean;
  expectedChunkCount?: number;
  products: Record<string, ServerCatalogSnapshotItem>;
}

// ---------------------------------------------------------------------------
// 3. APPEND-ONLY DURABLE JOURNAL CONTRACTS (IndexedDB)
// ---------------------------------------------------------------------------

export type JournalEntryStatus =
  | 'pending_sync'      // Stored locally; awaiting network transmission
  | 'in_flight'         // Currently in-flight with the sync coordinator
  | 'accepted'          // Successfully committed to Firestore
  | 'accepted_variance' // Committed with inventory variance note
  | 'needs_review'      // Preserved on server in offline_claims under Owner review
  | 'rejected_tampered' // Rejected due to cryptographic or structural tampering
  | 'retryable_error';  // Transient failure; coordinator will retry with backoff

export interface JournalItemLine {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCentavos: number;
  lineTotalCentavos: number;
  unit?: string;
}

export interface JournalSaleEntry {
  entryId: string;                     // Random UUID v4
  kind?: 'sale';
  seqIndex: number;                    // Monotonically increasing local sequence integer
  idempotencyKey: string;              // Random UUID v4
  grantId: string;
  snapshotId: string;
  tenantId: string;
  staffAccountId: string;
  shiftId: string;
  clientTimestamp: string;             // ISO string claimed by device (audit-only)
  items: JournalItemLine[];
  subtotalCentavos: number;
  totalCentavos: number;
  paymentMethod: 'cash';
  cashTenderedCentavos: number;
  changeCentavos: number;
  provisionalReceiptNumber: string;    // `PROV-${shiftId.slice(-4)}-${seqIndex}`
  authoritativeReceiptNumber?: string;
  status: JournalEntryStatus;
  retryCount: number;
  lastError?: string;
  serverSaleId?: string;
  createdAtTimestamp: number;          // Local Date.now()
  syncedAtTimestamp?: number;
}

export interface JournalShiftCloseEntry {
  entryId: string;
  kind: 'shift_close';
  seqIndex: number;
  idempotencyKey: string;
  closeIdempotencyKey?: string;
  grantId: string;
  snapshotId: string;
  tenantId: string;
  staffAccountId: string;
  shiftId: string;
  clientTimestamp: string;
  endingCashCentavos: number;
  notes?: string;
  status: JournalEntryStatus;
  retryCount: number;
  lastError?: string;
  createdAtTimestamp: number;
  syncedAtTimestamp?: number;
}

export type JournalEntry = JournalSaleEntry | JournalShiftCloseEntry;

export interface ReceiptMappingRecord {
  provisionalReceiptNumber: string;
  serverSaleId: string;
  authoritativeReceiptNumber: string;
  tenantId: string;
  shiftId: string;
  reconciledAtTimestamp: number;
}

export interface JournalMetaState {
  key: string;
  value: unknown;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// 4. OFFLINE CLAIM & RECONCILIATION CONTRACTS
// ---------------------------------------------------------------------------

export interface OfflineClaimItem {
  productId: string;
  quantity: number;
  unitPriceCentavos: number;
}

export interface OfflineClaimPayload {
  entryId: string;
  seqIndex: number;
  idempotencyKey: string;
  clientTimestamp: string;
  items: OfflineClaimItem[];
  paymentMethod: 'cash';
  cashTenderedCentavos: number;
  totalCentavos: number;
}

export interface OfflineClaimSyncRequest {
  grant: OfflineAuthGrant;
  claims: OfflineClaimPayload[];
}

export type ClaimReconciliationOutcome =
  | 'accepted'
  | 'accepted_with_inventory_variance'
  | 'needs_review'
  | 'rejected_tampered'
  | 'retryable';

export interface OfflineClaimSyncResult {
  entryId: string;
  idempotencyKey: string;
  status: ClaimReconciliationOutcome;
  saleId?: string;
  receiptNumber?: string;
  varianceDetails?: string;
  reconciliationNotes?: string;
  error?: string;
}

export interface OfflineClaimSyncResponse {
  syncedCount: number;
  results: OfflineClaimSyncResult[];
  shiftSummary: {
    confirmedCashSalesCentavos: number;
    confirmedSaleCount: number;
    pendingOfflineSaleCount: number;
  };
}

// ---------------------------------------------------------------------------
// 5. SHARED IDEMPOTENCY & SERVER FIRESTORE DOCUMENT SCHEMAS
// ---------------------------------------------------------------------------

export interface SharedCheckoutReceipt {
  saleId: string;
  receiptNumber: string;
  committedAt: string;
  moduleId: typeof BENTA_SNAP_MODULE_ID;
  paymentMethod: 'cash' | 'gcash' | 'maya';
  shiftId: string;
  cashierDisplayName: string;
  items: Array<{
    productId: string;
    name: string;
    unit: string;
    quantity: number;
    unitPriceCentavos: number;
    lineTotalCentavos: number;
  }>;
  subtotalCentavos: number;
  totalCentavos: number;
}

export interface CashierCheckoutIdempotencyDoc {
  status: 'complete';
  fingerprint: string;
  saleId: string;
  receipt: SharedCheckoutReceipt;
  reconciliationOutcome?: 'accepted' | 'accepted_with_inventory_variance';
  completedAt: unknown;                // Firestore Timestamp
  expiresAt: unknown;                  // Firestore Timestamp
}

export type ServerOfflineGrantStatus = 'active' | 'revoked' | 'exhausted' | 'expired';

export interface ServerOfflineGrantDoc {
  grantId: string;
  tenantId: string;
  staffAccountId: string;
  authUid: string;
  sessionVersion: number;
  shiftId: string;
  snapshotId: string;
  catalogDigest: string;
  serverCatalogDigest?: string;
  allowedTenders: ('cash')[];
  status: ServerOfflineGrantStatus;
  issuedAt: unknown;                   // Firestore Timestamp
  createdAt: unknown;                  // Firestore Timestamp
  updatedAt?: unknown;                 // Firestore Timestamp
}

export interface ServerOfflineClaimDoc {
  claimId: string;                     // SHA-256 fingerprint of grantId:shiftId:idempotencyKey
  grantId: string;
  shiftId: string;
  tenantId: string;
  staffAccountId: string;
  authUid: string;
  sessionVersion: number;
  idempotencyKey: string;
  fingerprint: string;                 // Canonical checkout payload fingerprint
  seqIndex: number;
  clientTimestamp: string;
  items: OfflineClaimItem[];
  paymentMethod: 'cash';
  totalCentavos: number;
  status: ClaimReconciliationOutcome;
  saleId?: string;
  receiptNumber?: string;
  reconciliationNotes?: string;
  syncedAt: unknown;                   // Firestore serverTimestamp
  createdAt: unknown;                  // Firestore serverTimestamp
}
