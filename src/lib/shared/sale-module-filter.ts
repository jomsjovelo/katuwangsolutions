/**
 * Module isolation policy
 * ──────────────────────
 * 1. Fail-closed: missing module metadata returns empty arrays.
 * 2. Legacy missing-module records: visible ONLY for the tenant primary module.
 *    A missing-module record must not appear in both benta-snap and build-stack.
 * 3. Sale-linked transactions: admitted only when saleId belongs to the active
 *    module's sales. Unknown sale-linked entries are excluded.
 * 4. Unlinked general-ledger entries (no saleId): included only for the
 *    primary module. Excluded from add-on/alias module reports.
 */

import { normalizeOrderSnapSale, type SaleRecord } from '@/lib/shared/benta-sale-report-aggregator';

export const LEGACY_MODULE_IDS = new Set(['benta-snap', 'build-stack']);

export const ORDER_SNAP_FAMILY_MODULES = new Set(['order-snap', 'timpla-track', 'bite-snap']);

export function isOrderSnapFamily(moduleType: string | undefined): boolean {
  if (!moduleType) return false;
  return ORDER_SNAP_FAMILY_MODULES.has(moduleType);
}

export function getSaleModuleId(sale: Record<string, any>): string | undefined {
  return sale.moduleId || sale.module;
}

export function isSaleForCurrentModule(
  sale: Record<string, any>,
  currentModuleType: string | undefined,
  primaryModuleType?: string | null,
): boolean {
  if (!currentModuleType) return false;
  const saleModuleId = getSaleModuleId(sale);
  if (!saleModuleId) {
    if (!primaryModuleType) return false;
    return currentModuleType === primaryModuleType && LEGACY_MODULE_IDS.has(currentModuleType);
  }
  return saleModuleId === currentModuleType;
}

export function filterSalesByModule(
  sales: any[],
  currentModuleType: string | undefined,
  primaryModuleType?: string | null,
): any[] {
  if (!currentModuleType) return [];
  const isLegacy = LEGACY_MODULE_IDS.has(currentModuleType);
  const isPrimary = currentModuleType === primaryModuleType;
  return sales.filter((sale) => {
    const saleModuleId = getSaleModuleId(sale);
    if (!saleModuleId) {
      return isLegacy && isPrimary;
    }
    return saleModuleId === currentModuleType;
  });
}

export function filterSalesByModuleIds(
  sales: any[],
  allowedModuleIds: Set<string>,
): any[] {
  if (allowedModuleIds.size === 0) return [];
  return sales.filter((sale) => {
    const saleModuleId = getSaleModuleId(sale);
    if (!saleModuleId) return false;
    return allowedModuleIds.has(saleModuleId);
  });
}

export function filterTransactionsByModule(
  transactions: any[],
  sameModuleSaleIds: Set<string>,
  isPrimaryModule: boolean,
): any[] {
  if (sameModuleSaleIds.size === 0) {
    return isPrimaryModule ? transactions.filter((tx) => !tx.saleId) : [];
  }
  return transactions.filter((tx) => {
    if (!tx.saleId) return isPrimaryModule;
    return sameModuleSaleIds.has(tx.saleId);
  });
}

export function prepareSalesForModule(
  rawSales: any[],
  currentModuleType: string | undefined,
  primaryModuleType?: string | null,
): SaleRecord[] {
  if (!currentModuleType) return [];
  const filtered = filterSalesByModule(rawSales, currentModuleType, primaryModuleType);
  return filtered
    .map((sale) => {
      const saleModuleId = getSaleModuleId(sale);
      if (saleModuleId && ORDER_SNAP_FAMILY_MODULES.has(saleModuleId)) {
        const normalized = normalizeOrderSnapSale(sale);
        if (!normalized) return null;
        return {
          ...normalized,
          createdAt: sale.createdAt ?? normalized.createdAt,
          paymentMethod: sale.paymentMethod ?? normalized.paymentMethod,
          orderId: sale.orderId ?? normalized.orderId,
        };
      }
      return sale as SaleRecord;
    })
    .filter((sale): sale is SaleRecord => sale !== null);
}

export function canMutateSaleFromReports(
  sale: any,
  currentModuleType: string | undefined,
  primaryModuleType?: string | null,
): boolean {
  if (!isSaleForCurrentModule(sale, currentModuleType, primaryModuleType)) {
    return false;
  }
  if (isOrderSnapFamily(currentModuleType)) {
    return false;
  }
  if (currentModuleType && LEGACY_MODULE_IDS.has(currentModuleType) && currentModuleType !== primaryModuleType) {
    return false;
  }
  return true;
}
