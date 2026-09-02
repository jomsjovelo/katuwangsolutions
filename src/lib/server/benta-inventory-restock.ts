import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  applyMovingAverageRestock,
  buildInventoryRestockEvent,
  type InventoryCostMovement,
} from '../shared/inventory-costing';
import {
  projectBentaProductCostPosition,
  type BentaProductCostingInput,
} from '../shared/benta-inventory-costing-adapter';

export const SERVER_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export enum BentaRestockErrorCode {
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  FORBIDDEN = 'FORBIDDEN',
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  TENANT_INACTIVE = 'TENANT_INACTIVE',
  SUPPLIER_NOT_FOUND = 'SUPPLIER_NOT_FOUND',
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  PRODUCT_INVALID = 'PRODUCT_INVALID',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_REQUEST = 'INVALID_REQUEST',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

const ERROR_DETAILS: Record<BentaRestockErrorCode, { status: number; message: string }> = {
  [BentaRestockErrorCode.AUTHENTICATION_REQUIRED]: { status: 401, message: 'Authentication required.' },
  [BentaRestockErrorCode.FORBIDDEN]: { status: 403, message: 'Operation not permitted.' },
  [BentaRestockErrorCode.TENANT_NOT_FOUND]: { status: 404, message: 'Tenant not found.' },
  [BentaRestockErrorCode.TENANT_INACTIVE]: { status: 403, message: 'Tenant is inactive or not eligible for Benta inventory.' },
  [BentaRestockErrorCode.SUPPLIER_NOT_FOUND]: { status: 404, message: 'Supplier not found.' },
  [BentaRestockErrorCode.PRODUCT_NOT_FOUND]: { status: 404, message: 'Product not found.' },
  [BentaRestockErrorCode.PRODUCT_INVALID]: { status: 400, message: 'Invalid product for restocking.' },
  [BentaRestockErrorCode.INSUFFICIENT_FUNDS]: { status: 409, message: 'Insufficient master cash balance.' },
  [BentaRestockErrorCode.INVALID_REQUEST]: { status: 400, message: 'Invalid request.' },
  [BentaRestockErrorCode.IDEMPOTENCY_CONFLICT]: { status: 409, message: 'Idempotency conflict.' },
  [BentaRestockErrorCode.SERVICE_UNAVAILABLE]: { status: 503, message: 'Service temporarily unavailable.' },
};

export class BentaRestockError extends Error {
  readonly code: BentaRestockErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;

  constructor(code: BentaRestockErrorCode) {
    const detail = ERROR_DETAILS[code] || { status: 500, message: 'Internal server error.' };
    super(detail.message);
    this.name = 'BentaRestockError';
    this.code = code;
    this.httpStatus = detail.status;
    this.userMessage = detail.message;
  }
}

export type BentaRestockPaymentStatus = 'paid' | 'credit_unpaid';
export type BentaRestockPaymentMethod = 'cash' | 'cash_drawer' | 'gcash' | 'maya' | 'supplier_credit';

export interface BentaRestockDiscreteItemInput {
  readonly productId: string;
  readonly quantityMode?: 'discrete';
  readonly quantity: number;
  readonly supplierCostCentavos: number;
  readonly freightCentavos?: number;
  readonly otherAcquisitionCostCentavos?: number;
}

export interface BentaRestockMeasuredItemInput {
  readonly productId: string;
  readonly quantityMode: 'measured';
  readonly quantityMinor: number;
  readonly quantityScale: 3;
  readonly supplierCostCentavos: number;
  readonly freightCentavos?: number;
  readonly otherAcquisitionCostCentavos?: number;
}

export type BentaRestockRequestItem = BentaRestockDiscreteItemInput | BentaRestockMeasuredItemInput;

export interface BentaRestockRequest {
  readonly tenantId: string;
  readonly idempotencyKey: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly paymentStatus: BentaRestockPaymentStatus;
  readonly paymentMethod: BentaRestockPaymentMethod;
  readonly items: readonly BentaRestockRequestItem[];
  readonly notes?: string;
}

export interface BentaRestockItemResult {
  readonly productId: string;
  readonly productName: string;
  readonly quantityMode: 'discrete' | 'measured';
  readonly purchasedQuantity: number;
  readonly quantityScale: number;
  readonly landedCostCentavos: number;
  readonly latestPurchaseUnitCostCentavos: number;
  readonly costMovement: InventoryCostMovement;
  readonly resultingPosition: {
    readonly quantityMinor: number;
    readonly quantityScale: number;
    readonly inventoryValueCentavos: number;
    readonly averageUnitCostCentavos: number;
  };
}

export interface BentaRestockResult {
  readonly success: true;
  readonly purchaseOrderId: string;
  readonly poNumber: string;
  readonly committedAt: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly paymentStatus: BentaRestockPaymentStatus;
  readonly paymentMethod: BentaRestockPaymentMethod;
  readonly totalAmountCentavos: number;
  readonly items: readonly BentaRestockItemResult[];
}

export interface BentaRestockServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyRecordKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

const isBentaRestockPaymentMethod = (v: unknown): v is BentaRestockPaymentMethod =>
  typeof v === 'string' && (v === 'cash' || v === 'cash_drawer' || v === 'gcash' || v === 'maya' || v === 'supplier_credit');

export function validateBentaRestockRequest(value: unknown): BentaRestockRequest {
  if (!isPlainRecord(value)) {
    throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
  }

  if (!hasOnlyRecordKeys(value, ['tenantId', 'idempotencyKey', 'supplierId', 'supplierName', 'paymentStatus', 'paymentMethod', 'items', 'notes'])) {
    throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
  }

  const { tenantId, idempotencyKey, supplierId, supplierName, paymentStatus, paymentMethod, items, notes } = value;

  if (typeof tenantId !== 'string' || !SERVER_IDENTIFIER.test(tenantId)) {
    throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
  }

  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0 || idempotencyKey.length > 128) {
    throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
  }

  if (typeof supplierId !== 'string' || !SERVER_IDENTIFIER.test(supplierId)) {
    throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
  }

  if (typeof supplierName !== 'string' || supplierName.trim().length === 0 || supplierName.length > 128) {
    throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
  }

  if (paymentStatus !== 'paid' && paymentStatus !== 'credit_unpaid') {
    throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
  }

  if (!isBentaRestockPaymentMethod(paymentMethod)) {
    throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
  }

  // Payment consistency rules
  if (paymentMethod === 'supplier_credit' && paymentStatus !== 'credit_unpaid') {
    throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
  }
  if (paymentStatus === 'credit_unpaid' && paymentMethod !== 'supplier_credit') {
    throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
  }

  if (notes !== undefined && (typeof notes !== 'string' || notes.length > 500)) {
    throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
  }

  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
  }

  const seenProductIds = new Set<string>();
  const normalizedItems: BentaRestockRequestItem[] = [];

  for (const item of items) {
    if (!isPlainRecord(item)) {
      throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
    }

    if (typeof item.productId !== 'string' || !SERVER_IDENTIFIER.test(item.productId)) {
      throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
    }

    if (seenProductIds.has(item.productId)) {
      throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
    }
    seenProductIds.add(item.productId);

    if (
      typeof item.supplierCostCentavos !== 'number' ||
      !Number.isSafeInteger(item.supplierCostCentavos) ||
      item.supplierCostCentavos < 0
    ) {
      throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
    }

    let freightCentavos: number | undefined;
    if (item.freightCentavos !== undefined) {
      if (typeof item.freightCentavos !== 'number' || !Number.isSafeInteger(item.freightCentavos) || item.freightCentavos < 0) {
        throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
      }
      freightCentavos = item.freightCentavos;
    }

    let otherAcquisitionCostCentavos: number | undefined;
    if (item.otherAcquisitionCostCentavos !== undefined) {
      if (typeof item.otherAcquisitionCostCentavos !== 'number' || !Number.isSafeInteger(item.otherAcquisitionCostCentavos) || item.otherAcquisitionCostCentavos < 0) {
        throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
      }
      otherAcquisitionCostCentavos = item.otherAcquisitionCostCentavos;
    }

    if (item.quantityMode === 'measured') {
      if (!hasOnlyRecordKeys(item, ['productId', 'quantityMode', 'quantityMinor', 'quantityScale', 'supplierCostCentavos', 'freightCentavos', 'otherAcquisitionCostCentavos'])) {
        throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
      }

      if (
        typeof item.quantityMinor !== 'number' ||
        !Number.isSafeInteger(item.quantityMinor) ||
        item.quantityMinor <= 0 ||
        item.quantityMinor > 100_000_000
      ) {
        throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
      }

      if (item.quantityScale !== 3) {
        throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
      }

      normalizedItems.push({
        productId: item.productId,
        quantityMode: 'measured',
        quantityMinor: item.quantityMinor,
        quantityScale: 3,
        supplierCostCentavos: item.supplierCostCentavos,
        ...(freightCentavos !== undefined ? { freightCentavos } : {}),
        ...(otherAcquisitionCostCentavos !== undefined ? { otherAcquisitionCostCentavos } : {}),
      });
    } else {
      const allowedKeys = item.quantityMode === 'discrete'
        ? ['productId', 'quantityMode', 'quantity', 'supplierCostCentavos', 'freightCentavos', 'otherAcquisitionCostCentavos']
        : ['productId', 'quantity', 'supplierCostCentavos', 'freightCentavos', 'otherAcquisitionCostCentavos'];

      if (!hasOnlyRecordKeys(item, allowedKeys)) {
        throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
      }

      if (
        typeof item.quantity !== 'number' ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > 100_000_000
      ) {
        throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
      }

      normalizedItems.push({
        productId: item.productId,
        ...(item.quantityMode === 'discrete' ? { quantityMode: 'discrete' as const } : {}),
        quantity: item.quantity,
        supplierCostCentavos: item.supplierCostCentavos,
        ...(freightCentavos !== undefined ? { freightCentavos } : {}),
        ...(otherAcquisitionCostCentavos !== undefined ? { otherAcquisitionCostCentavos } : {}),
      });
    }
  }

  return Object.freeze({
    tenantId,
    idempotencyKey: idempotencyKey.trim(),
    supplierId,
    supplierName: supplierName.trim(),
    paymentStatus,
    paymentMethod,
    items: Object.freeze(normalizedItems),
    ...(notes !== undefined ? { notes: notes.trim() } : {}),
  });
}

export function restockIdempotencyDocumentId(ownerUid: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${ownerUid}:${idempotencyKey}`, 'utf8').digest('hex');
}

export function restockFingerprint(
  ownerUid: string,
  request: BentaRestockRequest,
  canonicalSupplierName: string,
): string {
  const sortedItems = [...request.items]
    .map((item) => {
      if (item.quantityMode === 'measured') {
        return {
          productId: item.productId,
          quantityMode: 'measured',
          quantityMinor: item.quantityMinor,
          quantityScale: item.quantityScale,
          supplierCostCentavos: item.supplierCostCentavos,
          freightCentavos: item.freightCentavos ?? 0,
          otherAcquisitionCostCentavos: item.otherAcquisitionCostCentavos ?? 0,
        };
      }
      return {
        productId: item.productId,
        quantityMode: 'discrete',
        quantity: item.quantity,
        supplierCostCentavos: item.supplierCostCentavos,
        freightCentavos: item.freightCentavos ?? 0,
        otherAcquisitionCostCentavos: item.otherAcquisitionCostCentavos ?? 0,
      };
    })
    .sort((a, b) => a.productId.localeCompare(b.productId));

  const canonical = {
    ownerUid,
    tenantId: request.tenantId,
    supplierId: request.supplierId,
    supplierName: canonicalSupplierName,
    paymentStatus: request.paymentStatus,
    paymentMethod: request.paymentMethod,
    notes: request.notes ?? '',
    items: sortedItems,
  };

  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

export function sanitizeStoredRestockResult(raw: unknown): BentaRestockResult | null {
  if (!isPlainRecord(raw)) return null;

  const {
    success,
    purchaseOrderId,
    poNumber,
    committedAt,
    supplierId,
    supplierName,
    paymentStatus,
    paymentMethod,
    totalAmountCentavos,
    items,
  } = raw;

  if (
    success !== true ||
    typeof purchaseOrderId !== 'string' ||
    typeof poNumber !== 'string' ||
    typeof committedAt !== 'string' ||
    typeof supplierId !== 'string' ||
    typeof supplierName !== 'string' ||
    (paymentStatus !== 'paid' && paymentStatus !== 'credit_unpaid') ||
    !isBentaRestockPaymentMethod(paymentMethod) ||
    typeof totalAmountCentavos !== 'number' ||
    !Number.isSafeInteger(totalAmountCentavos) ||
    totalAmountCentavos < 0 ||
    !Array.isArray(items) ||
    items.length < 1
  ) {
    return null;
  }

  const sanitizedItems: BentaRestockItemResult[] = [];
  for (const item of items) {
    if (!isPlainRecord(item)) return null;

    const {
      productId,
      productName,
      quantityMode,
      purchasedQuantity,
      quantityScale,
      landedCostCentavos,
      latestPurchaseUnitCostCentavos,
      costMovement,
      resultingPosition,
    } = item;

    if (
      typeof productId !== 'string' ||
      typeof productName !== 'string' ||
      (quantityMode !== 'discrete' && quantityMode !== 'measured') ||
      typeof purchasedQuantity !== 'number' ||
      !Number.isSafeInteger(purchasedQuantity) ||
      purchasedQuantity <= 0 ||
      (quantityScale !== 0 && quantityScale !== 3) ||
      typeof landedCostCentavos !== 'number' ||
      !Number.isSafeInteger(landedCostCentavos) ||
      landedCostCentavos < 0 ||
      typeof latestPurchaseUnitCostCentavos !== 'number' ||
      !Number.isSafeInteger(latestPurchaseUnitCostCentavos) ||
      latestPurchaseUnitCostCentavos < 0 ||
      (costMovement !== 'increased' && costMovement !== 'decreased' && costMovement !== 'unchanged') ||
      !isPlainRecord(resultingPosition)
    ) {
      return null;
    }

    const { quantityMinor, quantityScale: posScale, inventoryValueCentavos, averageUnitCostCentavos } = resultingPosition;

    if (
      typeof quantityMinor !== 'number' ||
      !Number.isSafeInteger(quantityMinor) ||
      quantityMinor < 0 ||
      (posScale !== 0 && posScale !== 3) ||
      typeof inventoryValueCentavos !== 'number' ||
      !Number.isSafeInteger(inventoryValueCentavos) ||
      inventoryValueCentavos < 0 ||
      typeof averageUnitCostCentavos !== 'number' ||
      !Number.isSafeInteger(averageUnitCostCentavos) ||
      averageUnitCostCentavos < 0
    ) {
      return null;
    }

    sanitizedItems.push(
      Object.freeze({
        productId,
        productName,
        quantityMode,
        purchasedQuantity,
        quantityScale,
        landedCostCentavos,
        latestPurchaseUnitCostCentavos,
        costMovement,
        resultingPosition: Object.freeze({
          quantityMinor,
          quantityScale: posScale,
          inventoryValueCentavos,
          averageUnitCostCentavos,
        }),
      }),
    );
  }

  return Object.freeze({
    success: true as const,
    purchaseOrderId,
    poNumber,
    committedAt,
    supplierId,
    supplierName,
    paymentStatus,
    paymentMethod,
    totalAmountCentavos,
    items: Object.freeze(sanitizedItems),
  });
}

export async function executeBentaInventoryRestock(
  ownerToken: string,
  rawRequest: unknown,
  options?: BentaRestockServiceOptions,
): Promise<BentaRestockResult> {
  const request = validateBentaRestockRequest(rawRequest);

  const auth = options?.adminAuth ?? getAdminAuth();
  const db = options?.adminFirestore ?? getAdminFirestore();
  const now = options?.now ?? (() => admin.firestore.Timestamp.now());

  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await auth.verifyIdToken(ownerToken);
  } catch {
    throw new BentaRestockError(BentaRestockErrorCode.AUTHENTICATION_REQUIRED);
  }

  const ownerUid = decodedToken.uid;
  if (!ownerUid || typeof ownerUid !== 'string' || !SERVER_IDENTIFIER.test(ownerUid)) {
    throw new BentaRestockError(BentaRestockErrorCode.AUTHENTICATION_REQUIRED);
  }

  const idempotencyDocId = restockIdempotencyDocumentId(ownerUid, request.idempotencyKey);
  const tenantRef = db.collection('tenants').doc(request.tenantId);
  const supplierRef = tenantRef.collection('suppliers').doc(request.supplierId);
  const idempotencyRef = tenantRef.collection('restock_idempotency').doc(idempotencyDocId);

  const productRefs = request.items.map((item) =>
    tenantRef.collection('products').doc(item.productId),
  );

  const isCashPayment = request.paymentStatus === 'paid' &&
    (request.paymentMethod === 'cash' || request.paymentMethod === 'cash_drawer');
  const masterAccountRef = tenantRef.collection('accounts').doc('master-cash');

  return await db.runTransaction(async (txn) => {
    // 1. Transactional reads — ALL reads occur strictly before any writes
    const tenantSnap = await txn.get(tenantRef);
    const supplierSnap = await txn.get(supplierRef);
    const idempotencySnap = await txn.get(idempotencyRef);

    const productSnaps: admin.firestore.DocumentSnapshot[] = [];
    for (const ref of productRefs) {
      const snap = await txn.get(ref);
      productSnaps.push(snap);
    }

    let masterAccountSnap: admin.firestore.DocumentSnapshot | undefined;
    if (isCashPayment) {
      masterAccountSnap = await txn.get(masterAccountRef);
    }

    // 2. Validate Tenant Authority & Eligibility
    if (!tenantSnap.exists) {
      throw new BentaRestockError(BentaRestockErrorCode.TENANT_NOT_FOUND);
    }
    const tenantData = tenantSnap.data() || {};
    if (tenantData.ownerUid !== ownerUid) {
      throw new BentaRestockError(BentaRestockErrorCode.FORBIDDEN);
    }
    if (tenantData.subscriptionStatus !== 'active' || tenantData.moduleType !== 'benta-snap') {
      throw new BentaRestockError(BentaRestockErrorCode.TENANT_INACTIVE);
    }

    // 3. Validate Supplier Authority
    if (!supplierSnap.exists) {
      throw new BentaRestockError(BentaRestockErrorCode.SUPPLIER_NOT_FOUND);
    }
    const supplierData = supplierSnap.data() || {};
    if (typeof supplierData.name !== 'string' || supplierData.name.trim().length === 0) {
      throw new BentaRestockError(BentaRestockErrorCode.SUPPLIER_NOT_FOUND);
    }
    const canonicalSupplierName = supplierData.name.trim();

    // Verify submitted supplier name matches stored supplier name if provided
    if (request.supplierName !== canonicalSupplierName) {
      throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
    }

    // 4. Idempotency Check with Safe Replay Validation
    const fingerprint = restockFingerprint(ownerUid, request, canonicalSupplierName);
    if (idempotencySnap.exists) {
      const stored = idempotencySnap.data() || {};
      if (stored.fingerprint === fingerprint) {
        const sanitized = sanitizeStoredRestockResult(stored.result);
        if (sanitized) {
          return sanitized;
        }
        throw new BentaRestockError(BentaRestockErrorCode.IDEMPOTENCY_CONFLICT);
      }
      throw new BentaRestockError(BentaRestockErrorCode.IDEMPOTENCY_CONFLICT);
    }

    // 5. Fail-Closed Stored Product Validation & Calculations
    const nowTimestamp = now();
    const epochMs = nowTimestamp.toMillis();
    const dateStr = nowTimestamp.toDate().toISOString().slice(0, 10).replace(/-/g, '');
    const poHash = createHash('sha256').update(`${ownerUid}:${request.idempotencyKey}`, 'utf8').digest('hex');
    const poId = `po_${poHash.slice(0, 20)}`;
    const poNumber = `PO-${dateStr}-${poHash.slice(0, 4).toUpperCase()}`;

    let totalAmountCentavos = 0;
    const itemResults: BentaRestockItemResult[] = [];
    const productUpdatesList: Array<{
      ref: admin.firestore.DocumentReference;
      updates: Record<string, unknown>;
      event: ReturnType<typeof buildInventoryRestockEvent>;
      invTxId: string;
      item: BentaRestockRequestItem;
    }> = [];

    const poItems: Array<Record<string, unknown>> = [];

    for (let i = 0; i < request.items.length; i++) {
      const item = request.items[i];
      const snap = productSnaps[i];

      if (!snap.exists) {
        throw new BentaRestockError(BentaRestockErrorCode.PRODUCT_NOT_FOUND);
      }

      const prodData = snap.data() || {};

      if (typeof prodData.name !== 'string' || prodData.name.trim().length === 0) {
        throw new BentaRestockError(BentaRestockErrorCode.PRODUCT_INVALID);
      }
      const productName = prodData.name.trim();

      if (prodData.tenantId && prodData.tenantId !== request.tenantId) {
        throw new BentaRestockError(BentaRestockErrorCode.FORBIDDEN);
      }
      if (prodData.isActive === false) {
        throw new BentaRestockError(BentaRestockErrorCode.PRODUCT_INVALID);
      }

      // Validate stored costPrice
      if (typeof prodData.costPrice !== 'number' || !Number.isSafeInteger(prodData.costPrice) || prodData.costPrice < 0) {
        throw new BentaRestockError(BentaRestockErrorCode.PRODUCT_INVALID);
      }

      // If stored inventoryValueCentavos is present, it must be a safe non-negative integer
      if (
        prodData.inventoryValueCentavos !== undefined &&
        (typeof prodData.inventoryValueCentavos !== 'number' ||
          !Number.isSafeInteger(prodData.inventoryValueCentavos) ||
          prodData.inventoryValueCentavos < 0)
      ) {
        throw new BentaRestockError(BentaRestockErrorCode.PRODUCT_INVALID);
      }

      // If stored averageUnitCostCentavos is present, it must be a safe non-negative integer
      if (
        prodData.averageUnitCostCentavos !== undefined &&
        (typeof prodData.averageUnitCostCentavos !== 'number' ||
          !Number.isSafeInteger(prodData.averageUnitCostCentavos) ||
          prodData.averageUnitCostCentavos < 0)
      ) {
        throw new BentaRestockError(BentaRestockErrorCode.PRODUCT_INVALID);
      }

      const isStoredMeasured = prodData.quantityMode === 'measured';
      if (item.quantityMode === 'measured') {
        if (!isStoredMeasured) {
          throw new BentaRestockError(BentaRestockErrorCode.PRODUCT_INVALID);
        }
        if (
          typeof prodData.stockQuantityMinor !== 'number' ||
          !Number.isSafeInteger(prodData.stockQuantityMinor) ||
          prodData.stockQuantityMinor < 0
        ) {
          throw new BentaRestockError(BentaRestockErrorCode.PRODUCT_INVALID);
        }
        const storedScale = prodData.quantityScale ?? 3;
        if (storedScale !== 3) {
          throw new BentaRestockError(BentaRestockErrorCode.PRODUCT_INVALID);
        }
      } else {
        if (isStoredMeasured) {
          throw new BentaRestockError(BentaRestockErrorCode.PRODUCT_INVALID);
        }
        if (
          typeof prodData.currentStock !== 'number' ||
          !Number.isSafeInteger(prodData.currentStock) ||
          prodData.currentStock < 0
        ) {
          throw new BentaRestockError(BentaRestockErrorCode.PRODUCT_INVALID);
        }
      }

      if (
        prodData.latestPurchaseUnitCostCentavos !== undefined &&
        (typeof prodData.latestPurchaseUnitCostCentavos !== 'number' ||
          !Number.isSafeInteger(prodData.latestPurchaseUnitCostCentavos) ||
          prodData.latestPurchaseUnitCostCentavos < 0)
      ) {
        throw new BentaRestockError(BentaRestockErrorCode.PRODUCT_INVALID);
      }
      const previousLatestPurchaseUnitCostCentavos = prodData.latestPurchaseUnitCostCentavos as number | undefined;

      const costingInput: BentaProductCostingInput = {
        quantityMode: isStoredMeasured ? 'measured' : 'discrete',
        currentStock: isStoredMeasured ? 0 : prodData.currentStock,
        ...(isStoredMeasured ? { stockQuantityMinor: prodData.stockQuantityMinor, quantityScale: 3 } : {}),
        costPrice: prodData.costPrice,
        ...(typeof prodData.inventoryValueCentavos === 'number' ? { inventoryValueCentavos: prodData.inventoryValueCentavos } : {}),
        ...(typeof prodData.averageUnitCostCentavos === 'number' ? { averageUnitCostCentavos: prodData.averageUnitCostCentavos } : {}),
      };

      const previousProjection = projectBentaProductCostPosition(costingInput);
      const previousPosition = previousProjection.position;

      const purchasedQuantityMinor = item.quantityMode === 'measured' ? item.quantityMinor : item.quantity;
      const freightCentavos = item.freightCentavos ?? 0;
      const otherAcquisitionCostCentavos = item.otherAcquisitionCostCentavos ?? 0;

      const restockResult = applyMovingAverageRestock({
        previousPosition,
        purchasedQuantityMinor,
        supplierCostCentavos: item.supplierCostCentavos,
        freightCentavos,
        otherAcquisitionCostCentavos,
      });

      const eventId = createHash('sha256').update(`${ownerUid}:${request.idempotencyKey}:${item.productId}`, 'utf8').digest('hex');
      const event = buildInventoryRestockEvent({
        eventId,
        idempotencyKey: request.idempotencyKey,
        inventoryItemId: item.productId,
        occurredAtEpochMs: epochMs,
        restock: {
          previousPosition,
          purchasedQuantityMinor,
          supplierCostCentavos: item.supplierCostCentavos,
          freightCentavos,
          otherAcquisitionCostCentavos,
        },
      });

      totalAmountCentavos += restockResult.landedCostCentavos;
      if (totalAmountCentavos > Number.MAX_SAFE_INTEGER) {
        throw new BentaRestockError(BentaRestockErrorCode.INVALID_REQUEST);
      }

      const productUpdates: Record<string, unknown> = {
        inventoryValueCentavos: restockResult.resultingPosition.inventoryValueCentavos,
        averageUnitCostCentavos: restockResult.resultingPosition.averageUnitCostCentavos,
        costPrice: restockResult.resultingPosition.averageUnitCostCentavos,
        latestPurchaseUnitCostCentavos: restockResult.latestPurchaseUnitCostCentavos,
        updatedAt: nowTimestamp,
      };

      if (item.quantityMode === 'measured') {
        productUpdates.stockQuantityMinor = restockResult.resultingPosition.quantityMinor;
      } else {
        productUpdates.currentStock = restockResult.resultingPosition.quantityMinor;
      }

      const invTxId = createHash('sha256').update(`invtx:${ownerUid}:${request.idempotencyKey}:${item.productId}`, 'utf8').digest('hex');

      productUpdatesList.push({
        ref: snap.ref,
        updates: productUpdates,
        event,
        invTxId,
        item,
      });

      poItems.push({
        productId: item.productId,
        productName,
        quantity: item.quantityMode === 'measured' ? item.quantityMinor : item.quantity,
        ...(item.quantityMode === 'measured' ? { quantityMode: 'measured', quantityMinor: item.quantityMinor, quantityScale: 3 } : { quantityMode: 'discrete' }),
        unitCostCentavos: restockResult.latestPurchaseUnitCostCentavos,
        supplierCostCentavos: item.supplierCostCentavos,
        freightCentavos,
        otherAcquisitionCostCentavos,
        landedCostCentavos: restockResult.landedCostCentavos,
        latestPurchaseUnitCostCentavos: restockResult.latestPurchaseUnitCostCentavos,
        restockEventId: eventId,
        previousPosition: {
          quantityMinor: previousPosition.quantityMinor,
          quantityScale: previousPosition.quantityScale,
          inventoryValueCentavos: previousPosition.inventoryValueCentavos,
          averageUnitCostCentavos: previousPosition.averageUnitCostCentavos,
        },
        resultingPosition: {
          quantityMinor: restockResult.resultingPosition.quantityMinor,
          quantityScale: restockResult.resultingPosition.quantityScale,
          inventoryValueCentavos: restockResult.resultingPosition.inventoryValueCentavos,
          averageUnitCostCentavos: restockResult.resultingPosition.averageUnitCostCentavos,
        },
        ...(previousLatestPurchaseUnitCostCentavos !== undefined ? { previousLatestPurchaseUnitCostCentavos } : {}),
      });

      itemResults.push({
        productId: item.productId,
        productName,
        quantityMode: item.quantityMode === 'measured' ? 'measured' : 'discrete',
        purchasedQuantity: item.quantityMode === 'measured' ? item.quantityMinor : item.quantity,
        quantityScale: item.quantityMode === 'measured' ? 3 : 0,
        landedCostCentavos: restockResult.landedCostCentavos,
        latestPurchaseUnitCostCentavos: restockResult.latestPurchaseUnitCostCentavos,
        costMovement: restockResult.costMovement,
        resultingPosition: {
          quantityMinor: restockResult.resultingPosition.quantityMinor,
          quantityScale: restockResult.resultingPosition.quantityScale,
          inventoryValueCentavos: restockResult.resultingPosition.inventoryValueCentavos,
          averageUnitCostCentavos: restockResult.resultingPosition.averageUnitCostCentavos,
        },
      });
    }

    // 6. Cash Account Balance Safety Validation
    let resultingMasterCashBalance: number | undefined;
    if (isCashPayment) {
      if (!masterAccountSnap || !masterAccountSnap.exists) {
        throw new BentaRestockError(BentaRestockErrorCode.INSUFFICIENT_FUNDS);
      }
      const accountData = masterAccountSnap.data() || {};
      const currentBalance = accountData.balance;
      if (typeof currentBalance !== 'number' || !Number.isSafeInteger(currentBalance) || currentBalance < 0) {
        throw new BentaRestockError(BentaRestockErrorCode.INSUFFICIENT_FUNDS);
      }
      if (currentBalance < totalAmountCentavos) {
        throw new BentaRestockError(BentaRestockErrorCode.INSUFFICIENT_FUNDS);
      }
      resultingMasterCashBalance = currentBalance - totalAmountCentavos;
      if (!Number.isSafeInteger(resultingMasterCashBalance) || resultingMasterCashBalance < 0) {
        throw new BentaRestockError(BentaRestockErrorCode.INSUFFICIENT_FUNDS);
      }
    }

    // 7. Atomic Transaction Writes — All reads have finished, begin writes
    for (const updateEntry of productUpdatesList) {
      txn.update(updateEntry.ref, updateEntry.updates);

      const eventRef = tenantRef.collection('restock_events').doc(updateEntry.event.eventId);
      txn.set(eventRef, {
        ...updateEntry.event,
        tenantId: request.tenantId,
        performedBy: ownerUid,
        createdAt: nowTimestamp,
      });

      const invTxRef = tenantRef.collection('inventory_transactions').doc(updateEntry.invTxId);
      txn.set(invTxRef, {
        id: updateEntry.invTxId,
        tenantId: request.tenantId,
        productId: updateEntry.item.productId,
        type: 'restock',
        quantity: updateEntry.item.quantityMode === 'measured' ? updateEntry.item.quantityMinor : updateEntry.item.quantity,
        ...(updateEntry.item.quantityMode === 'measured' ? { quantityMinor: updateEntry.item.quantityMinor, quantityScale: 3 } : {}),
        note: `Restock PO #${poNumber} (${canonicalSupplierName})`,
        poId,
        performedBy: ownerUid,
        createdAt: nowTimestamp,
      });
    }

    // Write Purchase Order Document
    const poRef = tenantRef.collection('purchase_orders').doc(poId);
    txn.set(poRef, {
      id: poId,
      poNumber,
      costingVersion: 'moving_average_v1',
      restockEventIds: productUpdatesList.map((u) => u.event.eventId),
      supplierId: request.supplierId,
      supplierName: canonicalSupplierName,
      status: 'received',
      paymentStatus: request.paymentStatus,
      paymentMethod: request.paymentMethod,
      items: poItems,
      totalAmountCentavos,
      notes: request.notes ?? '',
      createdByUid: ownerUid,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    });

    // Write Payment Records
    if (isCashPayment && resultingMasterCashBalance !== undefined) {
      txn.set(masterAccountRef, {
        balance: resultingMasterCashBalance,
        updatedAt: nowTimestamp,
      }, { merge: true });

      const txId = createHash('sha256').update(`tx:${ownerUid}:${request.idempotencyKey}`, 'utf8').digest('hex');
      const txRef = tenantRef.collection('transactions').doc(txId);
      txn.set(txRef, {
        id: txId,
        tenantId: request.tenantId,
        accountId: 'master-cash',
        amount: totalAmountCentavos,
        type: 'expense',
        category: 'Restock / Inventory Purchase',
        description: `Purchase Order (#${poNumber}) - ${canonicalSupplierName}`,
        poId,
        paymentMethod: request.paymentMethod,
        date: nowTimestamp.toDate(),
        createdAt: nowTimestamp,
        createdBy: ownerUid,
      });
    } else if (request.paymentStatus === 'credit_unpaid' || request.paymentMethod === 'supplier_credit') {
      const creditId = createHash('sha256').update(`credit:${ownerUid}:${request.idempotencyKey}`, 'utf8').digest('hex');
      const creditRef = tenantRef.collection('credit_accounts').doc(creditId);
      const dueDate = new Date(epochMs + 30 * 24 * 60 * 60 * 1000).toISOString();
      txn.set(creditRef, {
        id: creditId,
        borrowerName: canonicalSupplierName,
        type: 'payable',
        amountCentavos: totalAmountCentavos,
        description: `Utang sa Supplier (PO #${poNumber})`,
        status: 'UNPAID',
        dueDate,
        poId,
        createdAt: nowTimestamp,
        createdBy: ownerUid,
      });
    }

    // Write Idempotency Record
    const sanitizedResult: BentaRestockResult = Object.freeze({
      success: true as const,
      purchaseOrderId: poId,
      poNumber,
      committedAt: nowTimestamp.toDate().toISOString(),
      supplierId: request.supplierId,
      supplierName: canonicalSupplierName,
      paymentStatus: request.paymentStatus,
      paymentMethod: request.paymentMethod,
      totalAmountCentavos,
      items: Object.freeze(itemResults.map((r) => Object.freeze({
        ...r,
        resultingPosition: Object.freeze({ ...r.resultingPosition }),
      }))),
    });

    txn.set(idempotencyRef, {
      idempotencyKey: request.idempotencyKey,
      fingerprint,
      createdAt: nowTimestamp,
      purchaseOrderId: poId,
      result: sanitizedResult,
    });

    return sanitizedResult;
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

export function createBentaInventoryRestockRouteHandler(serviceOptions?: BentaRestockServiceOptions) {
  return async (request: Request): Promise<Response> => {
    try {
      const ownerToken = extractBearerToken(request);
      if (!ownerToken) {
        return Response.json(
          { error: 'Authentication required.', category: BentaRestockErrorCode.AUTHENTICATION_REQUIRED },
          { status: 401 },
        );
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { error: 'Invalid request.', category: BentaRestockErrorCode.INVALID_REQUEST },
          { status: 400 },
        );
      }

      const result = await executeBentaInventoryRestock(ownerToken, body, serviceOptions);
      return Response.json(result, { status: 200 });
    } catch (error: unknown) {
      if (error instanceof BentaRestockError) {
        return Response.json(
          { error: error.userMessage, category: error.code },
          { status: error.httpStatus },
        );
      }
      return Response.json(
        { error: 'Service temporarily unavailable.', category: BentaRestockErrorCode.SERVICE_UNAVAILABLE },
        { status: 500 },
      );
    }
  };
}
