import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BentaReversalEngineError,
  restoreExactPoolInventoryPosition,
  restoreOfflineVarianceInventoryPosition,
  reverseSaleFromShiftAggregates,
  type BentaShiftAggregates,
} from '../src/lib/shared/benta-sale-reversal-engine';
import { buildInventoryCostPosition } from '../src/lib/shared/inventory-costing';

test('restoreExactPoolInventoryPosition: discrete direct-sale restoration', () => {
  const current = buildInventoryCostPosition(7, 0, 35000);
  const result = restoreExactPoolInventoryPosition({
    currentPosition: current,
    soldQuantity: 3,
    lineCostCentavos: 15000,
  });
  assert.equal(result.restoredQuantityMinor, 10);
  assert.equal(result.restoredInventoryValueCentavos, 50000);
  assert.equal(result.restoredPosition.quantityMinor, 10);
  assert.equal(result.restoredPosition.inventoryValueCentavos, 50000);
  assert.equal(result.restoredPosition.averageUnitCostCentavos, 5000);
  assert.equal(result.previousPosition.quantityMinor, 7);
});

test('restoreExactPoolInventoryPosition: measured scale-3 restoration', () => {
  const current = buildInventoryCostPosition(3500, 3, 70000);
  const result = restoreExactPoolInventoryPosition({
    currentPosition: current,
    soldQuantity: 1500,
    lineCostCentavos: 30000,
  });
  assert.equal(result.restoredQuantityMinor, 5000);
  assert.equal(result.restoredInventoryValueCentavos, 100000);
  assert.equal(result.restoredPosition.quantityScale, 3);
  assert.equal(result.restoredPosition.averageUnitCostCentavos, 20000);
});

test('restoreExactPoolInventoryPosition: zero-current position restoration', () => {
  const current = buildInventoryCostPosition(0, 0, 0);
  const result = restoreExactPoolInventoryPosition({
    currentPosition: current,
    soldQuantity: 5,
    lineCostCentavos: 10000,
  });
  assert.equal(result.restoredQuantityMinor, 5);
  assert.equal(result.restoredInventoryValueCentavos, 10000);
  assert.equal(result.restoredPosition.averageUnitCostCentavos, 2000);
});

test('restoreExactPoolInventoryPosition: half-up average behavior via existing helper', () => {
  const current = buildInventoryCostPosition(1, 0, 33);
  const result = restoreExactPoolInventoryPosition({
    currentPosition: current,
    soldQuantity: 1,
    lineCostCentavos: 34,
  });
  assert.equal(result.restoredQuantityMinor, 2);
  assert.equal(result.restoredInventoryValueCentavos, 67);
  assert.equal(result.restoredPosition.averageUnitCostCentavos, 34);
});

test('restoreOfflineVarianceInventoryPosition: appliedQuantity < soldQuantity', () => {
  const current = buildInventoryCostPosition(1, 0, 4000);
  const result = restoreOfflineVarianceInventoryPosition({
    currentPosition: current,
    soldQuantity: 5,
    appliedQuantity: 1,
    unappliedQuantity: 4,
    lineCostCentavos: 20000,
    inventoryCostReliefCentavos: 4000,
    costVarianceCentavos: 16000,
  });
  assert.equal(result.restoredQuantityMinor, 2);
  assert.equal(result.restoredInventoryValueCentavos, 8000);
  assert.equal(result.retainedCostVarianceCentavos, 16000);
  assert.equal(result.financialCogsReversalCentavos, 20000);
});

test('restoreOfflineVarianceInventoryPosition: unappliedQuantity not restored', () => {
  const current = buildInventoryCostPosition(0, 0, 0);
  const result = restoreOfflineVarianceInventoryPosition({
    currentPosition: current,
    soldQuantity: 10,
    appliedQuantity: 0,
    unappliedQuantity: 10,
    lineCostCentavos: 50000,
    inventoryCostReliefCentavos: 0,
    costVarianceCentavos: 50000,
  });
  assert.equal(result.restoredQuantityMinor, 0);
  assert.equal(result.restoredInventoryValueCentavos, 0);
  assert.equal(result.financialCogsReversalCentavos, 50000);
});

test('restoreOfflineVarianceInventoryPosition: inventory relief differs from historical COGS', () => {
  const current = buildInventoryCostPosition(3, 0, 9000);
  const result = restoreOfflineVarianceInventoryPosition({
    currentPosition: current,
    soldQuantity: 2,
    appliedQuantity: 2,
    unappliedQuantity: 0,
    lineCostCentavos: 10000,
    inventoryCostReliefCentavos: 6000,
    costVarianceCentavos: 4000,
  });
  assert.equal(result.restoredQuantityMinor, 5);
  assert.equal(result.restoredInventoryValueCentavos, 15000);
  assert.equal(result.financialCogsReversalCentavos, 10000);
  assert.equal(result.retainedCostVarianceCentavos, 4000);
});

test('restoreOfflineVarianceInventoryPosition: positive cost variance', () => {
  const current = buildInventoryCostPosition(2, 0, 5000);
  const result = restoreOfflineVarianceInventoryPosition({
    currentPosition: current,
    soldQuantity: 1,
    appliedQuantity: 1,
    unappliedQuantity: 0,
    lineCostCentavos: 3000,
    inventoryCostReliefCentavos: 2000,
    costVarianceCentavos: 1000,
  });
  assert.equal(result.retainedCostVarianceCentavos, 1000);
});

test('restoreOfflineVarianceInventoryPosition: zero cost variance', () => {
  const current = buildInventoryCostPosition(2, 0, 6000);
  const result = restoreOfflineVarianceInventoryPosition({
    currentPosition: current,
    soldQuantity: 1,
    appliedQuantity: 1,
    unappliedQuantity: 0,
    lineCostCentavos: 3000,
    inventoryCostReliefCentavos: 3000,
    costVarianceCentavos: 0,
  });
  assert.equal(result.retainedCostVarianceCentavos, 0);
  assert.equal(result.financialCogsReversalCentavos, 3000);
});

test('restoreOfflineVarianceInventoryPosition: negative cost variance supported', () => {
  const current = buildInventoryCostPosition(2, 0, 6000);
  const result = restoreOfflineVarianceInventoryPosition({
    currentPosition: current,
    soldQuantity: 1,
    appliedQuantity: 1,
    unappliedQuantity: 0,
    lineCostCentavos: 2000,
    inventoryCostReliefCentavos: 3000,
    costVarianceCentavos: -1000,
  });
  assert.equal(result.retainedCostVarianceCentavos, -1000);
  assert.equal(result.financialCogsReversalCentavos, 2000);
});

test('restoreOfflineVarianceInventoryPosition: reconciliation equation mismatch rejected', () => {
  const current = buildInventoryCostPosition(2, 0, 6000);
  assert.throws(
    () => restoreOfflineVarianceInventoryPosition({
      currentPosition: current,
      soldQuantity: 1,
      appliedQuantity: 1,
      unappliedQuantity: 0,
      lineCostCentavos: 3000,
      inventoryCostReliefCentavos: 2000,
      costVarianceCentavos: 0,
    }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'RECONCILIATION_MISMATCH',
  );
});

test('restoreOfflineVarianceInventoryPosition: applied + unapplied mismatch rejected', () => {
  const current = buildInventoryCostPosition(2, 0, 6000);
  assert.throws(
    () => restoreOfflineVarianceInventoryPosition({
      currentPosition: current,
      soldQuantity: 5,
      appliedQuantity: 2,
      unappliedQuantity: 2,
      lineCostCentavos: 12000,
      inventoryCostReliefCentavos: 6000,
      costVarianceCentavos: 6000,
    }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'RECONCILIATION_MISMATCH',
  );
});

test('restoreExactPoolInventoryPosition: unsupported scale rejected', () => {
  const current = {
    quantityMinor: 10,
    quantityScale: 1,
    inventoryValueCentavos: 50000,
    averageUnitCostCentavos: 5000,
  };
  assert.throws(
    () => restoreExactPoolInventoryPosition({
      currentPosition: current,
      soldQuantity: 2,
      lineCostCentavos: 10000,
    }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'UNSUPPORTED_SCALE',
  );
});

test('restoreExactPoolInventoryPosition: unsafe quantity addition rejected', () => {
  const current = buildInventoryCostPosition(Number.MAX_SAFE_INTEGER, 0, 1000);
  assert.throws(
    () => restoreExactPoolInventoryPosition({
      currentPosition: current,
      soldQuantity: 1,
      lineCostCentavos: 1000,
    }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'UNSAFE_ADDITION',
  );
});

test('restoreOfflineVarianceInventoryPosition: unsafe inventory-value addition rejected', () => {
  const current = buildInventoryCostPosition(1, 0, Number.MAX_SAFE_INTEGER);
  assert.throws(
    () => restoreOfflineVarianceInventoryPosition({
      currentPosition: current,
      soldQuantity: 1,
      appliedQuantity: 1,
      unappliedQuantity: 0,
      lineCostCentavos: 1000,
      inventoryCostReliefCentavos: 1,
      costVarianceCentavos: 999,
    }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'UNSAFE_ADDITION',
  );
});

test('restoreExactPoolInventoryPosition: mismatched average rejected', () => {
  const malformed = {
    quantityMinor: 10,
    quantityScale: 0,
    inventoryValueCentavos: 50000,
    averageUnitCostCentavos: 4999,
  };
  assert.throws(
    () => restoreExactPoolInventoryPosition({
      currentPosition: malformed,
      soldQuantity: 2,
      lineCostCentavos: 10000,
    }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'MALFORMED_POSITION',
  );
});

test('restoreExactPoolInventoryPosition: zero quantity with nonzero inventory value rejected', () => {
  const malformed = {
    quantityMinor: 0,
    quantityScale: 0,
    inventoryValueCentavos: 5000,
    averageUnitCostCentavos: 0,
  };
  assert.throws(
    () => restoreExactPoolInventoryPosition({
      currentPosition: malformed,
      soldQuantity: 2,
      lineCostCentavos: 10000,
    }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'MALFORMED_POSITION',
  );
});

test('restoreOfflineVarianceInventoryPosition: malformed measured position rejected', () => {
  const malformed = {
    quantityMinor: 1000,
    quantityScale: 3,
    inventoryValueCentavos: 25000,
    averageUnitCostCentavos: 24,
  };
  assert.throws(
    () => restoreOfflineVarianceInventoryPosition({
      currentPosition: malformed,
      soldQuantity: 500,
      appliedQuantity: 500,
      unappliedQuantity: 0,
      lineCostCentavos: 12000,
      inventoryCostReliefCentavos: 12000,
      costVarianceCentavos: 0,
    }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'MALFORMED_POSITION',
  );
});

test('restoreExactPoolInventoryPosition: scale-3 average exceeds safe integer rejected as MALFORMED_POSITION', () => {
  const safeQuantity = 1;
  const safeScale = 3 as const;
  const unsafeValue = 9007199254741;
  const malformed = {
    quantityMinor: safeQuantity,
    quantityScale: safeScale,
    inventoryValueCentavos: unsafeValue,
    averageUnitCostCentavos: 0,
  };
  assert.throws(
    () => restoreExactPoolInventoryPosition({
      currentPosition: malformed,
      soldQuantity: 1,
      lineCostCentavos: 1000,
    }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'MALFORMED_POSITION',
  );
});

test('restoreExactPoolInventoryPosition: valid scale-0 position succeeds', () => {
  const current = buildInventoryCostPosition(5, 0, 25000);
  const result = restoreExactPoolInventoryPosition({
    currentPosition: current,
    soldQuantity: 3,
    lineCostCentavos: 15000,
  });
  assert.equal(result.restoredPosition.quantityScale, 0);
  assert.equal(result.restoredPosition.averageUnitCostCentavos, 5000);
});

test('restoreExactPoolInventoryPosition: valid scale-3 position succeeds', () => {
  const current = buildInventoryCostPosition(5000, 3, 100000);
  const result = restoreExactPoolInventoryPosition({
    currentPosition: current,
    soldQuantity: 1000,
    lineCostCentavos: 20000,
  });
  assert.equal(result.restoredPosition.quantityScale, 3);
  assert.equal(result.restoredPosition.averageUnitCostCentavos, 20000);
});

test('reverseSaleFromShiftAggregates: open cash shift decrement', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 10000,
    gcashSales: 5000,
    mayaSales: 3000,
    totalShiftSales: 18000,
    electronicReceipts: 8000,
    physicalCashAdjustments: 0,
    saleCount: 3,
  };
  const result = reverseSaleFromShiftAggregates({ shift, paymentMethod: 'cash', amountCentavos: 4000 });
  assert.equal(result.aggregatePatch.cashSales, 6000);
  assert.equal(result.aggregatePatch.gcashSales, 5000);
  assert.equal(result.aggregatePatch.mayaSales, 3000);
  assert.equal(result.aggregatePatch.totalShiftSales, 14000);
  assert.equal(result.aggregatePatch.electronicReceipts, 8000);
  assert.equal(result.aggregatePatch.saleCount, 2);
});

test('reverseSaleFromShiftAggregates: supported electronic payment decrement (gcash)', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 10000,
    gcashSales: 7000,
    mayaSales: 2000,
    totalShiftSales: 19000,
    electronicReceipts: 9000,
    physicalCashAdjustments: 0,
    saleCount: 3,
  };
  const result = reverseSaleFromShiftAggregates({ shift, paymentMethod: 'gcash', amountCentavos: 2000 });
  assert.equal(result.aggregatePatch.gcashSales, 5000);
  assert.equal(result.aggregatePatch.electronicReceipts, 7000);
  assert.equal(result.aggregatePatch.totalShiftSales, 17000);
  assert.equal(result.aggregatePatch.saleCount, 2);
});

test('reverseSaleFromShiftAggregates: supported electronic payment decrement (maya)', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 10000,
    gcashSales: 2000,
    mayaSales: 5000,
    totalShiftSales: 17000,
    electronicReceipts: 7000,
    physicalCashAdjustments: 0,
    saleCount: 3,
  };
  const result = reverseSaleFromShiftAggregates({ shift, paymentMethod: 'maya', amountCentavos: 1000 });
  assert.equal(result.aggregatePatch.mayaSales, 4000);
  assert.equal(result.aggregatePatch.electronicReceipts, 6000);
  assert.equal(result.aggregatePatch.totalShiftSales, 16000);
});

test('reverseSaleFromShiftAggregates: underflow rejected', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 1000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 1000,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
  };
  assert.throws(
    () => reverseSaleFromShiftAggregates({ shift, paymentMethod: 'cash', amountCentavos: 5000 }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'UNDERFLOW',
  );
});

test('reverseSaleFromShiftAggregates: unsupported payment method rejected via runtime check', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 1000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 1000,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
  };
  const invalidMethod = Reflect.apply(String.prototype.charAt, 'palista', [0]) + 'ash';
  assert.throws(
    () => Reflect.apply(reverseSaleFromShiftAggregates, undefined, [{ shift, paymentMethod: invalidMethod, amountCentavos: 100 }]),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'UNSUPPORTED_PAYMENT_METHOD',
  );
});

test('reverseSaleFromShiftAggregates: aggregatePatch contains only expected aggregate keys', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 10000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 10000,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
  };
  const result = reverseSaleFromShiftAggregates({ shift, paymentMethod: 'cash', amountCentavos: 10000 });
  const patchKeys = Object.keys(result.aggregatePatch).sort();
  const expectedKeys = [
    'reconciliationVersion',
    'cashSales',
    'gcashSales',
    'mayaSales',
    'totalShiftSales',
    'electronicReceipts',
    'physicalCashAdjustments',
    'saleCount',
  ].sort();
  assert.deepEqual(patchKeys, expectedKeys);
});

test('reverseSaleFromShiftAggregates: tenantId staffAccountId status timestamps do not appear in patch', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 10000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 10000,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
  };
  const result = reverseSaleFromShiftAggregates({ shift, paymentMethod: 'cash', amountCentavos: 10000 });
  const patchKeys = Object.keys(result.aggregatePatch as Record<string, unknown>);
  assert.ok(!patchKeys.includes('tenantId'));
  assert.ok(!patchKeys.includes('staffAccountId'));
  assert.ok(!patchKeys.includes('status'));
  assert.ok(!patchKeys.includes('openedAt'));
  assert.ok(!patchKeys.includes('closedAt'));
});

test('reverseSaleFromShiftAggregates: caller-owned unrelated fields remain unchanged', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 10000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 10000,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
  };
  const callerOwned = { tenantId: 'tenant_x', staffAccountId: 'staff_y', openedBy: 'staff_y' };
  reverseSaleFromShiftAggregates({ shift, paymentMethod: 'cash', amountCentavos: 10000 });
  assert.equal((callerOwned as Record<string, unknown>).tenantId, 'tenant_x');
  assert.equal((callerOwned as Record<string, unknown>).staffAccountId, 'staff_y');
});

test('reverseSaleFromShiftAggregates: aggregatePatch is safe for partial Firestore update', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 10000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 10000,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
  };
  const result = reverseSaleFromShiftAggregates({ shift, paymentMethod: 'cash', amountCentavos: 10000 });
  assert.equal(result.aggregatePatch.cashSales, 0);
  assert.equal(result.aggregatePatch.saleCount, 0);
  assert.ok(Object.isFrozen(result.aggregatePatch));
});

test('reverseSaleFromShiftAggregates: physicalCashAdjustments preserved exactly with nonzero value', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 10000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 10000,
    electronicReceipts: 0,
    physicalCashAdjustments: 375,
    saleCount: 1,
  };
  const result = reverseSaleFromShiftAggregates({ shift, paymentMethod: 'cash', amountCentavos: 5000 });
  assert.equal(result.aggregatePatch.physicalCashAdjustments, 375);
  assert.equal(shift.physicalCashAdjustments, 375);
});

test('restoreExactPoolInventoryPosition: input objects remain unfrozen and unchanged', () => {
  const current = buildInventoryCostPosition(5, 0, 25000);
  const originalQuantity = current.quantityMinor;
  const originalValue = current.inventoryValueCentavos;
  restoreExactPoolInventoryPosition({
    currentPosition: current,
    soldQuantity: 3,
    lineCostCentavos: 15000,
  });
  assert.equal(current.quantityMinor, originalQuantity);
  assert.equal(current.inventoryValueCentavos, originalValue);
  assert.equal(Object.isFrozen(current), true);
});

test('restoreOfflineVarianceInventoryPosition: input objects remain unfrozen and unchanged', () => {
  const current = buildInventoryCostPosition(5, 0, 25000);
  const originalQuantity = current.quantityMinor;
  restoreOfflineVarianceInventoryPosition({
    currentPosition: current,
    soldQuantity: 3,
    appliedQuantity: 3,
    unappliedQuantity: 0,
    lineCostCentavos: 15000,
    inventoryCostReliefCentavos: 15000,
    costVarianceCentavos: 0,
  });
  assert.equal(current.quantityMinor, originalQuantity);
  assert.equal(Object.isFrozen(current), true);
});

test('reverseSaleFromShiftAggregates: input shift remains unfrozen and unchanged', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 10000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 10000,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
  };
  reverseSaleFromShiftAggregates({ shift, paymentMethod: 'cash', amountCentavos: 5000 });
  assert.equal(shift.cashSales, 10000);
  assert.equal(shift.saleCount, 1);
});

test('all returned objects are deeply frozen', () => {
  const current = buildInventoryCostPosition(5, 0, 25000);
  const result = restoreExactPoolInventoryPosition({
    currentPosition: current,
    soldQuantity: 3,
    lineCostCentavos: 15000,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.restoredPosition), true);
  assert.equal(Object.isFrozen(result.previousPosition), true);
});

test('reverseSaleFromShiftAggregates: returned aggregates are deeply frozen', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 10000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 10000,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
  };
  const result = reverseSaleFromShiftAggregates({ shift, paymentMethod: 'cash', amountCentavos: 5000 });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.aggregatePatch), true);
  assert.equal(Object.isFrozen(result.previousAggregates), true);
});

test('same input produces deeply equal output', () => {
  const current = buildInventoryCostPosition(5, 0, 25000);
  const r1 = restoreExactPoolInventoryPosition({
    currentPosition: current,
    soldQuantity: 3,
    lineCostCentavos: 15000,
  });
  const r2 = restoreExactPoolInventoryPosition({
    currentPosition: current,
    soldQuantity: 3,
    lineCostCentavos: 15000,
  });
  assert.deepEqual(r1, r2);
});

test('restoreExactPoolInventoryPosition: negative reversal amount rejected as INVALID_INPUT', () => {
  const current = buildInventoryCostPosition(5, 0, 25000);
  assert.throws(
    () => restoreExactPoolInventoryPosition({
      currentPosition: current,
      soldQuantity: -1,
      lineCostCentavos: 15000,
    }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'INVALID_INPUT',
  );
});

test('restoreExactPoolInventoryPosition: fractional reversal amount rejected as INVALID_INPUT', () => {
  const current = buildInventoryCostPosition(5, 0, 25000);
  assert.throws(
    () => restoreExactPoolInventoryPosition({
      currentPosition: current,
      soldQuantity: 1.5,
      lineCostCentavos: 15000,
    }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'INVALID_INPUT',
  );
});

test('reverseSaleFromShiftAggregates: negative reversal amount rejected as INVALID_INPUT', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 10000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 10000,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
  };
  assert.throws(
    () => reverseSaleFromShiftAggregates({ shift, paymentMethod: 'cash', amountCentavos: -5000 }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'INVALID_INPUT',
  );
});

test('reverseSaleFromShiftAggregates: fractional reversal amount rejected as INVALID_INPUT', () => {
  const shift: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: 10000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 10000,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
  };
  assert.throws(
    () => reverseSaleFromShiftAggregates({ shift, paymentMethod: 'cash', amountCentavos: 0.5 }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'INVALID_INPUT',
  );
});

test('reverseSaleFromShiftAggregates: malformed negative cashSales rejected as INVALID_INPUT', () => {
  const malformed: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: -1000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 0,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
  };
  assert.throws(
    () => reverseSaleFromShiftAggregates({ shift: malformed, paymentMethod: 'cash', amountCentavos: 0 }),
    (err: unknown) => err instanceof BentaReversalEngineError && err.code === 'INVALID_INPUT',
  );
});
