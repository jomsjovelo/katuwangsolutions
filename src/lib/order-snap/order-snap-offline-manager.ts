/**
 * Order Snap Client-Side Offline Manager
 *
 * Implements:
 * - Pure local validation using cached cashier-safe operational catalog
 * - Same-device projected ingredient consumption and stock reservation
 * - Refusal of non-cash payments while offline
 * - Guaranteed durable IndexedDB commit before provisional receipt generation
 * - Quota failure safety (fail-closed before showing accepted)
 */

import {
  OrderSnapOutboxDB,
  getOrderSnapOutboxDB
} from './order-snap-outbox-db';
import {
  OfflineCatalogSnapshot,
  OrderSnapOutboxEntry,
  ProjectedIngredientReservation,
  ProvisionalOrderReceipt,
  ProvisionalReceiptLine,
  OperationalIngredientConsumption,
  isAuthorityCertificate,
  OrderSnapAuthorityCertificatePayload,
  OrderSnapAuthorityHmacGrantPayload
} from './offline-types';
import {
  OrderIngestionRequest,
  OrderIngestionRequestSchema
} from './order-ingestion';
import { OrderSnapErrorCode } from '../server/order-snap-finalizer';
import { generateSecureId } from './secure-id-utils';

export interface OfflineCheckoutParams {
  tenantId: string;
  actorId: string;
  staffAccountId: string;
  actorRole: 'cashier' | 'owner';
  cashierDisplayName?: string;
  request: OrderIngestionRequest;
  paymentMethod: 'cash';
  cashTenderedCentavos: number;
  idempotencyKey?: string;
  orderId?: string;
  authorityManager: import('./order-snap-authority-manager').OrderSnapAuthorityManager;
}

export interface OfflineCheckoutResult {
  success: true;
  provisionalReceipt: ProvisionalOrderReceipt;
  outboxEntry: OrderSnapOutboxEntry;
}

export class OrderSnapOfflineManager {
  private outboxDB: OrderSnapOutboxDB;

  constructor(outboxDB?: OrderSnapOutboxDB) {
    this.outboxDB = outboxDB || getOrderSnapOutboxDB();
  }

  /**
   * Accepts an offline cash order durably into the local IndexedDB outbox.
   * Fails closed if catalog is missing, stock is insufficient, payment is non-cash,
   * authority is missing/invalid/locked/expired, or storage fails.
   */
  public async acceptOfflineOrder(
    params: OfflineCheckoutParams
  ): Promise<OfflineCheckoutResult> {
    // 1. Payment Policy: Only Cash is accepted offline
    if (params.paymentMethod !== 'cash') {
      throw new Error(
        `Offline checkout is only supported for cash orders. Non-cash tender '${params.paymentMethod}' requires online authorization.`
      );
    }

    // 2. Validate canonical order request structure
    const validatedRequest = OrderIngestionRequestSchema.parse(params.request);

    if (validatedRequest.tenantId !== params.tenantId) {
      throw new Error('Tenant mismatch in order request.');
    }

    // 3. Load and validate cached offline catalog snapshot
    const catalog = await this.outboxDB.getCatalogSnapshot(params.tenantId);
    if (!catalog) {
      throw new Error(
        'Offline catalog unavailable. Initial online synchronization is required before operating offline.'
      );
    }

    // 4. Mandatory Authority Validation
    if (!params.authorityManager) {
      throw new Error(
        'Offline authority is mandatory. An active OrderSnapAuthorityManager must be provided for offline checkout.'
      );
    }

    const session = params.authorityManager.getSession();
    const grant = params.authorityManager.getActiveGrant();

    if (!session || !grant) {
      throw new Error('Unauthorized offline checkout: no active authority session.');
    }

    if (session.isLocalLocked) {
      throw new Error('Unauthorized offline checkout: authority session is locked.');
    }

    const authState = params.authorityManager.getState();
    if (authState !== 'online-authorized' && authState !== 'offline-unlocked') {
      if (authState === 'offline-locked') {
        throw new Error('Unauthorized offline checkout: authority session is locked.');
      }
      throw new Error(
        `Unauthorized offline checkout: invalid authority state '${authState}'.`
      );
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= session.expiresAt) {
      throw new Error('Unauthorized offline checkout: authority grant expired.');
    }

    const grantPayload: OrderSnapAuthorityCertificatePayload | OrderSnapAuthorityHmacGrantPayload =
      isAuthorityCertificate(grant) ? grant.payload : ((grant as any).payload || grant);

    // Cross-validate scope against authority grant
    if (session.tenantId !== params.tenantId || grantPayload.tenantId !== params.tenantId) {
      throw new Error('Unauthorized offline checkout: tenant ID mismatch in authority grant.');
    }

    if (
      session.staffAccountId !== params.staffAccountId ||
      grantPayload.staffAccountId !== params.staffAccountId
    ) {
      throw new Error(
        'Unauthorized offline checkout: staff account ID mismatch in authority grant.'
      );
    }

    if (session.actorId !== params.actorId || grantPayload.actorId !== params.actorId) {
      throw new Error('Unauthorized offline checkout: actor ID mismatch in authority grant.');
    }

    if (session.role !== params.actorRole || grantPayload.role !== params.actorRole) {
      throw new Error('Unauthorized offline checkout: actor role mismatch in authority grant.');
    }

    if (
      session.catalogVersion !== catalog.catalogVersion ||
      grantPayload.catalogVersion !== catalog.catalogVersion
    ) {
      throw new Error(
        `Unauthorized offline checkout: catalog version mismatch. Authority bound to '${grantPayload.catalogVersion}', catalog is '${catalog.catalogVersion}'.`
      );
    }

    const deviceId = await this.outboxDB.getOrCreateDeviceId();
    if (session.deviceId !== deviceId || grantPayload.deviceId !== deviceId) {
      throw new Error('Unauthorized offline checkout: device ID mismatch in authority grant.');
    }

    // 4. Map catalog elements for quick lookup
    const menuItemsMap = new Map(catalog.menuItems.map((m) => [m.menuItemId, m]));
    const recipesMap = new Map(catalog.recipes.map((r) => [r.recipeVersionId, r]));
    const modifierGroupsMap = new Map(
      catalog.modifierGroups.map((g) => [g.modifierGroupId, g])
    );
    const ingredientsMap = new Map(catalog.ingredients.map((i) => [i.ingredientId, i]));

    // 5. Evaluate order lines, compute totals and operational ingredient deductions
    let subtotalCentavos = 0;
    const provisionalLines: ProvisionalReceiptLine[] = [];
    const ingredientDeductionsMap = new Map<string, { quantityMinor: number; unit: string }>();

    for (const line of validatedRequest.lines) {
      const menuItem = menuItemsMap.get(line.menuItemId);
      if (!menuItem || !menuItem.isActive) {
        throw new Error(
          `Menu item ${line.menuItemId} is not available in the offline catalog.`
        );
      }

      const recipe = recipesMap.get(menuItem.activeRecipeVersionId);
      if (!recipe || !recipe.isActive) {
        throw new Error(
          `Recipe version for menu item '${menuItem.name}' is inactive or missing.`
        );
      }

      let lineUnitPrice = menuItem.basePriceCentavos;
      const selectedModsSummary: Array<{
        modifierOptionId: string;
        modifierOptionName: string;
        priceDeltaCentavos: number;
      }> = [];

      // Process base recipe consumption
      for (const comp of recipe.components) {
        const consumedMinor = comp.quantityMinor * line.quantity;
        const current = ingredientDeductionsMap.get(comp.ingredientId) || {
          quantityMinor: 0,
          unit: comp.unit
        };
        ingredientDeductionsMap.set(comp.ingredientId, {
          quantityMinor: current.quantityMinor + consumedMinor,
          unit: comp.unit
        });
      }

      // Process selected modifiers
      for (const sel of line.selectedModifiers || []) {
        const group = modifierGroupsMap.get(sel.groupId);
        if (!group) {
          throw new Error(`Modifier group ${sel.groupId} not found in catalog.`);
        }
        const option = group.options.find((o) => o.optionId === sel.optionId);
        if (!option) {
          throw new Error(
            `Modifier option ${sel.optionId} not found in group ${group.name}.`
          );
        }

        lineUnitPrice += option.priceDeltaCentavos;
        selectedModsSummary.push({
          modifierOptionId: option.optionId,
          modifierOptionName: option.name,
          priceDeltaCentavos: option.priceDeltaCentavos
        });

        for (const ingDelta of option.ingredientDeltas || []) {
          const deltaMinor = ingDelta.quantityMinorDelta * line.quantity;
          const current = ingredientDeductionsMap.get(ingDelta.ingredientId) || {
            quantityMinor: 0,
            unit: ingDelta.unit
          };
          ingredientDeductionsMap.set(ingDelta.ingredientId, {
            quantityMinor: current.quantityMinor + deltaMinor,
            unit: ingDelta.unit
          });
        }
      }

      if (lineUnitPrice < 0) {
        throw new Error(`Unit price for line item ${menuItem.name} cannot be negative.`);
      }

      const lineTotal = lineUnitPrice * line.quantity;
      subtotalCentavos += lineTotal;

      provisionalLines.push({
        menuItemId: menuItem.menuItemId,
        menuItemName: menuItem.name,
        quantity: line.quantity,
        unitPriceCentavos: lineUnitPrice,
        lineTotalCentavos: lineTotal,
        selectedModifiers: selectedModsSummary
      });
    }

    const totalRevenueCentavos = subtotalCentavos;
    if (params.cashTenderedCentavos < totalRevenueCentavos) {
      throw new Error(
        `Cash tendered (₱${(params.cashTenderedCentavos / 100).toFixed(2)}) is less than total due (₱${(totalRevenueCentavos / 100).toFixed(2)}).`
      );
    }
    const changeCentavos = params.cashTenderedCentavos - totalRevenueCentavos;

    // 6. Validate Projected Ingredient Stock Availability
    const activeReservations = await this.outboxDB.getProjectedReservationsMap(params.tenantId);

    for (const [ingId, reqDeduction] of ingredientDeductionsMap.entries()) {
      const ing = ingredientsMap.get(ingId);
      if (!ing || !ing.isActive) {
        throw new Error(`Ingredient ${ingId} is missing or inactive in offline catalog.`);
      }

      const reserved = activeReservations[ingId] || 0;
      const projectedAvailable = ing.stockQuantityMinor - reserved;

      if (projectedAvailable < reqDeduction.quantityMinor) {
        throw new Error(
          `Insufficient projected stock on device for ingredient '${ing.name}'. Available: ${projectedAvailable}, Required: ${reqDeduction.quantityMinor}.`
        );
      }
    }

    // 5. Local sequence generation
    const localSequence = await this.outboxDB.getNextLocalSequence(params.tenantId, deviceId);

    // 6. SECURE ID GENERATION - Use shared secure ID utility (no direct window access)
    const orderId = params.orderId ||
      params.request.orderId ||
      generateSecureId('ord_');

    const idempotencyKey = params.idempotencyKey ||
      params.request.idempotencyKey ||
      generateSecureId('idemp_');

    const provisionalReceiptNumber = `PROV-ORD-${localSequence.toString().padStart(6, '0')}-${orderId.slice(0, 6).toUpperCase()}`;
    const clientCreatedAt = params.request.createdAt || new Date().toISOString();
    const clientCommittedAt = params.request.committedAt || clientCreatedAt;

    const canonicalRequest: OrderIngestionRequest = {
      ...validatedRequest,
      orderId,
      tenantId: params.tenantId,
      staffAccountId: params.staffAccountId,
      idempotencyKey,
      createdAt: clientCreatedAt,
      committedAt: clientCommittedAt
    };

    const outboxEntry: OrderSnapOutboxEntry = {
      orderId,
      idempotencyKey,
      tenantId: params.tenantId,
      actorId: params.actorId,
      staffAccountId: params.staffAccountId,
      actorRole: params.actorRole,
      deviceId,
      localSequence,
      request: canonicalRequest,
      paymentMethod: 'cash',
      cashTenderedCentavos: params.cashTenderedCentavos,
      clientCreatedAt,
      provisionalReceiptNumber,
      grant,
      syncState: 'pending_sync',
      attemptCount: 0
    };

     // 8. Create projected ingredient reservations
    const reservations: ProjectedIngredientReservation[] = [];
    let resIndex = 0;

    for (const [ingId, reqDeduction] of ingredientDeductionsMap.entries()) {
      reservations.push({
        reservationId: `res_${orderId}_${ingId}_${resIndex++}_${generateSecureId('')}`,
        tenantId: params.tenantId,
        orderId,
        ingredientId: ingId,
        reservedQuantityMinor: reqDeduction.quantityMinor,
        unit: reqDeduction.unit,
        createdAt: clientCreatedAt,
        status: 'active'
      });
    }

    // 9. Persist durably to IndexedDB before resolving
    try {
      await this.outboxDB.enqueueOrder(outboxEntry, reservations);
    } catch (storageErr: any) {
      console.error('[OFFLINE_MANAGER] storage_enqueue_failure');
      throw new Error(`Storage quota or persistence error: ${storageErr?.message || 'Failed to save offline order'}`);
    }

    // 10. Generate Truthful Provisional Receipt
    const provisionalReceipt: ProvisionalOrderReceipt = {
      provisionalReceiptNumber,
      isProvisional: true,
      orderId,
      tenantId: params.tenantId,
      deviceId,
      localSequence,
      cashierDisplayName: params.cashierDisplayName,
      items: provisionalLines,
      subtotalCentavos,
      totalRevenueCentavos,
      cashTenderedCentavos: params.cashTenderedCentavos,
      changeCentavos,
      paymentMethod: 'cash',
      clientCreatedAt,
      status: 'pending_sync'
    };

    return {
      success: true,
      provisionalReceipt,
      outboxEntry
    };
  }

  /**
   * Helper to retrieve current projected available stock for an ingredient on this device.
   */
  public async getProjectedStock(
    tenantId: string,
    ingredientId: string
  ): Promise<{ baselineStock: number; reservedStock: number; projectedAvailable: number } | null> {
    const catalog = await this.outboxDB.getCatalogSnapshot(tenantId);
    if (!catalog) return null;

    const ing = catalog.ingredients.find((i) => i.ingredientId === ingredientId);
    if (!ing) return null;

    const reservations = await this.outboxDB.getProjectedReservationsMap(tenantId);
    const reservedStock = reservations[ingredientId] || 0;
    const projectedAvailable = Math.max(0, ing.stockQuantityMinor - reservedStock);

    return {
      baselineStock: ing.stockQuantityMinor,
      reservedStock,
      projectedAvailable
    };
  }
}

let globalOfflineManager: OrderSnapOfflineManager | null = null;

export function getOrderSnapOfflineManager(): OrderSnapOfflineManager {
  if (!globalOfflineManager) {
    globalOfflineManager = new OrderSnapOfflineManager();
  }
  return globalOfflineManager;
}
