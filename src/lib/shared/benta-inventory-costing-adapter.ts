import {
  buildInventoryCostPosition,
  consumeInventoryAtAverageCost,
  deriveInventoryValueCentavosFromAverageCost,
  type InventoryCostPosition,
  type InventoryConsumptionResult,
  type InventoryQuantityScale,
} from './inventory-costing';

export type BentaCostPositionSource =
  | 'exact-pool'
  | 'legacy-derived';

export interface BentaProductCostingInput {
  readonly quantityMode?: 'discrete' | 'measured';
  readonly currentStock?: number;
  readonly stockQuantityMinor?: number;
  readonly quantityScale?: number;
  readonly costPrice: number;
  readonly inventoryValueCentavos?: number;
  readonly averageUnitCostCentavos?: number;
}

function assertSafeNonNegativeInteger(
  value: unknown,
  name: string,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
}

function assertSafePositiveInteger(
  value: unknown,
  name: string,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
}

export interface BentaProductCostPositionProjection {
  readonly quantityMode: 'discrete' | 'measured';
  readonly source: BentaCostPositionSource;
  readonly position: InventoryCostPosition;
}

export interface BentaProductSaleConsumptionResult {
  readonly previousPosition: InventoryCostPosition;
  readonly consumption: InventoryConsumptionResult;
  readonly productUpdates: {
    readonly currentStock?: number;
    readonly stockQuantityMinor?: number;
    readonly inventoryValueCentavos: number;
    readonly averageUnitCostCentavos: number;
    readonly costPrice: number;
  };
  readonly historicalCogs: {
    readonly unitCostCentavos: number;
    readonly lineCostCentavos: number;
    readonly costPrice: number;
  };
}

export function projectBentaProductCostPosition(
  product: BentaProductCostingInput,
): BentaProductCostPositionProjection {
  const quantityMode =
    product.quantityMode === 'measured'
      ? 'measured'
      : 'discrete';

  let authoritativeQuantity: number;
  let costingScale: InventoryQuantityScale;

  if (quantityMode === 'measured') {
    if (product.stockQuantityMinor === undefined) {
      throw new Error(
        'stockQuantityMinor is required for measured inventory',
      );
    }

    assertSafeNonNegativeInteger(
      product.stockQuantityMinor,
      'stockQuantityMinor',
    );

    const measuredScale = product.quantityScale ?? 3;

    if (measuredScale !== 3) {
      throw new Error(
        'quantityScale must be 3 for measured inventory',
      );
    }

    authoritativeQuantity = product.stockQuantityMinor;
    costingScale = 3;
  } else {
    assertSafeNonNegativeInteger(
      product.currentStock,
      'currentStock',
    );

    authoritativeQuantity = product.currentStock;
    costingScale = 0;
  }

  assertSafeNonNegativeInteger(
    product.costPrice,
    'costPrice',
  );

  const hasInventoryValue = product.inventoryValueCentavos !== undefined;
  const hasAverageUnitCost = product.averageUnitCostCentavos !== undefined;

  if (hasInventoryValue !== hasAverageUnitCost) {
    throw new Error(
      'Partial exact-pool costing fields: inventoryValueCentavos and averageUnitCostCentavos must both be present or both absent',
    );
  }

  const source: BentaCostPositionSource = hasInventoryValue
    ? 'exact-pool'
    : 'legacy-derived';

  if (hasInventoryValue && hasAverageUnitCost) {

    const inventoryValueCentavos = product.inventoryValueCentavos;
    const averageUnitCostCentavos = product.averageUnitCostCentavos;

    assertSafeNonNegativeInteger(inventoryValueCentavos, 'inventoryValueCentavos');
    assertSafeNonNegativeInteger(averageUnitCostCentavos, 'averageUnitCostCentavos');

    const position = buildInventoryCostPosition(
      authoritativeQuantity,
      costingScale,
      inventoryValueCentavos,
    );

    if (position.averageUnitCostCentavos !== averageUnitCostCentavos) {
      throw new Error(
        'Inconsistent stored averageUnitCostCentavos for the exact inventory pool',
      );
    }

    return Object.freeze({
      quantityMode,
      source: 'exact-pool',
      position,
    });
  }

  const inventoryValueCentavos = deriveInventoryValueCentavosFromAverageCost(
    authoritativeQuantity,
    costingScale,
    product.costPrice,
  );

  const position = buildInventoryCostPosition(
    authoritativeQuantity,
    costingScale,
    inventoryValueCentavos,
  );

  return Object.freeze({
    quantityMode,
    source,
    position,
  });
}

export function consumeBentaProductSale(
  product: BentaProductCostingInput,
  consumedQuantity: number,
): BentaProductSaleConsumptionResult {
  assertSafePositiveInteger(consumedQuantity, 'consumedQuantity');

  const projection = projectBentaProductCostPosition(product);
  const previousPosition = projection.position;

  const consumptionResult = consumeInventoryAtAverageCost({
    position: previousPosition,
    consumedQuantityMinor: consumedQuantity,
  });

  const remainingPosition = consumptionResult.remainingPosition;
  const inventoryValueCentavos = remainingPosition.inventoryValueCentavos;
  const averageUnitCostCentavos = remainingPosition.averageUnitCostCentavos;

  const productUpdates = {
    ...(projection.quantityMode === 'discrete'
      ? { currentStock: remainingPosition.quantityMinor }
      : { stockQuantityMinor: remainingPosition.quantityMinor }),
    inventoryValueCentavos,
    averageUnitCostCentavos,
    costPrice: averageUnitCostCentavos,
  };

  const historicalCogs = {
    unitCostCentavos: consumptionResult.consumptionUnitCostCentavos,
    lineCostCentavos: consumptionResult.consumedCostCentavos,
    costPrice: consumptionResult.consumptionUnitCostCentavos,
  };

  const result: BentaProductSaleConsumptionResult = Object.freeze({
    previousPosition,
    consumption: consumptionResult,
    productUpdates: Object.freeze(productUpdates),
    historicalCogs: Object.freeze(historicalCogs),
  });

  return result;
}
