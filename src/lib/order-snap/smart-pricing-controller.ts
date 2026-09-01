/**
 * Order Snap — Smart Pricing Controller & UI View-Model Adapter
 *
 * Invariants:
 * 1. Strict, controlled string-to-centavo and string-to-basis-points parsing without parseFloat.
 * 2. Pure local calculation state with zero Firestore/network writes.
 * 3. Authoritative adaptation from legacy and canonical item/recipe/ingredient models.
 * 4. Strict owner-only access enforcement in rendered UI logic.
 */

import {
  MenuItem,
  RecipeVersion,
  Ingredient,
  ModifierGroup,
  IngredientSchema,
  RecipeVersionSchema,
  MenuItemSchema
} from './domain-schemas';
import {
  calculateOrderSmartPricing,
  OrderSmartPricingResult,
  SalesChannel,
  ChannelCostConfig
} from './smart-pricing';
import {
  validateMoneyCentavos,
  MAX_SAFE_CENTAVOS,
  getUnitMetadata,
  parseQuantityInput
} from './quantity-math';

/**
 * Strict adapter helper to convert an input quantity (number or string) in a declared unit
 * into canonical minor units without Math.round or epsilon tolerance.
 * Rejects invalid, fractional/unrepresentable, or out-of-bounds quantities.
 */
export function adaptQuantityToCanonicalMinor(
  amount: number | string,
  rawUnit: string
): { quantityMinor: number; canonicalUnit: string; quantityScale: number } {
  const spec = parseQuantityInput(amount, rawUnit);
  return {
    quantityMinor: spec.quantityMinor,
    canonicalUnit: spec.unit,
    quantityScale: spec.quantityScale
  };
}

/**
 * Strict peso string parser to integer centavos.
 * Rejects non-numeric, negative, and invalid decimals.
 */
export function parsePesoStringToCentavos(input: string): number {
  if (typeof input !== 'string') {
    throw new Error('Peso input must be a string.');
  }
  const trimmed = input.trim();
  if (trimmed === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(
      `Invalid peso amount: "${input}". Must be a non-negative decimal with up to 2 decimal places.`
    );
  }
  const parts = trimmed.split('.');
  const whole = parseInt(parts[0], 10);
  const fracStr = parts[1] ? parts[1].padEnd(2, '0').substring(0, 2) : '00';
  const frac = parseInt(fracStr, 10);
  const centavos = whole * 100 + frac;
  validateMoneyCentavos(centavos, false);
  return centavos;
}

/**
 * Strict percentage string parser to integer basis points (1% = 100 bps).
 * Rejects non-numeric, negative, and invalid decimals.
 */
export function parsePercentageStringToBps(input: string): number {
  if (typeof input !== 'string') {
    throw new Error('Percentage input must be a string.');
  }
  const trimmed = input.trim();
  if (trimmed === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(
      `Invalid percentage: "${input}". Must be a non-negative number with up to 2 decimal places.`
    );
  }
  const parts = trimmed.split('.');
  const whole = parseInt(parts[0], 10);
  const fracStr = parts[1] ? parts[1].padEnd(2, '0').substring(0, 2) : '00';
  const frac = parseInt(fracStr, 10);
  const bps = whole * 100 + frac;
  if (bps < 0 || bps > 10000) {
    throw new Error(`Percentage (${input}%) exceeds maximum safe bounds (0% to 100%).`);
  }
  return bps;
}

/**
 * Formats integer centavos to display peso string (e.g. 14500 -> "145.00").
 */
export function formatCentavosToPeso(centavos: number): string {
  const isNeg = centavos < 0;
  const abs = Math.abs(centavos);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${isNeg ? '-' : ''}${whole.toLocaleString('en-PH')}.${frac}`;
}

/**
 * Formats integer basis points to display percentage (e.g. 2032 -> "20.32%").
 */
export function formatBpsToPercentage(bps: number): string {
  const isNeg = bps < 0;
  const abs = Math.abs(bps);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${isNeg ? '-' : ''}${whole}.${frac}%`;
}

export interface LegacyMenuItem {
  id?: string;
  tenantId: string;
  name: string;
  price: number; // centavos
  category?: string;
  isAvailable?: boolean;
  costPerServing?: number;
  recipe?: Array<{
    ingredientId: string;
    amount: number;
  }>;
}

export interface LegacyIngredient {
  id?: string;
  tenantId: string;
  name: string;
  unitOfMeasurement?: string;
  unitCost: number; // centavos per unit
  currentStock?: number;
  isActive?: boolean;
}

/**
 * Adapts legacy Timpla menu item and referenced ingredients to canonical Order Snap domain objects.
 * Strictly adapts ONLY ingredients referenced in the recipe; unrelated inventory ingredients are ignored.
 * Uses exact fixed-point conversion without Math.round or epsilon tolerance.
 * Fails closed when required recipe or cost basis data is missing, units are unknown, or tenants mismatch.
 */
export function adaptLegacyItemToOrderSnap(params: {
  menuItem: LegacyMenuItem;
  ingredients: LegacyIngredient[];
  tenantId: string;
}): {
  canonicalMenuItem: MenuItem;
  canonicalRecipe: RecipeVersion;
  canonicalIngredientsMap: Map<string, Ingredient>;
} {
  const { menuItem, ingredients, tenantId } = params;

  if (!tenantId || tenantId.trim() === '') {
    throw new Error('Valid tenant ID is required.');
  }

  if (!menuItem.id || menuItem.id.trim() === '') {
    throw new Error('Menu item is missing an ID.');
  }

  if (menuItem.tenantId !== tenantId) {
    throw new Error(`Tenant mismatch: Menu item tenant "${menuItem.tenantId}" does not match active tenant "${tenantId}".`);
  }

  if (!menuItem.recipe || menuItem.recipe.length === 0) {
    throw new Error('Complete the recipe and ingredient costs before using Smart Pricing.');
  }

  // 1. Build the referenced ingredient-ID set from the selected recipe
  const referencedIngredientIds = new Set<string>();
  for (const component of menuItem.recipe) {
    if (!component.ingredientId || typeof component.ingredientId !== 'string' || component.ingredientId.trim() === '') {
      throw new Error('Recipe component is missing an ingredient ID.');
    }
    if (referencedIngredientIds.has(component.ingredientId)) {
      throw new Error(`Duplicate recipe component for ingredient "${component.ingredientId}".`);
    }
    referencedIngredientIds.add(component.ingredientId);
  }

  // 2. Index inventory by ID, rejecting duplicates in inventory list
  const legacyMap = new Map<string, LegacyIngredient>();
  for (const legacyIng of ingredients) {
    if (!legacyIng.id) continue;
    if (legacyMap.has(legacyIng.id)) {
      throw new Error(`Duplicate inventory ingredient ID "${legacyIng.id}".`);
    }
    legacyMap.set(legacyIng.id, legacyIng);
  }

  // 3. Resolve and adapt ONLY the referenced ingredients
  const ingredientsMap = new Map<string, Ingredient>();

  for (const ingId of referencedIngredientIds) {
    const legacyIng = legacyMap.get(ingId);
    if (!legacyIng) {
      throw new Error(`Recipe ingredient "${ingId}" was not found in ingredient inventory.`);
    }

    if (legacyIng.tenantId !== tenantId) {
      throw new Error(`Tenant mismatch: Ingredient "${legacyIng.name}" (${legacyIng.id}) tenant "${legacyIng.tenantId}" does not match active tenant "${tenantId}".`);
    }

    if (legacyIng.unitCost === undefined || legacyIng.unitCost < 0 || !Number.isSafeInteger(legacyIng.unitCost)) {
      throw new Error(`Ingredient "${legacyIng.name}" has no valid integer cost basis.`);
    }

    const rawUnit = (legacyIng.unitOfMeasurement || '').trim().toLowerCase();
    if (!rawUnit) {
      throw new Error(`Ingredient "${legacyIng.name}" has no unit of measurement specified.`);
    }

    // Convert declared 1 unit of measurement to canonical minor units for cost basis
    const basisSpec = adaptQuantityToCanonicalMinor(1, rawUnit);

    // Convert stock quantity to canonical minor units
    const rawStock = legacyIng.currentStock !== undefined ? legacyIng.currentStock : 0;
    const stockSpec = adaptQuantityToCanonicalMinor(rawStock, rawUnit);

    const canonicalIng: Ingredient = {
      id: legacyIng.id || ingId,
      tenantId: legacyIng.tenantId,
      name: legacyIng.name,
      unit: basisSpec.canonicalUnit,
      quantityScale: basisSpec.quantityScale,
      stockQuantityMinor: stockSpec.quantityMinor,
      reorderLevelMinor: 0,
      costBasis: {
        basisQuantityMinor: basisSpec.quantityMinor,
        basisCostCentavos: legacyIng.unitCost
      },
      isActive: legacyIng.isActive ?? true,
      version: 1
    };

    IngredientSchema.parse(canonicalIng);
    ingredientsMap.set(canonicalIng.id, canonicalIng);
  }

  const recipeVersionId = `rec_${menuItem.id}_v1`;
  const components = menuItem.recipe.map((r) => {
    const ing = ingredientsMap.get(r.ingredientId);
    if (!ing) {
      throw new Error(`Recipe ingredient "${r.ingredientId}" was not found in ingredient inventory.`);
    }

    const legacyIng = legacyMap.get(r.ingredientId)!;
    const rawUnit = (legacyIng.unitOfMeasurement || ing.unit).trim().toLowerCase();
    const compSpec = adaptQuantityToCanonicalMinor(r.amount, rawUnit);

    if (compSpec.quantityMinor <= 0) {
      throw new Error(`Invalid recipe quantity for ingredient "${ing.name}": ${r.amount}. Must convert to a positive integer minor unit.`);
    }

    return {
      ingredientId: ing.id,
      quantityMinor: compSpec.quantityMinor,
      unit: compSpec.canonicalUnit,
      quantityScale: compSpec.quantityScale
    };
  });

  const canonicalRecipe: RecipeVersion = {
    id: recipeVersionId,
    tenantId: menuItem.tenantId,
    menuItemId: menuItem.id,
    version: 1,
    yield: 1,
    isActive: true,
    components
  };

  RecipeVersionSchema.parse(canonicalRecipe);

  const canonicalMenuItem: MenuItem = {
    id: menuItem.id,
    tenantId: menuItem.tenantId,
    name: menuItem.name,
    category: menuItem.category || 'General',
    basePriceCentavos: menuItem.price,
    activeRecipeVersionId: recipeVersionId,
    modifierGroupIds: [],
    isAvailable: menuItem.isAvailable ?? true,
    isActive: true
  };

  MenuItemSchema.parse(canonicalMenuItem);

  return {
    canonicalMenuItem,
    canonicalRecipe,
    canonicalIngredientsMap: ingredientsMap
  };
}

export interface SmartPricingCalculatorFormState {
  channel: SalesChannel;
  packagingCostStr: string;
  wastageAllowanceBpsStr: string;
  operatingCostAllocationStr: string;
  channelFeeBpsStr: string;
  targetContributionMarginBpsStr: string;
  priceRoundingIncrementCentavos: number;
  selectedModifierIds: string[];
  proposedPriceCentavos: number | null;
}

export const INITIAL_CALCULATOR_FORM_STATE: SmartPricingCalculatorFormState = {
  channel: 'dine_in',
  packagingCostStr: '0.00',
  wastageAllowanceBpsStr: '3.00', // 3.00%
  operatingCostAllocationStr: '10.00', // ₱10.00
  channelFeeBpsStr: '0.00', // 0%
  targetContributionMarginBpsStr: '40.00', // 40%
  priceRoundingIncrementCentavos: 100, // ₱1.00 upward
  selectedModifierIds: [],
  proposedPriceCentavos: null
};

/**
 * Executes a pure local evaluation of the Smart Pricing Calculator.
 * Returns either successful computation or controlled error/warnings without network calls.
 */
export function evaluateSmartPricingController(params: {
  isOwner: boolean;
  menuItem: MenuItem;
  recipe: RecipeVersion;
  ingredients: Map<string, Ingredient>;
  modifierGroups?: ModifierGroup[];
  formState: SmartPricingCalculatorFormState;
  channelConfigs?: Partial<Record<SalesChannel, ChannelCostConfig>>;
}): {
  canCalculate: boolean;
  result?: OrderSmartPricingResult;
  error?: string;
} {
  const { isOwner, menuItem, recipe, ingredients, modifierGroups, formState, channelConfigs } = params;

  // Access Control: Non-owners cannot calculate or view pricing details
  if (!isOwner) {
    return {
      canCalculate: false,
      error: 'Access restricted: Only business owners can access Smart Pricing.'
    };
  }

  try {
    const packagingCostCentavos = parsePesoStringToCentavos(formState.packagingCostStr);
    const wastageAllowanceBps = parsePercentageStringToBps(formState.wastageAllowanceBpsStr);
    const operatingCostAllocationCentavos = parsePesoStringToCentavos(formState.operatingCostAllocationStr);
    const channelFeeBps = parsePercentageStringToBps(formState.channelFeeBpsStr);
    const targetContributionMarginBps = parsePercentageStringToBps(formState.targetContributionMarginBpsStr);

    // Map selected modifier IDs to { groupId, optionId } — fail closed on every ID
    const selectedModifiers: Array<{ groupId: string; optionId: string }> = [];
    if (formState.selectedModifierIds.length > 0) {
      if (!modifierGroups || modifierGroups.length === 0) {
        throw new Error(
          'Selected modifier IDs were provided but no authoritative modifier groups are available.'
        );
      }

      const seenOptionIds = new Set<string>();
      for (const optId of formState.selectedModifierIds) {
        if (!optId || typeof optId !== 'string') {
          throw new Error('Invalid modifier option ID: must be a non-empty string.');
        }
        if (seenOptionIds.has(optId)) {
          throw new Error(`Duplicate modifier selection: option ID "${optId}" is selected more than once.`);
        }
        seenOptionIds.add(optId);

        let foundGroup: ModifierGroup | undefined;
        for (const g of modifierGroups) {
          if (g.options.some(o => o.id === optId)) {
            if (foundGroup) {
              throw new Error(
                `Ambiguous modifier option ID "${optId}": found in multiple groups ("${foundGroup.id}" and "${g.id}").`
              );
            }
            foundGroup = g;
          }
        }
        if (!foundGroup) {
          throw new Error(
            `Modifier option ID "${optId}" was not found in any authoritative modifier group. ` +
            'It may be stale, deleted, or fabricated.'
          );
        }
        selectedModifiers.push({ groupId: foundGroup.id, optionId: optId });
      }
    }

    const result = calculateOrderSmartPricing(
      {
        menuItem,
        recipe,
        ingredients,
        modifierGroups,
        selectedModifiers,
        channel: formState.channel,
        packagingCostCentavos,
        wastageAllowanceBps,
        operatingCostAllocationCentavos,
        channelFeeBps,
        currentSellingPriceCentavos: menuItem.basePriceCentavos,
        targetContributionMarginBps,
        priceRoundingIncrementCentavos: formState.priceRoundingIncrementCentavos
      },
      channelConfigs
    );

    return {
      canCalculate: true,
      result
    };
  } catch (err: any) {
    return {
      canCalculate: false,
      error: err?.message || 'Calculation error in Smart Pricing.'
    };
  }
}

/**
 * Pure helper to adopt a proposed selling price into calculator form state.
 * Validates safe non-negative integer centavos and returns new state object without mutating previous state.
 * Pure local state transition — zero persistence / network side effects.
 */
export function adoptProposedPrice(
  previousState: SmartPricingCalculatorFormState,
  priceCentavos: number
): SmartPricingCalculatorFormState {
  validateMoneyCentavos(priceCentavos, false);
  return {
    ...previousState,
    proposedPriceCentavos: priceCentavos
  };
}

/**
 * Pure helper to reset calculator form state to initial defaults.
 * Pure local state transition — zero persistence / network side effects.
 */
export function resetSmartPricingState(): SmartPricingCalculatorFormState {
  return { ...INITIAL_CALCULATOR_FORM_STATE };
}
