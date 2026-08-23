import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  OfflineClaimSyncRequest,
  OfflineClaimSyncResponse,
  OfflineClaimSyncResult,
  ClaimReconciliationOutcome,
  SharedCheckoutReceipt,
  CashierCheckoutIdempotencyDoc,
  ServerOfflineClaimDoc,
  MAX_SYNC_CLAIMS_PER_BATCH
} from '@/lib/offline/offline-types';
import { getOfflineGrantSigner, OfflineGrantSigner } from './offline-grant-signer';
import { getCatalogSnapshotService, CatalogSnapshotService } from './catalog-snapshot-service';
import {
  assertBentaCashierAuthorization,
  BENTA_SNAP_MODULE_ID,
  CheckoutError,
  CheckoutErrorCode,
  isPlainRecord,
  sanitizedErrorResponse,
  SERVER_IDENTIFIER,
  verifyBentaCashierIdentity
} from './cashier-server-authorization';
import { applySaleToShift, assertReconciliationShift } from './benta-cashier-shift-receipt';
import {
  checkoutFingerprint,
  checkoutIdempotencyDocumentId
} from './benta-cashier-checkout';
import { recordTenantAuditEvent } from './audit-events';
import { isSecureCashierOfflineEnabled, isSecureCashierSystemEnabled } from './secure-cashier-config';

export function claimDocFingerprintId(grantId: string, shiftId: string, idempotencyKey: string): string {
  return createHash('sha256').update(`claim:${grantId}:${shiftId}:${idempotencyKey}`, 'utf8').digest('hex');
}

export function offlineClaimFingerprint(
  staffAccountId: string,
  shiftId: string,
  items: Array<{ productId: string; quantity: number }>,
  paymentMethod: string = 'cash',
  paymentReference: string = ''
): string {
  return checkoutFingerprint(staffAccountId, {
    moduleId: BENTA_SNAP_MODULE_ID,
    shiftId,
    items,
    paymentMethod,
    paymentReference
  });
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) throw new CheckoutError(CheckoutErrorCode.PRODUCT_UNAVAILABLE);
  return result;
}

function safeMultiply(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 0) throw new CheckoutError(CheckoutErrorCode.PRODUCT_UNAVAILABLE);
  return result;
}

export interface SyncClaimsHandlerOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  grantSigner?: OfflineGrantSigner;
  snapshotService?: CatalogSnapshotService;
  now?: () => admin.firestore.Timestamp;
  env?: Record<string, string | undefined>;
}

export async function handleBentaSyncClaims(
  idToken: string,
  requestBody: unknown,
  options: SyncClaimsHandlerOptions = {}
): Promise<{ status: number; body: OfflineClaimSyncResponse | { error: string } }> {
  const env = options.env || process.env;

  // 1. Feature Gate Enforcement
  if (!isSecureCashierSystemEnabled(env) || !isSecureCashierOfflineEnabled(env)) {
    return {
      status: 503,
      body: { error: 'Offline synchronization service is not enabled.' }
    };
  }

  // 2. ID-Token Authentication
  const auth = options.adminAuth || getAdminAuth();
  let identity;
  try {
    identity = await verifyBentaCashierIdentity(idToken, auth);
  } catch {
    return {
      status: 401,
      body: { error: 'Unauthorized cashier identity.' }
    };
  }

  // 3. Request Structural Validation
  const req = requestBody as Partial<OfflineClaimSyncRequest>;
  if (!req || typeof req !== 'object' || !req.grant || !Array.isArray(req.claims)) {
    return {
      status: 400,
      body: { error: 'Invalid sync request payload.' }
    };
  }

  if (req.claims.length === 0) {
    return {
      status: 200,
      body: {
        syncedCount: 0,
        results: [],
        shiftSummary: { confirmedCashSalesCentavos: 0, confirmedSaleCount: 0, pendingOfflineSaleCount: 0 }
      }
    };
  }

  if (req.claims.length > MAX_SYNC_CLAIMS_PER_BATCH) {
    return {
      status: 400,
      body: { error: `Batch limit exceeded. Maximum ${MAX_SYNC_CLAIMS_PER_BATCH} claims per request.` }
    };
  }

  const claims = req.claims;
  const db = options.adminFirestore || getAdminFirestore();
  const tenantRef = db.collection('tenants').doc(identity.tenantId);
  const nowTimestamp = (options.now || admin.firestore.Timestamp.now)();
  const serverArrivalEpoch = Math.floor(nowTimestamp.toMillis() / 1000);

  // 4. Grant Cryptographic Signature Verification
  const signer = options.grantSigner || getOfflineGrantSigner();
  const grantVerification = signer.verifyGrant(req.grant);

  if (!grantVerification.isValid || !grantVerification.grant) {
    const rejectedResults: OfflineClaimSyncResult[] = [];

    await db.runTransaction(async (transaction) => {
      recordTenantAuditEvent(transaction, tenantRef, {
        tenantId: identity.tenantId,
        type: 'security_anomaly',
        action: 'rejected_tampered',
        actorId: identity.actorId,
        staffAccountId: identity.staffAccountId,
        securityDetails: `Invalid grant cryptographic signature: ${grantVerification.error || 'signature_mismatch'}`
      }, nowTimestamp);

      for (const c of claims) {
        const rawKey = isPlainRecord(c) && typeof c.idempotencyKey === 'string' ? c.idempotencyKey : 'unknown';
        const rawEntryId = isPlainRecord(c) && typeof c.entryId === 'string' ? c.entryId : 'unknown';
        const claimDocId = claimDocFingerprintId('invalid_grant', identity.staffAccountId, rawKey);
        const claimRef = tenantRef.collection('offline_claims').doc(claimDocId);

        transaction.set(claimRef, {
          claimId: claimDocId,
          grantId: 'invalid',
          shiftId: 'unknown',
          tenantId: identity.tenantId,
          staffAccountId: identity.staffAccountId,
          authUid: identity.uid,
          sessionVersion: identity.sessionVersion,
          idempotencyKey: rawKey,
          fingerprint: 'invalid_grant',
          seqIndex: isPlainRecord(c) && typeof c.seqIndex === 'number' ? c.seqIndex : 0,
          clientTimestamp: isPlainRecord(c) && typeof c.clientTimestamp === 'string' ? c.clientTimestamp : '',
          items: isPlainRecord(c) && Array.isArray(c.items) ? c.items : [],
          paymentMethod: 'cash',
          totalCentavos: isPlainRecord(c) && typeof c.totalCentavos === 'number' ? c.totalCentavos : 0,
          status: 'rejected_tampered',
          reconciliationNotes: `Invalid cryptographic signature: ${grantVerification.error}`,
          syncedAt: nowTimestamp,
          createdAt: nowTimestamp
        });

        rejectedResults.push({
          entryId: rawEntryId,
          idempotencyKey: rawKey,
          status: 'rejected_tampered',
          error: 'Invalid grant cryptographic signature.'
        });
      }
    });

    return {
      status: 200,
      body: {
        syncedCount: 0,
        results: rejectedResults,
        shiftSummary: { confirmedCashSalesCentavos: 0, confirmedSaleCount: 0, pendingOfflineSaleCount: claims.length }
      }
    };
  }

  const grant = grantVerification.grant.payload;

  // 5. Grant Identity & Scope Verification
  if (
    grant.tenantId !== identity.tenantId ||
    grant.staffAccountId !== identity.staffAccountId ||
    grant.authUid !== identity.uid
  ) {
    const rejectedResults: OfflineClaimSyncResult[] = [];

    await db.runTransaction(async (transaction) => {
      recordTenantAuditEvent(transaction, tenantRef, {
        tenantId: identity.tenantId,
        type: 'security_anomaly',
        action: 'rejected_tampered',
        actorId: identity.actorId,
        staffAccountId: identity.staffAccountId,
        securityDetails: 'Cross-tenant or mismatched cashier identity submitted in offline grant'
      }, nowTimestamp);

      for (const c of claims) {
        const rawKey = isPlainRecord(c) && typeof c.idempotencyKey === 'string' ? c.idempotencyKey : 'unknown';
        const rawEntryId = isPlainRecord(c) && typeof c.entryId === 'string' ? c.entryId : 'unknown';
        const claimDocId = claimDocFingerprintId(grant.grantId, grant.shiftId, rawKey);
        const claimRef = tenantRef.collection('offline_claims').doc(claimDocId);

        transaction.set(claimRef, {
          claimId: claimDocId,
          grantId: grant.grantId,
          shiftId: grant.shiftId,
          tenantId: identity.tenantId,
          staffAccountId: identity.staffAccountId,
          authUid: identity.uid,
          sessionVersion: identity.sessionVersion,
          idempotencyKey: rawKey,
          fingerprint: 'identity_mismatch',
          seqIndex: isPlainRecord(c) && typeof c.seqIndex === 'number' ? c.seqIndex : 0,
          clientTimestamp: isPlainRecord(c) && typeof c.clientTimestamp === 'string' ? c.clientTimestamp : '',
          items: isPlainRecord(c) && Array.isArray(c.items) ? c.items : [],
          paymentMethod: 'cash',
          totalCentavos: isPlainRecord(c) && typeof c.totalCentavos === 'number' ? c.totalCentavos : 0,
          status: 'rejected_tampered',
          reconciliationNotes: 'Grant identity does not match authenticated cashier token',
          syncedAt: nowTimestamp,
          createdAt: nowTimestamp
        });

        rejectedResults.push({
          entryId: rawEntryId,
          idempotencyKey: rawKey,
          status: 'rejected_tampered',
          error: 'Grant identity does not match authenticated cashier token.'
        });
      }
    });

    return {
      status: 200,
      body: {
        syncedCount: 0,
        results: rejectedResults,
        shiftSummary: { confirmedCashSalesCentavos: 0, confirmedSaleCount: 0, pendingOfflineSaleCount: claims.length }
      }
    };
  }

  // Validate Tender Scope on Signed Grant
  if (!Array.isArray(grant.allowedTenders) || !grant.allowedTenders.includes('cash')) {
    const rejectedResults: OfflineClaimSyncResult[] = [];

    await db.runTransaction(async (transaction) => {
      recordTenantAuditEvent(transaction, tenantRef, {
        tenantId: identity.tenantId,
        type: 'security_anomaly',
        action: 'rejected_tampered',
        actorId: identity.actorId,
        staffAccountId: identity.staffAccountId,
        securityDetails: 'Signed grant does not permit Cash tender'
      }, nowTimestamp);

      for (const c of claims) {
        const rawKey = isPlainRecord(c) && typeof c.idempotencyKey === 'string' ? c.idempotencyKey : 'unknown';
        const rawEntryId = isPlainRecord(c) && typeof c.entryId === 'string' ? c.entryId : 'unknown';
        const claimDocId = claimDocFingerprintId(grant.grantId, grant.shiftId, rawKey);
        const claimRef = tenantRef.collection('offline_claims').doc(claimDocId);

        transaction.set(claimRef, {
          claimId: claimDocId,
          grantId: grant.grantId,
          shiftId: grant.shiftId,
          tenantId: identity.tenantId,
          staffAccountId: identity.staffAccountId,
          authUid: identity.uid,
          sessionVersion: identity.sessionVersion,
          idempotencyKey: rawKey,
          fingerprint: 'tender_not_permitted',
          seqIndex: isPlainRecord(c) && typeof c.seqIndex === 'number' ? c.seqIndex : 0,
          clientTimestamp: isPlainRecord(c) && typeof c.clientTimestamp === 'string' ? c.clientTimestamp : '',
          items: isPlainRecord(c) && Array.isArray(c.items) ? c.items : [],
          paymentMethod: 'cash',
          totalCentavos: isPlainRecord(c) && typeof c.totalCentavos === 'number' ? c.totalCentavos : 0,
          status: 'rejected_tampered',
          reconciliationNotes: 'Signed grant does not authorize Cash tender',
          syncedAt: nowTimestamp,
          createdAt: nowTimestamp
        });

        rejectedResults.push({
          entryId: rawEntryId,
          idempotencyKey: rawKey,
          status: 'rejected_tampered',
          error: 'Signed grant does not authorize Cash tender.'
        });
      }
    });

    return {
      status: 200,
      body: {
        syncedCount: 0,
        results: rejectedResults,
        shiftSummary: { confirmedCashSalesCentavos: 0, confirmedSaleCount: 0, pendingOfflineSaleCount: claims.length }
      }
    };
  }

  // 6. Catalog Snapshot Verification
  const snapshotService = options.snapshotService || getCatalogSnapshotService();
  const snapshot = await snapshotService.getSnapshotById(grant.tenantId, grant.snapshotId);

  if (!snapshot || snapshot.catalogDigest !== grant.catalogDigest) {
    const rejectedResults: OfflineClaimSyncResult[] = [];

    await db.runTransaction(async (transaction) => {
      recordTenantAuditEvent(transaction, tenantRef, {
        tenantId: identity.tenantId,
        type: 'security_anomaly',
        action: 'rejected_tampered',
        actorId: identity.actorId,
        staffAccountId: identity.staffAccountId,
        grantId: grant.grantId,
        securityDetails: 'Catalog snapshot missing or digest mismatch'
      }, nowTimestamp);

      for (const c of claims) {
        const rawKey = isPlainRecord(c) && typeof c.idempotencyKey === 'string' ? c.idempotencyKey : 'unknown';
        const rawEntryId = isPlainRecord(c) && typeof c.entryId === 'string' ? c.entryId : 'unknown';
        const claimDocId = claimDocFingerprintId(grant.grantId, grant.shiftId, rawKey);
        const claimRef = tenantRef.collection('offline_claims').doc(claimDocId);

        transaction.set(claimRef, {
          claimId: claimDocId,
          grantId: grant.grantId,
          shiftId: grant.shiftId,
          tenantId: grant.tenantId,
          staffAccountId: grant.staffAccountId,
          authUid: grant.authUid,
          sessionVersion: grant.sessionVersion,
          idempotencyKey: rawKey,
          fingerprint: 'catalog_snapshot_mismatch',
          seqIndex: isPlainRecord(c) && typeof c.seqIndex === 'number' ? c.seqIndex : 0,
          clientTimestamp: isPlainRecord(c) && typeof c.clientTimestamp === 'string' ? c.clientTimestamp : '',
          items: isPlainRecord(c) && Array.isArray(c.items) ? c.items : [],
          paymentMethod: 'cash',
          totalCentavos: isPlainRecord(c) && typeof c.totalCentavos === 'number' ? c.totalCentavos : 0,
          status: 'rejected_tampered',
          reconciliationNotes: 'Catalog snapshot missing or digest mismatch against signed grant',
          syncedAt: nowTimestamp,
          createdAt: nowTimestamp
        });

        rejectedResults.push({
          entryId: rawEntryId,
          idempotencyKey: rawKey,
          status: 'rejected_tampered',
          error: 'Catalog snapshot missing or digest mismatch.'
        });
      }
    });

    return {
      status: 200,
      body: {
        syncedCount: 0,
        results: rejectedResults,
        shiftSummary: { confirmedCashSalesCentavos: 0, confirmedSaleCount: 0, pendingOfflineSaleCount: claims.length }
      }
    };
  }

  const results: OfflineClaimSyncResult[] = [];
  let successfulSyncs = 0;

  // 7. Sequential Transactional Ingestion per Claim
  for (const rawClaim of claims) {
    // 7.1 Safe Raw Claim Validation
    if (!isPlainRecord(rawClaim)) {
      results.push({
        entryId: 'malformed',
        idempotencyKey: 'malformed',
        status: 'needs_review',
        error: 'Malformed claim entry.'
      });
      continue;
    }

    const claim = rawClaim;
    const entryId = typeof claim.entryId === 'string' ? claim.entryId : 'unknown';
    const idempotencyKey = typeof claim.idempotencyKey === 'string' ? claim.idempotencyKey : '';

    if (!idempotencyKey || !SERVER_IDENTIFIER.test(idempotencyKey) || !Array.isArray(claim.items) || claim.items.length === 0) {
      const claimDocId = claimDocFingerprintId(grant.grantId, grant.shiftId, idempotencyKey || entryId);
      const claimRef = tenantRef.collection('offline_claims').doc(claimDocId);

      await db.runTransaction(async (transaction) => {
        transaction.set(claimRef, {
          claimId: claimDocId,
          grantId: grant.grantId,
          shiftId: grant.shiftId,
          tenantId: grant.tenantId,
          staffAccountId: grant.staffAccountId,
          authUid: grant.authUid,
          sessionVersion: grant.sessionVersion,
          idempotencyKey: idempotencyKey || 'invalid',
          fingerprint: 'malformed_payload',
          seqIndex: typeof claim.seqIndex === 'number' ? claim.seqIndex : 0,
          clientTimestamp: typeof claim.clientTimestamp === 'string' ? claim.clientTimestamp : '',
          items: Array.isArray(claim.items) ? claim.items : [],
          paymentMethod: 'cash',
          totalCentavos: typeof claim.totalCentavos === 'number' ? claim.totalCentavos : 0,
          status: 'needs_review',
          reconciliationNotes: 'Malformed claim payload or invalid idempotency key',
          syncedAt: nowTimestamp,
          createdAt: nowTimestamp
        });

        recordTenantAuditEvent(transaction, tenantRef, {
          tenantId: grant.tenantId,
          type: 'offline_claim_sync',
          action: 'needs_review',
          actorId: identity.actorId,
          staffAccountId: grant.staffAccountId,
          shiftId: grant.shiftId,
          claimId: claimDocId,
          varianceNotes: 'Malformed claim payload or invalid idempotency key'
        }, nowTimestamp);
      });

      results.push({
        entryId,
        idempotencyKey,
        status: 'needs_review',
        error: 'Invalid claim structure or idempotency key format.'
      });
      continue;
    }

    const idempotencyDocId = checkoutIdempotencyDocumentId(identity.staffAccountId, idempotencyKey);
    const idemRef = tenantRef.collection('cashier_checkout_idempotency').doc(idempotencyDocId);
    const claimDocId = claimDocFingerprintId(grant.grantId, grant.shiftId, idempotencyKey);
    const claimRef = tenantRef.collection('offline_claims').doc(claimDocId);

    const currentFingerprint = offlineClaimFingerprint(
      identity.staffAccountId,
      grant.shiftId,
      claim.items.map((it: any) => ({
        productId: it && typeof it.productId === 'string' ? it.productId : '',
        quantity: it && typeof it.quantity === 'number' ? it.quantity : 0
      })),
      'cash'
    );

    try {
      const claimResult = await db.runTransaction(async (transaction) => {
        // Read Phase
        const tenantSnapRef = tenantRef;
        const staffSnapRef = tenantRef.collection('staff_accounts').doc(identity.staffAccountId);
        const shiftSnapRef = tenantRef.collection('shifts').doc(grant.shiftId);
        const serverGrantRef = tenantRef.collection('offline_grants').doc(grant.grantId);
        const accountRef = tenantRef.collection('accounts').doc('master-cash');

        const [claimSnap, idemSnap, tenantSnap, staffSnap, shiftSnap, serverGrantSnap, accountSnap] =
          await transaction.getAll(claimRef, idemRef, tenantSnapRef, staffSnapRef, shiftSnapRef, serverGrantRef, accountRef);

        // 1. Terminal Outcome Protection via claimSnap and idemSnap
        // Matching terminal claims return their recorded outcome/sale without mutation.
        if (claimSnap.exists) {
          const claimData = claimSnap.data() as ServerOfflineClaimDoc;
          if (claimData.fingerprint === currentFingerprint) {
            if (claimData.status === 'accepted' || claimData.status === 'accepted_with_inventory_variance') {
              return {
                status: claimData.status,
                saleId: claimData.saleId,
                receiptNumber: claimData.receiptNumber
              };
            }
            if (claimData.status === 'needs_review' || claimData.status === 'rejected_tampered') {
              return {
                status: claimData.status,
                varianceDetails: claimData.reconciliationNotes,
                error: claimData.reconciliationNotes
              };
            }
          } else {
            // Mismatched fingerprint on existing claim record -> Durable Conflict
            recordTenantAuditEvent(transaction, tenantRef, {
              tenantId: grant.tenantId,
              type: 'security_anomaly',
              action: 'idempotency_conflict',
              actorId: identity.actorId,
              staffAccountId: grant.staffAccountId,
              shiftId: grant.shiftId,
              claimId: claimDocId,
              securityDetails: `Claim fingerprint collision on ${claim.idempotencyKey}`
            }, nowTimestamp);

            return {
              status: 'needs_review' as const,
              error: 'Idempotency conflict: claim record exists with different payload.'
            };
          }
        }

        if (idemSnap.exists) {
          const idemData = idemSnap.data() as CashierCheckoutIdempotencyDoc;
          if (idemData.status === 'complete' && idemData.fingerprint === currentFingerprint) {
            return {
              status: (idemData.reconciliationOutcome || 'accepted') as ClaimReconciliationOutcome,
              saleId: idemData.saleId,
              receiptNumber: idemData.receipt?.receiptNumber
            };
          }

          // Conflict: same key with different payload
          transaction.set(claimRef, {
            claimId: claimDocId,
            grantId: grant.grantId,
            shiftId: grant.shiftId,
            tenantId: grant.tenantId,
            staffAccountId: grant.staffAccountId,
            authUid: grant.authUid,
            sessionVersion: grant.sessionVersion,
            idempotencyKey: claim.idempotencyKey,
            fingerprint: currentFingerprint,
            seqIndex: claim.seqIndex,
            clientTimestamp: claim.clientTimestamp,
            items: claim.items,
            paymentMethod: 'cash',
            totalCentavos: claim.totalCentavos,
            status: 'needs_review',
            reconciliationNotes: 'Idempotency key reused with mismatched payload',
            syncedAt: nowTimestamp,
            createdAt: nowTimestamp
          });

          recordTenantAuditEvent(transaction, tenantRef, {
            tenantId: grant.tenantId,
            type: 'security_anomaly',
            action: 'idempotency_conflict',
            actorId: identity.actorId,
            staffAccountId: grant.staffAccountId,
            shiftId: grant.shiftId,
            claimId: claimDocId,
            securityDetails: `Idempotency key collision on ${claim.idempotencyKey}`
          }, nowTimestamp);

          return {
            status: 'needs_review' as const,
            error: 'Idempotency conflict: key was previously used with different transaction payload.'
          };
        }

        // 2. Check Authoritative Server Grant Document (Fail Closed)
        if (!serverGrantSnap.exists) {
          transaction.set(claimRef, {
            claimId: claimDocId,
            grantId: grant.grantId,
            shiftId: grant.shiftId,
            tenantId: grant.tenantId,
            staffAccountId: grant.staffAccountId,
            authUid: grant.authUid,
            sessionVersion: grant.sessionVersion,
            idempotencyKey: claim.idempotencyKey,
            fingerprint: currentFingerprint,
            seqIndex: claim.seqIndex,
            clientTimestamp: claim.clientTimestamp,
            items: claim.items,
            paymentMethod: 'cash',
            totalCentavos: claim.totalCentavos,
            status: 'needs_review',
            reconciliationNotes: 'Authoritative server offline grant document not found',
            syncedAt: nowTimestamp,
            createdAt: nowTimestamp
          });

          recordTenantAuditEvent(transaction, tenantRef, {
            tenantId: grant.tenantId,
            type: 'offline_claim_sync',
            action: 'needs_review',
            actorId: identity.actorId,
            staffAccountId: grant.staffAccountId,
            shiftId: grant.shiftId,
            claimId: claimDocId,
            varianceNotes: 'Authoritative server offline grant not found'
          }, nowTimestamp);

          return {
            status: 'needs_review' as const,
            varianceDetails: 'Authoritative offline grant not found on server'
          };
        }

        const serverGrant = serverGrantSnap.data()!;
        if (
          serverGrant.tenantId !== grant.tenantId ||
          serverGrant.staffAccountId !== grant.staffAccountId ||
          serverGrant.authUid !== grant.authUid
        ) {
          // Cross-tenant or mismatched server grant
          transaction.set(claimRef, {
            claimId: claimDocId,
            grantId: grant.grantId,
            shiftId: grant.shiftId,
            tenantId: grant.tenantId,
            staffAccountId: grant.staffAccountId,
            authUid: grant.authUid,
            sessionVersion: grant.sessionVersion,
            idempotencyKey: claim.idempotencyKey,
            fingerprint: currentFingerprint,
            seqIndex: claim.seqIndex,
            clientTimestamp: claim.clientTimestamp,
            items: claim.items,
            paymentMethod: 'cash',
            totalCentavos: claim.totalCentavos,
            status: 'rejected_tampered',
            reconciliationNotes: 'Server grant identity mismatch',
            syncedAt: nowTimestamp,
            createdAt: nowTimestamp
          });

          recordTenantAuditEvent(transaction, tenantRef, {
            tenantId: grant.tenantId,
            type: 'security_anomaly',
            action: 'rejected_tampered',
            actorId: identity.actorId,
            staffAccountId: grant.staffAccountId,
            shiftId: grant.shiftId,
            claimId: claimDocId,
            securityDetails: 'Server grant identity mismatch against signed grant'
          }, nowTimestamp);

          return {
            status: 'rejected_tampered' as const,
            error: 'Server grant identity mismatch.'
          };
        }

        if (
          serverGrant.status !== 'active' ||
          serverGrant.sessionVersion !== grant.sessionVersion ||
          serverGrant.shiftId !== grant.shiftId ||
          serverGrant.snapshotId !== grant.snapshotId ||
          serverGrant.catalogDigest !== grant.catalogDigest ||
          serverGrant.installationId !== grant.installationId ||
          !Array.isArray(serverGrant.allowedTenders) ||
          !serverGrant.allowedTenders.includes('cash')
        ) {
          transaction.set(claimRef, {
            claimId: claimDocId,
            grantId: grant.grantId,
            shiftId: grant.shiftId,
            tenantId: grant.tenantId,
            staffAccountId: grant.staffAccountId,
            authUid: grant.authUid,
            sessionVersion: grant.sessionVersion,
            idempotencyKey: claim.idempotencyKey,
            fingerprint: currentFingerprint,
            seqIndex: claim.seqIndex,
            clientTimestamp: claim.clientTimestamp,
            items: claim.items,
            paymentMethod: 'cash',
            totalCentavos: claim.totalCentavos,
            status: 'needs_review',
            reconciliationNotes: `Server grant invalid or revoked (status: ${serverGrant.status}, version: ${serverGrant.sessionVersion})`,
            syncedAt: nowTimestamp,
            createdAt: nowTimestamp
          });

          recordTenantAuditEvent(transaction, tenantRef, {
            tenantId: grant.tenantId,
            type: 'offline_claim_sync',
            action: 'needs_review',
            actorId: identity.actorId,
            staffAccountId: grant.staffAccountId,
            shiftId: grant.shiftId,
            claimId: claimDocId,
            varianceNotes: `Server grant revoked or stale (status: ${serverGrant.status})`
          }, nowTimestamp);

          return {
            status: 'needs_review' as const,
            varianceDetails: 'Server grant revoked or modified'
          };
        }

        // 3. Enforce Full Online Authorization Contract
        let reviewReason: string | null = null;

        if (!tenantSnap.exists || !staffSnap.exists) {
          reviewReason = 'Tenant or staff account document missing';
        } else {
          try {
            assertBentaCashierAuthorization(identity, tenantSnap as any, staffSnap as any);
            const staff = staffSnap.data()!;
            if (staff.activeShiftId !== grant.shiftId) {
              reviewReason = `Staff activeShiftId mismatch (active: ${staff.activeShiftId}, grant: ${grant.shiftId})`;
            }
          } catch (authErr: any) {
            reviewReason = `Cashier authorization assertion failed: ${authErr.message || authErr}`;
          }
        }

        let shift: any = null;
        if (!reviewReason) {
          if (!shiftSnap.exists) {
            reviewReason = 'Shift document not found';
          } else {
            try {
              shift = assertReconciliationShift(shiftSnap.id, shiftSnap.data()!, identity);
              if (shiftSnap.id !== grant.shiftId || shiftSnap.data()?.status !== 'open') {
                reviewReason = 'Shift is not open for this cashier';
              }
            } catch (err: any) {
              reviewReason = `Shift reconciliation assertion failed: ${err.message || err}`;
            }
          }
        }

        // 4. Validate Item Catalog & Price Integrity
        let computedSubtotal = 0;
        const verifiedItems: Array<{
          productId: string;
          name: string;
          unit: string;
          quantity: number;
          unitPriceCentavos: number;
          costPriceCentavos: number;
          lineTotalCentavos: number;
        }> = [];

        const seenItems = new Set<string>();

        for (const it of claim.items) {
          if (!it || typeof it.productId !== 'string' || !SERVER_IDENTIFIER.test(it.productId) || seenItems.has(it.productId)) {
            transaction.set(claimRef, {
              claimId: claimDocId,
              grantId: grant.grantId,
              shiftId: grant.shiftId,
              tenantId: grant.tenantId,
              staffAccountId: grant.staffAccountId,
              authUid: grant.authUid,
              sessionVersion: grant.sessionVersion,
              idempotencyKey: claim.idempotencyKey,
              fingerprint: currentFingerprint,
              seqIndex: claim.seqIndex,
              clientTimestamp: claim.clientTimestamp,
              items: claim.items,
              paymentMethod: 'cash',
              totalCentavos: claim.totalCentavos,
              status: 'needs_review',
              reconciliationNotes: `Duplicate or invalid product line: ${it?.productId}`,
              syncedAt: nowTimestamp,
              createdAt: nowTimestamp
            });

            recordTenantAuditEvent(transaction, tenantRef, {
              tenantId: grant.tenantId,
              type: 'offline_claim_sync',
              action: 'needs_review',
              actorId: identity.actorId,
              staffAccountId: grant.staffAccountId,
              shiftId: grant.shiftId,
              claimId: claimDocId,
              varianceNotes: `Duplicate or invalid product line: ${it?.productId}`
            }, nowTimestamp);

            return {
              status: 'needs_review' as const,
              error: `Duplicate or invalid product line: ${it?.productId}`
            };
          }
          seenItems.add(it.productId);

          if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
            transaction.set(claimRef, {
              claimId: claimDocId,
              grantId: grant.grantId,
              shiftId: grant.shiftId,
              tenantId: grant.tenantId,
              staffAccountId: grant.staffAccountId,
              authUid: grant.authUid,
              sessionVersion: grant.sessionVersion,
              idempotencyKey: claim.idempotencyKey,
              fingerprint: currentFingerprint,
              seqIndex: claim.seqIndex,
              clientTimestamp: claim.clientTimestamp,
              items: claim.items,
              paymentMethod: 'cash',
              totalCentavos: claim.totalCentavos,
              status: 'needs_review',
              reconciliationNotes: `Invalid item quantity for product ${it.productId}`,
              syncedAt: nowTimestamp,
              createdAt: nowTimestamp
            });

            recordTenantAuditEvent(transaction, tenantRef, {
              tenantId: grant.tenantId,
              type: 'offline_claim_sync',
              action: 'needs_review',
              actorId: identity.actorId,
              staffAccountId: grant.staffAccountId,
              shiftId: grant.shiftId,
              claimId: claimDocId,
              varianceNotes: `Invalid item quantity for product ${it.productId}`
            }, nowTimestamp);

            return {
              status: 'needs_review' as const,
              error: `Invalid quantity for product ${it.productId}`
            };
          }

          const snapItem = snapshot.products[it.productId];
          if (!snapItem || !snapItem.isActive) {
            transaction.set(claimRef, {
              claimId: claimDocId,
              grantId: grant.grantId,
              shiftId: grant.shiftId,
              tenantId: grant.tenantId,
              staffAccountId: grant.staffAccountId,
              authUid: grant.authUid,
              sessionVersion: grant.sessionVersion,
              idempotencyKey: claim.idempotencyKey,
              fingerprint: currentFingerprint,
              seqIndex: claim.seqIndex,
              clientTimestamp: claim.clientTimestamp,
              items: claim.items,
              paymentMethod: 'cash',
              totalCentavos: claim.totalCentavos,
              status: 'needs_review',
              reconciliationNotes: `Product ${it.productId} not found in authoritative catalog snapshot`,
              syncedAt: nowTimestamp,
              createdAt: nowTimestamp
            });

            recordTenantAuditEvent(transaction, tenantRef, {
              tenantId: grant.tenantId,
              type: 'offline_claim_sync',
              action: 'needs_review',
              actorId: identity.actorId,
              staffAccountId: grant.staffAccountId,
              shiftId: grant.shiftId,
              claimId: claimDocId,
              varianceNotes: `Product ${it.productId} not found in catalog snapshot`
            }, nowTimestamp);

            return {
              status: 'needs_review' as const,
              error: `Product ${it.productId} not in catalog snapshot.`
            };
          }

          // Fail closed if historical cost is missing or malformed in snapshot
          if (snapItem.costPriceCentavos === undefined || !Number.isSafeInteger(snapItem.costPriceCentavos) || snapItem.costPriceCentavos < 0) {
            transaction.set(claimRef, {
              claimId: claimDocId,
              grantId: grant.grantId,
              shiftId: grant.shiftId,
              tenantId: grant.tenantId,
              staffAccountId: grant.staffAccountId,
              authUid: grant.authUid,
              sessionVersion: grant.sessionVersion,
              idempotencyKey: claim.idempotencyKey,
              fingerprint: currentFingerprint,
              seqIndex: claim.seqIndex,
              clientTimestamp: claim.clientTimestamp,
              items: claim.items,
              paymentMethod: 'cash',
              totalCentavos: claim.totalCentavos,
              status: 'needs_review',
              reconciliationNotes: `Product ${it.productId} missing authoritative cost price in snapshot`,
              syncedAt: nowTimestamp,
              createdAt: nowTimestamp
            });

            recordTenantAuditEvent(transaction, tenantRef, {
              tenantId: grant.tenantId,
              type: 'offline_claim_sync',
              action: 'needs_review',
              actorId: identity.actorId,
              staffAccountId: grant.staffAccountId,
              shiftId: grant.shiftId,
              claimId: claimDocId,
              varianceNotes: `Product ${it.productId} missing authoritative historical cost price`
            }, nowTimestamp);

            return {
              status: 'needs_review' as const,
              error: `Product ${it.productId} has invalid historical cost in snapshot.`
            };
          }

          const unitPrice = snapItem.salePriceCentavos;
          const costPrice = snapItem.costPriceCentavos;
          const lineTotal = safeMultiply(it.quantity, unitPrice);
          computedSubtotal = safeAdd(computedSubtotal, lineTotal);

          verifiedItems.push({
            productId: it.productId,
            name: snapItem.name,
            unit: snapItem.unit,
            quantity: it.quantity,
            unitPriceCentavos: unitPrice,
            costPriceCentavos: costPrice,
            lineTotalCentavos: lineTotal
          });
        }

        if (computedSubtotal !== claim.totalCentavos) {
          transaction.set(claimRef, {
            claimId: claimDocId,
            grantId: grant.grantId,
            shiftId: grant.shiftId,
            tenantId: grant.tenantId,
            staffAccountId: grant.staffAccountId,
            authUid: grant.authUid,
            sessionVersion: grant.sessionVersion,
            idempotencyKey: claim.idempotencyKey,
            fingerprint: currentFingerprint,
            seqIndex: claim.seqIndex,
            clientTimestamp: claim.clientTimestamp,
            items: claim.items,
            paymentMethod: 'cash',
            totalCentavos: claim.totalCentavos,
            status: 'needs_review',
            reconciliationNotes: `Subtotal mismatch against snapshot: computed ${computedSubtotal} vs claimed ${claim.totalCentavos}`,
            syncedAt: nowTimestamp,
            createdAt: nowTimestamp
          });

          recordTenantAuditEvent(transaction, tenantRef, {
            tenantId: grant.tenantId,
            type: 'offline_claim_sync',
            action: 'needs_review',
            actorId: identity.actorId,
            staffAccountId: grant.staffAccountId,
            shiftId: grant.shiftId,
            claimId: claimDocId,
            varianceNotes: `Subtotal mismatch against snapshot: computed ${computedSubtotal} vs claimed ${claim.totalCentavos}`
          }, nowTimestamp);

          return {
            status: 'needs_review' as const,
            error: `Subtotal mismatch against snapshot: computed ${computedSubtotal} vs claimed ${claim.totalCentavos}`
          };
        }

        // Cash tender validation
        if (
          !Number.isSafeInteger(claim.cashTenderedCentavos) ||
          claim.cashTenderedCentavos < claim.totalCentavos
        ) {
          transaction.set(claimRef, {
            claimId: claimDocId,
            grantId: grant.grantId,
            shiftId: grant.shiftId,
            tenantId: grant.tenantId,
            staffAccountId: grant.staffAccountId,
            authUid: grant.authUid,
            sessionVersion: grant.sessionVersion,
            idempotencyKey: claim.idempotencyKey,
            fingerprint: currentFingerprint,
            seqIndex: claim.seqIndex,
            clientTimestamp: claim.clientTimestamp,
            items: claim.items,
            paymentMethod: 'cash',
            totalCentavos: claim.totalCentavos,
            status: 'needs_review',
            reconciliationNotes: `Invalid cash tender: ${claim.cashTenderedCentavos} < total ${claim.totalCentavos}`,
            syncedAt: nowTimestamp,
            createdAt: nowTimestamp
          });

          recordTenantAuditEvent(transaction, tenantRef, {
            tenantId: grant.tenantId,
            type: 'offline_claim_sync',
            action: 'needs_review',
            actorId: identity.actorId,
            staffAccountId: grant.staffAccountId,
            shiftId: grant.shiftId,
            claimId: claimDocId,
            varianceNotes: `Invalid cash tender: ${claim.cashTenderedCentavos} < total ${claim.totalCentavos}`
          }, nowTimestamp);

          return {
            status: 'needs_review' as const,
            error: 'Cash tendered must be greater than or equal to total amount.'
          };
        }

        // 5. If Stale / Needs Review: persist claim as needs_review without financial mutation
        if (reviewReason) {
          transaction.set(claimRef, {
            claimId: claimDocId,
            grantId: grant.grantId,
            shiftId: grant.shiftId,
            tenantId: grant.tenantId,
            staffAccountId: grant.staffAccountId,
            authUid: grant.authUid,
            sessionVersion: grant.sessionVersion,
            idempotencyKey: claim.idempotencyKey,
            fingerprint: currentFingerprint,
            seqIndex: claim.seqIndex,
            clientTimestamp: claim.clientTimestamp,
            items: claim.items,
            paymentMethod: 'cash',
            totalCentavos: claim.totalCentavos,
            status: 'needs_review',
            reconciliationNotes: `Held for Owner review: ${reviewReason}`,
            syncedAt: nowTimestamp,
            createdAt: nowTimestamp
          });

          recordTenantAuditEvent(transaction, tenantRef, {
            tenantId: grant.tenantId,
            type: 'offline_claim_sync',
            action: 'needs_review',
            actorId: identity.actorId,
            staffAccountId: grant.staffAccountId,
            shiftId: grant.shiftId,
            claimId: claimDocId,
            varianceNotes: `Claim ingested for review: ${reviewReason}`
          }, nowTimestamp);

          return {
            status: 'needs_review' as const,
            varianceDetails: `Claim recorded in review queue: ${reviewReason}`
          };
        }

        // 6. Read Live Product Inventory
        const productRefs = verifiedItems.map((it) => tenantRef.collection('products').doc(it.productId));
        const movementRefs = verifiedItems.map(() => tenantRef.collection('inventory_transactions').doc());
        const productSnaps = await transaction.getAll(...productRefs);

        let hasInventoryVariance = false;
        const varianceNotes: string[] = [];

        productSnaps.forEach((pSnap, idx) => {
          const it = verifiedItems[idx];
          if (pSnap.exists) {
            const pData = pSnap.data()!;
            const currentStock = pData.currentStock || 0;
            if (currentStock < it.quantity) {
              hasInventoryVariance = true;
              varianceNotes.push(`${it.name}: stock ${currentStock} < sold ${it.quantity}`);
            }
            const newStock = currentStock - it.quantity;
            transaction.update(pSnap.ref, {
              currentStock: newStock,
              updatedAt: nowTimestamp
            });
          } else {
            hasInventoryVariance = true;
            varianceNotes.push(`${it.name}: product not found in live inventory`);
          }
        });

        // 7. Master Cash Register Account calculation
        let oldBalance = 0;
        if (accountSnap.exists) {
          oldBalance = accountSnap.data()!.balance || 0;
        }
        const newBalance = safeAdd(oldBalance, claim.totalCentavos);

        // 8. Write Phase (Full Invariants)
        const saleRef = tenantRef.collection('sales').doc();
        const ledgerRef = tenantRef.collection('transactions').doc();
        const finalStatus: ClaimReconciliationOutcome = hasInventoryVariance ? 'accepted_with_inventory_variance' : 'accepted';

        const saleItems = verifiedItems.map((it) => ({
          productId: it.productId,
          name: it.name,
          unit: it.unit,
          quantity: it.quantity,
          price: it.unitPriceCentavos,
          costPrice: it.costPriceCentavos,
          lineTotal: it.lineTotalCentavos
        }));

        // Sale
        transaction.set(saleRef, {
          id: saleRef.id,
          tenantId: grant.tenantId,
          moduleId: BENTA_SNAP_MODULE_ID,
          shiftId: grant.shiftId,
          staffAccountId: grant.staffAccountId,
          actorId: identity.actorId,
          items: saleItems,
          subtotalAmount: claim.totalCentavos,
          discountAmount: 0,
          totalAmount: claim.totalCentavos,
          paymentMethod: 'cash',
          cashTendered: claim.cashTenderedCentavos,
          change: claim.cashTenderedCentavos - claim.totalCentavos,
          isOfflineSync: true,
          clientClaimedTimestamp: claim.clientTimestamp,
          transactionDate: nowTimestamp,
          createdAt: nowTimestamp
        });

        // Inventory Movements per product
        verifiedItems.forEach((it, idx) => {
          const mRef = movementRefs[idx];
          const pSnap = productSnaps[idx];
          const currentStock = pSnap.exists ? pSnap.data()!.currentStock || 0 : 0;
          const balanceAfter = currentStock - it.quantity;

          transaction.set(mRef, {
            id: mRef.id,
            tenantId: grant.tenantId,
            productId: it.productId,
            saleId: saleRef.id,
            shiftId: grant.shiftId,
            type: 'sale',
            quantity: -it.quantity,
            balanceAfter,
            performedBy: identity.actorId,
            createdAt: nowTimestamp
          });
        });

        // Shift Aggregates
        const nextShift = applySaleToShift(shift as any, 'cash', claim.totalCentavos);
        transaction.update(shiftSnap.ref, {
          ...nextShift,
          updatedAt: nowTimestamp
        });

        // Master Cash Register Account
        transaction.set(accountRef, accountSnap.exists
          ? { balance: newBalance, updatedAt: nowTimestamp }
          : { id: 'master-cash', tenantId: grant.tenantId, name: 'Main Cash Register', type: 'asset', balance: newBalance, isActive: true, createdAt: nowTimestamp, updatedAt: nowTimestamp },
          { merge: true });

        // Ledger Transaction
        transaction.set(ledgerRef, {
          id: ledgerRef.id,
          tenantId: grant.tenantId,
          accountId: 'master-cash',
          amount: claim.totalCentavos,
          type: 'income',
          category: 'Sales',
          description: 'Benta Snap offline cashier sale',
          saleId: saleRef.id,
          shiftId: grant.shiftId,
          actorId: identity.actorId,
          paymentMethod: 'cash',
          date: nowTimestamp,
          createdAt: nowTimestamp
        });

        // Immutable Tenant Audit Event
        recordTenantAuditEvent(transaction, tenantRef, {
          tenantId: grant.tenantId,
          type: 'cashier_checkout',
          action: finalStatus === 'accepted_with_inventory_variance' ? 'accepted_with_inventory_variance' : 'accepted',
          actorId: identity.actorId,
          staffAccountId: grant.staffAccountId,
          shiftId: grant.shiftId,
          saleId: saleRef.id,
          claimId: claimDocId,
          paymentMethod: 'cash',
          amountCentavos: claim.totalCentavos,
          hasVariance: hasInventoryVariance,
          varianceNotes: varianceNotes.join('; ') || null
        }, nowTimestamp);

        // Receipt Generation
        const receiptNumber = `RCPT-${grant.shiftId.slice(-4).toUpperCase()}-${saleRef.id.slice(-6).toUpperCase()}`;
        const staffDoc = staffSnap.data()!;
        const cashierDisplayName = typeof staffDoc.displayName === 'string' && staffDoc.displayName.trim().length > 0
          ? staffDoc.displayName.trim()
          : 'Cashier';

        const receipt: SharedCheckoutReceipt = {
          saleId: saleRef.id,
          receiptNumber,
          committedAt: nowTimestamp.toDate().toISOString(),
          moduleId: BENTA_SNAP_MODULE_ID,
          paymentMethod: 'cash',
          shiftId: grant.shiftId,
          cashierDisplayName,
          items: verifiedItems.map((it) => ({
            productId: it.productId,
            name: it.name,
            unit: it.unit,
            quantity: it.quantity,
            unitPriceCentavos: it.unitPriceCentavos,
            lineTotalCentavos: it.lineTotalCentavos
          })),
          subtotalCentavos: claim.totalCentavos,
          totalCentavos: claim.totalCentavos
        };

        // Durable Ingestion Claim Document
        transaction.set(claimRef, {
          claimId: claimDocId,
          grantId: grant.grantId,
          shiftId: grant.shiftId,
          tenantId: grant.tenantId,
          staffAccountId: grant.staffAccountId,
          authUid: grant.authUid,
          sessionVersion: grant.sessionVersion,
          idempotencyKey: claim.idempotencyKey,
          fingerprint: currentFingerprint,
          seqIndex: claim.seqIndex,
          clientTimestamp: claim.clientTimestamp,
          items: claim.items,
          paymentMethod: 'cash',
          totalCentavos: claim.totalCentavos,
          status: finalStatus,
          saleId: saleRef.id,
          receiptNumber,
          varianceDetails: hasInventoryVariance ? varianceNotes.join('; ') : null,
          syncedAt: nowTimestamp,
          createdAt: nowTimestamp
        });

        // Idempotency Document (Unifies with Online Checkout: status: 'complete', receipt: SharedCheckoutReceipt)
        transaction.set(idemRef, {
          status: 'complete',
          fingerprint: currentFingerprint,
          saleId: saleRef.id,
          receipt,
          reconciliationOutcome: finalStatus,
          completedAt: nowTimestamp,
          expiresAt: admin.firestore.Timestamp.fromMillis(nowTimestamp.toMillis() + 30 * 24 * 60 * 60 * 1000)
        });

        return {
          status: finalStatus,
          saleId: saleRef.id,
          receiptNumber,
          varianceDetails: hasInventoryVariance ? varianceNotes.join('; ') : undefined
        };
      });

      if (claimResult.status === 'accepted' || claimResult.status === 'accepted_with_inventory_variance') {
        successfulSyncs++;
      }

      results.push({
        entryId,
        idempotencyKey,
        status: claimResult.status,
        saleId: claimResult.saleId,
        receiptNumber: claimResult.receiptNumber,
        varianceDetails: claimResult.varianceDetails,
        error: claimResult.error
      });
    } catch (claimErr: any) {
      results.push({
        entryId,
        idempotencyKey,
        status: 'retryable',
        error: 'Database contention; will retry.'
      });
    }
  }

  return {
    status: 200,
    body: {
      syncedCount: successfulSyncs,
      results,
      shiftSummary: {
        confirmedCashSalesCentavos: 0,
        confirmedSaleCount: successfulSyncs,
        pendingOfflineSaleCount: results.filter((r) => r.status === 'retryable' || r.status === 'needs_review').length
      }
    }
  };
}
