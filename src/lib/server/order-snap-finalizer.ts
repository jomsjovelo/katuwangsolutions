/**
 * Order Snap â€” Server Finalization Engine & Transaction Coordinator
 *
 * Enforces atomic Firestore transaction guarantees:
 * 1. Strict identity and role verification (Owner vs Cashier)
 * 2. Tenant module and subscription validation
 * 3. Deterministic SHA-256 idempotency and sale IDs (no path traversal, no random IDs, no Date.now())
 * 4. ALL transaction reads executed strictly BEFORE any writes
 * 5. Idempotent replay: exact matching returns original result with zero writes
 * 6. Conflicting replay fails closed (IDEMPOTENCY_CONFLICT)
 * 7. Authoritative stock validation and atomic versioned deduction (no negative stock)
 * 8. Automatic optimistic retry under contention
 * 9. Cashier response redaction (no COGS, recipe components, ingredient costs, or margins exposed to Cashiers)
 * 10. Immutable, authoritative audit record persisted in Firestore
 */

import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { getAdminFirestore } from '@/firebase/admin';
import {
  finalizeOrder,
  OrderFinalizationResult
} from '@/lib/order-snap/order-finalization';
import {
  OrderIngestionRequest,
  OrderIngestionRequestSchema,
  computeOrderFingerprint
} from '@/lib/order-snap/order-ingestion';
import {
  Ingredient,
  MenuItem,
  RecipeVersion,
  ModifierGroup
} from '@/lib/order-snap/domain-schemas';

export const ORDER_SNAP_MODULE_ID = 'order-snap' as const;
export const ALLOWED_MODULE_IDS = ['order-snap', 'timpla-track', 'bite-snap'] as const;

export const SERVER_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export enum OrderSnapErrorCode {
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  SESSION_INVALID = 'SESSION_INVALID',
  SESSION_REVOKED = 'SESSION_REVOKED',
  OPERATION_NOT_PERMITTED = 'OPERATION_NOT_PERMITTED',
  CHECKOUT_UNAVAILABLE = 'CHECKOUT_UNAVAILABLE',
  INVALID_REQUEST = 'INVALID_REQUEST',
  ACTIVE_SHIFT_REQUIRED = 'ACTIVE_SHIFT_REQUIRED',
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  PRODUCT_UNAVAILABLE = 'PRODUCT_UNAVAILABLE',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

const ERROR_DETAILS: Record<OrderSnapErrorCode, { status: number; message: string }> = {
  [OrderSnapErrorCode.AUTHENTICATION_REQUIRED]: { status: 401, message: 'Authentication required.' },
  [OrderSnapErrorCode.SESSION_INVALID]: { status: 401, message: 'Session invalid.' },
  [OrderSnapErrorCode.SESSION_REVOKED]: { status: 401, message: 'Session version revoked or stale.' },
  [OrderSnapErrorCode.OPERATION_NOT_PERMITTED]: { status: 403, message: 'Operation not permitted.' },
  [OrderSnapErrorCode.CHECKOUT_UNAVAILABLE]: { status: 503, message: 'Checkout unavailable.' },
  [OrderSnapErrorCode.INVALID_REQUEST]: { status: 400, message: 'Invalid request.' },
  [OrderSnapErrorCode.ACTIVE_SHIFT_REQUIRED]: { status: 409, message: 'Active shift required.' },
  [OrderSnapErrorCode.INSUFFICIENT_STOCK]: { status: 409, message: 'Insufficient stock.' },
  [OrderSnapErrorCode.IDEMPOTENCY_CONFLICT]: { status: 409, message: 'Idempotency conflict.' },
  [OrderSnapErrorCode.PRODUCT_UNAVAILABLE]: { status: 409, message: 'Product unavailable.' },
  [OrderSnapErrorCode.SERVICE_UNAVAILABLE]: { status: 503, message: 'Service temporarily unavailable.' }
};

export class OrderSnapError extends Error {
  readonly code: OrderSnapErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;

  constructor(code: OrderSnapErrorCode, customMessage?: string) {
    const detail = ERROR_DETAILS[code];
    const message = customMessage || detail.message;
    super(message);
    this.name = 'OrderSnapError';
    this.code = code;
    this.httpStatus = detail.status;
    this.userMessage = message;
  }
}

export interface VerifiedOrderSnapIdentity {
  uid: string;
  tenantId: string;
  staffAccountId: string | null;
  sessionVersion: number;
  actorId: string;
  role: 'cashier' | 'owner';
}

export interface CashierSaleLineView {
  readonly saleLineId: string;
  readonly menuItemId: string;
  readonly menuItemName: string;
  readonly category: string;
  readonly finalUnitPriceCentavos: number;
  readonly quantity: number;
  readonly lineRevenueCentavos: number;
  readonly selectedModifiers: ReadonlyArray<{
    readonly modifierGroupId: string;
    readonly modifierGroupName: string;
    readonly modifierOptionId: string;
    readonly modifierOptionName: string;
    readonly priceDeltaCentavos: number;
  }>;
}

export interface CashierOrderFinalizationResult {
  readonly success: true;
  readonly orderId: string;
  readonly tenantId: string;
  readonly saleId: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly snapshotId: string;
  readonly totalRevenueCentavos: number;
  readonly saleLines: ReadonlyArray<CashierSaleLineView>;
}

export type RedactedOrFullResult = OrderFinalizationResult | CashierOrderFinalizationResult;

export interface OrderSnapFinalizationResult {
  success: true;
  saleId: string;
  snapshotId: string;
  result: RedactedOrFullResult;
}

export interface OrderSnapConflictResult {
  success: false;
  error: string;
  errorCode: OrderSnapErrorCode;
}

export interface FinalizeOrderSnapParams {
  identity: VerifiedOrderSnapIdentity;
  request: OrderIngestionRequest;
}

export interface FinalizeOrderSnapOptions {
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

/**
 * Computes deterministic SHA-256 hex document ID for idempotency records.
 * Guarantees a clean, safe Firestore document ID without path separators.
 */
export function hashIdempotencyKey(tenantId: string, idempotencyKey: string): string {
  const canonical = `order_snap_idemp:${tenantId}:${idempotencyKey}`;
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Computes deterministic SHA-256 hex document ID for sale records.
 */
export function generateDeterministicSaleId(tenantId: string, orderId: string, fingerprint: string): string {
  const canonical = `order_snap_sale:${tenantId}:${orderId}:${fingerprint}`;
  return `sale_${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

/**
 * Redacts confidential recipe costing, COGS, ingredient breakdowns, and gross margin
 * from Cashier-facing responses.
 */
export function redactCashierFinalizationResult(
  result: OrderFinalizationResult
): CashierOrderFinalizationResult {
  const saleLines: CashierSaleLineView[] = result.saleLines.map((line) => ({
    saleLineId: line.saleLineId,
    menuItemId: line.menuItemId,
    menuItemName: line.menuItemName,
    category: line.category,
    finalUnitPriceCentavos: line.finalUnitPriceCentavos,
    quantity: line.quantity,
    lineRevenueCentavos: line.lineRevenueCentavos,
    selectedModifiers: line.selectedModifiers.map((mod) => ({
      modifierGroupId: mod.modifierGroupId,
      modifierGroupName: mod.modifierGroupName,
      modifierOptionId: mod.modifierOptionId,
      modifierOptionName: mod.modifierOptionName,
      priceDeltaCentavos: mod.priceDeltaCentavos
    }))
  }));

  return {
    success: true,
    orderId: result.orderId,
    tenantId: result.tenantId,
    saleId: result.saleId,
    idempotencyKey: result.idempotencyKey,
    fingerprint: result.fingerprint,
    snapshotId: result.snapshotId,
    totalRevenueCentavos: result.totalRevenueCentavos,
    saleLines
  };
}

function normalizeTimestamps<T extends Record<string, any>>(data: T): T {
  const result: any = { ...data };
  if (result.createdAt && typeof result.createdAt !== 'string') {
    result.createdAt = result.createdAt.toDate?.()?.toISOString() || new Date().toISOString();
  }
  if (result.updatedAt && typeof result.updatedAt !== 'string') {
    result.updatedAt = result.updatedAt.toDate?.()?.toISOString() || new Date().toISOString();
  }
  return result;
}

/**
 * Reads all authoritative catalog and inventory data required for finalization
 * in a single, strictly read-phase transaction step.
 */
async function readAuthoritativeData(
  transaction: admin.firestore.Transaction,
  tenantRef: admin.firestore.DocumentReference,
  request: OrderIngestionRequest,
  tenantId: string
): Promise<{
  menuItems: Map<string, MenuItem>;
  recipes: Map<string, RecipeVersion>;
  ingredients: Map<string, Ingredient>;
  modifierGroups: Map<string, ModifierGroup>;
}> {
  const menuItems = new Map<string, MenuItem>();
  const recipes = new Map<string, RecipeVersion>();
  const ingredients = new Map<string, Ingredient>();
  const modifierGroups = new Map<string, ModifierGroup>();
  const processedMenuItems = new Set<string>();
  const processedRecipes = new Set<string>();

  for (const line of request.lines) {
    if (!processedMenuItems.has(line.menuItemId)) {
      processedMenuItems.add(line.menuItemId);
      const menuItemSnap = await transaction.get(
        tenantRef.collection('menu_items').doc(line.menuItemId)
      );
      if (!menuItemSnap.exists) {
        throw new OrderSnapError(OrderSnapErrorCode.PRODUCT_UNAVAILABLE, `MenuItem ${line.menuItemId} not found.`);
      }
      const menuItemData = normalizeTimestamps(menuItemSnap.data() as MenuItem);
      if (menuItemData.tenantId !== tenantId || !menuItemData.isActive) {
        throw new OrderSnapError(OrderSnapErrorCode.PRODUCT_UNAVAILABLE, `MenuItem ${line.menuItemId} inactive or invalid.`);
      }
      menuItems.set(line.menuItemId, menuItemData);

      if (menuItemData.activeRecipeVersionId && !processedRecipes.has(menuItemData.activeRecipeVersionId)) {
        processedRecipes.add(menuItemData.activeRecipeVersionId);
        const recipeSnap = await transaction.get(
          tenantRef.collection('recipes').doc(menuItemData.activeRecipeVersionId)
        );
        if (!recipeSnap.exists) {
          throw new OrderSnapError(OrderSnapErrorCode.PRODUCT_UNAVAILABLE, `Recipe ${menuItemData.activeRecipeVersionId} not found.`);
        }
        const recipeData = normalizeTimestamps(recipeSnap.data() as RecipeVersion);
        if (recipeData.tenantId !== tenantId || !recipeData.isActive) {
          throw new OrderSnapError(OrderSnapErrorCode.PRODUCT_UNAVAILABLE, `Recipe ${menuItemData.activeRecipeVersionId} inactive or invalid.`);
        }
        recipes.set(menuItemData.activeRecipeVersionId, recipeData);

        for (const comp of recipeData.components || []) {
          if (!ingredients.has(comp.ingredientId)) {
            const ingSnap = await transaction.get(
              tenantRef.collection('ingredients').doc(comp.ingredientId)
            );
            if (!ingSnap.exists) {
              throw new OrderSnapError(OrderSnapErrorCode.PRODUCT_UNAVAILABLE, `Ingredient ${comp.ingredientId} not found.`);
            }
            const ingData = normalizeTimestamps(ingSnap.data() as Ingredient);
            if (ingData.tenantId !== tenantId || !ingData.isActive) {
              throw new OrderSnapError(OrderSnapErrorCode.PRODUCT_UNAVAILABLE, `Ingredient ${comp.ingredientId} inactive or invalid.`);
            }
            ingredients.set(comp.ingredientId, ingData);
          }
        }
      }
    }

    const menuItemData = menuItems.get(line.menuItemId)!;
    const groupIdsToLoad = new Set<string>([
      ...(menuItemData.modifierGroupIds || []),
      ...(line.selectedModifiers || []).map(m => m.groupId)
    ]);

    for (const gId of groupIdsToLoad) {
      if (!modifierGroups.has(gId)) {
        const modGroupSnap = await transaction.get(
          tenantRef.collection('modifier_groups').doc(gId)
        );
        if (!modGroupSnap.exists) {
          throw new OrderSnapError(OrderSnapErrorCode.PRODUCT_UNAVAILABLE, `Modifier group ${gId} not found.`);
        }
        const modGroupData = normalizeTimestamps(modGroupSnap.data() as ModifierGroup);
        if (modGroupData.tenantId !== tenantId) {
          throw new OrderSnapError(OrderSnapErrorCode.PRODUCT_UNAVAILABLE, `Modifier group ${gId} cross-tenant violation.`);
        }
        modifierGroups.set(gId, modGroupData);

        for (const opt of modGroupData.options || []) {
          for (const delta of opt.ingredientDeltas || []) {
            if (!ingredients.has(delta.ingredientId)) {
              const ingSnap = await transaction.get(
                tenantRef.collection('ingredients').doc(delta.ingredientId)
              );
              if (!ingSnap.exists) {
                throw new OrderSnapError(OrderSnapErrorCode.PRODUCT_UNAVAILABLE, `Modifier ingredient ${delta.ingredientId} not found.`);
              }
              const ingData = normalizeTimestamps(ingSnap.data() as Ingredient);
              if (ingData.tenantId !== tenantId || !ingData.isActive) {
                throw new OrderSnapError(OrderSnapErrorCode.PRODUCT_UNAVAILABLE, `Modifier ingredient ${delta.ingredientId} inactive.`);
              }
              ingredients.set(delta.ingredientId, ingData);
            }
          }
        }
      }
    }
  }

  return { menuItems, recipes, ingredients, modifierGroups };
}

/**
 * Main transactional coordinator for Order Snap.
 * Atomically deducts inventory, records ledger movements, writes the sale record,
 * and records the idempotency key with optimistic concurrency retry under contention.
 */
export async function finalizeOrderSnapTransaction(
  params: FinalizeOrderSnapParams,
  options: FinalizeOrderSnapOptions = {}
): Promise<OrderSnapFinalizationResult | OrderSnapConflictResult> {
  const db = options.adminFirestore || getAdminFirestore();
  const { identity, request: rawRequest } = params;

  // 1. Validate request schema
  const parseResult = OrderIngestionRequestSchema.safeParse(rawRequest);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Invalid order ingestion request: ${parseResult.error.message}`,
      errorCode: OrderSnapErrorCode.INVALID_REQUEST
    };
  }
  const request = parseResult.data;

  // 2. Identity and tenant validation
  if (!SERVER_IDENTIFIER.test(identity.tenantId) || request.tenantId !== identity.tenantId) {
    return {
      success: false,
      error: 'Tenant mismatch or invalid tenant identifier.',
      errorCode: OrderSnapErrorCode.OPERATION_NOT_PERMITTED
    };
  }

  if (identity.role !== 'cashier' && identity.role !== 'owner') {
    return {
      success: false,
      error: 'Unauthorized actor role.',
      errorCode: OrderSnapErrorCode.OPERATION_NOT_PERMITTED
    };
  }

  const tenantRef = db.collection('tenants').doc(identity.tenantId);
  const idempotencyKeyHash = hashIdempotencyKey(identity.tenantId, request.idempotencyKey);
  const idempotencyRef = tenantRef.collection('order_snap_idempotency').doc(idempotencyKeyHash);

  const fingerprint = computeOrderFingerprint(request);
  const saleId = generateDeterministicSaleId(identity.tenantId, request.orderId, fingerprint);

  const committedAt = options.now ? options.now() : admin.firestore.Timestamp.now();

  try {
    return await db.runTransaction(async (transaction) => {
      // -------------------------------------------------------------
      // TRANSACTION PHASE 1: READS (Must execute BEFORE all writes)
      // -------------------------------------------------------------

      // 1. Read Idempotency Record
      const idempotencySnap = await transaction.get(idempotencyRef);
      if (idempotencySnap.exists) {
        const stored = idempotencySnap.data() as any;
        if (
          stored.tenantId !== identity.tenantId ||
          stored.orderId !== request.orderId ||
          stored.fingerprint !== fingerprint
        ) {
          throw new OrderSnapError(OrderSnapErrorCode.IDEMPOTENCY_CONFLICT);
        }

        const fullStoredResult = stored.result as OrderFinalizationResult;
        const responseResult = identity.role === 'cashier'
          ? redactCashierFinalizationResult(fullStoredResult)
          : fullStoredResult;

        return {
          success: true,
          saleId: stored.saleId,
          snapshotId: stored.snapshotId,
          result: responseResult
        };
      }

      // 2. Read Tenant Configuration & Subscription
      const tenantSnap = await transaction.get(tenantRef);
      if (!tenantSnap.exists) {
        throw new OrderSnapError(OrderSnapErrorCode.CHECKOUT_UNAVAILABLE);
      }
      const tenant = tenantSnap.data() as any;
      if (
        !ALLOWED_MODULE_IDS.includes(tenant.moduleType) ||
        tenant.subscriptionStatus !== 'active'
      ) {
        throw new OrderSnapError(OrderSnapErrorCode.CHECKOUT_UNAVAILABLE);
      }

      // 3. Read Authorization (Staff Account for Cashier, OwnerUid for Owner)
      if (identity.role === 'cashier') {
        if (!identity.staffAccountId || !SERVER_IDENTIFIER.test(identity.staffAccountId)) {
          throw new OrderSnapError(OrderSnapErrorCode.SESSION_INVALID);
        }
        const staffRef = tenantRef.collection('staff_accounts').doc(identity.staffAccountId);
        const staffSnap = await transaction.get(staffRef);
        if (!staffSnap.exists) {
          throw new OrderSnapError(OrderSnapErrorCode.SESSION_INVALID);
        }
        const staff = staffSnap.data() as any;
        if (
          staff.status !== 'active' ||
          staff.tenantId !== identity.tenantId ||
          staff.authUid !== identity.uid ||
          staff.sessionVersion !== identity.sessionVersion
        ) {
          throw new OrderSnapError(OrderSnapErrorCode.SESSION_INVALID);
        }
      } else {
        // Owner role: verify identity.uid is the tenant owner
        if (tenant.ownerUid !== identity.uid) {
          throw new OrderSnapError(OrderSnapErrorCode.OPERATION_NOT_PERMITTED);
        }
      }

      // 4. Read Catalog, Recipes, Ingredients, and Modifier Groups
      const { menuItems, recipes, ingredients, modifierGroups } = await readAuthoritativeData(
        transaction,
        tenantRef,
        request,
        identity.tenantId
      );

      // -------------------------------------------------------------
      // PURE EVALUATION PHASE
      // -------------------------------------------------------------
      const calculationResult = finalizeOrder({
        request,
        inputs: {
          menuItems,
          recipes,
          ingredients,
          modifierGroups: Array.from(modifierGroups.values())
        },
        createdAt: committedAt.toDate().toISOString(),
        saleId
      });

      if (!calculationResult.success) {
        throw new OrderSnapError(OrderSnapErrorCode.INSUFFICIENT_STOCK);
      }

      const orderSnap = calculationResult as OrderFinalizationResult;

      // 5. Aggregate Ingredient Deductions and Verify Stock Bounds
      const ingredientDeductionMap = new Map<string, number>();
      for (const movement of orderSnap.movements) {
        const current = ingredientDeductionMap.get(movement.ingredientId) || 0;
        ingredientDeductionMap.set(movement.ingredientId, current + Math.abs(movement.quantityMinorDelta));
      }

      for (const [ingId, requiredDeduction] of ingredientDeductionMap) {
        const ingData = ingredients.get(ingId);
        if (!ingData) {
          throw new OrderSnapError(OrderSnapErrorCode.PRODUCT_UNAVAILABLE, `Ingredient ${ingId} missing from authoritative read.`);
        }
        const currentStock = ingData.stockQuantityMinor || 0;
        if (currentStock < requiredDeduction || currentStock - requiredDeduction < 0) {
          throw new OrderSnapError(
            OrderSnapErrorCode.INSUFFICIENT_STOCK,
            `Insufficient stock for ingredient ${ingData.name || ingId}: available ${currentStock}, required ${requiredDeduction}.`
          );
        }
      }

      // -------------------------------------------------------------
      // TRANSACTION PHASE 2: WRITES (Strictly after all reads)
      // -------------------------------------------------------------

      // A. Write Inventory Ledger Movements
      for (const movement of orderSnap.movements) {
        const inventoryMovRef = tenantRef.collection('inventory_movements').doc(movement.movementId);
        transaction.set(inventoryMovRef, {
          ...movement,
          createdAt: committedAt
        });
      }

      // B. Atomically Update Ingredient Stocks with Versioning
      for (const [ingId, totalDeduction] of ingredientDeductionMap) {
        const ingRef = tenantRef.collection('ingredients').doc(ingId);
        const ingData = ingredients.get(ingId)!;
        const newStock = ingData.stockQuantityMinor - totalDeduction;

        transaction.update(ingRef, {
          stockQuantityMinor: newStock,
          version: (ingData.version || 0) + 1,
          updatedAt: committedAt.toDate().toISOString()
        });
      }

      // C. Write Authoritative Sale Record
      const saleRef = tenantRef.collection('sales').doc(saleId);
      const saleData = {
        id: saleId,
        tenantId: identity.tenantId,
        moduleId: tenant.moduleType,
        orderId: request.orderId,
        idempotencyKey: request.idempotencyKey,
        fingerprint: orderSnap.fingerprint,
        snapshotId: orderSnap.snapshotId,
        actorId: identity.actorId,
        actorRole: identity.role,
        saleLines: orderSnap.saleLines,
        totalRevenueCentavos: orderSnap.totalRevenueCentavos,
        totalCogsCentavos: orderSnap.totalCogsCentavos,
        createdAt: committedAt
      };
      transaction.set(saleRef, saleData);

      // D. Write Idempotency Record with Complete Authoritative Result
      const idempotencyData = {
        id: idempotencyKeyHash,
        tenantId: identity.tenantId,
        orderId: request.orderId,
        idempotencyKey: request.idempotencyKey,
        fingerprint: orderSnap.fingerprint,
        saleId,
        snapshotId: orderSnap.snapshotId,
        status: 'completed',
        result: orderSnap,
        createdAt: committedAt
      };
      transaction.set(idempotencyRef, idempotencyData);

      // E. Return response based on caller role visibility policy
      const responseResult = identity.role === 'cashier'
        ? redactCashierFinalizationResult(orderSnap)
        : orderSnap;

      return {
        success: true,
        saleId,
        snapshotId: orderSnap.snapshotId,
        result: responseResult
      };
    }, { maxAttempts: 5 });
  } catch (error: any) {
    if (error instanceof OrderSnapError) {
      return { success: false, error: error.userMessage, errorCode: error.code };
    }
    if (error.code === 'resource-exhausted' || error.message?.includes('unavailable')) {
      return { success: false, error: 'Transaction retry needed', errorCode: OrderSnapErrorCode.SERVICE_UNAVAILABLE };
    }
    return { success: false, error: error.message || 'Unknown server error', errorCode: OrderSnapErrorCode.SERVICE_UNAVAILABLE };
  }
}

export function sanitizedErrorResponse(
  error: OrderSnapError,
  headers?: HeadersInit
): Response {
  return Response.json(
    { error: error.userMessage, category: error.code },
    { status: error.httpStatus, headers }
  );
}
