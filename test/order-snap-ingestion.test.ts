import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';

import {
  OrderIngestionRequestSchema,
  OrderLine,
  OrderIngestionRequest,
  validateOrderLineUniqueness,
  normalizeOrderLines,
  computeOrderFingerprint
} from '../src/lib/order-snap/order-ingestion';

import {
  calculateOrderInventoryDeductions,
  InventoryDeduction,
  InventoryDeductionPlan
} from '../src/lib/order-snap/inventory-deduction';

import {
  buildInventoryLedgerMovement,
  buildInventoryLedgerMovements,
  InventoryLedgerMovement,
  InventoryLedgerMovementSchema
} from '../src/lib/order-snap/ledger-movement';

import {
  finalizeOrder,
  validateOrderIngestion,
  checkIdempotentReplay,
  OrderFinalizationResult
} from '../src/lib/order-snap/order-finalization';

import {
  Ingredient,
  IngredientSchema,
  RecipeVersion,
  RecipeVersionSchema,
  MenuItem,
  MenuItemSchema
} from '../src/lib/order-snap/domain-schemas';

import { ModifierGroup } from '../src/lib/order-snap/domain-schemas';

import { safeMultiplyQuantityMinor } from '../src/lib/order-snap/quantity-math';

// ==========================================
// Test Fixtures
// ==========================================

interface TestSetup {
  ingredients: Map<string, Ingredient>;
  menuItems: Map<string, MenuItem>;
  recipes: Map<string, RecipeVersion>;
  modifierGroups: ModifierGroup[];
}

function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

function createTestSetup(): TestSetup {
  const ingredients: Ingredient[] = [
    {
      id: 'ing_espresso_beans',
      tenantId: 'tenant_test',
      name: 'Espresso Coffee Beans',
      unit: 'kg',
      quantityScale: 3,
      stockQuantityMinor: 100000,
      costBasis: { basisQuantityMinor: 1000, basisCostCentavos: 120000 },
      reorderLevelMinor: 10000,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_fresh_milk',
      tenantId: 'tenant_test',
      name: 'Fresh Whole Milk',
      unit: 'L',
      quantityScale: 3,
      stockQuantityMinor: 50000,
      costBasis: { basisQuantityMinor: 1000, basisCostCentavos: 9500 },
      reorderLevelMinor: 10000,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_vanilla_syrup',
      tenantId: 'tenant_test',
      name: 'Vanilla Syrup',
      unit: 'L',
      quantityScale: 3,
      stockQuantityMinor: 10000,
      costBasis: { basisQuantityMinor: 750, basisCostCentavos: 45000 },
      reorderLevelMinor: 2000,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_takeout_cup',
      tenantId: 'tenant_test',
      name: '16oz PET Cup',
      unit: 'piece',
      quantityScale: 0,
      stockQuantityMinor: 1000,
      costBasis: { basisQuantityMinor: 100, basisCostCentavos: 35000 },
      reorderLevelMinor: 200,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_lid_flat',
      tenantId: 'tenant_test',
      name: 'Flat Lid 98mm',
      unit: 'piece',
      quantityScale: 0,
      stockQuantityMinor: 1000,
      costBasis: { basisQuantityMinor: 100, basisCostCentavos: 12000 },
      reorderLevelMinor: 200,
      isActive: true,
      version: 1
    }
  ];

  const ingredientMap = new Map<string, Ingredient>();
  for (const ing of ingredients) {
    IngredientSchema.parse(ing);
    ingredientMap.set(ing.id, ing);
  }

  const recipe: RecipeVersion = {
    id: 'rec_latte_v1',
    tenantId: 'tenant_test',
    menuItemId: 'menu_latte',
    version: 1,
    yield: 1,
    isActive: true,
    components: [
      { ingredientId: 'ing_espresso_beans', quantityMinor: 18, unit: 'kg', quantityScale: 3 },
      { ingredientId: 'ing_fresh_milk', quantityMinor: 200, unit: 'L', quantityScale: 3 },
      { ingredientId: 'ing_vanilla_syrup', quantityMinor: 30, unit: 'L', quantityScale: 3 },
      { ingredientId: 'ing_takeout_cup', quantityMinor: 1, unit: 'piece', quantityScale: 0 },
      { ingredientId: 'ing_lid_flat', quantityMinor: 1, unit: 'piece', quantityScale: 0 }
    ]
  };

  const recipeMap = new Map<string, RecipeVersion>();
  recipeMap.set(recipe.id, recipe);

  const menuItem: MenuItem = {
    id: 'menu_latte',
    tenantId: 'tenant_test',
    name: 'Iced Vanilla Latte',
    category: 'Cold Drinks',
    basePriceCentavos: 14500,
    activeRecipeVersionId: 'rec_latte_v1',
    modifierGroupIds: [],
    isAvailable: true,
    isActive: true
  };

  const menuItemMap = new Map<string, MenuItem>();
  menuItemMap.set(menuItem.id, menuItem);

  const modifierGroups: ModifierGroup[] = [];

  return { ingredients: ingredientMap, menuItems: menuItemMap, recipes: recipeMap, modifierGroups };
}

function createTestSetupWithModifiers(): TestSetup {
  const ingredients: Ingredient[] = [
    {
      id: 'ing_espresso_beans',
      tenantId: 'tenant_test',
      name: 'Espresso Coffee Beans',
      unit: 'kg',
      quantityScale: 3,
      stockQuantityMinor: 100000,
      costBasis: { basisQuantityMinor: 1000, basisCostCentavos: 120000 },
      reorderLevelMinor: 10000,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_fresh_milk',
      tenantId: 'tenant_test',
      name: 'Fresh Whole Milk',
      unit: 'L',
      quantityScale: 3,
      stockQuantityMinor: 50000,
      costBasis: { basisQuantityMinor: 1000, basisCostCentavos: 9500 },
      reorderLevelMinor: 10000,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_vanilla_syrup',
      tenantId: 'tenant_test',
      name: 'Vanilla Syrup',
      unit: 'L',
      quantityScale: 3,
      stockQuantityMinor: 10000,
      costBasis: { basisQuantityMinor: 750, basisCostCentavos: 45000 },
      reorderLevelMinor: 2000,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_takeout_cup',
      tenantId: 'tenant_test',
      name: '16oz PET Cup',
      unit: 'piece',
      quantityScale: 0,
      stockQuantityMinor: 1000,
      costBasis: { basisQuantityMinor: 100, basisCostCentavos: 35000 },
      reorderLevelMinor: 200,
      isActive: true,
      version: 1
    },
    {
      id: 'ing_lid_flat',
      tenantId: 'tenant_test',
      name: 'Flat Lid 98mm',
      unit: 'piece',
      quantityScale: 0,
      stockQuantityMinor: 1000,
      costBasis: { basisQuantityMinor: 100, basisCostCentavos: 12000 },
      reorderLevelMinor: 200,
      isActive: true,
      version: 1
    }
  ];

  const ingredientMap = new Map<string, Ingredient>();
  for (const ing of ingredients) {
    IngredientSchema.parse(ing);
    ingredientMap.set(ing.id, ing);
  }

  const recipe: RecipeVersion = {
    id: 'rec_latte_v1',
    tenantId: 'tenant_test',
    menuItemId: 'menu_latte',
    version: 1,
    yield: 1,
    isActive: true,
    components: [
      { ingredientId: 'ing_espresso_beans', quantityMinor: 18, unit: 'kg', quantityScale: 3 },
      { ingredientId: 'ing_fresh_milk', quantityMinor: 200, unit: 'L', quantityScale: 3 },
      { ingredientId: 'ing_vanilla_syrup', quantityMinor: 30, unit: 'L', quantityScale: 3 },
      { ingredientId: 'ing_takeout_cup', quantityMinor: 1, unit: 'piece', quantityScale: 0 },
      { ingredientId: 'ing_lid_flat', quantityMinor: 1, unit: 'piece', quantityScale: 0 }
    ]
  };

  const recipeMap = new Map<string, RecipeVersion>();
  recipeMap.set(recipe.id, recipe);

  const modifierGroups: ModifierGroup[] = [
    {
      id: 'grp_size',
      tenantId: 'tenant_test',
      name: 'Size Upsize',
      isRequired: false,
      minSelections: 0,
      maxSelections: 1,
      allowMultiple: false,
      options: [
        {
          id: 'opt_large',
          name: 'Large (+100ml milk)',
          priceDeltaCentavos: 2000,
          ingredientDeltas: [
            { ingredientId: 'ing_fresh_milk', quantityMinorDelta: 100 }
          ],
          isAvailable: true
        }
      ],
      isActive: true
    }
  ];

  const menuItem: MenuItem = {
    id: 'menu_latte',
    tenantId: 'tenant_test',
    name: 'Iced Vanilla Latte',
    category: 'Cold Drinks',
    basePriceCentavos: 14500,
    activeRecipeVersionId: 'rec_latte_v1',
    modifierGroupIds: ['grp_size'],
    isAvailable: true,
    isActive: true
  };

  const menuItemMap = new Map<string, MenuItem>();
  menuItemMap.set(menuItem.id, menuItem);

  return { ingredients: ingredientMap, menuItems: menuItemMap, recipes: recipeMap, modifierGroups };
}

// ==========================================
// Order Ingestion Tests
// ==========================================

test('1. Successful single-line order validation and ingestion', () => {
  const ts = '2026-08-30T10:00:00.000Z';

  const request: OrderIngestionRequest = {
    orderId: 'order_test_001',
    tenantId: 'tenant_test',
    staffAccountId: 'staff_001',
    idempotencyKey: 'idem_test_001',
    createdAt: ts,
    committedAt: ts,
    lines: [
      {
        lineId: 'line_001',
        menuItemId: 'menu_latte',
        quantity: 1
      }
    ]
  };

  assert.doesNotThrow(() => OrderIngestionRequestSchema.parse(request));
  validateOrderLineUniqueness(request);
});

test('2. Successful multi-line order validation', () => {
  const ts = '2026-08-30T10:00:00.000Z';

  const request: OrderIngestionRequest = {
    orderId: 'order_test_002',
    tenantId: 'tenant_test',
    staffAccountId: 'staff_001',
    idempotencyKey: 'idem_test_002',
    createdAt: ts,
    committedAt: ts,
    lines: [
      { lineId: 'line_001', menuItemId: 'menu_latte', quantity: 2 },
      { lineId: 'line_002', menuItemId: 'menu_latte', quantity: 1 }
    ]
  };

  assert.doesNotThrow(() => OrderIngestionRequestSchema.parse(request));
  validateOrderLineUniqueness(request);
});

test('3. Duplicate line IDs rejected', () => {
  const ts = '2026-08-30T10:00:00.000Z';
  const request = {
    orderId: 'order_test_003',
    tenantId: 'tenant_test',
    staffAccountId: 'staff_001',
    idempotencyKey: 'idem_test_003',
    createdAt: ts,
    committedAt: ts,
    lines: [
      { lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1 },
      { lineId: 'line_001', menuItemId: 'menu_latte', quantity: 2 }
    ]
  };

  assert.throws(() => OrderIngestionRequestSchema.parse(request), /Duplicate line IDs/);
});

test('4. Canonical line ordering for byte-identical serialization', () => {
  const lines1: OrderLine[] = [
    { lineId: 'line_z', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] },
    { lineId: 'line_a', menuItemId: 'menu_latte', quantity: 2, selectedModifiers: [] }
  ];

  const lines2: OrderLine[] = [
    { lineId: 'line_a', menuItemId: 'menu_latte', quantity: 2, selectedModifiers: [] },
    { lineId: 'line_z', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }
  ];

  const normalized1 = normalizeOrderLines(lines1);
  const normalized2 = normalizeOrderLines(lines2);

  assert.deepEqual(normalized1, normalized2);
  assert.equal(JSON.stringify(normalized1), JSON.stringify(normalized2));
});

test('5. Deterministic fingerprint computation', () => {
  const createRequest = (orderId: string, lineOrder: number[]): OrderIngestionRequest => {
    const ts = '2026-08-30T10:00:00.000Z';
    return {
      orderId,
      tenantId: 'tenant_test',
      staffAccountId: 'staff_001',
      idempotencyKey: `idem_${orderId}`,
      createdAt: ts,
      committedAt: ts,
      lines: lineOrder.map(lineId => ({
        lineId,
        menuItemId: 'menu_latte',
        quantity: 1,
        selectedModifiers: []
      }))
    };
  };

  const r1 = createRequest('order_1', ['line_a', 'line_b']);
  const r2 = createRequest('order_1', ['line_b', 'line_a']);

  const fp1 = computeOrderFingerprint(r1);
  const fp2 = computeOrderFingerprint(r2);

  assert.equal(fp1, fp2, 'Fingerprint should be same regardless of input line order');
});

test('6. Modifier selections are canonically sorted', () => {
  const ts = '2026-08-30T10:00:00.000Z';
  const request: OrderIngestionRequest = {
    orderId: 'order_mod_test',
    tenantId: 'tenant_test',
    staffAccountId: 'staff_001',
    idempotencyKey: 'idem_mod_test',
    createdAt: ts,
    committedAt: ts,
    lines: [
      {
        lineId: 'line_001',
        menuItemId: 'menu_latte',
        quantity: 1,
        selectedModifiers: [
          { groupId: 'grp_b', optionId: 'opt_1' },
          { groupId: 'grp_a', optionId: 'opt_2' }
        ]
      }
    ]
  };

  const fp1 = computeOrderFingerprint(request);

  const request2: OrderIngestionRequest = {
    ...request,
    lines: [{
      ...request.lines[0],
      selectedModifiers: [
        { groupId: 'grp_a', optionId: 'opt_2' },
        { groupId: 'grp_b', optionId: 'opt_1' }
      ]
    }]
  };

  const fp2 = computeOrderFingerprint(request2);
  assert.equal(fp1, fp2, 'Fingerprint should be stable regardless of modifier order');
});

// ==========================================
// Inventory Deduction Tests
// ==========================================

test('7. Single line order deduction', () => {
  const setup = createTestSetup();

  const deductionPlan = calculateOrderInventoryDeductions({
    orderId: 'order_single',
    tenantId: 'tenant_test',
    lines: [
      { lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }
    ],
    menuItems: setup.menuItems,
    recipes: setup.recipes,
    ingredients: setup.ingredients,
    modifierGroups: setup.modifierGroups
  });

  assert.equal(deductionPlan.hasSufficientStock, true);
  assert.equal(deductionPlan.deductions.length, 5);

  const milkDeduction = deductionPlan.deductions.find(d => d.ingredientId === 'ing_fresh_milk');
  assert.equal(milkDeduction?.deductionQuantityMinor, 200, 'Milk should be 200ml per latte');
});

test('8. Modifier additions affect deductions', () => {
  const setup = createTestSetupWithModifiers();

  const deductionPlan = calculateOrderInventoryDeductions({
    orderId: 'order_mod_add',
    tenantId: 'tenant_test',
    lines: [
      {
        lineId: 'line_001',
        menuItemId: 'menu_latte',
        quantity: 1,
        selectedModifiers: [{ groupId: 'grp_size', optionId: 'opt_large' }]
      }
    ],
    menuItems: setup.menuItems,
    recipes: setup.recipes,
    ingredients: setup.ingredients,
    modifierGroups: setup.modifierGroups
  });

  assert.equal(deductionPlan.hasSufficientStock, true);

  const milkDeduction = deductionPlan.deductions.find(d => d.ingredientId === 'ing_fresh_milk');
  assert.equal(milkDeduction?.deductionQuantityMinor, 300, 'Milk should be 200 + 100 = 300ml');
});

test('9. Exact stock reconciliation: previousStock - deduction = newStock', () => {
  const setup = createTestSetup();

  const deductionPlan = calculateOrderInventoryDeductions({
    orderId: 'order_stock_test',
    tenantId: 'tenant_test',
    lines: [
      { lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }
    ],
    menuItems: setup.menuItems,
    recipes: setup.recipes,
    ingredients: setup.ingredients,
    modifierGroups: setup.modifierGroups
  });

  for (const deduction of deductionPlan.deductions) {
    const expectedNewStock = deduction.previousStockQuantityMinor - deduction.deductionQuantityMinor;
    assert.equal(
      deduction.newStockQuantityMinor,
      expectedNewStock,
      `Stock reconciliation failed for ${deduction.ingredientId}`
    );
  }
});

// ==========================================
// Insufficient Stock Tests
// ==========================================

test('10. Insufficient stock detected', () => {
  const setup = createTestSetup();

  const lowStockIngredients = new Map<string, Ingredient>();
  for (const [id, ing] of setup.ingredients) {
    lowStockIngredients.set(id, { ...ing, stockQuantityMinor: 5 });
  }

  const result = calculateOrderInventoryDeductions({
    orderId: 'order_insufficient',
    tenantId: 'tenant_test',
    lines: [{ lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }],
    menuItems: setup.menuItems,
    recipes: setup.recipes,
    ingredients: lowStockIngredients,
    modifierGroups: setup.modifierGroups
  });

  assert.equal(result.hasSufficientStock, false);
  assert.ok(result.insufficientStockFailures.length > 0);
});

// ==========================================
// Missing/Incomplete Data Tests
// ==========================================

test('11. Inactive ingredient rejection', () => {
  const setup = createTestSetup();
  const inactiveIngredients = new Map(setup.ingredients);
  inactiveIngredients.set('ing_fresh_milk', {
    ...setup.ingredients.get('ing_fresh_milk')!,
    isActive: false
  });

  assert.throws(
    () => calculateOrderInventoryDeductions({
      orderId: 'order_inactive',
      tenantId: 'tenant_test',
      lines: [{ lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }],
      menuItems: setup.menuItems,
      recipes: setup.recipes,
      ingredients: inactiveIngredients,
      modifierGroups: setup.modifierGroups
    })
  );
});

// ==========================================
// Cross-Tenant Tests
// ==========================================

test('12. Cross-tenant data rejection via MenuItem', () => {
  const setup = createTestSetup();

  const foreignMenuItem: MenuItem = {
    ...setup.menuItems.get('menu_latte')!,
    tenantId: 'tenant_foreign'
  };

  const foreignMenuItems = new Map(setup.menuItems);
  foreignMenuItems.set('menu_latte', foreignMenuItem);

  assert.throws(
    () => calculateOrderInventoryDeductions({
      orderId: 'order_cross_tenant',
      tenantId: 'tenant_test',
      lines: [{ lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }],
      menuItems: foreignMenuItems,
      recipes: setup.recipes,
      ingredients: setup.ingredients,
      modifierGroups: setup.modifierGroups
    }),
    /Tenant mismatch/
  );
});

test('13. Cross-tenant data rejection via Recipe', () => {
  const setup = createTestSetup();

  const foreignRecipe: RecipeVersion = {
    ...setup.recipes.get('rec_latte_v1')!,
    tenantId: 'tenant_foreign'
  };

  const foreignRecipes = new Map(setup.recipes);
  foreignRecipes.set('rec_latte_v1', foreignRecipe);

  assert.throws(
    () => calculateOrderInventoryDeductions({
      orderId: 'order_cross_tenant_recipe',
      tenantId: 'tenant_test',
      lines: [{ lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }],
      menuItems: setup.menuItems,
      recipes: foreignRecipes,
      ingredients: setup.ingredients,
      modifierGroups: setup.modifierGroups
    }),
    /Tenant mismatch/
  );
});

// ==========================================
// Tampered/Invalid Data Tests
// ==========================================

test('14. Scale mismatch rejection', () => {
  const setup = createTestSetup();

  const badScaleIngredient: Ingredient = {
    id: 'ing_bad_scale',
    tenantId: 'tenant_test',
    name: 'Bad Scale Item',
    unit: 'L',
    quantityScale: 2,
    stockQuantityMinor: 100,
    costBasis: { basisQuantityMinor: 1000, basisCostCentavos: 1000 },
    isActive: true,
    version: 1
  };

  const badIngredients = new Map<string, Ingredient>();
  badIngredients.set('ing_bad_scale', badScaleIngredient);

  assert.throws(
    () => calculateOrderInventoryDeductions({
      orderId: 'order_bad_scale',
      tenantId: 'tenant_test',
      lines: [{ lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }],
      menuItems: setup.menuItems,
      recipes: setup.recipes,
      ingredients: badIngredients,
      modifierGroups: setup.modifierGroups
    })
  );
});

test('15. Unsupported unit in ingredient rejection', () => {
  const setup = createTestSetup();

  const badUnitIngredient: Ingredient = {
    id: 'ing_fresh_milk',
    tenantId: 'tenant_test',
    name: 'Bad Milk',
    unit: 'xyz_unknown',
    quantityScale: 3,
    stockQuantityMinor: 100,
    costBasis: { basisQuantityMinor: 1000, basisCostCentavos: 1000 },
    isActive: true,
    version: 1
  };

  const foreignRecipe: RecipeVersion = {
    ...setup.recipes.get('rec_latte_v1')!,
    components: [
      { ingredientId: 'ing_fresh_milk', quantityMinor: 200, unit: 'L', quantityScale: 3 }
    ]
  };

  const foreignRecipes = new Map(setup.recipes);
  foreignRecipes.set('rec_latte_v1', foreignRecipe);

  const badIngredients = new Map<string, Ingredient>();
  badIngredients.set('ing_fresh_milk', badUnitIngredient);

  assert.throws(
    () => calculateOrderInventoryDeductions({
      orderId: 'order_bad_unit',
      tenantId: 'tenant_test',
      lines: [{ lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }],
      menuItems: setup.menuItems,
      recipes: foreignRecipes,
      ingredients: badIngredients,
      modifierGroups: setup.modifierGroups
    }),
    /Unknown or unsupported unit|Ingredient unit must be|Ingredient quantityScale must match/
  );
});

// ==========================================
// Duplicate Detection Tests
// ==========================================

test('16. Movement ID collision detection', () => {
  assert.throws(
    () => buildInventoryLedgerMovements({
      tenantId: 'tenant_test',
      orderId: 'order_dup_mov',
      saleId: 'sale_001',
      deductions: [
        {
          tenantId: 'tenant_test',
          ingredientId: 'ing_fresh_milk',
          ingredientName: 'Fresh Milk',
          unit: 'L',
          quantityScale: 3,
          deductionQuantityMinor: 100,
          previousStockQuantityMinor: 1000,
          newStockQuantityMinor: 900
        },
        {
          tenantId: 'tenant_test',
          ingredientId: 'ing_fresh_milk',
          ingredientName: 'Fresh Milk',
          unit: 'L',
          quantityScale: 3,
          deductionQuantityMinor: 200,
          previousStockQuantityMinor: 1000,
          newStockQuantityMinor: 800
        }
      ],
      createdAt: '2026-08-30T10:00:00.000Z'
    }),
    /Duplicate movement ID detected/
  );
});

// ==========================================
// Ledger Movement Tests
// ==========================================

test('17. Ledger movement contains all required fields', () => {
  const deduction: InventoryDeduction = {
    tenantId: 'tenant_test',
    ingredientId: 'ing_fresh_milk',
    ingredientName: 'Fresh Milk',
    unit: 'L',
    quantityScale: 3,
    deductionQuantityMinor: 200,
    previousStockQuantityMinor: 50000,
    newStockQuantityMinor: 49800
  };

  const movement = buildInventoryLedgerMovement({
    tenantId: 'tenant_test',
    orderId: 'order_movement',
    saleId: 'sale_001',
    ingredientId: 'ing_fresh_milk',
    deduction,
    createdAt: '2026-08-30T10:00:00.000Z'
  });

  assert.ok(movement.tenantId !== undefined, 'tenantId required');
  assert.ok(movement.orderId !== undefined, 'orderId required');
  assert.ok(movement.movementId !== undefined, 'movementId required');
  assert.ok(movement.ingredientId !== undefined, 'ingredientId required');
  assert.ok(movement.ingredientName !== undefined, 'ingredientName required');
  assert.ok(movement.unit !== undefined, 'unit required');
  assert.ok(movement.quantityScale !== undefined, 'quantityScale required');
  assert.ok(movement.quantityMinorDelta !== undefined, 'quantityMinorDelta required');
  assert.ok(movement.previousStockQuantityMinor !== undefined, 'previousStockQuantityMinor required');
  assert.ok(movement.newStockQuantityMinor !== undefined, 'newStockQuantityMinor required');
  assert.ok(movement.createdAt !== undefined, 'createdAt required');
});

test('18. Movement quantityMinorDelta is negative for deduction', () => {
  const deduction: InventoryDeduction = {
    tenantId: 'tenant_test',
    ingredientId: 'ing_fresh_milk',
    ingredientName: 'Fresh Milk',
    unit: 'L',
    quantityScale: 3,
    deductionQuantityMinor: 200,
    previousStockQuantityMinor: 50000,
    newStockQuantityMinor: 49800
  };

  const movement = buildInventoryLedgerMovement({
    tenantId: 'tenant_test',
    orderId: 'order_movement',
    saleId: 'sale_001',
    ingredientId: 'ing_fresh_milk',
    deduction,
    createdAt: '2026-08-30T10:00:00.000Z'
  });

  assert.equal(movement.quantityMinorDelta, -200, 'Delta should be negative for deduction');
});

test('19. Stock reconciliation invariant in movement', () => {
  const deduction: InventoryDeduction = {
    tenantId: 'tenant_test',
    ingredientId: 'ing_fresh_milk',
    ingredientName: 'Fresh Milk',
    unit: 'L',
    quantityScale: 3,
    deductionQuantityMinor: 200,
    previousStockQuantityMinor: 50000,
    newStockQuantityMinor: 49800
  };

  const movement = buildInventoryLedgerMovement({
    tenantId: 'tenant_test',
    orderId: 'order_movement',
    saleId: 'sale_001',
    ingredientId: 'ing_fresh_milk',
    deduction,
    createdAt: '2026-08-30T10:00:00.000Z'
  });

  const reconciled = movement.previousStockQuantityMinor + movement.quantityMinorDelta;
  assert.equal(reconciled, movement.newStockQuantityMinor, 'Stock reconciliation must hold');
});

test('20. Movement is recursively frozen', () => {
  const deduction: InventoryDeduction = {
    tenantId: 'tenant_test',
    ingredientId: 'ing_fresh_milk',
    ingredientName: 'Fresh Milk',
    unit: 'L',
    quantityScale: 3,
    deductionQuantityMinor: 200,
    previousStockQuantityMinor: 50000,
    newStockQuantityMinor: 49800
  };

  const movement = buildInventoryLedgerMovement({
    tenantId: 'tenant_test',
    orderId: 'order_movement',
    saleId: 'sale_001',
    ingredientId: 'ing_fresh_milk',
    deduction,
    createdAt: '2026-08-30T10:00:00.000Z'
  });

  assert.equal(Object.isFrozen(movement), true, 'Movement should be frozen');
});

test('21. Canonical sorting of movements by ingredientId', () => {
  const movements = buildInventoryLedgerMovements({
    tenantId: 'tenant_test',
    orderId: 'order_sorted',
    saleId: 'sale_001',
    deductions: [
      {
        tenantId: 'tenant_test',
        ingredientId: 'ing_zebra',
        ingredientName: 'Zebra Ingredient',
        unit: 'kg',
        quantityScale: 3,
        deductionQuantityMinor: 10,
        previousStockQuantityMinor: 1000,
        newStockQuantityMinor: 990
      },
      {
        tenantId: 'tenant_test',
        ingredientId: 'ing_apple',
        ingredientName: 'Apple Ingredient',
        unit: 'kg',
        quantityScale: 3,
        deductionQuantityMinor: 20,
        previousStockQuantityMinor: 1000,
        newStockQuantityMinor: 980
      }
    ],
    createdAt: '2026-08-30T10:00:00.000Z'
  });

  assert.equal(movements[0].ingredientId, 'ing_apple');
  assert.equal(movements[1].ingredientId, 'ing_zebra');
});

test('22. Movement ID is SHA-256 derived from canonical components', () => {
  const deduction: InventoryDeduction = {
    tenantId: 'tenant_test',
    ingredientId: 'ing_test',
    ingredientName: 'Test Ingredient',
    unit: 'kg',
    quantityScale: 3,
    deductionQuantityMinor: 100,
    previousStockQuantityMinor: 1000,
    newStockQuantityMinor: 900
  };

  const movement = buildInventoryLedgerMovement({
    tenantId: 'tenant_test',
    orderId: 'order_id',
    saleId: 'sale_id',
    ingredientId: 'ing_test',
    deduction,
    createdAt: '2026-08-30T10:00:00.000Z'
  });

  const expectedId = createHash('sha256')
    .update('movement:tenant_test:order_id:sale_id:ing_test', 'utf8')
    .digest('hex');

  assert.equal(movement.movementId, expectedId, 'Movement ID should be deterministic SHA-256 hash');
});

// ==========================================
// Order Finalization Tests
// ==========================================

test('23. Full order finalization produces complete results', () => {
  const setup = createTestSetup();
  const ts = '2026-08-30T10:00:00.000Z';

  const result = finalizeOrder({
    request: {
      orderId: 'order_full_001',
      tenantId: 'tenant_test',
      staffAccountId: 'staff_001',
      idempotencyKey: 'idem_full_001',
      createdAt: ts,
      committedAt: ts,
      lines: [
        { lineId: 'line_001', menuItemId: 'menu_latte', quantity: 2, selectedModifiers: [] }
      ]
    },
    inputs: {
      menuItems: setup.menuItems,
      recipes: setup.recipes,
      ingredients: setup.ingredients,
      modifierGroups: setup.modifierGroups
    },
    createdAt: ts,
    saleId: 'sale_001'
  });

  if (!('success' in result && result.success)) {
    assert.fail('Expected successful finalization, got: ' + JSON.stringify(result));
  } else {
    assert.equal(result.orderId, 'order_full_001');
    assert.equal(result.tenantId, 'tenant_test');
    assert.equal(result.fingerprint.length, 64, 'Fingerprint should be SHA-256 hex');
    assert.ok(result.saleLines.length > 0);
    assert.ok(result.movements.length > 0);
  }
});

test('24. Inventory reconciliation matches ledger movements', () => {
  const setup = createTestSetup();
  const ts = '2026-08-30T10:00:00.000Z';

  const result = finalizeOrder({
    request: {
      orderId: 'order_recon_001',
      tenantId: 'tenant_test',
      staffAccountId: 'staff_001',
      idempotencyKey: 'idem_recon_001',
      createdAt: ts,
      committedAt: ts,
      lines: [
        { lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }
      ]
    },
    inputs: {
      menuItems: setup.menuItems,
      recipes: setup.recipes,
      ingredients: setup.ingredients,
      modifierGroups: setup.modifierGroups
    },
    createdAt: ts,
    saleId: 'sale_001'
  });

  if ('success' in result && result.success) {
    const totalMovementDelta = result.movements.reduce(
      (sum, m) => sum + m.quantityMinorDelta,
      0
    );
    assert.ok(totalMovementDelta < 0, 'Total movement delta should be negative for deductions');
  }
});

test('25. Idempotent replay: same requestId + orderId + fingerprint returns stored result', () => {
  const fp = createHash('sha256').update('canonical_fingerprint').digest('hex');
  const storedResult: OrderFinalizationResult = {
    success: true,
    orderId: 'order_idem_001',
    tenantId: 'tenant_test',
    saleId: 'sale_001',
    idempotencyKey: 'idem_same_key',
    fingerprint: fp,
    snapshotId: 'snapshot_test',
    saleLines: [],
    movements: [],
    totalRevenueCentavos: 0,
    totalCogsCentavos: 0,
    totalDeductionsCount: 0,
    totalMovementsCount: 0
  } as OrderFinalizationResult;

  const req = { tenantId: 'tenant_test', orderId: 'order_idem_001', idempotencyKey: 'idem_same_key' };
  const result = checkIdempotentReplay(storedResult, req, fp);
  assert.equal(result, storedResult, 'Should return the exact stored object');
});

test('26. Idempotent replay: different orderId fails closed', () => {
  const fp = createHash('sha256').update('canonical_fingerprint').digest('hex');
  const storedResult: OrderFinalizationResult = {
    success: true,
    orderId: 'order_original',
    tenantId: 'tenant_test',
    saleId: 'sale_001',
    idempotencyKey: 'idem_conflict',
    fingerprint: fp,
    snapshotId: 'snapshot_test',
    saleLines: [],
    movements: [],
    totalRevenueCentavos: 0,
    totalCogsCentavos: 0,
    totalDeductionsCount: 0,
    totalMovementsCount: 0
  } as OrderFinalizationResult;

  const req = { tenantId: 'tenant_test', orderId: 'order_different', idempotencyKey: 'idem_conflict' };
  assert.throws(
    () => checkIdempotentReplay(storedResult, req, fp),
    /different orderId/
  );
});

test('27. Idempotent replay: different fingerprint fails closed', () => {
  const fp = createHash('sha256').update('canonical_fingerprint').digest('hex');
  const storedResult: OrderFinalizationResult = {
    success: true,
    orderId: 'order_idem_003',
    tenantId: 'tenant_test',
    saleId: 'sale_001',
    idempotencyKey: 'idem_conflict_two',
    fingerprint: fp,
    snapshotId: 'snapshot_test',
    saleLines: [],
    movements: [],
    totalRevenueCentavos: 0,
    totalCogsCentavos: 0,
    totalDeductionsCount: 0,
    totalMovementsCount: 0
  } as OrderFinalizationResult;

  const req = { tenantId: 'tenant_test', orderId: 'order_idem_003', idempotencyKey: 'idem_conflict_two' };
  assert.throws(
    () => checkIdempotentReplay(storedResult, req, 'different_fingerprint'),
    /different content/
  );
});

test('28. Idempotent replay integrated into finalizeOrder returns stored result without calculations', () => {
  const setup = createTestSetup();
  const ts = '2026-08-30T10:00:00.000Z';

  const request: OrderIngestionRequest = {
    orderId: 'order_replay_001',
    tenantId: 'tenant_test',
    staffAccountId: 'staff_001',
    idempotencyKey: 'idem_replay_001',
    createdAt: ts,
    committedAt: ts,
    lines: [
      { lineId: 'line_001', menuItemId: 'menu_latte', quantity: 2, selectedModifiers: [] }
    ]
  };

  const originalResult = finalizeOrder({
    request,
    inputs: {
      menuItems: setup.menuItems,
      recipes: setup.recipes,
      ingredients: setup.ingredients,
      modifierGroups: setup.modifierGroups
    },
    createdAt: ts,
    saleId: 'sale_001'
  });

  if (!('success' in originalResult) || !originalResult.success) {
    assert.fail('Expected successful first finalization.');
  }

  // Now replay with intentionally unusable/empty authoritative inputs alongside the matching stored result.
  // The stored result must be returned verbatim, proving calculation was bypassed.
  const result = finalizeOrder({
    request,
    inputs: {
      menuItems: new Map(),
      recipes: new Map(),
      ingredients: new Map(),
      modifierGroups: []
    },
    createdAt: ts,
    saleId: 'sale_001',
    storedResult: originalResult
  });

  assert.strictEqual(result, originalResult, 'Replay must return the exact stored object reference');
  assert.equal(result.fingerprint, originalResult.fingerprint, 'Fingerprint must match');
  assert.deepEqual(result, originalResult);
});

test('29. Idempotent replay: mismatched stored result fails closed in finalizeOrder', () => {
  const setup = createTestSetup();
  const ts = '2026-08-30T10:00:00.000Z';

  const fakeStoredResult: OrderFinalizationResult = {
    success: true,
    orderId: 'order_replay_002',
    tenantId: 'tenant_test',
    saleId: 'sale_001',
    idempotencyKey: 'idem_replay_002',
    fingerprint: 'mismatched_fingerprint',
    snapshotId: 'snapshot_test',
    saleLines: [],
    movements: [],
    totalRevenueCentavos: 0,
    totalCogsCentavos: 0,
    totalDeductionsCount: 0,
    totalMovementsCount: 0
  } as OrderFinalizationResult;

  const request: OrderIngestionRequest = {
    orderId: 'order_replay_002',
    tenantId: 'tenant_test',
    staffAccountId: 'staff_001',
    idempotencyKey: 'idem_replay_002',
    createdAt: ts,
    committedAt: ts,
    lines: [
      { lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }
    ]
  };

  assert.throws(
    () => finalizeOrder({
      request,
      inputs: {
        menuItems: setup.menuItems,
        recipes: setup.recipes,
        ingredients: setup.ingredients,
        modifierGroups: setup.modifierGroups
      },
      createdAt: ts,
      saleId: 'sale_001',
      storedResult: fakeStoredResult
    }),
    /conflict/
  );
});

test('30. Byte-identical JSON serialization', () => {
  const setup = createTestSetup();
  const ts = '2026-08-30T10:00:00.000Z';

  const createRequest = (orderId: string): OrderIngestionRequest => ({
    orderId,
    tenantId: 'tenant_test',
    staffAccountId: 'staff_001',
    idempotencyKey: `idem_${orderId}`,
    createdAt: ts,
    committedAt: ts,
    lines: [
      { lineId: 'line_z', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] },
      { lineId: 'line_a', menuItemId: 'menu_latte', quantity: 2, selectedModifiers: [] }
    ]
  });

  const result1 = finalizeOrder({
    request: createRequest('order_json_001'),
    inputs: {
      menuItems: setup.menuItems,
      recipes: setup.recipes,
      ingredients: setup.ingredients,
      modifierGroups: setup.modifierGroups
    },
    createdAt: ts,
    saleId: 'sale_001'
  });

  const result2 = finalizeOrder({
    request: createRequest('order_json_001'),
    inputs: {
      menuItems: setup.menuItems,
      recipes: setup.recipes,
      ingredients: setup.ingredients,
      modifierGroups: setup.modifierGroups
    },
    createdAt: ts,
    saleId: 'sale_001'
  });

  if ('success' in result1 && 'success' in result2) {
    assert.equal(JSON.stringify(result1), JSON.stringify(result2), 'Results should be byte-identical');
  }
});

test('31. Ledger movement schema validation passes', () => {
  const setup = createTestSetup();
  const ts = '2026-08-30T10:00:00.000Z';

  const result = finalizeOrder({
    request: {
      orderId: 'order_schema',
      tenantId: 'tenant_test',
      staffAccountId: 'staff_001',
      idempotencyKey: 'idem_schema',
      createdAt: ts,
      committedAt: ts,
      lines: [{ lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }]
    },
    inputs: {
      menuItems: setup.menuItems,
      recipes: setup.recipes,
      ingredients: setup.ingredients,
      modifierGroups: setup.modifierGroups
    },
    createdAt: ts,
    saleId: 'sale_001'
  });

  if ('success' in result && result.success) {
    for (const movement of result.movements) {
      assert.doesNotThrow(() => InventoryLedgerMovementSchema.parse(movement));
    }
  }
});

test('32. SaleLineSnapshot is deeply frozen', () => {
  const setup = createTestSetup();
  const ts = '2026-08-30T10:00:00.000Z';

  const result = finalizeOrder({
    request: {
      orderId: 'order_snapshot',
      tenantId: 'tenant_test',
      staffAccountId: 'staff_001',
      idempotencyKey: 'idem_snapshot',
      createdAt: ts,
      committedAt: ts,
      lines: [{ lineId: 'line_001', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }]
    },
    inputs: {
      menuItems: setup.menuItems,
      recipes: setup.recipes,
      ingredients: setup.ingredients,
      modifierGroups: setup.modifierGroups
    },
    createdAt: ts,
    saleId: 'sale_001'
  });

  if ('success' in result && result.success) {
    for (const line of result.saleLines) {
      assert.equal(Object.isFrozen(line), true, 'SaleLineSnapshot should be frozen');
      assert.equal(Object.isFrozen(line.components), true, 'Components should be frozen');
      assert.equal(Object.isFrozen(line.selectedModifiers), true, 'Selected modifiers should be frozen');
    }
  }
});

test('33. Quantity validation: orders must have at least one line', () => {
  const setup = createTestSetup();

  assert.throws(
    () => calculateOrderInventoryDeductions({
      orderId: 'order_empty_lines',
      tenantId: 'tenant_test',
      lines: [],
      menuItems: setup.menuItems,
      recipes: setup.recipes,
      ingredients: setup.ingredients,
      modifierGroups: setup.modifierGroups
    }),
    /Order must have at least one line/
  );
});

test('34. Line quantity positive integer validation', () => {
  const setup = createTestSetup();
  const ts = '2026-08-30T10:00:00.000Z';

  const negativeQuantityRequest = {
    orderId: 'order_neg_qty',
    tenantId: 'tenant_test',
    staffAccountId: 'staff_001',
    idempotencyKey: 'idem_neg_qty',
    createdAt: ts,
    committedAt: ts,
    lines: [
      { lineId: 'line_001', menuItemId: 'menu_latte', quantity: -1, selectedModifiers: [] }
    ]
  };

  assert.throws(
    () => OrderIngestionRequestSchema.parse(negativeQuantityRequest),
    /positive/
  );
});

test('31. Invalid timestamp format rejection', () => {
  assert.throws(
    () => buildInventoryLedgerMovements({
      tenantId: 'tenant_test',
      orderId: 'order_bad_ts',
      saleId: 'sale_001',
      deductions: [
        {
          tenantId: 'tenant_test',
          ingredientId: 'ing_fresh_milk',
          ingredientName: 'Fresh Milk',
          unit: 'L',
          quantityScale: 3,
          deductionQuantityMinor: 100,
          previousStockQuantityMinor: 1000,
          newStockQuantityMinor: 900
        }
      ],
      createdAt: 'invalid-timestamp'
    }),
    /ISO datetime format/
  );
});

test('35. Invalid identifier character rejection', () => {
  const deduction: InventoryDeduction = {
    tenantId: 'tenant_test',
    ingredientId: 'ing_fresh_milk',
    ingredientName: 'Fresh Milk',
    unit: 'L',
    quantityScale: 3,
    deductionQuantityMinor: 100,
    previousStockQuantityMinor: 1000,
    newStockQuantityMinor: 900
  };

  assert.throws(
    () => buildInventoryLedgerMovement({
      tenantId: 'tenant test',
      orderId: 'order_id',
      saleId: 'sale_001',
      ingredientId: 'ing_fresh_milk',
      deduction,
      createdAt: '2026-08-30T10:00:00.000Z'
    }),
    /invalid characters/
  );
});

test('33. Zero deduction rejection', () => {
  assert.throws(
    () => buildInventoryLedgerMovement({
      tenantId: 'tenant_test',
      orderId: 'order_zero_deduction',
      saleId: 'sale_001',
      ingredientId: 'ing_fresh_milk',
      deduction: {
        tenantId: 'tenant_test',
        ingredientId: 'ing_fresh_milk',
        ingredientName: 'Fresh Milk',
        unit: 'L',
        quantityScale: 3,
        deductionQuantityMinor: 0,
        previousStockQuantityMinor: 1000,
        newStockQuantityMinor: 1000
      },
      createdAt: '2026-08-30T10:00:00.000Z'
    })
  );
});

// ==========================================
// Quantity Multiplication Tests
// ==========================================

test('Quantity 2 doubles every base recipe ingredient', () => {
  const setup = createTestSetup();

  const deductionPlan = calculateOrderInventoryDeductions({
    orderId: 'order_q2_doubles',
    tenantId: 'tenant_test',
    lines: [
      { lineId: 'line_001', menuItemId: 'menu_latte', quantity: 2, selectedModifiers: [] }
    ],
    menuItems: setup.menuItems,
    recipes: setup.recipes,
    ingredients: setup.ingredients,
    modifierGroups: setup.modifierGroups
  });

  const expectedMilk = 200 * 2;
  const milkDeduction = deductionPlan.deductions.find(d => d.ingredientId === 'ing_fresh_milk');
  assert.equal(milkDeduction?.deductionQuantityMinor, expectedMilk, 'Milk should be doubled');

  const expectedBeans = 18 * 2;
  const beansDeduction = deductionPlan.deductions.find(d => d.ingredientId === 'ing_espresso_beans');
  assert.equal(beansDeduction?.deductionQuantityMinor, expectedBeans, 'Beans should be doubled');
});

test('Quantity 2 doubles modifier ingredient deltas', () => {
  const setup = createTestSetupWithModifiers();

  const deductionPlan = calculateOrderInventoryDeductions({
    orderId: 'order_q2_modifier',
    tenantId: 'tenant_test',
    lines: [
      {
        lineId: 'line_001',
        menuItemId: 'menu_latte',
        quantity: 2,
        selectedModifiers: [{ groupId: 'grp_size', optionId: 'opt_large' }]
      }
    ],
    menuItems: setup.menuItems,
    recipes: setup.recipes,
    ingredients: setup.ingredients,
    modifierGroups: setup.modifierGroups
  });

  const expectedMilk = (200 * 2) + (100 * 2);
  const milkDeduction = deductionPlan.deductions.find(d => d.ingredientId === 'ing_fresh_milk');
  assert.equal(milkDeduction?.deductionQuantityMinor, expectedMilk, 'Milk should be (base*2 + modifier*2)');
});

test('Two separate order lines aggregate shared ingredients correctly', () => {
  const setup = createTestSetup();

  const deductionPlan = calculateOrderInventoryDeductions({
    orderId: 'order_multi_line',
    tenantId: 'tenant_test',
    lines: [
      { lineId: 'line_a', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] },
      { lineId: 'line_b', menuItemId: 'menu_latte', quantity: 1, selectedModifiers: [] }
    ],
    menuItems: setup.menuItems,
    recipes: setup.recipes,
    ingredients: setup.ingredients,
    modifierGroups: setup.modifierGroups
  });

  const milkDeduction = deductionPlan.deductions.find(d => d.ingredientId === 'ing_fresh_milk');
  assert.equal(milkDeduction?.deductionQuantityMinor, 400, 'Milk should aggregate 200 + 200');

  const beansDeduction = deductionPlan.deductions.find(d => d.ingredientId === 'ing_espresso_beans');
  assert.equal(beansDeduction?.deductionQuantityMinor, 36, 'Beans should aggregate 18 + 18');
});

test('Quantity multiplication overflow fails closed through safeMultiplyQuantityMinor', () => {
  const setup = createTestSetup();

  assert.throws(
    () => {
      calculateOrderInventoryDeductions({
        orderId: 'order_overflow',
        tenantId: 'tenant_test',
        lines: [
          { lineId: 'line_overflow', menuItemId: 'menu_latte', quantity: 1_000_001, selectedModifiers: [] }
        ],
        menuItems: setup.menuItems,
        recipes: setup.recipes,
        ingredients: setup.ingredients,
        modifierGroups: setup.modifierGroups
      });
    },
    /must be a positive safe integer <= 1000000|exceeds safe quantity bounds/
  );
});

// ==========================================
// Ledger Builder Direct Call Rejection Tests
// ==========================================

test('Direct ledger builder rejects unsupported units', () => {
  const deduction: InventoryDeduction = {
    tenantId: 'tenant_test',
    ingredientId: 'ing_fresh_milk',
    ingredientName: 'Bad Milk',
    unit: 'unsupported_unit_xyz',
    quantityScale: 3,
    deductionQuantityMinor: 100,
    previousStockQuantityMinor: 1000,
    newStockQuantityMinor: 900
  };

  assert.throws(
    () => buildInventoryLedgerMovement({
      tenantId: 'tenant_test',
      orderId: 'order_ledger_unsupported',
      saleId: 'sale_001',
      ingredientId: 'ing_fresh_milk',
      deduction,
      createdAt: '2026-08-30T10:00:00.000Z'
    }),
    /Unknown or unsupported unit|must be canonical/
  );
});

test('Direct ledger builder rejects noncanonical unit aliases', () => {
  const deduction: InventoryDeduction = {
    tenantId: 'tenant_test',
    ingredientId: 'ing_fresh_milk',
    ingredientName: 'Fresh Milk',
    unit: 'liters',
    quantityScale: 3,
    deductionQuantityMinor: 100,
    previousStockQuantityMinor: 1000,
    newStockQuantityMinor: 900
  };

  assert.throws(
    () => buildInventoryLedgerMovement({
      tenantId: 'tenant_test',
      orderId: 'order_ledger_alias',
      saleId: 'sale_001',
      ingredientId: 'ing_fresh_milk',
      deduction,
      createdAt: '2026-08-30T10:00:00.000Z'
    }),
    /must be canonical/
  );
});

test('Direct ledger builder rejects unit with incorrect quantity scale', () => {
  const deduction: InventoryDeduction = {
    tenantId: 'tenant_test',
    ingredientId: 'ing_fresh_milk',
    ingredientName: 'Fresh Milk',
    unit: 'L',
    quantityScale: 2,
    deductionQuantityMinor: 100,
    previousStockQuantityMinor: 1000,
    newStockQuantityMinor: 900
  };

  assert.throws(
    () => buildInventoryLedgerMovement({
      tenantId: 'tenant_test',
      orderId: 'order_ledger_scale',
      saleId: 'sale_001',
      ingredientId: 'ing_fresh_milk',
      deduction,
      createdAt: '2026-08-30T10:00:00.000Z'
    }),
    /must equal standard scale.*3.*got 2/
  );
});

test('Direct ledger builder rejects inconsistent stock reconciliation', () => {
  const deduction: InventoryDeduction = {
    tenantId: 'tenant_test',
    ingredientId: 'ing_fresh_milk',
    ingredientName: 'Fresh Milk',
    unit: 'L',
    quantityScale: 3,
    deductionQuantityMinor: 100,
    previousStockQuantityMinor: 1000,
    newStockQuantityMinor: 500
  };

  assert.throws(
    () => buildInventoryLedgerMovement({
      tenantId: 'tenant_test',
      orderId: 'order_ledger_stock',
      saleId: 'sale_001',
      ingredientId: 'ing_fresh_milk',
      deduction,
      createdAt: '2026-08-30T10:00:00.000Z'
    }),
    /Stock reconciliation failed/
  );
});

test('safeMultiplyQuantityMinor function overflow fails closed', () => {
  assert.throws(
    () => safeMultiplyQuantityMinor(1_000_000_000, 2),
    /exceeds safe quantity bounds/
  );

  assert.throws(
    () => safeMultiplyQuantityMinor(500_000_000, 3),
    /exceeds safe quantity bounds/
  );

  assert.equal(safeMultiplyQuantityMinor(100, 2), 200);
});

test('Idempotent replay: different idempotency key fails closed in checkIdempotentReplay', () => {
  const fp = createHash('sha256').update('canonical_fingerprint').digest('hex');
  const storedResult: OrderFinalizationResult = {
    success: true,
    orderId: 'order_replay_distinct_key',
    tenantId: 'tenant_test',
    saleId: 'sale_001',
    idempotencyKey: 'idem_original_key',
    fingerprint: fp,
    snapshotId: 'snapshot_test',
    saleLines: [],
    movements: [],
    totalRevenueCentavos: 0,
    totalCogsCentavos: 0,
    totalDeductionsCount: 0,
    totalMovementsCount: 0
  } as OrderFinalizationResult;

  const req = { tenantId: 'tenant_test', orderId: 'order_replay_distinct_key', idempotencyKey: 'idem_different_key' };
  assert.throws(
    () => checkIdempotentReplay(storedResult, req, fp),
    /Idempotency key mismatch/
  );
});

test('Idempotent replay: different tenant fails closed in checkIdempotentReplay', () => {
  const fp = createHash('sha256').update('canonical_fingerprint').digest('hex');
  const storedResult: OrderFinalizationResult = {
    success: true,
    orderId: 'order_replay_different_tenant',
    tenantId: 'tenant_one',
    saleId: 'sale_001',
    idempotencyKey: 'idem_cross_tenant',
    fingerprint: fp,
    snapshotId: 'snapshot_test',
    saleLines: [],
    movements: [],
    totalRevenueCentavos: 0,
    totalCogsCentavos: 0,
    totalDeductionsCount: 0,
    totalMovementsCount: 0
  } as OrderFinalizationResult;

  const req = { tenantId: 'tenant_two', orderId: 'order_replay_different_tenant', idempotencyKey: 'idem_cross_tenant' };
  assert.throws(
    () => checkIdempotentReplay(storedResult, req, fp),
    /different tenantId/
  );
});
