import * as admin from 'firebase-admin';

export type AuditEventType =
  | 'cashier_checkout'
  | 'offline_claim_sync'
  | 'offline_grant_issued'
  | 'security_anomaly'
  | 'owner_claim_resolution';

export type AuditAction =
  | 'complete_checkout'
  | 'accepted'
  | 'accepted_with_inventory_variance'
  | 'needs_review'
  | 'rejected_tampered'
  | 'idempotency_conflict'
  | 'grant_minted'
  | 'approved_by_owner'
  | 'rejected_by_owner';

export interface TenantAuditEvent {
  id: string;
  tenantId: string;
  type: AuditEventType;
  action: AuditAction;
  actorId: string;
  staffAccountId?: string;
  shiftId?: string;
  saleId?: string;
  claimId?: string;
  grantId?: string;
  amountCentavos?: number;
  paymentMethod?: 'cash' | 'gcash' | 'maya';
  hasVariance?: boolean;
  varianceNotes?: string | null;
  securityDetails?: string | null;
  createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
}

/**
 * Creates an immutable Tenant Audit Event in the given Firestore transaction or batch.
 * Strictly sanitizes payload: never logs PINs, tokens, signing secrets, or raw grant credentials.
 */
export function recordTenantAuditEvent(
  transaction: admin.firestore.Transaction,
  tenantRef: admin.firestore.DocumentReference,
  event: Omit<TenantAuditEvent, 'id' | 'createdAt'>,
  nowTimestamp?: admin.firestore.Timestamp
): admin.firestore.DocumentReference {
  const auditRef = tenantRef.collection('audit_log').doc();
  const createdAt = nowTimestamp || admin.firestore.FieldValue.serverTimestamp();

  const auditDoc: TenantAuditEvent = {
    id: auditRef.id,
    tenantId: event.tenantId,
    type: event.type,
    action: event.action,
    actorId: event.actorId,
    ...(event.staffAccountId ? { staffAccountId: event.staffAccountId } : {}),
    ...(event.shiftId ? { shiftId: event.shiftId } : {}),
    ...(event.saleId ? { saleId: event.saleId } : {}),
    ...(event.claimId ? { claimId: event.claimId } : {}),
    ...(event.grantId ? { grantId: event.grantId } : {}),
    ...(typeof event.amountCentavos === 'number' ? { amountCentavos: event.amountCentavos } : {}),
    ...(event.paymentMethod ? { paymentMethod: event.paymentMethod } : {}),
    ...(typeof event.hasVariance === 'boolean' ? { hasVariance: event.hasVariance } : {}),
    ...(event.varianceNotes ? { varianceNotes: event.varianceNotes } : {}),
    ...(event.securityDetails ? { securityDetails: event.securityDetails } : {}),
    createdAt
  };

  transaction.create(auditRef, auditDoc);
  return auditRef;
}
