import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePesoToCentavos,
  formatCentavosToPeso,
  calculateLandedCost,
  calculateCostPerSellingUnit,
  calculateProjectedRevenue,
  calculateProjectedGrossProfit,
  calculateMarkupPercentage,
  calculateGrossMarginPercentage,
  calculateBreakEvenSellingPrice,
  calculateTargetMarginPrice,
  generateMarginScenarios,
  computeSmartPricing
} from '../src/lib/shared/pricing-math';

import {
  computeLineFinancials,
  parseDecimalToMinor,
  formatMinorToDecimal,
  isMeasuredUnit,
  VALID_MEASURED_UNITS
} from '../src/lib/shared/quantity-math';

describe('Benta Snap Smart Pricing Financial Math Tests', () => {

  describe('1. Nails Canonical Test Case & Landed Cost Regression', () => {
    it('calculates correct financials for 10 kg Nails @ ₱950 cost and ₱115/kg selling price', () => {
      // 10 kg, ₱950 cost, ₱115/kg -> ₱1,150 revenue, ₱200 gross profit, 21.05% markup, 17.39% margin
      const result = computeSmartPricing({
        purchaseQuantity: 10,
        purchaseUnit: 'kg',
        supplierCostCentavos: 95000, // ₱950.00
        deliveryFreightCentavos: 0,
        otherAcquisitionCostCentavos: 0,
        sellingUnit: 'kg',
        sellingPriceCentavos: 11500 // ₱115.00
      });

      assert.equal(result.totalLandedCostCentavos, 95000, 'Landed cost should be ₱950.00');
      assert.equal(result.costPerSellingUnitCentavos, 9500, 'Cost per kg should be ₱95.00');
      assert.equal(result.projectedRevenueCentavos, 115000, 'Projected revenue should be ₱1,150.00');
      assert.equal(result.projectedGrossProfitCentavos, 20000, 'Projected gross profit should be ₱200.00');
      assert.equal(result.markupPercent, 21.05, 'Markup should be 21.05%');
      assert.equal(result.grossMarginPercent, 17.39, 'Gross margin should be 17.39%');
      assert.equal(result.breakEvenPriceCentavos, 9500, 'Break-even price should be ₱95.00');
      assert.equal(result.sellableSpec.minor, 10000, 'Sellable minor units should be 10000');
    });

    it('calculates correct landed cost with ₱150 additional acquisition cost', () => {
      // Nails with ₱150 additional acquisition cost -> ₱1,100 landed cost and ₱110/kg
      const result = computeSmartPricing({
        purchaseQuantity: 10,
        purchaseUnit: 'kg',
        supplierCostCentavos: 95000, // ₱950.00
        deliveryFreightCentavos: 10000, // ₱100.00
        otherAcquisitionCostCentavos: 5000, // ₱50.00
        sellingUnit: 'kg',
        sellingPriceCentavos: 13000 // ₱130.00
      });

      assert.equal(result.totalLandedCostCentavos, 110000, 'Total landed cost should be ₱1,100.00');
      assert.equal(result.costPerSellingUnitCentavos, 11000, 'Cost per kg should be ₱110.00');
      assert.equal(result.breakEvenPriceCentavos, 11000, 'Break-even price should be ₱110.00');
    });

    it('calculates exact Section 8 Nails example with ₱149.99 Freight', () => {
      // Nails: 10 kg, ₱950 cost, ₱149.99 freight, ₱0 other, ₱115/kg
      const result = computeSmartPricing({
        purchaseQuantity: '10',
        purchaseUnit: 'kg',
        supplierCostCentavos: 95000, // ₱950.00
        deliveryFreightCentavos: 14999, // ₱149.99
        otherAcquisitionCostCentavos: 0,
        sellingUnit: 'kg',
        sellingPriceCentavos: 11500 // ₱115.00
      });

      assert.equal(result.totalLandedCostCentavos, 109999, 'Landed cost should be ₱1,099.99');
      assert.equal(result.costPerSellingUnitCentavos, 11000, 'Cost Price should be ₱110.00/kg');
      assert.equal(result.projectedRevenueCentavos, 115000, 'Revenue should be ₱1,150.00');
      assert.equal(result.projectedGrossProfitCentavos, 5001, 'Projected Gross Profit should be ₱50.01');
      assert.equal(result.markupPercent, 4.55, 'Markup should be 4.55%');
      assert.equal(result.grossMarginPercent, 4.35, 'Gross margin should be 4.35%');
      assert.equal(result.sellableSpec.quantity, 10, 'Starting stock should be 10 kg');
      assert.equal(result.sellableSpec.minor, 10000, 'Stock minor units should be 10000');
    });
  });

  describe('2. Fractional Measured Purchase Quantities', () => {
    it('supports 10.5 kg measured purchase quantity without drift', () => {
      // Bought 10.5 kg of pork for ₱3,150.00, selling at ₱360.00/kg
      const result = computeSmartPricing({
        purchaseQuantity: '10.5',
        purchaseUnit: 'kg',
        supplierCostCentavos: 315000, // ₱3,150.00
        sellingUnit: 'kg',
        sellingPriceCentavos: 36000 // ₱360.00/kg
      });

      // 10.5 kg = 10500 minor units
      assert.equal(result.sellableSpec.minor, 10500);
      assert.equal(result.sellableSpec.quantity, 10.5);
      // Cost per kg: ceil(315000 * 1000 / 10500) = 30000 centavos = ₱300.00
      assert.equal(result.costPerSellingUnitCentavos, 30000);
      // Revenue: 10500 minor * 36000 / 1000 = 378000 centavos = ₱3,780.00
      assert.equal(result.projectedRevenueCentavos, 378000);
      assert.equal(result.projectedGrossProfitCentavos, 63000); // ₱630.00
      assert.equal(result.markupPercent, 20.0);
      assert.equal(result.grossMarginPercent, 16.67);
    });

    it('supports 0.25 kg measured purchase quantity without drift', () => {
      // Bought 0.25 kg of saffron for ₱2,500.00, selling at ₱12,000.00/kg
      const result = computeSmartPricing({
        purchaseQuantity: '0.25',
        purchaseUnit: 'kg',
        supplierCostCentavos: 250000, // ₱2,500.00
        sellingUnit: 'kg',
        sellingPriceCentavos: 1200000 // ₱12,000.00/kg
      });

      // 0.25 kg = 250 minor units
      assert.equal(result.sellableSpec.minor, 250);
      assert.equal(result.sellableSpec.quantity, 0.25);
      // Cost per kg: ceil(250000 * 1000 / 250) = 1000000 centavos = ₱10,000.00/kg
      assert.equal(result.costPerSellingUnitCentavos, 1000000);
      // Revenue: 250 minor * 1200000 / 1000 = 300000 centavos = ₱3,000.00
      assert.equal(result.projectedRevenueCentavos, 300000);
      assert.equal(result.projectedGrossProfitCentavos, 50000); // ₱500.00
      assert.equal(result.markupPercent, 20.0);
      assert.equal(result.grossMarginPercent, 16.67);
    });

    it('supports 1.125 m and 2.5 liters measured purchases', () => {
      const mResult = computeSmartPricing({
        purchaseQuantity: '1.125',
        purchaseUnit: 'm',
        supplierCostCentavos: 11250, // ₱112.50
        sellingUnit: 'm',
        sellingPriceCentavos: 15000 // ₱150.00/m
      });
      assert.equal(mResult.sellableSpec.minor, 1125);
      assert.equal(mResult.costPerSellingUnitCentavos, 10000); // ₱100.00/m

      const lResult = computeSmartPricing({
        purchaseQuantity: '2.5',
        purchaseUnit: 'l',
        supplierCostCentavos: 20000, // ₱200.00
        sellingUnit: 'l',
        sellingPriceCentavos: 12000 // ₱120.00/l
      });
      assert.equal(lResult.sellableSpec.minor, 2500);
      assert.equal(lResult.costPerSellingUnitCentavos, 8000); // ₱80.00/l
    });
  });

  describe('3. Discrete Quantity Validation & Rejection of Fractions', () => {
    it('rejects fractional discrete purchase quantities (e.g. 2.5 pcs)', () => {
      assert.throws(() => computeSmartPricing({
        purchaseQuantity: '2.5',
        purchaseUnit: 'pcs',
        supplierCostCentavos: 25000,
        sellingUnit: 'pcs'
      }), /Discrete purchase quantity must be a positive whole number/);

      assert.throws(() => computeSmartPricing({
        purchaseQuantity: 2.5,
        purchaseUnit: 'pcs',
        supplierCostCentavos: 25000,
        sellingUnit: 'pcs'
      }), /Discrete purchase quantity must be a positive whole number/);
    });

    it('rejects fractional discrete sellable quantities in different unit conversion (e.g. 10.5 cans from 1 box)', () => {
      assert.throws(() => computeSmartPricing({
        purchaseQuantity: '1',
        purchaseUnit: 'box',
        supplierCostCentavos: 25000,
        sellingUnit: 'can',
        sellableQuantity: '10.5'
      }), /Discrete sellable quantity must be a positive whole number/);
    });
  });

  describe('4. Different-Unit Conversions & Required Sellable Quantity', () => {
    it('requires totalSellableQuantity and parses measured sellable quantity when units differ', () => {
      // Bought 1 sack of rice for ₱2,200, selling by the kilogram (50 kg)
      const result = computeSmartPricing({
        purchaseQuantity: 1,
        purchaseUnit: 'sack',
        supplierCostCentavos: 220000, // ₱2,200.00
        deliveryFreightCentavos: 10000, // ₱100.00 freight
        sellingUnit: 'kg',
        sellableQuantity: '50.0', // 50 kg total sellable
        sellingPriceCentavos: 5200 // ₱52.00 / kg
      });

      assert.equal(result.isDifferentUnit, true);
      assert.equal(result.totalLandedCostCentavos, 230000, 'Total landed cost is ₱2,300.00');
      assert.equal(result.sellableSpec.minor, 50000, '50 kg is 50000 minor units');
      assert.equal(result.costPerSellingUnitCentavos, 4600, 'Cost per kg is ₱46.00 (2300 / 50)');
      assert.equal(result.projectedRevenueCentavos, 260000, 'Projected revenue is ₱2,600.00');
      assert.equal(result.projectedGrossProfitCentavos, 30000, 'Projected gross profit is ₱300.00');
      assert.equal(result.markupPercent, 13.04, 'Markup is 13.04%');
      assert.equal(result.grossMarginPercent, 11.54, 'Gross margin is 11.54%');
    });

    it('rejects missing Total Sellable Quantity when units differ', () => {
      assert.throws(() => computeSmartPricing({
        purchaseQuantity: 1,
        purchaseUnit: 'sack',
        supplierCostCentavos: 220000,
        sellingUnit: 'kg'
      }), /Total sellable quantity is required when purchase and selling units differ/);
    });
  });

  describe('5. Onions Target Margin & Upward Rounding Scenarios', () => {
    it('calculates correct explainable target-margin scenarios for 10 kg Onions @ ₱1,500 landed cost', () => {
      // 10 kg, ₱1,500 landed cost -> ₱150.00/kg cost
      const result = computeSmartPricing({
        purchaseQuantity: 10,
        purchaseUnit: 'kg',
        supplierCostCentavos: 150000,
        sellingUnit: 'kg',
        targetGrossMarginPercent: 25 // Custom scenario
      });

      assert.equal(result.costPerSellingUnitCentavos, 15000, 'Cost per kg should be ₱150.00');
      assert.equal(result.breakEvenPriceCentavos, 15000, 'Break-even should be ₱150.00');

      // 10% Margin: 150 / (1 - 0.10) = 166.666... -> ₱166.67 (16667 centavos)
      const sc10 = result.marginScenarios.find(s => s.targetMarginPercent === 10);
      assert.ok(sc10);
      assert.equal(sc10.targetPriceCentavos, 16667, '10% target margin price rounds up to ₱166.67');
      assert.equal(sc10.unitGrossProfitCentavos, 1667, '10% profit per unit is ₱16.67');

      // 20% Margin: 150 / (1 - 0.20) = 187.50 -> ₱187.50 (18750 centavos)
      const sc20 = result.marginScenarios.find(s => s.targetMarginPercent === 20);
      assert.ok(sc20);
      assert.equal(sc20.targetPriceCentavos, 18750, '20% target margin price is ₱187.50');
      assert.equal(sc20.unitGrossProfitCentavos, 3750, '20% profit per unit is ₱37.50');

      // 30% Margin: 150 / (1 - 0.30) = 214.2857... -> ₱214.29 (21429 centavos)
      const sc30 = result.marginScenarios.find(s => s.targetMarginPercent === 30);
      assert.ok(sc30);
      assert.equal(sc30.targetPriceCentavos, 21429, '30% target margin price rounds up to ₱214.29');
      assert.equal(sc30.unitGrossProfitCentavos, 6429, '30% profit per unit is ₱64.29');

      // 25% Custom Margin: 150 / (1 - 0.25) = 200.00 -> ₱200.00 (20000 centavos)
      const sc25 = result.marginScenarios.find(s => s.targetMarginPercent === 25);
      assert.ok(sc25);
      assert.equal(sc25.targetPriceCentavos, 20000, '25% custom margin price is ₱200.00');
    });
  });

  describe('6. Variable-Quantity Line Item Verification', () => {
    it('verifies 0.25 kg × ₱150 = ₱37.50', () => {
      // 0.25 kg = 250 minor units, scale 3, price 15000 centavos
      const totalCentavos = computeLineFinancials(15000, 250, 3);
      assert.equal(totalCentavos, 3750, '0.25 kg at ₱150/kg must equal 3750 centavos (₱37.50)');
      assert.equal(formatCentavosToPeso(totalCentavos), '37.50');
    });

    it('verifies 1.5 kg × ₱115 = ₱172.50', () => {
      // 1.5 kg = 1500 minor units, scale 3, price 11500 centavos
      const totalCentavos = computeLineFinancials(11500, 1500, 3);
      assert.equal(totalCentavos, 17250, '1.5 kg at ₱115/kg must equal 17250 centavos (₱172.50)');
      assert.equal(formatCentavosToPeso(totalCentavos), '172.50');
    });
  });

  describe('7. Bounds, Rejections & Edge Cases', () => {
    it('rejects target margins outside 0% to 95%', () => {
      assert.throws(() => calculateTargetMarginPrice(10000, -5), /Target gross margin must be a number between 0% and 95%/);
      assert.throws(() => calculateTargetMarginPrice(10000, 96), /Target gross margin must be a number between 0% and 95%/);
      assert.throws(() => calculateTargetMarginPrice(10000, 100), /Target gross margin must be a number between 0% and 95%/);
    });

    it('rejects zero or negative quantities in calculations', () => {
      assert.throws(() => calculateCostPerSellingUnit(10000, { quantity: 0, mode: 'discrete', unit: 'pcs' }), /must be a positive whole number/);
      assert.throws(() => calculateCostPerSellingUnit(10000, { quantity: -5, mode: 'measured', unit: 'kg' }), /must be greater than zero/);
    });
  });
});
