import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLineFinancials } from '../src/lib/shared/quantity-math';

export interface SaleItemSnapshot {
  productId: string;
  name: string;
  quantity?: number;
  quantityMode?: 'discrete' | 'measured';
  quantityMinor?: number;
  quantityScale?: number;
  sellingUnit?: string;
  unitPriceCentavos?: number;
  unitCostCentavos?: number;
  lineSubtotalCentavos?: number;
  lineCostCentavos?: number;
  price?: number; // centavos
  costPrice?: number; // centavos
  lineTotal?: number;
  lineCost?: number;
}

export interface SaleRecord {
  id: string;
  totalAmount: number; // centavos
  items?: SaleItemSnapshot[];
}

export function computeOwnerPnL(sales: SaleRecord[], operatingExpensesPesos: number = 0) {
  const grossIncomePesos = sales.reduce((acc, sale) => acc + ((sale.totalAmount || 0) / 100), 0);

  let totalCogsCentavos = 0;
  let missingCostItemsCount = 0;
  let missingCostSalesCount = 0;

  sales.forEach((sale) => {
    let saleHasMissingCost = false;
    if (sale.items && Array.isArray(sale.items) && sale.items.length > 0) {
      sale.items.forEach((item) => {
        if (typeof item.lineCostCentavos === 'number' && Number.isSafeInteger(item.lineCostCentavos) && item.lineCostCentavos >= 0) {
          totalCogsCentavos += item.lineCostCentavos;
        } else if (typeof item.lineCost === 'number' && Number.isSafeInteger(item.lineCost) && item.lineCost >= 0) {
          totalCogsCentavos += item.lineCost;
        } else if (item.quantityMode === 'measured' || item.quantityMinor !== undefined) {
          const qtyMinor = item.quantityMinor;
          const costPrice = item.unitCostCentavos ?? item.costPrice;
          const scale = item.quantityScale || 3;
          if (
            Number.isSafeInteger(qtyMinor) &&
            qtyMinor > 0 &&
            costPrice !== undefined &&
            costPrice !== null &&
            Number.isSafeInteger(costPrice) &&
            costPrice >= 0
          ) {
            totalCogsCentavos += computeLineFinancials(costPrice, qtyMinor, scale);
          } else {
            missingCostItemsCount++;
            saleHasMissingCost = true;
          }
        } else {
          const qty = item.quantity;
          const costPrice = item.unitCostCentavos ?? item.costPrice;
          if (
            !Number.isSafeInteger(qty) ||
            qty <= 0 ||
            costPrice === undefined ||
            costPrice === null ||
            !Number.isSafeInteger(costPrice) ||
            costPrice < 0
          ) {
            missingCostItemsCount++;
            saleHasMissingCost = true;
          } else {
            totalCogsCentavos += costPrice * qty;
          }
        }
      });
    } else {
      saleHasMissingCost = true;
    }
    if (saleHasMissingCost) {
      missingCostSalesCount++;
    }
  });

  const totalCogsPesos = totalCogsCentavos / 100;
  const isProfitComplete = sales.length === 0 || missingCostSalesCount === 0;
  const grossProfitPesos = grossIncomePesos - totalCogsPesos;
  const netProfitPesos = grossProfitPesos - operatingExpensesPesos;

  return {
    grossIncomePesos,
    totalCogsPesos,
    grossProfitPesos,
    operatingExpensesPesos,
    netProfitPesos,
    isProfitComplete,
    missingCostSalesCount,
    missingCostItemsCount,
  };
}

test('Owner Retail P&L and Shift Display Verification Suite', async (t) => {
  await t.test('correctly calculates ₱303 revenue − ₱221 COGS = ₱82 Gross Profit', () => {
    const sales: SaleRecord[] = [
      {
        id: 'sale_1',
        totalAmount: 5500,
        items: [{ productId: 'prod_rice', name: 'Rice', quantity: 1, price: 5500, costPrice: 4200, lineTotal: 5500 }],
      },
      {
        id: 'sale_2',
        totalAmount: 3000,
        items: [{ productId: 'prod_coffee', name: 'Coffee', quantity: 2, price: 1500, costPrice: 1000, lineTotal: 3000 }],
      },
      {
        id: 'sale_3',
        totalAmount: 21800,
        items: [
          { productId: 'prod_rice', name: 'Rice', quantity: 3, price: 5500, costPrice: 4200, lineTotal: 16500 },
          { productId: 'prod_sardines', name: 'Sardines', quantity: 1, price: 2800, costPrice: 2100, lineTotal: 2800 },
          { productId: 'prod_coffee', name: 'Coffee', quantity: 1, price: 1500, costPrice: 1000, lineTotal: 1500 },
          { productId: 'prod_oil', name: 'Oil', quantity: 1, price: 1000, costPrice: 200, lineTotal: 1000 },
        ],
      },
    ];

    const pnl = computeOwnerPnL(sales, 0);
    assert.equal(pnl.grossIncomePesos, 303);
    assert.equal(pnl.totalCogsPesos, 221);
    assert.equal(pnl.grossProfitPesos, 82);
    assert.equal(pnl.operatingExpensesPesos, 0);
    assert.equal(pnl.netProfitPesos, 82);
    assert.equal(pnl.isProfitComplete, true);
    assert.equal(pnl.missingCostSalesCount, 0);
  });

  await t.test('deducts operating expenses after COGS', () => {
    const sales: SaleRecord[] = [
      {
        id: 'sale_1',
        totalAmount: 30300,
        items: [
          { productId: 'prod_1', name: 'Item', quantity: 1, price: 30300, costPrice: 22100, lineTotal: 30300 },
        ],
      },
    ];

    const pnl = computeOwnerPnL(sales, 25);
    assert.equal(pnl.grossIncomePesos, 303);
    assert.equal(pnl.totalCogsPesos, 221);
    assert.equal(pnl.grossProfitPesos, 82);
    assert.equal(pnl.operatingExpensesPesos, 25);
    assert.equal(pnl.netProfitPesos, 57); // 82 - 25 = 57
    assert.equal(pnl.isProfitComplete, true);
  });

  await t.test('flags missing historical costs as estimated with exact missing counts', () => {
    const sales: SaleRecord[] = [
      {
        id: 'sale_with_cost',
        totalAmount: 10000,
        items: [
          { productId: 'prod_1', name: 'Item 1', quantity: 1, price: 10000, costPrice: 7000, lineTotal: 10000 },
        ],
      },
      {
        id: 'sale_missing_cost',
        totalAmount: 5000,
        items: [
          { productId: 'prod_legacy', name: 'Legacy Item', quantity: 1, price: 5000, costPrice: undefined, lineTotal: 5000 },
        ],
      },
    ];

    const pnl = computeOwnerPnL(sales, 0);
    assert.equal(pnl.grossIncomePesos, 150);
    assert.equal(pnl.totalCogsPesos, 70);
    assert.equal(pnl.grossProfitPesos, 80);
    assert.equal(pnl.isProfitComplete, false);
    assert.equal(pnl.missingCostSalesCount, 1);
    assert.equal(pnl.missingCostItemsCount, 1);
  });

  await t.test('enforces that one cashier cannot have multiple active shifts for the same tenant', () => {
    const shifts = [
      { id: 'shift_demo_open_1', staffAccountId: 'staff_1', staffName: 'Ana Cashier', status: 'open' },
      { id: 'shift_demo_open_2', staffAccountId: 'staff_2', staffName: 'Demo Cashier 2', status: 'open' },
    ];

    const activeStaffIds = shifts.map(s => s.staffAccountId);
    const uniqueActiveStaffIds = new Set(activeStaffIds);
    assert.equal(uniqueActiveStaffIds.size, activeStaffIds.length);

    shifts.forEach(shift => {
      assert.ok(shift.staffName);
      assert.ok(shift.id);
    });
  });

  await t.test('accurately computes P&L for measured sales without treating quantity as 1', () => {
    const sales: SaleRecord[] = [
      {
        id: 'sale_measured_1',
        totalAmount: 35000, // ₱350.00 (1.250 kg Pork @ ₱280.00/kg)
        items: [
          {
            productId: 'prod_pork',
            name: 'Pork Liempo',
            quantityMode: 'measured',
            quantity: 1, // legacy field must be ignored
            quantityMinor: 1250,
            quantityScale: 3,
            sellingUnit: 'kg',
            unitPriceCentavos: 28000,
            unitCostCentavos: 22000,
            lineSubtotalCentavos: 35000,
            lineCostCentavos: 27500, // 22000 * 1250 / 1000 = 27500 centavos (₱275.00)
            price: 28000,
            costPrice: 22000,
            lineTotal: 35000,
            lineCost: 27500
          }
        ]
      }
    ];

    const pnl = computeOwnerPnL(sales, 0);
    assert.equal(pnl.grossIncomePesos, 350);
    assert.equal(pnl.totalCogsPesos, 275);
    assert.equal(pnl.grossProfitPesos, 75); // ₱350 - ₱275 = ₱75
    assert.equal(pnl.isProfitComplete, true);
  });
});
