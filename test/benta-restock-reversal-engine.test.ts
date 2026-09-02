import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BentaRestockReversalEngineError,
  evaluateBentaRestockReversalEligibility,
  type BentaRestockReversalInput,
} from '../src/lib/shared/benta-restock-reversal-engine';
import { buildInventoryCostPosition } from '../src/lib/shared/inventory-costing';

function makeDiscretePrev(qty: number, value: number) {
  return buildInventoryCostPosition(qty, 0, value);
}

function makeDiscreteResult(qty: number, value: number) {
  return buildInventoryCostPosition(qty, 0, value);
}

function makeMeasuredPrev(qty: number, value: number) {
  return buildInventoryCostPosition(qty, 3, value);
}

function makeMeasuredResult(qty: number, value: number) {
  return buildInventoryCostPosition(qty, 3, value);
}

function baseDiscreteInput(
  overrides: Partial<BentaRestockReversalInput> = {},
): BentaRestockReversalInput {
  return {
    productId: 'prod_123',
    quantityMode: 'discrete',
    currentPosition: makeDiscreteResult(15, 34000),
    storedPreviousPosition: makeDiscretePrev(5, 10000),
    storedResultingPosition: makeDiscreteResult(15, 34000),
    purchasedQuantityMinor: 10,
    supplierCostCentavos: 24000,
    freightCentavos: 0,
    otherAcquisitionCostCentavos: 0,
    ...overrides,
  };
}

test('discrete exact lossless reversal: restores previous position and removes correct quantity and value', () => {
  const input = baseDiscreteInput();
  const result = evaluateBentaRestockReversalEligibility(input);

  assert.equal(result.productId, 'prod_123');
  assert.equal(result.restoredPosition.quantityMinor, 5);
  assert.equal(result.restoredPosition.inventoryValueCentavos, 10000);
  assert.equal(result.restoredPosition.averageUnitCostCentavos, 2000);
  assert.equal(result.removedQuantityMinor, 10);
  assert.equal(result.removedInventoryValueCentavos, 24000);
  assert.equal(result.recomputedLandedCostCentavos, 24000);
});

test('discrete with freight and other acquisition costs: removed value includes all acquisition costs', () => {
  const input = baseDiscreteInput({
    currentPosition: makeDiscreteResult(15, 35500),
    storedPreviousPosition: makeDiscretePrev(5, 10000),
    storedResultingPosition: makeDiscreteResult(15, 35500),
    purchasedQuantityMinor: 10,
    supplierCostCentavos: 24000,
    freightCentavos: 1000,
    otherAcquisitionCostCentavos: 500,
  });
  const result = evaluateBentaRestockReversalEligibility(input);

  assert.equal(result.removedQuantityMinor, 10);
  assert.equal(result.recomputedLandedCostCentavos, 25500);
  assert.equal(result.removedInventoryValueCentavos, 25500);
  assert.equal(result.restoredPosition.inventoryValueCentavos, 10000);
});

test('measured scale-3 exact lossless reversal: restores previous measured position', () => {
  const input: BentaRestockReversalInput = {
    productId: 'prod_rice',
    quantityMode: 'measured',
    currentPosition: makeMeasuredResult(7000, 375000),
    storedPreviousPosition: makeMeasuredPrev(2000, 100000),
    storedResultingPosition: makeMeasuredResult(7000, 375000),
    purchasedQuantityMinor: 5000,
    supplierCostCentavos: 275000,
    freightCentavos: 0,
    otherAcquisitionCostCentavos: 0,
  };

  const result = evaluateBentaRestockReversalEligibility(input);

  assert.equal(result.restoredPosition.quantityMinor, 2000);
  assert.equal(result.restoredPosition.inventoryValueCentavos, 100000);
  assert.equal(result.restoredPosition.quantityScale, 3);
  assert.equal(result.removedQuantityMinor, 5000);
  assert.equal(result.recomputedLandedCostCentavos, 275000);
});

test('zero previous quantity and value: reversal restores to zero', () => {
  const input: BentaRestockReversalInput = {
    productId: 'prod_new',
    quantityMode: 'discrete',
    currentPosition: makeDiscreteResult(10, 24000),
    storedPreviousPosition: makeDiscretePrev(0, 0),
    storedResultingPosition: makeDiscreteResult(10, 24000),
    purchasedQuantityMinor: 10,
    supplierCostCentavos: 24000,
    freightCentavos: 0,
    otherAcquisitionCostCentavos: 0,
  };

  const result = evaluateBentaRestockReversalEligibility(input);

  assert.equal(result.restoredPosition.quantityMinor, 0);
  assert.equal(result.restoredPosition.inventoryValueCentavos, 0);
  assert.equal(result.removedQuantityMinor, 10);
  assert.equal(result.removedInventoryValueCentavos, 24000);
});

test('previous latest cost restored when provided', () => {
  const input = baseDiscreteInput({
    previousLatestPurchaseUnitCostCentavos: 2000,
  });

  const result = evaluateBentaRestockReversalEligibility(input);

  assert.equal(result.latestPurchaseCostRestoration.policy, 'restore');
  assert.equal(result.latestPurchaseCostRestoration.value, 2000);
});

test('previously absent latest cost produces delete policy', () => {
  const input = baseDiscreteInput({
    previousLatestPurchaseUnitCostCentavos: undefined,
  });

  const result = evaluateBentaRestockReversalEligibility(input);

  assert.equal(result.latestPurchaseCostRestoration.policy, 'delete');
});

test('current quantity changed: POSITION_CHANGED error', () => {
  const input = baseDiscreteInput({
    currentPosition: makeDiscreteResult(16, 34000),
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'POSITION_CHANGED',
  );
});

test('current inventory value changed: POSITION_CHANGED error', () => {
  const input = baseDiscreteInput({
    currentPosition: makeDiscreteResult(15, 35000),
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'POSITION_CHANGED',
  );
});

test('current position differs from stored resulting position: POSITION_CHANGED error', () => {
  const input = baseDiscreteInput({
    currentPosition: makeDiscreteResult(15, 35000),
    storedResultingPosition: makeDiscreteResult(15, 34000),
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'POSITION_CHANGED',
  );
});

test('malformed stored previous position: MALFORMED_POSITION error', () => {
  const input = baseDiscreteInput({
    storedPreviousPosition: makeDiscretePrev(5, 10000),
  });

  try {
    buildInventoryCostPosition(5, 0, 9999);
    assert.fail('Expected buildInventoryCostPosition to throw');
  } catch {
  }

  const inconsistentPosition = Object.freeze({
    quantityMinor: 5,
    quantityScale: 0 as const,
    inventoryValueCentavos: 10000,
    averageUnitCostCentavos: 9999,
  });

  const badInput = baseDiscreteInput({
    storedPreviousPosition: inconsistentPosition,
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(badInput),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'MALFORMED_POSITION',
  );
});

test('malformed stored resulting position: MALFORMED_POSITION error', () => {
  const inconsistentPosition = Object.freeze({
    quantityMinor: 15,
    quantityScale: 0 as const,
    inventoryValueCentavos: 34000,
    averageUnitCostCentavos: 9999,
  });

  const input = baseDiscreteInput({
    storedResultingPosition: inconsistentPosition,
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'MALFORMED_POSITION',
  );
});

test('recomputed history mismatch: HISTORY_INTEGRITY_ERROR error', () => {
  const input = baseDiscreteInput({
    currentPosition: makeDiscreteResult(15, 33000),
    storedResultingPosition: makeDiscreteResult(15, 33000),
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'HISTORY_INTEGRITY_ERROR',
  );
});

test('incorrect landed cost evidence: HISTORY_INTEGRITY_ERROR error', () => {
  const input = baseDiscreteInput({
    supplierCostCentavos: 23000,
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'HISTORY_INTEGRITY_ERROR',
  );
});

test('scale mismatch discrete vs measured: SCALE_MISMATCH error', () => {
  const input: BentaRestockReversalInput = {
    productId: 'prod_123',
    quantityMode: 'discrete',
    currentPosition: makeMeasuredResult(7000, 375000),
    storedPreviousPosition: makeMeasuredPrev(2000, 100000),
    storedResultingPosition: makeMeasuredResult(7000, 375000),
    purchasedQuantityMinor: 5000,
    supplierCostCentavos: 275000,
  };

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'SCALE_MISMATCH',
  );
});

test('unsupported quantity mode: INVALID_INPUT error', () => {
  const input = { ...baseDiscreteInput(), quantityMode: 'bulk' };

  assert.throws(
    () => Reflect.apply(evaluateBentaRestockReversalEligibility, undefined, [input]),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'INVALID_INPUT',
  );
});

test('non-object position: MALFORMED_POSITION error instead of raw TypeError', () => {
  const input = { ...baseDiscreteInput(), currentPosition: null };

  assert.throws(
    () => Reflect.apply(evaluateBentaRestockReversalEligibility, undefined, [input]),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'MALFORMED_POSITION',
  );
});

test('shared-helper overflow is translated to MALFORMED_POSITION', () => {
  const overflowingPosition = {
    quantityMinor: 1,
    quantityScale: 3 as const,
    inventoryValueCentavos: Number.MAX_SAFE_INTEGER,
    averageUnitCostCentavos: Number.MAX_SAFE_INTEGER,
  };
  const input = {
    productId: 'prod_overflow',
    quantityMode: 'measured' as const,
    currentPosition: overflowingPosition,
    storedPreviousPosition: makeMeasuredPrev(0, 0),
    storedResultingPosition: overflowingPosition,
    purchasedQuantityMinor: 1,
    supplierCostCentavos: Number.MAX_SAFE_INTEGER,
  };

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'MALFORMED_POSITION',
  );
});

test('negative purchased quantity: INVALID_INPUT error', () => {
  const input = baseDiscreteInput({
    purchasedQuantityMinor: -5,
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'INVALID_INPUT',
  );
});

test('fractional purchased quantity: INVALID_INPUT error', () => {
  const input = baseDiscreteInput({
    purchasedQuantityMinor: 5.5 as unknown as number,
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'INVALID_INPUT',
  );
});

test('negative supplier cost: INVALID_INPUT error', () => {
  const input = baseDiscreteInput({
    supplierCostCentavos: -1000,
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'INVALID_INPUT',
  );
});

test('unsafe integer inputs: INVALID_INPUT error', () => {
  const input = baseDiscreteInput({
    purchasedQuantityMinor: Number.MAX_SAFE_INTEGER + 1,
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'INVALID_INPUT',
  );
});

test('zero current position with positive value: MALFORMED_POSITION error', () => {
  const zeroWithValue = Object.freeze({
    quantityMinor: 0,
    quantityScale: 0 as const,
    inventoryValueCentavos: 1000,
    averageUnitCostCentavos: 1000,
  });

  const input = baseDiscreteInput({
    currentPosition: zeroWithValue,
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'MALFORMED_POSITION',
  );
});

test('empty product ID: INVALID_INPUT error', () => {
  const input = baseDiscreteInput({
    productId: '',
  });

  assert.throws(
    () => evaluateBentaRestockReversalEligibility(input),
    (err: unknown) =>
      err instanceof BentaRestockReversalEngineError &&
      err.code === 'INVALID_INPUT',
  );
});

test('result is deeply frozen', () => {
  const input = baseDiscreteInput({
    previousLatestPurchaseUnitCostCentavos: 2000,
  });

  const result = evaluateBentaRestockReversalEligibility(input);

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.restoredPosition), true);
  assert.equal(Object.isFrozen(result.latestPurchaseCostRestoration), true);
});

test('caller inputs remain mutable and unchanged', () => {
  const input: BentaRestockReversalInput = {
    productId: 'prod_mutable',
    quantityMode: 'discrete',
    currentPosition: {
      quantityMinor: 15,
      quantityScale: 0,
      inventoryValueCentavos: 34000,
      averageUnitCostCentavos: 2267,
    },
    storedPreviousPosition: {
      quantityMinor: 5,
      quantityScale: 0,
      inventoryValueCentavos: 10000,
      averageUnitCostCentavos: 2000,
    },
    storedResultingPosition: {
      quantityMinor: 15,
      quantityScale: 0,
      inventoryValueCentavos: 34000,
      averageUnitCostCentavos: 2267,
    },
    purchasedQuantityMinor: 10,
    supplierCostCentavos: 24000,
  };
  const copyOfInput = structuredClone(input);

  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.currentPosition), false);
  evaluateBentaRestockReversalEligibility(input);

  assert.deepEqual(input, copyOfInput);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.currentPosition), false);
});

test('deterministic: same inputs produce identical results', () => {
  const input = baseDiscreteInput({
    previousLatestPurchaseUnitCostCentavos: 2000,
  });

  const result1 = evaluateBentaRestockReversalEligibility(input);
  const result2 = evaluateBentaRestockReversalEligibility(input);

  assert.deepEqual(result1, result2);
});

test('resultingPosition exactly equals previousPosition on success', () => {
  const input = baseDiscreteInput({
    previousLatestPurchaseUnitCostCentavos: 2000,
  });

  const result = evaluateBentaRestockReversalEligibility(input);

  assert.equal(result.restoredPosition.quantityMinor, 5);
  assert.equal(result.restoredPosition.inventoryValueCentavos, 10000);
  assert.equal(result.restoredPosition.averageUnitCostCentavos, 2000);
});
