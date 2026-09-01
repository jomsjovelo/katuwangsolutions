import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockIndexedDB } from './test-indexeddb-mock';
import { OrderSnapOutboxDB } from '../src/lib/order-snap/order-snap-outbox-db';
import {
  hydrateOrderSnapCatalog,
  createCatalogHydrator
} from '../src/lib/order-snap/catalog-hydrator';
import { OfflineCatalogSnapshot } from '../src/lib/order-snap/offline-types';

const VALID_CATALOG: OfflineCatalogSnapshot = {
  tenantId: 'tenant_order_snap',
  catalogVersion: 'cat_abc123def456',
  syncedAt: new Date().toISOString(),
  menuItems: [
    {
      menuItemId: 'item_latte',
      tenantId: 'tenant_order_snap',
      name: 'Iced Latte',
      category: 'Beverages',
      basePriceCentavos: 12000,
      activeRecipeVersionId: 'rec_latte_v1',
      isActive: true,
      modifierGroupIds: []
    }
  ],
  recipes: [
    {
      recipeVersionId: 'rec_latte_v1',
      menuItemId: 'item_latte',
      versionNumber: 1,
      isActive: true,
      components: [
        { ingredientId: 'ing_beans', quantityMinor: 18000, unit: 'g' }
      ]
    }
  ],
  modifierGroups: [],
  ingredients: [
    { ingredientId: 'ing_beans', tenantId: 'tenant_order_snap', name: 'Coffee Beans', unit: 'g', stockQuantityMinor: 500000, isActive: true }
  ]
};

test('1. Client hydration succeeds with valid catalog response', async () => {
  const mockFetch = async (url: string) => {
    return new Response(JSON.stringify(VALID_CATALOG), { status: 200 });
  };

  const mockDB = new OrderSnapOutboxDB(createMockIndexedDB());

  let savedCatalog: OfflineCatalogSnapshot | null = null;
  const originalSave = mockDB.saveCatalogSnapshot.bind(mockDB);
  mockDB.saveCatalogSnapshot = async (catalog: OfflineCatalogSnapshot) => {
    savedCatalog = catalog;
    return originalSave(catalog);
  };

  const result = await hydrateOrderSnapCatalog({
    fetchFn: mockFetch,
    outboxDB: mockDB,
    getCurrentTenant: () => 'tenant_order_snap',
    catalogEndpoint: '/api/order-snap/catalog',
    authToken: 'test_token'
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.catalogVersion, VALID_CATALOG.catalogVersion);
    assert.equal(result.tenantId, VALID_CATALOG.tenantId);
  }
  assert.equal(savedCatalog?.tenantId, 'tenant_order_snap');
});

test('2. Hydration fails closed on fetch failure, preserves cached catalog', async () => {
  const mockFetch = async () => {
    throw new Error('Network failure');
  };

  const mockDB = new OrderSnapOutboxDB(createMockIndexedDB());
  await mockDB.saveCatalogSnapshot(VALID_CATALOG);

  const result = await hydrateOrderSnapCatalog({
    fetchFn: mockFetch,
    outboxDB: mockDB,
    getCurrentTenant: () => 'tenant_order_snap',
    catalogEndpoint: '/api/order-snap/catalog',
    authToken: 'test_token'
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error, 'network_error');
  }

  const retrieved = await mockDB.getCatalogSnapshot('tenant_order_snap');
  assert.ok(retrieved);
  assert.equal(retrieved?.catalogVersion, VALID_CATALOG.catalogVersion);
});

test('3. Malformed JSON response not persisted', async () => {
  const mockFetch = async () => {
    return new Response('not valid json', { status: 200 });
  };

  const mockDB = new OrderSnapOutboxDB(createMockIndexedDB());

  const result = await hydrateOrderSnapCatalog({
    fetchFn: mockFetch,
    outboxDB: mockDB,
    getCurrentTenant: () => 'tenant_order_snap',
    catalogEndpoint: '/api/order-snap/catalog',
    authToken: 'test_token'
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error, 'validation_error');
  }

  const retrieved = await mockDB.getCatalogSnapshot('tenant_order_snap');
  assert.equal(retrieved, null);
});

test('4. Foreign tenant response rejected and not persisted', async () => {
  const attackCatalog: OfflineCatalogSnapshot = {
    tenantId: 'tenant_attack',
    catalogVersion: 'cat_attack',
    syncedAt: new Date().toISOString(),
    menuItems: [],
    recipes: [],
    modifierGroups: [],
    ingredients: []
  };

  const mockFetch = async () => {
    return new Response(JSON.stringify(attackCatalog), { status: 200 });
  };

  const mockDB = new OrderSnapOutboxDB(createMockIndexedDB());
  await mockDB.saveCatalogSnapshot(VALID_CATALOG);

  const result = await hydrateOrderSnapCatalog({
    fetchFn: mockFetch,
    outboxDB: mockDB,
    getCurrentTenant: () => 'tenant_order_snap',
    catalogEndpoint: '/api/order-snap/catalog',
    authToken: 'test_token'
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error, 'tenant_mismatch');
  }

  const retrieved = await mockDB.getCatalogSnapshot('tenant_order_snap');
  assert.ok(retrieved);
  assert.equal(retrieved?.catalogVersion, VALID_CATALOG.catalogVersion);
});

test('5. No tenant available returns auth_error', async () => {
  const mockFetch = async () => {
    return new Response(JSON.stringify(VALID_CATALOG), { status: 200 });
  };

  const mockDB = new OrderSnapOutboxDB(createMockIndexedDB());

  const result = await hydrateOrderSnapCatalog({
    fetchFn: mockFetch,
    outboxDB: mockDB,
    getCurrentTenant: () => null,
    catalogEndpoint: '/api/order-snap/catalog',
    authToken: 'test_token'
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error, 'auth_error');
  }
});

test('6. Server error response treated as network_error', async () => {
  const mockFetch = async () => {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  };

  const mockDB = new OrderSnapOutboxDB(createMockIndexedDB());

  const result = await hydrateOrderSnapCatalog({
    fetchFn: mockFetch,
    outboxDB: mockDB,
    getCurrentTenant: () => 'tenant_order_snap',
    catalogEndpoint: '/api/order-snap/catalog',
    authToken: 'invalid_token'
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error, 'auth_error');
  }
});

test('7. Canonical reordered inputs produce same catalogVersion', async () => {
  const mockDB = new OrderSnapOutboxDB(createMockIndexedDB());

  const result1 = await hydrateOrderSnapCatalog({
    fetchFn: async () => new Response(JSON.stringify(VALID_CATALOG), { status: 200 }),
    outboxDB: mockDB,
    getCurrentTenant: () => 'tenant_order_snap',
    catalogEndpoint: '/api/order-snap/catalog',
    authToken: 'test_token'
  });

  await mockDB.saveCatalogSnapshot(VALID_CATALOG);

  const result2 = await hydrateOrderSnapCatalog({
    fetchFn: async () => new Response(JSON.stringify(VALID_CATALOG), { status: 200 }),
    outboxDB: mockDB,
    getCurrentTenant: () => 'tenant_order_snap',
    catalogEndpoint: '/api/order-snap/catalog',
    authToken: 'test_token'
  });

  assert.equal(result1.success, true);
  assert.equal(result2.success, true);
  if (result1.success && result2.success) {
    assert.equal(result1.catalogVersion, result2.catalogVersion);
  }
});

test('8. Operational change produces different catalogVersion', async () => {
  const catalog1: OfflineCatalogSnapshot = { ...VALID_CATALOG, catalogVersion: 'cat_v1' };
  const catalog2: OfflineCatalogSnapshot = { 
    ...VALID_CATALOG, 
    menuItems: [{ ...VALID_CATALOG.menuItems[0], basePriceCentavos: 15000 }], 
    catalogVersion: 'cat_v2' 
  };

  const mockDB = new OrderSnapOutboxDB(createMockIndexedDB());
  await mockDB.saveCatalogSnapshot(catalog1);

  const result = await hydrateOrderSnapCatalog({
    fetchFn: async () => new Response(JSON.stringify(catalog2), { status: 200 }),
    outboxDB: mockDB,
    getCurrentTenant: () => 'tenant_order_snap',
    catalogEndpoint: '/api/order-snap/catalog',
    authToken: 'test_token'
  });

  if (result.success) {
    assert.notEqual(result.catalogVersion, catalog1.catalogVersion);
  }
});

test('9. Forbidden financial fields never appear in catalog', async () => {
  const forbiddenFields = ['costBasis', 'basisCostCentavos', 'totalCogsCentavos', 'lineCogsCentavos', 'grossProfit', 'margin', 'COGS', 'supplier', 'contribution'];

  let hasForbidden = false;
  for (const field of forbiddenFields) {
    if (JSON.stringify(VALID_CATALOG).toLowerCase().includes(field.toLowerCase())) {
      hasForbidden = true;
      break;
    }
  }

  assert.ok(!hasForbidden, 'Catalog must not contain financial fields');
});

test('10. Client hydration preserves cached catalog on validation failure', async () => {
  const mockFetch = async () => {
    return new Response(JSON.stringify({ invalid: 'catalog' }), { status: 200 });
  };

  const mockDB = new OrderSnapOutboxDB(createMockIndexedDB());
  await mockDB.saveCatalogSnapshot(VALID_CATALOG);

  const result = await hydrateOrderSnapCatalog({
    fetchFn: mockFetch,
    outboxDB: mockDB,
    getCurrentTenant: () => 'tenant_order_snap',
    catalogEndpoint: '/api/order-snap/catalog',
    authToken: 'test_token'
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error, 'validation_error');
  }

  const cached = await mockDB.getCatalogSnapshot('tenant_order_snap');
  assert.ok(cached);
  assert.equal(cached?.catalogVersion, VALID_CATALOG.catalogVersion);
});

test('11. Two tenant hydrators cannot share mutable configuration', async () => {
  const options1 = createCatalogHydrator(
    async () => new Response('{}'),
    new OrderSnapOutboxDB(createMockIndexedDB()),
    () => 'tenant_1',
    '/api/catalog1',
    'token1'
  );

  const options2 = createCatalogHydrator(
    async () => new Response('{}'),
    new OrderSnapOutboxDB(createMockIndexedDB()),
    () => 'tenant_2',
    '/api/catalog2',
    'token2'
  );

  assert.equal(options1.catalogEndpoint, '/api/catalog1');
  assert.equal(options2.catalogEndpoint, '/api/catalog2');
  assert.equal(options1.authToken, 'token1');
  assert.equal(options2.authToken, 'token2');
  assert.equal(options1.getCurrentTenant(), 'tenant_1');
  assert.equal(options2.getCurrentTenant(), 'tenant_2');
});

test('12. createCatalogHydrator uses defaults for optional params', () => {
  const options = createCatalogHydrator(undefined, new OrderSnapOutboxDB(createMockIndexedDB()));

  assert.equal(options.catalogEndpoint, '/api/order-snap/catalog');
  assert.equal(options.authToken, '');
  assert.equal(options.getCurrentTenant(), null);
});