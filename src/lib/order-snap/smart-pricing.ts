/**
 * Order Snap — Pure Deterministic Smart Pricing Engine
 *
 * Invariants:
 * 1. Derives costs directly and strictly from authoritative recipe and modifier COGS.
 * 2. Exact integer centavo and basis-point arithmetic with checked BigInt helpers.
 * 3. Zero floating-point drift in authoritative calculations.
 * 4. Strictly separates ingredient COGS, wastage, packaging, operating allocation, and channel fees.
 * 5. Full fail-closed validation for inputs, fee/margin thresholds, and channel parameters.
 */

import { z } from 'zod';
import {
  MenuItem,
  RecipeVersion,
  Ingredient,
  SafeCentavosSchema
} from './domain-schemas';
import {
  calculateMenuItemCogs,
  SelectedModifierSelection,
  ModifierGroupsInput,
  IngredientsLookup
} from './costing';
import {
  validateMoneyCentavos,
  roundHalfUpBigInt,
  safeAddMoney,
  MAX_SAFE_CENTAVOS
} from './quantity-math';

export const MAX_SAFE_BPS = 10_000; // 10,000 bps = 100.00%
export const MAX_SAFE_CHANNEL_FEE_BPS = 9_000; // Max 90% platform fee
export const MAX_SAFE_WASTAGE_BPS = 5_000; // Max 50% wastage allowance
export const MAX_SAFE_TARGET_MARGIN_BPS = 9_500; // Max 95% target contribution margin
export const MAX_SAFE_ROUNDING_INCREMENT = 100_000; // ₱1,000.00 max rounding increment

export type SalesChannel = 'dine_in' | 'takeout' | 'delivery';

export const ChannelCostConfigSchema = z.object({
  packagingCostCentavos: SafeCentavosSchema.default(0),
  operatingCostAllocationCentavos: SafeCentavosSchema.default(0),
  channelFeeBps: z.number()
    .int('Channel fee bps must be an integer.')
    .min(0, 'Channel fee bps must be non-negative.')
    .max(MAX_SAFE_CHANNEL_FEE_BPS, `Channel fee bps cannot exceed ${MAX_SAFE_CHANNEL_FEE_BPS} bps.`)
    .default(0)
}).strict();

export type ChannelCostConfig = z.infer<typeof ChannelCostConfigSchema>;

export const OrderSmartPricingInputSchema = z.object({
  channel: z.enum(['dine_in', 'takeout', 'delivery']),
  packagingCostCentavos: SafeCentavosSchema.default(0),
  wastageAllowanceBps: z.number()
    .int('Wastage allowance bps must be an integer.')
    .min(0, 'Wastage allowance bps must be non-negative.')
    .max(MAX_SAFE_WASTAGE_BPS, `Wastage allowance bps cannot exceed ${MAX_SAFE_WASTAGE_BPS} bps.`)
    .default(0),
  operatingCostAllocationCentavos: SafeCentavosSchema.default(0),
  channelFeeBps: z.number()
    .int('Channel fee bps must be an integer.')
    .min(0, 'Channel fee bps must be non-negative.')
    .max(MAX_SAFE_CHANNEL_FEE_BPS, `Channel fee bps cannot exceed ${MAX_SAFE_CHANNEL_FEE_BPS} bps.`)
    .default(0),
  currentSellingPriceCentavos: SafeCentavosSchema.optional(),
  targetContributionMarginBps: z.number()
    .int('Target contribution margin bps must be an integer.')
    .min(0, 'Target contribution margin bps must be non-negative.')
    .max(MAX_SAFE_TARGET_MARGIN_BPS, `Target contribution margin bps cannot exceed ${MAX_SAFE_TARGET_MARGIN_BPS} bps.`),
  priceRoundingIncrementCentavos: z.number()
    .int('Rounding increment must be an integer.')
    .positive('Rounding increment must be a positive integer.')
    .max(MAX_SAFE_ROUNDING_INCREMENT, `Rounding increment cannot exceed ${MAX_SAFE_ROUNDING_INCREMENT} centavos.`)
    .default(1)
}).strict();

export type OrderSmartPricingInputParams = z.infer<typeof OrderSmartPricingInputSchema>;

export interface OrderSmartPricingInput extends OrderSmartPricingInputParams {
  readonly menuItem: MenuItem;
  readonly recipe: RecipeVersion;
  readonly ingredients: Map<string, Ingredient> | Record<string, Ingredient> | IngredientsLookup;
  readonly modifierGroups?: ModifierGroupsInput;
  readonly selectedModifiers?: SelectedModifierSelection[];
}

export interface PricingBreakdown {
  readonly ingredientCogsCentavos: number;
  readonly wastageAllowanceCentavos: number;
  readonly packagingCostCentavos: number;
  readonly operatingCostAllocationCentavos: number;
  readonly fixedCostBeforeChannelFeeCentavos: number;
  readonly channelFeeCentavos: number;
  readonly breakEvenPriceCentavos: number;
  readonly targetPriceBeforeRoundingCentavos: number;
  readonly suggestedPriceCentavos: number;
  readonly grossProfitCentavos: number;
  readonly contributionProfitCentavos: number;
  readonly foodGrossMarginBasisPoints: number;
  readonly contributionMarginBasisPoints: number;
}

export interface CurrentPriceAnalysis {
  readonly priceCentavos: number;
  readonly channelFeeCentavos: number;
  readonly grossProfitCentavos: number;
  readonly contributionProfitCentavos: number;
  readonly foodGrossMarginBasisPoints: number;
  readonly contributionMarginBasisPoints: number;
  readonly isBelowIngredientCogs: boolean;
  readonly isBelowBreakEven: boolean;
  readonly isNegativeContribution: boolean;
}

export interface TargetMarginScenario {
  readonly targetMarginBps: number;
  readonly targetMarginLabel: string;
  readonly targetPriceBeforeRoundingCentavos: number;
  readonly suggestedPriceCentavos: number;
  readonly contributionProfitCentavos: number;
  readonly actualContributionMarginBps: number;
}

export interface ChannelComparisonResult {
  readonly channel: SalesChannel;
  readonly fixedCostCentavos: number;
  readonly breakEvenPriceCentavos: number;
  readonly suggestedPriceCentavos: number;
  readonly contributionProfitCentavos: number;
  readonly actualContributionMarginBps: number;
}

export interface OrderSmartPricingResult {
  readonly channel: SalesChannel;
  readonly costBreakdown: PricingBreakdown;
  readonly currentPriceAnalysis?: CurrentPriceAnalysis;
  readonly targetMarginScenarios: TargetMarginScenario[];
  readonly channelComparisons?: ChannelComparisonResult[];
  readonly warnings: string[];
}

/**
 * Validates channel fee basis points strictly.
 */
export function validateChannelFeeBps(feeBps: number): void {
  if (
    typeof feeBps !== 'number' ||
    !Number.isSafeInteger(feeBps) ||
    feeBps < 0 ||
    feeBps > MAX_SAFE_CHANNEL_FEE_BPS
  ) {
    throw new Error(
      `Invalid channel fee basis points: ${feeBps}. Must be a safe integer between 0 and ${MAX_SAFE_CHANNEL_FEE_BPS} bps.`
    );
  }
}

/**
 * Pure BigInt Ceiling integer division:
 * result = ceil(numerator / denominator) for non-negative inputs.
 */
export function ceilDivisionBigInt(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= BigInt(0)) {
    throw new Error(`Division by non-positive denominator in ceiling calculation: ${denominator}`);
  }
  if (numerator <= BigInt(0)) {
    return BigInt(0);
  }
  return (numerator + denominator - BigInt(1)) / denominator;
}

/**
 * Safe conversion from BigInt price to number ensuring bounds.
 */
function safeBigIntPriceToNumber(val: bigint, label: string): number {
  if (val > BigInt(MAX_SAFE_CENTAVOS)) {
    throw new Error(`${label} exceeds maximum safe monetary bounds (${MAX_SAFE_CENTAVOS} centavos).`);
  }
  return Number(val);
}

/**
 * Rounds a price in centavos upward to the nearest configured increment.
 */
export function roundPriceUpward(priceCentavos: number, incrementCentavos: number): number {
  validateMoneyCentavos(priceCentavos, false);
  if (
    typeof incrementCentavos !== 'number' ||
    !Number.isSafeInteger(incrementCentavos) ||
    incrementCentavos <= 0 ||
    incrementCentavos > MAX_SAFE_ROUNDING_INCREMENT
  ) {
    throw new Error(
      `Invalid rounding increment: ${incrementCentavos}. Must be a safe integer between 1 and ${MAX_SAFE_ROUNDING_INCREMENT} centavos.`
    );
  }
  if (incrementCentavos === 1) {
    return priceCentavos;
  }
  const bigPrice = BigInt(priceCentavos);
  const bigInc = BigInt(incrementCentavos);
  const rounded = ceilDivisionBigInt(bigPrice, bigInc) * bigInc;
  return safeBigIntPriceToNumber(rounded, 'Price rounding');
}

/**
 * Calculates fee at a given price using ceiling integer math.
 */
export function calculateChannelFee(priceCentavos: number, feeBps: number): number {
  validateMoneyCentavos(priceCentavos, false);
  validateChannelFeeBps(feeBps);
  if (feeBps === 0 || priceCentavos === 0) return 0;
  const num = BigInt(priceCentavos) * BigInt(feeBps);
  const feeBigInt = ceilDivisionBigInt(num, BigInt(10000));
  return safeBigIntPriceToNumber(feeBigInt, 'Channel fee');
}

/**
 * Evaluates full financials at a given selling price.
 */
export function evaluatePriceFinancials(params: {
  sellingPriceCentavos: number;
  ingredientCogsCentavos: number;
  fixedCostBeforeChannelFeeCentavos: number;
  channelFeeBps: number;
}): {
  channelFeeCentavos: number;
  grossProfitCentavos: number;
  contributionProfitCentavos: number;
  foodGrossMarginBasisPoints: number;
  contributionMarginBasisPoints: number;
} {
  const {
    sellingPriceCentavos,
    ingredientCogsCentavos,
    fixedCostBeforeChannelFeeCentavos,
    channelFeeBps
  } = params;

  validateMoneyCentavos(sellingPriceCentavos, false);
  validateMoneyCentavos(ingredientCogsCentavos, false);
  validateMoneyCentavos(fixedCostBeforeChannelFeeCentavos, false);
  validateChannelFeeBps(channelFeeBps);

  const channelFeeCentavos = calculateChannelFee(sellingPriceCentavos, channelFeeBps);
  const grossProfitCentavos = sellingPriceCentavos - ingredientCogsCentavos;
  const contributionProfitCentavos = sellingPriceCentavos - channelFeeCentavos - fixedCostBeforeChannelFeeCentavos;

  const foodGrossMarginBasisPoints = sellingPriceCentavos > 0
    ? Number(roundHalfUpBigInt(BigInt(grossProfitCentavos) * BigInt(10000), BigInt(sellingPriceCentavos)))
    : 0;

  const contributionMarginBasisPoints = sellingPriceCentavos > 0
    ? Number(roundHalfUpBigInt(BigInt(contributionProfitCentavos) * BigInt(10000), BigInt(sellingPriceCentavos)))
    : 0;

  return {
    channelFeeCentavos,
    grossProfitCentavos,
    contributionProfitCentavos,
    foodGrossMarginBasisPoints,
    contributionMarginBasisPoints
  };
}

/**
 * Pure Deterministic Smart Pricing calculation for Order Snap.
 */
export function calculateOrderSmartPricing(
  input: OrderSmartPricingInput,
  channelConfigs?: Partial<Record<SalesChannel, unknown>>
): OrderSmartPricingResult {
  const validatedParams = OrderSmartPricingInputSchema.parse({
    channel: input.channel,
    packagingCostCentavos: input.packagingCostCentavos,
    wastageAllowanceBps: input.wastageAllowanceBps,
    operatingCostAllocationCentavos: input.operatingCostAllocationCentavos,
    channelFeeBps: input.channelFeeBps,
    currentSellingPriceCentavos: input.currentSellingPriceCentavos,
    targetContributionMarginBps: input.targetContributionMarginBps,
    priceRoundingIncrementCentavos: input.priceRoundingIncrementCentavos
  });

  const {
    channel,
    packagingCostCentavos,
    wastageAllowanceBps,
    operatingCostAllocationCentavos,
    channelFeeBps,
    currentSellingPriceCentavos,
    targetContributionMarginBps,
    priceRoundingIncrementCentavos
  } = validatedParams;

  // 1. Authoritative COGS Calculation
  const cogsResult = calculateMenuItemCogs({
    menuItem: input.menuItem,
    recipe: input.recipe,
    selectedModifiers: input.selectedModifiers,
    modifierGroups: input.modifierGroups,
    ingredients: input.ingredients
  });

  const ingredientCogsCentavos = cogsResult.unitCogsCentavos;

  // 2. Wastage Allowance: ceil(ingredientCogs * wastageBps / 10,000)
  const wastageAllowanceCentavos = safeBigIntPriceToNumber(
    ceilDivisionBigInt(
      BigInt(ingredientCogsCentavos) * BigInt(wastageAllowanceBps),
      BigInt(10000)
    ),
    'Wastage allowance'
  );

  // 3. Fixed Cost before channel fee
  let fixedCostBeforeChannelFeeCentavos = safeAddMoney(ingredientCogsCentavos, wastageAllowanceCentavos, false);
  fixedCostBeforeChannelFeeCentavos = safeAddMoney(fixedCostBeforeChannelFeeCentavos, packagingCostCentavos, false);
  fixedCostBeforeChannelFeeCentavos = safeAddMoney(fixedCostBeforeChannelFeeCentavos, operatingCostAllocationCentavos, false);

  // 4. Validate fee and target margin combination
  const breakEvenDenominator = 10000 - channelFeeBps;
  if (breakEvenDenominator <= 0) {
    throw new Error(`Channel fee (${channelFeeBps} bps) must be less than 10,000 bps.`);
  }

  const targetMarginDenominator = 10000 - channelFeeBps - targetContributionMarginBps;
  if (targetMarginDenominator <= 0) {
    throw new Error(
      `Channel fee (${channelFeeBps} bps) plus target contribution margin (${targetContributionMarginBps} bps) must be less than 10,000 bps.`
    );
  }

  // 5. Break-Even Price: ceil(fixedCost * 10,000 / (10,000 - channelFeeBps))
  const breakEvenPriceCentavos = safeBigIntPriceToNumber(
    ceilDivisionBigInt(
      BigInt(fixedCostBeforeChannelFeeCentavos) * BigInt(10000),
      BigInt(breakEvenDenominator)
    ),
    'Break-even price'
  );

  // 6. Target Price before rounding: ceil(fixedCost * 10,000 / (10,000 - channelFeeBps - targetContributionMarginBps))
  const targetPriceBeforeRoundingCentavos = safeBigIntPriceToNumber(
    ceilDivisionBigInt(
      BigInt(fixedCostBeforeChannelFeeCentavos) * BigInt(10000),
      BigInt(targetMarginDenominator)
    ),
    'Target price before rounding'
  );

  // 7. Suggested Price (after upward increment rounding)
  const suggestedPriceCentavos = roundPriceUpward(
    targetPriceBeforeRoundingCentavos,
    priceRoundingIncrementCentavos
  );

  // 8. Financials at suggested price
  const suggestedFinancials = evaluatePriceFinancials({
    sellingPriceCentavos: suggestedPriceCentavos,
    ingredientCogsCentavos,
    fixedCostBeforeChannelFeeCentavos,
    channelFeeBps
  });

  const costBreakdown: PricingBreakdown = {
    ingredientCogsCentavos,
    wastageAllowanceCentavos,
    packagingCostCentavos,
    operatingCostAllocationCentavos,
    fixedCostBeforeChannelFeeCentavos,
    channelFeeCentavos: suggestedFinancials.channelFeeCentavos,
    breakEvenPriceCentavos,
    targetPriceBeforeRoundingCentavos,
    suggestedPriceCentavos,
    grossProfitCentavos: suggestedFinancials.grossProfitCentavos,
    contributionProfitCentavos: suggestedFinancials.contributionProfitCentavos,
    foodGrossMarginBasisPoints: suggestedFinancials.foodGrossMarginBasisPoints,
    contributionMarginBasisPoints: suggestedFinancials.contributionMarginBasisPoints
  };

  // 9. Warnings & Current Price Analysis
  const warnings: string[] = [];
  let currentPriceAnalysis: CurrentPriceAnalysis | undefined;

  if (currentSellingPriceCentavos !== undefined) {
    const currentFin = evaluatePriceFinancials({
      sellingPriceCentavos: currentSellingPriceCentavos,
      ingredientCogsCentavos,
      fixedCostBeforeChannelFeeCentavos,
      channelFeeBps
    });

    const isBelowIngredientCogs = currentSellingPriceCentavos < ingredientCogsCentavos;
    const isBelowBreakEven = currentSellingPriceCentavos < breakEvenPriceCentavos;
    const isNegativeContribution = currentFin.contributionProfitCentavos < 0;

    if (isBelowIngredientCogs) {
      warnings.push(
        `Current price (₱${(currentSellingPriceCentavos / 100).toFixed(2)}) is below ingredient COGS (₱${(ingredientCogsCentavos / 100).toFixed(2)}).`
      );
    } else if (isBelowBreakEven) {
      warnings.push(
        `Current price (₱${(currentSellingPriceCentavos / 100).toFixed(2)}) is below break-even price (₱${(breakEvenPriceCentavos / 100).toFixed(2)}).`
      );
    }

    if (isNegativeContribution && !isBelowIngredientCogs && !isBelowBreakEven) {
      warnings.push('Current price produces a negative contribution profit.');
    }

    currentPriceAnalysis = {
      priceCentavos: currentSellingPriceCentavos,
      channelFeeCentavos: currentFin.channelFeeCentavos,
      grossProfitCentavos: currentFin.grossProfitCentavos,
      contributionProfitCentavos: currentFin.contributionProfitCentavos,
      foodGrossMarginBasisPoints: currentFin.foodGrossMarginBasisPoints,
      contributionMarginBasisPoints: currentFin.contributionMarginBasisPoints,
      isBelowIngredientCogs,
      isBelowBreakEven,
      isNegativeContribution
    };
  }

  // 10. Default Scenarios: 30%, 40%, 50%, 60%
  const defaultTargetBps = [3000, 4000, 5000, 6000];
  const targetMarginScenarios: TargetMarginScenario[] = [];

  for (const tBps of defaultTargetBps) {
    const denom = 10000 - channelFeeBps - tBps;
    if (denom <= 0) continue;

    const tPriceBefore = safeBigIntPriceToNumber(
      ceilDivisionBigInt(
        BigInt(fixedCostBeforeChannelFeeCentavos) * BigInt(10000),
        BigInt(denom)
      ),
      'Scenario target price'
    );
    const sPrice = roundPriceUpward(tPriceBefore, priceRoundingIncrementCentavos);
    const fin = evaluatePriceFinancials({
      sellingPriceCentavos: sPrice,
      ingredientCogsCentavos,
      fixedCostBeforeChannelFeeCentavos,
      channelFeeBps
    });

    targetMarginScenarios.push({
      targetMarginBps: tBps,
      targetMarginLabel: `${tBps / 100}% Margin`,
      targetPriceBeforeRoundingCentavos: tPriceBefore,
      suggestedPriceCentavos: sPrice,
      contributionProfitCentavos: fin.contributionProfitCentavos,
      actualContributionMarginBps: fin.contributionMarginBasisPoints
    });
  }

  // 11. Channel Comparisons (if provided) - Strictly validated & fails closed
  let channelComparisons: ChannelComparisonResult[] | undefined;
  if (channelConfigs) {
    channelComparisons = [];
    const channels: SalesChannel[] = ['dine_in', 'takeout', 'delivery'];
    for (const ch of channels) {
      const rawCfg = channelConfigs[ch];
      if (rawCfg === undefined) continue;

      // Strict validation of each channel config
      const cfg = ChannelCostConfigSchema.parse(rawCfg);

      let chFixed = safeAddMoney(ingredientCogsCentavos, wastageAllowanceCentavos, false);
      chFixed = safeAddMoney(chFixed, cfg.packagingCostCentavos, false);
      chFixed = safeAddMoney(chFixed, cfg.operatingCostAllocationCentavos, false);

      const chBreakEvenDenom = 10000 - cfg.channelFeeBps;
      if (chBreakEvenDenom <= 0) {
        throw new Error(`Channel fee (${cfg.channelFeeBps} bps) in channel "${ch}" must be less than 10,000 bps.`);
      }

      const chTargetDenom = 10000 - cfg.channelFeeBps - targetContributionMarginBps;
      if (chTargetDenom <= 0) {
        throw new Error(
          `Channel fee (${cfg.channelFeeBps} bps) plus target contribution margin (${targetContributionMarginBps} bps) in channel "${ch}" must be less than 10,000 bps.`
        );
      }

      const chBreakEven = safeBigIntPriceToNumber(
        ceilDivisionBigInt(BigInt(chFixed) * BigInt(10000), BigInt(chBreakEvenDenom)),
        `Channel "${ch}" break-even price`
      );
      const chTargetBefore = safeBigIntPriceToNumber(
        ceilDivisionBigInt(BigInt(chFixed) * BigInt(10000), BigInt(chTargetDenom)),
        `Channel "${ch}" target price`
      );
      const chSuggested = roundPriceUpward(chTargetBefore, priceRoundingIncrementCentavos);
      const chFin = evaluatePriceFinancials({
        sellingPriceCentavos: chSuggested,
        ingredientCogsCentavos,
        fixedCostBeforeChannelFeeCentavos: chFixed,
        channelFeeBps: cfg.channelFeeBps
      });

      channelComparisons.push({
        channel: ch,
        fixedCostCentavos: chFixed,
        breakEvenPriceCentavos: chBreakEven,
        suggestedPriceCentavos: chSuggested,
        contributionProfitCentavos: chFin.contributionProfitCentavos,
        actualContributionMarginBps: chFin.contributionMarginBasisPoints
      });
    }
  }

  return {
    channel,
    costBreakdown,
    currentPriceAnalysis,
    targetMarginScenarios,
    channelComparisons,
    warnings
  };
}
