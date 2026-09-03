/**
 * benta-sale-report-aggregator.ts
 *
 * Pure, framework-free aggregation helpers for the Owner P&L Report.
 * Intentionally free of React / Firestore imports so it can be exercised
 * by plain Node test runners without any mocking.
 *
 * Voided-sale exclusion rules
 * ───────────────────────────
 *  A sale is voided when ANY of the following is true:
 *    • sale.status === "voided"
 *    • sale.voidedAt is a truthy, non-empty value
 *    • sale.reversalId is a truthy, non-empty value
 *
 * Voided sales must be:
 *    • excluded from gross revenue, COGS, discounts, gross-sales-pre-discount
 *    • excluded from active checkout count
 *    • retained in the transaction history for auditability (with a VOIDED badge)
 *
 * Sale-Reversal ledger entries
 * ────────────────────────────
 *  The server writes a compensating "Sale Reversal" ledger record with
 *  category === "Sale Reversal" and type === "expense". This MUST NOT be
 *  counted as an operating expense.
 */

import { computeLineFinancials } from './quantity-math';

// ---------------------------------------------------------------------------
// Types (mirror what the dashboard uses – kept minimal for portability)
// ---------------------------------------------------------------------------

export interface SaleItemSnapshot {
  productId?: string;
  name?: string;
  quantity?: number;
  quantityMode?: 'discrete' | 'measured';
  quantityMinor?: number;
  quantityScale?: number;
  unitCostCentavos?: number;
  lineCostCentavos?: number;
  costPrice?: number; // centavos (legacy field)
  lineCost?: number;  // centavos (legacy field)
  price?: number;     // centavos
}

export interface SaleRecord {
  id?: string;
  tenantId?: string;
  module?: string;
  moduleId?: string;
  totalAmount?: number;       // centavos
  subtotalAmount?: number;    // centavos (pre-discount)
  discountAmount?: number;    // centavos
  status?: string;
  voidedAt?: string | null;
  reversalId?: string | null;
  items?: SaleItemSnapshot[];
  createdAt?: any;
  paymentMethod?: string;
  orderId?: string;
}

export interface LedgerTransaction {
  id?: string;
  type?: 'income' | 'expense' | string;
  category?: string;
  totalPesos?: number;
  /**
   * Set on income entries written by the checkout engine.
   * May be absent on older records — use id-based lookup as fallback.
   */
  saleId?: string;
  /**
   * Set on Sale Reversal expense entries by the server reversal engine.
   * Points to the `id` of the original income ledger record that must be
   * excluded from charts/category aggregations.
   */
  originalIncomeLedgerId?: string;
}

// ---------------------------------------------------------------------------
// Void detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the sale carries authoritative evidence that it has
 * been fully reversed. Uses status, voidedAt, and reversalId.
 */
export function isSaleVoided(sale: SaleRecord): boolean {
  if (sale.status === 'voided') return true;
  if (sale.voidedAt && String(sale.voidedAt).trim().length > 0) return true;
  if (sale.reversalId && String(sale.reversalId).trim().length > 0) return true;
  return false;
}

/** Returns only sales that still contribute to operational totals. */
export function selectActiveSales<T extends SaleRecord>(sales: T[]): T[] {
  return sales.filter((sale) => !isSaleVoided(sale));
}

// ---------------------------------------------------------------------------
// Order Snap shape normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a production Order Snap sale document into the common SaleRecord
 * shape consumed by the report aggregator.
 *
 * Order Snap finalizer writes:
 *   - totalRevenueCentavos  (instead of totalAmount)
 *   - totalCogsCentavos     (authoritative line-level COGS)
 *   - saleLines             (instead of items)
 *   - moduleId              (canonical module identifier)
 *
 * This mapper is intentionally pure and does not mutate the input.
 *
 * Returns null for malformed data. Any invalid line causes the entire sale
 * to be rejected. Malformed records must not increase checkout count.
 */
export function normalizeOrderSnapSale(sale: Record<string, any>): SaleRecord | null {
  const saleId = sale.id ?? sale.saleId;
  if (!saleId || typeof saleId !== 'string') {
    return null;
  }

  const moduleId = sale.moduleId;
  if (!moduleId || typeof moduleId !== 'string') {
    return null;
  }

  const totalRevenueCentavos = sale.totalRevenueCentavos;
  const totalCogsCentavos = sale.totalCogsCentavos;

  if (
    typeof totalRevenueCentavos !== 'number' ||
    !Number.isSafeInteger(totalRevenueCentavos) ||
    totalRevenueCentavos < 0
  ) {
    return null;
  }

  if (
    typeof totalCogsCentavos !== 'number' ||
    !Number.isSafeInteger(totalCogsCentavos) ||
    totalCogsCentavos < 0
  ) {
    return null;
  }

  const saleLines = Array.isArray(sale.saleLines) ? sale.saleLines : [];
  const items: SaleItemSnapshot[] = [];
  let lineRevenueSum = 0;
  let lineCogsSum = 0;

  for (const line of saleLines) {
    const menuItemId = line.menuItemId;
    const quantity = line.quantity;
    const finalUnitPriceCentavos = line.finalUnitPriceCentavos;
    const lineCogsCentavos = line.lineCogsCentavos;
    const lineRevenueCentavos = line.lineRevenueCentavos;

    if (
      !menuItemId ||
      typeof menuItemId !== 'string' ||
      typeof quantity !== 'number' ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      return null;
    }

    if (
      typeof finalUnitPriceCentavos !== 'number' ||
      !Number.isSafeInteger(finalUnitPriceCentavos) ||
      finalUnitPriceCentavos < 0
    ) {
      return null;
    }

    if (
      typeof lineCogsCentavos !== 'number' ||
      !Number.isSafeInteger(lineCogsCentavos) ||
      lineCogsCentavos < 0
    ) {
      return null;
    }

    if (
      typeof lineRevenueCentavos !== 'number' ||
      !Number.isSafeInteger(lineRevenueCentavos) ||
      lineRevenueCentavos < 0
    ) {
      return null;
    }

    const expectedLineRevenue = quantity * finalUnitPriceCentavos;
    if (lineRevenueCentavos !== expectedLineRevenue) {
      return null;
    }

    lineRevenueSum += lineRevenueCentavos;
    lineCogsSum += lineCogsCentavos;

    items.push({
      productId: menuItemId,
      name: line.menuItemName || menuItemId,
      quantity,
      price: finalUnitPriceCentavos,
      lineCostCentavos: lineCogsCentavos,
      costPrice: line.unitCogsCentavos ?? lineCogsCentavos,
      lineCost: lineCogsCentavos,
    });
  }

  if (lineRevenueSum !== totalRevenueCentavos || lineCogsSum !== totalCogsCentavos) {
    return null;
  }

  return {
    id: saleId,
    tenantId: sale.tenantId,
    module: moduleId,
    moduleId,
    totalAmount: totalRevenueCentavos,
    subtotalAmount: totalRevenueCentavos,
    discountAmount: 0,
    status: sale.status || 'completed',
    voidedAt: sale.voidedAt,
    reversalId: sale.reversalId,
    items,
  };
}

// ---------------------------------------------------------------------------
// Ledger entry filtering
// ---------------------------------------------------------------------------

/**
 * Returns true when a ledger entry is the compensating "Sale Reversal"
 * record emitted by the server reversal engine. These must not be counted
 * as operating expenses.
 */
export function isSaleReversalLedgerEntry(tx: LedgerTransaction): boolean {
  return tx.category === 'Sale Reversal';
}

/**
 * Builds the complete set of income ledger doc IDs that must be excluded
 * from chart and category aggregations because their corresponding sale
 * was reversed.
 *
 * Two sources are combined:
 *  1. saleId-based: income entries where tx.saleId is in voidedSaleIds.
 *  2. originalIncomeLedgerId-based: income entries whose doc `id` is
 *     referenced by a Sale Reversal expense entry's originalIncomeLedgerId
 *     (used when the income entry was written before saleId was added).
 *
 * @returns A Set of income ledger doc IDs to exclude.
 */
export function buildExcludedIncomeLedgerIds(
  allLedgerTxs: LedgerTransaction[],
  voidedSaleIds: ReadonlySet<string>,
): Set<string> {
  const excluded = new Set<string>();

  // Pass 1: collect originalIncomeLedgerId references from reversal entries
  for (const tx of allLedgerTxs) {
    if (
      tx.type === 'expense' &&
      isSaleReversalLedgerEntry(tx) &&
      tx.originalIncomeLedgerId
    ) {
      excluded.add(tx.originalIncomeLedgerId);
    }
  }

  // Pass 2: add income entry IDs whose saleId is in the voided set
  for (const tx of allLedgerTxs) {
    if (tx.type === 'income' && tx.saleId && voidedSaleIds.has(tx.saleId)) {
      if (tx.id) excluded.add(tx.id);
    }
  }

  return excluded;
}

/**
 * Returns true when an income ledger transaction should be excluded from
 * chart and category aggregations because its corresponding sale was reversed.
 *
 * Checks both:
 *  1. tx.saleId membership in voidedSaleIds (when present).
 *  2. tx.id membership in excludedIncomeLedgerIds (id-based lookup for
 *     older entries without saleId, resolved via originalIncomeLedgerId).
 */
export function isIncomeEntryExcluded(
  tx: LedgerTransaction,
  voidedSaleIds: ReadonlySet<string>,
  excludedIncomeLedgerIds: ReadonlySet<string>,
): boolean {
  if (tx.type !== 'income') return false;
  if (tx.saleId && voidedSaleIds.has(tx.saleId)) return true;
  if (tx.id && excludedIncomeLedgerIds.has(tx.id)) return true;
  return false;
}

/**
 * Returns only active income ledger entries for revenue charts and category
 * breakdowns. Expense records, including Sale Reversal compensation entries,
 * can never enter a revenue visualization through this boundary.
 */
export function selectActiveIncomeLedgerEntries<T extends LedgerTransaction>(
  allLedgerTxs: T[],
  voidedSaleIds: ReadonlySet<string>,
  excludedIncomeLedgerIds: ReadonlySet<string>,
): T[] {
  return allLedgerTxs.filter(
    (tx) =>
      tx.type === 'income' &&
      !isIncomeEntryExcluded(tx, voidedSaleIds, excludedIncomeLedgerIds),
  );
}

/**
 * @deprecated Use isIncomeEntryExcluded instead — it also handles entries
 * without a saleId field via originalIncomeLedgerId cross-reference.
 *
 * Retained for backward compatibility with existing unit tests.
 */
export function isIncomeEntryForVoidedSale(
  tx: LedgerTransaction,
  voidedSaleIds: ReadonlySet<string>,
): boolean {
  if (tx.type !== 'income') return false;
  if (!tx.saleId) return false;
  return voidedSaleIds.has(tx.saleId);
}

// ---------------------------------------------------------------------------
// Core COGS computation (shared between RetailMetrics and the P&L statement)
// ---------------------------------------------------------------------------

export interface CogsResult {
  totalCogsCentavos: number;
  missingCostItemsCount: number;
  hasMissingCost: boolean;
}

export function computeSaleCogs(sale: SaleRecord): CogsResult {
  let totalCogsCentavos = 0;
  let missingCostItemsCount = 0;
  let hasMissingCost = false;

  const items = sale.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { totalCogsCentavos: 0, missingCostItemsCount: 0, hasMissingCost: true };
  }

  for (const item of items) {
    // Priority 1: lineCostCentavos (canonical snapshot from server)
    if (
      typeof item.lineCostCentavos === 'number' &&
      Number.isSafeInteger(item.lineCostCentavos) &&
      item.lineCostCentavos >= 0
    ) {
      totalCogsCentavos += item.lineCostCentavos;
      continue;
    }

    // Priority 2: lineCost (legacy alias)
    if (
      typeof item.lineCost === 'number' &&
      Number.isSafeInteger(item.lineCost) &&
      item.lineCost >= 0
    ) {
      totalCogsCentavos += item.lineCost;
      continue;
    }

    // Priority 3: measured-quantity items
    if (item.quantityMode === 'measured' || item.quantityMinor !== undefined) {
      const qtyMinor = item.quantityMinor;
      const costPrice = item.unitCostCentavos ?? item.costPrice;
      const scale = item.quantityScale ?? 3;
      if (
        Number.isSafeInteger(qtyMinor) &&
        (qtyMinor as number) > 0 &&
        costPrice !== undefined &&
        costPrice !== null &&
        Number.isSafeInteger(costPrice) &&
        (costPrice as number) >= 0
      ) {
        totalCogsCentavos += computeLineFinancials(
          costPrice as number,
          qtyMinor as number,
          scale,
        );
      } else {
        missingCostItemsCount++;
        hasMissingCost = true;
      }
      continue;
    }

    // Priority 4: discrete quantity x unit cost
    const qty = item.quantity;
    const costPrice = item.unitCostCentavos ?? item.costPrice;
    if (
      Number.isSafeInteger(qty) &&
      (qty as number) > 0 &&
      costPrice !== undefined &&
      costPrice !== null &&
      Number.isSafeInteger(costPrice) &&
      (costPrice as number) >= 0
    ) {
      totalCogsCentavos += (costPrice as number) * (qty as number);
    } else {
      missingCostItemsCount++;
      hasMissingCost = true;
    }
  }

  return { totalCogsCentavos, missingCostItemsCount, hasMissingCost };
}

// ---------------------------------------------------------------------------
// Full P&L aggregation
// ---------------------------------------------------------------------------

export interface OwnerPnLResult {
  /** Active (non-voided) sales only. */
  activeSales: SaleRecord[];
  voidedSaleIds: ReadonlySet<string>;

  /**
   * Income ledger doc IDs to exclude from chart / category aggregations.
   * Combines saleId-based and originalIncomeLedgerId-based lookups so
   * entries without a saleId field are also correctly excluded.
   */
  excludedIncomeLedgerIds: ReadonlySet<string>;

  grossIncomePesos: number;
  grossSalesBeforeDiscountsPesos: number;
  totalDiscountsGivenPesos: number;
  totalCogsPesos: number;
  grossProfitPesos: number;

  /** Operating expenses -- "Sale Reversal" compensating entries excluded. */
  operatingExpensesPesos: number;
  netProfitPesos: number;

  isProfitComplete: boolean;
  missingCostSalesCount: number;
  missingCostItemsCount: number;

  /** Checkout volume (voided sales excluded). */
  activeCheckoutVolume: number;
}

/**
 * Computes owner P&L aggregates from raw Firestore-sourced collections.
 *
 * @param allSales         All sale records in the selected date window
 * @param allLedgerTxs     All master-ledger transaction records in the window
 */
export function computeOwnerPnL(
  allSales: SaleRecord[],
  allLedgerTxs: LedgerTransaction[],
): OwnerPnLResult {
  // 1. Partition sales into active and voided
  const activeSales: SaleRecord[] = [];
  const voidedSaleIds = new Set<string>();

  for (const sale of allSales) {
    if (isSaleVoided(sale)) {
      if (sale.id) voidedSaleIds.add(sale.id);
    } else {
      activeSales.push(sale);
    }
  }

  // 2. Revenue & discounts (active sales only)
  let grossRevenueCentavos = 0;
  let grossSalesBeforeDiscountsCentavos = 0;
  let totalDiscountsCentavos = 0;

  for (const sale of activeSales) {
    grossRevenueCentavos += sale.totalAmount ?? 0;
    grossSalesBeforeDiscountsCentavos +=
      sale.subtotalAmount ?? sale.totalAmount ?? 0;
    totalDiscountsCentavos += sale.discountAmount ?? 0;
  }

  const grossIncomePesos = grossRevenueCentavos / 100;
  const grossSalesBeforeDiscountsPesos = grossSalesBeforeDiscountsCentavos / 100;
  const totalDiscountsGivenPesos = totalDiscountsCentavos / 100;

  // 3. COGS (active sales only)
  let totalCogsCentavos = 0;
  let missingCostItemsCount = 0;
  let missingCostSalesCount = 0;

  for (const sale of activeSales) {
    const result = computeSaleCogs(sale);
    totalCogsCentavos += result.totalCogsCentavos;
    missingCostItemsCount += result.missingCostItemsCount;
    if (result.hasMissingCost) missingCostSalesCount++;
  }

  const totalCogsPesos = totalCogsCentavos / 100;
  const isProfitComplete =
    activeSales.length === 0 || missingCostSalesCount === 0;
  const grossProfitPesos = grossIncomePesos - totalCogsPesos;

  // 4. Build excluded income ledger ID set (saleId + originalIncomeLedgerId)
  const excludedIncomeLedgerIds = buildExcludedIncomeLedgerIds(
    allLedgerTxs,
    voidedSaleIds,
  );

  // 5. Operating expenses (Sale Reversal entries excluded)
  let operatingExpensesPesos = 0;
  for (const tx of allLedgerTxs) {
    if (tx.type !== 'expense') continue;
    if (isSaleReversalLedgerEntry(tx)) continue;
    operatingExpensesPesos += tx.totalPesos ?? 0;
  }
  const netProfitPesos = grossProfitPesos - operatingExpensesPesos;

  return {
    activeSales,
    voidedSaleIds,
    excludedIncomeLedgerIds,
    grossIncomePesos,
    grossSalesBeforeDiscountsPesos,
    totalDiscountsGivenPesos,
    totalCogsPesos,
    grossProfitPesos,
    operatingExpensesPesos,
    netProfitPesos,
    isProfitComplete,
    missingCostSalesCount,
    missingCostItemsCount,
    activeCheckoutVolume: activeSales.length,
  };
}
