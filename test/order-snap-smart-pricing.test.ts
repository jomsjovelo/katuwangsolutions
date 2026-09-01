import test from 'node:test';
import assert from 'node:assert/strict';

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
  validateMoneyCentavos
} from '../src/lib/order-snap/quantity-math';

import {
  calculateOrderSmartPricing,
  ceilDivisionBigInt,
  roundPriceUpward,
  calculateChannelFee,
  evaluatePriceFinancials,
  validateChannelFeeBps,
  ChannelCostConfigSchema
} from '../src/lib/order-snap/smart-pricing';

// =========================================================================
// Test Fixtures: Iced Latte & Coffee Shop Setup
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
        basisCostCentavos: 120000
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
        basisCostCentavos: 9500
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
        basisCostCentavos: 45000
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
        basisCostCentavos: 15000
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
        basisCostCentavos: 35000
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
        basisCostCentavos: 12000
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
// Pure Smart Pricing Engine Tests
// =========================================================================

test('1. Exact canonical regression: Base Iced Latte and Large Delivery pricing', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  // 1. Base Iced Latte (COGS: 6,555 centavos)
  const basePricing = calculateOrderSmartPricing({
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    selectedModifiers: [],
    channel: 'dine_in',
    packagingCostCentavos: 0,
    wastageAllowanceBps: 300, // 3% -> ceil(6555 * 300 / 10000) = 197 centavos
    operatingCostAllocationCentavos: 1000, // ₱10.00
    channelFeeBps: 0,
    currentSellingPriceCentavos: 14500,
    targetContributionMarginBps: 4000, // 40%
    priceRoundingIncrementCentavos: 100 // ₱1.00 rounding
  });

  assert.equal(basePricing.costBreakdown.ingredientCogsCentavos, 6555);
  assert.equal(basePricing.costBreakdown.wastageAllowanceCentavos, 197);
  assert.equal(basePricing.costBreakdown.fixedCostBeforeChannelFeeCentavos, 6555 + 197 + 0 + 1000); // 7752 centavos
  assert.equal(basePricing.costBreakdown.breakEvenPriceCentavos, 7752);

  // 2. Large Delivery Scenario from Canonical Specification
  const deliveryPricing = calculateOrderSmartPricing({
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    selectedModifiers: [{ groupId: 'grp_size', optionId: 'opt_size_large' }],
    channel: 'delivery',
    packagingCostCentavos: 800, // ₱8.00
    wastageAllowanceBps: 500, // 5%
    operatingCostAllocationCentavos: 1500, // ₱15.00
    channelFeeBps: 2500, // 25% delivery commission
    currentSellingPriceCentavos: 16500, // ₱165.00
    targetContributionMarginBps: 2000, // 20%
    priceRoundingIncrementCentavos: 500 // ₱5.00 rounding (500 centavos)
  });

  const b = deliveryPricing.costBreakdown;
  assert.equal(b.ingredientCogsCentavos, 8225);
  assert.equal(b.wastageAllowanceCentavos, 412);
  assert.equal(b.packagingCostCentavos, 800);
  assert.equal(b.operatingCostAllocationCentavos, 1500);
  assert.equal(b.fixedCostBeforeChannelFeeCentavos, 10937);
  assert.equal(b.breakEvenPriceCentavos, 14583);
  assert.equal(b.targetPriceBeforeRoundingCentavos, 19886);
  assert.equal(b.suggestedPriceCentavos, 20000); // ₱200.00
  assert.equal(b.channelFeeCentavos, 5000); // ₱50.00
  assert.equal(b.contributionProfitCentavos, 4063); // ₱40.63
  assert.equal(b.contributionMarginBasisPoints, 2032); // 20.32% (2,032 bps)
});

test('2. Dine-in, takeout, and delivery channel comparisons', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  const channelConfigs = {
    dine_in: { packagingCostCentavos: 0, channelFeeBps: 0, operatingCostAllocationCentavos: 1000 },
    takeout: { packagingCostCentavos: 500, channelFeeBps: 0, operatingCostAllocationCentavos: 1000 },
    delivery: { packagingCostCentavos: 800, channelFeeBps: 2000, operatingCostAllocationCentavos: 1000 }
  };

  const result = calculateOrderSmartPricing(
    {
      menuItem,
      recipe,
      ingredients,
      modifierGroups,
      selectedModifiers: [],
      channel: 'dine_in',
      packagingCostCentavos: 0,
      wastageAllowanceBps: 200,
      operatingCostAllocationCentavos: 1000,
      channelFeeBps: 0,
      targetContributionMarginBps: 3000,
      priceRoundingIncrementCentavos: 100
    },
    channelConfigs
  );

  assert.ok(result.channelComparisons);
  assert.equal(result.channelComparisons.length, 3);
  assert.equal(result.channelComparisons[0].channel, 'dine_in');
  assert.equal(result.channelComparisons[1].channel, 'takeout');
  assert.equal(result.channelComparisons[2].channel, 'delivery');
  // Delivery price must be higher than dine-in due to platform fees and packaging
  assert.ok(result.channelComparisons[2].suggestedPriceCentavos > result.channelComparisons[0].suggestedPriceCentavos);
});

test('3. Warning generated when current price is below ingredient COGS', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  // Ingredient COGS is 6,555 centavos; current price is set to 5,000 centavos (₱50.00)
  const result = calculateOrderSmartPricing({
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    selectedModifiers: [],
    channel: 'dine_in',
    packagingCostCentavos: 0,
    wastageAllowanceBps: 0,
    operatingCostAllocationCentavos: 0,
    channelFeeBps: 0,
    currentSellingPriceCentavos: 5000,
    targetContributionMarginBps: 3000
  });

  assert.ok(result.currentPriceAnalysis?.isBelowIngredientCogs);
  assert.ok(result.warnings.some(w => w.includes('below ingredient COGS')));
});

test('4. Warning generated when current price is below complete break-even', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  // COGS is 6555 + operating 2000 = 8555 break-even; price is 7000 (> COGS but < break-even)
  const result = calculateOrderSmartPricing({
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    selectedModifiers: [],
    channel: 'dine_in',
    packagingCostCentavos: 0,
    wastageAllowanceBps: 0,
    operatingCostAllocationCentavos: 2000,
    channelFeeBps: 0,
    currentSellingPriceCentavos: 7000,
    targetContributionMarginBps: 3000
  });

  assert.equal(result.currentPriceAnalysis?.isBelowIngredientCogs, false);
  assert.equal(result.currentPriceAnalysis?.isBelowBreakEven, true);
  assert.ok(result.warnings.some(w => w.includes('below break-even price')));
});

test('5. Upward centavo rounding preserves exact target price when increment is 1', () => {
  assert.equal(roundPriceUpward(14583, 1), 14583);
  assert.equal(roundPriceUpward(19886, 1), 19886);
});

test('6. Upward rounding with various increments (₱1, ₱5, ₱10)', () => {
  assert.equal(roundPriceUpward(19886, 100), 19900); // ₱1.00 increment (100 centavos)
  assert.equal(roundPriceUpward(19886, 500), 20000); // ₱5.00 increment (500 centavos)
  assert.equal(roundPriceUpward(19886, 1000), 20000); // ₱10.00 increment (1000 centavos)
  assert.equal(roundPriceUpward(20001, 1000), 21000);
  assert.equal(roundPriceUpward(20000, 1000), 20000);
});

test('7. Channel fee arithmetic with ceiling division', () => {
  // ₱165.00 (16500) @ 25% (2500 bps) -> 16500 * 2500 / 10000 = 4125 centavos
  assert.equal(calculateChannelFee(16500, 2500), 4125);

  // ₱165.01 (16501) @ 25% -> 16501 * 2500 / 10000 = 4125.25 -> ceil to 4126 centavos
  assert.equal(calculateChannelFee(16501, 2500), 4126);

  // 0 price or 0 fee
  assert.equal(calculateChannelFee(0, 2500), 0);
  assert.equal(calculateChannelFee(16500, 0), 0);
});

test('8. Wastage ceiling arithmetic', () => {
  // 6555 centavos @ 300 bps (3%) -> 6555 * 300 / 10000 = 196.65 -> ceil to 197
  assert.equal(
    Number(ceilDivisionBigInt(BigInt(6555) * BigInt(300), BigInt(10000))),
    197
  );

  // 1000 centavos @ 500 bps (5%) -> 1000 * 500 / 10000 = 50 exact
  assert.equal(
    Number(ceilDivisionBigInt(BigInt(1000) * BigInt(500), BigInt(10000))),
    50
  );
});

test('9. Target margin scenarios generate 30%, 40%, 50%, 60% pricing models', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  const result = calculateOrderSmartPricing({
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    selectedModifiers: [],
    channel: 'dine_in',
    packagingCostCentavos: 0,
    wastageAllowanceBps: 0,
    operatingCostAllocationCentavos: 0,
    channelFeeBps: 0,
    targetContributionMarginBps: 3000,
    priceRoundingIncrementCentavos: 500
  });

  assert.equal(result.targetMarginScenarios.length, 4);
  assert.equal(result.targetMarginScenarios[0].targetMarginBps, 3000);
  assert.equal(result.targetMarginScenarios[1].targetMarginBps, 4000);
  assert.equal(result.targetMarginScenarios[2].targetMarginBps, 5000);
  assert.equal(result.targetMarginScenarios[3].targetMarginBps, 6000);

  // Higher margin target must require higher suggested price
  for (let i = 1; i < result.targetMarginScenarios.length; i++) {
    assert.ok(
      result.targetMarginScenarios[i].suggestedPriceCentavos >=
      result.targetMarginScenarios[i - 1].suggestedPriceCentavos
    );
  }
});

test('10. Fee plus target margin reaching or exceeding 10,000 bps fails closed', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  // Fee 2500 + Target Margin 7500 = 10000 (100%) -> impossible denominator
  assert.throws(
    () => calculateOrderSmartPricing({
      menuItem,
      recipe,
      ingredients,
      modifierGroups,
      selectedModifiers: [],
      channel: 'delivery',
      packagingCostCentavos: 0,
      wastageAllowanceBps: 0,
      operatingCostAllocationCentavos: 0,
      channelFeeBps: 2500,
      targetContributionMarginBps: 7500
    }),
    /must be less than 10,000 bps/
  );

  // Fee 3000 + Target Margin 8000 = 11000 (> 100%)
  assert.throws(
    () => calculateOrderSmartPricing({
      menuItem,
      recipe,
      ingredients,
      modifierGroups,
      selectedModifiers: [],
      channel: 'delivery',
      packagingCostCentavos: 0,
      wastageAllowanceBps: 0,
      operatingCostAllocationCentavos: 0,
      channelFeeBps: 3000,
      targetContributionMarginBps: 8000
    }),
    /must be less than 10,000 bps/
  );
});

test('11. Negative and fractional inputs fail validation', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();

  assert.throws(
    () => calculateOrderSmartPricing({
      menuItem,
      recipe,
      ingredients,
      channel: 'dine_in',
      packagingCostCentavos: -100,
      wastageAllowanceBps: 0,
      operatingCostAllocationCentavos: 0,
      targetContributionMarginBps: 3000
    }),
    /Centavos must be non-negative/
  );

  assert.throws(
    () => calculateOrderSmartPricing({
      menuItem,
      recipe,
      ingredients,
      channel: 'dine_in',
      packagingCostCentavos: 100.5,
      wastageAllowanceBps: 0,
      operatingCostAllocationCentavos: 0,
      targetContributionMarginBps: 3000
    }),
    /Centavos must be an integer/
  );
});

test('12. Integer overflow in pricing calculation fails closed', () => {
  assert.throws(() => validateMoneyCentavos(100000000001), /Money centavos exceeds maximum safe bounds/);
  assert.throws(() => roundPriceUpward(100000000001, 100), /Money centavos exceeds maximum safe bounds/);
  assert.throws(() => roundPriceUpward(1000, 100001), /Invalid rounding increment/);
  assert.throws(() => ceilDivisionBigInt(10n, 0n), /Division by non-positive denominator/);
  assert.throws(() => ceilDivisionBigInt(10n, -5n), /Division by non-positive denominator/);
});

test('13. Recipe/menu/tenant mismatch fails validation', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();

  const foreignMenuItem: MenuItem = {
    ...menuItem,
    tenantId: 'tenant_foreign'
  };

  assert.throws(
    () => calculateOrderSmartPricing({
      menuItem: foreignMenuItem,
      recipe,
      ingredients,
      channel: 'dine_in',
      packagingCostCentavos: 0,
      wastageAllowanceBps: 0,
      targetContributionMarginBps: 3000
    }),
    /Recipe tenantId "tenant_cafe_1" does not match MenuItem tenantId "tenant_foreign"/
  );
});

test('14. Tampered modifier input cannot bypass authoritative modifier groups', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  // Attempt to supply an altered modifier object
  const tamperedSelection = {
    group: { id: 'grp_size', name: 'Fake Size' },
    option: { id: 'opt_size_large', name: 'Free Large', priceDeltaCentavos: 0, ingredientDeltas: [] }
  };

  const result = calculateOrderSmartPricing({
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    selectedModifiers: [tamperedSelection],
    channel: 'dine_in',
    packagingCostCentavos: 0,
    wastageAllowanceBps: 0,
    targetContributionMarginBps: 3000
  });

  // Must authoritatively use actual Large COGS (8,225 centavos), not 6,555
  assert.equal(result.costBreakdown.ingredientCogsCentavos, 8225);
});

test('15. Deterministic identical output for genuinely reversed and reordered authoritative inputs', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const groups = createIcedLatteModifierGroups();

  // 1. Forward order: groups [size, shot], selections [size, shot], forward ingredient map
  const resForward = calculateOrderSmartPricing({
    menuItem,
    recipe,
    ingredients,
    modifierGroups: [groups[0], groups[1]],
    selectedModifiers: [
      { groupId: 'grp_size', optionId: 'opt_size_large' },
      { groupId: 'grp_espresso_shot', optionId: 'opt_extra_shot' }
    ],
    channel: 'delivery',
    packagingCostCentavos: 800,
    wastageAllowanceBps: 500,
    operatingCostAllocationCentavos: 1500,
    channelFeeBps: 2500,
    currentSellingPriceCentavos: 19500,
    targetContributionMarginBps: 2000,
    priceRoundingIncrementCentavos: 500
  });

  // 2. Reversed order: groups [shot, size], selections [shot, size], reversed ingredient map
  const reversedIngredientsList = Array.from(ingredients.values()).reverse();
  const reversedIngredientsMap = new Map<string, Ingredient>();
  for (const ing of reversedIngredientsList) {
    reversedIngredientsMap.set(ing.id, ing);
  }

  const resReversed = calculateOrderSmartPricing({
    menuItem,
    recipe,
    ingredients: reversedIngredientsMap,
    modifierGroups: [groups[1], groups[0]],
    selectedModifiers: [
      { groupId: 'grp_espresso_shot', optionId: 'opt_extra_shot' },
      { groupId: 'grp_size', optionId: 'opt_size_large' }
    ],
    channel: 'delivery',
    packagingCostCentavos: 800,
    wastageAllowanceBps: 500,
    operatingCostAllocationCentavos: 1500,
    channelFeeBps: 2500,
    currentSellingPriceCentavos: 19500,
    targetContributionMarginBps: 2000,
    priceRoundingIncrementCentavos: 500
  });

  assert.deepEqual(resForward, resReversed);
  assert.equal(JSON.stringify(resForward), JSON.stringify(resReversed));
});

test('16. Input objects remain unmodified after calculation', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  const recipeClone = JSON.parse(JSON.stringify(recipe));
  const menuItemClone = JSON.parse(JSON.stringify(menuItem));
  const groupsClone = JSON.parse(JSON.stringify(modifierGroups));

  calculateOrderSmartPricing({
    menuItem,
    recipe,
    ingredients,
    modifierGroups,
    selectedModifiers: [{ groupId: 'grp_size', optionId: 'opt_size_large' }],
    channel: 'delivery',
    packagingCostCentavos: 800,
    wastageAllowanceBps: 500,
    operatingCostAllocationCentavos: 1500,
    channelFeeBps: 2500,
    targetContributionMarginBps: 2000,
    priceRoundingIncrementCentavos: 500
  });

  assert.deepEqual(recipe, recipeClone);
  assert.deepEqual(menuItem, menuItemClone);
  assert.deepEqual(modifierGroups, groupsClone);
});

test('17. Validation of channel fee basis points and helper functions', () => {
  // Negative fee
  assert.throws(() => validateChannelFeeBps(-1), /Invalid channel fee basis points/);
  assert.throws(() => calculateChannelFee(1000, -100), /Invalid channel fee basis points/);

  // Fractional fee
  assert.throws(() => validateChannelFeeBps(25.5 as any), /Invalid channel fee basis points/);
  assert.throws(() => calculateChannelFee(1000, 25.5 as any), /Invalid channel fee basis points/);

  // NaN / Infinite fee
  assert.throws(() => validateChannelFeeBps(NaN), /Invalid channel fee basis points/);
  assert.throws(() => validateChannelFeeBps(Infinity), /Invalid channel fee basis points/);
  assert.throws(() => calculateChannelFee(1000, NaN), /Invalid channel fee basis points/);

  // Excessive fee (> 9000 bps)
  assert.throws(() => validateChannelFeeBps(9500), /Invalid channel fee basis points/);
  assert.throws(() => calculateChannelFee(1000, 9001), /Invalid channel fee basis points/);

  // evaluatePriceFinancials inherits strict validation
  assert.throws(() => evaluatePriceFinancials({
    sellingPriceCentavos: 1000,
    ingredientCogsCentavos: 500,
    fixedCostBeforeChannelFeeCentavos: 600,
    channelFeeBps: -50
  }), /Invalid channel fee basis points/);
});

test('18. ChannelCostConfigSchema validation and impossible comparison configurations fail closed', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const modifierGroups = createIcedLatteModifierGroups();

  // Negative packaging in channel comparison
  assert.throws(
    () => calculateOrderSmartPricing(
      {
        menuItem,
        recipe,
        ingredients,
        modifierGroups,
        channel: 'dine_in',
        packagingCostCentavos: 0,
        wastageAllowanceBps: 0,
        targetContributionMarginBps: 3000
      },
      {
        takeout: { packagingCostCentavos: -500, channelFeeBps: 0 } as any
      }
    ),
    /Centavos must be non-negative/
  );

  // Fractional operating allocation in channel comparison
  assert.throws(
    () => calculateOrderSmartPricing(
      {
        menuItem,
        recipe,
        ingredients,
        modifierGroups,
        channel: 'dine_in',
        packagingCostCentavos: 0,
        wastageAllowanceBps: 0,
        targetContributionMarginBps: 3000
      },
      {
        takeout: { packagingCostCentavos: 0, operatingCostAllocationCentavos: 100.5, channelFeeBps: 0 } as any
      }
    ),
    /Centavos must be an integer/
  );

  // Impossible fee + margin in channel comparison (e.g. fee 7500 + margin 3000 = 10500 bps >= 10000 bps)
  assert.throws(
    () => calculateOrderSmartPricing(
      {
        menuItem,
        recipe,
        ingredients,
        modifierGroups,
        channel: 'dine_in',
        packagingCostCentavos: 0,
        wastageAllowanceBps: 0,
        targetContributionMarginBps: 3000
      },
      {
        delivery: { packagingCostCentavos: 800, channelFeeBps: 7500 }
      }
    ),
    /Channel fee \(7500 bps\) plus target contribution margin \(3000 bps\) in channel "delivery" must be less than 10,000 bps/
  );
});
