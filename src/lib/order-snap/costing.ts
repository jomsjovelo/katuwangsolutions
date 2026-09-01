/**
 * Order Snap — Pure Deterministic Recipe & COGS Costing Engine
 *
 * Invariants:
 * 1. Exact integer centavo arithmetic with BigInt intermediate scaling and Round Half-Up.
 * 2. Zero floating-point drift in ingredient or monetary calculations.
 * 3. Immutable audit snapshot generation for historical sale lines with recursive deepFreeze.
 * 4. Authoritative modifier resolution: modifier options and groups are resolved exclusively
 *    from authoritative group definitions; direct/untrusted options are rejected.
 * 5. Deterministic order-independent modifier aggregation and canonical ASCII sorting.
 * 6. Strict yield: 1 constraint and negative quantity/price fail-closed policies.
 * 7. Active recipe verification, tenant identity enforcement, and full modifier group validation.
 */

import {
  Ingredient,
  RecipeVersion,
  RecipeComponent,
  MenuItem,
  ModifierOption,
  ModifierGroup,
  HistoricalComponentSnapshot,
  HistoricalModifierSnapshot,
  SaleLineSnapshot,
  SaleLineSnapshotSchema,
  IngredientSchema,
  ModifierGroupSchema
} from './domain-schemas';
import {
  calculateProportionalCost,
  safeAddMoney,
  safeMultiplyMoney,
  safeAddQuantityMinor,
  calculateGrossMarginBasisPoints,
  deepFreeze,
  getUnitMetadata,
  areUnitsCompatible,
  asciiCompare
} from './quantity-math';

export interface IngredientsLookup {
  get(id: string): Ingredient | undefined;
}

export type ModifierGroupsInput =
  | ModifierGroup[]
  | Map<string, ModifierGroup>
  | Record<string, ModifierGroup>;

export type SelectedModifierSelection =
  | { readonly groupId: string; readonly optionId: string }
  | { readonly group: { readonly id: string; [key: string]: any }; readonly option: { readonly id: string; [key: string]: any } };

function toIngredientsLookup(
  ingredients: Map<string, Ingredient> | Record<string, Ingredient> | IngredientsLookup
): IngredientsLookup {
  if ('get' in ingredients && typeof ingredients.get === 'function') {
    return ingredients as IngredientsLookup;
  }
  const record = ingredients as Record<string, Ingredient>;
  return {
    get: (id: string) => record[id]
  };
}

/**
 * Normalizes any supported modifier groups collection (Array, Map, Record) into a canonical Map.
 * Enforces key-ID matching and duplicate prevention.
 */
export function normalizeModifierGroups(
  input?: ModifierGroupsInput
): Map<string, ModifierGroup> {
  const map = new Map<string, ModifierGroup>();
  if (!input) return map;

  if (input instanceof Map) {
    for (const [k, v] of input.entries()) {
      ModifierGroupSchema.parse(v);
      if (k !== v.id) {
        throw new Error(`Map key "${k}" does not match ModifierGroup id "${v.id}".`);
      }
      map.set(k, v);
    }
    return map;
  }

  if (Array.isArray(input)) {
    for (const group of input) {
      ModifierGroupSchema.parse(group);
      if (map.has(group.id)) {
        throw new Error(`Duplicate modifier group ID "${group.id}" in array input.`);
      }
      map.set(group.id, group);
    }
    return map;
  }

  if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) {
      ModifierGroupSchema.parse(v);
      if (k !== v.id) {
        throw new Error(`Record key "${k}" does not match ModifierGroup id "${v.id}".`);
      }
      map.set(k, v);
    }
    return map;
  }

  throw new Error('Unsupported modifier groups collection format.');
}

/**
 * Validates recipe invariants and calculates base recipe cost in integer centavos.
 */
export function calculateRecipeBaseCost(
  recipe: RecipeVersion,
  ingredients: Map<string, Ingredient> | Record<string, Ingredient> | IngredientsLookup
): {
  totalCostCentavos: number;
  componentBreakdown: Array<{
    ingredientId: string;
    ingredientName: string;
    quantityMinor: number;
    unit: string;
    quantityScale: number;
    basisQuantityMinor: number;
    basisCostCentavos: number;
    costCentavos: number;
  }>;
} {
  if (recipe.yield !== 1) {
    throw new Error(
      `Unsupported recipe yield: ${recipe.yield}. Current foundation only supports yield: 1 (single-serving recipes).`
    );
  }

  const lookup = toIngredientsLookup(ingredients);
  let totalCost = 0;
  const breakdown: Array<{
    ingredientId: string;
    ingredientName: string;
    quantityMinor: number;
    unit: string;
    quantityScale: number;
    basisQuantityMinor: number;
    basisCostCentavos: number;
    costCentavos: number;
  }> = [];

  const seenIngredientIds = new Set<string>();

  for (const comp of recipe.components) {
    if (seenIngredientIds.has(comp.ingredientId)) {
      throw new Error(`Duplicate ingredient component "${comp.ingredientId}" found in recipe "${recipe.id}".`);
    }
    seenIngredientIds.add(comp.ingredientId);

    const ingredient = lookup.get(comp.ingredientId);
    if (!ingredient) {
      throw new Error(`Ingredient with ID "${comp.ingredientId}" not found in lookup.`);
    }
    // Validate ingredient adheres to schema and closed unit registry
    IngredientSchema.parse(ingredient);

    if (!ingredient.isActive) {
      throw new Error(`Ingredient "${ingredient.name}" (${ingredient.id}) is inactive.`);
    }
    if (ingredient.tenantId !== recipe.tenantId) {
      throw new Error(
        `Tenant mismatch: Ingredient "${ingredient.id}" (${ingredient.tenantId}) does not match recipe tenant "${recipe.tenantId}".`
      );
    }

    // Verify unit compatibility and scale matching
    if (comp.unit) {
      const compUnitMeta = getUnitMetadata(comp.unit);
      if (!areUnitsCompatible(compUnitMeta.canonicalUnit, ingredient.unit)) {
        throw new Error(
          `Component unit "${comp.unit}" is incompatible with ingredient canonical unit "${ingredient.unit}".`
        );
      }
    }

    if (comp.quantityScale !== undefined && comp.quantityScale !== ingredient.quantityScale) {
      throw new Error(
        `Component quantityScale "${comp.quantityScale}" does not match ingredient quantityScale "${ingredient.quantityScale}".`
      );
    }

    const componentCost = calculateProportionalCost(
      comp.quantityMinor,
      ingredient.costBasis.basisQuantityMinor,
      ingredient.costBasis.basisCostCentavos
    );

    totalCost = safeAddMoney(totalCost, componentCost, false);
    breakdown.push({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      quantityMinor: comp.quantityMinor,
      unit: ingredient.unit,
      quantityScale: ingredient.quantityScale,
      basisQuantityMinor: ingredient.costBasis.basisQuantityMinor,
      basisCostCentavos: ingredient.costBasis.basisCostCentavos,
      costCentavos: componentCost
    });
  }

  return {
    totalCostCentavos: totalCost,
    componentBreakdown: breakdown
  };
}

/**
 * Authoritatively resolves and aggregates modifier selections against applicable modifier groups.
 * No standalone or untrusted modifier option objects are ever used for costing calculations.
 */
export function aggregateModifiers(
  selectedModifiers: SelectedModifierSelection[],
  applicableGroupsInput?: ModifierGroupsInput,
  menuItem?: MenuItem
): {
  totalPriceDeltaCentavos: number;
  netIngredientDeltas: Map<string, number>;
  normalizedOptions: ModifierOption[];
  historicalModifiers: HistoricalModifierSnapshot[];
} {
  const groupsMap = normalizeModifierGroups(applicableGroupsInput);

  if (menuItem) {
    if (menuItem.modifierGroupIds.length > 0) {
      if (groupsMap.size === 0) {
        throw new Error(
          `MenuItem "${menuItem.name}" (${menuItem.id}) configures modifier groups, but no authoritative modifierGroups were supplied.`
        );
      }
      for (const requiredGroupId of menuItem.modifierGroupIds) {
        if (!groupsMap.has(requiredGroupId)) {
          throw new Error(
            `Configured modifier group "${requiredGroupId}" is missing from supplied modifierGroups.`
          );
        }
      }
    } else {
      // Menu item has no modifier groups -> selections must be empty
      if (selectedModifiers.length > 0) {
        throw new Error(
          `MenuItem "${menuItem.name}" (${menuItem.id}) has no modifier groups, but ${selectedModifiers.length} modifier(s) were selected.`
        );
      }
    }

    for (const [groupId, group] of groupsMap.entries()) {
      if (group.tenantId !== menuItem.tenantId) {
        throw new Error(
          `Tenant mismatch: Modifier group "${groupId}" (${group.tenantId}) does not match MenuItem tenant "${menuItem.tenantId}".`
        );
      }
      if (!menuItem.modifierGroupIds.includes(groupId)) {
        throw new Error(
          `Modifier group "${groupId}" is not listed in MenuItem modifierGroupIds.`
        );
      }
    }
  } else if (groupsMap.size === 0 && selectedModifiers.length > 0) {
    throw new Error(
      'Authoritative modifier groups must be supplied when modifier selections are provided.'
    );
  }

  let totalPriceDelta = 0;
  const netIngredientDeltas = new Map<string, number>();
  const normalizedOptions: ModifierOption[] = [];
  const historicalModifiers: HistoricalModifierSnapshot[] = [];

  const seenOptionIds = new Set<string>();
  const groupSelectionsCount = new Map<string, number>();

  for (const item of selectedModifiers) {
    let rawGroupId: string;
    let rawOptionId: string;

    if ('groupId' in item && 'optionId' in item) {
      rawGroupId = item.groupId;
      rawOptionId = item.optionId;
    } else if ('group' in item && 'option' in item && item.group?.id && item.option?.id) {
      rawGroupId = item.group.id;
      rawOptionId = item.option.id;
    } else {
      throw new Error(
        'Invalid modifier selection structure. Must provide { groupId, optionId }.'
      );
    }

    const authoritativeGroup = groupsMap.get(rawGroupId);
    if (!authoritativeGroup) {
      throw new Error(`Modifier group "${rawGroupId}" is not an applicable modifier group for this item.`);
    }
    if (!authoritativeGroup.isActive) {
      throw new Error(`Modifier group "${authoritativeGroup.name}" (${authoritativeGroup.id}) is inactive.`);
    }

    const authoritativeOption = authoritativeGroup.options.find(o => o.id === rawOptionId);
    if (!authoritativeOption) {
      throw new Error(
        `Modifier option "${rawOptionId}" does not belong to modifier group "${authoritativeGroup.id}".`
      );
    }
    if (authoritativeOption.isAvailable === false) {
      throw new Error(`Modifier option "${authoritativeOption.name}" (${authoritativeOption.id}) is unavailable.`);
    }

    if (seenOptionIds.has(authoritativeOption.id)) {
      throw new Error(`Duplicate modifier option "${authoritativeOption.id}" selected. Option quantities are not supported.`);
    }
    seenOptionIds.add(authoritativeOption.id);

    const count = groupSelectionsCount.get(authoritativeGroup.id) || 0;
    groupSelectionsCount.set(authoritativeGroup.id, count + 1);

    normalizedOptions.push(authoritativeOption);
    totalPriceDelta = safeAddMoney(totalPriceDelta, authoritativeOption.priceDeltaCentavos, true);

    // Sort ingredient deltas canonically
    const sortedDeltas = [...(authoritativeOption.ingredientDeltas || [])].sort((a, b) =>
      asciiCompare(a.ingredientId, b.ingredientId)
    );

    for (const delta of sortedDeltas) {
      const current = netIngredientDeltas.get(delta.ingredientId) || 0;
      const updated = safeAddQuantityMinor(current, delta.quantityMinorDelta, true);
      netIngredientDeltas.set(delta.ingredientId, updated);
    }

    historicalModifiers.push({
      modifierGroupId: authoritativeGroup.id,
      modifierGroupName: authoritativeGroup.name,
      modifierOptionId: authoritativeOption.id,
      modifierOptionName: authoritativeOption.name,
      priceDeltaCentavos: authoritativeOption.priceDeltaCentavos,
      ingredientDeltas: sortedDeltas.map(d => ({
        ingredientId: d.ingredientId,
        quantityMinorDelta: d.quantityMinorDelta
      }))
    });
  }

  // Validate group-level selection constraints for all applicable groups
  for (const group of groupsMap.values()) {
    const count = groupSelectionsCount.get(group.id) || 0;
    if (group.isRequired && count === 0) {
      throw new Error(`Missing selection for required modifier group "${group.name}" (${group.id}).`);
    }
    if (count < group.minSelections) {
      throw new Error(
        `Modifier group "${group.name}" requires at least ${group.minSelections} selections, but received ${count}.`
      );
    }
    if (count > group.maxSelections) {
      throw new Error(
        `Modifier group "${group.name}" allows at most ${group.maxSelections} selections, but received ${count}.`
      );
    }
  }

  return {
    totalPriceDeltaCentavos: totalPriceDelta,
    netIngredientDeltas,
    normalizedOptions,
    historicalModifiers
  };
}

/**
 * Calculates complete MenuItem COGS and component breakdown with selected modifiers applied.
 */
export function calculateMenuItemCogs(params: {
  menuItem: MenuItem;
  recipe: RecipeVersion;
  selectedModifiers?: SelectedModifierSelection[];
  modifierGroups?: ModifierGroupsInput;
  ingredients: Map<string, Ingredient> | Record<string, Ingredient> | IngredientsLookup;
}): {
  unitCogsCentavos: number;
  baseRecipeCostCentavos: number;
  modifierCostDeltaCentavos: number;
  finalSellingPriceCentavos: number;
  componentBreakdown: HistoricalComponentSnapshot[];
  historicalModifiers: HistoricalModifierSnapshot[];
} {
  const { menuItem, recipe, selectedModifiers = [], modifierGroups, ingredients } = params;
  const lookup = toIngredientsLookup(ingredients);

  // Validate recipe and menu item agreement
  if (recipe.id !== menuItem.activeRecipeVersionId) {
    throw new Error(
      `Recipe ID "${recipe.id}" does not match MenuItem activeRecipeVersionId "${menuItem.activeRecipeVersionId}".`
    );
  }
  if (recipe.menuItemId !== menuItem.id) {
    throw new Error(
      `Recipe menuItemId "${recipe.menuItemId}" does not match MenuItem ID "${menuItem.id}".`
    );
  }
  if (recipe.tenantId !== menuItem.tenantId) {
    throw new Error(
      `Recipe tenantId "${recipe.tenantId}" does not match MenuItem tenantId "${menuItem.tenantId}".`
    );
  }

  // 1. Calculate base recipe cost
  const baseResult = calculateRecipeBaseCost(recipe, lookup);
  const baseCostCentavos = baseResult.totalCostCentavos;

  // 2. Authoritatively aggregate modifier impacts
  const {
    totalPriceDeltaCentavos,
    netIngredientDeltas,
    historicalModifiers
  } = aggregateModifiers(selectedModifiers, modifierGroups, menuItem);

  // 3. Merge recipe base components with modifier ingredient deltas
  const combinedComponentsMap = new Map<string, {
    baseQtyMinor: number;
    deltaQtyMinor: number;
  }>();

  for (const comp of recipe.components) {
    combinedComponentsMap.set(comp.ingredientId, {
      baseQtyMinor: comp.quantityMinor,
      deltaQtyMinor: 0
    });
  }

  for (const [ingredientId, deltaQtyMinor] of netIngredientDeltas.entries()) {
    const existing = combinedComponentsMap.get(ingredientId);
    if (existing) {
      existing.deltaQtyMinor = safeAddQuantityMinor(existing.deltaQtyMinor, deltaQtyMinor, true);
    } else {
      combinedComponentsMap.set(ingredientId, {
        baseQtyMinor: 0,
        deltaQtyMinor
      });
    }
  }

  // 4. Calculate final component costs
  let finalCogsCentavos = 0;
  const componentBreakdown: HistoricalComponentSnapshot[] = [];

  // Deterministic ASCII sorting for ingredient IDs
  const sortedIngredientIds = Array.from(combinedComponentsMap.keys()).sort(asciiCompare);

  for (const ingId of sortedIngredientIds) {
    const record = combinedComponentsMap.get(ingId)!;
    const ingredient = lookup.get(ingId);
    if (!ingredient) {
      throw new Error(`Ingredient with ID "${ingId}" not found in lookup.`);
    }
    if (ingredient.tenantId !== menuItem.tenantId) {
      throw new Error(
        `Tenant mismatch: Ingredient "${ingredient.id}" (${ingredient.tenantId}) does not match MenuItem tenant "${menuItem.tenantId}".`
      );
    }

    // Use safeAddQuantityMinor and fail closed on negative consumption
    const finalQtyMinor = safeAddQuantityMinor(record.baseQtyMinor, record.deltaQtyMinor, true);
    if (finalQtyMinor < 0) {
      throw new Error(
        `Modifier delta results in negative ingredient consumption (${finalQtyMinor} minor units) for ingredient "${ingredient.name}" (${ingredient.id}).`
      );
    }

    const costCentavos = calculateProportionalCost(
      finalQtyMinor,
      ingredient.costBasis.basisQuantityMinor,
      ingredient.costBasis.basisCostCentavos
    );

    finalCogsCentavos = safeAddMoney(finalCogsCentavos, costCentavos, false);

    componentBreakdown.push({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      quantityScale: ingredient.quantityScale,
      baseQuantityMinor: record.baseQtyMinor,
      deltaQuantityMinor: record.deltaQtyMinor,
      finalQuantityMinor: finalQtyMinor,
      basisQuantityMinor: ingredient.costBasis.basisQuantityMinor,
      basisCostCentavos: ingredient.costBasis.basisCostCentavos,
      componentCostCentavos: costCentavos
    });
  }

  // Final selling price must be non-negative, otherwise fail closed
  const finalSellingPriceCentavos = safeAddMoney(menuItem.basePriceCentavos, totalPriceDeltaCentavos, false);
  const modifierCostDeltaCentavos = finalCogsCentavos - baseCostCentavos;

  return {
    unitCogsCentavos: finalCogsCentavos,
    baseRecipeCostCentavos: baseCostCentavos,
    modifierCostDeltaCentavos,
    finalSellingPriceCentavos,
    componentBreakdown,
    historicalModifiers
  };
}

/**
 * Creates a deeply immutable, frozen Historical SaleLineSnapshot.
 * Requires caller-provided saleLineId and createdAt to ensure absolute determinism.
 */
export function createSaleLineSnapshot(params: {
  menuItem: MenuItem;
  recipe: RecipeVersion;
  selectedModifiers?: SelectedModifierSelection[];
  modifierGroups?: ModifierGroupsInput;
  ingredients: Map<string, Ingredient> | Record<string, Ingredient> | IngredientsLookup;
  quantity: number;
  saleLineId: string;
  createdAt: string;
  tenantId?: string;
}): Readonly<SaleLineSnapshot> {
  const {
    menuItem,
    recipe,
    selectedModifiers = [],
    modifierGroups,
    ingredients,
    quantity,
    saleLineId,
    createdAt,
    tenantId
  } = params;

  if (!saleLineId || typeof saleLineId !== 'string' || saleLineId.trim().length === 0) {
    throw new Error('Caller must provide a non-empty saleLineId for deterministic snapshots.');
  }

  if (!createdAt || typeof createdAt !== 'string' || createdAt.trim().length === 0) {
    throw new Error('Caller must provide a non-empty createdAt timestamp string for deterministic snapshots.');
  }

  // Tenant validation: if provided, must match menuItem.tenantId
  if (tenantId !== undefined && tenantId.trim() !== menuItem.tenantId) {
    throw new Error(
      `Tenant mismatch: Snapshot tenantId "${tenantId}" does not match MenuItem tenantId "${menuItem.tenantId}".`
    );
  }

  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error(`Sale line quantity must be a positive safe integer, received: ${quantity}`);
  }

  const cogsResult = calculateMenuItemCogs({
    menuItem,
    recipe,
    selectedModifiers,
    modifierGroups,
    ingredients
  });

  const unitCogsCentavos = cogsResult.unitCogsCentavos;
  const lineCogsCentavos = safeMultiplyMoney(unitCogsCentavos, quantity);
  const lineRevenueCentavos = safeMultiplyMoney(cogsResult.finalSellingPriceCentavos, quantity);
  const lineGrossProfitCentavos = lineRevenueCentavos - lineCogsCentavos;

  const grossMarginBasisPoints = calculateGrossMarginBasisPoints(
    lineGrossProfitCentavos,
    lineRevenueCentavos
  );

  // Canonical ASCII sorting for modifiers
  const sortedModifiers = [...cogsResult.historicalModifiers].sort((a, b) => {
    const grpCmp = asciiCompare(a.modifierGroupId, b.modifierGroupId);
    if (grpCmp !== 0) return grpCmp;
    return asciiCompare(a.modifierOptionId, b.modifierOptionId);
  });

  const rawSnapshot: SaleLineSnapshot = {
    saleLineId: saleLineId.trim(),
    tenantId: menuItem.tenantId,
    menuItemId: menuItem.id,
    menuItemName: menuItem.name,
    category: menuItem.category,
    basePriceCentavos: menuItem.basePriceCentavos,
    finalUnitPriceCentavos: cogsResult.finalSellingPriceCentavos,
    quantity,
    unitCogsCentavos,
    lineCogsCentavos,
    lineRevenueCentavos,
    lineGrossProfitCentavos,
    grossMarginBasisPoints,
    recipeVersionId: recipe.id,
    recipeVersionNumber: recipe.version,
    components: cogsResult.componentBreakdown,
    selectedModifiers: sortedModifiers,
    createdAt: createdAt.trim()
  };

  // Validate with Zod schema to enforce all invariants
  const validated = SaleLineSnapshotSchema.parse(rawSnapshot);

  // Deeply freeze and return immutable readonly snapshot
  return deepFreeze(validated);
}
