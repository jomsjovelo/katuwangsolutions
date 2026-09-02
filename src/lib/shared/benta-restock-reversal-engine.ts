import {
  applyMovingAverageRestock,
  buildInventoryCostPosition,
  type InventoryCostPosition,
  type InventoryQuantityScale,
} from './inventory-costing';

export const BENTA_RESTOCK_REVERSAL_OPERATION_VERSION = 1 as const;

export type BentaRestockReversalEngineErrorCode =
  | 'INVALID_INPUT'
  | 'MALFORMED_POSITION'
  | 'SCALE_MISMATCH'
  | 'HISTORY_INTEGRITY_ERROR'
  | 'POSITION_CHANGED';

export class BentaRestockReversalEngineError extends Error {
  readonly code: BentaRestockReversalEngineErrorCode;
  constructor(code: BentaRestockReversalEngineErrorCode) {
    const messages: Record<BentaRestockReversalEngineErrorCode, string> = {
      INVALID_INPUT: 'Reversal input is invalid.',
      MALFORMED_POSITION: 'A stored inventory position is malformed.',
      SCALE_MISMATCH: 'Quantity scale does not match the stored scale.',
      HISTORY_INTEGRITY_ERROR: 'Recomputed historical restock does not match stored PO snapshots.',
      POSITION_CHANGED: 'Current position no longer matches the stored resulting position.',
    };
    super(messages[code]);
    this.name = 'BentaRestockReversalEngineError';
    this.code = code;
  }
}

function assertSafeNonNegativeInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BentaRestockReversalEngineError('INVALID_INPUT');
  }
}

function assertSafePositiveInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new BentaRestockReversalEngineError('INVALID_INPUT');
  }
}

function assertValidScale(scale: unknown, expectedScale: InventoryQuantityScale): asserts scale is InventoryQuantityScale {
  if (scale !== expectedScale) {
    throw new BentaRestockReversalEngineError('SCALE_MISMATCH');
  }
}

function validateAndRebuildPosition(pos: unknown, expectedScale: InventoryQuantityScale): InventoryCostPosition {
  if (pos === null || typeof pos !== 'object' || Array.isArray(pos)) {
    throw new BentaRestockReversalEngineError('MALFORMED_POSITION');
  }

  const candidate = pos as Record<string, unknown>;
  assertSafeNonNegativeInteger(candidate.quantityMinor, 'quantityMinor');
  assertSafeNonNegativeInteger(candidate.inventoryValueCentavos, 'inventoryValueCentavos');
  assertSafeNonNegativeInteger(candidate.averageUnitCostCentavos, 'averageUnitCostCentavos');
  assertValidScale(candidate.quantityScale, expectedScale);

  if (candidate.quantityMinor === 0 && candidate.inventoryValueCentavos > 0) {
    throw new BentaRestockReversalEngineError('MALFORMED_POSITION');
  }

  let rebuilt: InventoryCostPosition;
  try {
    rebuilt = buildInventoryCostPosition(
      candidate.quantityMinor,
      candidate.quantityScale,
      candidate.inventoryValueCentavos,
    );
  } catch {
    throw new BentaRestockReversalEngineError('MALFORMED_POSITION');
  }

  if (rebuilt.averageUnitCostCentavos !== candidate.averageUnitCostCentavos) {
    throw new BentaRestockReversalEngineError('MALFORMED_POSITION');
  }

  return rebuilt;
}

export interface BentaRestockReversalInput {
  readonly productId: string;
  readonly quantityMode: 'discrete' | 'measured';
  readonly currentPosition: InventoryCostPosition;
  readonly storedPreviousPosition: InventoryCostPosition;
  readonly storedResultingPosition: InventoryCostPosition;
  readonly purchasedQuantityMinor: number;
  readonly supplierCostCentavos: number;
  readonly freightCentavos?: number;
  readonly otherAcquisitionCostCentavos?: number;
  readonly previousLatestPurchaseUnitCostCentavos?: number;
}

export type LatestPurchaseCostRestorationPolicy =
  | { readonly policy: 'restore'; readonly value: number }
  | { readonly policy: 'delete' };

export interface BentaRestockReversalSuccess {
  readonly productId: string;
  readonly restoredPosition: InventoryCostPosition;
  readonly removedQuantityMinor: number;
  readonly removedInventoryValueCentavos: number;
  readonly recomputedLandedCostCentavos: number;
  readonly latestPurchaseCostRestoration: LatestPurchaseCostRestorationPolicy;
}

export function evaluateBentaRestockReversalEligibility(
  input: BentaRestockReversalInput,
): BentaRestockReversalSuccess {
  if (input === null || typeof input !== 'object') {
    throw new BentaRestockReversalEngineError('INVALID_INPUT');
  }

  if (input.quantityMode !== 'discrete' && input.quantityMode !== 'measured') {
    throw new BentaRestockReversalEngineError('INVALID_INPUT');
  }

  const scale: InventoryQuantityScale = input.quantityMode === 'discrete' ? 0 : 3;

  if (typeof input.productId !== 'string' || input.productId.trim().length === 0) {
    throw new BentaRestockReversalEngineError('INVALID_INPUT');
  }

  assertSafePositiveInteger(input.purchasedQuantityMinor, 'purchasedQuantityMinor');
  assertSafeNonNegativeInteger(input.supplierCostCentavos, 'supplierCostCentavos');
  const freightCentavos = input.freightCentavos ?? 0;
  const otherAcquisitionCostCentavos = input.otherAcquisitionCostCentavos ?? 0;
  assertSafeNonNegativeInteger(freightCentavos, 'freightCentavos');
  assertSafeNonNegativeInteger(otherAcquisitionCostCentavos, 'otherAcquisitionCostCentavos');

  if (input.previousLatestPurchaseUnitCostCentavos !== undefined) {
    assertSafeNonNegativeInteger(input.previousLatestPurchaseUnitCostCentavos, 'previousLatestPurchaseUnitCostCentavos');
  }

  const validatedCurrent = validateAndRebuildPosition(input.currentPosition, scale);
  const validatedPrevious = validateAndRebuildPosition(input.storedPreviousPosition, scale);
  const validatedResulting = validateAndRebuildPosition(input.storedResultingPosition, scale);

  if (
    validatedCurrent.quantityMinor !== validatedResulting.quantityMinor ||
    validatedCurrent.inventoryValueCentavos !== validatedResulting.inventoryValueCentavos ||
    validatedCurrent.averageUnitCostCentavos !== validatedResulting.averageUnitCostCentavos
  ) {
    throw new BentaRestockReversalEngineError('POSITION_CHANGED');
  }

  let recomputedResult: ReturnType<typeof applyMovingAverageRestock>;
  try {
    recomputedResult = applyMovingAverageRestock({
      previousPosition: validatedPrevious,
      purchasedQuantityMinor: input.purchasedQuantityMinor,
      supplierCostCentavos: input.supplierCostCentavos,
      freightCentavos,
      otherAcquisitionCostCentavos,
    });
  } catch (err: unknown) {
    if (err instanceof BentaRestockReversalEngineError) {
      throw err;
    }
    throw new BentaRestockReversalEngineError('INVALID_INPUT');
  }

  if (
    recomputedResult.resultingPosition.quantityMinor !== validatedResulting.quantityMinor ||
    recomputedResult.resultingPosition.inventoryValueCentavos !== validatedResulting.inventoryValueCentavos ||
    recomputedResult.resultingPosition.averageUnitCostCentavos !== validatedResulting.averageUnitCostCentavos
  ) {
    throw new BentaRestockReversalEngineError('HISTORY_INTEGRITY_ERROR');
  }

  if (recomputedResult.landedCostCentavos > Number.MAX_SAFE_INTEGER) {
    throw new BentaRestockReversalEngineError('INVALID_INPUT');
  }

  const removedQuantityMinor = input.purchasedQuantityMinor;
  const removedInventoryValueCentavos = recomputedResult.landedCostCentavos;

  const restoredQuantity = validatedPrevious.quantityMinor;
  const restoredValue = validatedPrevious.inventoryValueCentavos;

  let restoredPosition: InventoryCostPosition;
  try {
    restoredPosition = buildInventoryCostPosition(
      restoredQuantity,
      scale,
      restoredValue,
    );
  } catch {
    throw new BentaRestockReversalEngineError('MALFORMED_POSITION');
  }

  const latestPurchaseCostRestoration: LatestPurchaseCostRestorationPolicy =
    input.previousLatestPurchaseUnitCostCentavos !== undefined
      ? { policy: 'restore', value: input.previousLatestPurchaseUnitCostCentavos }
      : { policy: 'delete' };

  return deepFreeze({
    productId: input.productId,
    restoredPosition,
    removedQuantityMinor,
    removedInventoryValueCentavos,
    recomputedLandedCostCentavos: recomputedResult.landedCostCentavos,
    latestPurchaseCostRestoration,
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
