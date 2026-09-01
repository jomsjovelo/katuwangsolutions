import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  BENTA_SALE_REVERSAL_OPERATION_VERSION,
  restoreExactPoolInventoryPosition,
  restoreOfflineVarianceInventoryPosition,
  reverseSaleFromShiftAggregates,
  type BentaShiftAggregates,
  type BentaShiftPaymentMethod,
} from '../shared/benta-sale-reversal-engine';
import { BENTA_INVENTORY_COSTING_VERSION, isBentaExactPoolCostedSale } from '../shared/benta-sale-mutation-guard';
import { projectBentaProductCostPosition } from '../shared/benta-inventory-costing-adapter';
import { SERVER_IDENTIFIER } from './cashier-server-authorization';
import { recordTenantAuditEvent } from './audit-events';

export const BENTA_SNAP_MODULE_ID = 'benta-snap' as const;
export const REVERSAL_VERSION = 1 as const;

export enum ReversalErrorCode {
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  FORBIDDEN = 'FORBIDDEN',
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  TENANT_INELIGIBLE = 'TENANT_INELIGIBLE',
  SALE_NOT_FOUND = 'SALE_NOT_FOUND',
  SALE_NOT_REVERSIBLE = 'SALE_NOT_REVERSIBLE',
  SALE_ALREADY_VOIDED = 'SALE_ALREADY_VOIDED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  REVERSAL_INTEGRITY_ERROR = 'REVERSAL_INTEGRITY_ERROR',
  LEDGER_ERROR = 'LEDGER_ERROR',
  SHIFT_ERROR = 'SHIFT_ERROR',
  UNDERFLOW = 'UNDERFLOW',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

const ERROR_DETAILS: Record<ReversalErrorCode, { status: number; message: string }> = {
  [ReversalErrorCode.AUTHENTICATION_REQUIRED]: { status: 401, message: 'Authentication required.' },
  [ReversalErrorCode.FORBIDDEN]: { status: 403, message: 'Operation not permitted.' },
  [ReversalErrorCode.TENANT_NOT_FOUND]: { status: 404, message: 'Tenant not found.' },
  [ReversalErrorCode.TENANT_INELIGIBLE]: { status: 403, message: 'Tenant is inactive or not eligible for Benta Snap.' },
  [ReversalErrorCode.SALE_NOT_FOUND]: { status: 404, message: 'Sale not found.' },
  [ReversalErrorCode.SALE_NOT_REVERSIBLE]: { status: 409, message: 'Sale cannot be reversed.' },
  [ReversalErrorCode.SALE_ALREADY_VOIDED]: { status: 409, message: 'Sale has already been voided.' },
  [ReversalErrorCode.INVALID_REQUEST]: { status: 400, message: 'Invalid request.' },
  [ReversalErrorCode.IDEMPOTENCY_CONFLICT]: { status: 409, message: 'Idempotency conflict.' },
  [ReversalErrorCode.REVERSAL_INTEGRITY_ERROR]: { status: 409, message: 'Reversal integrity error.' },
  [ReversalErrorCode.LEDGER_ERROR]: { status: 409, message: 'Ledger error.' },
  [ReversalErrorCode.SHIFT_ERROR]: { status: 409, message: 'Shift error.' },
  [ReversalErrorCode.UNDERFLOW]: { status: 409, message: 'Account balance would go negative.' },
  [ReversalErrorCode.SERVICE_UNAVAILABLE]: { status: 503, message: 'Service temporarily unavailable.' },
};

export class ReversalError extends Error {
  readonly code: ReversalErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;

  constructor(code: ReversalErrorCode) {
    const detail = ERROR_DETAILS[code] || { status: 503, message: 'Service temporarily unavailable.' };
    super(detail.message);
    this.name = 'ReversalError';
    this.code = code;
    this.httpStatus = detail.status;
    this.userMessage = detail.message;
  }
}

export interface SaleReversalRequest {
  saleId: string;
  idempotencyKey: string;
  reason: string;
}

export interface SaleReversalReceipt {
  reversalId: string;
  saleId: string;
  voidedAt: string;
  paymentMethod: BentaShiftPaymentMethod;
  productCount: number;
  shiftStatus: 'open' | 'closed';
  reversalVersion: typeof REVERSAL_VERSION;
}

export interface ReversalServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

export interface InternalReversalEvidence {
  saleTenantId: string;
  saleId: string;
  originalShiftId: string;
  originalShiftStatus: 'open' | 'closed';
  paymentMethod: BentaShiftPaymentMethod;
  totalAmountCentavos: number;
  authoritativeAccountId: string;
  originalIncomeLedgerId: string;
  compensatingLedgerId: string;
  receipt: SaleReversalReceipt;
  normalizedReason: string;
  actorUid: string;
  voidedAtIso: string;
  perLineEvidence: Array<Record<string, unknown>>;
  perProductAggregation: Array<Record<string, unknown>>;
  productRestorations: Array<{
    productId: string;
    movementId: string;
    previousPosition: Record<string, unknown>;
    resultingPosition: Record<string, unknown>;
    lineCostCentavos: number;
    actualInventoryReliefCentavos: number;
    signedVarianceCentavos: number;
  }>;
  unappliedOnlyEvidence: Array<Record<string, unknown>>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyRecordKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHAR = /[\u0000-\u001F\u007F]/;

export function validateReversalRequest(
  rawBody: unknown,
): SaleReversalRequest {
  if (!isPlainRecord(rawBody)) {
    throw new ReversalError(ReversalErrorCode.INVALID_REQUEST);
  }

  const allowedKeys = ['saleId', 'idempotencyKey', 'reason'];
  if (!hasOnlyRecordKeys(rawBody, allowedKeys)) {
    throw new ReversalError(ReversalErrorCode.INVALID_REQUEST);
  }

  const { saleId, idempotencyKey, reason } = rawBody;

  if (typeof saleId !== 'string' || !SERVER_IDENTIFIER.test(saleId)) {
    throw new ReversalError(ReversalErrorCode.INVALID_REQUEST);
  }

  if (typeof idempotencyKey !== 'string' || !UUID_V4.test(idempotencyKey)) {
    throw new ReversalError(ReversalErrorCode.INVALID_REQUEST);
  }

  if (typeof reason !== 'string') {
    throw new ReversalError(ReversalErrorCode.INVALID_REQUEST);
  }

  const normalizedReason = reason.trim();
  if (normalizedReason.length < 1 || normalizedReason.length > 500) {
    throw new ReversalError(ReversalErrorCode.INVALID_REQUEST);
  }

  if (CONTROL_CHAR.test(normalizedReason)) {
    throw new ReversalError(ReversalErrorCode.INVALID_REQUEST);
  }

  return Object.freeze({
    saleId,
    idempotencyKey,
    reason: normalizedReason,
  });
}

export function reversalIdDocumentId(tenantId: string, saleId: string): string {
  return createHash('sha256').update(`rev:${BENTA_SALE_REVERSAL_OPERATION_VERSION}:${tenantId}:${saleId}`, 'utf8').digest('hex');
}

export function reversalIdempotencyDocumentId(tenantId: string, ownerUid: string, idempotencyKey: string): string {
  return createHash('sha256').update(`rev_idem:${BENTA_SALE_REVERSAL_OPERATION_VERSION}:${tenantId}:${ownerUid}:${idempotencyKey}`, 'utf8').digest('hex');
}

export function reversalFingerprint(
  tenantId: string,
  saleId: string,
  reason: string,
): string {
  const canonical = {
    v: BENTA_SALE_REVERSAL_OPERATION_VERSION,
    tenantId,
    saleId,
    reason,
  };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

export function compensatingLedgerId(tenantId: string, saleId: string): string {
  return createHash('sha256').update(`rev_comp:${BENTA_SALE_REVERSAL_OPERATION_VERSION}:${tenantId}:${saleId}`, 'utf8').digest('hex');
}

export function inventoryMovementId(tenantId: string, saleId: string, productId: string): string {
  return createHash('sha256').update(`rev_mov:${BENTA_SALE_REVERSAL_OPERATION_VERSION}:${tenantId}:${saleId}:${productId}`, 'utf8').digest('hex');
}

export function auditEventId(tenantId: string, reversalId: string): string {
  return createHash('sha256').update(`rev_audit:${tenantId}:${reversalId}`, 'utf8').digest('hex').slice(0, 32);
}

function checkedAddNonNegative(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || left < 0 || !Number.isSafeInteger(right) || right < 0) {
    throw new ReversalError(ReversalErrorCode.SERVICE_UNAVAILABLE);
  }
  if (left > Number.MAX_SAFE_INTEGER - right) {
    throw new ReversalError(ReversalErrorCode.SERVICE_UNAVAILABLE);
  }
  return left + right;
}

function checkedAddSigned(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw new ReversalError(ReversalErrorCode.SERVICE_UNAVAILABLE);
  }
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new ReversalError(ReversalErrorCode.SERVICE_UNAVAILABLE);
  }
  return result;
}

function safeSubtract(current: number, amount: number): number {
  if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(amount) || amount < 0) {
    throw new ReversalError(ReversalErrorCode.SERVICE_UNAVAILABLE);
  }
  if (amount > current) {
    throw new ReversalError(ReversalErrorCode.UNDERFLOW);
  }
  return current - amount;
}

function receiptsStructurallyEqual(a: SaleReversalReceipt, b: SaleReversalReceipt): boolean {
  return a.reversalId === b.reversalId
    && a.saleId === b.saleId
    && a.voidedAt === b.voidedAt
    && a.paymentMethod === b.paymentMethod
    && a.productCount === b.productCount
    && a.shiftStatus === b.shiftStatus
    && a.reversalVersion === b.reversalVersion;
}

function sanitizeStoredReceipt(raw: unknown): SaleReversalReceipt | null {
  if (!isPlainRecord(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.reversalId !== 'string' ||
    typeof r.saleId !== 'string' ||
    typeof r.voidedAt !== 'string' ||
    (r.paymentMethod !== 'cash' && r.paymentMethod !== 'gcash' && r.paymentMethod !== 'maya') ||
    typeof r.productCount !== 'number' || !Number.isSafeInteger(r.productCount) || r.productCount < 0 ||
    (r.shiftStatus !== 'open' && r.shiftStatus !== 'closed') ||
    r.reversalVersion !== REVERSAL_VERSION
  ) {
    return null;
  }
  return Object.freeze({
    reversalId: r.reversalId,
    saleId: r.saleId,
    voidedAt: r.voidedAt,
    paymentMethod: r.paymentMethod as BentaShiftPaymentMethod,
    productCount: r.productCount,
    shiftStatus: r.shiftStatus as 'open' | 'closed',
    reversalVersion: r.reversalVersion as typeof REVERSAL_VERSION,
  });
}

function validateDeterministicReversalRecord(
  detReversal: Record<string, unknown>,
  pathTenantId: string,
  saleId: string,
  deterministicReversalId: string,
  sale: Record<string, unknown>,
): SaleReversalReceipt {
  if (
    detReversal.id !== deterministicReversalId ||
    detReversal.reversalId !== deterministicReversalId ||
    detReversal.tenantId !== pathTenantId ||
    detReversal.saleId !== saleId ||
    detReversal.reversalVersion !== REVERSAL_VERSION
  ) {
    throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
  }

  const voidReason = detReversal.voidReason;
  if (
    typeof voidReason !== 'string' ||
    voidReason.trim().length < 1 ||
    voidReason.trim().length > 500 ||
    CONTROL_CHAR.test(voidReason)
  ) {
    throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
  }

  const expectedFingerprint = reversalFingerprint(pathTenantId, saleId, voidReason);
  if (detReversal.fingerprint !== expectedFingerprint) {
    throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
  }

  if (sale.voidReason !== voidReason) {
    throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
  }

  const reversalReceipt = sanitizeStoredReceipt(detReversal.receipt);
  if (
    !reversalReceipt ||
    reversalReceipt.saleId !== saleId ||
    reversalReceipt.reversalId !== deterministicReversalId ||
    reversalReceipt.reversalVersion !== REVERSAL_VERSION
  ) {
    throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
  }

  return reversalReceipt;
}

interface ProductAggregation {
  productId: string;
  quantityMode: 'discrete' | 'measured';
  quantityScale?: number;
  soldQuantity: number;
  appliedQuantity: number;
  unappliedQuantity: number;
  lineCostCentavos: number;
  inventoryCostReliefCentavos: number;
  costVarianceCentavos: number;
  isUnappliedOnly: boolean;
}

interface SaleLine {
  productId: string;
  quantity?: number;
  quantityMinor?: number;
  quantityScale?: number;
  sellingUnit?: string;
  unitCostCentavos?: number;
  lineCostCentavos?: number;
  appliedQuantity?: number;
  unappliedQuantity?: number;
  inventoryCostReliefCentavos?: number;
  costVarianceCentavos?: number;
  misc?: boolean;
}

export async function executeBentaSaleReversal(
  pathTenantId: string,
  ownerToken: string,
  request: SaleReversalRequest,
  options: ReversalServiceOptions = {},
): Promise<SaleReversalReceipt> {
  const auth = options.adminAuth ?? getAdminAuth();
  const db = options.adminFirestore ?? getAdminFirestore();
  const now = options.now ?? (() => admin.firestore.Timestamp.now());

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await auth.verifyIdToken(ownerToken);
  } catch {
    throw new ReversalError(ReversalErrorCode.AUTHENTICATION_REQUIRED);
  }
  const ownerUid = decoded.uid;

  if (typeof ownerUid !== 'string' || ownerUid.length === 0 || !SERVER_IDENTIFIER.test(ownerUid)) {
    throw new ReversalError(ReversalErrorCode.AUTHENTICATION_REQUIRED);
  }

  const tenantRef = db.collection('tenants').doc(pathTenantId);
  const deterministicReversalId = reversalIdDocumentId(pathTenantId, request.saleId);
  const deterministicReversalRef = tenantRef.collection('sale_reversals').doc(deterministicReversalId);
  const idempotencyDocId = reversalIdempotencyDocumentId(pathTenantId, ownerUid, request.idempotencyKey);
  const idempotencyRef = tenantRef.collection('reversal_idempotency').doc(idempotencyDocId);
  const fingerprint = reversalFingerprint(pathTenantId, request.saleId, request.reason);

  const committedAt = now();
  const voidedAtIso = committedAt.toDate().toISOString();

  return await db.runTransaction(async (txn) => {
    const [tenantSnap, idempotencySnap, deterministicReversalSnap, saleSnap] = await txn.getAll(
      tenantRef,
      idempotencyRef,
      deterministicReversalRef,
      tenantRef.collection('sales').doc(request.saleId),
    );

    if (!tenantSnap.exists) {
      throw new ReversalError(ReversalErrorCode.TENANT_NOT_FOUND);
    }
    const tenant = tenantSnap.data()!;
    if (tenant.ownerUid !== ownerUid) {
      throw new ReversalError(ReversalErrorCode.FORBIDDEN);
    }
    if (tenant.subscriptionStatus !== 'active' || tenant.moduleType !== BENTA_SNAP_MODULE_ID) {
      throw new ReversalError(ReversalErrorCode.TENANT_INELIGIBLE);
    }

    if (idempotencySnap.exists) {
      const stored = idempotencySnap.data()!;
      if (stored.fingerprint !== fingerprint) {
        throw new ReversalError(ReversalErrorCode.IDEMPOTENCY_CONFLICT);
      }
      if (stored.saleId !== request.saleId || stored.reversalId !== deterministicReversalId) {
        throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
      }
      const idempotencyReceipt = sanitizeStoredReceipt(stored.receipt);
      if (
        !idempotencyReceipt ||
        idempotencyReceipt.saleId !== request.saleId ||
        idempotencyReceipt.reversalId !== deterministicReversalId ||
        idempotencyReceipt.reversalVersion !== REVERSAL_VERSION
      ) {
        throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
      }
      if (!deterministicReversalSnap.exists || !saleSnap.exists) {
        throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
      }
      const detReversal = deterministicReversalSnap.data()!;
      const sale = saleSnap.data()!;

      if (
        sale.tenantId !== pathTenantId ||
        sale.status !== 'voided' ||
        typeof sale.voidedBy !== 'string' ||
        typeof sale.voidReason !== 'string' ||
        sale.reversalId !== deterministicReversalId ||
        sale.reversalVersion !== REVERSAL_VERSION
      ) {
        throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
      }

      const reversalReceipt = validateDeterministicReversalRecord(
        detReversal,
        pathTenantId,
        request.saleId,
        deterministicReversalId,
        sale,
      );

      if (!receiptsStructurallyEqual(idempotencyReceipt, reversalReceipt)) {
        throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
      }

      return idempotencyReceipt;
    }

    if (deterministicReversalSnap.exists) {
      if (!saleSnap.exists) {
        throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
      }
      const detReversal = deterministicReversalSnap.data()!;
      const sale = saleSnap.data()!;

      if (
        sale.tenantId !== pathTenantId ||
        sale.status !== 'voided' ||
        typeof sale.voidedBy !== 'string' ||
        typeof sale.voidReason !== 'string' ||
        sale.reversalId !== deterministicReversalId ||
        sale.reversalVersion !== REVERSAL_VERSION
      ) {
        throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
      }

      const storedReceipt = validateDeterministicReversalRecord(
        detReversal,
        pathTenantId,
        request.saleId,
        deterministicReversalId,
        sale,
      );

      return storedReceipt;
    }

    if (!saleSnap.exists) {
      throw new ReversalError(ReversalErrorCode.SALE_NOT_FOUND);
    }
    const sale = saleSnap.data()!;

    if (sale.tenantId !== pathTenantId) {
      throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
    }

    const saleStatus = sale.status;
    if (saleStatus === 'voided') {
      throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
    }
    if (saleStatus !== undefined && saleStatus !== 'completed') {
      throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
    }

    if (sale.moduleId !== BENTA_SNAP_MODULE_ID) {
      throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
    }

    if (sale.costingVersion !== BENTA_INVENTORY_COSTING_VERSION) {
      if (!isBentaExactPoolCostedSale(sale)) {
        throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
      }
    }

    if (!Array.isArray(sale.items) || sale.items.length === 0) {
      throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
    }

    const paymentMethod = sale.paymentMethod;
    if (paymentMethod !== 'cash' && paymentMethod !== 'gcash' && paymentMethod !== 'maya') {
      throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
    }

    const totalAmount = sale.totalAmount;
    if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
      throw new ReversalError(ReversalErrorCode.LEDGER_ERROR);
    }

    const isOfflineSync = sale.isOfflineSync === true;
    const saleShiftId = sale.shiftId;

    if (typeof saleShiftId !== 'string' || !SERVER_IDENTIFIER.test(saleShiftId)) {
      throw new ReversalError(ReversalErrorCode.SHIFT_ERROR);
    }

    const ledgerQuery = tenantRef.collection('transactions').where('saleId', '==', request.saleId);
    const ledgerQuerySnap = await txn.get(ledgerQuery);

    const incomeLedgers = ledgerQuerySnap.docs.filter((doc) => {
      const d = doc.data();
      return d.type === 'income';
    });

    if (incomeLedgers.length !== 1) {
      throw new ReversalError(ReversalErrorCode.LEDGER_ERROR);
    }

    const incomeLedgerDoc = incomeLedgers[0];
    const incomeLedgerId = incomeLedgerDoc.id;
    const incomeLedger = incomeLedgerDoc.data();
    if (incomeLedger.tenantId !== pathTenantId) {
      throw new ReversalError(ReversalErrorCode.LEDGER_ERROR);
    }
    if (incomeLedger.saleId !== request.saleId) {
      throw new ReversalError(ReversalErrorCode.LEDGER_ERROR);
    }

    if (incomeLedger.shiftId !== saleShiftId) {
      throw new ReversalError(ReversalErrorCode.LEDGER_ERROR);
    }

    const ledgerAmount = incomeLedger.amount;
    if (!Number.isSafeInteger(ledgerAmount) || ledgerAmount <= 0) {
      throw new ReversalError(ReversalErrorCode.LEDGER_ERROR);
    }

    if (ledgerAmount !== totalAmount) {
      throw new ReversalError(ReversalErrorCode.LEDGER_ERROR);
    }

    const ledgerAccountId = incomeLedger.accountId;
    if (typeof ledgerAccountId !== 'string' || !SERVER_IDENTIFIER.test(ledgerAccountId)) {
      throw new ReversalError(ReversalErrorCode.LEDGER_ERROR);
    }

    if (incomeLedger.paymentMethod !== undefined && incomeLedger.paymentMethod !== paymentMethod) {
      throw new ReversalError(ReversalErrorCode.LEDGER_ERROR);
    }

    const compensatingLedgerDocId = compensatingLedgerId(pathTenantId, request.saleId);
    const compLedgerRef = tenantRef.collection('transactions').doc(compensatingLedgerDocId);
    const compLedgerSnap = await txn.get(compLedgerRef);
    if (compLedgerSnap.exists) {
      throw new ReversalError(ReversalErrorCode.REVERSAL_INTEGRITY_ERROR);
    }

    const accountRef = tenantRef.collection('accounts').doc(ledgerAccountId);
    const accountSnap = await txn.get(accountRef);
    if (!accountSnap.exists) {
      throw new ReversalError(ReversalErrorCode.LEDGER_ERROR);
    }
    const accountData = accountSnap.data()!;
    if (accountData.tenantId !== pathTenantId) {
      throw new ReversalError(ReversalErrorCode.FORBIDDEN);
    }

    const accountOldBalance = accountData.balance;
    if (!Number.isSafeInteger(accountOldBalance) || accountOldBalance < 0) {
      throw new ReversalError(ReversalErrorCode.SERVICE_UNAVAILABLE);
    }

    const newAccountBalance = safeSubtract(accountOldBalance, ledgerAmount);
    if (!Number.isSafeInteger(newAccountBalance) || newAccountBalance < 0) {
      throw new ReversalError(ReversalErrorCode.UNDERFLOW);
    }

    const aggregationMap = new Map<string, ProductAggregation>();
    const perLineEvidence: Array<Record<string, unknown>> = [];

    for (const lineRaw of sale.items) {
      if (!isPlainRecord(lineRaw)) {
        throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
      }
      if (typeof lineRaw.productId !== 'string' || !SERVER_IDENTIFIER.test(lineRaw.productId)) {
        throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
      }
      const line = lineRaw as unknown as SaleLine;

      if (line.misc === true || line.productId.startsWith('misc-')) {
        perLineEvidence.push({
          productId: line.productId,
          isMisc: true,
        });
        continue;
      }

      const quantityMode: 'discrete' | 'measured' = line.quantityMinor !== undefined ? 'measured' : 'discrete';
      const lineQuantityScale = quantityMode === 'measured' ? (line.quantityScale ?? 3) : undefined;
      const soldQuantity = quantityMode === 'measured' ? (line.quantityMinor ?? 0) : (line.quantity ?? 0);

      if (!Number.isSafeInteger(soldQuantity) || soldQuantity <= 0) {
        throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
      }

      if (isOfflineSync) {
        if (line.appliedQuantity === undefined || line.unappliedQuantity === undefined ||
            line.inventoryCostReliefCentavos === undefined || line.costVarianceCentavos === undefined) {
          throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
        }

        if (typeof line.lineCostCentavos !== 'number' || !Number.isSafeInteger(line.lineCostCentavos) || line.lineCostCentavos < 0) {
          throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
        }

        const appliedQuantity = line.appliedQuantity;
        const unappliedQuantity = line.unappliedQuantity;
        const inventoryCostReliefCentavos = line.inventoryCostReliefCentavos;
        const costVarianceCentavos = line.costVarianceCentavos;

        if (!Number.isSafeInteger(appliedQuantity) || appliedQuantity < 0 ||
            !Number.isSafeInteger(unappliedQuantity) || unappliedQuantity < 0 ||
            !Number.isSafeInteger(inventoryCostReliefCentavos) || inventoryCostReliefCentavos < 0 ||
            !Number.isSafeInteger(costVarianceCentavos)) {
          throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
        }

        if (checkedAddNonNegative(appliedQuantity, unappliedQuantity) !== soldQuantity) {
          throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
        }

        if (BigInt(line.lineCostCentavos) !== BigInt(inventoryCostReliefCentavos) + BigInt(costVarianceCentavos)) {
          throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
        }

        if (appliedQuantity === 0 && inventoryCostReliefCentavos !== 0) {
          throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
        }

        const existing = aggregationMap.get(line.productId);
        if (existing) {
          if (existing.quantityMode !== quantityMode || (quantityMode === 'measured' && existing.quantityScale !== lineQuantityScale)) {
            throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
          }
          existing.soldQuantity = checkedAddNonNegative(existing.soldQuantity, soldQuantity);
          existing.appliedQuantity = checkedAddNonNegative(existing.appliedQuantity, appliedQuantity);
          existing.unappliedQuantity = checkedAddNonNegative(existing.unappliedQuantity, unappliedQuantity);
          existing.lineCostCentavos = checkedAddNonNegative(existing.lineCostCentavos, line.lineCostCentavos);
          existing.inventoryCostReliefCentavos = checkedAddNonNegative(existing.inventoryCostReliefCentavos, inventoryCostReliefCentavos);
          existing.costVarianceCentavos = checkedAddSigned(existing.costVarianceCentavos, costVarianceCentavos);
        } else {
          aggregationMap.set(line.productId, {
            productId: line.productId,
            quantityMode,
            quantityScale: lineQuantityScale,
            soldQuantity,
            appliedQuantity,
            unappliedQuantity,
            lineCostCentavos: line.lineCostCentavos,
            inventoryCostReliefCentavos,
            costVarianceCentavos,
            isUnappliedOnly: appliedQuantity === 0 && inventoryCostReliefCentavos === 0 && unappliedQuantity > 0,
          });
        }

        perLineEvidence.push({
          productId: line.productId,
          quantityMode,
          soldQuantity,
          appliedQuantity,
          unappliedQuantity,
          lineCostCentavos: line.lineCostCentavos,
          inventoryCostReliefCentavos,
          costVarianceCentavos,
          isUnappliedOnly: appliedQuantity === 0,
        });
      } else {
        if (line.appliedQuantity !== undefined || line.unappliedQuantity !== undefined ||
            line.inventoryCostReliefCentavos !== undefined || line.costVarianceCentavos !== undefined) {
          throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
        }

        const lineCostCentavos = line.lineCostCentavos;
        if (typeof lineCostCentavos !== 'number' || !Number.isSafeInteger(lineCostCentavos) || lineCostCentavos < 0) {
          throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
        }

        const existing = aggregationMap.get(line.productId);
        if (existing) {
          if (existing.quantityMode !== quantityMode || (quantityMode === 'measured' && existing.quantityScale !== lineQuantityScale)) {
            throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
          }
          existing.soldQuantity = checkedAddNonNegative(existing.soldQuantity, soldQuantity);
          existing.appliedQuantity = checkedAddNonNegative(existing.appliedQuantity, soldQuantity);
          existing.lineCostCentavos = checkedAddNonNegative(existing.lineCostCentavos, lineCostCentavos);
          existing.inventoryCostReliefCentavos = checkedAddNonNegative(existing.inventoryCostReliefCentavos, lineCostCentavos);
        } else {
          aggregationMap.set(line.productId, {
            productId: line.productId,
            quantityMode,
            quantityScale: lineQuantityScale,
            soldQuantity,
            appliedQuantity: soldQuantity,
            unappliedQuantity: 0,
            lineCostCentavos,
            inventoryCostReliefCentavos: lineCostCentavos,
            costVarianceCentavos: 0,
            isUnappliedOnly: false,
          });
        }

        perLineEvidence.push({
          productId: line.productId,
          quantityMode,
          soldQuantity,
          lineCostCentavos,
          costVarianceCentavos: 0,
        });
      }
    }

    for (const agg of aggregationMap.values()) {
      agg.isUnappliedOnly = agg.appliedQuantity === 0 && agg.inventoryCostReliefCentavos === 0 && agg.unappliedQuantity > 0;
      if (agg.appliedQuantity === 0 && agg.inventoryCostReliefCentavos !== 0) {
        throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
      }
      const lhs = BigInt(agg.lineCostCentavos);
      const rhs = BigInt(agg.inventoryCostReliefCentavos) + BigInt(agg.costVarianceCentavos);
      if (lhs !== rhs) {
        throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
      }
    }

    const unappliedOnlyEvidence: Array<Record<string, unknown>> = [];
    const restoredProductIds: string[] = [];
    let productCount = 0;

    for (const agg of aggregationMap.values()) {
      if (agg.appliedQuantity === 0 && agg.inventoryCostReliefCentavos === 0 && agg.unappliedQuantity > 0) {
        unappliedOnlyEvidence.push({
          productId: agg.productId,
          quantityMode: agg.quantityMode,
          unappliedQuantity: agg.unappliedQuantity,
          lineCostCentavos: agg.lineCostCentavos,
          costVarianceCentavos: agg.costVarianceCentavos,
        });
        continue;
      }
      restoredProductIds.push(agg.productId);
      productCount++;
    }

    const sortedProductIds = restoredProductIds.slice().sort((a, b) => a.localeCompare(b));
    const productRefs = sortedProductIds.map((pid) => tenantRef.collection('products').doc(pid));

    const productSnaps: admin.firestore.DocumentSnapshot[] = [];
    for (const ref of productRefs) {
      const snap = await txn.get(ref);
      productSnaps.push(snap);
    }

    interface PreparedRestoration {
      productId: string;
      productRef: admin.firestore.DocumentReference;
      aggregation: ProductAggregation;
      productUpdates: Record<string, unknown>;
      movementDoc: Record<string, unknown>;
      movementId: string;
      previousPosition: Record<string, unknown>;
      resultingPosition: Record<string, unknown>;
    }

    const preparedRestorations: PreparedRestoration[] = [];

    for (let i = 0; i < sortedProductIds.length; i++) {
      const productId = sortedProductIds[i];
      const aggregation = aggregationMap.get(productId)!;
      const snap = productSnaps[i];

      if (!snap.exists) {
        throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
      }

      const product = snap.data()!;
      if (product.tenantId !== pathTenantId) {
        throw new ReversalError(ReversalErrorCode.FORBIDDEN);
      }

      let projection;
      try {
        projection = projectBentaProductCostPosition({
          quantityMode: aggregation.quantityMode,
          currentStock: aggregation.quantityMode === 'discrete' ? product.currentStock : undefined,
          stockQuantityMinor: aggregation.quantityMode === 'measured' ? product.stockQuantityMinor : undefined,
          quantityScale: aggregation.quantityMode === 'measured' ? (product.quantityScale ?? 3) : undefined,
          costPrice: product.costPrice,
          inventoryValueCentavos: product.inventoryValueCentavos,
          averageUnitCostCentavos: product.averageUnitCostCentavos,
        });
      } catch {
        throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
      }

      if (projection.source !== 'exact-pool') {
        throw new ReversalError(ReversalErrorCode.SALE_NOT_REVERSIBLE);
      }

      let engineResult: {
        restoredQuantityMinor: number;
        restoredInventoryValueCentavos: number;
        restoredPosition: { quantityMinor: number; quantityScale: number; inventoryValueCentavos: number; averageUnitCostCentavos: number };
      };

      if (isOfflineSync) {
        engineResult = restoreOfflineVarianceInventoryPosition({
          currentPosition: projection.position,
          soldQuantity: aggregation.soldQuantity,
          appliedQuantity: aggregation.appliedQuantity,
          unappliedQuantity: aggregation.unappliedQuantity,
          lineCostCentavos: aggregation.lineCostCentavos,
          inventoryCostReliefCentavos: aggregation.inventoryCostReliefCentavos,
          costVarianceCentavos: aggregation.costVarianceCentavos,
        });
      } else {
        engineResult = restoreExactPoolInventoryPosition({
          currentPosition: projection.position,
          soldQuantity: aggregation.soldQuantity,
          lineCostCentavos: aggregation.lineCostCentavos,
        });
      }

      const productUpdates: Record<string, unknown> = {};
      if (aggregation.quantityMode === 'discrete') {
        productUpdates.currentStock = engineResult.restoredQuantityMinor;
      } else {
        productUpdates.stockQuantityMinor = engineResult.restoredQuantityMinor;
      }
      productUpdates.inventoryValueCentavos = engineResult.restoredInventoryValueCentavos;
      productUpdates.averageUnitCostCentavos = engineResult.restoredPosition.averageUnitCostCentavos;
      productUpdates.costPrice = engineResult.restoredPosition.averageUnitCostCentavos;
      productUpdates.updatedAt = committedAt;

      const movementId = inventoryMovementId(pathTenantId, request.saleId, productId);

      const movementDoc: Record<string, unknown> = {
        id: movementId,
        tenantId: pathTenantId,
        productId,
        reversalId: deterministicReversalId,
        saleId: request.saleId,
        shiftId: saleShiftId,
        type: 'sale_reversal',
        quantityMode: aggregation.quantityMode,
        previousPosition: {
          quantityMinor: projection.position.quantityMinor,
          quantityScale: projection.position.quantityScale,
          inventoryValueCentavos: projection.position.inventoryValueCentavos,
          averageUnitCostCentavos: projection.position.averageUnitCostCentavos,
        },
        restoredPosition: {
          quantityMinor: engineResult.restoredPosition.quantityMinor,
          quantityScale: engineResult.restoredPosition.quantityScale,
          inventoryValueCentavos: engineResult.restoredPosition.inventoryValueCentavos,
          averageUnitCostCentavos: engineResult.restoredPosition.averageUnitCostCentavos,
        },
        performedBy: ownerUid,
        createdAt: committedAt,
      };

      if (isOfflineSync) {
        movementDoc.soldQuantity = aggregation.soldQuantity;
        movementDoc.appliedQuantity = aggregation.appliedQuantity;
        movementDoc.unappliedQuantity = aggregation.unappliedQuantity;
        movementDoc.lineCostCentavos = aggregation.lineCostCentavos;
        movementDoc.actualInventoryReliefCentavos = aggregation.inventoryCostReliefCentavos;
        movementDoc.signedVarianceCentavos = aggregation.costVarianceCentavos;
      } else {
        movementDoc.soldQuantity = aggregation.soldQuantity;
        movementDoc.lineCostCentavos = aggregation.lineCostCentavos;
        movementDoc.actualInventoryReliefCentavos = aggregation.inventoryCostReliefCentavos;
        movementDoc.signedVarianceCentavos = 0;
      }

      preparedRestorations.push({
        productId,
        productRef: snap.ref,
        aggregation,
        productUpdates,
        movementDoc,
        movementId,
        previousPosition: {
          quantityMinor: projection.position.quantityMinor,
          quantityScale: projection.position.quantityScale,
          inventoryValueCentavos: projection.position.inventoryValueCentavos,
          averageUnitCostCentavos: projection.position.averageUnitCostCentavos,
        },
        resultingPosition: {
          quantityMinor: engineResult.restoredPosition.quantityMinor,
          quantityScale: engineResult.restoredPosition.quantityScale,
          inventoryValueCentavos: engineResult.restoredPosition.inventoryValueCentavos,
          averageUnitCostCentavos: engineResult.restoredPosition.averageUnitCostCentavos,
        },
      });
    }

    const shiftRef = tenantRef.collection('shifts').doc(saleShiftId);
    const shiftSnap = await txn.get(shiftRef);

    if (!shiftSnap.exists) {
      throw new ReversalError(ReversalErrorCode.SHIFT_ERROR);
    }

    const shiftData = shiftSnap.data()!;
    if (shiftData.tenantId !== pathTenantId) {
      throw new ReversalError(ReversalErrorCode.SHIFT_ERROR);
    }

    const shiftStatus: 'open' | 'closed' = shiftData.status === 'open' ? 'open'
      : shiftData.status === 'closed' ? 'closed'
      : (() => { throw new ReversalError(ReversalErrorCode.SHIFT_ERROR); })();

    let shiftAggregatePatch: BentaShiftAggregates | null = null;

    if (shiftStatus === 'open') {
      const requiredFields = [
        'reconciliationVersion', 'cashSales', 'gcashSales', 'mayaSales',
        'totalShiftSales', 'electronicReceipts', 'physicalCashAdjustments', 'saleCount'
      ];
      for (const field of requiredFields) {
        if (typeof shiftData[field] !== 'number' || !Number.isSafeInteger(shiftData[field]) || (shiftData[field] as number) < 0) {
          throw new ReversalError(ReversalErrorCode.SHIFT_ERROR);
        }
      }
      if (shiftData.reconciliationVersion !== 1) {
        throw new ReversalError(ReversalErrorCode.SHIFT_ERROR);
      }

      const shiftAggregates: BentaShiftAggregates = {
        reconciliationVersion: shiftData.reconciliationVersion,
        cashSales: shiftData.cashSales,
        gcashSales: shiftData.gcashSales,
        mayaSales: shiftData.mayaSales,
        totalShiftSales: shiftData.totalShiftSales,
        electronicReceipts: shiftData.electronicReceipts,
        physicalCashAdjustments: shiftData.physicalCashAdjustments,
        saleCount: shiftData.saleCount,
      };

      const reversalResult = reverseSaleFromShiftAggregates({
        shift: shiftAggregates,
        paymentMethod,
        amountCentavos: ledgerAmount,
      });

      shiftAggregatePatch = reversalResult.aggregatePatch;
    }

    const publicReceipt: SaleReversalReceipt = Object.freeze({
      reversalId: deterministicReversalId,
      saleId: request.saleId,
      voidedAt: voidedAtIso,
      paymentMethod,
      productCount,
      shiftStatus,
      reversalVersion: REVERSAL_VERSION,
    });

    const internalEvidence: InternalReversalEvidence = {
      saleTenantId: pathTenantId,
      saleId: request.saleId,
      originalShiftId: saleShiftId,
      originalShiftStatus: shiftStatus,
      paymentMethod,
      totalAmountCentavos: totalAmount,
      authoritativeAccountId: ledgerAccountId,
      originalIncomeLedgerId: incomeLedgerId,
      compensatingLedgerId: compensatingLedgerDocId,
      receipt: publicReceipt,
      normalizedReason: request.reason,
      actorUid: ownerUid,
      voidedAtIso,
      perLineEvidence,
      perProductAggregation: [...aggregationMap.values()].map((a) => ({
        productId: a.productId,
        quantityMode: a.quantityMode,
        soldQuantity: a.soldQuantity,
        appliedQuantity: a.appliedQuantity,
        unappliedQuantity: a.unappliedQuantity,
        lineCostCentavos: a.lineCostCentavos,
        inventoryCostReliefCentavos: a.inventoryCostReliefCentavos,
        costVarianceCentavos: a.costVarianceCentavos,
        isUnappliedOnly: a.isUnappliedOnly,
      })),
      productRestorations: preparedRestorations.map((r) => ({
        productId: r.productId,
        movementId: r.movementId,
        previousPosition: r.previousPosition,
        resultingPosition: r.resultingPosition,
        lineCostCentavos: r.aggregation.lineCostCentavos,
        actualInventoryReliefCentavos: r.aggregation.inventoryCostReliefCentavos,
        signedVarianceCentavos: r.aggregation.costVarianceCentavos,
      })),
      unappliedOnlyEvidence,
    };

    const auditDocId = auditEventId(pathTenantId, deterministicReversalId);
    const auditRef = tenantRef.collection('audit_log').doc(auditDocId);

    // WRITE PHASE — no reads after this point
    txn.update(tenantRef.collection('sales').doc(request.saleId), {
      status: 'voided',
      voidedAt: committedAt,
      voidedBy: ownerUid,
      voidReason: request.reason,
      reversalId: deterministicReversalId,
      reversalVersion: REVERSAL_VERSION,
    });

    for (const restoration of preparedRestorations) {
      txn.update(restoration.productRef, restoration.productUpdates);
      const movRef = tenantRef.collection('inventory_transactions').doc(restoration.movementId);
      txn.create(movRef, restoration.movementDoc);
    }

    txn.update(accountRef, {
      balance: newAccountBalance,
      updatedAt: committedAt,
    });

    if (shiftStatus === 'open' && shiftAggregatePatch) {
      txn.update(shiftRef, { ...shiftAggregatePatch, updatedAt: committedAt });
    }

    txn.create(compLedgerRef, {
      id: compensatingLedgerDocId,
      tenantId: pathTenantId,
      accountId: ledgerAccountId,
      amount: ledgerAmount,
      type: 'expense',
      category: 'Sale Reversal',
      description: `Reversal of sale ${request.saleId}: ${request.reason}`,
      saleId: request.saleId,
      reversalId: deterministicReversalId,
      originalIncomeLedgerId: incomeLedgerId,
      shiftId: saleShiftId,
      paymentMethod,
      date: committedAt,
      createdAt: committedAt,
    });

    recordTenantAuditEvent(
      txn,
      tenantRef,
      {
        tenantId: pathTenantId,
        type: 'sale_reversal',
        action: 'sale_reversed',
        actorId: ownerUid,
        saleId: request.saleId,
        shiftId: saleShiftId,
        reversalId: deterministicReversalId,
        amountCentavos: ledgerAmount,
        paymentMethod,
      },
      committedAt,
      auditRef,
    );

    txn.create(deterministicReversalRef, {
      id: deterministicReversalId,
      tenantId: pathTenantId,
      saleId: request.saleId,
      reversalId: deterministicReversalId,
      reversalVersion: REVERSAL_VERSION,
      receipt: publicReceipt,
      fingerprint,
      voidedAt: committedAt,
      voidedBy: ownerUid,
      voidReason: request.reason,
      paymentMethod,
      shiftId: saleShiftId,
      shiftStatus,
      productCount,
      originalIncomeLedgerId: incomeLedgerId,
      originalShiftStatus: shiftStatus,
      authoritativeAccountId: ledgerAccountId,
      totalAmountCentavos: totalAmount,
      compensatingLedgerId: compensatingLedgerDocId,
      internalEvidence,
      createdAt: committedAt,
    });

    txn.create(idempotencyRef, {
      fingerprint,
      saleId: request.saleId,
      reversalId: deterministicReversalId,
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

export function createSaleReversalRouteHandler(serviceOptions?: ReversalServiceOptions) {
  return async (request: Request, context: { params: Promise<{ tenantId: string }> }): Promise<Response> => {
    try {
      const { tenantId: pathTenantId } = await context.params;

      if (typeof pathTenantId !== 'string' || !SERVER_IDENTIFIER.test(pathTenantId)) {
        return Response.json(
          { error: 'Invalid request.', category: ReversalErrorCode.INVALID_REQUEST },
          { status: 400 },
        );
      }

      const ownerToken = extractBearerToken(request);
      if (!ownerToken) {
        return Response.json(
          { error: 'Authentication required.', category: ReversalErrorCode.AUTHENTICATION_REQUIRED },
          { status: 401 },
        );
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { error: 'Invalid request.', category: ReversalErrorCode.INVALID_REQUEST },
          { status: 400 },
        );
      }

      const validatedRequest = validateReversalRequest(body);
      const result = await executeBentaSaleReversal(pathTenantId, ownerToken, validatedRequest, serviceOptions ?? {});
      return Response.json(result, { status: 201 });
    } catch (error: unknown) {
      if (error instanceof ReversalError) {
        return Response.json(
          { error: error.userMessage, category: error.code },
          { status: error.httpStatus },
        );
      }
      return Response.json(
        { error: 'Service temporarily unavailable.', category: ReversalErrorCode.SERVICE_UNAVAILABLE },
        { status: 503 },
      );
    }
  };
}

export { receiptsStructurallyEqual };
