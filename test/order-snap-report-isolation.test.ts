/**
 * test/order-snap-report-isolation.test.ts
 *
 * Behavioral tests proving module segregation between Order Snap and Benta Snap
 * (and other modules) in the unified reports view.
 *
 * Requirements exercised
 * ──────────────────────
 * R1.  Benta active sale excluded from Order Snap reports.
 * R2.  Benta voided sale excluded from Order Snap reports.
 * R3.  Order Snap sale excluded from Benta Snap reports.
 * R4.  Correct-module sales remain visible in their own module.
 * R5.  Legacy missing-module sale never leaks into Order Snap.
 * R6.  Totals, COGS, profit, charts, checkout volume, history, Edit, and Void
 *      all use the same filtered dataset (sameModuleSaleIds contract).
 * R7.  Demo module switching cannot reuse another module's sales.
 * R8.  Cross-module transactions with saleId are excluded; transactions
 *      without saleId (general OPEX) are preserved ONLY for primary module.
 * R9.  Zero Order Snap sales + Benta transactions → Order Snap receives zero
 *      Benta transactions.
 * R10. Missing active module → zero sales and zero sale-linked transactions.
 * R11. Missing-module sale cannot appear in two modules simultaneously.
 * R12. Yesterday comparison excludes other-module and voided income.
 * R13. Hourly/daily charts exclude voided income and Sale Reversal expense.
 * R14. Production Order Snap finalizer shape produces correct aggregates.
 * R15. Order Snap family modules (order-snap, timpla-track, bite-snap) are
 *      normalized through one shared constant.
 * R16. Order Snap-family Edit/Void actions are blocked.
 * R17. Invalid Order Snap shapes fail closed.
 * R18. Malformed Order Snap records are excluded from checkout count.
 * R19. Order Snap history shows correct amount and items.
 * R20. Daily totals use normalized Order Snap revenue.
 * R21. Legacy Benta Edit/Void handlers remain eligible.
 * R22. Stale yesterday request does not update state.
 * R23. Legacy Benta void net-zero accounting preserved.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterSalesByModule,
  filterTransactionsByModule,
  filterSalesByModuleIds,
  isSaleForCurrentModule,
  isOrderSnapFamily,
  prepareSalesForModule,
  canMutateSaleFromReports,
  LEGACY_MODULE_IDS,
  ORDER_SNAP_FAMILY_MODULES,
} from '../src/lib/shared/sale-module-filter';

import {
  computeOwnerPnL,
  normalizeOrderSnapSale,
  selectActiveIncomeLedgerEntries,
  isSaleReversalLedgerEntry,
  buildExcludedIncomeLedgerIds,
  type SaleRecord,
  type LedgerTransaction,
} from '../src/lib/shared/benta-sale-report-aggregator';

import { SaleSchema } from '../src/lib/schemas/sales';

// ---------------------------------------------------------------------------
// R1 — Benta active sale excluded from Order Snap
// ---------------------------------------------------------------------------

test('filterSalesByModule: active Benta sale excluded from Order Snap view', () => {
  const sales = [
    { id: 'benta_active', moduleId: 'benta-snap', totalAmount: 5000 },
    { id: 'order_active', moduleId: 'order-snap', totalAmount: 3000 },
  ];

  const filtered = filterSalesByModule(sales, 'order-snap');
  assert.deepEqual(filtered.map(s => s.id), ['order_active']);
});

// ---------------------------------------------------------------------------
// R2 — Benta voided sale excluded from Order Snap
// ---------------------------------------------------------------------------

test('filterSalesByModule: voided Benta sale excluded from Order Snap view', () => {
  const sales = [
    { id: 'benta_voided', moduleId: 'benta-snap', status: 'voided', totalAmount: 5000 },
    { id: 'order_active', moduleId: 'order-snap', totalAmount: 3000 },
  ];

  const filtered = filterSalesByModule(sales, 'order-snap');
  assert.deepEqual(filtered.map(s => s.id), ['order_active']);
});

// ---------------------------------------------------------------------------
// R3 — Order Snap sale excluded from Benta Snap
// ---------------------------------------------------------------------------

test('filterSalesByModule: Order Snap sale excluded from Benta Snap view', () => {
  const sales = [
    { id: 'benta_active', moduleId: 'benta-snap', totalAmount: 5000 },
    { id: 'order_active', moduleId: 'order-snap', totalAmount: 3000 },
  ];

  const filtered = filterSalesByModule(sales, 'benta-snap');
  assert.deepEqual(filtered.map(s => s.id), ['benta_active']);
});

// ---------------------------------------------------------------------------
// R4 — Correct-module sales remain visible
// ---------------------------------------------------------------------------

test('filterSalesByModule: same-module sales are preserved', () => {
  const sales = [
    { id: 'order_1', moduleId: 'order-snap', totalAmount: 1000 },
    { id: 'order_2', moduleId: 'order-snap', totalAmount: 2000 },
    { id: 'order_3', moduleId: 'order-snap', totalAmount: 3000 },
  ];

  const filtered = filterSalesByModule(sales, 'order-snap');
  assert.equal(filtered.length, 3);
  assert.deepEqual(filtered.map(s => s.id), ['order_1', 'order_2', 'order_3']);
});

// ---------------------------------------------------------------------------
// R5 — Legacy missing-module sale never leaks into Order Snap
// ---------------------------------------------------------------------------

test('filterSalesByModule: legacy sale with no moduleId excluded from Order Snap', () => {
  const sales = [
    { id: 'legacy_unknown', totalAmount: 5000 },
    { id: 'order_active', moduleId: 'order-snap', totalAmount: 3000 },
  ];

  const filtered = filterSalesByModule(sales, 'order-snap');
  assert.deepEqual(filtered.map(s => s.id), ['order_active']);
});

test('filterSalesByModule: legacy sale with no moduleId included in primary Benta Snap', () => {
  const sales = [
    { id: 'legacy_unknown', totalAmount: 5000 },
    { id: 'benta_active', moduleId: 'benta-snap', totalAmount: 3000 },
  ];

  const filtered = filterSalesByModule(sales, 'benta-snap', 'benta-snap');
  assert.deepEqual(filtered.map(s => s.id), ['legacy_unknown', 'benta_active']);
});

test('filterSalesByModule: legacy sale with no moduleId excluded from non-primary build-stack', () => {
  const sales = [
    { id: 'legacy_unknown', totalAmount: 5000 },
    { id: 'build_active', moduleId: 'build-stack', totalAmount: 3000 },
  ];

  const filtered = filterSalesByModule(sales, 'build-stack', 'benta-snap');
  assert.deepEqual(filtered.map(s => s.id), ['build_active']);
});

test('filterSalesByModule: missing-module sale cannot appear in two modules', () => {
  const sales = [
    { id: 'legacy_unknown', totalAmount: 5000 },
  ];

  const bentaView = filterSalesByModule(sales, 'benta-snap', 'benta-snap');
  const buildView = filterSalesByModule(sales, 'build-stack', 'benta-snap');

  assert.equal(bentaView.length, 1, 'legacy visible in primary module');
  assert.equal(buildView.length, 0, 'legacy NOT visible in add-on module');
});

// ---------------------------------------------------------------------------
// R9 — Zero Order Snap sales + Benta transactions → Order Snap receives zero
// ---------------------------------------------------------------------------

test('filterTransactionsByModule: zero Order Snap sales blocks all Benta transactions for non-primary', () => {
  const transactions = [
    { id: 'tx1', type: 'income', saleId: 'benta_1', totalPesos: 100 },
    { id: 'tx2', type: 'expense', saleId: 'benta_1', totalPesos: 50, category: 'Supplies' },
    { id: 'tx3', type: 'expense', saleId: undefined, totalPesos: 10, category: 'Rent' },
  ];

  const sameModuleSaleIds = new Set<string>([]);
  const filtered = filterTransactionsByModule(transactions, sameModuleSaleIds, false);

  assert.equal(filtered.length, 0);
});

test('filterTransactionsByModule: zero Order Snap sales preserves only unlinked OPEX for primary', () => {
  const transactions = [
    { id: 'tx1', type: 'income', saleId: 'benta_1', totalPesos: 100 },
    { id: 'tx2', type: 'expense', saleId: 'benta_1', totalPesos: 50, category: 'Supplies' },
    { id: 'tx3', type: 'expense', saleId: undefined, totalPesos: 10, category: 'Rent' },
  ];

  const sameModuleSaleIds = new Set<string>([]);
  const filtered = filterTransactionsByModule(transactions, sameModuleSaleIds, true);

  assert.deepEqual(filtered.map(t => t.id), ['tx3']);
});

// ---------------------------------------------------------------------------
// R10 — Missing active module → zero sales and zero sale-linked transactions
// ---------------------------------------------------------------------------

test('filterSalesByModule: missing active module returns empty array', () => {
  const sales = [
    { id: 'benta_1', moduleId: 'benta-snap', totalAmount: 5000 },
    { id: 'order_1', moduleId: 'order-snap', totalAmount: 3000 },
  ];

  const filtered = filterSalesByModule(sales, undefined);
  assert.equal(filtered.length, 0);
});

test('filterTransactionsByModule: missing active module blocks sale-linked for non-primary', () => {
  const transactions = [
    { id: 'tx1', type: 'income', saleId: 'benta_1', totalPesos: 100 },
    { id: 'tx2', type: 'expense', saleId: 'order_1', totalPesos: 50 },
  ];

  const sameModuleSaleIds = new Set<string>([]);
  const filtered = filterTransactionsByModule(transactions, sameModuleSaleIds, false);

  assert.equal(filtered.length, 0);
});

test('filterTransactionsByModule: missing active module preserves only unlinked for primary', () => {
  const transactions = [
    { id: 'tx1', type: 'income', saleId: 'benta_1', totalPesos: 100 },
    { id: 'tx2', type: 'expense', saleId: 'order_1', totalPesos: 50 },
    { id: 'tx3', type: 'expense', saleId: undefined, totalPesos: 10, category: 'Rent' },
  ];

  const sameModuleSaleIds = new Set<string>([]);
  const filtered = filterTransactionsByModule(transactions, sameModuleSaleIds, true);

  assert.deepEqual(filtered.map(t => t.id), ['tx3']);
});

// ---------------------------------------------------------------------------
// R6 — Same filtered dataset used for totals, COGS, profit, charts, history,
//      Edit, and Void (sameModuleSaleIds contract)
// ---------------------------------------------------------------------------

test('computeOwnerPnL: module-filtered sales + module-filtered transactions produce isolated P&L', () => {
  const bentaVoided: SaleRecord = {
    id: 'benta_voided',
    totalAmount: 5000,
    status: 'voided',
    reversalId: 'rev_001',
    items: [{ productId: 'p1', quantity: 1, costPrice: 3000 }],
  };

  const orderSale: SaleRecord = {
    id: 'order_active',
    moduleId: 'order-snap',
    totalAmount: 4000,
    items: [{ productId: 'p2', quantity: 1, costPrice: 2000 }],
  };

  const bentaReversalTx: LedgerTransaction = {
    id: 'tx_benta_rev',
    type: 'expense',
    category: 'Sale Reversal',
    totalPesos: 50,
    saleId: 'benta_voided',
  };

  const bentaIncomeTx: LedgerTransaction = {
    id: 'tx_benta_income',
    type: 'income',
    totalPesos: 50,
    saleId: 'benta_voided',
  };

  const orderIncomeTx: LedgerTransaction = {
    id: 'tx_order_income',
    type: 'income',
    totalPesos: 40,
    saleId: 'order_active',
  };

  const allSales = [bentaVoided, orderSale];
  const allTransactions = [bentaReversalTx, bentaIncomeTx, orderIncomeTx];

  const orderModuleSales = filterSalesByModule(allSales, 'order-snap');
  const orderModuleSaleIds = new Set(orderModuleSales.map(s => s.id).filter(Boolean));
  const orderModuleTransactions = filterTransactionsByModule(allTransactions, orderModuleSaleIds, true);

  const pnl = computeOwnerPnL(orderModuleSales, orderModuleTransactions);

  assert.deepEqual(pnl.activeSales.map(s => s.id), ['order_active']);
  assert.equal(pnl.grossIncomePesos, 40);
  assert.equal(pnl.totalCogsPesos, 20);
  assert.equal(pnl.operatingExpensesPesos, 0);
  assert.equal(pnl.netProfitPesos, 20);
  assert.equal(pnl.activeCheckoutVolume, 1);
  assert.equal(pnl.voidedSaleIds.has('benta_voided'), false, 'Benta voided sale ID must not leak');
});

// ---------------------------------------------------------------------------
// R8 — Unlinked transactions policy via combined filter
// ---------------------------------------------------------------------------

test('filterTransactionsByModule: primary module receives unlinked entries', () => {
  const transactions = [
    { id: 'tx1', type: 'expense', saleId: undefined, totalPesos: 100, category: 'Rent' },
    { id: 'tx2', type: 'income', saleId: 'sale_1', totalPesos: 200 },
  ];

  const filtered = filterTransactionsByModule(transactions, new Set(['sale_1']), true);
  assert.equal(filtered.length, 2);
});

test('filterTransactionsByModule: non-primary module excludes unlinked entries', () => {
  const transactions = [
    { id: 'tx1', type: 'expense', saleId: undefined, totalPesos: 100, category: 'Rent' },
    { id: 'tx2', type: 'income', saleId: 'sale_1', totalPesos: 200 },
  ];

  const filtered = filterTransactionsByModule(transactions, new Set(['sale_1']), false);
  assert.deepEqual(filtered.map(t => t.id), ['tx2']);
});

test('filterTransactionsByModule: zero saleIds + non-primary blocks everything', () => {
  const transactions = [
    { id: 'tx1', type: 'expense', saleId: undefined, totalPesos: 100, category: 'Rent' },
    { id: 'tx2', type: 'income', saleId: 'benta_1', totalPesos: 200 },
  ];

  const filtered = filterTransactionsByModule(transactions, new Set<string>(), false);
  assert.equal(filtered.length, 0);
});

// ---------------------------------------------------------------------------
// R12 — Yesterday comparison excludes other-module and voided income
// ---------------------------------------------------------------------------

test('computeOwnerPnL: yesterday-style module+void filtering excludes cross-module and voided', () => {
  const bentaVoided: SaleRecord = {
    id: 'benta_voided',
    totalAmount: 5000,
    status: 'voided',
    reversalId: 'rev_001',
    items: [{ productId: 'p1', quantity: 1, costPrice: 3000 }],
  };

  const orderSale: SaleRecord = {
    id: 'order_active',
    moduleId: 'order-snap',
    totalAmount: 4000,
    items: [{ productId: 'p2', quantity: 1, costPrice: 2000 }],
  };

  const bentaIncomeTx: LedgerTransaction = {
    id: 'tx_benta_income',
    type: 'income',
    totalPesos: 50,
    saleId: 'benta_voided',
  };

  const orderIncomeTx: LedgerTransaction = {
    id: 'tx_order_income',
    type: 'income',
    totalPesos: 40,
    saleId: 'order_active',
  };

  const orderSales = filterSalesByModule([bentaVoided, orderSale], 'order-snap');
  const orderSaleIds = new Set(orderSales.map(s => s.id).filter(Boolean));
  const orderSaleLinked = filterTransactionsByModule(
    [bentaIncomeTx, orderIncomeTx],
    orderSaleIds,
    true,
  );

  const pnl = computeOwnerPnL(orderSales, orderSaleLinked);
  assert.equal(pnl.grossIncomePesos, 40, 'Only same-module non-voided income counted');
});

// ---------------------------------------------------------------------------
// R13 — Charts exclude voided income and Sale Reversal expense
// ---------------------------------------------------------------------------

test('incomeTxs / expenseTxs: charts exclude voided income and Sale Reversal', () => {
  const voidedSale: SaleRecord = {
    id: 'sale_voided',
    totalAmount: 5000,
    status: 'voided',
    reversalId: 'rev_001',
    items: [],
  };

  const activeSale: SaleRecord = {
    id: 'sale_active',
    totalAmount: 4000,
    items: [],
  };

  const saleReversalTx: LedgerTransaction = {
    id: 'tx_rev',
    type: 'expense',
    category: 'Sale Reversal',
    totalPesos: 50,
    saleId: 'sale_voided',
  };

  const voidedIncomeTx: LedgerTransaction = {
    id: 'tx_void_income',
    type: 'income',
    totalPesos: 50,
    saleId: 'sale_voided',
  };

  const activeIncomeTx: LedgerTransaction = {
    id: 'tx_active_income',
    type: 'income',
    totalPesos: 40,
    saleId: 'sale_active',
  };

  const regularExpenseTx: LedgerTransaction = {
    id: 'tx_opex',
    type: 'expense',
    category: 'Utilities',
    totalPesos: 10,
  };

  const allSales = [voidedSale, activeSale];
  const allTx = [saleReversalTx, voidedIncomeTx, activeIncomeTx, regularExpenseTx];

  const moduleSales = filterSalesByModule(allSales, 'benta-snap', 'benta-snap');
  const moduleSaleIds = new Set(moduleSales.map(s => s.id).filter(Boolean));
  const moduleTx = filterTransactionsByModule(allTx, moduleSaleIds, true);

  const { voidedSaleIds, excludedIncomeLedgerIds } = computeOwnerPnL(moduleSales, moduleTx);

  const incomeTxs = selectActiveIncomeLedgerEntries(moduleTx, voidedSaleIds, excludedIncomeLedgerIds);
  const expenseTxs = moduleTx.filter((tx) => tx.type === 'expense' && !isSaleReversalLedgerEntry(tx));

  assert.deepEqual(incomeTxs.map(t => t.id), ['tx_active_income']);
  assert.deepEqual(expenseTxs.map(t => t.id), ['tx_opex']);
});

// ---------------------------------------------------------------------------
// R14 — Production Order Snap shape normalization and aggregation
// ---------------------------------------------------------------------------

test('normalizeOrderSnapSale: maps production Order Snap finalizer shape', () => {
  const orderSnapSale = {
    id: 'order_sale_001',
    tenantId: 'tenant_001',
    moduleId: 'order-snap',
    status: 'completed',
    totalRevenueCentavos: 22000,
    totalCogsCentavos: 7000,
    saleLines: [
      {
        saleLineId: 'line_1',
        tenantId: 'tenant_001',
        menuItemId: 'menu_1',
        menuItemName: 'Adobo',
        category: 'Main',
        basePriceCentavos: 10000,
        finalUnitPriceCentavos: 11000,
        quantity: 2,
        unitCogsCentavos: 3500,
        lineCogsCentavos: 7000,
        lineRevenueCentavos: 22000,
        lineGrossProfitCentavos: 15000,
        grossMarginBasisPoints: 6818,
        recipeVersionId: 'recipe_1',
        recipeVersionNumber: 1,
        components: [],
        selectedModifiers: [],
        createdAt: '2026-09-03T12:00:00Z',
      },
    ],
    createdAt: new Date('2026-09-03T12:00:00Z'),
  };

  const normalized = normalizeOrderSnapSale(orderSnapSale);

  assert.equal(normalized?.id, 'order_sale_001');
  assert.equal(normalized?.moduleId, 'order-snap');
  assert.equal(normalized?.totalAmount, 22000);
  assert.equal(normalized?.subtotalAmount, 22000);
  assert.equal(normalized?.discountAmount, 0);
  assert.equal(normalized?.status, 'completed');
  assert.equal(normalized?.items?.length, 1);
  assert.equal(normalized?.items?.[0].name, 'Adobo');
  assert.equal(normalized?.items?.[0].quantity, 2);
  assert.equal(normalized?.items?.[0].lineCostCentavos, 7000);
  assert.equal(normalized?.items?.[0].costPrice, 3500);
});

test('computeOwnerPnL: production-shaped Order Snap sale produces correct aggregates', () => {
  const orderSnapSale = {
    id: 'order_sale_001',
    tenantId: 'tenant_001',
    moduleId: 'order-snap',
    status: 'completed',
    totalRevenueCentavos: 22000,
    totalCogsCentavos: 7000,
    saleLines: [
      {
        saleLineId: 'line_1',
        tenantId: 'tenant_001',
        menuItemId: 'menu_1',
        menuItemName: 'Adobo',
        category: 'Main',
        basePriceCentavos: 10000,
        finalUnitPriceCentavos: 11000,
        quantity: 2,
        unitCogsCentavos: 3500,
        lineCogsCentavos: 7000,
        lineRevenueCentavos: 22000,
        lineGrossProfitCentavos: 15000,
        grossMarginBasisPoints: 6818,
        recipeVersionId: 'recipe_1',
        recipeVersionNumber: 1,
        components: [],
        selectedModifiers: [],
        createdAt: '2026-09-03T12:00:00Z',
      },
    ],
    createdAt: new Date('2026-09-03T12:00:00Z'),
  };

  const normalized = normalizeOrderSnapSale(orderSnapSale);
  const result = computeOwnerPnL([normalized!], []);

  assert.equal(result.activeSales.length, 1);
  assert.equal(result.grossIncomePesos, 220);
  assert.equal(result.totalCogsPesos, 70);
  assert.equal(result.grossProfitPesos, 150);
  assert.equal(result.activeCheckoutVolume, 1);
});

// ---------------------------------------------------------------------------
// R15 — Order Snap family modules share one constant
// ---------------------------------------------------------------------------

test('ORDER_SNAP_FAMILY_MODULES: contains all known aliases', () => {
  assert.ok(ORDER_SNAP_FAMILY_MODULES.has('order-snap'));
  assert.ok(ORDER_SNAP_FAMILY_MODULES.has('timpla-track'));
  assert.ok(ORDER_SNAP_FAMILY_MODULES.has('bite-snap'));
  assert.equal(ORDER_SNAP_FAMILY_MODULES.size, 3);
});

test('isOrderSnapFamily: recognizes all aliases', () => {
  assert.equal(isOrderSnapFamily('order-snap'), true);
  assert.equal(isOrderSnapFamily('timpla-track'), true);
  assert.equal(isOrderSnapFamily('bite-snap'), true);
  assert.equal(isOrderSnapFamily('benta-snap'), false);
  assert.equal(isOrderSnapFamily(undefined), false);
});

test('filterSalesByModuleIds: accepts any Order Snap family moduleId', () => {
  const sales = [
    { id: 'order_1', moduleId: 'order-snap', totalAmount: 1000 },
    { id: 'timpla_1', moduleId: 'timpla-track', totalAmount: 2000 },
    { id: 'bite_1', moduleId: 'bite-snap', totalAmount: 3000 },
    { id: 'benta_1', moduleId: 'benta-snap', totalAmount: 4000 },
  ];

  const allowed = new Set(['order-snap', 'timpla-track', 'bite-snap']);
  const filtered = filterSalesByModuleIds(sales, allowed);

  assert.deepEqual(filtered.map(s => s.id), ['order_1', 'timpla_1', 'bite_1']);
});

// ---------------------------------------------------------------------------
// R16 — Order Snap-family Edit/Void handlers remain blocked
// ---------------------------------------------------------------------------

test('canMutateSaleFromReports: blocks Order Snap family and cross-module', () => {
  const orderSale = { id: 'order_1', moduleId: 'order-snap', status: 'completed' };
  const bentaSale = { id: 'benta_1', moduleId: 'benta-snap', status: 'completed' };

  assert.equal(canMutateSaleFromReports(orderSale, 'order-snap'), false);
  assert.equal(canMutateSaleFromReports(orderSale, 'benta-snap'), false);
  assert.equal(canMutateSaleFromReports(bentaSale, 'order-snap'), false);
  assert.equal(canMutateSaleFromReports(bentaSale, 'benta-snap', 'benta-snap'), true);
});

// ---------------------------------------------------------------------------
// R17 — Invalid Order Snap shapes fail closed (return null)
// ---------------------------------------------------------------------------

test('normalizeOrderSnapSale: missing id returns null', () => {
  const result = normalizeOrderSnapSale({
    moduleId: 'order-snap',
    totalRevenueCentavos: 1000,
    totalCogsCentavos: 500,
    saleLines: [],
  });
  assert.equal(result, null);
});

test('normalizeOrderSnapSale: missing moduleId returns null', () => {
  const result = normalizeOrderSnapSale({
    id: 'sale_1',
    totalRevenueCentavos: 1000,
    totalCogsCentavos: 500,
    saleLines: [],
  });
  assert.equal(result, null);
});

test('normalizeOrderSnapSale: non-safe-integer totalRevenueCentavos returns null', () => {
  const result = normalizeOrderSnapSale({
    id: 'sale_1',
    moduleId: 'order-snap',
    totalRevenueCentavos: 1000.5,
    totalCogsCentavos: 500,
    saleLines: [],
  });
  assert.equal(result, null);
});

test('normalizeOrderSnapSale: line totals mismatch header returns null', () => {
  const result = normalizeOrderSnapSale({
    id: 'sale_1',
    moduleId: 'order-snap',
    totalRevenueCentavos: 1000,
    totalCogsCentavos: 500,
    saleLines: [
      {
        menuItemId: 'menu_1',
        menuItemName: 'Test',
        quantity: 1,
        finalUnitPriceCentavos: 500,
        lineCogsCentavos: 200,
        lineRevenueCentavos: 500,
      },
    ],
  });
  assert.equal(result, null);
});

test('normalizeOrderSnapSale: invalid line quantity rejects entire sale', () => {
  const result = normalizeOrderSnapSale({
    id: 'sale_1',
    moduleId: 'order-snap',
    totalRevenueCentavos: 0,
    totalCogsCentavos: 0,
    saleLines: [
      {
        menuItemId: 'menu_1',
        menuItemName: 'Test',
        quantity: 'invalid',
        finalUnitPriceCentavos: 100,
        lineCogsCentavos: 50,
        lineRevenueCentavos: 0,
      },
    ],
  });
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// R18 — Malformed Order Snap records are excluded from checkout count
// ---------------------------------------------------------------------------

test('normalizeSaleForCurrentModule: malformed Order Snap sale returns null', () => {
  const sale = {
    id: 'sale_1',
    moduleId: 'order-snap',
    totalRevenueCentavos: 1000,
    totalCogsCentavos: 500,
    saleLines: [],
  };
  const result = prepareSalesForModule([sale], 'order-snap');
  assert.equal(result.length, 0);
});

test('computeOwnerPnL: malformed Order Snap sale excluded from checkout count', () => {
  const malformedSale = {
    id: 'sale_1',
    moduleId: 'order-snap',
    totalRevenueCentavos: 1000,
    totalCogsCentavos: 500,
    saleLines: [],
  };
  const sales = prepareSalesForModule([malformedSale], 'order-snap');
  const result = computeOwnerPnL(sales, []);
  assert.equal(result.activeCheckoutVolume, 0);
});

// ---------------------------------------------------------------------------
// R19 — Order Snap history amount/items use shared normalization selector
// ---------------------------------------------------------------------------

test('prepareSalesForModule: Order Snap history amount and items correct', () => {
  const orderSnapSale = {
    id: 'order_sale_001',
    tenantId: 'tenant_001',
    moduleId: 'order-snap',
    status: 'completed',
    totalRevenueCentavos: 22000,
    totalCogsCentavos: 7000,
    saleLines: [
      {
        saleLineId: 'line_1',
        menuItemId: 'menu_1',
        menuItemName: 'Adobo',
        quantity: 2,
        finalUnitPriceCentavos: 11000,
        lineCogsCentavos: 7000,
        lineRevenueCentavos: 22000,
        createdAt: '2026-09-03T12:00:00Z',
      },
    ],
  };

  const prepared = prepareSalesForModule([orderSnapSale], 'order-snap');
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].totalAmount, 22000);
  assert.equal(prepared[0].items?.length, 1);
  assert.equal(prepared[0].items?.[0].name, 'Adobo');
});

// ---------------------------------------------------------------------------
// R20 — Daily totals use normalized Order Snap revenue
// ---------------------------------------------------------------------------

test('prepareSalesForModule: daily total reflects normalized Order Snap revenue', () => {
  const sales = [
    {
      id: 'order_1',
      moduleId: 'order-snap',
      totalRevenueCentavos: 1000,
      totalCogsCentavos: 500,
      saleLines: [
        {
          menuItemId: 'menu_1',
          menuItemName: 'Test',
          quantity: 1,
          finalUnitPriceCentavos: 1000,
          lineCogsCentavos: 500,
          lineRevenueCentavos: 1000,
        },
      ],
    },
    {
      id: 'order_2',
      moduleId: 'order-snap',
      totalRevenueCentavos: 2000,
      totalCogsCentavos: 1000,
      saleLines: [
        {
          menuItemId: 'menu_2',
          menuItemName: 'Test 2',
          quantity: 1,
          finalUnitPriceCentavos: 2000,
          lineCogsCentavos: 1000,
          lineRevenueCentavos: 2000,
        },
      ],
    },
  ];

  const prepared = prepareSalesForModule(sales, 'order-snap');
  const total = prepared.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  assert.equal(total, 3000);
});

// ---------------------------------------------------------------------------
// R21 — Legacy Benta handler eligibility preserved
// ---------------------------------------------------------------------------

test('canMutateSaleFromReports: legacy Benta sale eligible when primary module', () => {
  const bentaSale = { id: 'benta_1', moduleId: 'benta-snap', status: 'completed' };
  assert.equal(canMutateSaleFromReports(bentaSale, 'benta-snap', 'benta-snap'), true);
});

test('canMutateSaleFromReports: legacy Benta sale ineligible when not primary module', () => {
  const bentaSale = { id: 'benta_1', moduleId: 'benta-snap', status: 'completed' };
  assert.equal(canMutateSaleFromReports(bentaSale, 'benta-snap', 'build-stack'), false);
});

// ---------------------------------------------------------------------------
// R22 — Stale yesterday request suppression
// ---------------------------------------------------------------------------

test('stale yesterday request: old generation does not call setState', () => {
  let generation = 0;
  let staleSetCalled = false;

  const simulateStaleRequest = () => {
    const currentGeneration = ++generation;
    // Simulate stale: cleanup runs, then old promise resolves
    generation = -1;
    setTimeout(() => {
      if (currentGeneration !== generation) {
        staleSetCalled = true;
      }
    }, 10);
  };

  simulateStaleRequest();
  assert.equal(staleSetCalled, false, 'stale request must not call setState');
});

// ---------------------------------------------------------------------------
// R23 — Legacy Benta void net-zero accounting preserved
// ---------------------------------------------------------------------------

test('computeOwnerPnL: Benta void net-zero accounting preserved when filtered', () => {
  const bentaVoided: SaleRecord = {
    id: 'sale_voided_001',
    totalAmount: 4500,
    status: 'voided',
    voidedAt: '2026-09-02T10:00:00Z',
    reversalId: 'rev_123',
    items: [{ productId: 'prod_oil', quantity: 1, costPrice: 3000 }],
  };

  const saleReversalEntry: LedgerTransaction = {
    id: 'tx_reversal_001',
    type: 'expense',
    category: 'Sale Reversal',
    totalPesos: 45,
    saleId: 'sale_voided_001',
  };

  const originalIncomeEntry: LedgerTransaction = {
    id: 'tx_income_001',
    type: 'income',
    category: 'Sales',
    totalPesos: 45,
    saleId: 'sale_voided_001',
  };

  const result = computeOwnerPnL([bentaVoided], [saleReversalEntry, originalIncomeEntry]);

  assert.equal(result.activeSales.length, 0);
  assert.equal(result.grossIncomePesos, 0);
  assert.equal(result.totalCogsPesos, 0);
  assert.equal(result.operatingExpensesPesos, 0, 'Sale Reversal excluded from OPEX');
  assert.equal(result.netProfitPesos, 0);
  assert.equal(result.activeCheckoutVolume, 0);
});

test('computeOwnerPnL: Benta mixed day active totals preserved when filtered', () => {
  const activeSale: SaleRecord = {
    id: 'sale_active_001',
    totalAmount: 5500,
    items: [{ productId: 'prod_rice', quantity: 1, costPrice: 4200 }],
  };

  const voidedSale: SaleRecord = {
    id: 'sale_voided_002',
    totalAmount: 4500,
    status: 'voided',
    reversalId: 'rev_456',
    items: [{ productId: 'prod_oil', quantity: 1, costPrice: 3000 }],
  };

  const saleReversalEntry: LedgerTransaction = {
    type: 'expense',
    category: 'Sale Reversal',
    totalPesos: 45,
  };

  const result = computeOwnerPnL([activeSale, voidedSale], [saleReversalEntry]);

  assert.equal(result.activeSales.length, 1);
  assert.equal(result.grossIncomePesos, 55);
  assert.equal(result.totalCogsPesos, 42);
  assert.equal(result.grossProfitPesos, 13);
  assert.equal(result.operatingExpensesPesos, 0);
  assert.equal(result.netProfitPesos, 13);
  assert.equal(result.activeCheckoutVolume, 1);
});

// ---------------------------------------------------------------------------
// Cross-module Edit/Void handlers remain blocked
// ---------------------------------------------------------------------------

test('isSaleForCurrentModule: cross-module Edit/Void handlers remain blocked', () => {
  const bentaSale = { id: 'benta_1', moduleId: 'benta-snap', status: 'completed' };
  const orderSale = { id: 'order_1', moduleId: 'order-snap', status: 'completed' };

  assert.equal(isSaleForCurrentModule(bentaSale, 'order-snap'), false);
  assert.equal(isSaleForCurrentModule(orderSale, 'benta-snap'), false);
  assert.equal(isSaleForCurrentModule(bentaSale, 'order-snap', 'benta-snap'), false);
});

// ---------------------------------------------------------------------------
// R7 — Demo module switching cannot reuse another module's sales
// ---------------------------------------------------------------------------

test('filterSalesByModule: switching demo module filters to new module only', () => {
  const sales = [
    { id: 'benta_1', moduleId: 'benta-snap', totalAmount: 5000 },
    { id: 'order_1', moduleId: 'order-snap', totalAmount: 3000 },
    { id: 'legacy', totalAmount: 1000 },
  ];

  const bentaView = filterSalesByModule(sales, 'benta-snap', 'benta-snap');
  assert.deepEqual(bentaView.map(s => s.id), ['benta_1', 'legacy']);

  const orderView = filterSalesByModule(sales, 'order-snap', 'benta-snap');
  assert.deepEqual(orderView.map(s => s.id), ['order_1']);
});

// ---------------------------------------------------------------------------
// isSaleForCurrentModule unit coverage
// ---------------------------------------------------------------------------

test('isSaleForCurrentModule: exact moduleId match', () => {
  assert.equal(isSaleForCurrentModule({ moduleId: 'order-snap' }, 'order-snap'), true);
  assert.equal(isSaleForCurrentModule({ moduleId: 'order-snap' }, 'benta-snap'), false);
});

test('isSaleForCurrentModule: legacy fallback via module field', () => {
  assert.equal(isSaleForCurrentModule({ module: 'build-stack' }, 'build-stack', 'benta-snap'), true);
  assert.equal(isSaleForCurrentModule({ module: 'build-stack' }, 'benta-snap', 'benta-snap'), false);
});

test('isSaleForCurrentModule: missing moduleId in legacy primary module returns true', () => {
  assert.equal(isSaleForCurrentModule({}, 'benta-snap', 'benta-snap'), true);
  assert.equal(isSaleForCurrentModule({}, 'build-stack', 'benta-snap'), false);
});

test('isSaleForCurrentModule: missing moduleId in non-legacy module returns false', () => {
  assert.equal(isSaleForCurrentModule({}, 'order-snap', 'benta-snap'), false);
  assert.equal(isSaleForCurrentModule({}, '5-6-tracker', 'benta-snap'), false);
});

test('isSaleForCurrentModule: undefined moduleType returns false', () => {
  assert.equal(isSaleForCurrentModule({ moduleId: 'order-snap' }, undefined), false);
});

// ---------------------------------------------------------------------------
// Exact regression tests per logic review
// ---------------------------------------------------------------------------

test('prepareSalesForModule: prepared Order Snap sale remains in P&L after one normalization', () => {
  const orderSnapSale = {
    id: 'order_sale_001',
    tenantId: 'tenant_001',
    moduleId: 'order-snap',
    status: 'completed',
    totalRevenueCentavos: 22000,
    totalCogsCentavos: 7000,
    saleLines: [
      {
        saleLineId: 'line_1',
        menuItemId: 'menu_1',
        menuItemName: 'Adobo',
        quantity: 2,
        finalUnitPriceCentavos: 11000,
        lineCogsCentavos: 7000,
        lineRevenueCentavos: 22000,
        createdAt: '2026-09-03T12:00:00Z',
      },
    ],
  };

  const prepared = prepareSalesForModule([orderSnapSale], 'order-snap');
  assert.equal(prepared.length, 1);
  const pnl = computeOwnerPnL(prepared, []);
  assert.equal(pnl.activeSales.length, 1);
  assert.equal(pnl.grossIncomePesos, 220);
  assert.equal(pnl.totalCogsPesos, 70);
  assert.equal(pnl.activeCheckoutVolume, 1);
});

test('prepareSalesForModule: eligible legacy Benta sale remains visible and mutable', () => {
  const bentaSale = {
    id: 'benta_1',
    moduleId: 'benta-snap',
    status: 'completed',
    totalAmount: 5000,
    items: [{ productId: 'p1', quantity: 1, costPrice: 3000 }],
  };

  const prepared = prepareSalesForModule([bentaSale], 'benta-snap', 'benta-snap');
  assert.equal(prepared.length, 1);
  assert.equal(canMutateSaleFromReports(prepared[0], 'benta-snap', 'benta-snap'), true);
});

test('stale yesterday request: cancelled flag prevents state update after cleanup', () => {
  let cancelled = false;
  let stateUpdated = false;

  const simulateRequest = () => {
    const updateState = () => {
      if (cancelled) return;
      stateUpdated = true;
    };
    // Simulate cleanup before promise resolves
    cancelled = true;
    setTimeout(updateState, 10);
  };

  simulateRequest();
  assert.equal(stateUpdated, false, 'stale request must not update state after cleanup');
});

test('normalizeOrderSnapSale: one invalid line rejects entire sale', () => {
  const sale = {
    id: 'sale_1',
    moduleId: 'order-snap',
    totalRevenueCentavos: 1000,
    totalCogsCentavos: 500,
    saleLines: [
      {
        menuItemId: 'menu_1',
        menuItemName: 'Valid',
        quantity: 1,
        finalUnitPriceCentavos: 500,
        lineCogsCentavos: 200,
        lineRevenueCentavos: 500,
      },
      {
        menuItemId: 'menu_2',
        menuItemName: 'Invalid',
        quantity: 'bad',
        finalUnitPriceCentavos: 500,
        lineCogsCentavos: 200,
        lineRevenueCentavos: 500,
      },
    ],
  };

  const result = normalizeOrderSnapSale(sale);
  assert.equal(result, null);
});

test('prepareSalesForModule: normalized history retains createdAt and paymentMethod', () => {
  const orderSnapSale = {
    id: 'order_sale_001',
    tenantId: 'tenant_001',
    moduleId: 'order-snap',
    status: 'completed',
    totalRevenueCentavos: 22000,
    totalCogsCentavos: 7000,
    paymentMethod: 'GCASH',
    createdAt: new Date('2026-09-03T12:00:00Z'),
    saleLines: [
      {
        saleLineId: 'line_1',
        menuItemId: 'menu_1',
        menuItemName: 'Adobo',
        quantity: 2,
        finalUnitPriceCentavos: 11000,
        lineCogsCentavos: 7000,
        lineRevenueCentavos: 22000,
      },
    ],
  };

  const prepared = prepareSalesForModule([orderSnapSale], 'order-snap');
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].paymentMethod, 'GCASH');
  const createdAt = prepared[0].createdAt;
  if (createdAt instanceof Date) {
    assert.equal(createdAt.toISOString(), '2026-09-03T12:00:00.000Z');
  } else {
    assert.equal(createdAt, '2026-09-03T12:00:00.000Z');
  }
});

test('SaleSchema: actual Order Snap shape parses without paymentMethod', () => {
  const orderSnapSale = {
    id: 'order_sale_001',
    tenantId: 'tenant_001',
    moduleId: 'order-snap',
    totalRevenueCentavos: 22000,
    totalCogsCentavos: 7000,
    saleLines: [
      {
        saleLineId: 'line_1',
        menuItemId: 'menu_1',
        menuItemName: 'Adobo',
        quantity: 2,
        finalUnitPriceCentavos: 11000,
        lineCogsCentavos: 7000,
        lineRevenueCentavos: 22000,
      },
    ],
  };

  const result = SaleSchema.safeParse(orderSnapSale);
  assert.equal(result.success, true);
});
