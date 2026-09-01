import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { admitStaffAuthRequest, extractTrustedClientIp, staffAuthRateLimiter } from './rate-limiter';
import { isSecureCashierSystemEnabled } from './secure-cashier-config';
import {
  assertBentaCashierAuthorization, BENTA_SNAP_MODULE_ID, CheckoutError, CheckoutErrorCode,
  hasOnlyRecordKeys, isPlainRecord, sanitizedErrorResponse, SERVER_IDENTIFIER, verifyBentaCashierIdentity
} from './cashier-server-authorization';
import { applySaleToShift, assertReconciliationShift } from './benta-cashier-shift-receipt';
import { computeLineFinancials } from '../shared/quantity-math';
import { consumeBentaProductSale } from '../shared/benta-inventory-costing-adapter';
import { BENTA_INVENTORY_COSTING_VERSION } from '../shared/benta-sale-mutation-guard';
export { BENTA_SNAP_MODULE_ID, CheckoutError, CheckoutErrorCode } from './cashier-server-authorization';
export type CheckoutPaymentMethod = 'cash' | 'gcash' | 'maya';

export type CheckoutRequestItem =
  | { productId: string; quantityMode?: 'discrete'; quantity: number }
  | { productId: string; quantityMode: 'measured'; quantityMinor: number; quantityScale: number; sellingUnit: string };

export interface CheckoutRequest {
  idempotencyKey: string;
  moduleId: typeof BENTA_SNAP_MODULE_ID;
  shiftId: string;
  items: CheckoutRequestItem[];
  paymentMethod: CheckoutPaymentMethod;
  paymentReference?: string;
}

export interface CheckoutReceipt {
  saleId: string;
  receiptNumber: string;
  committedAt: string;
  moduleId: typeof BENTA_SNAP_MODULE_ID;
  paymentMethod: CheckoutPaymentMethod;
  shiftId: string;
  cashierDisplayName: string;
  items: Array<{
    productId: string;
    name: string;
    unit: string;
    quantity: number;
    unitPriceCentavos: number;
    lineTotalCentavos: number;
    quantityMode?: 'discrete' | 'measured';
    quantityMinor?: number;
    quantityScale?: number;
    sellingUnit?: string;
  }>;
  subtotalCentavos: number;
  totalCentavos: number;
}

export interface CheckoutServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_REFERENCE = /^[A-Za-z0-9 ._\/-]{1,80}$/;

export function validateCheckoutRequest(value: unknown): CheckoutRequest {
  if (!isPlainRecord(value) || !hasOnlyRecordKeys(value, ['idempotencyKey', 'moduleId', 'shiftId', 'items', 'paymentMethod', 'paymentReference'])) {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }
  const { idempotencyKey, moduleId, shiftId, items, paymentMethod, paymentReference } = value;
  if (typeof idempotencyKey !== 'string' || !UUID.test(idempotencyKey) || moduleId !== BENTA_SNAP_MODULE_ID ||
      typeof shiftId !== 'string' || !SERVER_IDENTIFIER.test(shiftId) || !Array.isArray(items) || items.length < 1 || items.length > 100 ||
      (paymentMethod !== 'cash' && paymentMethod !== 'gcash' && paymentMethod !== 'maya')) {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }
  const normalizedReference = typeof paymentReference === 'string' ? paymentReference.trim() : paymentReference;
  if ((paymentMethod === 'cash' && paymentReference !== undefined) ||
      (normalizedReference !== undefined && (typeof normalizedReference !== 'string' || !PAYMENT_REFERENCE.test(normalizedReference)))) {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }
  const seen = new Set<string>();
  const normalizedItems = items.map((item) => {
    if (!isPlainRecord(item) || typeof item.productId !== 'string' || !SERVER_IDENTIFIER.test(item.productId) || seen.has(item.productId)) {
      throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
    }
    seen.add(item.productId);

    if (item.quantityMode === 'measured') {
      if (!hasOnlyRecordKeys(item, ['productId', 'quantityMode', 'quantityMinor', 'quantityScale', 'sellingUnit']) ||
          !Number.isInteger(item.quantityMinor) || (item.quantityMinor as number) < 1 || (item.quantityMinor as number) > 100_000_000 ||
          !Number.isInteger(item.quantityScale) || (item.quantityScale as number) < 1 || (item.quantityScale as number) > 6 ||
          typeof item.sellingUnit !== 'string' || !SERVER_IDENTIFIER.test(item.sellingUnit)) {
        throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
      }
      return {
        productId: item.productId,
        quantityMode: 'measured' as const,
        quantityMinor: item.quantityMinor as number,
        quantityScale: item.quantityScale as number,
        sellingUnit: item.sellingUnit as string
      };
    } else {
      // Legacy or explicit discrete
      const keys = item.quantityMode === 'discrete' ? ['productId', 'quantityMode', 'quantity'] : ['productId', 'quantity'];
      if (!hasOnlyRecordKeys(item, keys) || !Number.isInteger(item.quantity) || (item.quantity as number) < 1 || (item.quantity as number) > 10_000) {
        throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
      }
      return {
        productId: item.productId,
        ...(item.quantityMode === 'discrete' ? { quantityMode: 'discrete' as const } : {}),
        quantity: item.quantity as number
      };
    }
  });
  return {
    idempotencyKey,
    moduleId,
    shiftId,
    items: normalizedItems,
    paymentMethod,
    ...(normalizedReference !== undefined ? { paymentReference: normalizedReference } : {})
  };
}

export function checkoutIdempotencyDocumentId(staffAccountId: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${staffAccountId}:${idempotencyKey}`, 'utf8').digest('hex');
}

export function checkoutFingerprint(
  staffAccountId: string,
  request: {
    moduleId: string;
    shiftId: string;
    items: CheckoutRequestItem[];
    paymentMethod: string;
    paymentReference?: string;
  }
): string {
  const normalizedItems = [...request.items]
    .map((item) => {
      if (item.quantityMode === 'measured') {
        return { productId: item.productId, quantityMode: 'measured', quantityMinor: item.quantityMinor, quantityScale: item.quantityScale, sellingUnit: item.sellingUnit };
      }
      return { productId: item.productId, quantity: item.quantity };
    })
    .sort((a, b) => a.productId.localeCompare(b.productId));

  const canonical = {
    actor: staffAccountId,
    module: request.moduleId,
    shift: request.shiftId,
    items: normalizedItems,
    paymentMethod: request.paymentMethod,
    paymentReference: request.paymentReference || ''
  };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
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

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function completeBentaCashierCheckout(
  idToken: string,
  requestValue: unknown,
  options: CheckoutServiceOptions = {}
): Promise<CheckoutReceipt> {
  const auth = options.adminAuth || getAdminAuth();
  const identity = await verifyBentaCashierIdentity(idToken, auth);
  const { tenantId, staffAccountId } = identity;
  const request = validateCheckoutRequest(requestValue);
  const db = options.adminFirestore || getAdminFirestore();

  const tenantRef = db.collection('tenants').doc(tenantId);
  const staffRef = tenantRef.collection('staff_accounts').doc(staffAccountId);
  const shiftRef = tenantRef.collection('shifts').doc(request.shiftId);
  const idempotencyRef = tenantRef.collection('cashier_checkout_idempotency').doc(checkoutIdempotencyDocumentId(staffAccountId, request.idempotencyKey));
  const targetAccountId = request.paymentMethod === 'gcash'
    ? 'gcash-settlement'
    : request.paymentMethod === 'maya'
    ? 'maya-settlement'
    : 'master-cash';
  const targetAccountName = request.paymentMethod === 'gcash'
    ? 'GCash Settlement'
    : request.paymentMethod === 'maya'
    ? 'Maya Settlement'
    : 'Main Cash Register';

  const accountRef = tenantRef.collection('accounts').doc(targetAccountId);
  const productRefs = [...request.items].sort((a, b) => a.productId.localeCompare(b.productId)).map((item) => tenantRef.collection('products').doc(item.productId));
  const saleRef = tenantRef.collection('sales').doc();
  const ledgerRef = tenantRef.collection('transactions').doc();
  const auditRef = tenantRef.collection('audit_log').doc();
  const movementRefs = productRefs.map(() => tenantRef.collection('inventory_transactions').doc());
  const fingerprint = checkoutFingerprint(staffAccountId, request);
  const committedAt = (options.now || admin.firestore.Timestamp.now)();

  try {
    return await db.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(idempotencyRef, tenantRef, staffRef, shiftRef, ...productRefs, accountRef);
      const [idempotencySnap, tenantSnap, staffSnap, shiftSnap, ...remaining] = snapshots;
      const accountSnap = remaining.pop()!;
      const productSnaps = remaining;

      const staff = assertBentaCashierAuthorization(identity, tenantSnap, staffSnap);
      if (idempotencySnap.exists) {
        const prior = idempotencySnap.data()!;
        if (prior.status === 'complete' && prior.fingerprint === fingerprint && prior.receipt) return prior.receipt as CheckoutReceipt;
        throw new CheckoutError(CheckoutErrorCode.IDEMPOTENCY_CONFLICT);
      }
      if (staff.activeShiftId !== request.shiftId) throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
      if (!shiftSnap.exists) throw new CheckoutError(CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED);
      const shift = assertReconciliationShift(shiftSnap.id, shiftSnap.data()!, identity);

      let subtotal = 0;
      const receiptItems: CheckoutReceipt['items'] = [];
      const saleItems: Array<Record<string, unknown>> = [];
      const updates: Array<{ ref: admin.firestore.DocumentReference; updateFields: Record<string, unknown>; movementRef: admin.firestore.DocumentReference; movementDoc: Record<string, unknown> }> = [];
      for (let index = 0; index < productSnaps.length; index++) {
        const productSnap = productSnaps[index];
        const submitted = [...request.items].sort((a, b) => a.productId.localeCompare(b.productId))[index];
        if (!productSnap.exists) throw new CheckoutError(CheckoutErrorCode.PRODUCT_UNAVAILABLE);
        const product = productSnap.data()!;
        if (product.tenantId !== tenantId || product.isActive !== true || !nonEmptyString(product.name) || !nonEmptyString(product.unit) ||
            !Number.isSafeInteger(product.salePrice) || product.salePrice < 0 || !Number.isSafeInteger(product.costPrice) || product.costPrice < 0 ||
            !Number.isSafeInteger(product.currentStock) || product.currentStock < 0 || submitted.productId.startsWith('misc-')) {
          throw new CheckoutError(CheckoutErrorCode.PRODUCT_UNAVAILABLE);
        }

        const authoritativeQuantityMode = product.quantityMode === 'measured' ? 'measured' : 'discrete';

        if (submitted.quantityMode === 'measured') {
          if (authoritativeQuantityMode !== 'measured' || !Number.isSafeInteger(product.stockQuantityMinor) || product.stockQuantityMinor < 0) {
            throw new CheckoutError(CheckoutErrorCode.PRODUCT_UNAVAILABLE);
          }
          const authoritativeSellingUnit = product.sellingUnit ?? product.unit;
          const authoritativeQuantityScale = product.quantityScale ?? 3;
          if (submitted.quantityScale !== authoritativeQuantityScale || submitted.sellingUnit !== authoritativeSellingUnit) {
            throw new CheckoutError(CheckoutErrorCode.PRODUCT_UNAVAILABLE);
          }
          if (product.stockQuantityMinor < submitted.quantityMinor) throw new CheckoutError(CheckoutErrorCode.INSUFFICIENT_STOCK);

          let consumptionRes;
          try {
            consumptionRes = consumeBentaProductSale(
              {
                quantityMode: 'measured',
                currentStock: Number.isSafeInteger(product.currentStock) ? product.currentStock : 0,
                stockQuantityMinor: product.stockQuantityMinor,
                quantityScale: authoritativeQuantityScale,
                costPrice: product.costPrice,
                inventoryValueCentavos: product.inventoryValueCentavos,
                averageUnitCostCentavos: product.averageUnitCostCentavos,
              },
              submitted.quantityMinor,
            );
          } catch (err: unknown) {
            if (err instanceof Error && err.message.includes('Consumption cannot exceed available inventory quantity')) {
              throw new CheckoutError(CheckoutErrorCode.INSUFFICIENT_STOCK);
            }
            throw new CheckoutError(CheckoutErrorCode.PRODUCT_UNAVAILABLE);
          }

          let lineTotalCentavos: number;
          try {
            lineTotalCentavos = computeLineFinancials(product.salePrice, submitted.quantityMinor, authoritativeQuantityScale);
          } catch {
            throw new CheckoutError(CheckoutErrorCode.PRODUCT_UNAVAILABLE);
          }
          subtotal = safeAdd(subtotal, lineTotalCentavos);

          receiptItems.push({
            productId: submitted.productId, name: product.name, unit: authoritativeSellingUnit,
            quantity: 1, quantityMode: 'measured', quantityMinor: submitted.quantityMinor,
            quantityScale: authoritativeQuantityScale, sellingUnit: authoritativeSellingUnit,
            unitPriceCentavos: product.salePrice, lineTotalCentavos
          });
          saleItems.push({
            productId: submitted.productId, name: product.name, unit: authoritativeSellingUnit,
            quantity: 1, quantityMode: 'measured', quantityMinor: submitted.quantityMinor,
            quantityScale: authoritativeQuantityScale, sellingUnit: authoritativeSellingUnit,
            price: product.salePrice,
            costPrice: consumptionRes.historicalCogs.costPrice,
            unitCostCentavos: consumptionRes.historicalCogs.unitCostCentavos,
            lineCostCentavos: consumptionRes.historicalCogs.lineCostCentavos,
            lineTotal: lineTotalCentavos
          });
          updates.push({
            ref: productRefs[index],
            updateFields: { ...consumptionRes.productUpdates, updatedAt: committedAt },
            movementRef: movementRefs[index],
            movementDoc: {
              id: movementRefs[index].id, tenantId, productId: submitted.productId, saleId: saleRef.id, shiftId: request.shiftId, staffAccountId,
              type: 'sale', quantityMinorChange: -submitted.quantityMinor, quantityMode: 'measured',
              previousStockQuantityMinor: product.stockQuantityMinor, newStockQuantityMinor: consumptionRes.productUpdates.stockQuantityMinor,
              performedBy: `staff_${staffAccountId}`, createdAt: committedAt
            }
          });
        } else {
          // Discrete path
          if (authoritativeQuantityMode !== 'discrete') {
            throw new CheckoutError(CheckoutErrorCode.PRODUCT_UNAVAILABLE);
          }
          if (product.currentStock < submitted.quantity) throw new CheckoutError(CheckoutErrorCode.INSUFFICIENT_STOCK);

          let consumptionRes;
          try {
            consumptionRes = consumeBentaProductSale(
              {
                quantityMode: 'discrete',
                currentStock: product.currentStock,
                costPrice: product.costPrice,
                inventoryValueCentavos: product.inventoryValueCentavos,
                averageUnitCostCentavos: product.averageUnitCostCentavos,
              },
              submitted.quantity,
            );
          } catch (err: unknown) {
            if (err instanceof Error && err.message.includes('Consumption cannot exceed available inventory quantity')) {
              throw new CheckoutError(CheckoutErrorCode.INSUFFICIENT_STOCK);
            }
            throw new CheckoutError(CheckoutErrorCode.PRODUCT_UNAVAILABLE);
          }

          const lineTotal = safeMultiply(product.salePrice, submitted.quantity);
          subtotal = safeAdd(subtotal, lineTotal);
          receiptItems.push({ productId: submitted.productId, name: product.name, unit: product.unit, quantity: submitted.quantity, unitPriceCentavos: product.salePrice, lineTotalCentavos: lineTotal });
          saleItems.push({
            productId: submitted.productId,
            name: product.name,
            unit: product.unit,
            quantity: submitted.quantity,
            price: product.salePrice,
            costPrice: consumptionRes.historicalCogs.costPrice,
            unitCostCentavos: consumptionRes.historicalCogs.unitCostCentavos,
            lineCostCentavos: consumptionRes.historicalCogs.lineCostCentavos,
            lineTotal
          });
          updates.push({
            ref: productRefs[index],
            updateFields: { ...consumptionRes.productUpdates, updatedAt: committedAt },
            movementRef: movementRefs[index],
            movementDoc: {
              id: movementRefs[index].id, tenantId, productId: submitted.productId, saleId: saleRef.id, shiftId: request.shiftId, staffAccountId,
              type: 'sale', quantityChange: -submitted.quantity, previousStock: product.currentStock, newStock: consumptionRes.productUpdates.currentStock, quantityMode: 'discrete',
              performedBy: `staff_${staffAccountId}`, createdAt: committedAt
            }
          });
        }
      }
      const oldBalance = accountSnap.exists ? accountSnap.data()!.balance : 0;
      if (!Number.isSafeInteger(oldBalance) || oldBalance < 0) throw new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE);
      const newBalance = safeAdd(oldBalance, subtotal);
      const cashierDisplayName = nonEmptyString(staff.displayName) ? staff.displayName : nonEmptyString(staff.username) ? staff.username : 'Cashier';
      const receipt: CheckoutReceipt = {
        saleId: saleRef.id, receiptNumber: saleRef.id, committedAt: committedAt.toDate().toISOString(), moduleId: BENTA_SNAP_MODULE_ID,
        paymentMethod: request.paymentMethod, shiftId: request.shiftId, cashierDisplayName, items: receiptItems,
        subtotalCentavos: subtotal, totalCentavos: subtotal
      };
      const paymentFields = request.paymentReference ? { paymentReference: request.paymentReference } : {};
      const nextShiftAggregates = applySaleToShift(shift, request.paymentMethod, subtotal);

      transaction.create(saleRef, {
        id: saleRef.id, tenantId, moduleId: BENTA_SNAP_MODULE_ID, shiftId: request.shiftId, staffAccountId,
        actorId: `staff_${staffAccountId}`, items: saleItems, subtotalAmount: subtotal, discountAmount: 0, totalAmount: subtotal,
        paymentMethod: request.paymentMethod, ...paymentFields, transactionDate: committedAt, createdAt: committedAt,
        costingVersion: BENTA_INVENTORY_COSTING_VERSION
      });
      updates.forEach((entry) => {
        transaction.update(entry.ref, entry.updateFields);
        transaction.create(entry.movementRef, entry.movementDoc);
      });
      transaction.update(shiftRef, { ...nextShiftAggregates, updatedAt: committedAt });
      transaction.set(accountRef, accountSnap.exists
        ? { balance: newBalance, updatedAt: committedAt }
        : { id: targetAccountId, tenantId, name: targetAccountName, type: 'asset', balance: newBalance, isActive: true, createdAt: committedAt, updatedAt: committedAt },
        { merge: true });
      transaction.create(ledgerRef, {
        id: ledgerRef.id, tenantId, accountId: targetAccountId, amount: subtotal, type: 'income', category: 'Sales',
        description: 'Benta Snap Cashier Sale', saleId: saleRef.id, shiftId: request.shiftId, actorId: `staff_${staffAccountId}`,
        paymentMethod: request.paymentMethod, ...paymentFields, date: committedAt, createdAt: committedAt
      });
      transaction.create(auditRef, {
        id: auditRef.id, tenantId, type: 'cashier_checkout', action: 'complete_checkout', actorId: `staff_${staffAccountId}`,
        staffAccountId, shiftId: request.shiftId, saleId: saleRef.id, paymentMethod: request.paymentMethod, amountCentavos: subtotal, createdAt: committedAt
      });
      transaction.create(idempotencyRef, { status: 'complete', fingerprint, saleId: saleRef.id, receipt, completedAt: committedAt, expiresAt: admin.firestore.Timestamp.fromMillis(committedAt.toMillis() + 30 * 24 * 60 * 60 * 1000) });
      return receipt;
    });
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    throw new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE);
  }
}

export interface CheckoutRouteDependencies {
  enabled: () => boolean;
  extractClientIp: (headers: Headers) => string | null;
  admitNetworkRequest: (networkIdentifier: string) => Promise<{ isLimited: boolean; retryAfterSeconds: number; reason?: 'account' | 'network' | 'global' | 'unavailable' }>;
  completeCheckout: (token: string, body: unknown) => Promise<unknown>;
}

export function createBentaCheckoutRouteHandler(
  overrides: Partial<CheckoutRouteDependencies> = {},
  serviceOptions?: CheckoutServiceOptions
) {
  const deps: CheckoutRouteDependencies = {
    enabled: isSecureCashierSystemEnabled,
    extractClientIp: extractTrustedClientIp,
    admitNetworkRequest: (networkIdentifier) => staffAuthRateLimiter.admitNetworkRequest(networkIdentifier),
    completeCheckout: (token, body) => completeBentaCashierCheckout(token, body, serviceOptions),
    ...overrides
  };

  return async function handleBentaCheckout(request: Request): Promise<Response> {
    if (!deps.enabled()) return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.CHECKOUT_UNAVAILABLE));
    try {
      const clientIp = overrides.admitNetworkRequest ? deps.extractClientIp(request.headers) : null;
      if (overrides.admitNetworkRequest && !clientIp) return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE));
      const admission = overrides.admitNetworkRequest
        ? await deps.admitNetworkRequest(clientIp!)
        : await admitStaffAuthRequest(request.headers);
      if (admission.isLimited) {
        const error = new CheckoutError(admission.reason === 'unavailable' ? CheckoutErrorCode.SERVICE_UNAVAILABLE : CheckoutErrorCode.CHECKOUT_UNAVAILABLE);
        return Response.json({ error: error.userMessage, category: error.code }, {
          status: admission.reason === 'unavailable' ? 503 : 429,
          headers: { 'Retry-After': String(Math.max(1, admission.retryAfterSeconds)) }
        });
      }
      const authorization = request.headers.get('authorization') || '';
      const match = /^Bearer ([^\s]+)$/.exec(authorization);
      if (!match) return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.AUTHENTICATION_REQUIRED));
      if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
        return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.INVALID_REQUEST));
      }
      let body: unknown;
      try { body = await request.json(); } catch { return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.INVALID_REQUEST)); }
      const receipt = await deps.completeCheckout(match[1], body);
      return Response.json(receipt, { status: 201 });
    } catch (error) {
      return sanitizedErrorResponse(error instanceof CheckoutError ? error : new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE));
    }
  };
}
