import * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { admitStaffAuthRequest, extractTrustedClientIp, staffAuthRateLimiter } from './rate-limiter';
import { isSecureCashierSystemEnabled } from './secure-cashier-config';
import {
  assertBentaCashierAuthorization, BENTA_SNAP_MODULE_ID, CheckoutError, CheckoutErrorCode,
  hasOnlyRecordKeys, isPlainRecord, sanitizedErrorResponse, SERVER_IDENTIFIER, VerifiedCashierIdentity,
  verifyBentaCashierIdentity
} from './cashier-server-authorization';

export const SHIFT_RECONCILIATION_VERSION = 1;

export interface ShiftAggregates {
  reconciliationVersion: typeof SHIFT_RECONCILIATION_VERSION;
  cashSales: number;
  gcashSales: number;
  mayaSales: number;
  totalShiftSales: number;
  electronicReceipts: number;
  physicalCashAdjustments: 0;
  saleCount: number;
}

export interface ShiftCloseRequest {
  shiftId: string;
  endingCashCentavos: number;
  notes?: string;
}

export interface ShiftReconciliationSummary extends ShiftAggregates {
  shiftId: string;
  startingCashCentavos: number;
  expectedPhysicalCashCentavos: number;
  endingCashCentavos: number;
  discrepancyCentavos: number;
  closedAt: string;
}

export interface SanitizedCurrentShiftReceipt {
  saleId: string;
  receiptNumber: string;
  committedAt: string;
  moduleId: typeof BENTA_SNAP_MODULE_ID;
  paymentMethod: 'cash' | 'gcash' | 'maya';
  shiftId: string;
  cashierDisplayName: string;
  items: Array<{ productId: string; name: string; unit: string; quantity: number; unitPriceCentavos: number; lineTotalCentavos: number }>;
  subtotalCentavos: number;
  totalCentavos: number;
}

export interface ShiftReceiptServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

function safeNonNegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function safeAdd(...values: number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total) || total < 0) throw new CheckoutError(CheckoutErrorCode.RECONCILIATION_INVALID);
  return total;
}

export function assertReconciliationShift(
  documentId: string, value: Record<string, unknown>, identity: VerifiedCashierIdentity, requireOpen = true
): ShiftAggregates & { startingCash: number } {
  if (!SERVER_IDENTIFIER.test(documentId) || value.id !== documentId) {
    throw new CheckoutError(CheckoutErrorCode.RECONCILIATION_INVALID);
  }
  if (value.tenantId !== identity.tenantId || value.staffId !== identity.actorId || (requireOpen && value.status !== 'open')) {
    throw new CheckoutError(CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED);
  }
  if (value.moduleId !== BENTA_SNAP_MODULE_ID || value.staffAccountId !== identity.staffAccountId || value.openedBy !== identity.actorId) {
    throw new CheckoutError(CheckoutErrorCode.RECONCILIATION_INVALID);
  }
  const fields = ['startingCash', 'cashSales', 'gcashSales', 'mayaSales', 'totalShiftSales', 'electronicReceipts', 'physicalCashAdjustments', 'saleCount'] as const;
  if (value.reconciliationVersion !== SHIFT_RECONCILIATION_VERSION || fields.some((field) => !safeNonNegative(value[field])) || value.physicalCashAdjustments !== 0) {
    throw new CheckoutError(CheckoutErrorCode.RECONCILIATION_INVALID);
  }
  const cashSales = value.cashSales as number;
  const gcashSales = value.gcashSales as number;
  const mayaSales = value.mayaSales as number;
  if (value.totalShiftSales !== safeAdd(cashSales, gcashSales, mayaSales) || value.electronicReceipts !== safeAdd(gcashSales, mayaSales)) {
    throw new CheckoutError(CheckoutErrorCode.RECONCILIATION_INVALID);
  }
  return value as unknown as ShiftAggregates & { startingCash: number };
}

export function applySaleToShift(
  shift: ShiftAggregates & { startingCash: number }, paymentMethod: 'cash' | 'gcash' | 'maya', amount: number
): ShiftAggregates {
  if (!safeNonNegative(amount)) throw new CheckoutError(CheckoutErrorCode.RECONCILIATION_INVALID);
  const cashSales = safeAdd(shift.cashSales, paymentMethod === 'cash' ? amount : 0);
  const gcashSales = safeAdd(shift.gcashSales, paymentMethod === 'gcash' ? amount : 0);
  const mayaSales = safeAdd(shift.mayaSales, paymentMethod === 'maya' ? amount : 0);
  return {
    reconciliationVersion: SHIFT_RECONCILIATION_VERSION,
    cashSales, gcashSales, mayaSales,
    totalShiftSales: safeAdd(cashSales, gcashSales, mayaSales),
    electronicReceipts: safeAdd(gcashSales, mayaSales),
    physicalCashAdjustments: 0,
    saleCount: safeAdd(shift.saleCount, 1)
  };
}

export function validateShiftCloseRequest(value: unknown): ShiftCloseRequest {
  if (!isPlainRecord(value) || !hasOnlyRecordKeys(value, ['shiftId', 'endingCashCentavos', 'notes']) ||
      typeof value.shiftId !== 'string' || !SERVER_IDENTIFIER.test(value.shiftId) || !safeNonNegative(value.endingCashCentavos)) {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }
  let notes: string | undefined;
  if (value.notes !== undefined) {
    if (typeof value.notes !== 'string' || value.notes.length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value.notes)) {
      throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
    }
    notes = value.notes.trim();
  }
  return { shiftId: value.shiftId, endingCashCentavos: value.endingCashCentavos as number, ...(notes ? { notes } : {}) };
}

function timestampIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate: () => Date }).toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export async function closeBentaCashierShift(
  idToken: string, requestValue: unknown, options: ShiftReceiptServiceOptions = {}
): Promise<ShiftReconciliationSummary> {
  const auth = options.adminAuth || getAdminAuth();
  const identity = await verifyBentaCashierIdentity(idToken, auth);
  const request = validateShiftCloseRequest(requestValue);
  const db = options.adminFirestore || getAdminFirestore();
  const tenantRef = db.collection('tenants').doc(identity.tenantId);
  const staffRef = tenantRef.collection('staff_accounts').doc(identity.staffAccountId);
  const shiftRef = tenantRef.collection('shifts').doc(request.shiftId);
  const auditRef = tenantRef.collection('audit_log').doc();
  const closedAt = (options.now || admin.firestore.Timestamp.now)();
  try {
    return await db.runTransaction(async (transaction) => {
      const [tenantSnap, staffSnap, shiftSnap] = await transaction.getAll(tenantRef, staffRef, shiftRef);
      const staff = assertBentaCashierAuthorization(identity, tenantSnap, staffSnap);
      if (staff.activeShiftId !== request.shiftId) throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
      if (!shiftSnap.exists) throw new CheckoutError(CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED);
      const shift = assertReconciliationShift(shiftSnap.id, shiftSnap.data()!, identity);
      const expectedPhysicalCash = safeAdd(shift.startingCash, shift.cashSales, shift.physicalCashAdjustments);
      const discrepancy = request.endingCashCentavos - expectedPhysicalCash;
      if (!Number.isSafeInteger(discrepancy)) throw new CheckoutError(CheckoutErrorCode.RECONCILIATION_INVALID);
      const summary: ShiftReconciliationSummary = {
        shiftId: request.shiftId, reconciliationVersion: SHIFT_RECONCILIATION_VERSION,
        startingCashCentavos: shift.startingCash, cashSales: shift.cashSales, gcashSales: shift.gcashSales, mayaSales: shift.mayaSales,
        totalShiftSales: shift.totalShiftSales, electronicReceipts: shift.electronicReceipts, physicalCashAdjustments: 0,
        saleCount: shift.saleCount, expectedPhysicalCashCentavos: expectedPhysicalCash,
        endingCashCentavos: request.endingCashCentavos, discrepancyCentavos: discrepancy, closedAt: closedAt.toDate().toISOString()
      };
      transaction.update(shiftRef, {
        status: 'closed', endingCash: request.endingCashCentavos, expectedPhysicalCash, discrepancy,
        closedAt, closedBy: identity.actorId, reconciliationSummary: summary, ...(request.notes ? { notes: request.notes } : {})
      });
      transaction.update(staffRef, { activeShiftId: admin.firestore.FieldValue.delete(), updatedAt: closedAt });
      transaction.create(auditRef, {
        id: auditRef.id, tenantId: identity.tenantId, type: 'cashier_shift_reconciliation', action: 'close_shift',
        actorId: identity.actorId, staffAccountId: identity.staffAccountId, shiftId: request.shiftId,
        totalShiftSales: shift.totalShiftSales, expectedPhysicalCash, endingCash: request.endingCashCentavos,
        discrepancy, createdAt: closedAt
      });
      return summary;
    });
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    throw new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE);
  }
}

export async function getCurrentShiftReceipt(
  idToken: string, saleId: string, options: ShiftReceiptServiceOptions = {}
): Promise<SanitizedCurrentShiftReceipt> {
  const auth = options.adminAuth || getAdminAuth();
  const identity = await verifyBentaCashierIdentity(idToken, auth);
  if (!SERVER_IDENTIFIER.test(saleId)) throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  const db = options.adminFirestore || getAdminFirestore();
  const tenantRef = db.collection('tenants').doc(identity.tenantId);
  const staffRef = tenantRef.collection('staff_accounts').doc(identity.staffAccountId);
  const saleRef = tenantRef.collection('sales').doc(saleId);
  try {
    return await db.runTransaction(async (transaction) => {
      const [tenantSnap, staffSnap, saleSnap] = await transaction.getAll(tenantRef, staffRef, saleRef);
      const staff = assertBentaCashierAuthorization(identity, tenantSnap, staffSnap);
      if (!saleSnap.exists) throw new CheckoutError(CheckoutErrorCode.RECEIPT_UNAVAILABLE);
      const sale = saleSnap.data()!;
      if (typeof staff.activeShiftId !== 'string' || !SERVER_IDENTIFIER.test(staff.activeShiftId) || sale.tenantId !== identity.tenantId || sale.staffAccountId !== identity.staffAccountId || sale.actorId !== identity.actorId ||
          sale.moduleId !== BENTA_SNAP_MODULE_ID || typeof sale.shiftId !== 'string' || !SERVER_IDENTIFIER.test(sale.shiftId)) {
        throw new CheckoutError(CheckoutErrorCode.RECEIPT_UNAVAILABLE);
      }
      if (sale.shiftId !== staff.activeShiftId) throw new CheckoutError(CheckoutErrorCode.RECEIPT_UNAVAILABLE);
      const activeShiftSnap = await transaction.get(tenantRef.collection('shifts').doc(staff.activeShiftId));
      if (!activeShiftSnap.exists || activeShiftSnap.id !== sale.shiftId) throw new CheckoutError(CheckoutErrorCode.RECEIPT_UNAVAILABLE);
      try { assertReconciliationShift(activeShiftSnap.id, activeShiftSnap.data()!, identity); } catch { throw new CheckoutError(CheckoutErrorCode.RECEIPT_UNAVAILABLE); }
      if (!Array.isArray(sale.items) || !safeNonNegative(sale.subtotalAmount) || !safeNonNegative(sale.totalAmount) || sale.discountAmount !== 0 ||
          (sale.paymentMethod !== 'cash' && sale.paymentMethod !== 'gcash' && sale.paymentMethod !== 'maya')) {
        throw new CheckoutError(CheckoutErrorCode.RECEIPT_UNAVAILABLE);
      }
      const items = sale.items.map((item: unknown) => {
        if (!isPlainRecord(item) || typeof item.productId !== 'string' || !SERVER_IDENTIFIER.test(item.productId) ||
            typeof item.name !== 'string' || !item.name.trim() || typeof item.unit !== 'string' || !item.unit.trim() ||
            !safeNonNegative(item.quantity) || item.quantity === 0 || !safeNonNegative(item.price) || !safeNonNegative(item.lineTotal) ||
            item.lineTotal !== item.price * item.quantity || !Number.isSafeInteger(item.lineTotal)) {
          throw new CheckoutError(CheckoutErrorCode.RECEIPT_UNAVAILABLE);
        }
        return { productId: item.productId, name: item.name, unit: item.unit, quantity: item.quantity, unitPriceCentavos: item.price, lineTotalCentavos: item.lineTotal };
      });
      const calculatedSubtotal = items.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
      if (!Number.isSafeInteger(calculatedSubtotal) || calculatedSubtotal !== sale.subtotalAmount || sale.totalAmount !== sale.subtotalAmount) {
        throw new CheckoutError(CheckoutErrorCode.RECEIPT_UNAVAILABLE);
      }
      const committedAt = timestampIso(sale.createdAt || sale.transactionDate);
      if (!committedAt) throw new CheckoutError(CheckoutErrorCode.RECEIPT_UNAVAILABLE);
      const cashierDisplayName = typeof staff.displayName === 'string' && staff.displayName.trim() ? staff.displayName :
        typeof staff.username === 'string' && staff.username.trim() ? staff.username : 'Cashier';
      return {
        saleId: saleSnap.id, receiptNumber: saleSnap.id, committedAt, moduleId: BENTA_SNAP_MODULE_ID,
        paymentMethod: sale.paymentMethod, shiftId: sale.shiftId, cashierDisplayName, items,
        subtotalCentavos: sale.subtotalAmount, totalCentavos: sale.totalAmount
      };
    });
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    throw new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE);
  }
}

interface RouteAdmissionDependencies {
  enabled: () => boolean;
  extractClientIp: (headers: Headers) => string | null;
  admitNetworkRequest: (networkIdentifier: string) => Promise<{ isLimited: boolean; retryAfterSeconds: number; reason?: 'account' | 'network' | 'global' | 'unavailable' }>;
}

async function admittedBearer(
  request: Request,
  deps: RouteAdmissionDependencies,
  useInjectedAdmission: boolean
): Promise<{ token?: string; response?: Response }> {
  if (!deps.enabled()) return { response: sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.CHECKOUT_UNAVAILABLE)) };
  const clientIp = useInjectedAdmission ? deps.extractClientIp(request.headers) : null;
  if (useInjectedAdmission && !clientIp) return { response: sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE)) };
  const admission = useInjectedAdmission
    ? await deps.admitNetworkRequest(clientIp!)
    : await admitStaffAuthRequest(request.headers);
  if (admission.isLimited) {
    const error = new CheckoutError(admission.reason === 'unavailable' ? CheckoutErrorCode.SERVICE_UNAVAILABLE : CheckoutErrorCode.CHECKOUT_UNAVAILABLE);
    return { response: Response.json({ error: error.userMessage, category: error.code }, { status: admission.reason === 'unavailable' ? 503 : 429, headers: { 'Retry-After': String(Math.max(1, admission.retryAfterSeconds)) } }) };
  }
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '');
  return match ? { token: match[1] } : { response: sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.AUTHENTICATION_REQUIRED)) };
}

export function createBentaShiftCloseRouteHandler(overrides: Partial<RouteAdmissionDependencies & { closeShift: (token: string, body: unknown) => Promise<unknown> }> = {}, serviceOptions?: ShiftReceiptServiceOptions) {
  const deps = {
    enabled: isSecureCashierSystemEnabled, extractClientIp: extractTrustedClientIp,
    admitNetworkRequest: (networkIdentifier: string) => staffAuthRateLimiter.admitNetworkRequest(networkIdentifier),
    closeShift: (token: string, body: unknown) => closeBentaCashierShift(token, body, serviceOptions), ...overrides
  };
  return async (request: Request): Promise<Response> => {
    try {
      const admitted = await admittedBearer(request, deps, Boolean(overrides.admitNetworkRequest));
      if (admitted.response) return admitted.response;
      if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.INVALID_REQUEST));
      let body: unknown;
      try { body = await request.json(); } catch { return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.INVALID_REQUEST)); }
      return Response.json(await deps.closeShift(admitted.token!, body), { status: 200 });
    } catch (error) { return sanitizedErrorResponse(error instanceof CheckoutError ? error : new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE)); }
  };
}

export function createBentaReceiptRouteHandler(overrides: Partial<RouteAdmissionDependencies & { getReceipt: (token: string, saleId: string) => Promise<unknown> }> = {}, serviceOptions?: ShiftReceiptServiceOptions) {
  const deps = {
    enabled: isSecureCashierSystemEnabled, extractClientIp: extractTrustedClientIp,
    admitNetworkRequest: (networkIdentifier: string) => staffAuthRateLimiter.admitNetworkRequest(networkIdentifier),
    getReceipt: (token: string, saleId: string) => getCurrentShiftReceipt(token, saleId, serviceOptions), ...overrides
  };
  return async (request: Request): Promise<Response> => {
    try {
      const admitted = await admittedBearer(request, deps, Boolean(overrides.admitNetworkRequest));
      if (admitted.response) return admitted.response;
      const saleId = new URL(request.url).searchParams.get('saleId') || '';
      return Response.json(await deps.getReceipt(admitted.token!, saleId), { status: 200 });
    } catch (error) { return sanitizedErrorResponse(error instanceof CheckoutError ? error : new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE)); }
  };
}
