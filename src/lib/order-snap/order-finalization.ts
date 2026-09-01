/**
 * Order Snap — Unified Order Finalization Engine
 *
 * Orchestrates the complete order processing pipeline:
 * 1. Runtime validation of untrusted request input with OrderIngestionRequestSchema
 * 2. Idempotent request fingerprint computation (includes orderId)
 * 3. Optional stored-result idempotent replay: same key + same orderId + same fingerprint
 *    returns the exact stored object without re-running deduction/costing/movement calculation
 * 4. Aggregation of all ingredient deductions across lines and modifiers
 * 5. Stock validation with graceful insufficient-stock handling
 * 6. Deterministic ledger movement generation with canonical unit enforcement
 * 7. Immutable snapshot creation for historical audit
 *
 * IMPORTANT — HONEST GUARANTEES:
 * - This is a PURE deterministic calculation layer.
 * - It does NOT perform atomic inventory mutation. Actual stock deduction requires
 *   a server-side database transaction that atomically stores the result and
 *   marks the idempotency key as consumed.
 * - Exactly-once behavior is NOT guaranteed by this layer alone. It requires:
 *   (a) a persistent idempotency record in the same atomic transaction as the
 *       inventory mutation, and
 *   (b) a server-side concurrency guard (e.g. row-level locking or unique
 *       constraint on idempotency_key).
 * - Conflicting replays (same idempotency key + same orderId but different
 *   fingerprint) fail closed to prevent data corruption.
 *
 * Invariants:
 * 1. All request input is validated at runtime with OrderIngestionRequestSchema.parse.
 * 2. Caller-provided idempotencyKey prevents duplicate finalization (server-side enforcement).
 * 3. Caller-provided timestamps ensure deterministic ordering (no Date.now()).
 * 4. All monetary values are safe integer centavos.
 * 5. All quantities are safe integer minor units.
 * 6. Identical inputs produce byte-identical JSON output.
 * 7. Replays return the same frozen result without new deductions or movements.
 * 8. Conflicting idempotency keys with different content fail closed.
 * 9. Tenant identity is enforced across all references.
 * 10. Stock adjustments follow: previousStock - deduction = newStock.
 * 11. Deductions are positive; deltas are negative.
 * 12. All records are recursively deep-frozen.
 * 13. Ledger entries require canonical unit form and standard scale matching.
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import {
  OrderIngestionRequest,
  OrderLine,
  OrderIngestionRequestSchema,
  computeOrderFingerprint
} from './order-ingestion';
import {
  calculateOrderInventoryDeductions,
  InventoryDeduction
} from './inventory-deduction';
import {
  buildInventoryLedgerMovements,
  InventoryLedgerMovement
} from './ledger-movement';
import {
  MenuItem,
  RecipeVersion,
  Ingredient,
  ModifierGroup,
  SaleLineSnapshot,
  SaleLineSnapshotSchema,
  HistoricalComponentSnapshot
} from './domain-schemas';
import {
  calculateMenuItemCogs,
  SelectedModifierSelection,
  SelectedModifierSelection as ModifierGroupsInput
} from './costing';
import {
   MAX_SAFE_QUANTITY_COUNT,
   MAX_SAFE_CENTAVOS,
   asciiCompare,
   deepFreeze,
   safeAddMoney,
   safeMultiplyMoney,
   calculateGrossMarginBasisPoints,
   getUnitMetadata
 } from './quantity-math';

// ==========================================
// Types
// ==========================================

export interface OrderFinalizationResult {
  readonly success: true;
  readonly orderId: string;
  readonly tenantId: string;
  readonly saleId: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly snapshotId: string;
  readonly saleLines: ReadonlyArray<SaleLineSnapshot>;
  readonly movements: ReadonlyArray<InventoryLedgerMovement>;
  readonly totalRevenueCentavos: number;
  readonly totalCogsCentavos: number;
  readonly totalDeductionsCount: number;
  readonly totalMovementsCount: number;
}

export interface InsufficientStockResult {
  readonly success: false;
  readonly orderId: string;
  readonly tenantId: string;
  readonly fingerprint: string;
  readonly insufficientIngredients: ReadonlyArray<{
    ingredientId: string;
    ingredientName: string;
    requiredMinor: number;
    availableMinor: number;
  }>;
  readonly attemptedDeductions: ReadonlyArray<{
    ingredientId: string;
    requestedMinor: number;
    availableMinor: number;
  }>;
}

export type OrderFinalizationOutcome = OrderFinalizationResult | InsufficientStockResult;

export interface AuthoritativeInputs {
  menuItems: Map<string, MenuItem> | Record<string, MenuItem>;
  recipes: Map<string, RecipeVersion> | Record<string, RecipeVersion>;
  ingredients: Map<string, Ingredient> | Record<string, Ingredient>;
  modifierGroups: ModifierGroup[];
}

export interface OrderFinalizationParams {
   request: OrderIngestionRequest;
   inputs: AuthoritativeInputs;
   createdAt: string;
   saleId: string;
   storedResult?: OrderFinalizationResult;
 }

// ==========================================
// Validation Helpers
// ==========================================

/**
 * Parses an ISO datetime string and returns the timestamp in milliseconds.
 * Returns NaN if invalid.
 */
function parseIsoTimestamp(ts: string): number {
  const parsed = Date.parse(ts);
  if (Number.isNaN(parsed)) {
    return NaN;
  }
  return parsed;
}

export function validateOrderIngestion(request: OrderIngestionRequest, createdAt: string, saleId: string): void {
  if (!createdAt || typeof createdAt !== 'string' || createdAt.trim().length === 0) {
    throw new Error('createdAt must be a non-empty ISO datetime string.');
  }

  if (!saleId || typeof saleId !== 'string' || saleId.trim().length === 0) {
    throw new Error('saleId must be a non-empty string.');
  }

  // Validate timestamps are parseable
  const createdAtTs = parseIsoTimestamp(createdAt);
  if (Number.isNaN(createdAtTs)) {
    throw new Error('createdAt is not a valid ISO datetime string.');
  }

  const requestCreatedAtTs = parseIsoTimestamp(request.createdAt);
  const requestCommittedAtTs = parseIsoTimestamp(request.committedAt);

  if (Number.isNaN(requestCreatedAtTs) || Number.isNaN(requestCommittedAtTs)) {
    throw new Error('Order request timestamps are not valid ISO datetime strings.');
  }

  if (requestCreatedAtTs > requestCommittedAtTs) {
    throw new Error('createdAt must be before or equal to committedAt.');
  }

  for (const line of request.lines) {
    if (line.quantity <= 0) {
      throw new Error(`Line ${line.lineId}: quantity must be positive.`);
    }
    if (!Number.isSafeInteger(line.quantity)) {
      throw new Error(`Line ${line.lineId}: quantity must be a safe integer.`);
    }
    if (line.quantity > MAX_SAFE_QUANTITY_COUNT) {
      throw new Error(`Line ${line.lineId}: quantity exceeds maximum allowed (${MAX_SAFE_QUANTITY_COUNT}).`);
    }
  }
}

// ==========================================
// Core Finalization
// ==========================================

export function finalizeOrder(params: OrderFinalizationParams): OrderFinalizationOutcome {
   const {
     request,
     inputs,
     createdAt,
     saleId,
     storedResult
   } = params;

   // Runtime validation: parse untrusted request input with OrderIngestionRequestSchema
   const validatedRequest = OrderIngestionRequestSchema.parse(request);

   // Validate auxiliary parameters
   validateOrderIngestion(validatedRequest, createdAt, saleId);

   // Compute canonical fingerprint (includes orderId to prevent key reuse across orders)
   const fingerprint = computeOrderFingerprint(validatedRequest);

   // Idempotent replay: if a stored result exists and matches tenant, orderId, idempotencyKey, and fingerprint,
   // return it immediately without re-running deductions/costing/movements.
   if (storedResult) {
     // Validate stored result against current request before accepting replay
     if (
       storedResult.tenantId !== validatedRequest.tenantId ||
       storedResult.orderId !== validatedRequest.orderId ||
       storedResult.idempotencyKey !== validatedRequest.idempotencyKey ||
       storedResult.fingerprint !== fingerprint
     ) {
       throw new Error('Idempotency key conflict: stored result does not match current request.');
     }
     return storedResult;
   }

   if (validatedRequest.tenantId.length === 0) {
     throw new Error('Invalid empty tenantId.');
   }

   const deductionPlan = calculateOrderInventoryDeductions({
     orderId: validatedRequest.orderId,
     tenantId: validatedRequest.tenantId,
     lines: validatedRequest.lines,
     menuItems: inputs.menuItems,
     recipes: inputs.recipes,
     ingredients: inputs.ingredients,
     modifierGroups: inputs.modifierGroups
   });

   if (!deductionPlan.hasSufficientStock) {
     return {
       success: false,
       orderId: validatedRequest.orderId,
       tenantId: validatedRequest.tenantId,
       fingerprint,
       insufficientIngredients: deductionPlan.insufficientStockFailures.map(f => ({
         ingredientId: f.ingredientId,
         ingredientName: f.ingredientName,
         requiredMinor: f.requiredMinor,
         availableMinor: f.availableMinor
       })),
       attemptedDeductions: deductionPlan.insufficientStockFailures.map(f => ({
         ingredientId: f.ingredientId,
         requestedMinor: f.requiredMinor,
         availableMinor: f.availableMinor
       }))
     };
   }

   const movements = buildInventoryLedgerMovements({
     tenantId: validatedRequest.tenantId,
     orderId: validatedRequest.orderId,
     saleId,
     deductions: deductionPlan.deductions,
     createdAt
   });

   const saleLinesResult = buildSaleLineSnapshots({
     orderId: validatedRequest.orderId,
     tenantId: validatedRequest.tenantId,
     lines: validatedRequest.lines,
     menuItems: inputs.menuItems,
     recipes: inputs.recipes,
     ingredients: inputs.ingredients,
     modifierGroups: inputs.modifierGroups,
     createdAt
   });

   // Use checked arithmetic for totals
   const totalRevenueCentavos = saleLinesResult.reduce((sum, line) => {
     return safeAddMoney(sum, line.lineRevenueCentavos, false);
   }, 0);

   const totalCogsCentavos = saleLinesResult.reduce((sum, line) => {
     return safeAddMoney(sum, line.lineCogsCentavos, false);
   }, 0);

   // Validate snapshot against schema
   for (const line of saleLinesResult) {
     if (!SaleLineSnapshotSchema.safeParse(line).success) {
       throw new Error('Built sale line snapshot failed validation.');
     }
   }

   return deepFreeze({
     success: true,
     orderId: validatedRequest.orderId,
     tenantId: validatedRequest.tenantId,
     saleId,
     idempotencyKey: validatedRequest.idempotencyKey,
     fingerprint,
     snapshotId: createHash('sha256').update(`snapshot:${validatedRequest.orderId}:${createdAt}`, 'utf8').digest('hex'),
     saleLines: deepFreeze([...saleLinesResult].sort((a, b) => asciiCompare(a.saleLineId, b.saleLineId))),
     movements: deepFreeze([...movements].sort((a, b) => asciiCompare(a.ingredientId, b.ingredientId))),
     totalRevenueCentavos,
     totalCogsCentavos,
     totalDeductionsCount: deductionPlan.deductions.length,
     totalMovementsCount: movements.length
   });
 }

// ==========================================
// Sale Line Snapshots
// ==========================================

interface BuiltSaleLine extends SaleLineSnapshot {
  _unitCogs?: number;
  _finalUnitPrice?: number;
}

function buildSaleLineSnapshots(params: {
  orderId: string;
  tenantId: string;
  lines: OrderLine[];
  menuItems: Map<string, MenuItem> | Record<string, MenuItem>;
  recipes: Map<string, RecipeVersion> | Record<string, RecipeVersion>;
  ingredients: Map<string, Ingredient> | Record<string, Ingredient>;
  modifierGroups: ModifierGroup[];
  createdAt: string;
}): ReadonlyArray<SaleLineSnapshot> {
  const { lines, menuItems, recipes, ingredients, modifierGroups, createdAt, orderId, tenantId } = params;

  const menuItemLookup = buildMapLookup(menuItems);
  const recipeLookup = buildMapLookup(recipes);
  const ingredientLookup = buildMapLookup(ingredients);

  const snapshots: SaleLineSnapshot[] = [];

  const normalizedLines = [...lines].sort((a, b) => asciiCompare(a.lineId, b.lineId));

  for (const line of normalizedLines) {
    const menuItem = menuItemLookup.get(line.menuItemId);
    if (!menuItem) {
      throw new Error(`MenuItem "${line.menuItemId}" not found for line "${line.lineId}".`);
    }

    if (menuItem.tenantId !== tenantId) {
      throw new Error(`Tenant mismatch: MenuItem "${menuItem.id}" tenant does not match order tenant.`);
    }

    const recipe = recipeLookup.get(menuItem.activeRecipeVersionId);
    if (!recipe) {
      throw new Error(`Recipe "${menuItem.activeRecipeVersionId}" not found for MenuItem "${menuItem.id}".`);
    }

    const modifierSelections: SelectedModifierSelection[] = (line.selectedModifiers || []).map(ref => ({
      groupId: ref.groupId,
      optionId: ref.optionId
    }));

    const cogsResult = calculateMenuItemCogs({
      menuItem,
      recipe,
      selectedModifiers: modifierSelections,
      modifierGroups,
      ingredients: ingredientLookup
    });

    const quantity = line.quantity;

    // Use checked multiplication
    const unitCogsCentavos = cogsResult.unitCogsCentavos;
    const finalUnitPriceCentavos = cogsResult.finalSellingPriceCentavos;

    const lineCogsCentavos = safeMultiplyMoney(unitCogsCentavos, quantity);
    const lineRevenueCentavos = safeMultiplyMoney(finalUnitPriceCentavos, quantity);
    const lineGrossProfitCentavos = safeAddMoney(lineRevenueCentavos, -lineCogsCentavos, true);

    // Use checked division for margin (scaled appropriately)
    const grossMarginBasisPoints = finalUnitPriceCentavos > 0
      ? calculateGrossMarginBasisPoints(lineGrossProfitCentavos, lineRevenueCentavos)
      : 0;

    // Validate canonical unit and scale for every component referenced in the snapshot.
    // HistoricalComponentSnapshotSchema already enforces a unit string, but we also verify
    // canonical form (no alias) and that quantityScale matches the standard scale.
    // Rely on validated authoritative Ingredient/Recipe schemas for content correctness;
    // this loop enforces the additional canonical-unit invariant on snapshot output.
    for (const comp of cogsResult.componentBreakdown) {
      try {
        const meta = getUnitMetadata(comp.unit);
        if (meta.canonicalUnit !== comp.unit) {
          throw new Error(
            `Snapshot component for ingredient "${comp.ingredientId}" uses non-canonical unit "${comp.unit}", expected "${meta.canonicalUnit}".`
          );
        }
        if (comp.quantityScale !== meta.standardScale) {
          throw new Error(
            `Snapshot component for ingredient "${comp.ingredientId}" has quantityScale ${comp.quantityScale}, expected standard scale ${meta.standardScale} for unit "${comp.unit}".`
          );
        }
      } catch (e) {
        if ((e as Error).message.startsWith('Unknown or unsupported unit')) {
          throw new Error(
            `Snapshot component for ingredient "${comp.ingredientId}" uses unsupported unit "${comp.unit}": ${(e as Error).message}`
          );
        }
        throw e;
      }
    }

    const sortedComponents = [...cogsResult.componentBreakdown].sort((a, b) =>
      asciiCompare(a.ingredientId, b.ingredientId)
    );

    const sortedModifiers = [...cogsResult.historicalModifiers].sort((a, b) => {
      const grpCmp = asciiCompare(a.modifierGroupId, b.modifierGroupId);
      if (grpCmp !== 0) return grpCmp;
      return asciiCompare(a.modifierOptionId, b.modifierOptionId);
    });

    const rawSnapshot: SaleLineSnapshot = {
      saleLineId: `line_${orderId}_${line.lineId}`,
      tenantId: menuItem.tenantId,
      menuItemId: menuItem.id,
      menuItemName: menuItem.name,
      category: menuItem.category,
      basePriceCentavos: menuItem.basePriceCentavos,
      finalUnitPriceCentavos,
      quantity,
      unitCogsCentavos,
      lineCogsCentavos,
      lineRevenueCentavos,
      lineGrossProfitCentavos,
      grossMarginBasisPoints,
      recipeVersionId: recipe.id,
      recipeVersionNumber: recipe.version,
      components: sortedComponents as HistoricalComponentSnapshot[],
      selectedModifiers: sortedModifiers,
      createdAt
    };

    // Validate against schema before freezing
    const validated = SaleLineSnapshotSchema.parse(rawSnapshot);
    snapshots.push(deepFreeze(validated) as SaleLineSnapshot);
  }

  return deepFreeze(snapshots);
}

// ==========================================
// Lookup Utilities
// ==========================================

function buildMapLookup<K extends string, V>(input: Map<K, V> | Record<K, V>): { get(key: K): V | undefined } {
  if (input instanceof Map) {
    return { get: (key: K) => input.get(key) };
  }
  const record = input as Record<K, V>;
  return { get: (key: K) => record[key] };
}

// ==========================================
// Idempotent Replay Support
// ==========================================

/**
 * Validates that a stored result can be replayed for a given request.
 *
 * IMPORTANT — HONEST GUARANTEES:
 * This is a PURE function only. The ACTUAL exactly-once guarantee requires
 * an ATOMIC server transaction that:
 * 1. Stores the result atomically with the idempotency key
 * 2. Performs the idempotency check in the same transaction
 * 3. Holds a concurrency guard (unique constraint on idempotency_key or row lock)
 *
 * @param storedResult - previously stored result by idempotency key (or undefined)
 * @param request - the current validated request
 * @returns the stored result if all checks pass, null if no stored result
 * @throws if idempotency key exists with different tenantId, orderId, or fingerprint (fail-closed)
 */
export function checkIdempotentReplay(
  storedResult: OrderFinalizationResult | undefined,
  request: { tenantId: string; orderId: string; idempotencyKey: string },
  currentFingerprint: string
): OrderFinalizationResult | null {
  if (!storedResult) return null;
  if (storedResult.tenantId !== request.tenantId) {
    throw new Error('Idempotency key reused with different tenantId. Rejecting to prevent data corruption.');
  }
  if (storedResult.orderId !== request.orderId) {
    throw new Error('Idempotency key reused for different orderId. Rejecting to prevent data corruption.');
  }
  if (storedResult.idempotencyKey !== request.idempotencyKey) {
    throw new Error('Idempotency key mismatch in stored result. Rejecting.');
  }
  if (storedResult.fingerprint !== currentFingerprint) {
    throw new Error('Idempotency key reused with different content. Rejecting to prevent data corruption.');
  }
  return storedResult;
}