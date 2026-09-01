import {
  buildInventoryCostPosition,
  type InventoryCostPosition,
  type InventoryQuantityScale,
} from './inventory-costing';

export const BENTA_SALE_REVERSAL_OPERATION_VERSION = 1 as const;

export type BentaShiftPaymentMethod = 'cash' | 'gcash' | 'maya';

export interface BentaShiftAggregates {
  reconciliationVersion: number;
  cashSales: number;
  gcashSales: number;
  mayaSales: number;
  totalShiftSales: number;
  electronicReceipts: number;
  physicalCashAdjustments: number;
  saleCount: number;
}

export type BentaReversalEngineErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_SCALE'
  | 'UNSUPPORTED_PAYMENT_METHOD'
  | 'RECONCILIATION_MISMATCH'
  | 'UNSAFE_ADDITION'
  | 'UNDERFLOW'
  | 'MALFORMED_POSITION';

export class BentaReversalEngineError extends Error {
  readonly code: BentaReversalEngineErrorCode;
  constructor(code: BentaReversalEngineErrorCode) {
    const messages: Record<BentaReversalEngineErrorCode, string> = {
      INVALID_INPUT: 'Reversal input is invalid.',
      UNSUPPORTED_SCALE: 'Unsupported inventory scale for reversal.',
      UNSUPPORTED_PAYMENT_METHOD: 'Unsupported payment method for shift reversal.',
      RECONCILIATION_MISMATCH: 'Reversal reconciliation fields are inconsistent.',
      UNSAFE_ADDITION: 'Reversal addition exceeded safe integer bounds.',
      UNDERFLOW: 'Reversal would cause a negative aggregate.',
      MALFORMED_POSITION: 'Current inventory position is malformed.',
    };
    super(messages[code]);
    this.name = 'BentaReversalEngineError';
    this.code = code;
  }
}

function assertSafeNonNegativeInteger(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BentaReversalEngineError('INVALID_INPUT');
  }
}

function assertSafeInteger(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new BentaReversalEngineError('INVALID_INPUT');
  }
}

function assertValidScale(scale: unknown): asserts scale is InventoryQuantityScale {
  if (scale !== 0 && scale !== 3) {
    throw new BentaReversalEngineError('UNSUPPORTED_SCALE');
  }
}

function checkedAddNonNegative(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || left < 0) {
    throw new BentaReversalEngineError('INVALID_INPUT');
  }
  if (!Number.isSafeInteger(right) || right < 0) {
    throw new BentaReversalEngineError('INVALID_INPUT');
  }
  if (left > Number.MAX_SAFE_INTEGER - right) {
    throw new BentaReversalEngineError('UNSAFE_ADDITION');
  }
  return left + right;
}

function checkedAddNonNegativeMultiple(...values: number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v) || v < 0) {
      throw new BentaReversalEngineError('INVALID_INPUT');
    }
    if (total > Number.MAX_SAFE_INTEGER - v) {
      throw new BentaReversalEngineError('UNSAFE_ADDITION');
    }
    total += v;
  }
  return total;
}

function validateAndRebuildPosition(current: InventoryCostPosition): InventoryCostPosition {
  assertSafeNonNegativeInteger(current.quantityMinor);
  assertSafeNonNegativeInteger(current.inventoryValueCentavos);
  assertSafeNonNegativeInteger(current.averageUnitCostCentavos);
  assertValidScale(current.quantityScale);

  if (current.quantityMinor === 0 && current.inventoryValueCentavos > 0) {
    throw new BentaReversalEngineError('MALFORMED_POSITION');
  }

  let rebuilt: InventoryCostPosition;
  try {
    rebuilt = buildInventoryCostPosition(
      current.quantityMinor,
      current.quantityScale,
      current.inventoryValueCentavos,
    );
  } catch (err: unknown) {
    if (err instanceof BentaReversalEngineError) {
      throw err;
    }
    throw new BentaReversalEngineError('MALFORMED_POSITION');
  }

  if (rebuilt.averageUnitCostCentavos !== current.averageUnitCostCentavos) {
    throw new BentaReversalEngineError('MALFORMED_POSITION');
  }

  return rebuilt;
}

export interface BentaRestoreExactPoolInput {
  readonly currentPosition: InventoryCostPosition;
  readonly soldQuantity: number;
  readonly lineCostCentavos: number;
}

export interface BentaRestoreResult {
  readonly previousPosition: InventoryCostPosition;
  readonly restoredPosition: InventoryCostPosition;
  readonly restoredQuantityMinor: number;
  readonly restoredInventoryValueCentavos: number;
}

export function restoreExactPoolInventoryPosition(input: BentaRestoreExactPoolInput): BentaRestoreResult {
  const current = validateAndRebuildPosition(input.currentPosition);

  assertSafeNonNegativeInteger(input.soldQuantity);
  assertSafeNonNegativeInteger(input.lineCostCentavos);

  const restoredQuantity = checkedAddNonNegative(current.quantityMinor, input.soldQuantity);
  const restoredValue = checkedAddNonNegative(current.inventoryValueCentavos, input.lineCostCentavos);

  const restoredPosition = buildInventoryCostPosition(
    restoredQuantity,
    current.quantityScale,
    restoredValue,
  );

  const previousSnapshot = buildInventoryCostPosition(
    current.quantityMinor,
    current.quantityScale,
    current.inventoryValueCentavos,
  );

  return deepFreeze({
    previousPosition: previousSnapshot,
    restoredPosition,
    restoredQuantityMinor: restoredQuantity,
    restoredInventoryValueCentavos: restoredValue,
  });
}

export interface BentaRestoreOfflineVarianceInput {
  readonly currentPosition: InventoryCostPosition;
  readonly soldQuantity: number;
  readonly appliedQuantity: number;
  readonly unappliedQuantity: number;
  readonly lineCostCentavos: number;
  readonly inventoryCostReliefCentavos: number;
  readonly costVarianceCentavos: number;
}

export interface BentaOfflineVarianceRestoreResult {
  readonly previousPosition: InventoryCostPosition;
  readonly restoredPosition: InventoryCostPosition;
  readonly restoredQuantityMinor: number;
  readonly restoredInventoryValueCentavos: number;
  readonly retainedCostVarianceCentavos: number;
  readonly financialCogsReversalCentavos: number;
}

export function restoreOfflineVarianceInventoryPosition(
  input: BentaRestoreOfflineVarianceInput,
): BentaOfflineVarianceRestoreResult {
  const current = validateAndRebuildPosition(input.currentPosition);

  assertSafeNonNegativeInteger(input.soldQuantity);
  assertSafeNonNegativeInteger(input.appliedQuantity);
  assertSafeNonNegativeInteger(input.unappliedQuantity);
  assertSafeNonNegativeInteger(input.lineCostCentavos);
  assertSafeNonNegativeInteger(input.inventoryCostReliefCentavos);
  assertSafeInteger(input.costVarianceCentavos);

  if (checkedAddNonNegative(input.appliedQuantity, input.unappliedQuantity) !== input.soldQuantity) {
    throw new BentaReversalEngineError('RECONCILIATION_MISMATCH');
  }

  if (BigInt(input.lineCostCentavos) !== BigInt(input.inventoryCostReliefCentavos) + BigInt(input.costVarianceCentavos)) {
    throw new BentaReversalEngineError('RECONCILIATION_MISMATCH');
  }

  const restoredQuantity = checkedAddNonNegative(current.quantityMinor, input.appliedQuantity);
  const restoredValue = checkedAddNonNegative(current.inventoryValueCentavos, input.inventoryCostReliefCentavos);

  const restoredPosition = buildInventoryCostPosition(
    restoredQuantity,
    current.quantityScale,
    restoredValue,
  );

  const previousSnapshot = buildInventoryCostPosition(
    current.quantityMinor,
    current.quantityScale,
    current.inventoryValueCentavos,
  );

  return deepFreeze({
    previousPosition: previousSnapshot,
    restoredPosition,
    restoredQuantityMinor: restoredQuantity,
    restoredInventoryValueCentavos: restoredValue,
    retainedCostVarianceCentavos: input.costVarianceCentavos,
    financialCogsReversalCentavos: input.lineCostCentavos,
  });
}

function isShiftPaymentMethod(value: unknown): value is BentaShiftPaymentMethod {
  return value === 'cash' || value === 'gcash' || value === 'maya';
}

function safeNonNegativeSubtract(current: number, amount: number): number {
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new BentaReversalEngineError('INVALID_INPUT');
  }
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new BentaReversalEngineError('INVALID_INPUT');
  }
  if (amount > current) {
    throw new BentaReversalEngineError('UNDERFLOW');
  }
  return current - amount;
}

function validateShiftAggregates(shift: BentaShiftAggregates): void {
  if (shift.reconciliationVersion !== 1) {
    throw new BentaReversalEngineError('INVALID_INPUT');
  }
  assertSafeNonNegativeInteger(shift.cashSales);
  assertSafeNonNegativeInteger(shift.gcashSales);
  assertSafeNonNegativeInteger(shift.mayaSales);
  assertSafeNonNegativeInteger(shift.totalShiftSales);
  assertSafeNonNegativeInteger(shift.electronicReceipts);
  assertSafeNonNegativeInteger(shift.physicalCashAdjustments);
  assertSafeNonNegativeInteger(shift.saleCount);
  const expectedTotal = checkedAddNonNegativeMultiple(shift.cashSales, shift.gcashSales, shift.mayaSales);
  if (shift.totalShiftSales !== expectedTotal) {
    throw new BentaReversalEngineError('INVALID_INPUT');
  }
  const expectedElectronic = checkedAddNonNegativeMultiple(shift.gcashSales, shift.mayaSales);
  if (shift.electronicReceipts !== expectedElectronic) {
    throw new BentaReversalEngineError('INVALID_INPUT');
  }
}

export interface BentaReverseShiftInput {
  readonly shift: BentaShiftAggregates;
  readonly paymentMethod: BentaShiftPaymentMethod;
  readonly amountCentavos: number;
}

/**
 * Result of reversing a sale from shift aggregates.
 *
 * aggregatePatch: A partial-update patch containing only the versioned aggregate
 * fields. The future Firestore service MUST use transaction.update(shiftRef, result.aggregatePatch)
 * and MUST NOT use set() without merge. This design ensures caller-owned fields
 * (tenantId, staffAccountId, status, timestamps, etc.) are never touched, frozen,
 * or included in the returned object.
 *
 * previousAggregates: A frozen snapshot of the aggregate state before reversal.
 * This is an aggregate-only snapshot, not a full shift document clone.
 */
export interface BentaReverseShiftResult {
  readonly previousAggregates: BentaShiftAggregates;
  readonly aggregatePatch: BentaShiftAggregates;
}

export function reverseSaleFromShiftAggregates(input: BentaReverseShiftInput): BentaReverseShiftResult {
  if (!isShiftPaymentMethod(input.paymentMethod)) {
    throw new BentaReversalEngineError('UNSUPPORTED_PAYMENT_METHOD');
  }
  assertSafeNonNegativeInteger(input.amountCentavos);

  validateShiftAggregates(input.shift);

  const next: BentaShiftAggregates = {
    reconciliationVersion: 1,
    cashSales: input.shift.cashSales,
    gcashSales: input.shift.gcashSales,
    mayaSales: input.shift.mayaSales,
    totalShiftSales: input.shift.totalShiftSales,
    electronicReceipts: input.shift.electronicReceipts,
    physicalCashAdjustments: input.shift.physicalCashAdjustments,
    saleCount: input.shift.saleCount,
  };

  if (input.paymentMethod === 'cash') {
    next.cashSales = safeNonNegativeSubtract(next.cashSales, input.amountCentavos);
  } else if (input.paymentMethod === 'gcash') {
    next.gcashSales = safeNonNegativeSubtract(next.gcashSales, input.amountCentavos);
  } else {
    next.mayaSales = safeNonNegativeSubtract(next.mayaSales, input.amountCentavos);
  }

  next.totalShiftSales = safeNonNegativeSubtract(next.totalShiftSales, input.amountCentavos);
  next.saleCount = safeNonNegativeSubtract(next.saleCount, 1);

  if (input.paymentMethod === 'gcash' || input.paymentMethod === 'maya') {
    next.electronicReceipts = safeNonNegativeSubtract(next.electronicReceipts, input.amountCentavos);
  }

  const previousAggregateSnapshot: BentaShiftAggregates = {
    reconciliationVersion: input.shift.reconciliationVersion,
    cashSales: input.shift.cashSales,
    gcashSales: input.shift.gcashSales,
    mayaSales: input.shift.mayaSales,
    totalShiftSales: input.shift.totalShiftSales,
    electronicReceipts: input.shift.electronicReceipts,
    physicalCashAdjustments: input.shift.physicalCashAdjustments,
    saleCount: input.shift.saleCount,
  };

  return deepFreeze({
    previousAggregates: deepFreeze(previousAggregateSnapshot),
    aggregatePatch: deepFreeze(next),
  });
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      deepFreeze(value[i]);
    }
    Object.freeze(value);
    return value;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  Object.freeze(value);
  return value;
}
