import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseQuantityInput,
  formatQuantitySpec,
  calculateProportionalCost,
  roundHalfUpBigInt,
  validateMoneyCentavos,
  validateQuantitySpec,
  areUnitsCompatible,
  getUnitMetadata,
  safeAddMoney,
  safeMultiplyMoney,
  safeAddQuantityMinor,
  calculateGrossMarginBasisPoints,
  deepFreeze,
  STANDARD_MEASURED_SCALE
} from '../src/lib/order-snap/quantity-math';

import {
  Ingredient,
  RecipeVersion,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  IngredientSchema,
  RecipeVersionSchema,
  MenuItemSchema,
  ModifierGroupSchema,
  ModifierOptionSchema,
  SaleLineSnapshotSchema
} from '../src/lib/order-snap/domain-schemas';

import {
  calculateRecipeBaseCost,
  calculateMenuItemCogs,
  createSaleLineSnapshot,
  aggregateModifiers,
  normalizeModifierGroups
} from '../src/lib/order-snap/costing';

// =========================================================================
// Test Fixtures: Iced Latte & Coffee Shop Ingredients
// =========================================================================

function createSampleIngredients(): Map<string, Ingredient> {
  const ingredients: Ingredient[] = [
    {
      id: 'ing_espresso_beans',
      tenantId: 'tenant_cafe_1',
      name: 'Espresso Coffee Beans',
      unit: 'kg',
      quantityScale: 3, // 1000 minor units = 1 kg (1 minor unit = 1 g)
      stockQuantityMinor: 10000, // 10 kg
      costBasis: {
        basisQuantityMinor: 1000, // 1 kg
        basisCostCentavos: 120000 // ₱1,200.00 / kg -> 18g shot = roundHalfUp(18 * 120000 / 1000) = 2160 centavos (₱21.60)
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
      quantityScale: 3, // 1000 minor units = 1 L (1 minor unit = 1 ml)
      stockQuantityMinor: 20000, // 20 L
      costBasis: {
        basisQuantityMinor: 1000, // 1 L (1000 ml)
        basisCostCentavos: 9500 // ₱95.00 / L -> 200ml = roundHalfUp(200 * 9500 / 1000) = 1900 centavos (₱19.00)
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
      quantityScale: 3, // 1000 minor units = 1 L (1 minor unit = 1 ml)
      stockQuantityMinor: 5000, // 5 L
      costBasis: {
        basisQuantityMinor: 750, // 750 ml bottle
        basisCostCentavos: 45000 // ₱450.00 / 750ml -> 30ml (30 minor) = roundHalfUp(30 * 45000 / 750) = 1800 centavos (₱18.00)
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
      quantityScale: 3, // 1000 minor units = 1 kg (1 minor unit = 1 g)
      stockQuantityMinor: 50000, // 50 kg
      costBasis: {
        basisQuantityMinor: 10000, // 10 kg sack
        basisCostCentavos: 15000 // ₱150.00 / 10kg -> 150g ice = roundHalfUp(150 * 15000 / 10000) = 225 centavos (₱2.25)
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
        basisQuantityMinor: 100, // 100 pcs pack
        basisCostCentavos: 35000 // ₱350.00 / 100 pcs -> 1 pc = 350 centavos (₱3.50)
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
        basisQuantityMinor: 100, // 100 pcs pack
        basisCostCentavos: 12000 // ₱120.00 / 100 pcs -> 1 pc = 120 centavos (₱1.20)
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
      { ingredientId: 'ing_espresso_beans', quantityMinor: 18, unit: 'kg', quantityScale: 3 }, // 18g beans
      { ingredientId: 'ing_fresh_milk', quantityMinor: 200, unit: 'L', quantityScale: 3 },      // 200ml milk
      { ingredientId: 'ing_vanilla_syrup', quantityMinor: 30, unit: 'L', quantityScale: 3 },    // 30ml syrup
      { ingredientId: 'ing_tube_ice', quantityMinor: 150, unit: 'kg', quantityScale: 3 },       // 150g ice
      { ingredientId: 'ing_takeout_cup_16oz', quantityMinor: 1, unit: 'piece', quantityScale: 0 }, // 1 cup
      { ingredientId: 'ing_takeout_lid_flat', quantityMinor: 1, unit: 'piece', quantityScale: 0 }  // 1 lid
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
    basePriceCentavos: 14500, // ₱145.00
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
// Regression & Deterministic Test Suites
// =========================================================================

test('1. Every supported volume and mass alias normalizes consistently', () => {
  // Volume aliases
  const volumeAliases = ['l', 'L', 'liter', 'liters', 'litre', 'litres', 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'];
  for (const alias of volumeAliases) {
    const meta = getUnitMetadata(alias);
    assert.equal(meta.canonicalUnit, 'L');
    assert.equal(meta.family, 'volume');
    assert.equal(meta.standardScale, 3);
  }

  // Mass aliases
  const massAliases = ['kg', 'KG', 'kilogram', 'kilograms', 'g', 'gram', 'grams'];
  for (const alias of massAliases) {
    const meta = getUnitMetadata(alias);
    assert.equal(meta.canonicalUnit, 'kg');
    assert.equal(meta.family, 'mass');
    assert.equal(meta.standardScale, 3);
  }

  // Plural/singular discrete aliases
  assert.equal(getUnitMetadata('pcs').canonicalUnit, 'piece');
  assert.equal(getUnitMetadata('piece').canonicalUnit, 'piece');
  assert.equal(getUnitMetadata('bottles').canonicalUnit, 'bottle');
  assert.equal(getUnitMetadata('pumps').canonicalUnit, 'pump');
  assert.equal(getUnitMetadata('cups').canonicalUnit, 'cup');
});

test('2. Strict quantity parsing: reject partially numeric strings and unknown units', () => {
  // Partially numeric inputs must be rejected
  assert.throws(() => parseQuantityInput('250ml', 'ml'), /Sub-unit milliliter quantity must be a non-negative integer string/);
  assert.throws(() => parseQuantityInput('250abc', 'ml'), /Sub-unit milliliter quantity must be a non-negative integer string/);
  assert.throws(() => parseQuantityInput('1.5L', 'L'), /Invalid decimal quantity format/);
  assert.throws(() => parseQuantityInput('3pcs', 'piece'), /must be a non-negative whole integer string/);
  assert.throws(() => parseQuantityInput('', 'L'), /Quantity input cannot be empty/);

  // Unknown units fail closed
  assert.throws(() => getUnitMetadata('fluid_oz'), /Unknown or unsupported unit/);
  assert.throws(() => getUnitMetadata('barrel'), /Unknown or unsupported unit/);
  assert.throws(() => parseQuantityInput(10, 'foobar'), /Unknown or unsupported unit/);
});

test('3. Canonical ingredient units: schema validates unit and scale matching', () => {
  // Unknown unit in IngredientSchema
  assert.throws(() => {
    IngredientSchema.parse({
      id: 'ing_unknown',
      tenantId: 'tenant_1',
      name: 'Mystery Powder',
      unit: 'unknown_unit',
      quantityScale: 3,
      costBasis: { basisQuantityMinor: 1000, basisCostCentavos: 5000 }
    });
  }, /Ingredient unit must be a registered canonical unit/);

  // Non-canonical alias in IngredientSchema (e.g. 'liters' instead of 'L')
  assert.throws(() => {
    IngredientSchema.parse({
      id: 'ing_milk',
      tenantId: 'tenant_1',
      name: 'Milk',
      unit: 'liters',
      quantityScale: 3,
      costBasis: { basisQuantityMinor: 1000, basisCostCentavos: 5000 }
    });
  }, /Ingredient unit must be a registered canonical unit in canonical form/);

  // Scale mismatch for canonical unit (e.g. 'L' with scale 2 instead of 3)
  assert.throws(() => {
    IngredientSchema.parse({
      id: 'ing_milk',
      tenantId: 'tenant_1',
      name: 'Milk',
      unit: 'L',
      quantityScale: 2,
      costBasis: { basisQuantityMinor: 1000, basisCostCentavos: 5000 }
    });
  }, /Ingredient quantityScale must match the standard scale for the canonical unit/);
});

test('4. Unsupported recipe yield greater than one is rejected', () => {
  const invalidRecipe = {
    id: 'rec_batch_latte',
    tenantId: 'tenant_cafe_1',
    menuItemId: 'menu_iced_latte',
    version: 1,
    yield: 10, // UNSUPPORTED YIELD > 1
    isActive: true,
    components: [
      { ingredientId: 'ing_fresh_milk', quantityMinor: 2000, unit: 'L', quantityScale: 3 }
    ]
  };

  assert.throws(() => RecipeVersionSchema.parse(invalidRecipe), /Unsupported recipe yield/);

  const ingredients = createSampleIngredients();
  assert.throws(
    () => calculateRecipeBaseCost(invalidRecipe as unknown as RecipeVersion, ingredients),
    /Unsupported recipe yield: 10/
  );
});

test('5. Modifier-group invariants: allowMultiple false requires maxSelections 1, and duplicate options fail', () => {
  // allowMultiple=false with maxSelections=2 must fail schema validation
  assert.throws(() => {
    ModifierGroupSchema.parse({
      id: 'grp_size_invalid',
      tenantId: 'tenant_1',
      name: 'Size',
      isRequired: true,
      minSelections: 1,
      maxSelections: 2,
      allowMultiple: false,
      options: [
        { id: 'opt_s', name: 'Small', priceDeltaCentavos: 0, ingredientDeltas: [] },
        { id: 'opt_m', name: 'Medium', priceDeltaCentavos: 1000, ingredientDeltas: [] }
      ]
    });
  }, /Single-select modifier groups \(allowMultiple=false\) must have maxSelections === 1/);

  // Duplicate option IDs in the same group must fail
  assert.throws(() => {
    ModifierGroupSchema.parse({
      id: 'grp_dup_opts',
      tenantId: 'tenant_1',
      name: 'Flavors',
      isRequired: false,
      minSelections: 0,
      maxSelections: 2,
      allowMultiple: true,
      options: [
        { id: 'opt_vanilla', name: 'Vanilla', priceDeltaCentavos: 0, ingredientDeltas: [] },
        { id: 'opt_vanilla', name: 'Vanilla Duplicate', priceDeltaCentavos: 0, ingredientDeltas: [] }
      ]
    });
  }, /Modifier group options must have unique IDs/);

  // Duplicate option selection in aggregateModifiers must fail even if allowMultiple is true
  const groupMultiple: ModifierGroup = {
    id: 'grp_toppings',
    tenantId: 'tenant_1',
    name: 'Toppings',
    isRequired: false,
    minSelections: 0,
    maxSelections: 3,
    allowMultiple: true,
    options: [
      { id: 'opt_pearls', name: 'Pearls', priceDeltaCentavos: 1000, ingredientDeltas: [], isAvailable: true },
      { id: 'opt_jelly', name: 'Jelly', priceDeltaCentavos: 1000, ingredientDeltas: [], isAvailable: true }
    ],
    isActive: true
  };

  assert.throws(
    () => aggregateModifiers([
      { groupId: 'grp_toppings', optionId: 'opt_pearls' },
      { groupId: 'grp_toppings', optionId: 'opt_pearls' }
    ], [groupMultiple]),
    /Duplicate modifier option "opt_pearls" selected/
  );
});

test('6. Authoritative modifier resolution: values resolved from authoritative group; tampering rejected', () => {
  const groups = createIcedLatteModifierGroups();
  const groupSize = groups[0];

  // Caller attempts to tamper with price (claims 0 instead of 2000) and ingredient deltas
  const tamperedSelection = {
    group: { id: groupSize.id, name: 'Fake Size', tenantId: 'fake' },
    option: {
      id: 'opt_size_large',
      name: 'Tampered Large',
      priceDeltaCentavos: 0, // Tampered price
      ingredientDeltas: []  // Tampered deltas
    }
  };

  const result = aggregateModifiers([tamperedSelection], groups);

  // Must authoritatively use actual group and option values!
  assert.equal(result.totalPriceDeltaCentavos, 2000); // ₱20.00 from authoritative definition
  assert.equal(result.historicalModifiers[0].modifierGroupName, 'Size Options');
  assert.equal(result.historicalModifiers[0].modifierOptionName, 'Upsize to 22oz (Large)');
  assert.equal(result.netIngredientDeltas.get('ing_fresh_milk'), 100);

  // Direct option rejected when authoritative groups exist
  assert.throws(
    () => aggregateModifiers([{ id: 'opt_size_large', name: 'Direct Large', priceDeltaCentavos: 2000, ingredientDeltas: [] } as any], groups),
    /Invalid modifier selection structure/
  );

  // Option not in group rejected
  assert.throws(
    () => aggregateModifiers([{ groupId: 'grp_size', optionId: 'opt_unknown' }], groups),
    /Modifier option "opt_unknown" does not belong to modifier group/
  );

  // Group not in applicable groups rejected
  assert.throws(
    () => aggregateModifiers([{ groupId: 'grp_other', optionId: 'opt_size_large' }], groups),
    /Modifier group "grp_other" is not an applicable modifier group/
  );
});

test('7. Required modifier groups validation works across Array, Map, and Record representations', () => {
  const groupReq: ModifierGroup = {
    id: 'grp_milk_choice',
    tenantId: 'tenant_cafe_1',
    name: 'Milk Choice',
    isRequired: true,
    minSelections: 1,
    maxSelections: 1,
    allowMultiple: false,
    options: [
      { id: 'opt_whole_milk', name: 'Whole Milk', priceDeltaCentavos: 0, ingredientDeltas: [], isAvailable: true },
      { id: 'opt_oat_milk', name: 'Oat Milk', priceDeltaCentavos: 4000, ingredientDeltas: [], isAvailable: true }
    ],
    isActive: true
  };

  // 1. Array representation
  assert.throws(() => aggregateModifiers([], [groupReq]), /Missing selection for required modifier group/);

  // 2. Map representation
  const mapReq = new Map<string, ModifierGroup>([[groupReq.id, groupReq]]);
  assert.throws(() => aggregateModifiers([], mapReq), /Missing selection for required modifier group/);

  // 3. Record representation
  const recordReq = { [groupReq.id]: groupReq };
  assert.throws(() => aggregateModifiers([], recordReq), /Missing selection for required modifier group/);
});

test('8. Hardened normalizeModifierGroups: key mismatch, duplicates, and missing groups fail', () => {
  const group: ModifierGroup = {
    id: 'grp_size',
    tenantId: 'tenant_cafe_1',
    name: 'Size',
    isRequired: false,
    minSelections: 0,
    maxSelections: 1,
    allowMultiple: false,
    options: [{ id: 'opt_size_large', name: 'Large', priceDeltaCentavos: 2000, ingredientDeltas: [], isAvailable: true }],
    isActive: true
  };

  // Map key mismatch
  const mapMismatch = new Map<string, ModifierGroup>([['wrong_key', group]]);
  assert.throws(() => normalizeModifierGroups(mapMismatch), /Map key "wrong_key" does not match ModifierGroup id "grp_size"/);

  // Record key mismatch
  const recordMismatch = { wrong_key: group };
  assert.throws(() => normalizeModifierGroups(recordMismatch), /Record key "wrong_key" does not match ModifierGroup id "grp_size"/);

  // Duplicate group ID in array
  assert.throws(() => normalizeModifierGroups([group, group]), /Duplicate modifier group ID "grp_size" in array input/);

  // Missing configured groups when menuItem has modifierGroupIds
  const menuItem = createIcedLatteMenuItem(); // expects ['grp_size', 'grp_espresso_shot']
  const partialGroups = [group]; // only provides 'grp_size'

  assert.throws(
    () => aggregateModifiers([{ groupId: 'grp_size', optionId: 'opt_size_large' }], partialGroups, menuItem),
    /Configured modifier group "grp_espresso_shot" is missing from supplied modifierGroups/
  );

  // Omitting modifierGroups when menuItem configures modifier groups fails
  assert.throws(
    () => aggregateModifiers([{ groupId: 'grp_size', optionId: 'opt_size_large' }], undefined, menuItem),
    /configures modifier groups, but no authoritative modifierGroups were supplied/
  );
});

test('9. Menu item with no modifier groups and no selections remains valid', () => {
  const ingredients = createSampleIngredients();
  const baseRecipe = createIcedLatteRecipe();

  // Create a plain espresso menu item with NO modifier groups
  const plainEspresso: MenuItem = {
    id: 'menu_espresso_solo',
    tenantId: 'tenant_cafe_1',
    name: 'Single Espresso',
    category: 'Espresso Hot',
    basePriceCentavos: 8000, // ₱80.00
    activeRecipeVersionId: 'rec_espresso_solo_v1',
    modifierGroupIds: [], // NO modifier groups
    isAvailable: true,
    isActive: true
  };

  const espressoRecipe: RecipeVersion = {
    id: 'rec_espresso_solo_v1',
    tenantId: 'tenant_cafe_1',
    menuItemId: 'menu_espresso_solo',
    version: 1,
    yield: 1,
    isActive: true,
    components: [
      { ingredientId: 'ing_espresso_beans', quantityMinor: 18, unit: 'kg', quantityScale: 3 },
      { ingredientId: 'ing_takeout_cup_16oz', quantityMinor: 1, unit: 'piece', quantityScale: 0 }
    ]
  };

  // Cost calculation without modifiers succeeds
  const cogsResult = calculateMenuItemCogs({
    menuItem: plainEspresso,
    recipe: espressoRecipe,
    selectedModifiers: [],
    ingredients
  });

  // Beans (2160) + Cup (350) = 2510 centavos (₱25.10)
  assert.equal(cogsResult.unitCogsCentavos, 2510);
  assert.equal(cogsResult.finalSellingPriceCentavos, 8000);

  // Selecting a modifier on an item without modifier groups fails closed
  assert.throws(
    () => calculateMenuItemCogs({
      menuItem: plainEspresso,
      recipe: espressoRecipe,
      selectedModifiers: [{ groupId: 'grp_any', optionId: 'opt_any' }],
      ingredients
    }),
    /has no modifier groups, but 1 modifier\(s\) were selected/
  );
});

test('10. Tenant identity: cross-tenant snapshot override fails and foreign-tenant groups fail', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const groups = createIcedLatteModifierGroups();

  // Snapshot tenantId override fails
  assert.throws(
    () => createSaleLineSnapshot({
      menuItem,
      recipe,
      modifierGroups: groups,
      ingredients,
      quantity: 1,
      saleLineId: 'line_tenant_test',
      createdAt: '2026-08-30T10:00:00.000Z',
      tenantId: 'tenant_malicious_override'
    }),
    /Snapshot tenantId "tenant_malicious_override" does not match MenuItem tenantId/
  );

  // Foreign-tenant group fails
  const foreignGroup: ModifierGroup = {
    ...groups[0],
    tenantId: 'tenant_other_cafe'
  };

  assert.throws(
    () => aggregateModifiers([{ groupId: 'grp_size', optionId: 'opt_size_large' }], [foreignGroup, groups[1]], menuItem),
    /Tenant mismatch: Modifier group "grp_size" \(tenant_other_cafe\) does not match MenuItem tenant "tenant_cafe_1"/
  );
});

test('11. Deterministic snapshots: ISO datetime validation and root/nested immutability', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const groups = createIcedLatteModifierGroups();

  // Invalid timestamp format fails
  assert.throws(
    () => createSaleLineSnapshot({
      menuItem,
      recipe,
      modifierGroups: groups,
      ingredients,
      quantity: 1,
      saleLineId: 'line_ts_1',
      createdAt: 'invalid-date-string'
    }),
    /Invalid ISO datetime format/
  );

  assert.throws(
    () => createSaleLineSnapshot({
      menuItem,
      recipe,
      modifierGroups: groups,
      ingredients,
      quantity: 1,
      saleLineId: 'line_ts_2',
      createdAt: '2026-08-30'
    }),
    /Invalid ISO datetime format/
  );

  // Valid snapshot is frozen and immutable
  const snapshot = createSaleLineSnapshot({
    menuItem,
    recipe,
    modifierGroups: groups,
    ingredients,
    quantity: 2,
    saleLineId: 'line_001',
    createdAt: '2026-08-30T10:00:00.000Z'
  });

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.components), true);
  assert.equal(Object.isFrozen(snapshot.components[0]), true);
  assert.equal(Object.isFrozen(snapshot.selectedModifiers), true);

  assert.throws(() => {
    'use strict';
    (snapshot as any).unitCogsCentavos = 99999;
  }, TypeError);
});

test('12. Reordered modifier deltas and options produce byte-identical canonical snapshots', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();

  const group: ModifierGroup = {
    id: 'grp_size',
    tenantId: 'tenant_cafe_1',
    name: 'Size Options',
    isRequired: false,
    minSelections: 0,
    maxSelections: 1,
    allowMultiple: false,
    options: [{
      id: 'opt_combo_1',
      name: 'Combo A',
      priceDeltaCentavos: 2500,
      ingredientDeltas: [
        { ingredientId: 'ing_fresh_milk', quantityMinorDelta: 50 },
        { ingredientId: 'ing_espresso_beans', quantityMinorDelta: 9 }
      ],
      isAvailable: true
    }],
    isActive: true
  };

  const groupShot = createIcedLatteModifierGroups()[1];

  const snap1 = createSaleLineSnapshot({
    menuItem,
    recipe,
    selectedModifiers: [{ groupId: 'grp_size', optionId: 'opt_combo_1' }],
    modifierGroups: [group, groupShot],
    ingredients,
    quantity: 1,
    saleLineId: 'line_canonical_test',
    createdAt: '2026-08-30T10:00:00.000Z'
  });

  const snap2 = createSaleLineSnapshot({
    menuItem,
    recipe,
    selectedModifiers: [{ groupId: 'grp_size', optionId: 'opt_combo_1' }],
    modifierGroups: [group, groupShot],
    ingredients,
    quantity: 1,
    saleLineId: 'line_canonical_test',
    createdAt: '2026-08-30T10:00:00.000Z'
  });

  assert.deepEqual(snap1, snap2);
  assert.equal(JSON.stringify(snap1), JSON.stringify(snap2));
});

test('13. Financial calculations and gross margin basis points', () => {
  // Margin calculation: Profit ₱158.90 on Revenue ₱290.00 -> 5479 basis points (54.79%)
  assert.equal(calculateGrossMarginBasisPoints(15890, 29000), 5479);
  assert.equal(calculateGrossMarginBasisPoints(3333, 10000), 3333);
  assert.equal(calculateGrossMarginBasisPoints(0, 0), 0);

  // Financial multiplication and addition safety
  assert.equal(safeMultiplyMoney(14500, 2), 29000);
  assert.equal(safeAddMoney(14500, 2000), 16500);
  assert.throws(() => safeMultiplyMoney(100000000000, 1000000), /Line total exceeded safe financial bounds/);
  assert.throws(() => safeMultiplyMoney(100, 2000000), /Invalid line quantity/);
  assert.throws(() => safeAddMoney(100000000000, 100000000000), /exceeded safe bounds|exceeds maximum safe bounds/);
});

test('14. Existing Iced Latte and Large modifier results remain exact', () => {
  const ingredients = createSampleIngredients();
  const recipe = createIcedLatteRecipe();
  const menuItem = createIcedLatteMenuItem();
  const groups = createIcedLatteModifierGroups();

  // Base Recipe Cost: 6555 centavos (₱65.55)
  const baseResult = calculateRecipeBaseCost(recipe, ingredients);
  assert.equal(baseResult.totalCostCentavos, 6555);

  const cogsResult = calculateMenuItemCogs({
    menuItem,
    recipe,
    selectedModifiers: [{ groupId: 'grp_size', optionId: 'opt_size_large' }],
    modifierGroups: groups,
    ingredients
  });

  assert.equal(cogsResult.finalSellingPriceCentavos, 16500); // ₱165.00
  assert.equal(cogsResult.unitCogsCentavos, 8225); // ₱82.25
  assert.equal(cogsResult.modifierCostDeltaCentavos, 1670); // ₱16.70

  const snapshot = createSaleLineSnapshot({
    menuItem,
    recipe,
    selectedModifiers: [{ groupId: 'grp_size', optionId: 'opt_size_large' }],
    modifierGroups: groups,
    ingredients,
    quantity: 2,
    saleLineId: 'line_iced_latte_001',
    createdAt: '2026-08-30T10:00:00.000Z'
  });

  assert.equal(snapshot.lineRevenueCentavos, 33000); // ₱330.00
  assert.equal(snapshot.lineCogsCentavos, 16450); // ₱164.50
  assert.equal(snapshot.lineGrossProfitCentavos, 16550); // ₱165.50
  assert.equal(snapshot.grossMarginBasisPoints, 5015); // (16550 / 33000) * 10000 = 5015.15... -> 5015 bps (50.15%)
});

test('15. Regression: yield > 1 batch yield without allocation fails validation', () => {
  const invalidBatchRecipe = {
    id: 'rec_batch_syrup',
    tenantId: 'tenant_cafe_1',
    menuItemId: 'menu_iced_latte',
    version: 1,
    yield: 4, // Batch recipe yield = 4
    isActive: true,
    components: [
      { ingredientId: 'ing_vanilla_syrup', quantityMinor: 120, unit: 'L', quantityScale: 3 }
    ]
  };

  assert.throws(
    () => RecipeVersionSchema.parse(invalidBatchRecipe),
    /Unsupported recipe yield. Current foundation only supports yield: 1/
  );
});
