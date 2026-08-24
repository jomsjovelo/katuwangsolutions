/**
 * Canonical Smart Pricing financial math for Katuwang Benta Snap.
 * Pure local calculation layer with checked BigInt/integer arithmetic.
 * No floating-point math is used for authoritative money calculations.
 */

import {
  computeLineFinancials,
  parseDecimalToMinor,
  minorToMajorUnits,
  STANDARD_MEASURED_SCALE,
  isMeasuredUnit
} from './quantity-math';

export interface SellableQuantitySpec {
  quantity: number;
  mode: 'discrete' | 'measured';
  unit: string;
  minor?: number;
  scale?: number;
}

export interface MarginScenario {
  targetMarginPercent: number;
  targetPriceCentavos: number;
  label: string;
  markupPercent: number;
  unitGrossProfitCentavos: number;
  actualGrossMarginPercent: number;
}

export interface SmartPricingInput {
  purchaseQuantity: number | string;
  purchaseUnit: string;
  supplierCostCentavos: number;
  deliveryFreightCentavos?: number;
  otherAcquisitionCostCentavos?: number;
  sellingUnit: string;
  sellableQuantity?: number | string;
  sellableQuantityMinor?: number;
  sellingPriceCentavos?: number;
  targetGrossMarginPercent?: number;
}

export interface SmartPricingResult {
  totalLandedCostCentavos: number;
  costPerSellingUnitCentavos: number;
  sellingPriceCentavos: number;
  breakEvenPriceCentavos: number;
  projectedRevenueCentavos: number;
  projectedGrossProfitCentavos: number;
  markupPercent: number;
  grossMarginPercent: number;
  marginScenarios: MarginScenario[];
  isDifferentUnit: boolean;
  sellableSpec: SellableQuantitySpec;
}

/**
 * Parses user input in Pesos (string or number) into integer centavos.
 * Rejects invalid strings, multiple decimal points, negative numbers, or > 2 decimal places.
 */
export function parsePesoToCentavos(input: string | number | undefined | null): { valid: boolean; centavos: number; error?: string } {
  if (input === undefined || input === null || input === '') {
    return { valid: true, centavos: 0 };
  }

  const str = typeof input === 'number' ? input.toString() : input.toString().trim().replace(/,/g, '');
  if (!str) return { valid: true, centavos: 0 };

  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    return { valid: false, centavos: 0, error: 'Invalid peso format. Example: 150 or 150.50' };
  }

  const parts = str.split('.');
  const whole = parseInt(parts[0], 10);
  const fraction = parts.length > 1 ? parts[1].padEnd(2, '0') : '00';
  const fracVal = parseInt(fraction.slice(0, 2), 10);

  if (!Number.isSafeInteger(whole) || whole < 0) {
    return { valid: false, centavos: 0, error: 'Value exceeds safe numerical limits.' };
  }

  const centavos = whole * 100 + fracVal;
  if (!Number.isSafeInteger(centavos) || centavos > 1_000_000_000_00) { // Max ₱100M
    return { valid: false, centavos: 0, error: 'Value exceeds maximum supported financial bounds.' };
  }

  return { valid: true, centavos };
}

/**
 * Formats integer centavos into a standard peso display string: e.g. 11500 -> "115.00".
 */
export function formatCentavosToPeso(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) return '0.00';
  const isNegative = centavos < 0;
  const abs = Math.abs(centavos);
  const pesos = Math.floor(abs / 100);
  const cents = (abs % 100).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${pesos}.${cents}`;
}

/**
 * Calculates Total Landed Cost:
 * Landed Cost = Supplier Cost + Delivery/Freight + Other Acquisition Cost
 */
export function calculateLandedCost(
  supplierCostCentavos: number,
  deliveryFreightCentavos: number = 0,
  otherAcquisitionCostCentavos: number = 0
): number {
  if (!Number.isSafeInteger(supplierCostCentavos) || supplierCostCentavos < 0) {
    throw new Error('Supplier cost must be a non-negative integer in centavos.');
  }
  if (!Number.isSafeInteger(deliveryFreightCentavos) || deliveryFreightCentavos < 0) {
    throw new Error('Delivery freight cost must be a non-negative integer in centavos.');
  }
  if (!Number.isSafeInteger(otherAcquisitionCostCentavos) || otherAcquisitionCostCentavos < 0) {
    throw new Error('Other acquisition cost must be a non-negative integer in centavos.');
  }

  const total = BigInt(supplierCostCentavos) + BigInt(deliveryFreightCentavos) + BigInt(otherAcquisitionCostCentavos);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Landed cost calculation exceeded numerical bounds.');
  }
  return Number(total);
}

/**
 * Calculates conservative cost per selling unit with upward rounding to nearest centavo.
 * Ensures the business never under-recovers landed cost per unit sold.
 */
export function calculateCostPerSellingUnit(
  landedCostCentavos: number,
  sellableSpec: SellableQuantitySpec
): number {
  if (!Number.isSafeInteger(landedCostCentavos) || landedCostCentavos < 0) {
    throw new Error('Landed cost must be a non-negative integer in centavos.');
  }

  if (landedCostCentavos === 0) return 0;

  const isMeasured = sellableSpec.mode === 'measured' || isMeasuredUnit(sellableSpec.unit);
  const scale = sellableSpec.scale || STANDARD_MEASURED_SCALE;

  if (isMeasured) {
    let minor = sellableSpec.minor;
    if (minor === undefined) {
      const parsed = parseDecimalToMinor(sellableSpec.quantity, scale);
      if (!parsed.valid || parsed.minor <= 0) {
        throw new Error('Sellable measured quantity must be greater than zero.');
      }
      minor = parsed.minor;
    }

    if (!Number.isSafeInteger(minor) || minor <= 0) {
      throw new Error('Sellable measured quantity must be greater than zero.');
    }

    // Upward rounding in BigInt:
    // costPerUnitCentavos = ceil(landedCostCentavos * 10^scale / minor)
    const numerator = BigInt(landedCostCentavos) * BigInt(10 ** scale);
    const denominator = BigInt(minor);
    const costPerUnit = (numerator + denominator - BigInt(1)) / denominator;

    if (costPerUnit > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Cost per selling unit exceeded numerical bounds.');
    }
    return Number(costPerUnit);
  } else {
    // Discrete unit: MUST be a positive safe integer. Rejects fractional quantities.
    const count = typeof sellableSpec.quantity === 'number'
      ? sellableSpec.quantity
      : parseFloat(String(sellableSpec.quantity));

    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new Error('Discrete sellable quantity must be a positive whole number.');
    }

    // Upward rounding in BigInt: ceil(landedCostCentavos / count)
    const numerator = BigInt(landedCostCentavos);
    const denominator = BigInt(count);
    const costPerUnit = (numerator + denominator - BigInt(1)) / denominator;

    if (costPerUnit > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Cost per selling unit exceeded numerical bounds.');
    }
    return Number(costPerUnit);
  }
}

/**
 * Calculates Projected Revenue across the entire batch at the specified selling price.
 */
export function calculateProjectedRevenue(
  salePriceCentavos: number,
  sellableSpec: SellableQuantitySpec
): number {
  if (!Number.isSafeInteger(salePriceCentavos) || salePriceCentavos < 0) {
    throw new Error('Sale price must be a non-negative integer in centavos.');
  }
  if (salePriceCentavos === 0) return 0;

  const isMeasured = sellableSpec.mode === 'measured' || isMeasuredUnit(sellableSpec.unit);
  const scale = sellableSpec.scale || STANDARD_MEASURED_SCALE;

  if (isMeasured) {
    let minor = sellableSpec.minor;
    if (minor === undefined) {
      const parsed = parseDecimalToMinor(sellableSpec.quantity, scale);
      if (!parsed.valid || parsed.minor <= 0) {
        throw new Error('Sellable measured quantity must be greater than zero.');
      }
      minor = parsed.minor;
    }
    return computeLineFinancials(salePriceCentavos, minor, scale);
  } else {
    const count = typeof sellableSpec.quantity === 'number'
      ? sellableSpec.quantity
      : parseFloat(String(sellableSpec.quantity));

    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new Error('Discrete sellable quantity must be a positive whole number.');
    }
    const rev = BigInt(salePriceCentavos) * BigInt(count);
    if (rev > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Projected revenue exceeded numerical bounds.');
    }
    return Number(rev);
  }
}

/**
 * Calculates Projected Gross Profit:
 * Gross Profit = Projected Revenue - Total Landed Cost
 */
export function calculateProjectedGrossProfit(
  projectedRevenueCentavos: number,
  totalLandedCostCentavos: number
): number {
  if (!Number.isSafeInteger(projectedRevenueCentavos)) {
    throw new Error('Projected revenue must be a valid integer in centavos.');
  }
  if (!Number.isSafeInteger(totalLandedCostCentavos)) {
    throw new Error('Total landed cost must be a valid integer in centavos.');
  }
  return projectedRevenueCentavos - totalLandedCostCentavos;
}

/**
 * Calculates Markup percentage rounded to 2 decimal places:
 * Markup = (Gross Profit / Cost) * 100
 */
export function calculateMarkupPercentage(
  grossProfitCentavos: number,
  totalCostCentavos: number
): number {
  if (totalCostCentavos <= 0) return 0;
  const raw = (grossProfitCentavos / totalCostCentavos) * 100;
  return Math.round(raw * 100) / 100;
}

/**
 * Calculates Gross Margin percentage rounded to 2 decimal places:
 * Gross Margin = (Gross Profit / Revenue) * 100
 */
export function calculateGrossMarginPercentage(
  grossProfitCentavos: number,
  projectedRevenueCentavos: number
): number {
  if (projectedRevenueCentavos <= 0) return 0;
  const raw = (grossProfitCentavos / projectedRevenueCentavos) * 100;
  return Math.round(raw * 100) / 100;
}

/**
 * Calculates Break-even Selling Price per unit (equals conservative cost per unit).
 */
export function calculateBreakEvenSellingPrice(costPerSellingUnitCentavos: number): number {
  if (!Number.isSafeInteger(costPerSellingUnitCentavos) || costPerSellingUnitCentavos < 0) {
    throw new Error('Cost per selling unit must be a non-negative integer in centavos.');
  }
  return costPerSellingUnitCentavos;
}

/**
 * Calculates required selling price for a target gross margin percentage (0% to 95%).
 * Formula: Target Price = Cost / (1 - Target Margin)
 * Rounds UPWARD to the nearest centavo to guarantee meeting or slightly exceeding the target margin.
 */
export function calculateTargetMarginPrice(
  costPerSellingUnitCentavos: number,
  targetMarginPercent: number
): number {
  if (!Number.isSafeInteger(costPerSellingUnitCentavos) || costPerSellingUnitCentavos < 0) {
    throw new Error('Cost per selling unit must be a non-negative integer in centavos.');
  }
  if (typeof targetMarginPercent !== 'number' || isNaN(targetMarginPercent) || targetMarginPercent < 0 || targetMarginPercent > 95) {
    throw new Error('Target gross margin must be a number between 0% and 95%.');
  }

  if (costPerSellingUnitCentavos === 0) return 0;
  if (targetMarginPercent === 0) return costPerSellingUnitCentavos;

  // Represent target margin in basis points (0 to 9500)
  const marginBasisPoints = Math.round(targetMarginPercent * 100);
  const divisor = BigInt(10000) - BigInt(marginBasisPoints);
  if (divisor <= BigInt(0)) {
    throw new Error('Invalid target margin divisor.');
  }

  // Upward ceiling division in BigInt:
  // TargetPriceCentavos = ceil(costPerSellingUnitCentavos * 10000 / (10000 - marginBasisPoints))
  const numerator = BigInt(costPerSellingUnitCentavos) * BigInt(10000);
  const targetPrice = (numerator + divisor - BigInt(1)) / divisor;

  if (targetPrice > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Target margin price exceeded numerical bounds.');
  }

  return Number(targetPrice);
}

/**
 * Generates explainable 10%, 20%, 30%, and optional custom target margin price scenarios.
 */
export function generateMarginScenarios(
  costPerSellingUnitCentavos: number,
  customMarginPercent?: number
): MarginScenario[] {
  const targets = [10, 20, 30];
  if (
    customMarginPercent !== undefined &&
    typeof customMarginPercent === 'number' &&
    !isNaN(customMarginPercent) &&
    customMarginPercent >= 0 &&
    customMarginPercent <= 95 &&
    !targets.includes(customMarginPercent)
  ) {
    targets.push(customMarginPercent);
    targets.sort((a, b) => a - b);
  }

  return targets.map(target => {
    const targetPriceCentavos = calculateTargetMarginPrice(costPerSellingUnitCentavos, target);
    const unitGrossProfitCentavos = targetPriceCentavos - costPerSellingUnitCentavos;
    const markupPercent = calculateMarkupPercentage(unitGrossProfitCentavos, costPerSellingUnitCentavos);
    const actualGrossMarginPercent = calculateGrossMarginPercentage(unitGrossProfitCentavos, targetPriceCentavos);
    const isCustom = customMarginPercent !== undefined && target === customMarginPercent && ![10, 20, 30].includes(target);

    return {
      targetMarginPercent: target,
      targetPriceCentavos,
      label: isCustom ? `Custom (${target}% Gross Margin)` : `${target}% Gross Margin`,
      markupPercent,
      unitGrossProfitCentavos,
      actualGrossMarginPercent
    };
  });
}

/**
 * Orchestrates complete end-to-end Smart Pricing analysis.
 */
export function computeSmartPricing(input: SmartPricingInput): SmartPricingResult {
  const {
    purchaseQuantity,
    purchaseUnit,
    supplierCostCentavos,
    deliveryFreightCentavos = 0,
    otherAcquisitionCostCentavos = 0,
    sellingUnit,
    sellableQuantity,
    sellableQuantityMinor,
    sellingPriceCentavos = 0,
    targetGrossMarginPercent
  } = input;

  if (!purchaseUnit || typeof purchaseUnit !== 'string') {
    throw new Error('Purchase unit is required.');
  }
  if (!sellingUnit || typeof sellingUnit !== 'string') {
    throw new Error('Selling unit is required.');
  }

  const scale = STANDARD_MEASURED_SCALE;
  const isPurchaseMeasured = isMeasuredUnit(purchaseUnit);
  const isSellingMeasured = isMeasuredUnit(sellingUnit);
  const isDifferentUnit = purchaseUnit.trim().toLowerCase() !== sellingUnit.trim().toLowerCase();

  let parsedPurchaseMinor: number | undefined;
  let parsedPurchaseDiscreteCount: number | undefined;

  if (isPurchaseMeasured) {
    const parsed = parseDecimalToMinor(purchaseQuantity, scale);
    if (!parsed.valid || parsed.minor <= 0) {
      throw new Error('Purchase quantity must be a positive measured amount (e.g. 10.5 kg).');
    }
    parsedPurchaseMinor = parsed.minor;
  } else {
    const pStr = String(purchaseQuantity).trim();
    if (!/^\d+$/.test(pStr) || parseInt(pStr, 10) <= 0) {
      throw new Error('Discrete purchase quantity must be a positive whole number.');
    }
    parsedPurchaseDiscreteCount = parseInt(pStr, 10);
  }

  let effectiveSellableMinor: number | undefined = sellableQuantityMinor;
  let effectiveSellableQty: number;

  if (!isDifferentUnit) {
    // Same unit: derive directly from purchase quantity
    if (isSellingMeasured) {
      effectiveSellableMinor = parsedPurchaseMinor!;
      effectiveSellableQty = minorToMajorUnits(effectiveSellableMinor, scale);
    } else {
      effectiveSellableQty = parsedPurchaseDiscreteCount!;
    }
  } else {
    // Different unit: require Total Sellable Quantity
    if (sellableQuantity === undefined || sellableQuantity === null || sellableQuantity === '') {
      throw new Error('Total sellable quantity is required when purchase and selling units differ.');
    }

    if (isSellingMeasured) {
      if (effectiveSellableMinor === undefined) {
        const parsed = parseDecimalToMinor(sellableQuantity, scale);
        if (!parsed.valid || parsed.minor <= 0) {
          throw new Error('Sellable measured quantity must be a positive amount.');
        }
        effectiveSellableMinor = parsed.minor;
      }
      effectiveSellableQty = minorToMajorUnits(effectiveSellableMinor, scale);
    } else {
      const sStr = String(sellableQuantity).trim();
      if (!/^\d+$/.test(sStr) || parseInt(sStr, 10) <= 0) {
        throw new Error('Discrete sellable quantity must be a positive whole number.');
      }
      effectiveSellableQty = parseInt(sStr, 10);
    }
  }

  const sellableSpec: SellableQuantitySpec = {
    quantity: effectiveSellableQty,
    mode: isSellingMeasured ? 'measured' : 'discrete',
    unit: sellingUnit,
    minor: effectiveSellableMinor,
    scale
  };

  const totalLandedCostCentavos = calculateLandedCost(
    supplierCostCentavos,
    deliveryFreightCentavos,
    otherAcquisitionCostCentavos
  );

  const costPerSellingUnitCentavos = calculateCostPerSellingUnit(
    totalLandedCostCentavos,
    sellableSpec
  );

  const breakEvenPriceCentavos = calculateBreakEvenSellingPrice(costPerSellingUnitCentavos);

  const effectiveSellingPrice = sellingPriceCentavos > 0
    ? sellingPriceCentavos
    : (targetGrossMarginPercent !== undefined && targetGrossMarginPercent >= 0 && targetGrossMarginPercent <= 95)
      ? calculateTargetMarginPrice(costPerSellingUnitCentavos, targetGrossMarginPercent)
      : breakEvenPriceCentavos;

  const projectedRevenueCentavos = calculateProjectedRevenue(
    effectiveSellingPrice,
    sellableSpec
  );

  const projectedGrossProfitCentavos = calculateProjectedGrossProfit(
    projectedRevenueCentavos,
    totalLandedCostCentavos
  );

  const markupPercent = calculateMarkupPercentage(
    projectedGrossProfitCentavos,
    totalLandedCostCentavos
  );

  const grossMarginPercent = calculateGrossMarginPercentage(
    projectedGrossProfitCentavos,
    projectedRevenueCentavos
  );

  const marginScenarios = generateMarginScenarios(
    costPerSellingUnitCentavos,
    targetGrossMarginPercent
  );

  return {
    totalLandedCostCentavos,
    costPerSellingUnitCentavos,
    sellingPriceCentavos: effectiveSellingPrice,
    breakEvenPriceCentavos,
    projectedRevenueCentavos,
    projectedGrossProfitCentavos,
    markupPercent,
    grossMarginPercent,
    marginScenarios,
    isDifferentUnit,
    sellableSpec
  };
}
