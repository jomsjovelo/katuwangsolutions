/**
 * test/benta-void-report-aggregation.test.ts
 *
 * Behavioral tests for the voided-sale-aware Owner P&L aggregator.
 *
 * Requirements exercised
 * ──────────────────────
 * R1.  isSaleVoided detects all three evidence signals independently.
 * R2.  Active-only aggregation: a day with one voided ₱45 sale (₱30 COGS)
 *      must yield zero across all P&L lines.
 * R3.  Mixed day: only active sales contribute; voided ones are excluded.
 * R4.  "Sale Reversal" ledger entries are NOT counted as operating expenses.
 * R5.  Regular expense entries ARE counted as OPEX.
 * R6.  Income ledger entries linked to a voided saleId are excluded from
 *      incomeTxs used by charts/category views.
 * R7.  Voided sales still appear in the full sales array (audit trail).
 * R8.  Active checkout volume excludes voided sales.
 * R9.  isSaleReversalLedgerEntry gate is category-only, case-sensitive.
 * R10. isIncomeEntryForVoidedSale only triggers for income type + matching id.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isSaleVoided,
  selectActiveSales,
  isSaleReversalLedgerEntry,
  isIncomeEntryForVoidedSale,
  buildExcludedIncomeLedgerIds,
  isIncomeEntryExcluded,
  selectActiveIncomeLedgerEntries,
  computeOwnerPnL,
  type SaleRecord,
  type LedgerTransaction,
} from '../src/lib/shared/benta-sale-report-aggregator';

// ---------------------------------------------------------------------------
// R1 — void detection
// ---------------------------------------------------------------------------

test('isSaleVoided: status=voided triggers detection', () => {
  assert.equal(isSaleVoided({ status: 'voided' }), true);
});

test('isSaleVoided: voidedAt truthy triggers detection', () => {
  assert.equal(isSaleVoided({ voidedAt: '2026-09-01T12:00:00Z' }), true);
});

test('isSaleVoided: reversalId truthy triggers detection', () => {
  assert.equal(isSaleVoided({ reversalId: 'rev_abc123' }), true);
});

test('isSaleVoided: all three evidence fields absent → active', () => {
  assert.equal(isSaleVoided({}), false);
  assert.equal(isSaleVoided({ status: 'completed' }), false);
  assert.equal(isSaleVoided({ voidedAt: null }), false);
  assert.equal(isSaleVoided({ reversalId: '' }), false);
});

test('isSaleVoided: whitespace-only voidedAt is treated as absent', () => {
  assert.equal(isSaleVoided({ voidedAt: '   ' }), false);
});

test('selectActiveSales: home totals exclude voided sales without removing audit records', () => {
  const sales: SaleRecord[] = [
    { id: 'active', totalAmount: 2800 },
    { id: 'voided-status', totalAmount: 4500, status: 'voided' },
    { id: 'voided-reversal', totalAmount: 1500, reversalId: 'rev_1' },
  ];

  const activeSales = selectActiveSales(sales);

  assert.deepEqual(activeSales.map((sale) => sale.id), ['active']);
  assert.equal(
    activeSales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0),
    2800,
  );
  assert.equal(sales.length, 3, 'The audit-history input remains intact');
});

// ---------------------------------------------------------------------------
// R2 — single fully-reversed day → all P&L lines = 0
// ---------------------------------------------------------------------------

test('computeOwnerPnL: single voided ₱45 sale (₱30 COGS) → all zeros', () => {
  const voidedSale: SaleRecord = {
    id: 'sale_voided_001',
    totalAmount: 4500, // ₱45 in centavos
    status: 'voided',
    voidedAt: '2026-09-02T10:00:00Z',
    reversalId: 'rev_123',
    items: [
      {
        productId: 'prod_oil',
        name: 'Cooking Oil 500ml',
        quantity: 1,
        costPrice: 3000, // ₱30 in centavos
      },
    ],
  };

  // The compensating ledger entry that the server writes
  const saleReversalEntry: LedgerTransaction = {
    id: 'tx_reversal_001',
    type: 'expense',
    category: 'Sale Reversal',
    totalPesos: 45, // compensating ₱45 write-back
    saleId: 'sale_voided_001',
  };

  // The original income entry for the now-voided sale
  const originalIncomeEntry: LedgerTransaction = {
    id: 'tx_income_001',
    type: 'income',
    category: 'Sales',
    totalPesos: 45,
    saleId: 'sale_voided_001',
  };

  const result = computeOwnerPnL([voidedSale], [saleReversalEntry, originalIncomeEntry]);

  assert.equal(result.activeSales.length, 0, 'No active sales');
  assert.equal(result.grossIncomePesos, 0, 'Gross revenue must be ₱0');
  assert.equal(result.totalCogsPesos, 0, 'COGS must be ₱0');
  assert.equal(result.grossProfitPesos, 0, 'Gross profit must be ₱0');
  assert.equal(result.operatingExpensesPesos, 0, 'OPEX must be ₱0 (Sale Reversal excluded)');
  assert.equal(result.netProfitPesos, 0, 'Net profit must be ₱0');
  assert.equal(result.grossSalesBeforeDiscountsPesos, 0, 'Pre-discount gross sales must be ₱0');
  assert.equal(result.totalDiscountsGivenPesos, 0, 'Discounts must be ₱0');
  assert.equal(result.activeCheckoutVolume, 0, 'Active checkout volume must be 0');
});

// ---------------------------------------------------------------------------
// R3 — mixed day: voided + active
// ---------------------------------------------------------------------------

test('computeOwnerPnL: mixed day — voided sale excluded from active aggregates', () => {
  const activeSale: SaleRecord = {
    id: 'sale_active_001',
    totalAmount: 5500, // ₱55
    items: [{ productId: 'prod_rice', quantity: 1, costPrice: 4200 }], // ₱42
  };

  const voidedSale: SaleRecord = {
    id: 'sale_voided_002',
    totalAmount: 4500, // ₱45
    status: 'voided',
    reversalId: 'rev_456',
    items: [{ productId: 'prod_oil', quantity: 1, costPrice: 3000 }], // ₱30
  };

  const saleReversalEntry: LedgerTransaction = {
    type: 'expense',
    category: 'Sale Reversal',
    totalPesos: 45,
  };

  const result = computeOwnerPnL([activeSale, voidedSale], [saleReversalEntry]);

  assert.equal(result.activeSales.length, 1, 'Only the non-voided sale is active');
  assert.equal(result.grossIncomePesos, 55, 'Gross revenue = ₱55 (active sale only)');
  assert.equal(result.totalCogsPesos, 42, 'COGS = ₱42 (active sale only)');
  assert.equal(result.grossProfitPesos, 13, 'Gross profit = ₱55 - ₱42 = ₱13');
  assert.equal(result.operatingExpensesPesos, 0, 'Sale Reversal entry not counted as OPEX');
  assert.equal(result.netProfitPesos, 13, 'Net profit = gross profit - 0 OPEX = ₱13');
  assert.equal(result.activeCheckoutVolume, 1, 'Active checkout volume = 1');
  assert.equal(result.voidedSaleIds.has('sale_voided_002'), true, 'voided ID tracked');
});

// ---------------------------------------------------------------------------
// R4 — Sale Reversal NOT counted as OPEX
// ---------------------------------------------------------------------------

test('isSaleReversalLedgerEntry: category === "Sale Reversal" → true', () => {
  assert.equal(isSaleReversalLedgerEntry({ category: 'Sale Reversal', type: 'expense', totalPesos: 100 }), true);
});

test('isSaleReversalLedgerEntry: other expense categories → false', () => {
  assert.equal(isSaleReversalLedgerEntry({ category: 'Utilities', type: 'expense' }), false);
  assert.equal(isSaleReversalLedgerEntry({ category: 'sale reversal', type: 'expense' }), false, 'Case sensitive');
  assert.equal(isSaleReversalLedgerEntry({ type: 'expense' }), false, 'Undefined category');
});

// ---------------------------------------------------------------------------
// R5 — Regular OPEX IS counted
// ---------------------------------------------------------------------------

test('computeOwnerPnL: regular OPEX reduces net profit', () => {
  const activeSale: SaleRecord = {
    id: 'sale_001',
    totalAmount: 5500,
    items: [{ quantity: 1, costPrice: 4000 }],
  };

  const utilityExpense: LedgerTransaction = {
    type: 'expense',
    category: 'Utilities',
    totalPesos: 5,
  };

  const result = computeOwnerPnL([activeSale], [utilityExpense]);

  assert.equal(result.operatingExpensesPesos, 5, 'Utility expense included in OPEX');
  assert.equal(result.grossProfitPesos, 15, 'Gross profit = ₱55 - ₱40 = ₱15');
  assert.equal(result.netProfitPesos, 10, 'Net profit = ₱15 - ₱5 = ₱10');
});

// ---------------------------------------------------------------------------
// R6 — Income entries for voided saleIds excluded from isIncomeEntryForVoidedSale
// ---------------------------------------------------------------------------

test('isIncomeEntryForVoidedSale: income type + matching saleId → true', () => {
  const voidedIds = new Set(['sale_voided_001']);
  const tx: LedgerTransaction = { type: 'income', saleId: 'sale_voided_001', totalPesos: 45 };
  assert.equal(isIncomeEntryForVoidedSale(tx, voidedIds), true);
});

test('isIncomeEntryForVoidedSale: expense type → false even if saleId matches', () => {
  const voidedIds = new Set(['sale_voided_001']);
  const tx: LedgerTransaction = { type: 'expense', saleId: 'sale_voided_001', totalPesos: 45 };
  assert.equal(isIncomeEntryForVoidedSale(tx, voidedIds), false);
});

test('isIncomeEntryForVoidedSale: income type but saleId not in voided set → false', () => {
  const voidedIds = new Set(['sale_voided_001']);
  const tx: LedgerTransaction = { type: 'income', saleId: 'sale_active_999', totalPesos: 45 };
  assert.equal(isIncomeEntryForVoidedSale(tx, voidedIds), false);
});

test('isIncomeEntryForVoidedSale: income type but no saleId → false', () => {
  const voidedIds = new Set(['sale_voided_001']);
  const tx: LedgerTransaction = { type: 'income', totalPesos: 45 };
  assert.equal(isIncomeEntryForVoidedSale(tx, voidedIds), false);
});

// ---------------------------------------------------------------------------
// R7 — Voided sales retained in history (audit trail)
// ---------------------------------------------------------------------------

test('computeOwnerPnL: voided sale is NOT removed from input array (audit trail)', () => {
  const voidedSale: SaleRecord = {
    id: 'sale_voided_audit',
    totalAmount: 2800,
    status: 'voided',
    reversalId: 'rev_audit',
    items: [],
  };

  // The input array is unchanged — caller still has the voided sale for display
  const inputSales = [voidedSale];
  computeOwnerPnL(inputSales, []);
  assert.equal(inputSales.length, 1, 'Input array must not be mutated');
  assert.equal(inputSales[0].id, 'sale_voided_audit', 'Voided sale still present for caller (audit trail)');
});

// ---------------------------------------------------------------------------
// R8 — Active checkout volume
// ---------------------------------------------------------------------------

test('computeOwnerPnL: active checkout volume excludes voided', () => {
  const sales: SaleRecord[] = [
    { id: 's1', totalAmount: 1000, items: [] },
    { id: 's2', totalAmount: 1000, status: 'voided' },
    { id: 's3', totalAmount: 1000, items: [] },
  ];
  const result = computeOwnerPnL(sales, []);
  assert.equal(result.activeCheckoutVolume, 2, 'Only 2 active sales counted');
});

// ---------------------------------------------------------------------------
// R9 — Mixed same-day scenario: only voided from status
// ---------------------------------------------------------------------------

test('computeOwnerPnL: voidedAt detection without status field', () => {
  const sale: SaleRecord = {
    id: 'sale_voidedAt_only',
    totalAmount: 4500,
    voidedAt: '2026-09-02T12:00:00Z',
    items: [{ quantity: 1, costPrice: 3000 }],
  };
  const result = computeOwnerPnL([sale], []);
  assert.equal(result.grossIncomePesos, 0, 'voidedAt alone → excluded from revenue');
});

// ---------------------------------------------------------------------------
// R10 — Discounts excluded for voided sales
// ---------------------------------------------------------------------------

test('computeOwnerPnL: discounts from voided sales not counted', () => {
  const active: SaleRecord = {
    id: 'sale_active',
    totalAmount: 4750, // after ₱2.50 discount
    subtotalAmount: 5000, // pre-discount
    discountAmount: 250,  // ₱2.50 discount
    items: [{ quantity: 1, costPrice: 3000 }],
  };
  const voided: SaleRecord = {
    id: 'sale_voided',
    totalAmount: 2375,
    subtotalAmount: 2500,
    discountAmount: 125, // this discount must not count
    status: 'voided',
    items: [{ quantity: 1, costPrice: 1500 }],
  };

  const result = computeOwnerPnL([active, voided], []);
  assert.equal(result.grossSalesBeforeDiscountsPesos, 50, 'Pre-discount only from active: ₱50');
  assert.equal(result.totalDiscountsGivenPesos, 2.5, 'Discounts only from active: ₱2.50');
  assert.equal(result.grossIncomePesos, 47.5, 'Revenue only from active: ₱47.50');
});

// ===========================================================================
// EMULATOR SHAPE — originalIncomeLedgerId path
// The actual emulator evidence shows:
//   • Original income entry: { id: "tx_income_abc", type: "income", ... }
//     → No saleId field present
//   • Sale Reversal expense entry: { type: "expense", category: "Sale Reversal",
//     originalIncomeLedgerId: "tx_income_abc", ... }
//
// R11-R15 verify the id-based exclusion path.
// ===========================================================================

// ---------------------------------------------------------------------------
// R11 — buildExcludedIncomeLedgerIds collects ids from originalIncomeLedgerId
// ---------------------------------------------------------------------------

test('buildExcludedIncomeLedgerIds: collects originalIncomeLedgerId from Sale Reversal entries', () => {
  const txs = [
    { id: 'tx_reversal', type: 'expense', category: 'Sale Reversal', totalPesos: 45, originalIncomeLedgerId: 'tx_income_abc' },
    { id: 'tx_income_abc', type: 'income', category: 'Sales', totalPesos: 45 },
    { id: 'tx_unrelated', type: 'income', category: 'Sales', totalPesos: 28 },
  ];
  const result = buildExcludedIncomeLedgerIds(txs, new Set());
  assert.equal(result.has('tx_income_abc'), true, 'Original income id must be in excluded set');
  assert.equal(result.has('tx_unrelated'), false, 'Unrelated income id must not be excluded');
});

test('buildExcludedIncomeLedgerIds: also captures saleId-based income IDs', () => {
  const voidedSaleIds = new Set(['sale_voided_001']);
  const txs = [
    { id: 'tx_income_with_saleid', type: 'income', saleId: 'sale_voided_001', totalPesos: 55 },
    { id: 'tx_income_other', type: 'income', saleId: 'sale_active_002', totalPesos: 28 },
  ];
  const result = buildExcludedIncomeLedgerIds(txs, voidedSaleIds);
  assert.equal(result.has('tx_income_with_saleid'), true, 'saleId-linked income id must be excluded');
  assert.equal(result.has('tx_income_other'), false, 'Active sale income id must not be excluded');
});

// ---------------------------------------------------------------------------
// R12 — isIncomeEntryExcluded: id-based path (emulator shape)
// ---------------------------------------------------------------------------

test('isIncomeEntryExcluded: excludes income entry whose id is in excludedIncomeLedgerIds', () => {
  const excludedIds = new Set(['tx_income_abc']);
  const tx = { id: 'tx_income_abc', type: 'income', totalPesos: 45 };
  assert.equal(isIncomeEntryExcluded(tx, new Set(), excludedIds), true);
});

test('isIncomeEntryExcluded: does not exclude income entry whose id is NOT in set', () => {
  const excludedIds = new Set(['tx_income_abc']);
  const tx = { id: 'tx_income_other', type: 'income', totalPesos: 28 };
  assert.equal(isIncomeEntryExcluded(tx, new Set(), excludedIds), false);
});

test('isIncomeEntryExcluded: expense type is never excluded', () => {
  const excludedIds = new Set(['tx_income_abc']);
  const tx = { id: 'tx_income_abc', type: 'expense', totalPesos: 45 };
  assert.equal(isIncomeEntryExcluded(tx, new Set(), excludedIds), false);
});

test('isIncomeEntryExcluded: saleId path still works when excludedIncomeLedgerIds is empty', () => {
  const voidedSaleIds = new Set(['sale_voided_001']);
  const tx = { id: 'tx_x', type: 'income', saleId: 'sale_voided_001', totalPesos: 45 };
  assert.equal(isIncomeEntryExcluded(tx, voidedSaleIds, new Set()), true);
});

// ---------------------------------------------------------------------------
// R13 — Full emulator shape: no saleId on income entry, Sale Reversal has
//        originalIncomeLedgerId. Original income must be excluded.
// ---------------------------------------------------------------------------

test('computeOwnerPnL: emulator shape — original income without saleId excluded via originalIncomeLedgerId', () => {
  const voidedSale: SaleRecord = {
    id: 'sale_voided_emulator',
    totalAmount: 4500,
    status: 'voided',
    reversalId: 'rev_emulator',
    items: [{ productId: 'prod_oil', quantity: 1, costPrice: 3000 }],
  };

  // Emulator shape: original income entry has NO saleId
  const originalIncomeEntry = {
    id: 'tx_income_emulator_001',
    type: 'income',
    category: 'Sales',
    totalPesos: 45,
    // No saleId here — this is the confirmed gap
  };

  // Sale Reversal expense entry has originalIncomeLedgerId pointing to the income entry
  const saleReversalEntry = {
    id: 'tx_reversal_emulator_001',
    type: 'expense',
    category: 'Sale Reversal',
    totalPesos: 45,
    originalIncomeLedgerId: 'tx_income_emulator_001',
  };

  // Unrelated active income (must remain)
  const unrelatedIncome = {
    id: 'tx_income_unrelated',
    type: 'income',
    category: 'Sales',
    totalPesos: 28,
  };

  const result = computeOwnerPnL(
    [voidedSale],
    [originalIncomeEntry, saleReversalEntry, unrelatedIncome],
  );

  // The excluded set must contain the original income id
  assert.equal(
    result.excludedIncomeLedgerIds.has('tx_income_emulator_001'),
    true,
    'Original income id must be in excludedIncomeLedgerIds',
  );

  // P&L lines for the voided sale must all be zero
  assert.equal(result.grossIncomePesos, 0, 'Revenue must be ₱0');
  assert.equal(result.totalCogsPesos, 0, 'COGS must be ₱0');
  assert.equal(result.grossProfitPesos, 0, 'Gross profit must be ₱0');
  assert.equal(result.operatingExpensesPesos, 0, 'OPEX must be ₱0 (Sale Reversal excluded)');
  assert.equal(result.netProfitPesos, 0, 'Net profit must be ₱0');
  assert.equal(result.activeCheckoutVolume, 0, 'Active checkout volume must be 0');
});

// ---------------------------------------------------------------------------
// R14 — Unrelated income and ordinary OPEX are unaffected
// ---------------------------------------------------------------------------

test('computeOwnerPnL: emulator shape — unrelated income and OPEX are preserved', () => {
  const activeSale: SaleRecord = {
    id: 'sale_active_emulator',
    totalAmount: 5500,
    items: [{ quantity: 1, costPrice: 4200 }],
  };

  const voidedSale: SaleRecord = {
    id: 'sale_voided_emulator2',
    totalAmount: 4500,
    status: 'voided',
    reversalId: 'rev_em2',
    items: [{ quantity: 1, costPrice: 3000 }],
  };

  const originalIncomeNoSaleId = {
    id: 'tx_income_voided',
    type: 'income',
    category: 'Sales',
    totalPesos: 45,
    // No saleId
  };

  const saleReversalEntry = {
    id: 'tx_reversal_em2',
    type: 'expense',
    category: 'Sale Reversal',
    totalPesos: 45,
    originalIncomeLedgerId: 'tx_income_voided',
  };

  const unrelatedIncome = {
    id: 'tx_income_active',
    type: 'income',
    category: 'Sales',
    totalPesos: 55,
  };

  const utilityExpense = {
    id: 'tx_utility',
    type: 'expense',
    category: 'Utilities',
    totalPesos: 10,
  };

  const result = computeOwnerPnL(
    [activeSale, voidedSale],
    [originalIncomeNoSaleId, saleReversalEntry, unrelatedIncome, utilityExpense],
  );

  // Voided income must be excluded; unrelated income is NOT excluded
  assert.equal(result.excludedIncomeLedgerIds.has('tx_income_voided'), true);
  assert.equal(result.excludedIncomeLedgerIds.has('tx_income_active'), false);

  // P&L uses only the active sale
  assert.equal(result.grossIncomePesos, 55, 'Revenue only from active sale: ₱55');
  assert.equal(result.totalCogsPesos, 42, 'COGS only from active sale: ₱42');
  assert.equal(result.grossProfitPesos, 13, 'Gross profit: ₱55 - ₱42 = ₱13');

  // OPEX: Sale Reversal excluded, utility kept
  assert.equal(result.operatingExpensesPesos, 10, 'Only ₱10 utility expense counts as OPEX');
  assert.equal(result.netProfitPesos, 3, 'Net profit: ₱13 - ₱10 = ₱3');
});

// ---------------------------------------------------------------------------
// R15 — buildExcludedIncomeLedgerIds: non-Sale-Reversal expenses ignored
// ---------------------------------------------------------------------------

test('buildExcludedIncomeLedgerIds: ordinary expense with originalIncomeLedgerId NOT treated as reversal', () => {
  const txs = [
    // A non-Sale-Reversal expense with an originalIncomeLedgerId field — must be ignored
    { id: 'tx_expense', type: 'expense', category: 'Utilities', totalPesos: 10, originalIncomeLedgerId: 'tx_income_xyz' },
    { id: 'tx_income_xyz', type: 'income', totalPesos: 55 },
  ];
  const result = buildExcludedIncomeLedgerIds(txs, new Set());
  assert.equal(result.has('tx_income_xyz'), false, 'Ordinary expense must not trigger exclusion');
});

test('selectActiveIncomeLedgerEntries: reversal expenses never appear in revenue charts', () => {
  const transactions: LedgerTransaction[] = [
    {
      id: 'tx_income_voided',
      type: 'income',
      category: 'Sales',
      totalPesos: 45,
    },
    {
      id: 'tx_reversal',
      type: 'expense',
      category: 'Sale Reversal',
      totalPesos: 45,
      originalIncomeLedgerId: 'tx_income_voided',
    },
    {
      id: 'tx_income_active',
      type: 'income',
      category: 'Sales',
      totalPesos: 28,
    },
    {
      id: 'tx_utility',
      type: 'expense',
      category: 'Utilities',
      totalPesos: 10,
    },
  ];
  const voidedSaleIds = new Set<string>();
  const excludedIncomeLedgerIds = buildExcludedIncomeLedgerIds(
    transactions,
    voidedSaleIds,
  );

  const selected = selectActiveIncomeLedgerEntries(
    transactions,
    voidedSaleIds,
    excludedIncomeLedgerIds,
  );

  assert.deepEqual(
    selected.map((tx) => tx.id),
    ['tx_income_active'],
    'Only unrelated active income is eligible for revenue visualizations',
  );
});

