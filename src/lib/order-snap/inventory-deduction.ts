/**
 * Order Snap — Inventory Deduction Aggregation
 *
 * Aggregates exact ingredient deductions across all order lines including
 * shared ingredients and modifier deltas. Validates stock availability
 * before finalization.
 *
 * Invariants:
 * 1. All ingredient deductions are deterministic positive integer minor units.
 * 2. Shared ingredients across lines are summed exactly with no double-counting.
 * 3. Modifier ingredient deltas are merged into base recipe deductions.
 * 4. Tenant identity is enforced across all references.
 * 5. Stock validation fails closed with insufficient stock errors.
 * 6. Deduction keys are sorted by ASCII for byte-identical serialization.
 * 7. Ingredient quantities are multiplied by line.quantity using safe arithmetic.
 */

import {
  Ingredient,
  RecipeVersion,
  MenuItem,
  ModifierGroup
} from './domain-schemas';
import {
  calculateMenuItemCogs,
  IngredientsLookup,
  SelectedModifierSelection
} from './costing';
import {
  safeAddQuantityMinor,
  safeMultiplyQuantityMinor,
  asciiCompare,
  getUnitMetadata
} from './quantity-math';
import { OrderLine, normalizeOrderLines } from './order-ingestion';

// ==========================================
// Inventory Deduction Types
// ==========================================

export interface InventoryDeduction {
  readonly tenantId: string;
  readonly ingredientId: string;
  readonly ingredientName: string;
  readonly unit: string;
  readonly quantityScale: number;
  readonly deductionQuantityMinor: number;
  readonly previousStockQuantityMinor: number;
  readonly newStockQuantityMinor: number;
}

export interface InsufficientStockFailure {
  readonly ingredientId: string;
  readonly ingredientName: string;
  readonly requiredMinor: number;
  readonly availableMinor: number;
}

export interface InventoryDeductionPlan {
  readonly tenantId: string;
  readonly orderId: string;
  readonly deductions: ReadonlyArray<InventoryDeduction>;
  readonly insufficientStockFailures: ReadonlyArray<InsufficientStockFailure>;
  readonly hasSufficientStock: boolean;
}

export interface CalculateOrderDeductionsParams {
  orderId: string;
  tenantId: string;
  lines: OrderLine[];
  menuItems: Map<string, MenuItem> | Record<string, MenuItem>;
  recipes: Map<string, RecipeVersion> | Record<string, RecipeVersion>;
  ingredients: Map<string, Ingredient> | Record<string, Ingredient> | IngredientsLookup;
  modifierGroups: ModifierGroup[];
}

// ==========================================
// Core: Aggregate Order-Wide Deductions
// ==========================================

/**
 * Aggregates all ingredient deductions across all order lines, merging
 * shared ingredients from multiple lines and multiple quantities of the
 * same line into exact integer minor unit totals.
 *
 * Validates tenant identity, stock availability, and produces a complete
 * deduction plan with immutable, sorted output.
 */
export function calculateOrderInventoryDeductions(params: CalculateOrderDeductionsParams): InventoryDeductionPlan {
  const {
    orderId,
    tenantId,
    lines,
    menuItems,
    recipes,
    ingredients,
    modifierGroups
  } = params;

  if (!orderId || typeof orderId !== 'string' || orderId.trim().length === 0) {
    throw new Error('Invalid orderId: must be a non-empty string.');
  }

  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new Error('Invalid tenantId: must be a non-empty string.');
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Order must have at least one line.');
  }

  const menuItemLookup = buildLookup(menuItems);
  const recipeLookup = buildLookup(recipes);
  const ingredientLookup = buildIngredientLookup(ingredients);

  const aggregatedDeltas = new Map<string, number>();
  const aggregatedInfo = new Map<string, {
    name: string;
    unit: string;
    quantityScale: number;
    tenantId: string;
  }>();

  const tenantChecks = new Set<string>();

  // First pass: validate tenant agreement and collect tenant IDs
  for (const line of normalizeOrderLines(lines)) {
    if (!line.menuItemId || typeof line.menuItemId !== 'string' || line.menuItemId.trim().length === 0) {
      throw new Error(`Invalid menuItemId in line "${line.lineId}".`);
    }

    const menuItem = menuItemLookup.get(line.menuItemId);
    if (!menuItem) {
      throw new Error(`MenuItem "${line.menuItemId}" not found for order line "${line.lineId}".`);
    }

    tenantChecks.add(menuItem.tenantId);

    if (menuItem.tenantId !== tenantId) {
      throw new Error(`Tenant mismatch: MenuItem "${line.menuItemId}" tenant "${menuItem.tenantId}" does not match order tenant "${tenantId}".`);
    }

    if (menuItem.activeRecipeVersionId) {
      const recipe = recipeLookup.get(menuItem.activeRecipeVersionId);
      if (!recipe) {
        throw new Error(`Recipe version "${menuItem.activeRecipeVersionId}" not found for MenuItem "${line.menuItemId}".`);
      }
      if (recipe.tenantId !== tenantId) {
        throw new Error(`Tenant mismatch: Recipe "${recipe.id}" tenant "${recipe.tenantId}" does not match order tenant "${tenantId}".`);
      }
    }
  }

  const hasMultipleTenants = tenantChecks.size > 1;
  if (hasMultipleTenants) {
    throw new Error('Order contains menu items from different tenants. Cross-tenant orders are not allowed.');
  }

  const ingredientIdsInOrder = new Set<string>();

  // Second pass: aggregate ingredient consumption with quantity multiplication
  for (const line of lines) {
    const menuItem = menuItemLookup.get(line.menuItemId)!;
    const recipe = recipeLookup.get(menuItem.activeRecipeVersionId)!;

    const lineQuantity = line.quantity;

    if (lineQuantity <= 0) {
      throw new Error(`Invalid quantity for line "${line.lineId}": must be positive.`);
    }

    if (!Number.isSafeInteger(lineQuantity)) {
      throw new Error(`Invalid quantity for line "${line.lineId}": must be a safe integer.`);
    }

    const modifierSelections: SelectedModifierSelection[] = (line.selectedModifiers || []).map(ref => ({
      groupId: ref.groupId,
      optionId: ref.optionId
    }));

    const ingredientLookupLocal: IngredientsLookup = {
      get: (id: string) => {
        const ing = ingredientLookup.get(id);
        if (ing) ingredientIdsInOrder.add(id);
        return ing;
      }
    };

    const cogsResult = calculateMenuItemCogs({
      menuItem,
      recipe,
      selectedModifiers: modifierSelections,
      modifierGroups,
      ingredients: ingredientLookupLocal
    });

    // Multiply component quantities by line quantity using checked BigInt multiplication
    for (const component of cogsResult.componentBreakdown) {
      const perServingQty = component.finalQuantityMinor;
      const totalQty = safeMultiplyQuantityMinor(perServingQty, lineQuantity);

      const existing = aggregatedDeltas.get(component.ingredientId) || 0;
      const increased = safeAddQuantityMinor(existing, totalQty, false);
      aggregatedDeltas.set(component.ingredientId, increased);

      const ingredient = ingredientLookup.get(component.ingredientId);
      if (ingredient) {
        if (!aggregatedInfo.has(component.ingredientId)) {
          aggregatedInfo.set(component.ingredientId, {
            name: ingredient.name,
            unit: ingredient.unit,
            quantityScale: ingredient.quantityScale,
            tenantId: ingredient.tenantId
          });
        }
      }
    }
  }

  const sortedDeductionIds = Array.from(aggregatedDeltas.keys()).sort(asciiCompare);

  const deductions: InventoryDeduction[] = [];
  const insufficientStockFailures: InsufficientStockFailure[] = [];
  let hasSufficientStock = true;

  for (const ingredientId of sortedDeductionIds) {
    const totalMinor = aggregatedDeltas.get(ingredientId)!;

    if (totalMinor <= 0) {
      throw new Error(`Invalid deduction quantity for ingredient "${ingredientId}": must be positive.`);
    }

    const ingredient = ingredientLookup.get(ingredientId);
    if (!ingredient) {
      throw new Error(`Ingredient "${ingredientId}" not found in inventory.`);
    }

    if (ingredient.tenantId !== tenantId) {
      throw new Error(`Tenant mismatch: Ingredient "${ingredientId}" tenant "${ingredient.tenantId}" does not match order tenant "${tenantId}".`);
    }

    const info = aggregatedInfo.get(ingredientId)!;

    // Validate unit is canonical (ingredient.unit should be canonical if ingredient is valid)
    try {
      const meta = getUnitMetadata(ingredient.unit);
      if (ingredient.quantityScale !== meta.standardScale) {
        throw new Error(`Quantity scale mismatch for ingredient "${ingredientId}": expected ${meta.standardScale}, got ${ingredient.quantityScale}.`);
      }
    } catch (e) {
      const err = e as Error;
      if (err.message.startsWith('Unknown or unsupported unit')) {
        throw new Error(`Unsupported unit "${ingredient.unit}" in ingredient "${ingredientId}": ${err.message}`);
      }
      throw e;
    }

    const previousStock = ingredient.stockQuantityMinor;
    const newStock = previousStock - totalMinor;

    // Check for overflow in subtraction (should not happen if safeAddQuantityMinor works correctly)
    if (!Number.isSafeInteger(newStock)) {
      throw new Error(`Stock subtraction overflow for ingredient "${ingredientId}".`);
    }

    if (newStock < 0) {
      hasSufficientStock = false;
      insufficientStockFailures.push({
        ingredientId,
        ingredientName: ingredient.name,
        requiredMinor: totalMinor,
        availableMinor: previousStock
      });
    }

    deductions.push({
      tenantId,
      ingredientId,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      quantityScale: ingredient.quantityScale,
      deductionQuantityMinor: totalMinor,
      previousStockQuantityMinor: previousStock,
      newStockQuantityMinor: newStock
    });
  }

  return {
    tenantId,
    orderId,
    deductions,
    insufficientStockFailures,
    hasSufficientStock
  };
}

// ==========================================
// Utility: Build Lookup Functions
// ==========================================

type Lookup<K extends string, V> = { get(key: K): V | undefined };

function buildLookup<K extends string, V>(input: Map<K, V> | Record<K, V>): Lookup<K, V> {
  if (input instanceof Map) {
    return { get: (key: K) => input.get(key) };
  }
  const record = input as Record<K, V>;
  return { get: (key: K) => record[key] };
}

function buildIngredientLookup(input: Map<string, Ingredient> | Record<string, Ingredient> | IngredientsLookup): IngredientsLookup {
  if (input instanceof Map) {
    return { get: (id: string) => input.get(id) };
  }
  if ('get' in input && typeof (input as any).get === 'function') {
    return input as IngredientsLookup;
  }
  const record = input as Record<string, Ingredient>;
  return { get: (id: string) => record[id] };
}