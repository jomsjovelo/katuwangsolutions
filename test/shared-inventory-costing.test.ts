import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInventoryCostPosition,
  applyMovingAverageRestock,
  consumeInventoryAtAverageCost,
  buildInventoryRestockEvent,
  analyzeInventoryProfitabilityImpact,
} from '../src/lib/shared/inventory-costing';

test('builds a frozen discrete inventory cost position', () => {
  const pos = buildInventoryCostPosition(5, 0, 10000);
  assert.equal(pos.quantityMinor, 5);
  assert.equal(pos.quantityScale, 0);
  assert.equal(pos.inventoryValueCentavos, 10000);
  assert.equal(pos.averageUnitCostCentavos, 2000);
  assert.equal(Object.isFrozen(pos), true);
});

test('applies the canonical moving-average restock example', () => {
  const prev = buildInventoryCostPosition(5, 0, 10000);
  const result = applyMovingAverageRestock({
    previousPosition: prev,
    purchasedQuantityMinor: 10,
    supplierCostCentavos: 24000,
  });

  assert.equal(result.resultingPosition.quantityMinor, 15);
  assert.equal(result.resultingPosition.inventoryValueCentavos, 34000);
  assert.equal(result.resultingPosition.averageUnitCostCentavos, 2267);
  assert.equal(result.latestPurchaseUnitCostCentavos, 2400);
  assert.equal(result.landedCostCentavos, 24000);
  assert.equal(result.costMovement, 'increased');
});

test('zero stock establishes a new cost basis', () => {
  const prev = buildInventoryCostPosition(0, 0, 0);
  const result = applyMovingAverageRestock({
    previousPosition: prev,
    purchasedQuantityMinor: 5,
    supplierCostCentavos: 10000,
  });

  assert.equal(result.resultingPosition.quantityMinor, 5);
  assert.equal(result.resultingPosition.inventoryValueCentavos, 10000);
  assert.equal(result.resultingPosition.averageUnitCostCentavos, 2000);
  assert.equal(result.latestPurchaseUnitCostCentavos, 2000);
  assert.equal(result.costMovement, 'unchanged');
});

test('supports scale-three measured restocking', () => {
  const prev = buildInventoryCostPosition(2000, 3, 100000);
  const result = applyMovingAverageRestock({
    previousPosition: prev,
    purchasedQuantityMinor: 5000,
    supplierCostCentavos: 275000,
  });

  assert.equal(result.resultingPosition.quantityMinor, 7000);
  assert.equal(result.resultingPosition.inventoryValueCentavos, 375000);
  assert.equal(result.resultingPosition.averageUnitCostCentavos, 53571);
  assert.equal(result.latestPurchaseUnitCostCentavos, 55000);
  assert.equal(result.costMovement, 'increased');
});

test('includes freight and other acquisition costs', () => {
  const prev = buildInventoryCostPosition(0, 3, 0);
  const result = applyMovingAverageRestock({
    previousPosition: prev,
    purchasedQuantityMinor: 10000,
    supplierCostCentavos: 95000,
    freightCentavos: 10000,
    otherAcquisitionCostCentavos: 5000,
  });

  assert.equal(result.landedCostCentavos, 110000);
  assert.equal(result.resultingPosition.averageUnitCostCentavos, 11000);
  assert.equal(result.latestPurchaseUnitCostCentavos, 11000);
});

test('classifies movement using exact rational averages', () => {
  const prev = buildInventoryCostPosition(5, 0, 10000);
  const expensive = applyMovingAverageRestock({
    previousPosition: prev,
    purchasedQuantityMinor: 10,
    supplierCostCentavos: 50000,
  });
  assert.equal(expensive.costMovement, 'increased');

  const cheap = applyMovingAverageRestock({
    previousPosition: prev,
    purchasedQuantityMinor: 10,
    supplierCostCentavos: 10000,
  });
  assert.equal(cheap.costMovement, 'decreased');

  const same = applyMovingAverageRestock({
    previousPosition: prev,
    purchasedQuantityMinor: 10,
    supplierCostCentavos: 20000,
  });
  assert.equal(same.costMovement, 'unchanged');

  const concealedPrevious = buildInventoryCostPosition(3, 0, 100);
  assert.equal(concealedPrevious.averageUnitCostCentavos, 33);
  const concealed = applyMovingAverageRestock({
    previousPosition: concealedPrevious,
    purchasedQuantityMinor: 3,
    supplierCostCentavos: 96,
  });
  assert.equal(concealedPrevious.averageUnitCostCentavos, 33);
  assert.equal(concealed.resultingPosition.averageUnitCostCentavos, 33);
  assert.equal(concealed.costMovement, 'decreased');
});

test('partial consumption conserves the exact integer pool', () => {
  const pos = buildInventoryCostPosition(3, 0, 100);
  const result = consumeInventoryAtAverageCost({
    position: pos,
    consumedQuantityMinor: 1,
  });

  assert.equal(result.consumedQuantityMinor, 1);
  assert.equal(result.consumedCostCentavos, 33);
  assert.equal(result.consumptionUnitCostCentavos, 33);
  assert.equal(result.remainingPosition.quantityMinor, 2);
  assert.equal(result.remainingPosition.inventoryValueCentavos, 67);
  assert.equal(result.remainingPosition.averageUnitCostCentavos, 34);
  assert.equal(result.consumedCostCentavos + result.remainingPosition.inventoryValueCentavos, 100);
});

test('full consumption produces exactly zero quantity and value', () => {
  const pos = buildInventoryCostPosition(15, 0, 34000);
  const result = consumeInventoryAtAverageCost({
    position: pos,
    consumedQuantityMinor: 15,
  });

  assert.equal(result.consumedQuantityMinor, 15);
  assert.equal(result.consumedCostCentavos, 34000);
  assert.equal(result.remainingPosition.quantityMinor, 0);
  assert.equal(result.remainingPosition.inventoryValueCentavos, 0);
  assert.equal(result.remainingPosition.averageUnitCostCentavos, 0);
});

test('does not mutate or freeze caller-owned inputs', () => {
  const manualPrev = {
    quantityMinor: 5,
    quantityScale: 0,
    inventoryValueCentavos: 10000,
    averageUnitCostCentavos: 2000,
  };
  assert.equal(Object.isFrozen(manualPrev), false);

  const restockResult = applyMovingAverageRestock({
    previousPosition: manualPrev,
    purchasedQuantityMinor: 10,
    supplierCostCentavos: 24000,
  });

  assert.equal(Object.isFrozen(manualPrev), false);
  assert.deepEqual(manualPrev, { quantityMinor: 5, quantityScale: 0, inventoryValueCentavos: 10000, averageUnitCostCentavos: 2000 });
  assert.notEqual(restockResult.previousPosition, manualPrev);
  assert.equal(Object.isFrozen(restockResult), true);
  assert.equal(Object.isFrozen(restockResult.previousPosition), true);
  assert.equal(Object.isFrozen(restockResult.resultingPosition), true);

  const manualPos = {
    quantityMinor: 5,
    quantityScale: 0,
    inventoryValueCentavos: 10000,
    averageUnitCostCentavos: 2000,
  };
  assert.equal(Object.isFrozen(manualPos), false);

  const consumeResult = consumeInventoryAtAverageCost({
    position: manualPos,
    consumedQuantityMinor: 3,
  });

  assert.equal(Object.isFrozen(manualPos), false);
  assert.deepEqual(manualPos, { quantityMinor: 5, quantityScale: 0, inventoryValueCentavos: 10000, averageUnitCostCentavos: 2000 });
  assert.equal(Object.isFrozen(consumeResult), true);
  assert.equal(Object.isFrozen(consumeResult.remainingPosition), true);
});

test('accepts a large BigInt intermediate when the final value is safe', () => {
  const pos = buildInventoryCostPosition(1000, 3, 10_000_000_000_000);
  assert.equal(pos.averageUnitCostCentavos, 10_000_000_000_000);
});

test('fails closed for invalid quantity scales and consumption', () => {
  const valid = buildInventoryCostPosition(5, 0, 10000);

  const failures: Array<{ label: string; fn: () => void }> = [
    {
      label: 'runtime scale 2 via Reflect.apply',
      fn: () => Reflect.apply(buildInventoryCostPosition, null, [5, 2, 10000]),
    },
    {
      label: 'negative quantity',
      fn: () => buildInventoryCostPosition(-5, 0, 10000),
    },
    {
      label: 'negative inventory value',
      fn: () => buildInventoryCostPosition(5, 0, -10000),
    },
    {
      label: 'zero purchased quantity',
      fn: () => applyMovingAverageRestock({ previousPosition: valid, purchasedQuantityMinor: 0, supplierCostCentavos: 10000 }),
    },
    {
      label: 'consumption exceeding stock',
      fn: () => consumeInventoryAtAverageCost({ position: valid, consumedQuantityMinor: 6 }),
    },
    {
      label: 'zero consumed quantity',
      fn: () => consumeInventoryAtAverageCost({ position: valid, consumedQuantityMinor: 0 }),
    },
  ];

  for (const { label, fn } of failures) {
    assert.throws(fn, new RegExp('.'), label);
  }
});

test('fails closed for unsafe integers and overflowing restocks', () => {
  assert.throws(
    () => buildInventoryCostPosition(Number.MAX_SAFE_INTEGER + 1, 0, 10000),
    /must be a safe integer/
  );

  const maxPrev = buildInventoryCostPosition(1, 0, Number.MAX_SAFE_INTEGER);
  assert.throws(
    () => applyMovingAverageRestock({ previousPosition: maxPrev, purchasedQuantityMinor: 1, supplierCostCentavos: 1 }),
    /exceeded safe integer bounds/
  );
});

test('builds a deterministic restock event snapshot', () => {
  const prev = buildInventoryCostPosition(5, 0, 10000);
  const restockInput = {
    previousPosition: prev,
    purchasedQuantityMinor: 10,
    supplierCostCentavos: 24000,
  };

  const eventInput = {
    eventId: 'event_123',
    idempotencyKey: 'idemp_123',
    inventoryItemId: 'item_123',
    occurredAtEpochMs: 1700000000000,
    restock: restockInput,
  };

  const event1 = buildInventoryRestockEvent(eventInput);
  const event2 = buildInventoryRestockEvent(eventInput);

  assert.deepEqual(event1, event2);
  assert.equal(event1.eventId, 'event_123');
  assert.equal(event1.idempotencyKey, 'idemp_123');
  assert.equal(event1.inventoryItemId, 'item_123');
  assert.equal(event1.occurredAtEpochMs, 1700000000000);
  assert.equal(event1.purchasedQuantityMinor, 10);
  assert.equal(event1.supplierCostCentavos, 24000);
  assert.equal(event1.freightCentavos, 0);
  assert.equal(event1.otherAcquisitionCostCentavos, 0);
  assert.equal(event1.landedCostCentavos, 24000);
  assert.equal(event1.latestPurchaseUnitCostCentavos, 2400);
  assert.equal(event1.resultingPosition.quantityMinor, 15);
  assert.equal(event1.resultingPosition.inventoryValueCentavos, 34000);
  assert.equal(event1.resultingPosition.averageUnitCostCentavos, 2267);
  assert.equal(event1.costMovement, 'increased');
});

test('preserves valid identifier whitespace and rejects invalid identifiers', () => {
  const prev = buildInventoryCostPosition(5, 0, 10000);
  const restockInput = {
    previousPosition: prev,
    purchasedQuantityMinor: 10,
    supplierCostCentavos: 24000,
  };

  const paddedInput = {
    eventId: ' event_123 ',
    idempotencyKey: '\tidemp_123\t',
    inventoryItemId: ' item_123 ',
    occurredAtEpochMs: 1700000000000,
    restock: restockInput,
  };

  const paddedEvent = buildInventoryRestockEvent(paddedInput);
  assert.equal(paddedEvent.eventId, ' event_123 ');
  assert.equal(paddedEvent.idempotencyKey, '\tidemp_123\t');
  assert.equal(paddedEvent.inventoryItemId, ' item_123 ');

  const base = { occurredAtEpochMs: 0, restock: restockInput } as const;
  assert.throws(
    () => buildInventoryRestockEvent({ ...base, eventId: '', idempotencyKey: 'idem', inventoryItemId: 'item' }),
    /eventId must be a non-empty string/
  );
  assert.throws(
    () => buildInventoryRestockEvent({ ...base, eventId: 'evt', idempotencyKey: '   ', inventoryItemId: 'item' }),
    /idempotencyKey must be a non-empty string/
  );
  assert.throws(
    () => buildInventoryRestockEvent({ ...base, eventId: 'evt', idempotencyKey: 'idem', inventoryItemId: '\n\t' }),
    /inventoryItemId must be a non-empty string/
  );
  assert.throws(
    () => Reflect.apply(buildInventoryRestockEvent, null, [{ ...base, eventId: 123, idempotencyKey: 'idem', inventoryItemId: 'item' }]),
    /eventId must be a non-empty string/
  );
  assert.throws(
    () => buildInventoryRestockEvent({ ...base, eventId: 'evt', idempotencyKey: 'idem', inventoryItemId: 'item', occurredAtEpochMs: -1 }),
    /occurredAtEpochMs cannot be negative/
  );
  assert.throws(
    () => buildInventoryRestockEvent({ ...base, eventId: 'evt', idempotencyKey: 'idem', inventoryItemId: 'item', occurredAtEpochMs: Number.MAX_SAFE_INTEGER + 1 }),
    /occurredAtEpochMs must be a safe integer/
  );
});

test('does not mutate event input and deeply freezes the event snapshot', () => {
  const manualPrev = {
    quantityMinor: 5,
    quantityScale: 0,
    inventoryValueCentavos: 10000,
    averageUnitCostCentavos: 2000,
  };
  assert.equal(Object.isFrozen(manualPrev), false);

  const manualRestock = {
    previousPosition: manualPrev,
    purchasedQuantityMinor: 10,
    supplierCostCentavos: 24000,
  };
  assert.equal(Object.isFrozen(manualRestock), false);

  const manualEventInput = {
    eventId: 'evt',
    idempotencyKey: 'idem',
    inventoryItemId: 'item',
    occurredAtEpochMs: 1700000000000,
    restock: manualRestock,
  };
  assert.equal(Object.isFrozen(manualEventInput), false);

  const event = buildInventoryRestockEvent(manualEventInput);

  assert.equal(Object.isFrozen(manualPrev), false);
  assert.deepEqual(manualPrev, { quantityMinor: 5, quantityScale: 0, inventoryValueCentavos: 10000, averageUnitCostCentavos: 2000 });
  assert.equal(Object.isFrozen(manualRestock), false);
  assert.deepEqual(manualRestock, { previousPosition: manualPrev, purchasedQuantityMinor: 10, supplierCostCentavos: 24000 });
  assert.equal(Object.isFrozen(manualEventInput), false);
  assert.deepEqual(manualEventInput, { eventId: 'evt', idempotencyKey: 'idem', inventoryItemId: 'item', occurredAtEpochMs: 1700000000000, restock: manualRestock });

  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.previousPosition), true);
  assert.equal(Object.isFrozen(event.resultingPosition), true);
  assert.notEqual(event.previousPosition, manualPrev);
});

test('analyzes profitability without changing the selling price', () => {
  const resultingPosition = buildInventoryCostPosition(15, 0, 34000);
  const impact = analyzeInventoryProfitabilityImpact({
    resultingPosition,
    currentSellingPriceCentavos: 5000,
    costMovement: 'increased',
  });

  assert.equal(impact.currentSellingPriceCentavos, 5000);
  assert.equal(impact.costPerSellingUnitCentavos, 2267);
  assert.equal(impact.breakEvenSellingPriceCentavos, 2267);
  assert.equal(impact.unitGrossProfitCentavos, 2733);
  assert.equal(impact.markupPercent, 120.56);
  assert.equal(impact.grossMarginPercent, 54.66);
  assert.equal(impact.costMovement, 'increased');
  assert.equal(Object.isFrozen(impact), true);
});

test('returns fresh frozen margin scenarios including a valid custom target', () => {
  const resultingPosition = {
    quantityMinor: 15,
    quantityScale: 0,
    inventoryValueCentavos: 34000,
    averageUnitCostCentavos: 2267,
  };
  assert.equal(Object.isFrozen(resultingPosition), false);

  const input = {
    resultingPosition,
    currentSellingPriceCentavos: 5000,
    costMovement: 'increased' as const,
    customTargetMarginPercent: 40,
  };

  const impact1 = analyzeInventoryProfitabilityImpact(input);
  const impact2 = analyzeInventoryProfitabilityImpact(input);

  assert.deepEqual(impact1, impact2);
  assert.notEqual(impact1, impact2);
  assert.notEqual(impact1.marginScenarios, impact2.marginScenarios);
  for (let i = 0; i < impact1.marginScenarios.length; i++) {
    assert.deepEqual(impact1.marginScenarios[i], impact2.marginScenarios[i]);
    assert.notEqual(impact1.marginScenarios[i], impact2.marginScenarios[i]);
  }
  assert.equal(impact1.marginScenarios.length, 4);
  const margins = impact1.marginScenarios.map(s => s.targetMarginPercent);
  assert.deepEqual(margins, [10, 20, 30, 40]);
  assert.equal(Object.isFrozen(impact1), true);
  assert.equal(Object.isFrozen(impact1.marginScenarios), true);
  for (const scenario of impact1.marginScenarios) {
    assert.equal(Object.isFrozen(scenario), true);
  }
  assert.equal(Object.isFrozen(resultingPosition), false);
  assert.deepEqual(resultingPosition, {
    quantityMinor: 15,
    quantityScale: 0,
    inventoryValueCentavos: 34000,
    averageUnitCostCentavos: 2267,
  });
  assert.equal(Object.isFrozen(input), false);

  const invalidImpact = analyzeInventoryProfitabilityImpact({
    resultingPosition: buildInventoryCostPosition(15, 0, 34000),
    currentSellingPriceCentavos: 5000,
    costMovement: 'increased',
    customTargetMarginPercent: 96,
  });
  assert.equal(invalidImpact.marginScenarios.length, 3);
  assert.deepEqual(invalidImpact.marginScenarios.map(s => s.targetMarginPercent), [10, 20, 30]);
});

test('fails closed for invalid profitability input', () => {
  const validPos = buildInventoryCostPosition(15, 0, 34000);

  assert.throws(
    () => analyzeInventoryProfitabilityImpact({ resultingPosition: validPos, currentSellingPriceCentavos: -1, costMovement: 'increased' }),
    /currentSellingPriceCentavos cannot be negative/
  );

  assert.throws(
    () => analyzeInventoryProfitabilityImpact({ resultingPosition: validPos, currentSellingPriceCentavos: Number.MAX_SAFE_INTEGER + 1, costMovement: 'increased' }),
    /currentSellingPriceCentavos must be a safe integer/
  );

  assert.throws(
    () => Reflect.apply(analyzeInventoryProfitabilityImpact, null, [{ resultingPosition: validPos, currentSellingPriceCentavos: 5000, costMovement: 'unknown' }]),
    /costMovement must be increased, decreased, or unchanged/
  );

  const inconsistentPos = { quantityMinor: 5, quantityScale: 0, inventoryValueCentavos: 10000, averageUnitCostCentavos: 9999 };
  assert.throws(
    () => analyzeInventoryProfitabilityImpact({ resultingPosition: inconsistentPos, currentSellingPriceCentavos: 5000, costMovement: 'increased' }),
    /averageUnitCostCentavos is inconsistent/
  );

  const zeroQtyPos = { quantityMinor: 0, quantityScale: 0, inventoryValueCentavos: 100, averageUnitCostCentavos: 0 };
  assert.throws(
    () => analyzeInventoryProfitabilityImpact({ resultingPosition: zeroQtyPos, currentSellingPriceCentavos: 5000, costMovement: 'increased' }),
    /Zero quantity requires zero inventory value/
  );
});
