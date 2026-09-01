import test from 'node:test';
import assert from 'node:assert/strict';

import {
  projectBentaProductCostPosition,
  type BentaProductCostingInput,
} from '../src/lib/shared/benta-inventory-costing-adapter';

test('projects a legacy discrete Benta product', () => {
  const projection = projectBentaProductCostPosition({
    quantityMode: 'discrete',
    currentStock: 5,
    costPrice: 2000,
  });

  assert.equal(projection.quantityMode, 'discrete');
  assert.equal(projection.source, 'legacy-derived');
  assert.equal(projection.position.quantityMinor, 5);
  assert.equal(projection.position.quantityScale, 0);
  assert.equal(projection.position.inventoryValueCentavos, 10000);
  assert.equal(projection.position.averageUnitCostCentavos, 2000);
});

test('projects a legacy measured Benta product', () => {
  const projection = projectBentaProductCostPosition({
    quantityMode: 'measured',
    currentStock: 999,
    stockQuantityMinor: 2000,
    quantityScale: 3,
    costPrice: 50000,
  });

  assert.equal(projection.quantityMode, 'measured');
  assert.equal(projection.source, 'legacy-derived');
  assert.equal(projection.position.quantityMinor, 2000);
  assert.equal(projection.position.quantityScale, 3);
  assert.equal(projection.position.inventoryValueCentavos, 100000);
  assert.equal(projection.position.averageUnitCostCentavos, 50000);
});

test('gives the exact inventory pool precedence', () => {
  const projection = projectBentaProductCostPosition({
    currentStock: 3,
    costPrice: 9999,
    averageUnitCostCentavos: 33,
    inventoryValueCentavos: 100,
  });

  assert.equal(projection.source, 'exact-pool');
  assert.equal(projection.position.inventoryValueCentavos, 100);
  assert.equal(projection.position.averageUnitCostCentavos, 33);
  assert.notEqual(projection.position.inventoryValueCentavos, 3 * 9999);
  assert.notEqual(projection.position.averageUnitCostCentavos, 9999);
});

test('zero legacy stock ignores stale cost', () => {
  const projection = projectBentaProductCostPosition({
    currentStock: 0,
    costPrice: 50000,
  });

  assert.equal(projection.position.inventoryValueCentavos, 0);
  assert.equal(projection.position.averageUnitCostCentavos, 0);
});

test('fails closed for invalid measured inventory', () => {
  assert.throws(
    () => projectBentaProductCostPosition({
      quantityMode: 'measured',
      currentStock: 10,
      costPrice: 1000,
    }),
    /stockQuantityMinor is required for measured inventory/
  );

  assert.throws(
    () => projectBentaProductCostPosition({
      quantityMode: 'measured',
      currentStock: 10,
      stockQuantityMinor: 1000,
      quantityScale: 2,
      costPrice: 1000,
    }),
    /quantityScale must be 3 for measured inventory/
  );

  assert.throws(
    () => projectBentaProductCostPosition({
      quantityMode: 'measured',
      currentStock: 10,
      stockQuantityMinor: -1,
      quantityScale: 3,
      costPrice: 1000,
    }),
    /stockQuantityMinor must be a non-negative safe integer/
  );

  assert.throws(
    () => projectBentaProductCostPosition({
      quantityMode: 'measured',
      currentStock: 10,
      stockQuantityMinor: Number.MAX_SAFE_INTEGER + 1,
      quantityScale: 3,
      costPrice: 1000,
    }),
    /stockQuantityMinor must be a non-negative safe integer/
  );
});

test('fails closed for invalid discrete inventory', () => {
  assert.throws(
    () => projectBentaProductCostPosition({
      currentStock: -1,
      costPrice: 1000,
    }),
    /currentStock must be a non-negative safe integer/
  );

  assert.throws(
    () => projectBentaProductCostPosition({
      currentStock: Number.MAX_SAFE_INTEGER + 1,
      costPrice: 1000,
    }),
    /currentStock must be a non-negative safe integer/
  );

  assert.throws(
    () => projectBentaProductCostPosition({
      currentStock: 5,
      costPrice: -1,
    }),
    /costPrice must be a non-negative safe integer/
  );

  assert.throws(
    () => projectBentaProductCostPosition({
      currentStock: 5,
      costPrice: Number.MAX_SAFE_INTEGER + 1,
    }),
    /costPrice must be a non-negative safe integer/
  );
});

test('fails closed for invalid exact pools and overflow', () => {
  assert.throws(
    () => projectBentaProductCostPosition({
      currentStock: 5,
      costPrice: 1000,
      inventoryValueCentavos: -100,
      averageUnitCostCentavos: 1000,
    }),
    /inventoryValueCentavos must be a non-negative safe integer/
  );

  assert.throws(
    () => projectBentaProductCostPosition({
      currentStock: 5,
      costPrice: 1000,
      inventoryValueCentavos: Number.MAX_SAFE_INTEGER + 1,
      averageUnitCostCentavos: 1000,
    }),
    /inventoryValueCentavos must be a non-negative safe integer/
  );

  assert.throws(
    () => projectBentaProductCostPosition({
      currentStock: 0,
      costPrice: 1000,
      inventoryValueCentavos: 500,
      averageUnitCostCentavos: 0,
    }),
    /Zero quantity requires zero inventory value/
  );

  assert.throws(
    () => projectBentaProductCostPosition({
      currentStock: 5,
      costPrice: 1000,
      inventoryValueCentavos: 5000,
    }),
    /Partial exact-pool costing fields/
  );

  assert.throws(
    () => projectBentaProductCostPosition({
      currentStock: Number.MAX_SAFE_INTEGER,
      costPrice: 2,
    }),
    /inventoryValueCentavos exceeded safe integer bounds/
  );
});

test('does not mutate the product and returns frozen projections', () => {
  const product: BentaProductCostingInput = {
    quantityMode: 'discrete',
    currentStock: 5,
    costPrice: 2000,
  };

  assert.equal(Object.isFrozen(product), false);

  const projection = projectBentaProductCostPosition(product);

  assert.equal(Object.isFrozen(product), false);
  assert.deepEqual(product, {
    quantityMode: 'discrete',
    currentStock: 5,
    costPrice: 2000,
  });
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.position), true);
  assert.notEqual(projection.position, product);
});
