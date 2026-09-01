export const BENTA_INVENTORY_COSTING_VERSION = 'moving_average_v1' as const;

export type BentaLegacySaleMutationOperation = 'edit' | 'void';

function isBentaExactPoolCostedSaleInternal(value: Record<string, unknown>): boolean {
  if (value.costingVersion === BENTA_INVENTORY_COSTING_VERSION) {
    return true;
  }

  const moduleId = value.moduleId;
  const shiftId = value.shiftId;
  const staffAccountId = value.staffAccountId;
  const items = value.items;

  if (
    moduleId !== 'benta-snap' ||
    typeof shiftId !== 'string' || shiftId.trim().length === 0 ||
    typeof staffAccountId !== 'string' || staffAccountId.trim().length === 0 ||
    !Array.isArray(items) || items.length === 0
  ) {
    return false;
  }

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (record.productId && typeof record.productId === 'string' && record.productId.startsWith('misc-')) continue;
    if (record.unitCostCentavos !== undefined || record.lineCostCentavos !== undefined) {
      return true;
    }
  }

  return false;
}

export function isBentaExactPoolCostedSale(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  return isBentaExactPoolCostedSaleInternal(value as Record<string, unknown>);
}

export class BentaExactPoolSaleMutationError extends Error {
  readonly operation: BentaLegacySaleMutationOperation;
  constructor(operation: BentaLegacySaleMutationOperation) {
    const messages: Record<BentaLegacySaleMutationOperation, string> = {
      edit: 'Exact-cost sales cannot be edited with legacy logic. Use the exact-pool reversal workflow.',
      void: 'Exact-cost sales cannot be voided with legacy logic. Use the exact-pool reversal workflow.',
    };
    super(messages[operation]);
    this.name = 'BentaExactPoolSaleMutationError';
    this.operation = operation;
  }
}

export function assertLegacyBentaSaleMutable(
  value: unknown,
  operation: BentaLegacySaleMutationOperation,
): void {
  if (isBentaExactPoolCostedSale(value)) {
    throw new BentaExactPoolSaleMutationError(operation);
  }
}
