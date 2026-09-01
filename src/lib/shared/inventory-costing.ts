/**
 * Shared, pure inventory-costing primitives for moving-average (weighted-average)
 * cost accounting. Used by Benta Snap products and Order Snap ingredients.
 *
 * Pure calculation layer: no Firestore, IndexedDB, React, browser, or network code.
 * All money and quantity arithmetic uses checked BigInt internally; floating-point
 * is used only by the reused shared pricing helpers for derived margin ratios.
 */

import { calculateLandedCost, calculateBreakEvenSellingPrice, calculateMarkupPercentage, calculateGrossMarginPercentage, generateMarginScenarios } from './pricing-math';
import type { MarginScenario } from './pricing-math';

export type InventoryQuantityScale = 0 | 3;
export type InventoryCostMovement = 'increased' | 'decreased' | 'unchanged';

export interface InventoryCostPosition {
  readonly quantityMinor: number;
  readonly quantityScale: InventoryQuantityScale;
  readonly inventoryValueCentavos: number;
  readonly averageUnitCostCentavos: number;
}

export function deriveInventoryValueCentavosFromAverageCost(
  quantityMinor: number,
  quantityScale: InventoryQuantityScale,
  averageUnitCostCentavos: number,
): number {
  assertSafeNonNegativeInteger(quantityMinor, "quantityMinor");
  assertSafeNonNegativeInteger(averageUnitCostCentavos, "averageUnitCostCentavos");
  assertValidScale(quantityScale);

  if (quantityMinor === 0) {
    return 0;
  }
  const numerator = BigInt(quantityMinor) * BigInt(averageUnitCostCentavos);
  const denominator = scalePower(quantityScale);
  return toSafeNumber(roundHalfUp(numerator, denominator), "inventoryValueCentavos");
}

export interface InventoryRestockInput {
  readonly previousPosition: InventoryCostPosition;
  readonly purchasedQuantityMinor: number;
  readonly supplierCostCentavos: number;
  readonly freightCentavos?: number;
  readonly otherAcquisitionCostCentavos?: number;
}

export interface InventoryRestockResult {
  readonly previousPosition: InventoryCostPosition;
  readonly resultingPosition: InventoryCostPosition;
  readonly landedCostCentavos: number;
  readonly latestPurchaseUnitCostCentavos: number;
  readonly costMovement: InventoryCostMovement;
}

export interface InventoryConsumptionInput {
  readonly position: InventoryCostPosition;
  readonly consumedQuantityMinor: number;
}

export interface InventoryConsumptionResult {
  readonly consumedQuantityMinor: number;
  readonly consumedCostCentavos: number;
  readonly consumptionUnitCostCentavos: number;
  readonly remainingPosition: InventoryCostPosition;
}

export interface InventoryRestockEventInput {
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly inventoryItemId: string;
  readonly occurredAtEpochMs: number;
  readonly restock: InventoryRestockInput;
}

export interface InventoryRestockEvent {
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly inventoryItemId: string;
  readonly occurredAtEpochMs: number;
  readonly purchasedQuantityMinor: number;
  readonly supplierCostCentavos: number;
  readonly freightCentavos: number;
  readonly otherAcquisitionCostCentavos: number;
  readonly landedCostCentavos: number;
  readonly latestPurchaseUnitCostCentavos: number;
  readonly costMovement: InventoryCostMovement;
  readonly previousPosition: InventoryCostPosition;
  readonly resultingPosition: InventoryCostPosition;
}

export interface InventoryProfitabilityImpactInput {
  readonly resultingPosition: InventoryCostPosition;
  readonly currentSellingPriceCentavos: number;
  readonly costMovement: InventoryCostMovement;
  readonly customTargetMarginPercent?: number;
}

export interface InventoryProfitabilityImpact {
  readonly currentSellingPriceCentavos: number;
  readonly costPerSellingUnitCentavos: number;
  readonly breakEvenSellingPriceCentavos: number;
  readonly unitGrossProfitCentavos: number;
  readonly markupPercent: number;
  readonly grossMarginPercent: number;
  readonly costMovement: InventoryCostMovement;
  readonly marginScenarios: readonly MarginScenario[];
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function assertSafeInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
  }
}

function assertNonNegative(value: number, name: string): void {
  if (value < 0) {
    throw new Error(`${name} cannot be negative`);
  }
}

function assertSafeNonNegativeInteger(value: unknown, name: string): asserts value is number {
  assertSafeInteger(value, name);
  assertNonNegative(value, name);
}

function assertSafePositiveInteger(value: unknown, name: string): asserts value is number {
  assertSafeInteger(value, name);
  if (value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function assertNonBlankString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertValidScale(scale: number): asserts scale is InventoryQuantityScale {
  if (scale !== 0 && scale !== 3) {
    throw new Error(`quantityScale must be 0 (discrete) or 3 (measured); received ${scale}`);
  }
}

function toSafeNumber(value: bigint, name: string): number {
  if (value > MAX_SAFE || value < -MAX_SAFE) {
    throw new Error(`${name} exceeded safe integer bounds`);
  }
  return Number(value);
}

function scalePower(scale: InventoryQuantityScale): bigint {
  return scale === 0 ? BigInt(1) : BigInt(1000);
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === BigInt(0)) {
    throw new Error('Division by zero is not allowed');
  }
  if (numerator < BigInt(0)) {
    throw new Error('Half-up rounding is only defined for non-negative values');
  }
  const half = denominator / BigInt(2);
  return (numerator + half) / denominator;
}

function computeAverageBigInt(
  value: bigint,
  quantity: bigint,
  scale: InventoryQuantityScale,
): bigint {
  if (quantity === BigInt(0)) {
    return BigInt(0);
  }
  const numerator = value * scalePower(scale);
  return roundHalfUp(numerator, quantity);
}

function assertValidPosition(pos: unknown): asserts pos is InventoryCostPosition {
  if (!pos || typeof pos !== 'object') {
    throw new Error('Inventory cost position must be an object');
  }
  const p = pos as InventoryCostPosition;
  assertSafeNonNegativeInteger(p.quantityMinor, 'quantityMinor');
  assertSafeNonNegativeInteger(p.inventoryValueCentavos, 'inventoryValueCentavos');
  assertSafeNonNegativeInteger(p.averageUnitCostCentavos, 'averageUnitCostCentavos');
  assertValidScale(p.quantityScale);

  if (p.quantityMinor === 0 && p.inventoryValueCentavos > 0) {
    throw new Error('Zero quantity requires zero inventory value');
  }

  const expected = toSafeNumber(computeAverageBigInt(BigInt(p.inventoryValueCentavos), BigInt(p.quantityMinor), p.quantityScale), 'averageUnitCostCentavos');
  if (p.averageUnitCostCentavos !== expected) {
    throw new Error('averageUnitCostCentavos is inconsistent with the exact cost pool');
  }
}

function freeze<T>(obj: T): Readonly<T> {
  return deepFreeze(obj) as Readonly<T>;
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      deepFreeze(obj[i]);
    }
    Object.freeze(obj);
    return obj;
  }
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    deepFreeze(record[key]);
  }
  Object.freeze(obj);
  return obj;
}

/**
 * Builds and validates an immutable inventory cost position.
 * averageUnitCostCentavos = roundHalfUp(value × 10^scale ÷ quantityMinor).
 */
export function buildInventoryCostPosition(
  quantityMinor: number,
  quantityScale: InventoryQuantityScale,
  inventoryValueCentavos: number,
): InventoryCostPosition {
  assertSafeNonNegativeInteger(quantityMinor, 'quantityMinor');
  assertSafeNonNegativeInteger(inventoryValueCentavos, 'inventoryValueCentavos');
  assertValidScale(quantityScale);

  if (quantityMinor === 0 && inventoryValueCentavos > 0) {
    throw new Error('Zero quantity requires zero inventory value');
  }

  const average = quantityMinor === 0
    ? 0
    : toSafeNumber(computeAverageBigInt(BigInt(inventoryValueCentavos), BigInt(quantityMinor), quantityScale), 'averageUnitCostCentavos');

  return freeze({
    quantityMinor,
    quantityScale,
    inventoryValueCentavos,
    averageUnitCostCentavos: average,
  });
}

function classifyMovement(
  previousValue: bigint,
  previousQuantity: bigint,
  resultingValue: bigint,
  resultingQuantity: bigint,
): InventoryCostMovement {
  if (previousQuantity === BigInt(0)) {
    return 'unchanged';
  }
  const lhs = resultingValue * previousQuantity;
  const rhs = previousValue * resultingQuantity;
  if (lhs > rhs) return 'increased';
  if (lhs < rhs) return 'decreased';
  return 'unchanged';
}

/**
 * Applies a moving-weighted-average (moving-average) restock:
 *   landedCost = supplierCost + freight + otherAcquisitionCost
 *   resultingQuantity = previousQuantity + purchasedQuantity
 *   resultingInventoryValue = previousInventoryValue + landedCost
 *   latestPurchaseUnitCost = roundHalfUp(landedCost × 10^scale ÷ purchasedQuantity)
 * Movement is classified via exact BigInt cross-multiplication (not rounded averages).
 * A zero previous stock establishes a new cost basis and yields `unchanged`.
 */
export function applyMovingAverageRestock(input: InventoryRestockInput): InventoryRestockResult {
  assertValidPosition(input.previousPosition);
  const prev = input.previousPosition;

  assertSafePositiveInteger(input.purchasedQuantityMinor, 'purchasedQuantityMinor');
  assertSafeNonNegativeInteger(input.supplierCostCentavos, 'supplierCostCentavos');
  const freight = input.freightCentavos ?? 0;
  const other = input.otherAcquisitionCostCentavos ?? 0;
  assertSafeNonNegativeInteger(freight, 'freightCentavos');
  assertSafeNonNegativeInteger(other, 'otherAcquisitionCostCentavos');

  const scale = prev.quantityScale;

  const landed = calculateLandedCost(input.supplierCostCentavos, freight, other);
  assertSafeNonNegativeInteger(landed, 'landedCost');

  const pQuantity = BigInt(prev.quantityMinor);
  const pValue = BigInt(prev.inventoryValueCentavos);
  const buyQuantity = BigInt(input.purchasedQuantityMinor);
  const landedBig = BigInt(landed);

  const resultingQuantity = pQuantity + buyQuantity;
  if (resultingQuantity > MAX_SAFE) {
    throw new Error('Resulting quantity exceeded safe integer bounds');
  }
  const resultingValue = pValue + landedBig;
  if (resultingValue > MAX_SAFE) {
    throw new Error('Resulting inventory value exceeded safe integer bounds');
  }

  const latestPurchaseUnitCost = toSafeNumber(
    roundHalfUp(landedBig * scalePower(scale), buyQuantity),
    'latestPurchaseUnitCostCentavos',
  );

  const resultingPosition = buildInventoryCostPosition(
    toSafeNumber(resultingQuantity, 'resultingQuantityMinor'),
    scale,
    toSafeNumber(resultingValue, 'resultingInventoryValueCentavos'),
  );

  const costMovement = classifyMovement(pValue, pQuantity, resultingValue, resultingQuantity);

  const previousPosition = buildInventoryCostPosition(
    prev.quantityMinor,
    prev.quantityScale,
    prev.inventoryValueCentavos,
  );

  return freeze({
    previousPosition,
    resultingPosition,
    landedCostCentavos: landed,
    latestPurchaseUnitCostCentavos: latestPurchaseUnitCost,
    costMovement,
  });
}

/**
 * Consumes inventory at the current moving-average cost pool.
 *   consumedCost (COGS) = roundHalfUp(consumedQty × previousValue ÷ previousQuantity)
 *   remainingValue = previousValue - consumedCost   (exact integer conservation)
 *   remainingAverage is re-derived from the surviving quantity and value.
 * Full consumption yields exactly zero remaining quantity and zero remaining value.
 * Inputs are never mutated.
 */
export function consumeInventoryAtAverageCost(input: InventoryConsumptionInput): InventoryConsumptionResult {
  assertValidPosition(input.position);
  const pos = input.position;

  assertSafePositiveInteger(input.consumedQuantityMinor, 'consumedQuantityMinor');

  if (input.consumedQuantityMinor > pos.quantityMinor) {
    throw new Error('Consumption cannot exceed available inventory quantity');
  }

  const scale = pos.quantityScale;
  const pQuantity = BigInt(pos.quantityMinor);
  const pValue = BigInt(pos.inventoryValueCentavos);
  const consumed = BigInt(input.consumedQuantityMinor);

  const consumedCost = toSafeNumber(
    roundHalfUp(consumed * pValue, pQuantity),
    'consumedCostCentavos',
  );

  const remainingQuantity = toSafeNumber(pQuantity - consumed, 'remainingQuantityMinor');
  const remainingValue = toSafeNumber(pValue - BigInt(consumedCost), 'remainingInventoryValueCentavos');

  const remainingPosition = buildInventoryCostPosition(remainingQuantity, scale, remainingValue);

  return freeze({
    consumedQuantityMinor: input.consumedQuantityMinor,
    consumedCostCentavos: consumedCost,
    consumptionUnitCostCentavos: pos.averageUnitCostCentavos,
    remainingPosition,
  });
}

/**
 * Builds a deterministic, deep-frozen restock event from caller-supplied identity
 * and timestamp. No random IDs or timestamps are generated inside the engine.
 */
export function buildInventoryRestockEvent(input: InventoryRestockEventInput): InventoryRestockEvent {
  assertNonBlankString(input.eventId, 'eventId');
  assertNonBlankString(input.idempotencyKey, 'idempotencyKey');
  assertNonBlankString(input.inventoryItemId, 'inventoryItemId');
  assertSafeNonNegativeInteger(input.occurredAtEpochMs, 'occurredAtEpochMs');

  const restockResult = applyMovingAverageRestock(input.restock);

  const event = {
    eventId: input.eventId,
    idempotencyKey: input.idempotencyKey,
    inventoryItemId: input.inventoryItemId,
    occurredAtEpochMs: input.occurredAtEpochMs,
    purchasedQuantityMinor: input.restock.purchasedQuantityMinor,
    supplierCostCentavos: input.restock.supplierCostCentavos,
    freightCentavos: input.restock.freightCentavos ?? 0,
    otherAcquisitionCostCentavos: input.restock.otherAcquisitionCostCentavos ?? 0,
    landedCostCentavos: restockResult.landedCostCentavos,
    latestPurchaseUnitCostCentavos: restockResult.latestPurchaseUnitCostCentavos,
    costMovement: restockResult.costMovement,
    previousPosition: restockResult.previousPosition,
    resultingPosition: restockResult.resultingPosition,
  };

  return freeze(event);
}

/**
 * Analyzes the profitability impact of a restock using the existing shared pricing helpers.
 * The selling price is never automatically replaced; suggestions are advisory only.
 */
export function analyzeInventoryProfitabilityImpact(input: InventoryProfitabilityImpactInput): InventoryProfitabilityImpact {
  assertValidPosition(input.resultingPosition);
  assertSafeNonNegativeInteger(input.currentSellingPriceCentavos, 'currentSellingPriceCentavos');

  if (input.costMovement !== 'increased' && input.costMovement !== 'decreased' && input.costMovement !== 'unchanged') {
    throw new Error('costMovement must be increased, decreased, or unchanged');
  }

  const cost = input.resultingPosition.averageUnitCostCentavos;
  const sellingPrice = input.currentSellingPriceCentavos;

  const unitGrossProfitCentavos = sellingPrice - cost;
  const markupPercent = calculateMarkupPercentage(unitGrossProfitCentavos, cost);
  const grossMarginPercent = calculateGrossMarginPercentage(unitGrossProfitCentavos, sellingPrice);
  const breakEvenSellingPriceCentavos = calculateBreakEvenSellingPrice(cost);
  const marginScenariosRaw = generateMarginScenarios(cost, input.customTargetMarginPercent);

  const marginScenarios = marginScenariosRaw.map((scenario) => freeze({ ...scenario }));

  const result = {
    currentSellingPriceCentavos: sellingPrice,
    costPerSellingUnitCentavos: cost,
    breakEvenSellingPriceCentavos,
    unitGrossProfitCentavos,
    markupPercent,
    grossMarginPercent,
    costMovement: input.costMovement,
    marginScenarios,
  };

  return freeze(result);
}
