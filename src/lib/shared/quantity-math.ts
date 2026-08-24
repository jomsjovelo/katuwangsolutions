/**
 * Pure fixed-point mathematical primitives for retail variable-quantity calculations.
 * Uses checked BigInt arithmetic with deterministic half-up rounding.
 */

export const VALID_MEASURED_UNITS = ['kg', 'g', 'm', 'ft', 'l', 'ml'] as const;
export type MeasuredUnit = typeof VALID_MEASURED_UNITS[number];

export const VALID_DISCRETE_UNITS = [
  'pc', 'piece', 'btl', 'bottle', 'can', 'pack', 'box', 'sack', 'roll', 'bag', 'set', 'pair', 'unit'
] as const;

export const STANDARD_MEASURED_SCALE = 3; // 10^3 = 1000 minor units per major unit

/**
 * Checks whether a unit string is an approved measured unit.
 */
export function isMeasuredUnit(unit: string | undefined | null): unit is MeasuredUnit {
  if (!unit) return false;
  return (VALID_MEASURED_UNITS as readonly string[]).includes(unit.toLowerCase().trim());
}

/**
 * Validates the quantity scale. In first release, strictly locked to scale 3 (1000 minor units).
 */
export function isValidQuantityScale(scale: number): boolean {
  return scale === STANDARD_MEASURED_SCALE;
}

/**
 * Checks whether a measured product is low on stock, comparing against the product's configured minStockMinor.
 * If minStockMinor is not configured, defaults to 5000 minor units (e.g. 5.000 kg).
 */
export function isMeasuredLowStock(stockQuantityMinor: number | undefined | null, minStockMinor: number | undefined | null): boolean {
  if (stockQuantityMinor === undefined || stockQuantityMinor === null || !Number.isSafeInteger(stockQuantityMinor)) return false;
  if (stockQuantityMinor <= 0) return false; // Out of stock, not low stock
  const threshold = (minStockMinor !== undefined && minStockMinor !== null && Number.isSafeInteger(minStockMinor) && minStockMinor > 0)
    ? minStockMinor
    : 5000;
  return stockQuantityMinor <= threshold;
}

/**
 * Scale-aware conversion from minor units to major float units (for display purposes).
 */
export function minorToMajorUnits(quantityMinor: number, scale: number = STANDARD_MEASURED_SCALE): number {
  if (!Number.isSafeInteger(quantityMinor)) return 0;
  return quantityMinor / Math.pow(10, scale);
}

/**
 * Computes deterministic half-up rounded financial centavos using checked BigInt arithmetic:
 * roundedCentavos = roundHalfUp(unitPriceCentavos * quantityMinor / 10^scale)
 */
export function computeLineFinancials(
  unitPriceCentavos: number,
  quantityMinor: number,
  scale: number = STANDARD_MEASURED_SCALE
): number {
  if (!Number.isSafeInteger(unitPriceCentavos) || unitPriceCentavos < 0) {
    throw new Error(`Invalid unit price centavos: ${unitPriceCentavos}`);
  }
  if (!Number.isSafeInteger(quantityMinor) || quantityMinor <= 0) {
    throw new Error(`Invalid quantity minor: ${quantityMinor}`);
  }
  if (!isValidQuantityScale(scale)) {
    throw new Error(`Invalid quantity scale: ${scale}`);
  }

  // Cap bounds to prevent runaway inputs (e.g. max ₱10M unit price, max 10M minor units)
  if (unitPriceCentavos > 1_000_000_000 || quantityMinor > 10_000_000) {
    throw new Error('Input values exceed safe financial calculation bounds.');
  }

  const bigPrice = BigInt(unitPriceCentavos);
  const bigQty = BigInt(quantityMinor);
  const bigDivisor = BigInt(10 ** scale);
  const bigHalf = bigDivisor / BigInt(2);

  // Half-up rounding in BigInt: (price * qty + divisor / 2) / divisor
  const rawSubtotal = (bigPrice * bigQty + bigHalf) / bigDivisor;

  if (rawSubtotal > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Financial calculation resulted in integer overflow.');
  }

  return Number(rawSubtotal);
}

/**
 * Parses user decimal string input (e.g. "1.25", "0.5", "2") into integer minor units.
 */
export function parseDecimalToMinor(
  input: string | number,
  scale: number = STANDARD_MEASURED_SCALE
): { valid: boolean; minor: number; error?: string } {
  if (typeof input === 'number') {
    input = input.toString();
  }
  if (!input || typeof input !== 'string') {
    return { valid: false, minor: 0, error: 'Kailangan ng numero.' };
  }

  const clean = input.trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) {
    return { valid: false, minor: 0, error: 'Hindi wastong format ng numero.' };
  }

  const parts = clean.split('.');
  const wholePart = parts[0];
  const fracPart = parts[1] || '';

  if (fracPart.length > scale) {
    return { valid: false, minor: 0, error: `Hanggang ${scale} decimal places lamang ang tinatanggap.` };
  }

  const wholeNum = parseInt(wholePart, 10);
  if (!Number.isSafeInteger(wholeNum) || wholeNum > 10_000) {
    return { valid: false, minor: 0, error: 'Sobra sa pinakamalaking pinapayagang dami (10,000 max).' };
  }

  const paddedFrac = fracPart.padEnd(scale, '0');
  const fracNum = parseInt(paddedFrac, 10);

  const minor = wholeNum * (10 ** scale) + fracNum;
  if (minor <= 0) {
    return { valid: false, minor: 0, error: 'Kailangang mas mataas sa 0 ang dami.' };
  }

  return { valid: true, minor };
}

/**
 * Formats minor units into clean localized decimal string (e.g. 1250 minor, scale 3 -> "1.25").
 */
export function formatMinorToDecimal(
  minor: number,
  scale: number = STANDARD_MEASURED_SCALE
): string {
  if (!Number.isSafeInteger(minor) || minor <= 0) return '0';
  const divisor = 10 ** scale;
  const whole = Math.floor(minor / divisor);
  const frac = minor % divisor;

  if (frac === 0) {
    return whole.toString();
  }

  const fracStr = frac.toString().padStart(scale, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

/**
 * Formats full line quantity display (e.g. "1.25 kg", "3 pc", "2.5 m").
 */
export function formatQuantityDisplay(
  quantityMinorOrCount: number,
  mode: 'discrete' | 'measured' = 'discrete',
  unit: string = 'pc',
  scale: number = STANDARD_MEASURED_SCALE
): string {
  if (mode === 'measured') {
    const dec = formatMinorToDecimal(quantityMinorOrCount, scale);
    return `${dec} ${unit}`;
  }
  return `${quantityMinorOrCount} ${unit}`;
}
