import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  Ingredient,
  RecipeVersion,
  MenuItem,
  ModifierGroup,
  IngredientSchema,
  RecipeVersionSchema,
  MenuItemSchema
} from '../src/lib/order-snap/domain-schemas';

import {
  parsePesoStringToCentavos,
  parsePercentageStringToBps,
  formatCentavosToPeso,
  formatBpsToPercentage,
  adaptQuantityToCanonicalMinor,
  adaptLegacyItemToOrderSnap,
  adoptProposedPrice,
  resetSmartPricingState,
  evaluateSmartPricingController,
  INITIAL_CALCULATOR_FORM_STATE,
  SmartPricingCalculatorFormState,
  LegacyMenuItem,
  LegacyIngredient
} from '../src/lib/order-snap/smart-pricing-controller';

// =========================================================================
// Test Fixtures
// =========================================================================

function createSampleIngredients(): Map<string, Ingredient> {
  const ingredients: Ingredient[] = [
    {
      id: 'ing_espresso_beans',
      tenantId: 'tenant_cafe_1',
      name: 'Espresso Coffee Beans',
      unit: 'kg',
      quantityScale: 3,
      stockQuantityMinor: 10000,
      costBasis: {
        basisQuantityMinor: 1000,
        basisCostCentavos: 120000 // 18g = 2160 centavos
      },
      reorderLevelMinor: 2000,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_fresh_milk',
      tenantId: 'tenant_cafe_1',
      name: 'Fresh Whole Milk',
      unit: 'L',
      quantityScale: 3,
      stockQuantityMinor: 20000,
      costBasis: {
        basisQuantityMinor: 1000,
        basisCostCentavos: 9500 // 200ml = 1900 centavos, 300ml = 2850 centavos
      },
      reorderLevelMinor: 5000,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_vanilla_syrup',
      tenantId: 'tenant_cafe_1',
      name: 'Vanilla Syrup',
      unit: 'L',
      quantityScale: 3,
      stockQuantityMinor: 5000,
      costBasis: {
        basisQuantityMinor: 750,
        basisCostCentavos: 45000 // 30ml = 1800 centavos
      },
      reorderLevelMinor: 1000,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_tube_ice',
      tenantId: 'tenant_cafe_1',
      name: 'Tube Ice',
      unit: 'kg',
      quantityScale: 3,
      stockQuantityMinor: 50000,
      costBasis: {
        basisQuantityMinor: 10000,
        basisCostCentavos: 15000 // 150g = 225 centavos
      },
      reorderLevelMinor: 10000,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_takeout_cup_16oz',
      tenantId: 'tenant_cafe_1',
      name: '16oz PET Cup',
      unit: 'piece',
      quantityScale: 0,
      stockQuantityMinor: 500,
      costBasis: {
        basisQuantityMinor: 100,
        basisCostCentavos: 35000 // 1 pc = 350 centavos
      },
      reorderLevelMinor: 100,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_takeout_lid_flat',
      tenantId: 'tenant_cafe_1',
      name: 'Flat Lid 98mm',
      unit: 'piece',
      quantityScale: 0,
      stockQuantityMinor: 500,
      costBasis: {
        basisQuantityMinor: 100,
        basisCostCentavos: 12000 // 1 pc = 120 centavos
      },
      reorderLevelMinor: 100,
      isActive: true,
      version: 1
    }
  ];

  const map = new Map<string, Ingredient>();
  for (const ing of ingredients) {
    IngredientSchema.parse(ing);
    map.set(ing.id, ing);
  }
  return map;
}

function createIcedLatteRecipe(): RecipeVersion {
  const recipe: RecipeVersion = {
    id: 'rec_iced_latte_v1',
    tenantId: 'tenant_cafe_1',
    menuItemId: 'menu_iced_latte',
    version: 1,
    yield: 1,
    isActive: true,
    components: [
      { ingredientId: 'ing_espresso_beans', quantityMinor: 18, unit: 'kg', quantityScale: 3 },
      { ingredientId: 'ing_fresh_milk', quantityMinor: 200, unit: 'L', quantityScale: 3 },
      { ingredientId: 'ing_vanilla_syrup', quantityMinor: 30, unit: 'L', quantityScale: 3 },
      { ingredientId: 'ing_tube_ice', quantityMinor: 150, unit: 'kg', quantityScale: 3 },
      { ingredientId: 'ing_takeout_cup_16oz', quantityMinor: 1, unit: 'piece', quantityScale: 0 },
      { ingredientId: 'ing_takeout_lid_flat', quantityMinor: 1, unit: 'piece', quantityScale: 0 }
    ]
  };
  return RecipeVersionSchema.parse(recipe);
}

function createIcedLatteMenuItem(): MenuItem {
  const item: MenuItem = {
    id: 'menu_iced_latte',
    tenantId: 'tenant_cafe_1',
    name: 'Iced Vanilla Latte',
    category: 'Espresso Cold',
    basePriceCentavos: 14500,
    activeRecipeVersionId: 'rec_iced_latte_v1',
    modifierGroupIds: ['grp_size', 'grp_espresso_shot'],
    isAvailable: true,
    isActive: true
  };
  return MenuItemSchema.parse(item);
}

function createIcedLatteModifierGroups(): ModifierGroup[] {
  return [
    {
      id: 'grp_size',
      tenantId: 'tenant_cafe_1',
      name: 'Size Options',
      isRequired: false,
      minSelections: 0,
      maxSelections: 1,
      allowMultiple: false,
      options: [
        {
          id: 'opt_size_large',
          name: 'Upsize to 22oz (Large)',
          priceDeltaCentavos: 2000,
          ingredientDeltas: [
            { ingredientId: 'ing_fresh_milk', quantityMinorDelta: 100 },
            { ingredientId: 'ing_espresso_beans', quantityMinorDelta: 6 }
          ],
          isAvailable: true
        }
      ],
      isActive: true
    },
    {
      id: 'grp_espresso_shot',
      tenantId: 'tenant_cafe_1',
      name: 'Extra Espresso Shot',
      isRequired: false,
      minSelections: 0,
      maxSelections: 1,
      allowMultiple: false,
      options: [
        {
          id: 'opt_extra_shot',
          name: 'Extra Espresso Shot (18g)',
          priceDeltaCentavos: 3000,
          ingredientDeltas: [
            { ingredientId: 'ing_espresso_beans', quantityMinorDelta: 18 }
          ],
          isAvailable: true
        }
      ],
      isActive: true
    }
  ];
}

// =========================================================================
// UI Controller & Access Control Test Suites
// =========================================================================

test('1. Owner can access and evaluate Smart Pricing', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  const evalResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: INITIAL_CALCULATOR_FORM_STATE
  });

  assert.equal(evalResult.canCalculate, true);
  assert.ok(evalResult.result);
  assert.equal(evalResult.result.costBreakdown.ingredientCogsCentavos, 6555);
});

test('2. Cashier and non-owner staff are blocked from calculating or viewing COGS', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  const evalResult = evaluateSmartPricingController({
    isOwner: false, // Cashier
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: INITIAL_CALCULATOR_FORM_STATE
  });

  assert.equal(evalResult.canCalculate, false);
  assert.equal(evalResult.result, undefined);
  assert.match(evalResult.error || '', /Access restricted: Only business owners/);
});

test('3. Canonical Large Iced Latte delivery scenario displays exact ₱200.00 and 20.32% margin', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  const formState: SmartPricingCalculatorFormState = {
    channel: 'delivery',
    packagingCostStr: '8.00',
    wastageAllowanceBpsStr: '5.00', // 5.00%
    operatingCostAllocationStr: '15.00', // ₱15.00
    channelFeeBpsStr: '25.00', // 25.00%
    targetContributionMarginBpsStr: '20.00', // 20.00%
    priceRoundingIncrementCentavos: 500, // ₱5.00 rounding
    selectedModifierIds: ['opt_size_large'],
    proposedPriceCentavos: null
  };

  const evalResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState
  });

  assert.equal(evalResult.canCalculate, true);
  const b = evalResult.result!.costBreakdown;
  assert.equal(b.ingredientCogsCentavos, 8225);
  assert.equal(b.wastageAllowanceCentavos, 412);
  assert.equal(b.packagingCostCentavos, 800);
  assert.equal(b.operatingCostAllocationCentavos, 1500);
  assert.equal(b.fixedCostBeforeChannelFeeCentavos, 10937);
  assert.equal(b.breakEvenPriceCentavos, 14583);
  assert.equal(b.targetPriceBeforeRoundingCentavos, 19886);
  assert.equal(b.suggestedPriceCentavos, 20000);
  assert.equal(formatCentavosToPeso(b.suggestedPriceCentavos), '200.00');
  assert.equal(b.channelFeeCentavos, 5000);
  assert.equal(b.contributionProfitCentavos, 4063);
  assert.equal(b.contributionMarginBasisPoints, 2032);
  assert.equal(formatBpsToPercentage(b.contributionMarginBasisPoints), '20.32%');
});

test('4. Exact recipe COGS and contribution values format correctly in pesos and percentages', () => {
  assert.equal(formatCentavosToPeso(6555), '65.55');
  assert.equal(formatCentavosToPeso(20000), '200.00');
  assert.equal(formatCentavosToPeso(14583), '145.83');
  assert.equal(formatBpsToPercentage(2032), '20.32%');
  assert.equal(formatBpsToPercentage(5015), '50.15%');
  assert.equal(formatBpsToPercentage(0), '0.00%');
});

test('5. Changing sales channel updates input values and suggested price', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  // Dine-in: 0% fee, ₱0 packaging
  const dineInResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: {
      ...INITIAL_CALCULATOR_FORM_STATE,
      channel: 'dine_in',
      packagingCostStr: '0.00',
      channelFeeBpsStr: '0.00',
      targetContributionMarginBpsStr: '40.00',
      priceRoundingIncrementCentavos: 100
    }
  });

  // Delivery: 25% fee, ₱8 packaging
  const deliveryResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: {
      ...INITIAL_CALCULATOR_FORM_STATE,
      channel: 'delivery',
      packagingCostStr: '8.00',
      channelFeeBpsStr: '25.00',
      targetContributionMarginBpsStr: '40.00',
      priceRoundingIncrementCentavos: 100
    }
  });

  assert.equal(dineInResult.canCalculate, true);
  assert.equal(deliveryResult.canCalculate, true);
  assert.ok(
    deliveryResult.result!.costBreakdown.suggestedPriceCentavos >
    dineInResult.result!.costBreakdown.suggestedPriceCentavos
  );
});

test('6. Changing target contribution margin strictly updates the suggested price', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  const res30 = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: {
      ...INITIAL_CALCULATOR_FORM_STATE,
      targetContributionMarginBpsStr: '30.00'
    }
  });

  const res60 = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: {
      ...INITIAL_CALCULATOR_FORM_STATE,
      targetContributionMarginBpsStr: '60.00'
    }
  });

  assert.ok(
    res60.result!.costBreakdown.suggestedPriceCentavos >
    res30.result!.costBreakdown.suggestedPriceCentavos
  );
});

test('7. Upward ₱1, ₱5, and ₱10 rounding through UI adapter', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  const baseState = {
    ...INITIAL_CALCULATOR_FORM_STATE,
    channel: 'delivery' as const,
    packagingCostStr: '8.00',
    wastageAllowanceBpsStr: '5.00',
    operatingCostAllocationStr: '15.00',
    channelFeeBpsStr: '25.00',
    targetContributionMarginBpsStr: '20.00',
    selectedModifierIds: ['opt_size_large']
  };

  // Target price before rounding is 19886 (₱198.86)
  const r1 = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: { ...baseState, priceRoundingIncrementCentavos: 100 } // ₱1.00 rounding
  });
  assert.equal(r1.result!.costBreakdown.suggestedPriceCentavos, 19900); // ₱199.00

  const r5 = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: { ...baseState, priceRoundingIncrementCentavos: 500 } // ₱5.00 rounding
  });
  assert.equal(r5.result!.costBreakdown.suggestedPriceCentavos, 20000); // ₱200.00

  const r10 = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: { ...baseState, priceRoundingIncrementCentavos: 1000 } // ₱10.00 rounding
  });
  assert.equal(r10.result!.costBreakdown.suggestedPriceCentavos, 20000); // ₱200.00
});

test('8. Strict input validation: invalid peso and percentage strings fail without parseFloat drift', () => {
  // Valid conversions
  assert.equal(parsePesoStringToCentavos('145'), 14500);
  assert.equal(parsePesoStringToCentavos('145.5'), 14550);
  assert.equal(parsePesoStringToCentavos('145.50'), 14500 + 50);
  assert.equal(parsePesoStringToCentavos('0'), 0);
  assert.equal(parsePesoStringToCentavos(''), 0);

  // Invalid peso formats fail closed
  assert.throws(() => parsePesoStringToCentavos('145.555'), /Invalid peso amount/);
  assert.throws(() => parsePesoStringToCentavos('145abc'), /Invalid peso amount/);
  assert.throws(() => parsePesoStringToCentavos('-50'), /Invalid peso amount/);

  // Valid percentage conversions
  assert.equal(parsePercentageStringToBps('25'), 2500);
  assert.equal(parsePercentageStringToBps('25.5'), 2550);
  assert.equal(parsePercentageStringToBps('25.50'), 2550);
  assert.equal(parsePercentageStringToBps('0'), 0);
  assert.equal(parsePercentageStringToBps(''), 0);

  // Invalid percentage formats fail closed
  assert.throws(() => parsePercentageStringToBps('25.555'), /Invalid percentage/);
  assert.throws(() => parsePercentageStringToBps('25%'), /Invalid percentage/);
  assert.throws(() => parsePercentageStringToBps('105'), /exceeds maximum safe bounds/);
  assert.throws(() => parsePercentageStringToBps('-5'), /Invalid percentage/);
});

test('9. Missing recipe or ingredient costs block calculation with clear message', () => {
  const legacyItemWithoutRecipe: LegacyMenuItem = {
    id: 'item_no_recipe',
    tenantId: 'tenant_1',
    name: 'Plain Muffin',
    price: 8000
  };

  const legacyIngredients: LegacyIngredient[] = [
    { id: 'ing_flour', tenantId: 'tenant_1', name: 'Flour', unitCost: 10, unitOfMeasurement: 'grams' }
  ];

  assert.throws(
    () => adaptLegacyItemToOrderSnap({
      menuItem: legacyItemWithoutRecipe,
      ingredients: legacyIngredients,
      tenantId: 'tenant_1'
    }),
    /Complete the recipe and ingredient costs before using Smart Pricing/
  );
});

test('10. Legacy Timpla adapter correctly maps unit costs and scales', () => {
  const legacyItem: LegacyMenuItem = {
    id: 'item_latte',
    tenantId: 'tenant_1',
    name: 'Iced Latte',
    price: 12000,
    recipe: [
      { ingredientId: 'ing_beans', amount: 18 },
      { ingredientId: 'ing_milk', amount: 200 }
    ]
  };

  const legacyIngredients: LegacyIngredient[] = [
    { id: 'ing_beans', tenantId: 'tenant_1', name: 'Beans', unitOfMeasurement: 'grams', unitCost: 120 }, // 120¢/g
    { id: 'ing_milk', tenantId: 'tenant_1', name: 'Milk', unitOfMeasurement: 'ml', unitCost: 10 }        // 10¢/ml
  ];

  const adapted = adaptLegacyItemToOrderSnap({
    menuItem: legacyItem,
    ingredients: legacyIngredients,
    tenantId: 'tenant_1'
  });

  assert.equal(adapted.canonicalMenuItem.id, 'item_latte');
  assert.equal(adapted.canonicalRecipe.components.length, 2);
  assert.equal(adapted.canonicalRecipe.components[0].quantityMinor, 18);
  assert.equal(adapted.canonicalRecipe.components[1].quantityMinor, 200);

  // Evaluate calculation on adapted item
  const evalResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem: adapted.canonicalMenuItem,
    recipe: adapted.canonicalRecipe,
    ingredients: adapted.canonicalIngredientsMap,
    formState: INITIAL_CALCULATOR_FORM_STATE
  });

  // Base COGS: (18 * 120) + (200 * 10) = 2160 + 2000 = 4160 centavos (₱41.60)
  assert.equal(evalResult.canCalculate, true);
  assert.equal(evalResult.result!.costBreakdown.ingredientCogsCentavos, 4160);
});

test('11. Below-cost and below-break-even warnings generate properly in UI evaluation', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = {
    ...createIcedLatteMenuItem(),
    basePriceCentavos: 5000 // Below COGS (6555)
  };
  const modifierGroups = createIcedLatteModifierGroups();

  const evalResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: INITIAL_CALCULATOR_FORM_STATE
  });

  assert.equal(evalResult.canCalculate, true);
  assert.ok(evalResult.result!.warnings.some(w => w.includes('below ingredient COGS')));
});

test('12. Impossible fee-plus-margin combination shows controlled error', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  const evalResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: {
      ...INITIAL_CALCULATOR_FORM_STATE,
      channelFeeBpsStr: '30.00', // 30% fee
      targetContributionMarginBpsStr: '75.00' // 75% margin -> 105% total
    }
  });

  assert.equal(evalResult.canCalculate, false);
  assert.match(evalResult.error || '', /must be less than 10,000 bps/);
});

test('13. adoptProposedPrice updates proposed selling price cleanly with zero side effects', () => {
  const initialState = { ...INITIAL_CALCULATOR_FORM_STATE };
  assert.equal(initialState.proposedPriceCentavos, null);

  const nextState = adoptProposedPrice(initialState, 20000);
  assert.equal(nextState.proposedPriceCentavos, 20000);
  assert.equal(formatCentavosToPeso(nextState.proposedPriceCentavos), '200.00');

  // Verify previous state was NOT mutated
  assert.equal(initialState.proposedPriceCentavos, null);

  // Negative centavos must fail closed
  assert.throws(() => adoptProposedPrice(initialState, -100), /Money centavos cannot be negative/);
});

test('14. resetSmartPricingState restores initial default form values with zero side effects', () => {
  const modifiedState: SmartPricingCalculatorFormState = {
    channel: 'delivery',
    packagingCostStr: '15.00',
    wastageAllowanceBpsStr: '10.00',
    operatingCostAllocationStr: '25.00',
    channelFeeBpsStr: '30.00',
    targetContributionMarginBpsStr: '50.00',
    priceRoundingIncrementCentavos: 500,
    selectedModifierIds: ['opt_size_large'],
    proposedPriceCentavos: 25000
  };

  const resetState = resetSmartPricingState();
  assert.equal(resetState.channel, 'dine_in');
  assert.equal(resetState.packagingCostStr, '0.00');
  assert.equal(resetState.wastageAllowanceBpsStr, '3.00');
  assert.equal(resetState.operatingCostAllocationStr, '10.00');
  assert.equal(resetState.channelFeeBpsStr, '0.00');
  assert.equal(resetState.targetContributionMarginBpsStr, '40.00');
  assert.equal(resetState.priceRoundingIncrementCentavos, 100);
  assert.deepEqual(resetState.selectedModifierIds, []);
  assert.equal(resetState.proposedPriceCentavos, null);

  // Verify modifiedState was NOT mutated
  assert.equal(modifiedState.proposedPriceCentavos, 25000);
  assert.equal(modifiedState.channel, 'delivery');
});

test('15. Repeated calculation does not mutate authoritative inputs', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  const recipeClone = JSON.parse(JSON.stringify(recipe));
  const menuItemClone = JSON.parse(JSON.stringify(menuItem));
  const groupsClone = JSON.parse(JSON.stringify(modifierGroups));

  for (let i = 0; i < 5; i++) {
    evaluateSmartPricingController({
      isOwner: true,
      menuItem,
      recipe,
      ingredients,
      modifierGroups,
      formState: INITIAL_CALCULATOR_FORM_STATE
    });
  }

  assert.deepEqual(recipe, recipeClone);
  assert.deepEqual(menuItem, menuItemClone);
  assert.deepEqual(modifierGroups, groupsClone);
});

// =========================================================================
// Access Control & UI Controller Proofs (Component tests via controller only)
// =========================================================================

test('16. Access control: Owner can evaluate pricing, cashier cannot', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  // Owner can calculate
  const ownerResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: INITIAL_CALCULATOR_FORM_STATE
  });
  assert.equal(ownerResult.canCalculate, true);
  assert.ok(ownerResult.result);
  assert.ok(!ownerResult.error);

  // Cashier cannot calculate
  const cashierResult = evaluateSmartPricingController({
    isOwner: false,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: INITIAL_CALCULATOR_FORM_STATE
  });
  assert.equal(cashierResult.canCalculate, false);
  assert.equal(cashierResult.result, undefined);
  assert.match(cashierResult.error || '', /Access restricted: Only business owners/);
});

test('17. UI controller state resets cleanly without mutation', () => {
  const modifiedState: SmartPricingCalculatorFormState = {
    channel: 'delivery',
    packagingCostStr: '15.00',
    wastageAllowanceBpsStr: '10.00',
    operatingCostAllocationStr: '25.00',
    channelFeeBpsStr: '30.00',
    targetContributionMarginBpsStr: '50.00',
    priceRoundingIncrementCentavos: 500,
    selectedModifierIds: ['opt_size_large'],
    proposedPriceCentavos: 25000
  };

  // resetSmartPricingState must return fresh defaults
  const resetState = resetSmartPricingState();
  assert.equal(resetState.channel, 'dine_in');
  assert.equal(resetState.packagingCostStr, '0.00');
  assert.equal(resetState.wastageAllowanceBpsStr, '3.00');
  assert.equal(resetState.operatingCostAllocationStr, '10.00');
  assert.equal(resetState.channelFeeBpsStr, '0.00');
  assert.equal(resetState.targetContributionMarginBpsStr, '40.00');
  assert.equal(resetState.priceRoundingIncrementCentavos, 100);
  assert.deepEqual(resetState.selectedModifierIds, []);
  assert.equal(resetState.proposedPriceCentavos, null);

  // Verify modifiedState was NOT mutated
  assert.equal(modifiedState.proposedPriceCentavos, 25000);
  assert.equal(modifiedState.channel, 'delivery');
});

test('18. adoptProposedPrice updates proposed price without mutation', () => {
  const initialState = { ...INITIAL_CALCULATOR_FORM_STATE };
  assert.equal(initialState.proposedPriceCentavos, null);

  const nextState = adoptProposedPrice(initialState, 20000);
  assert.equal(nextState.proposedPriceCentavos, 20000);
  assert.equal(formatCentavosToPeso(nextState.proposedPriceCentavos), '200.00');

  // Verify previous state was NOT mutated
  assert.equal(initialState.proposedPriceCentavos, null);

  // Negative centavos must fail closed
  assert.throws(() => adoptProposedPrice(initialState, -100), /Money centavos cannot be negative/);
});

// =========================================================================
// Adapter Unit Regressions (g/kg, ml/L, discrete, cross-tenant)
// =========================================================================

test('19. Adapter regressions: exact minor units across volume, mass, discrete, and fractions', () => {
  const tenantId = 'tenant_cafe_1';

  // 200 ml -> 200 minor units
  const milkMl: LegacyIngredient = {
    id: 'ing_milk_ml',
    tenantId,
    name: 'Milk (ml)',
    unitOfMeasurement: 'ml',
    unitCost: 10,
    currentStock: 5000
  };

  // 1.5 L -> 1500 minor units
  const milkL: LegacyIngredient = {
    id: 'ing_milk_l',
    tenantId,
    name: 'Milk (L)',
    unitOfMeasurement: 'L',
    unitCost: 9500, // ₱95.00/L -> equivalent to 9.5¢/ml
    currentStock: 20
  };

  // 18 g -> 18 minor units
  const beansG: LegacyIngredient = {
    id: 'ing_beans_g',
    tenantId,
    name: 'Beans (g)',
    unitOfMeasurement: 'g',
    unitCost: 120,
    currentStock: 1000
  };

  // 0.25 kg -> 250 minor units
  const beansKg: LegacyIngredient = {
    id: 'ing_beans_kg',
    tenantId,
    name: 'Beans (kg)',
    unitOfMeasurement: 'kg',
    unitCost: 120000,
    currentStock: 10
  };

  // Discrete pump -> 1 minor unit
  const syrupPump: LegacyIngredient = {
    id: 'ing_syrup_pump',
    tenantId,
    name: 'Syrup Pump',
    unitOfMeasurement: 'pump',
    unitCost: 500,
    currentStock: 100
  };

  const menuItem: LegacyMenuItem = {
    id: 'item_test_units',
    tenantId,
    name: 'Unit Test Drink',
    price: 15000,
    recipe: [
      { ingredientId: 'ing_milk_ml', amount: 200 },
      { ingredientId: 'ing_milk_l', amount: 1.5 },
      { ingredientId: 'ing_beans_g', amount: 18 },
      { ingredientId: 'ing_beans_kg', amount: 0.25 },
      { ingredientId: 'ing_syrup_pump', amount: 3 }
    ]
  };

  const adapted = adaptLegacyItemToOrderSnap({
    menuItem,
    ingredients: [milkMl, milkL, beansG, beansKg, syrupPump],
    tenantId
  });

  const comps = adapted.canonicalRecipe.components;
  assert.equal(comps[0].quantityMinor, 200);   // 200 ml
  assert.equal(comps[1].quantityMinor, 1500);  // 1.5 L -> 1500 minor
  assert.equal(comps[2].quantityMinor, 18);    // 18 g
  assert.equal(comps[3].quantityMinor, 250);   // 0.25 kg -> 250 minor
  assert.equal(comps[4].quantityMinor, 3);     // 3 pumps
});

test('20. Adapter fails closed on unknown units and cross-tenant data', () => {
  const tenantId = 'tenant_cafe_1';

  // Unknown unit fails
  const itemWithUnknownUnit: LegacyMenuItem = {
    id: 'item_bad_unit',
    tenantId,
    name: 'Mystery Drink',
    price: 10000,
    recipe: [{ ingredientId: 'ing_unknown', amount: 1 }]
  };
  const ingUnknown: LegacyIngredient = {
    id: 'ing_unknown',
    tenantId,
    name: 'Mystery Dust',
    unitOfMeasurement: 'xyz_unknown_unit',
    unitCost: 100
  };
  assert.throws(
    () => adaptLegacyItemToOrderSnap({ menuItem: itemWithUnknownUnit, ingredients: [ingUnknown], tenantId }),
    /Unknown or unsupported unit/i
  );

  // Cross-tenant menu item fails
  const crossTenantItem: LegacyMenuItem = {
    id: 'item_cross',
    tenantId: 'other_tenant_99',
    name: 'Stolen Drink',
    price: 10000,
    recipe: [{ ingredientId: 'ing_valid', amount: 10 }]
  };
  const validIng: LegacyIngredient = {
    id: 'ing_valid',
    tenantId,
    name: 'Valid Sugar',
    unitOfMeasurement: 'g',
    unitCost: 50
  };
  assert.throws(
    () => adaptLegacyItemToOrderSnap({ menuItem: crossTenantItem, ingredients: [validIng], tenantId }),
    /Tenant mismatch: Menu item tenant "other_tenant_99"/
  );

  // Cross-tenant ingredient fails
  const validItem: LegacyMenuItem = {
    id: 'item_valid',
    tenantId,
    name: 'My Drink',
    price: 10000,
    recipe: [{ ingredientId: 'ing_cross', amount: 10 }]
  };
  const crossTenantIng: LegacyIngredient = {
    id: 'ing_cross',
    tenantId: 'other_tenant_99',
    name: 'Foreign Beans',
    unitOfMeasurement: 'g',
    unitCost: 50
  };
  assert.throws(
    () => adaptLegacyItemToOrderSnap({ menuItem: validItem, ingredients: [crossTenantIng], tenantId }),
    /Tenant mismatch: Ingredient "Foreign Beans"/
  );
});

test('21. Cost equivalence: equivalent g/kg and ml/L representations yield identical recipe costs', () => {
  const tenantId = 'tenant_cafe_1';

  // 18g espresso beans @ ₱1.20/g = ₱21.60 (2160 centavos)
  const itemG: LegacyMenuItem = {
    id: 'item_g',
    tenantId,
    name: 'Espresso G',
    price: 5000,
    recipe: [{ ingredientId: 'ing_beans_g', amount: 18 }]
  };
  const ingG: LegacyIngredient = {
    id: 'ing_beans_g',
    tenantId,
    name: 'Beans (g)',
    unitOfMeasurement: 'grams',
    unitCost: 120 // 120¢/g
  };

  // 0.018kg espresso beans @ ₱1,200/kg = ₱21.60 (2160 centavos)
  const itemKg: LegacyMenuItem = {
    id: 'item_kg',
    tenantId,
    name: 'Espresso Kg',
    price: 5000,
    recipe: [{ ingredientId: 'ing_beans_kg', amount: 0.018 }]
  };
  const ingKg: LegacyIngredient = {
    id: 'ing_beans_kg',
    tenantId,
    name: 'Beans (kg)',
    unitOfMeasurement: 'kg',
    unitCost: 120000 // 120000¢/kg
  };

  const adaptedG = adaptLegacyItemToOrderSnap({ menuItem: itemG, ingredients: [ingG], tenantId });
  const adaptedKg = adaptLegacyItemToOrderSnap({ menuItem: itemKg, ingredients: [ingKg], tenantId });

  const evalG = evaluateSmartPricingController({
    isOwner: true,
    menuItem: adaptedG.canonicalMenuItem,
    recipe: adaptedG.canonicalRecipe,
    ingredients: adaptedG.canonicalIngredientsMap,
    formState: INITIAL_CALCULATOR_FORM_STATE
  });

  const evalKg = evaluateSmartPricingController({
    isOwner: true,
    menuItem: adaptedKg.canonicalMenuItem,
    recipe: adaptedKg.canonicalRecipe,
    ingredients: adaptedKg.canonicalIngredientsMap,
    formState: INITIAL_CALCULATOR_FORM_STATE
  });

  assert.equal(evalG.result!.costBreakdown.ingredientCogsCentavos, 2160);
  assert.equal(evalKg.result!.costBreakdown.ingredientCogsCentavos, 2160);
  assert.equal(evalG.result!.costBreakdown.ingredientCogsCentavos, evalKg.result!.costBreakdown.ingredientCogsCentavos);
});

// =========================================================================
// Fail-Closed Modifier Selection Mapping (Tests 22-26)
// =========================================================================

test('22. Stale/missing modifier option ID is rejected, never silently dropped', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  const evalResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: {
      ...INITIAL_CALCULATOR_FORM_STATE,
      selectedModifierIds: ['opt_nonexistent_stale_id']
    }
  });

  assert.equal(evalResult.canCalculate, false);
  assert.match(evalResult.error || '', /not found in any authoritative modifier group/);
});

test('23. Invalid modifier selection cannot produce a lower COGS result (never silently omitted)', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  // Valid selection: opt_size_large adds ingredient cost
  const validResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: {
      ...INITIAL_CALCULATOR_FORM_STATE,
      selectedModifierIds: ['opt_size_large']
    }
  });
  assert.equal(validResult.canCalculate, true);
  const validCogs = validResult.result!.costBreakdown.ingredientCogsCentavos;

  // Invalid selection: stale ID must fail, not produce a cheaper price
  const invalidResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: {
      ...INITIAL_CALCULATOR_FORM_STATE,
      selectedModifierIds: ['opt_size_large', 'opt_deleted_stale']
    }
  });
  assert.equal(invalidResult.canCalculate, false);
  assert.equal(invalidResult.result, undefined, 'Invalid selection must not produce any result, preventing lower-COGS bypass');
});

test('24. Duplicate modifier selection ID is rejected', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  const evalResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    formState: {
      ...INITIAL_CALCULATOR_FORM_STATE,
      selectedModifierIds: ['opt_size_large', 'opt_size_large']
    }
  });

  assert.equal(evalResult.canCalculate, false);
  assert.match(evalResult.error || '', /Duplicate modifier selection/);
});

test('25. Selected modifier IDs without authoritative groups are rejected', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();

  // No modifier groups provided, but selection has IDs
  const evalResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups: undefined,
    formState: {
      ...INITIAL_CALCULATOR_FORM_STATE,
      selectedModifierIds: ['opt_size_large']
    }
  });

  assert.equal(evalResult.canCalculate, false);
  assert.match(evalResult.error || '', /no authoritative modifier groups are available/);

  // Also with empty array
  const evalResult2 = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups: [],
    formState: {
      ...INITIAL_CALCULATOR_FORM_STATE,
      selectedModifierIds: ['opt_size_large']
    }
  });

  assert.equal(evalResult2.canCalculate, false);
  assert.match(evalResult2.error || '', /no authoritative modifier groups are available/);
});

test('26. Empty selectedModifierIds with no groups is valid (no modifiers needed)', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  // Menu item with no modifier groups
  const menuItem: MenuItem = {
    ...createIcedLatteMenuItem(),
    modifierGroupIds: []
  };

  const evalResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem,
    recipe,
    ingredients,
    modifierGroups: undefined,
    formState: INITIAL_CALCULATOR_FORM_STATE
  });

  assert.equal(evalResult.canCalculate, true);
  assert.ok(evalResult.result);
});

// =========================================================================
// ml/L Cost-Equivalence Regression (Test 26)
// =========================================================================

test('26. Cost equivalence: equivalent ml/L representations yield identical recipe costs', () => {
  const tenantId = 'tenant_cafe_1';

  // 200ml fresh milk @ ₱0.095/ml = ₱19.00 (1900 centavos)
  const itemMl: LegacyMenuItem = {
    id: 'item_ml',
    tenantId,
    name: 'Milk Drink ml',
    price: 5000,
    recipe: [{ ingredientId: 'ing_milk_ml', amount: 200 }]
  };
  const ingMl: LegacyIngredient = {
    id: 'ing_milk_ml',
    tenantId,
    name: 'Milk (ml)',
    unitOfMeasurement: 'milliliters',
    unitCost: 10 // 10¢/ml → basisQty=1, basisCost=10
  };

  // 0.2L fresh milk @ ₱9.50/L = ₱1.90 → Wait, need same cost.
  // 10¢/ml = 10000¢/L. 200ml * 10¢/ml = 2000¢
  const itemL: LegacyMenuItem = {
    id: 'item_l',
    tenantId,
    name: 'Milk Drink L',
    price: 5000,
    recipe: [{ ingredientId: 'ing_milk_l', amount: 0.2 }]
  };
  const ingL: LegacyIngredient = {
    id: 'ing_milk_l',
    tenantId,
    name: 'Milk (L)',
    unitOfMeasurement: 'liters',
    unitCost: 10000 // 10000¢/L = 10¢/ml equivalent
  };

  const adaptedMl = adaptLegacyItemToOrderSnap({ menuItem: itemMl, ingredients: [ingMl], tenantId });
  const adaptedL = adaptLegacyItemToOrderSnap({ menuItem: itemL, ingredients: [ingL], tenantId });

  const evalMl = evaluateSmartPricingController({
    isOwner: true,
    menuItem: adaptedMl.canonicalMenuItem,
    recipe: adaptedMl.canonicalRecipe,
    ingredients: adaptedMl.canonicalIngredientsMap,
    formState: INITIAL_CALCULATOR_FORM_STATE
  });

  const evalL = evaluateSmartPricingController({
    isOwner: true,
    menuItem: adaptedL.canonicalMenuItem,
    recipe: adaptedL.canonicalRecipe,
    ingredients: adaptedL.canonicalIngredientsMap,
    formState: INITIAL_CALCULATOR_FORM_STATE
  });

  assert.equal(evalMl.result!.costBreakdown.ingredientCogsCentavos, 2000, '200ml @ 10¢/ml = 2000¢');
  assert.equal(evalL.result!.costBreakdown.ingredientCogsCentavos, 2000, '0.2L @ 10000¢/L = 2000¢');
  assert.equal(
    evalMl.result!.costBreakdown.ingredientCogsCentavos,
    evalL.result!.costBreakdown.ingredientCogsCentavos,
    'ml and L representations must produce identical recipe costs'
  );

  // Also verify suggested prices are identical
  assert.equal(
    evalMl.result!.costBreakdown.suggestedPriceCentavos,
    evalL.result!.costBreakdown.suggestedPriceCentavos,
    'ml and L representations must produce identical suggested prices'
  );
});

// =========================================================================
// Strict Adapter Conversion & Referenced-Only Adaptation (Tests 27-29)
// =========================================================================

test('27. adaptQuantityToCanonicalMinor converts exact fixed-point quantities without Math.round drift', () => {
  // Volume: ml and L
  const mlSpec = adaptQuantityToCanonicalMinor(250, 'ml');
  assert.equal(mlSpec.quantityMinor, 250);
  assert.equal(mlSpec.canonicalUnit, 'L');
  assert.equal(mlSpec.quantityScale, 3);

  const lSpec = adaptQuantityToCanonicalMinor(1.5, 'L');
  assert.equal(lSpec.quantityMinor, 1500);
  assert.equal(lSpec.canonicalUnit, 'L');
  assert.equal(lSpec.quantityScale, 3);

  // Mass: g and kg
  const gSpec = adaptQuantityToCanonicalMinor(18, 'g');
  assert.equal(gSpec.quantityMinor, 18);
  assert.equal(gSpec.canonicalUnit, 'kg');
  assert.equal(gSpec.quantityScale, 3);

  const kgSpec = adaptQuantityToCanonicalMinor(0.018, 'kg');
  assert.equal(kgSpec.quantityMinor, 18);
  assert.equal(kgSpec.canonicalUnit, 'kg');
  assert.equal(kgSpec.quantityScale, 3);

  // Discrete: piece, pump, shot
  const pcSpec = adaptQuantityToCanonicalMinor(5, 'piece');
  assert.equal(pcSpec.quantityMinor, 5);
  assert.equal(pcSpec.canonicalUnit, 'piece');
  assert.equal(pcSpec.quantityScale, 0);

  const pumpSpec = adaptQuantityToCanonicalMinor(2, 'pump');
  assert.equal(pumpSpec.quantityMinor, 2);
  assert.equal(pumpSpec.canonicalUnit, 'pump');
  assert.equal(pumpSpec.quantityScale, 0);

  // Excess decimal places beyond scale fail closed
  assert.throws(() => adaptQuantityToCanonicalMinor(0.12345, 'kg'), /exceeds maximum configured decimal places/);
  assert.throws(() => adaptQuantityToCanonicalMinor(1.5, 'piece'), /must be a non-negative whole integer string/);

  // Negative and invalid inputs fail closed
  assert.throws(() => adaptQuantityToCanonicalMinor(-5, 'g'), /Sub-unit gram quantity must be a non-negative/);
  assert.throws(() => adaptQuantityToCanonicalMinor('abc', 'L'), /Invalid decimal quantity format/);
});

test('28. adaptLegacyItemToOrderSnap adapts ONLY referenced ingredients, ignoring unrelated inventory', () => {
  const tenantId = 'tenant_cafe_1';

  // Valid recipe referencing 2 valid ingredients
  const menuItem: LegacyMenuItem = {
    id: 'item_valid_latte',
    tenantId,
    name: 'Iced Latte',
    price: 15000,
    recipe: [
      { ingredientId: 'ing_beans', amount: 18 },
      { ingredientId: 'ing_milk', amount: 200 }
    ]
  };

  const inventoryWithUnrelatedCorruptedItems: LegacyIngredient[] = [
    // Referenced valid ingredients
    { id: 'ing_beans', tenantId, name: 'Coffee Beans', unitOfMeasurement: 'g', unitCost: 120 },
    { id: 'ing_milk', tenantId, name: 'Fresh Milk', unitOfMeasurement: 'ml', unitCost: 10 },

    // Unrelated ingredient with unsupported/corrupted unit
    { id: 'ing_unrelated_bad_unit', tenantId, name: 'Unrelated Mystery Dust', unitOfMeasurement: 'xyz_corrupted_unit_123', unitCost: 50 },

    // Unrelated ingredient with foreign tenant ID
    { id: 'ing_unrelated_foreign_tenant', tenantId: 'foreign_tenant_99', name: 'Stolen Syrup', unitOfMeasurement: 'ml', unitCost: 500 },

    // Unrelated ingredient with invalid/negative cost basis
    { id: 'ing_unrelated_bad_cost', tenantId, name: 'Broken Item', unitOfMeasurement: 'g', unitCost: -999 }
  ];

  // Adapter must succeed because recipe only references ing_beans and ing_milk
  const adapted = adaptLegacyItemToOrderSnap({
    menuItem,
    ingredients: inventoryWithUnrelatedCorruptedItems,
    tenantId
  });

  assert.equal(adapted.canonicalMenuItem.id, 'item_valid_latte');
  assert.equal(adapted.canonicalRecipe.components.length, 2);
  assert.equal(adapted.canonicalIngredientsMap.size, 2);
  assert.ok(adapted.canonicalIngredientsMap.has('ing_beans'));
  assert.ok(adapted.canonicalIngredientsMap.has('ing_milk'));
  assert.equal(adapted.canonicalIngredientsMap.has('ing_unrelated_bad_unit'), false);

  // COGS must calculate accurately: (18 * 120) + (200 * 10) = 2160 + 2000 = 4160 centavos
  const evalResult = evaluateSmartPricingController({
    isOwner: true,
    menuItem: adapted.canonicalMenuItem,
    recipe: adapted.canonicalRecipe,
    ingredients: adapted.canonicalIngredientsMap,
    formState: INITIAL_CALCULATOR_FORM_STATE
  });
  assert.equal(evalResult.canCalculate, true);
  assert.equal(evalResult.result!.costBreakdown.ingredientCogsCentavos, 4160);
});

test('29. adaptLegacyItemToOrderSnap fails closed on missing, duplicate, or corrupted recipe ingredients', () => {
  const tenantId = 'tenant_cafe_1';

  // 1. Missing referenced ingredient in inventory fails
  const itemWithMissingIng: LegacyMenuItem = {
    id: 'item_missing',
    tenantId,
    name: 'Missing Ingredient Drink',
    price: 10000,
    recipe: [{ ingredientId: 'ing_not_in_inventory', amount: 10 }]
  };
  const validInventory: LegacyIngredient[] = [
    { id: 'ing_other', tenantId, name: 'Other', unitOfMeasurement: 'g', unitCost: 50 }
  ];
  assert.throws(
    () => adaptLegacyItemToOrderSnap({ menuItem: itemWithMissingIng, ingredients: validInventory, tenantId }),
    /was not found in ingredient inventory/
  );

  // 2. Duplicate ingredient ID in recipe components fails
  const itemWithDupRecipeIng: LegacyMenuItem = {
    id: 'item_dup_recipe',
    tenantId,
    name: 'Duplicate Component Drink',
    price: 10000,
    recipe: [
      { ingredientId: 'ing_beans', amount: 10 },
      { ingredientId: 'ing_beans', amount: 8 }
    ]
  };
  const beansInventory: LegacyIngredient[] = [
    { id: 'ing_beans', tenantId, name: 'Beans', unitOfMeasurement: 'g', unitCost: 120 }
  ];
  assert.throws(
    () => adaptLegacyItemToOrderSnap({ menuItem: itemWithDupRecipeIng, ingredients: beansInventory, tenantId }),
    /Duplicate recipe component for ingredient "ing_beans"/
  );

  // 3. Duplicate ingredient ID in inventory list fails
  const itemNormal: LegacyMenuItem = {
    id: 'item_normal',
    tenantId,
    name: 'Normal Drink',
    price: 10000,
    recipe: [{ ingredientId: 'ing_beans', amount: 18 }]
  };
  const dupInventory: LegacyIngredient[] = [
    { id: 'ing_beans', tenantId, name: 'Beans A', unitOfMeasurement: 'g', unitCost: 120 },
    { id: 'ing_beans', tenantId, name: 'Beans B', unitOfMeasurement: 'g', unitCost: 150 }
  ];
  assert.throws(
    () => adaptLegacyItemToOrderSnap({ menuItem: itemNormal, ingredients: dupInventory, tenantId }),
    /Duplicate inventory ingredient ID "ing_beans"/
  );

  // 4. Referenced ingredient with unsupported unit fails
  const itemBadUnit: LegacyMenuItem = {
    id: 'item_bad_unit_referenced',
    tenantId,
    name: 'Bad Unit Referenced Drink',
    price: 10000,
    recipe: [{ ingredientId: 'ing_bad_unit', amount: 1 }]
  };
  const badUnitInventory: LegacyIngredient[] = [
    { id: 'ing_bad_unit', tenantId, name: 'Bad Unit Item', unitOfMeasurement: 'xyz_unknown', unitCost: 100 }
  ];
  assert.throws(
    () => adaptLegacyItemToOrderSnap({ menuItem: itemBadUnit, ingredients: badUnitInventory, tenantId }),
    /Unknown or unsupported unit/i
  );
});
