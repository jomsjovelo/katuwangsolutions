import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  BENTA_RESTOCK_REVERSAL_OPERATION_VERSION,
  evaluateBentaRestockReversalEligibility,
  type LatestPurchaseCostRestorationPolicy,
} from '../shared/benta-restock-reversal-engine';
import { projectBentaProductCostPosition, type BentaProductCostingInput } from '../shared/benta-inventory-costing-adapter';
import { SERVER_IDENTIFIER } from './cashier-server-authorization';
import { recordTenantAuditEvent } from './audit-events';

export const BENTA_SNAP_MODULE_ID = 'benta-snap' as const;
export const RESTOCK_REVERSAL_VERSION = 1 as const;

export enum RestockReversalErrorCode {
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  FORBIDDEN = 'FORBIDDEN',
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  TENANT_INELIGIBLE = 'TENANT_INELIGIBLE',
  PO_NOT_FOUND = 'PO_NOT_FOUND',
  PO_ALREADY_VOIDED = 'PO_ALREADY_VOIDED',
  PO_NOT_REVERSIBLE = 'PO_NOT_REVERSIBLE',
  INVALID_REQUEST = 'INVALID_REQUEST',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  INTEGRITY_ERROR = 'INTEGRITY_ERROR',
  PAYMENT_EVIDENCE_INVALID = 'PAYMENT_EVIDENCE_INVALID',
  REPLAY_INTEGRITY_ERROR = 'REPLAY_INTEGRITY_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

const ERROR_DETAILS: Record<RestockReversalErrorCode, { status: number; message: string }> = {
  [RestockReversalErrorCode.AUTHENTICATION_REQUIRED]: { status: 401, message: 'Authentication required.' },
  [RestockReversalErrorCode.FORBIDDEN]: { status: 403, message: 'Operation not permitted.' },
  [RestockReversalErrorCode.TENANT_NOT_FOUND]: { status: 404, message: 'Tenant not found.' },
  [RestockReversalErrorCode.TENANT_INELIGIBLE]: { status: 403, message: 'Tenant is inactive or not eligible for Benta Snap.' },
  [RestockReversalErrorCode.PO_NOT_FOUND]: { status: 404, message: 'Purchase order not found.' },
  [RestockReversalErrorCode.PO_ALREADY_VOIDED]: { status: 409, message: 'Purchase order has already been voided.' },
  [RestockReversalErrorCode.PO_NOT_REVERSIBLE]: { status: 409, message: 'Purchase order cannot be reversed.' },
  [RestockReversalErrorCode.INVALID_REQUEST]: { status: 400, message: 'Invalid request.' },
  [RestockReversalErrorCode.IDEMPOTENCY_CONFLICT]: { status: 409, message: 'Idempotency conflict.' },
  [RestockReversalErrorCode.INTEGRITY_ERROR]: { status: 409, message: 'Integrity error.' },
  [RestockReversalErrorCode.PAYMENT_EVIDENCE_INVALID]: { status: 409, message: 'Payment evidence is invalid.' },
  [RestockReversalErrorCode.REPLAY_INTEGRITY_ERROR]: { status: 409, message: 'Reversal replay integrity error.' },
  [RestockReversalErrorCode.SERVICE_UNAVAILABLE]: { status: 503, message: 'Service temporarily unavailable.' },
};

export class RestockReversalError extends Error {
  readonly code: RestockReversalErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;

  constructor(code: RestockReversalErrorCode) {
    const detail = ERROR_DETAILS[code] || { status: 503, message: 'Service temporarily unavailable.' };
    super(detail.message);
    this.name = 'RestockReversalError';
    this.code = code;
    this.httpStatus = detail.status;
    this.userMessage = detail.message;
  }
}

export interface RestockReversalRequest {
  purchaseOrderId: string;
  idempotencyKey: string;
  reason: string;
}

export type PaymentEffect = 'cash_refunded' | 'payable_voided' | 'external_payment_unmodified';

export interface RestockReversalReceipt {
  reversalId: string;
  purchaseOrderId: string;
  voidedAt: string;
  productCount: number;
  paymentEffect: PaymentEffect;
  reversalVersion: typeof RESTOCK_REVERSAL_VERSION;
}

export interface ReversalServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

export interface InternalRestockReversalEvidence {
  poTenantId: string;
  purchaseOrderId: string;
  originalPOId: string;
  paymentMethod: string;
  paymentStatus: string;
  totalAmountCentavos: number;
  productCount: number;
  receipt: RestockReversalReceipt;
  normalizedReason: string;
  actorUid: string;
  voidedAtIso: string;
  perLineEvidence: Array<Record<string, unknown>>;
  productRestorations: Array<{
    productId: string;
    movementId: string;
    previousPosition: Record<string, unknown>;
    restoredPosition: Record<string, unknown>;
    removedQuantityMinor: number;
    removedInventoryValueCentavos: number;
    latestPurchaseCostRestoration: LatestPurchaseCostRestorationPolicy;
  }>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyRecordKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHAR = /[\u0000-\u001F\u007F]/;

export function validateRestockReversalRequest(rawBody: unknown): RestockReversalRequest {
  if (!isPlainRecord(rawBody)) {
    throw new RestockReversalError(RestockReversalErrorCode.INVALID_REQUEST);
  }

  const allowedKeys = ['purchaseOrderId', 'idempotencyKey', 'reason'];
  if (!hasOnlyRecordKeys(rawBody, allowedKeys)) {
    throw new RestockReversalError(RestockReversalErrorCode.INVALID_REQUEST);
  }

  const { purchaseOrderId, idempotencyKey, reason } = rawBody;

  if (typeof purchaseOrderId !== 'string' || !SERVER_IDENTIFIER.test(purchaseOrderId)) {
    throw new RestockReversalError(RestockReversalErrorCode.INVALID_REQUEST);
  }

  if (typeof idempotencyKey !== 'string' || !UUID_V4.test(idempotencyKey)) {
    throw new RestockReversalError(RestockReversalErrorCode.INVALID_REQUEST);
  }

  if (typeof reason !== 'string') {
    throw new RestockReversalError(RestockReversalErrorCode.INVALID_REQUEST);
  }

  const normalizedReason = reason.trim();
  if (normalizedReason.length < 1 || normalizedReason.length > 500) {
    throw new RestockReversalError(RestockReversalErrorCode.INVALID_REQUEST);
  }

  if (CONTROL_CHAR.test(normalizedReason)) {
    throw new RestockReversalError(RestockReversalErrorCode.INVALID_REQUEST);
  }

  return Object.freeze({
    purchaseOrderId,
    idempotencyKey,
    reason: normalizedReason,
  });
}

export function restockReversalIdDocumentId(tenantId: string, purchaseOrderId: string): string {
  return createHash('sha256').update(`restock_rev:${BENTA_RESTOCK_REVERSAL_OPERATION_VERSION}:${tenantId}:${purchaseOrderId}`, 'utf8').digest('hex');
}

export function restockReversalIdempotencyDocumentId(tenantId: string, ownerUid: string, idempotencyKey: string): string {
  return createHash('sha256').update(`restock_rev_idem:${BENTA_RESTOCK_REVERSAL_OPERATION_VERSION}:${tenantId}:${ownerUid}:${idempotencyKey}`, 'utf8').digest('hex');
}

export function restockReversalFingerprint(tenantId: string, purchaseOrderId: string, reason: string): string {
  const canonical = {
    v: BENTA_RESTOCK_REVERSAL_OPERATION_VERSION,
    tenantId,
    purchaseOrderId,
    reason,
  };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

export function restockReversalMovementId(tenantId: string, purchaseOrderId: string, productId: string): string {
  return createHash('sha256').update(`restock_rev_mov:${BENTA_RESTOCK_REVERSAL_OPERATION_VERSION}:${tenantId}:${purchaseOrderId}:${productId}`, 'utf8').digest('hex');
}

export function restockReversalCompensatingLedgerId(tenantId: string, purchaseOrderId: string): string {
  return createHash('sha256').update(`restock_rev_comp:${BENTA_RESTOCK_REVERSAL_OPERATION_VERSION}:${tenantId}:${purchaseOrderId}`, 'utf8').digest('hex');
}

export function restockReversalAuditEventId(tenantId: string, reversalId: string): string {
  return createHash('sha256').update(`restock_rev_audit:${tenantId}:${reversalId}`, 'utf8').digest('hex').slice(0, 32);
}

function checkedAddNonNegative(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || left < 0 || !Number.isSafeInteger(right) || right < 0) {
    throw new RestockReversalError(RestockReversalErrorCode.SERVICE_UNAVAILABLE);
  }
  if (left > Number.MAX_SAFE_INTEGER - right) {
    throw new RestockReversalError(RestockReversalErrorCode.SERVICE_UNAVAILABLE);
  }
  return left + right;
}

function sanitizeStoredRestockReversalReceipt(raw: unknown): RestockReversalReceipt | null {
  if (!isPlainRecord(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.reversalId !== 'string' ||
    typeof r.purchaseOrderId !== 'string' ||
    typeof r.voidedAt !== 'string' ||
    typeof r.productCount !== 'number' || !Number.isSafeInteger(r.productCount) || r.productCount < 0 ||
    (r.paymentEffect !== 'cash_refunded' && r.paymentEffect !== 'payable_voided' && r.paymentEffect !== 'external_payment_unmodified') ||
    r.reversalVersion !== RESTOCK_REVERSAL_VERSION
  ) {
    return null;
  }
  return Object.freeze({
    reversalId: r.reversalId,
    purchaseOrderId: r.purchaseOrderId,
    voidedAt: r.voidedAt,
    productCount: r.productCount,
    paymentEffect: r.paymentEffect,
    reversalVersion: r.reversalVersion,
  });
}

function validateDeterministicReversalRecord(
  detReversal: Record<string, unknown>,
  pathTenantId: string,
  purchaseOrderId: string,
  deterministicReversalId: string,
): RestockReversalReceipt {
  if (
    detReversal.id !== deterministicReversalId ||
    detReversal.reversalId !== deterministicReversalId ||
    detReversal.tenantId !== pathTenantId ||
    detReversal.purchaseOrderId !== purchaseOrderId ||
    detReversal.reversalVersion !== RESTOCK_REVERSAL_VERSION
  ) {
    throw new RestockReversalError(RestockReversalErrorCode.REPLAY_INTEGRITY_ERROR);
  }

  const voidReason = detReversal.voidReason;
  if (
    typeof voidReason !== 'string' ||
    voidReason.trim().length < 1 ||
    voidReason.trim().length > 500 ||
    CONTROL_CHAR.test(voidReason)
  ) {
    throw new RestockReversalError(RestockReversalErrorCode.REPLAY_INTEGRITY_ERROR);
  }

  const expectedFingerprint = restockReversalFingerprint(pathTenantId, purchaseOrderId, voidReason);
  if (detReversal.fingerprint !== expectedFingerprint) {
    throw new RestockReversalError(RestockReversalErrorCode.REPLAY_INTEGRITY_ERROR);
  }

  const reversalReceipt = sanitizeStoredRestockReversalReceipt(detReversal.receipt);
  if (
    !reversalReceipt ||
    reversalReceipt.purchaseOrderId !== purchaseOrderId ||
    reversalReceipt.reversalId !== deterministicReversalId ||
    reversalReceipt.reversalVersion !== RESTOCK_REVERSAL_VERSION
  ) {
    throw new RestockReversalError(RestockReversalErrorCode.REPLAY_INTEGRITY_ERROR);
  }

  return reversalReceipt;
}

function receiptsStructurallyEqual(a: RestockReversalReceipt, b: RestockReversalReceipt): boolean {
  return a.reversalId === b.reversalId
    && a.purchaseOrderId === b.purchaseOrderId
    && a.voidedAt === b.voidedAt
    && a.productCount === b.productCount
    && a.paymentEffect === b.paymentEffect
    && a.reversalVersion === b.reversalVersion;
}

interface POItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCostCentavos: number;
  quantityMode?: 'discrete' | 'measured';
  quantityMinor?: number;
  quantityScale?: number;
  supplierCostCentavos: number;
  freightCentavos: number;
  otherAcquisitionCostCentavos: number;
  landedCostCentavos: number;
  latestPurchaseUnitCostCentavos: number;
  restockEventId: string;
  previousPosition: {
    quantityMinor: number;
    quantityScale: number;
    inventoryValueCentavos: number;
    averageUnitCostCentavos: number;
  };
  resultingPosition: {
    quantityMinor: number;
    quantityScale: number;
    inventoryValueCentavos: number;
    averageUnitCostCentavos: number;
  };
  previousLatestPurchaseUnitCostCentavos?: number;
}

function isValidPOItem(item: unknown): item is POItem {
  if (!isPlainRecord(item)) return false;
  const i = item as Record<string, unknown>;
  if (typeof i.productId !== 'string' || !SERVER_IDENTIFIER.test(i.productId)) return false;
  if (typeof i.productName !== 'string') return false;
  if (typeof i.quantity !== 'number' || !Number.isSafeInteger(i.quantity) || i.quantity <= 0) return false;
  if (typeof i.unitCostCentavos !== 'number' || !Number.isSafeInteger(i.unitCostCentavos) || i.unitCostCentavos < 0) return false;
  if (typeof i.supplierCostCentavos !== 'number' || !Number.isSafeInteger(i.supplierCostCentavos) || i.supplierCostCentavos < 0) return false;
  if (typeof i.freightCentavos !== 'number' || !Number.isSafeInteger(i.freightCentavos) || i.freightCentavos < 0) return false;
  if (typeof i.otherAcquisitionCostCentavos !== 'number' || !Number.isSafeInteger(i.otherAcquisitionCostCentavos) || i.otherAcquisitionCostCentavos < 0) return false;
  if (typeof i.landedCostCentavos !== 'number' || !Number.isSafeInteger(i.landedCostCentavos) || i.landedCostCentavos < 0) return false;
  if (typeof i.latestPurchaseUnitCostCentavos !== 'number' || !Number.isSafeInteger(i.latestPurchaseUnitCostCentavos) || i.latestPurchaseUnitCostCentavos < 0) return false;
  if (typeof i.restockEventId !== 'string' || !SERVER_IDENTIFIER.test(i.restockEventId)) return false;
  if (i.quantityMode !== 'discrete' && i.quantityMode !== 'measured') return false;
  if (
    i.previousLatestPurchaseUnitCostCentavos !== undefined &&
    (typeof i.previousLatestPurchaseUnitCostCentavos !== 'number' ||
      !Number.isSafeInteger(i.previousLatestPurchaseUnitCostCentavos) ||
      i.previousLatestPurchaseUnitCostCentavos < 0)
  ) return false;
  if (!isPlainRecord(i.previousPosition)) return false;
  if (!isPlainRecord(i.resultingPosition)) return false;
  const prevPos = i.previousPosition as Record<string, unknown>;
  const resPos = i.resultingPosition as Record<string, unknown>;
  if (typeof prevPos.quantityMinor !== 'number' || !Number.isSafeInteger(prevPos.quantityMinor) || prevPos.quantityMinor < 0) return false;
  if (typeof prevPos.quantityScale !== 'number' || (prevPos.quantityScale !== 0 && prevPos.quantityScale !== 3)) return false;
  if (typeof prevPos.inventoryValueCentavos !== 'number' || !Number.isSafeInteger(prevPos.inventoryValueCentavos) || prevPos.inventoryValueCentavos < 0) return false;
  if (typeof prevPos.averageUnitCostCentavos !== 'number' || !Number.isSafeInteger(prevPos.averageUnitCostCentavos) || prevPos.averageUnitCostCentavos < 0) return false;
  if (typeof resPos.quantityMinor !== 'number' || !Number.isSafeInteger(resPos.quantityMinor) || resPos.quantityMinor < 0) return false;
  if (typeof resPos.quantityScale !== 'number' || (resPos.quantityScale !== 0 && resPos.quantityScale !== 3)) return false;
  if (typeof resPos.inventoryValueCentavos !== 'number' || !Number.isSafeInteger(resPos.inventoryValueCentavos) || resPos.inventoryValueCentavos < 0) return false;
  if (typeof resPos.averageUnitCostCentavos !== 'number' || !Number.isSafeInteger(resPos.averageUnitCostCentavos) || resPos.averageUnitCostCentavos < 0) return false;
  if (i.quantityMode === 'measured') {
    if (typeof i.quantityMinor !== 'number' || !Number.isSafeInteger(i.quantityMinor) || i.quantityMinor <= 0) return false;
    if (typeof i.quantityScale !== 'number' || i.quantityScale !== 3) return false;
  }
  return true;
}

export async function executeBentaRestockReversal(
  pathTenantId: string,
  ownerToken: string,
  request: RestockReversalRequest,
  options: ReversalServiceOptions = {},
): Promise<RestockReversalReceipt> {
  const auth = options.adminAuth ?? getAdminAuth();
  const db = options.adminFirestore ?? getAdminFirestore();
  const now = options.now ?? (() => admin.firestore.Timestamp.now());

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await auth.verifyIdToken(ownerToken);
  } catch {
    throw new RestockReversalError(RestockReversalErrorCode.AUTHENTICATION_REQUIRED);
  }
  const ownerUid = decoded.uid;

  if (typeof ownerUid !== 'string' || ownerUid.length === 0 || !SERVER_IDENTIFIER.test(ownerUid)) {
    throw new RestockReversalError(RestockReversalErrorCode.AUTHENTICATION_REQUIRED);
  }

  const tenantRef = db.collection('tenants').doc(pathTenantId);
  const deterministicReversalId = restockReversalIdDocumentId(pathTenantId, request.purchaseOrderId);
  const deterministicReversalRef = tenantRef.collection('restock_reversals').doc(deterministicReversalId);
  const idempotencyDocId = restockReversalIdempotencyDocumentId(pathTenantId, ownerUid, request.idempotencyKey);
  const idempotencyRef = tenantRef.collection('restock_reversal_idempotency').doc(idempotencyDocId);
  const fingerprint = restockReversalFingerprint(pathTenantId, request.purchaseOrderId, request.reason);

  const committedAt = now();
  const voidedAtIso = committedAt.toDate().toISOString();

  return await db.runTransaction(async (txn) => {
    const [tenantSnap, idempotencySnap, deterministicReversalSnap, poSnap] = await txn.getAll(
      tenantRef,
      idempotencyRef,
      deterministicReversalRef,
      tenantRef.collection('purchase_orders').doc(request.purchaseOrderId),
    );

    if (!tenantSnap.exists) {
      throw new RestockReversalError(RestockReversalErrorCode.TENANT_NOT_FOUND);
    }
    const tenant = tenantSnap.data()!;
    if (tenant.ownerUid !== ownerUid) {
      throw new RestockReversalError(RestockReversalErrorCode.FORBIDDEN);
    }
    if (tenant.subscriptionStatus !== 'active' || tenant.moduleType !== BENTA_SNAP_MODULE_ID) {
      throw new RestockReversalError(RestockReversalErrorCode.TENANT_INELIGIBLE);
    }

    if (idempotencySnap.exists) {
      const stored = idempotencySnap.data()!;
      if (stored.fingerprint !== fingerprint) {
        throw new RestockReversalError(RestockReversalErrorCode.IDEMPOTENCY_CONFLICT);
      }
      if (stored.purchaseOrderId !== request.purchaseOrderId || stored.reversalId !== deterministicReversalId) {
        throw new RestockReversalError(RestockReversalErrorCode.REPLAY_INTEGRITY_ERROR);
      }
      const idempotencyReceipt = sanitizeStoredRestockReversalReceipt(stored.receipt);
      if (
        !idempotencyReceipt ||
        idempotencyReceipt.purchaseOrderId !== request.purchaseOrderId ||
        idempotencyReceipt.reversalId !== deterministicReversalId ||
        idempotencyReceipt.reversalVersion !== RESTOCK_REVERSAL_VERSION
      ) {
        throw new RestockReversalError(RestockReversalErrorCode.REPLAY_INTEGRITY_ERROR);
      }
      if (!deterministicReversalSnap.exists || !poSnap.exists) {
        throw new RestockReversalError(RestockReversalErrorCode.REPLAY_INTEGRITY_ERROR);
      }
      const detReversal = deterministicReversalSnap.data()!;
      const po = poSnap.data()!;

      if (
        po.tenantId !== pathTenantId ||
        po.status !== 'voided' ||
        po.paymentStatus !== 'voided' ||
        typeof po.voidedBy !== 'string' ||
        typeof po.voidReason !== 'string' ||
        po.restockReversalId !== deterministicReversalId ||
        po.reversalVersion !== RESTOCK_REVERSAL_VERSION
      ) {
        throw new RestockReversalError(RestockReversalErrorCode.REPLAY_INTEGRITY_ERROR);
      }

      const reversalReceipt = validateDeterministicReversalRecord(
        detReversal,
        pathTenantId,
        request.purchaseOrderId,
        deterministicReversalId,
      );

      if (!receiptsStructurallyEqual(idempotencyReceipt, reversalReceipt)) {
        throw new RestockReversalError(RestockReversalErrorCode.REPLAY_INTEGRITY_ERROR);
      }

      return idempotencyReceipt;
    }

    if (deterministicReversalSnap.exists) {
      if (!poSnap.exists) {
        throw new RestockReversalError(RestockReversalErrorCode.REPLAY_INTEGRITY_ERROR);
      }
      const detReversal = deterministicReversalSnap.data()!;
      const po = poSnap.data()!;

      if (
        po.tenantId !== pathTenantId ||
        po.status !== 'voided' ||
        po.paymentStatus !== 'voided' ||
        typeof po.voidedBy !== 'string' ||
        typeof po.voidReason !== 'string' ||
        po.restockReversalId !== deterministicReversalId ||
        po.reversalVersion !== RESTOCK_REVERSAL_VERSION
      ) {
        throw new RestockReversalError(RestockReversalErrorCode.REPLAY_INTEGRITY_ERROR);
      }

      const storedReceipt = validateDeterministicReversalRecord(
        detReversal,
        pathTenantId,
        request.purchaseOrderId,
        deterministicReversalId,
      );

      return storedReceipt;
    }

    if (!poSnap.exists) {
      throw new RestockReversalError(RestockReversalErrorCode.PO_NOT_FOUND);
    }
    const po = poSnap.data()!;

    if (po.tenantId !== pathTenantId) {
      throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
    }

    if (po.status === 'voided') {
      throw new RestockReversalError(RestockReversalErrorCode.PO_ALREADY_VOIDED);
    }

    if (po.status !== 'received') {
      throw new RestockReversalError(RestockReversalErrorCode.PO_NOT_REVERSIBLE);
    }

    if (po.costingVersion !== 'moving_average_v1') {
      throw new RestockReversalError(RestockReversalErrorCode.PO_NOT_REVERSIBLE);
    }

    if (po.paymentStatus === 'voided') {
      throw new RestockReversalError(RestockReversalErrorCode.PO_ALREADY_VOIDED);
    }

    if (!Array.isArray(po.items) || po.items.length < 1 || po.items.length > 100) {
      throw new RestockReversalError(RestockReversalErrorCode.PO_NOT_REVERSIBLE);
    }

    const seenProductIds = new Set<string>();
    const seenRestockEventIds = new Set<string>();
    for (const item of po.items) {
      if (!isValidPOItem(item)) {
        throw new RestockReversalError(RestockReversalErrorCode.PO_NOT_REVERSIBLE);
      }
      if (seenProductIds.has(item.productId)) {
        throw new RestockReversalError(RestockReversalErrorCode.PO_NOT_REVERSIBLE);
      }
      seenProductIds.add(item.productId);
      if (seenRestockEventIds.has(item.restockEventId)) {
        throw new RestockReversalError(RestockReversalErrorCode.PO_NOT_REVERSIBLE);
      }
      seenRestockEventIds.add(item.restockEventId);
    }

    if (
      !Array.isArray(po.restockEventIds) ||
      po.restockEventIds.length !== seenRestockEventIds.size ||
      po.restockEventIds.some((eventId: unknown) => typeof eventId !== 'string' || !seenRestockEventIds.has(eventId))
    ) {
      throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
    }

    const totalAmountCentavos = po.totalAmountCentavos;
    if (!Number.isSafeInteger(totalAmountCentavos) || totalAmountCentavos <= 0) {
      throw new RestockReversalError(RestockReversalErrorCode.PO_NOT_REVERSIBLE);
    }

    const paymentMethod = po.paymentMethod;
    const paymentStatus = po.paymentStatus;
    const paidExternally = paymentMethod === 'gcash' || paymentMethod === 'maya';
    const paidFromCash = paymentMethod === 'cash' || paymentMethod === 'cash_drawer';
    const unpaidSupplierCredit = paymentMethod === 'supplier_credit' && paymentStatus === 'credit_unpaid';
    if ((!paidExternally && !paidFromCash && !unpaidSupplierCredit) || ((paidExternally || paidFromCash) && paymentStatus !== 'paid')) {
      throw new RestockReversalError(RestockReversalErrorCode.PAYMENT_EVIDENCE_INVALID);
    }

    const perLineEvidence: Array<Record<string, unknown>> = [];
    const preparedRestorations: Array<{
      productId: string;
      productRef: admin.firestore.DocumentReference;
      productSnap: admin.firestore.DocumentSnapshot;
      item: POItem;
      engineInput: {
        productId: string;
        quantityMode: 'discrete' | 'measured';
        currentPosition: { quantityMinor: number; quantityScale: number; inventoryValueCentavos: number; averageUnitCostCentavos: number };
        storedPreviousPosition: { quantityMinor: number; quantityScale: number; inventoryValueCentavos: number; averageUnitCostCentavos: number };
        storedResultingPosition: { quantityMinor: number; quantityScale: number; inventoryValueCentavos: number; averageUnitCostCentavos: number };
        purchasedQuantityMinor: number;
        supplierCostCentavos: number;
        freightCentavos: number;
        otherAcquisitionCostCentavos: number;
        previousLatestPurchaseUnitCostCentavos?: number;
      };
      engineResult: {
        restoredPosition: { quantityMinor: number; quantityScale: number; inventoryValueCentavos: number; averageUnitCostCentavos: number };
        removedQuantityMinor: number;
        removedInventoryValueCentavos: number;
        recomputedLandedCostCentavos: number;
        latestPurchaseCostRestoration: LatestPurchaseCostRestorationPolicy;
      };
    }> = [];

    for (const item of po.items) {
      const restockEventRef = tenantRef.collection('restock_events').doc(item.restockEventId);
      const restockEventSnap = await txn.get(restockEventRef);

      if (!restockEventSnap.exists) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      const restockEvent = restockEventSnap.data()!;

      if (restockEvent.tenantId !== pathTenantId) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      if (restockEvent.inventoryItemId !== item.productId) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      if (restockEvent.eventId !== item.restockEventId) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      if (typeof restockEvent.idempotencyKey !== 'string' || restockEvent.idempotencyKey.trim().length === 0) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }

      const eventPurchasedQty = restockEvent.purchasedQuantityMinor;
      if (typeof eventPurchasedQty !== 'number' || !Number.isSafeInteger(eventPurchasedQty) || eventPurchasedQty <= 0) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      if (eventPurchasedQty !== item.quantity) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }

      const eventSupplierCost = restockEvent.supplierCostCentavos;
      if (typeof eventSupplierCost !== 'number' || !Number.isSafeInteger(eventSupplierCost) || eventSupplierCost < 0) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      if (eventSupplierCost !== item.supplierCostCentavos) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }

      const eventFreight = restockEvent.freightCentavos;
      if (typeof eventFreight !== 'number' || !Number.isSafeInteger(eventFreight) || eventFreight < 0) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      if (eventFreight !== item.freightCentavos) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }

      const eventOther = restockEvent.otherAcquisitionCostCentavos;
      if (typeof eventOther !== 'number' || !Number.isSafeInteger(eventOther) || eventOther < 0) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      if (eventOther !== item.otherAcquisitionCostCentavos) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }

      const eventLanded = restockEvent.landedCostCentavos;
      if (typeof eventLanded !== 'number' || !Number.isSafeInteger(eventLanded) || eventLanded < 0) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      if (eventLanded !== item.landedCostCentavos) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }

      const eventPrevPos = restockEvent.previousPosition;
      if (!isPlainRecord(eventPrevPos)) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      if (
        eventPrevPos.quantityMinor !== item.previousPosition.quantityMinor ||
        eventPrevPos.quantityScale !== item.previousPosition.quantityScale ||
        eventPrevPos.inventoryValueCentavos !== item.previousPosition.inventoryValueCentavos ||
        eventPrevPos.averageUnitCostCentavos !== item.previousPosition.averageUnitCostCentavos
      ) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }

      const eventResPos = restockEvent.resultingPosition;
      if (!isPlainRecord(eventResPos)) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      if (
        eventResPos.quantityMinor !== item.resultingPosition.quantityMinor ||
        eventResPos.quantityScale !== item.resultingPosition.quantityScale ||
        eventResPos.inventoryValueCentavos !== item.resultingPosition.inventoryValueCentavos ||
        eventResPos.averageUnitCostCentavos !== item.resultingPosition.averageUnitCostCentavos
      ) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }

      const productRef = tenantRef.collection('products').doc(item.productId);
      const productSnap = await txn.get(productRef);

      if (!productSnap.exists) {
        throw new RestockReversalError(RestockReversalErrorCode.PO_NOT_REVERSIBLE);
      }
      const product = productSnap.data()!;

      if (product.tenantId !== pathTenantId) {
        throw new RestockReversalError(RestockReversalErrorCode.FORBIDDEN);
      }

      const isMeasured = item.quantityMode === 'measured';
      const quantityScale = isMeasured ? 3 : 0;

      const costingInput: BentaProductCostingInput = {
        quantityMode: isMeasured ? 'measured' : 'discrete',
        currentStock: isMeasured ? 0 : product.currentStock,
        ...(isMeasured ? { stockQuantityMinor: product.stockQuantityMinor, quantityScale: 3 } : {}),
        costPrice: product.costPrice,
        ...(typeof product.inventoryValueCentavos === 'number' ? { inventoryValueCentavos: product.inventoryValueCentavos } : {}),
        ...(typeof product.averageUnitCostCentavos === 'number' ? { averageUnitCostCentavos: product.averageUnitCostCentavos } : {}),
      };

      let projection;
      try {
        projection = projectBentaProductCostPosition(costingInput);
      } catch {
        throw new RestockReversalError(RestockReversalErrorCode.PO_NOT_REVERSIBLE);
      }

      const quantityMode: 'discrete' | 'measured' = isMeasured ? 'measured' : 'discrete';

      let engineResult: {
        restoredPosition: { quantityMinor: number; quantityScale: number; inventoryValueCentavos: number; averageUnitCostCentavos: number };
        removedQuantityMinor: number;
        removedInventoryValueCentavos: number;
        recomputedLandedCostCentavos: number;
        latestPurchaseCostRestoration: LatestPurchaseCostRestorationPolicy;
      };

      try {
        const engineOutput = evaluateBentaRestockReversalEligibility({
          productId: item.productId,
          quantityMode,
          currentPosition: projection.position,
          storedPreviousPosition: item.previousPosition,
          storedResultingPosition: item.resultingPosition,
          purchasedQuantityMinor: item.quantity,
          supplierCostCentavos: item.supplierCostCentavos,
          freightCentavos: item.freightCentavos,
          otherAcquisitionCostCentavos: item.otherAcquisitionCostCentavos,
          previousLatestPurchaseUnitCostCentavos: item.previousLatestPurchaseUnitCostCentavos,
        });

        engineResult = {
          restoredPosition: engineOutput.restoredPosition,
          removedQuantityMinor: engineOutput.removedQuantityMinor,
          removedInventoryValueCentavos: engineOutput.removedInventoryValueCentavos,
          recomputedLandedCostCentavos: engineOutput.recomputedLandedCostCentavos,
          latestPurchaseCostRestoration: engineOutput.latestPurchaseCostRestoration,
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'BentaRestockReversalEngineError') {
          throw new RestockReversalError(RestockReversalErrorCode.PO_NOT_REVERSIBLE);
        }
        throw new RestockReversalError(RestockReversalErrorCode.SERVICE_UNAVAILABLE);
      }

      perLineEvidence.push({
        productId: item.productId,
        quantityMode,
        purchasedQuantityMinor: item.quantity,
        supplierCostCentavos: item.supplierCostCentavos,
        freightCentavos: item.freightCentavos,
        otherAcquisitionCostCentavos: item.otherAcquisitionCostCentavos,
        landedCostCentavos: item.landedCostCentavos,
        previousPosition: item.previousPosition,
        resultingPosition: item.resultingPosition,
      });

      preparedRestorations.push({
        productId: item.productId,
        productRef,
        productSnap,
        item,
        engineInput: {
          productId: item.productId,
          quantityMode,
          currentPosition: projection.position,
          storedPreviousPosition: item.previousPosition,
          storedResultingPosition: item.resultingPosition,
          purchasedQuantityMinor: item.quantity,
          supplierCostCentavos: item.supplierCostCentavos,
          freightCentavos: item.freightCentavos,
          otherAcquisitionCostCentavos: item.otherAcquisitionCostCentavos,
          previousLatestPurchaseUnitCostCentavos: item.previousLatestPurchaseUnitCostCentavos,
        },
        engineResult,
      });
    }

    let validatedLandedCostTotal = 0;
    for (const restoration of preparedRestorations) {
      if (restoration.engineResult.recomputedLandedCostCentavos !== restoration.item.landedCostCentavos) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      validatedLandedCostTotal = checkedAddNonNegative(
        validatedLandedCostTotal,
        restoration.engineResult.recomputedLandedCostCentavos,
      );
    }
    if (validatedLandedCostTotal !== totalAmountCentavos) {
      throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
    }

    let paymentEffect: PaymentEffect = 'external_payment_unmodified';
    let cashRestoration: {
      masterCashRef: admin.firestore.DocumentReference;
      newBalance: number;
      compensatingLedgerRef: admin.firestore.DocumentReference;
      originalExpenseId: string;
    } | null = null;
    let payableRestoration: { payableRef: admin.firestore.DocumentReference } | null = null;

    if (paymentMethod === 'cash' || paymentMethod === 'cash_drawer') {
      const expenseQuery = tenantRef.collection('transactions').where('poId', '==', request.purchaseOrderId).where('type', '==', 'expense').where('category', '==', 'Restock / Inventory Purchase');
      const expenseQuerySnap = await txn.get(expenseQuery);

      const matchingExpenses = expenseQuerySnap.docs.filter((doc) => {
        const d = doc.data();
        return d.amount === totalAmountCentavos;
      });

      if (matchingExpenses.length !== 1) {
        throw new RestockReversalError(RestockReversalErrorCode.PAYMENT_EVIDENCE_INVALID);
      }

      const expenseDoc = matchingExpenses[0];
      const expenseData = expenseDoc.data();

      if (expenseData.tenantId !== pathTenantId) {
        throw new RestockReversalError(RestockReversalErrorCode.PAYMENT_EVIDENCE_INVALID);
      }
      if (expenseData.amount !== totalAmountCentavos) {
        throw new RestockReversalError(RestockReversalErrorCode.PAYMENT_EVIDENCE_INVALID);
      }

      const masterCashRef = tenantRef.collection('accounts').doc('master-cash');
      const masterCashSnap = await txn.get(masterCashRef);

      if (!masterCashSnap.exists) {
        throw new RestockReversalError(RestockReversalErrorCode.PAYMENT_EVIDENCE_INVALID);
      }
      const masterCashData = masterCashSnap.data()!;

      if (typeof masterCashData.balance !== 'number' || !Number.isSafeInteger(masterCashData.balance) || masterCashData.balance < 0) {
        throw new RestockReversalError(RestockReversalErrorCode.SERVICE_UNAVAILABLE);
      }

      const newBalance = checkedAddNonNegative(masterCashData.balance, totalAmountCentavos);
      if (!Number.isSafeInteger(newBalance)) {
        throw new RestockReversalError(RestockReversalErrorCode.SERVICE_UNAVAILABLE);
      }

      const compLedgerId = restockReversalCompensatingLedgerId(pathTenantId, request.purchaseOrderId);
      const compLedgerRef = tenantRef.collection('transactions').doc(compLedgerId);
      const compLedgerSnap = await txn.get(compLedgerRef);
      if (compLedgerSnap.exists) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }

      paymentEffect = 'cash_refunded';
      cashRestoration = {
        masterCashRef,
        newBalance,
        compensatingLedgerRef: compLedgerRef,
        originalExpenseId: expenseDoc.id,
      };

    } else if (paymentMethod === 'supplier_credit' || paymentStatus === 'credit_unpaid') {
      const payableQuery = tenantRef.collection('credit_accounts').where('poId', '==', request.purchaseOrderId).where('status', '==', 'UNPAID');
      const payableQuerySnap = await txn.get(payableQuery);

      const matchingPayables = payableQuerySnap.docs.filter((doc) => {
        const d = doc.data();
        return d.amountCentavos === totalAmountCentavos;
      });

      if (matchingPayables.length !== 1) {
        throw new RestockReversalError(RestockReversalErrorCode.PAYMENT_EVIDENCE_INVALID);
      }

      const payableDoc = matchingPayables[0];
      const payableData = payableDoc.data();

      if (payableData.tenantId !== undefined && payableData.tenantId !== pathTenantId) {
        throw new RestockReversalError(RestockReversalErrorCode.PAYMENT_EVIDENCE_INVALID);
      }
      if (payableData.amountCentavos !== totalAmountCentavos) {
        throw new RestockReversalError(RestockReversalErrorCode.PAYMENT_EVIDENCE_INVALID);
      }
      if (payableData.status !== 'UNPAID') {
        throw new RestockReversalError(RestockReversalErrorCode.PAYMENT_EVIDENCE_INVALID);
      }

      paymentEffect = 'payable_voided';
      payableRestoration = { payableRef: payableDoc.ref };

    } else {
      paymentEffect = 'external_payment_unmodified';
    }

    const publicReceipt: RestockReversalReceipt = Object.freeze({
      reversalId: deterministicReversalId,
      purchaseOrderId: request.purchaseOrderId,
      voidedAt: voidedAtIso,
      productCount: preparedRestorations.length,
      paymentEffect,
      reversalVersion: RESTOCK_REVERSAL_VERSION,
    });

    const internalEvidence: InternalRestockReversalEvidence = {
      poTenantId: pathTenantId,
      purchaseOrderId: request.purchaseOrderId,
      originalPOId: po.id || request.purchaseOrderId,
      paymentMethod,
      paymentStatus,
      totalAmountCentavos,
      productCount: preparedRestorations.length,
      receipt: publicReceipt,
      normalizedReason: request.reason,
      actorUid: ownerUid,
      voidedAtIso,
      perLineEvidence,
      productRestorations: preparedRestorations.map((r) => ({
        productId: r.productId,
        movementId: restockReversalMovementId(pathTenantId, request.purchaseOrderId, r.productId),
        previousPosition: r.engineInput.currentPosition,
        restoredPosition: r.engineResult.restoredPosition,
        removedQuantityMinor: r.engineResult.removedQuantityMinor,
        removedInventoryValueCentavos: r.engineResult.removedInventoryValueCentavos,
        latestPurchaseCostRestoration: r.engineResult.latestPurchaseCostRestoration,
      })),
    };

    const auditDocId = restockReversalAuditEventId(pathTenantId, deterministicReversalId);
    const auditRef = tenantRef.collection('audit_log').doc(auditDocId);

    const sortedRestorations = [...preparedRestorations].sort((a, b) => a.productId.localeCompare(b.productId));

    // WRITE PHASE — no reads after this point
    for (const restoration of sortedRestorations) {
      const updates: Record<string, unknown> = {
        inventoryValueCentavos: restoration.engineResult.restoredPosition.inventoryValueCentavos,
        averageUnitCostCentavos: restoration.engineResult.restoredPosition.averageUnitCostCentavos,
        costPrice: restoration.engineResult.restoredPosition.averageUnitCostCentavos,
        updatedAt: committedAt,
      };

      if (restoration.item.quantityMode === 'measured') {
        updates.stockQuantityMinor = restoration.engineResult.restoredPosition.quantityMinor;
      } else {
        updates.currentStock = restoration.engineResult.restoredPosition.quantityMinor;
      }

      if (restoration.engineResult.latestPurchaseCostRestoration.policy === 'restore') {
        updates.latestPurchaseUnitCostCentavos = restoration.engineResult.latestPurchaseCostRestoration.value;
      } else {
        updates.latestPurchaseUnitCostCentavos = admin.firestore.FieldValue.delete();
      }

      txn.update(restoration.productRef, updates);

      const movementId = restockReversalMovementId(pathTenantId, request.purchaseOrderId, restoration.productId);
      const movRef = tenantRef.collection('inventory_transactions').doc(movementId);
      txn.create(movRef, {
        id: movementId,
        tenantId: pathTenantId,
        productId: restoration.productId,
        type: 'restock_reversal',
        reversalId: deterministicReversalId,
        poId: request.purchaseOrderId,
        quantity: -restoration.engineResult.removedQuantityMinor,
        ...(restoration.item.quantityMode === 'measured'
          ? { quantityMinor: -restoration.engineResult.removedQuantityMinor, quantityScale: 3 }
          : {}),
        previousPosition: restoration.engineInput.currentPosition,
        restoredPosition: restoration.engineResult.restoredPosition,
        removedQuantityMinor: restoration.engineResult.removedQuantityMinor,
        removedInventoryValueCentavos: restoration.engineResult.removedInventoryValueCentavos,
        latestPurchaseCostRestoration: restoration.engineResult.latestPurchaseCostRestoration,
        performedBy: ownerUid,
        createdAt: committedAt,
      });
    }

    if (paymentEffect === 'cash_refunded') {
      if (!cashRestoration) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      txn.update(cashRestoration.masterCashRef, {
        balance: cashRestoration.newBalance,
        updatedAt: committedAt,
      });

      txn.create(cashRestoration.compensatingLedgerRef, {
        id: cashRestoration.compensatingLedgerRef.id,
        tenantId: pathTenantId,
        accountId: 'master-cash',
        amount: totalAmountCentavos,
        type: 'income',
        category: 'Restock Reversal',
        description: `Reversal of PO ${request.purchaseOrderId}: ${request.reason}`,
        poId: request.purchaseOrderId,
        reversalId: deterministicReversalId,
        originalTransactionId: cashRestoration.originalExpenseId,
        paymentMethod,
        date: committedAt,
        createdAt: committedAt,
      });
    } else if (paymentEffect === 'payable_voided') {
      if (!payableRestoration) {
        throw new RestockReversalError(RestockReversalErrorCode.INTEGRITY_ERROR);
      }
      txn.update(payableRestoration.payableRef, {
        status: 'VOIDED',
        voidedBy: ownerUid,
        voidedAt: committedAt,
        voidReason: request.reason,
        reversalId: deterministicReversalId,
        updatedAt: committedAt,
      });
    }

    txn.update(tenantRef.collection('purchase_orders').doc(request.purchaseOrderId), {
      status: 'voided',
      paymentStatus: 'voided',
      restockReversalId: deterministicReversalId,
      voidReason: request.reason,
      voidedAt: committedAt,
      voidedBy: ownerUid,
      reversalVersion: RESTOCK_REVERSAL_VERSION,
    });

    recordTenantAuditEvent(
      txn,
      tenantRef,
      {
        tenantId: pathTenantId,
        type: 'restock_reversal',
        action: 'restock_reversed',
        actorId: ownerUid,
        purchaseOrderId: request.purchaseOrderId,
        reversalId: deterministicReversalId,
        amountCentavos: totalAmountCentavos,
      },
      committedAt,
      auditRef,
    );

    txn.create(deterministicReversalRef, {
      id: deterministicReversalId,
      tenantId: pathTenantId,
      purchaseOrderId: request.purchaseOrderId,
      reversalId: deterministicReversalId,
      reversalVersion: RESTOCK_REVERSAL_VERSION,
      receipt: publicReceipt,
      fingerprint,
      voidedAt: committedAt,
      voidedBy: ownerUid,
      voidReason: request.reason,
      paymentMethod,
      paymentStatus,
      productCount: preparedRestorations.length,
      totalAmountCentavos,
      internalEvidence,
      createdAt: committedAt,
    });

    txn.create(idempotencyRef, {
      fingerprint,
      purchaseOrderId: request.purchaseOrderId,
      reversalId: deterministicReversalId,
      voidReason: request.reason,
      receipt: publicReceipt,
      createdAt: committedAt,
    });

    return publicReceipt;
  });
}

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token || null;
}

export function createRestockReversalRouteHandler(serviceOptions?: ReversalServiceOptions) {
  return async (request: Request, context: { params: Promise<{ tenantId: string }> }): Promise<Response> => {
    try {
      const { tenantId: pathTenantId } = await context.params;

      if (typeof pathTenantId !== 'string' || !SERVER_IDENTIFIER.test(pathTenantId)) {
        return Response.json(
          { error: 'Invalid request.', category: RestockReversalErrorCode.INVALID_REQUEST },
          { status: 400 },
        );
      }

      const ownerToken = extractBearerToken(request);
      if (!ownerToken) {
        return Response.json(
          { error: 'Authentication required.', category: RestockReversalErrorCode.AUTHENTICATION_REQUIRED },
          { status: 401 },
        );
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { error: 'Invalid request.', category: RestockReversalErrorCode.INVALID_REQUEST },
          { status: 400 },
        );
      }

      const validatedRequest = validateRestockReversalRequest(body);
      const result = await executeBentaRestockReversal(pathTenantId, ownerToken, validatedRequest, serviceOptions ?? {});
      return Response.json(result, { status: 201 });
    } catch (error: unknown) {
      if (error instanceof RestockReversalError) {
        return Response.json(
          { error: error.userMessage, category: error.code },
          { status: error.httpStatus },
        );
      }
      return Response.json(
        { error: 'Service temporarily unavailable.', category: RestockReversalErrorCode.SERVICE_UNAVAILABLE },
        { status: 503 },
      );
    }
  };
}

export { receiptsStructurallyEqual };
