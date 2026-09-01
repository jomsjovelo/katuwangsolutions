/**
 * Order Snap — Fixed-point Quantity and Cost-Allocation Arithmetic Primitives
 *
 * Invariants:
 * 1. Money is strictly safe integer centavos.
 * 2. Quantities are strictly fixed-point integer minor units with an explicit integer scale and canonical unit.
 * 3. Standard measured scale is 3 (10^3 = 1000 minor units per major unit: e.g. 1 L = 1000 minor units = 1 ml).
 * 4. Discrete items default to scale 0 (e.g. 3 pieces = 3 minor units).
 * 5. Unit registry is closed and explicit: unknown units fail closed.
 * 6. All component cost allocations use deterministic BigInt Round Half-Up arithmetic.
 * 7. Gross margins are represented in integer basis points (10,000 bps = 100%).
 * 8. All financial and quantity multiplications/additions are bounds-checked and overflow-protected.
 * 9. String sorting uses deterministic ASCII code-point comparison.
 */

export const STANDARD_MEASURED_SCALE = 3;
export const STANDARD_DISCRETE_SCALE = 0;

export const MAX_SAFE_CENTAVOS = 1_000_000_000_00; // ₱1,000,000,000.00
export const MAX_SAFE_QUANTITY_MINOR = 1_000_000_000; // 1,000,000 major units at scale 3
export const MAX_SAFE_QUANTITY_COUNT = 1_000_000; // 1,000,000 line units

export type UnitFamily = 'volume' | 'mass' | 'discrete';

export interface QuantitySpec {
  readonly quantityMinor: number;
  readonly quantityScale: number;
  readonly unit: string;
}

export interface UnitMetadata {
  readonly canonicalUnit: string;
  readonly family: UnitFamily;
  readonly standardScale: number;
}

const CANONICAL_UNIT_REGISTRY: Record<string, UnitMetadata> = {
  // Volume family (Canonical: 'L', Scale 3 -> 1 minor unit = 1 ml)
  'l': { canonicalUnit: 'L', family: 'volume', standardScale: 3 },
  'liter': { canonicalUnit: 'L', family: 'volume', standardScale: 3 },
  'liters': { canonicalUnit: 'L', family: 'volume', standardScale: 3 },
  'litre': { canonicalUnit: 'L', family: 'volume', standardScale: 3 },
  'litres': { canonicalUnit: 'L', family: 'volume', standardScale: 3 },
  'ml': { canonicalUnit: 'L', family: 'volume', standardScale: 3 },
  'milliliter': { canonicalUnit: 'L', family: 'volume', standardScale: 3 },
  'milliliters': { canonicalUnit: 'L', family: 'volume', standardScale: 3 },
  'millilitre': { canonicalUnit: 'L', family: 'volume', standardScale: 3 },
  'millilitres': { canonicalUnit: 'L', family: 'volume', standardScale: 3 },

  // Mass family (Canonical: 'kg', Scale 3 -> 1 minor unit = 1 g)
  'kg': { canonicalUnit: 'kg', family: 'mass', standardScale: 3 },
  'kilogram': { canonicalUnit: 'kg', family: 'mass', standardScale: 3 },
  'kilograms': { canonicalUnit: 'kg', family: 'mass', standardScale: 3 },
  'g': { canonicalUnit: 'kg', family: 'mass', standardScale: 3 },
  'gram': { canonicalUnit: 'kg', family: 'mass', standardScale: 3 },
  'grams': { canonicalUnit: 'kg', family: 'mass', standardScale: 3 },

  // Discrete family (Canonical: per-item descriptor, Scale 0)
  'piece': { canonicalUnit: 'piece', family: 'discrete', standardScale: 0 },
  'pieces': { canonicalUnit: 'piece', family: 'discrete', standardScale: 0 },
  'pc': { canonicalUnit: 'piece', family: 'discrete', standardScale: 0 },
  'pcs': { canonicalUnit: 'piece', family: 'discrete', standardScale: 0 },
  'pump': { canonicalUnit: 'pump', family: 'discrete', standardScale: 0 },
  'pumps': { canonicalUnit: 'pump', family: 'discrete', standardScale: 0 },
  'cup': { canonicalUnit: 'cup', family: 'discrete', standardScale: 0 },
  'cups': { canonicalUnit: 'cup', family: 'discrete', standardScale: 0 },
  'lid': { canonicalUnit: 'lid', family: 'discrete', standardScale: 0 },
  'lids': { canonicalUnit: 'lid', family: 'discrete', standardScale: 0 },
  'straw': { canonicalUnit: 'straw', family: 'discrete', standardScale: 0 },
  'straws': { canonicalUnit: 'straw', family: 'discrete', standardScale: 0 },
  'can': { canonicalUnit: 'can', family: 'discrete', standardScale: 0 },
  'cans': { canonicalUnit: 'can', family: 'discrete', standardScale: 0 },
  'bottle': { canonicalUnit: 'bottle', family: 'discrete', standardScale: 0 },
  'bottles': { canonicalUnit: 'bottle', family: 'discrete', standardScale: 0 },
  'btl': { canonicalUnit: 'bottle', family: 'discrete', standardScale: 0 },
  'btls': { canonicalUnit: 'bottle', family: 'discrete', standardScale: 0 },
  'pack': { canonicalUnit: 'pack', family: 'discrete', standardScale: 0 },
  'packs': { canonicalUnit: 'pack', family: 'discrete', standardScale: 0 },
  'box': { canonicalUnit: 'box', family: 'discrete', standardScale: 0 },
  'boxes': { canonicalUnit: 'box', family: 'discrete', standardScale: 0 },
  'serving': { canonicalUnit: 'serving', family: 'discrete', standardScale: 0 },
  'servings': { canonicalUnit: 'serving', family: 'discrete', standardScale: 0 },
  'shot': { canonicalUnit: 'shot', family: 'discrete', standardScale: 0 },
  'shots': { canonicalUnit: 'shot', family: 'discrete', standardScale: 0 },
  'sachet': { canonicalUnit: 'sachet', family: 'discrete', standardScale: 0 },
  'sachets': { canonicalUnit: 'sachet', family: 'discrete', standardScale: 0 },
  'portion': { canonicalUnit: 'portion', family: 'discrete', standardScale: 0 },
  'portions': { canonicalUnit: 'portion', family: 'discrete', standardScale: 0 },
  'scoop': { canonicalUnit: 'scoop', family: 'discrete', standardScale: 0 },
  'scoops': { canonicalUnit: 'scoop', family: 'discrete', standardScale: 0 },
  'slice': { canonicalUnit: 'slice', family: 'discrete', standardScale: 0 },
  'slices': { canonicalUnit: 'slice', family: 'discrete', standardScale: 0 },
  'unit': { canonicalUnit: 'unit', family: 'discrete', standardScale: 0 },
  'units': { canonicalUnit: 'unit', family: 'discrete', standardScale: 0 }
};

/**
 * Deterministic ASCII code-point string comparator.
 */
export function asciiCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Normalizes a unit string to its canonical representation and family.
 * Fails closed on any unregistered or ambiguous unit.
 */
export function getUnitMetadata(unit: string): UnitMetadata {
  if (!unit || typeof unit !== 'string') {
    throw new Error('Unit must be a non-empty string.');
  }
  const clean = unit.trim().toLowerCase();
  const meta = CANONICAL_UNIT_REGISTRY[clean];
  if (!meta) {
    throw new Error(`Unknown or unsupported unit: "${unit}". Unit must be explicitly registered.`);
  }
  return meta;
}

/**
 * Validates that a quantity scale is a valid non-negative integer between 0 and 4.
 */
export function isValidQuantityScale(scale: number): boolean {
  return Number.isSafeInteger(scale) && scale >= 0 && scale <= 4;
}

/**
 * Validates money in integer centavos.
 */
export function validateMoneyCentavos(centavos: number, allowNegative: boolean = false): void {
  if (!Number.isSafeInteger(centavos)) {
    throw new Error(`Money centavos must be a safe integer, received: ${centavos}`);
  }
  if (!allowNegative && centavos < 0) {
    throw new Error(`Money centavos cannot be negative, received: ${centavos}`);
  }
  if (Math.abs(centavos) > MAX_SAFE_CENTAVOS) {
    throw new Error(`Money centavos exceeds maximum safe bounds (${MAX_SAFE_CENTAVOS}): ${centavos}`);
  }
}

/**
 * Validates quantity specification invariants.
 */
export function validateQuantitySpec(spec: QuantitySpec, allowNegative: boolean = false): void {
  if (!spec || typeof spec !== 'object') {
    throw new Error('Invalid quantity specification object.');
  }
  if (!Number.isSafeInteger(spec.quantityMinor)) {
    throw new Error(`quantityMinor must be a safe integer, received: ${spec.quantityMinor}`);
  }
  if (!allowNegative && spec.quantityMinor < 0) {
    throw new Error(`quantityMinor cannot be negative, received: ${spec.quantityMinor}`);
  }
  if (Math.abs(spec.quantityMinor) > MAX_SAFE_QUANTITY_MINOR) {
    throw new Error(`quantityMinor exceeds maximum safe bounds (${MAX_SAFE_QUANTITY_MINOR}): ${spec.quantityMinor}`);
  }
  if (!isValidQuantityScale(spec.quantityScale)) {
    throw new Error(`Invalid quantityScale: ${spec.quantityScale}. Must be an integer between 0 and 4.`);
  }
  if (!spec.unit || typeof spec.unit !== 'string' || spec.unit.trim().length === 0) {
    throw new Error('unit must be a non-empty string.');
  }
  const meta = getUnitMetadata(spec.unit);
  if (meta.canonicalUnit !== spec.unit) {
    throw new Error(`Unit "${spec.unit}" is not in canonical form. Expected "${meta.canonicalUnit}".`);
  }
}

/**
 * Checks if two units belong to the same physical unit family (e.g. 'L' and 'ml', 'kg' and 'g').
 */
export function areUnitsCompatible(unitA: string, unitB: string): boolean {
  try {
    const metaA = getUnitMetadata(unitA);
    const metaB = getUnitMetadata(unitB);
    if (metaA.family !== metaB.family) return false;
    if (metaA.family === 'discrete') {
      return metaA.canonicalUnit.toLowerCase() === metaB.canonicalUnit.toLowerCase();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a validated QuantitySpec in canonical unit and scale.
 */
export function createQuantitySpec(
  quantityMinor: number,
  quantityScale: number,
  unit: string
): QuantitySpec {
  const meta = getUnitMetadata(unit);
  if (quantityScale !== meta.standardScale) {
    throw new Error(
      `Scale mismatch for unit "${unit}". Expected standard scale ${meta.standardScale}, received: ${quantityScale}`
    );
  }
  const spec: QuantitySpec = {
    quantityMinor,
    quantityScale,
    unit: meta.canonicalUnit
  };
  validateQuantitySpec(spec);
  return spec;
}

/**
 * Parses user input decimal or integer into canonical QuantitySpec.
 * Rejects partially numeric strings (e.g. '250ml', '250abc').
 */
export function parseQuantityInput(
  input: string | number,
  unit: string,
  explicitScale?: number
): QuantitySpec {
  const meta = getUnitMetadata(unit);
  const scale = explicitScale !== undefined ? explicitScale : meta.standardScale;

  if (scale !== meta.standardScale) {
    throw new Error(
      `Scale mismatch for unit "${unit}". Expected scale ${meta.standardScale}, received: ${scale}`
    );
  }

  const rawUnitClean = unit.trim().toLowerCase();

  // Validate complete string before any parsing
  const str = String(input).trim();
  if (str.length === 0) {
    throw new Error('Quantity input cannot be empty.');
  }

  // Handle sub-units like ml or g: input must be strict non-negative integer string
  if (meta.family === 'volume' && rawUnitClean !== 'l' && rawUnitClean !== 'liter' && rawUnitClean !== 'litre' && rawUnitClean !== 'liters' && rawUnitClean !== 'litres') {
    if (!/^\d+$/.test(str)) {
      throw new Error(`Sub-unit milliliter quantity must be a non-negative integer string, received: ${input}`);
    }
    const num = Number(str);
    if (!Number.isSafeInteger(num) || num < 0) {
      throw new Error(`Sub-unit milliliter quantity must be a non-negative safe integer, received: ${input}`);
    }
    return createQuantitySpec(num, 3, 'L');
  }

  if (meta.family === 'mass' && rawUnitClean !== 'kg' && rawUnitClean !== 'kilogram' && rawUnitClean !== 'kilograms') {
    if (!/^\d+$/.test(str)) {
      throw new Error(`Sub-unit gram quantity must be a non-negative integer string, received: ${input}`);
    }
    const num = Number(str);
    if (!Number.isSafeInteger(num) || num < 0) {
      throw new Error(`Sub-unit gram quantity must be a non-negative safe integer, received: ${input}`);
    }
    return createQuantitySpec(num, 3, 'kg');
  }

  if (scale === 0) {
    // Discrete: MUST be strictly digits only
    if (!/^\d+$/.test(str)) {
      throw new Error(`Discrete quantity for unit "${meta.canonicalUnit}" must be a non-negative whole integer string, received: "${input}".`);
    }
    const val = Number(str);
    if (!Number.isSafeInteger(val)) {
      throw new Error('Quantity exceeds safe integer limits.');
    }
    return createQuantitySpec(val, 0, meta.canonicalUnit);
  }

  // Measured scale > 0: must be exact decimal format digits(.digits)?
  if (!/^\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid decimal quantity format: "${input}"`);
  }

  const parts = str.split('.');
  const whole = Number(parts[0]);
  const frac = parts[1] || '';

  if (frac.length > scale) {
    throw new Error(`Quantity exceeds maximum configured decimal places (${scale}).`);
  }

  if (!Number.isSafeInteger(whole)) {
    throw new Error('Quantity exceeds safe integer limits.');
  }

  const paddedFrac = frac.padEnd(scale, '0');
  const fracNum = Number(paddedFrac);
  const minor = whole * (10 ** scale) + fracNum;

  return createQuantitySpec(minor, scale, meta.canonicalUnit);
}

/**
 * Formats QuantitySpec into a clean localized decimal string (e.g. 1500 minor, scale 3, L -> "1.5 L").
 */
export function formatQuantitySpec(spec: QuantitySpec): string {
  validateQuantitySpec(spec);
  if (spec.quantityScale === 0) {
    return `${spec.quantityMinor} ${spec.unit}`;
  }
  const divisor = 10 ** spec.quantityScale;
  const whole = Math.floor(spec.quantityMinor / divisor);
  const frac = spec.quantityMinor % divisor;

  if (frac === 0) {
    return `${whole} ${spec.unit}`;
  }
  const fracStr = frac.toString().padStart(spec.quantityScale, '0').replace(/0+$/, '');
  return `${whole}.${fracStr} ${spec.unit}`;
}

/**
 * Pure BigInt Round Half-Up integer division:
 * result = floor((numerator + denominator / 2) / denominator)
 */
export function roundHalfUpBigInt(numerator: bigint, denominator: bigint): bigint {
  if (denominator === BigInt(0)) {
    throw new Error('Division by zero in calculation.');
  }
  if (denominator < BigInt(0)) {
    numerator = -numerator;
    denominator = -denominator;
  }
  if (numerator < BigInt(0)) {
    // Negative rounding (for discounts / negative deltas): half away from zero
    const half = denominator / BigInt(2);
    return (numerator - half) / denominator;
  }
  const half = denominator / BigInt(2);
  return (numerator + half) / denominator;
}

/**
 * Pure deterministic component cost allocation:
 * Given a consumed quantity in minor units, and an ingredient cost basis:
 * componentCostCentavos = roundHalfUp(consumedQuantityMinor * basisCostCentavos / basisQuantityMinor)
 */
export function calculateProportionalCost(
  consumedQuantityMinor: number,
  basisQuantityMinor: number,
  basisCostCentavos: number
): number {
  if (!Number.isSafeInteger(consumedQuantityMinor) || consumedQuantityMinor < 0) {
    throw new Error(`Consumed quantity must be a non-negative safe integer: ${consumedQuantityMinor}`);
  }
  if (!Number.isSafeInteger(basisQuantityMinor) || basisQuantityMinor <= 0) {
    throw new Error(`Cost basis quantity must be a positive safe integer: ${basisQuantityMinor}`);
  }
  if (!Number.isSafeInteger(basisCostCentavos) || basisCostCentavos < 0) {
    throw new Error(`Cost basis centavos must be a non-negative safe integer: ${basisCostCentavos}`);
  }

  if (consumedQuantityMinor === 0 || basisCostCentavos === 0) {
    return 0;
  }

  const bigConsumed = BigInt(consumedQuantityMinor);
  const bigCost = BigInt(basisCostCentavos);
  const bigBasis = BigInt(basisQuantityMinor);

  const bigProduct = bigConsumed * bigCost;
  const roundedCentavos = roundHalfUpBigInt(bigProduct, bigBasis);

  if (roundedCentavos > BigInt(MAX_SAFE_CENTAVOS) || roundedCentavos > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Proportional cost calculation resulted in integer overflow.');
  }

  return Number(roundedCentavos);
}

/**
 * Checked safe integer addition for quantity minor units.
 */
export function safeAddQuantityMinor(a: number, b: number, allowNegative: boolean = false): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new Error(`Quantity minor addition requires safe integers, received: a=${a}, b=${b}`);
  }
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) {
    throw new Error(`Quantity minor addition resulted in integer overflow: ${a} + ${b}`);
  }
  if (!allowNegative && sum < 0) {
    throw new Error(`Quantity minor cannot be negative: ${sum}`);
  }
  if (Math.abs(sum) > MAX_SAFE_QUANTITY_MINOR) {
    throw new Error(`Quantity minor exceeded maximum safe bounds (${MAX_SAFE_QUANTITY_MINOR}): ${sum}`);
  }
  return sum;
}

/**
 * Checked BigInt addition for money centavos.
 */
export function safeAddMoney(a: number, b: number, allowNegative: boolean = false): number {
  validateMoneyCentavos(a, true);
  validateMoneyCentavos(b, true);
  const sum = BigInt(a) + BigInt(b);
  if (!allowNegative && sum < BigInt(0)) {
    throw new Error(`Resulting money cannot be negative: ${sum}`);
  }
  if (sum > BigInt(MAX_SAFE_CENTAVOS) || sum < BigInt(-MAX_SAFE_CENTAVOS)) {
    throw new Error(`Money addition exceeded safe bounds: ${sum}`);
  }
  return Number(sum);
}

/**
 * Checked BigInt multiplication for quantity minor units (e.g. per-serving ingredient qty * line quantity).
 * Enforces MAX_SAFE_QUANTITY_MINOR bounds. Fails closed on overflow.
 */
export function safeMultiplyQuantityMinor(perServingQty: number, lineQuantity: number): number {
  if (!Number.isSafeInteger(perServingQty) || perServingQty < 0) {
    throw new Error(`safeMultiplyQuantityMinor: perServingQty must be a non-negative safe integer, got ${perServingQty}`);
  }
  if (!Number.isSafeInteger(lineQuantity) || lineQuantity <= 0 || lineQuantity > MAX_SAFE_QUANTITY_COUNT) {
    throw new Error(`safeMultiplyQuantityMinor: lineQuantity must be a positive safe integer <= ${MAX_SAFE_QUANTITY_COUNT}, got ${lineQuantity}`);
  }
  const product = BigInt(perServingQty) * BigInt(lineQuantity);
  if (product > BigInt(MAX_SAFE_QUANTITY_MINOR) || product < BigInt(0)) {
    throw new Error(`safeMultiplyQuantityMinor: multiplication ${perServingQty} * ${lineQuantity} exceeds safe quantity bounds (${MAX_SAFE_QUANTITY_MINOR}): got ${product}`);
  }
  return Number(product);
}

/**
 * Checked BigInt multiplication for line money totals (unit price / unit cogs * quantity).
 */
export function safeMultiplyMoney(unitAmountCentavos: number, quantity: number): number {
  validateMoneyCentavos(unitAmountCentavos, true);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_SAFE_QUANTITY_COUNT) {
    throw new Error(`Invalid line quantity: ${quantity}. Must be positive safe integer <= ${MAX_SAFE_QUANTITY_COUNT}.`);
  }
  const total = BigInt(unitAmountCentavos) * BigInt(quantity);
  if (total > BigInt(MAX_SAFE_CENTAVOS) || total < BigInt(-MAX_SAFE_CENTAVOS)) {
    throw new Error(`Line total exceeded safe financial bounds: ${total}`);
  }
  return Number(total);
}

/**
 * Calculates gross margin in integer basis points (10000 bps = 100.00%) using BigInt Round Half-Up.
 */
export function calculateGrossMarginBasisPoints(profitCentavos: number, revenueCentavos: number): number {
  validateMoneyCentavos(profitCentavos, true);
  validateMoneyCentavos(revenueCentavos, false);
  if (revenueCentavos === 0) return 0;
  const numerator = BigInt(profitCentavos) * BigInt(10000);
  const denominator = BigInt(revenueCentavos);
  const bps = roundHalfUpBigInt(numerator, denominator);
  return Number(bps);
}

/**
 * Recursively deep freezes an object to make it genuinely immutable.
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = (obj as any)[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj as Readonly<T>;
}
