import * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  assertBentaCashierAuthorization,
  BENTA_SNAP_MODULE_ID,
  CheckoutError,
  CheckoutErrorCode,
  verifyBentaCashierIdentity,
  SERVER_IDENTIFIER
} from './cashier-server-authorization';
import { applySaleToShift, assertReconciliationShift } from './benta-cashier-shift-receipt';
import { CheckoutReceipt } from './benta-cashier-checkout';
import {
  computeLineFinancials,
  isMeasuredUnit,
  isValidQuantityScale,
  STANDARD_MEASURED_SCALE
} from '../shared/quantity-math';

export interface FinalizeIntentRequest {
  tenantId: string;
  intentId: string;
}

export interface FinalizeIntentResult {
  success: boolean;
  status: 'accepted' | 'accepted_variance' | 'needs_review' | 'rejected_tampered';
  receipt?: CheckoutReceipt;
  saleId?: string;
  error?: string;
}

export interface IntentFinalizerOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

function safeMultiply(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 0) throw new CheckoutError(CheckoutErrorCode.PRODUCT_UNAVAILABLE);
  return result;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) throw new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE);
  return result;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export interface AggregatedDiscreteIntentItem {
  productId: string;
  quantityMode: 'discrete';
  quantity: number;
  observedUnitPriceCentavos?: number;
}

export interface AggregatedMeasuredIntentItem {
  productId: string;
  quantityMode: 'measured';
  quantityMinor: number;
  quantityScale: number;
  sellingUnit: string;
  observedUnitPriceCentavos?: number;
}

export type AggregatedIntentItem = AggregatedDiscreteIntentItem | AggregatedMeasuredIntentItem;

/**
 * Validates and deterministically aggregates intent items for schema v1 (discrete) and v2 (discrete/measured).
 * Fails closed if any product ID is invalid or any quantity is non-integer, non-positive, or exceeds bounds.
 */
export function validateAndAggregateIntentItems(rawItems: unknown): AggregatedIntentItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 100) {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }

  const map = new Map<string, AggregatedIntentItem>();

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') {
      throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
    }
    const raw = item as Record<string, any>;
    const productId = typeof raw.productId === 'string' ? raw.productId.trim() : '';
    if (!productId || !SERVER_IDENTIFIER.test(productId)) {
      throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
    }

    const observedUnit = typeof raw.observedUnitPriceCentavos === 'number' &&
      Number.isSafeInteger(raw.observedUnitPriceCentavos) && raw.observedUnitPriceCentavos >= 0
      ? raw.observedUnitPriceCentavos
      : undefined;

    const isMeasured = raw.quantityMode === 'measured' || ('quantityMinor' in raw);

    if (isMeasured) {
      const qtyMinor = raw.quantityMinor;
      if (typeof qtyMinor !== 'number' || !Number.isSafeInteger(qtyMinor) || qtyMinor < 1 || qtyMinor > 10_000_000) {
        throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
      }

      const scale = typeof raw.quantityScale === 'number' ? raw.quantityScale : STANDARD_MEASURED_SCALE;
      if (!isValidQuantityScale(scale)) {
        throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
      }

      const sellingUnit = typeof raw.sellingUnit === 'string' && raw.sellingUnit.trim().length > 0
        ? raw.sellingUnit.trim().toLowerCase()
        : 'kg';

      if (!isMeasuredUnit(sellingUnit)) {
        throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
      }

      const existing = map.get(productId);
      if (existing) {
        if (existing.quantityMode !== 'measured' || existing.sellingUnit !== sellingUnit || existing.quantityScale !== scale) {
          throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
        }
        existing.quantityMinor = safeAdd(existing.quantityMinor, qtyMinor);
      } else {
        map.set(productId, {
          productId,
          quantityMode: 'measured',
          quantityMinor: qtyMinor,
          quantityScale: scale,
          sellingUnit,
          observedUnitPriceCentavos: observedUnit
        });
      }
    } else {
      // Discrete mode (v1 legacy or v2 discrete)
      const qty = raw.quantity;
      if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 1 || qty > 10_000) {
        throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
      }

      const existing = map.get(productId);
      if (existing) {
        if (existing.quantityMode !== 'discrete') {
          throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
        }
        existing.quantity = safeAdd(existing.quantity, qty);
      } else {
        map.set(productId, {
          productId,
          quantityMode: 'discrete',
          quantity: qty,
          observedUnitPriceCentavos: observedUnit
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.productId.localeCompare(b.productId));
}

export async function finalizeCashierSaleIntent(
  idToken: string,
  requestValue: unknown,
  options: IntentFinalizerOptions = {}
): Promise<FinalizeIntentResult> {
  const auth = options.adminAuth || getAdminAuth();
  const identity = await verifyBentaCashierIdentity(idToken, auth);
  const { tenantId, staffAccountId } = identity;

  const payload = (requestValue && typeof requestValue === 'object' ? requestValue : {}) as Record<string, unknown>;
  const intentId = typeof payload.intentId === 'string' ? payload.intentId.trim() : '';
  const requestTenantId = typeof payload.tenantId === 'string' ? payload.tenantId.trim() : '';

  if (!intentId || !requestTenantId || requestTenantId !== tenantId) {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }

  const db = options.adminFirestore || getAdminFirestore();
  const tenantRef = db.collection('tenants').doc(tenantId);
  const staffRef = tenantRef.collection('staff_accounts').doc(staffAccountId);
  const intentRef = tenantRef.collection('cashier_sale_intents').doc(intentId);

  // 1. Initial read outside transaction for fast idempotency & authorization
  const initialIntentSnap = await intentRef.get();
  if (!initialIntentSnap.exists) {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }

  const initialIntent = initialIntentSnap.data()!;
  if (initialIntent.tenantId !== tenantId || initialIntent.staffAccountId !== staffAccountId || initialIntent.authUid !== identity.uid) {
    throw new CheckoutError(CheckoutErrorCode.OPERATION_NOT_PERMITTED);
  }

  // Fast idempotent return if already terminal
  if (initialIntent.status === 'accepted' || initialIntent.status === 'accepted_variance') {
    return {
      success: true,
      status: initialIntent.status,
      saleId: initialIntent.authoritativeSaleId || initialIntent.finalization?.saleId,
      receipt: initialIntent.finalization?.receipt
    };
  }

  if (initialIntent.status === 'needs_review' || initialIntent.status === 'rejected_tampered') {
    return {
      success: false,
      status: initialIntent.status,
      error: initialIntent.resolution?.reason || 'Intent in terminal non-sale state.'
    };
  }

  const shiftId = initialIntent.shiftId;
  if (!shiftId || typeof shiftId !== 'string') {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }

  // Validate items deterministically
  let aggregatedItems: AggregatedIntentItem[];
  try {
    aggregatedItems = validateAndAggregateIntentItems(initialIntent.items);
  } catch (err: any) {
    const reason = 'Invalid intent items structure or non-positive quantity.';
    await intentRef.update({
      status: 'rejected_tampered',
      'resolution.reason': reason,
      'resolution.flaggedAt': admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return {
      success: false,
      status: 'rejected_tampered',
      error: reason
    };
  }

  const productRefs = aggregatedItems.map((it) => tenantRef.collection('products').doc(it.productId));
  const shiftRef = tenantRef.collection('shifts').doc(shiftId);
  const accountRef = tenantRef.collection('accounts').doc('master-cash');
  const saleRef = tenantRef.collection('sales').doc();
  const ledgerRef = tenantRef.collection('transactions').doc();
  const auditRef = tenantRef.collection('audit_log').doc();
  const movementRefs = aggregatedItems.map(() => tenantRef.collection('inventory_movements').doc());

  const cashTendered = Number.isSafeInteger(initialIntent.cashTenderedCentavos) ? initialIntent.cashTenderedCentavos : 0;
  if (typeof cashTendered !== 'number' || !Number.isSafeInteger(cashTendered) || cashTendered < 0) {
    const reason = 'Invalid cash tendered amount.';
    await intentRef.update({
      status: 'rejected_tampered',
      'resolution.reason': reason,
      'resolution.flaggedAt': admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return {
      success: false,
      status: 'rejected_tampered',
      error: reason
    };
  }

  return await db.runTransaction(async (transaction) => {
    // 1. Concurrently read all needed docs inside transaction
    const intentSnap = await transaction.get(intentRef);
    if (!intentSnap.exists) {
      throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
    }
    const currentIntent = intentSnap.data()!;

    // Idempotency re-check inside transaction
    if (currentIntent.status === 'accepted' || currentIntent.status === 'accepted_variance') {
      return {
        success: true,
        status: currentIntent.status,
        saleId: currentIntent.authoritativeSaleId || currentIntent.finalization?.saleId,
        receipt: currentIntent.finalization?.receipt
      };
    }
    if (currentIntent.status === 'needs_review' || currentIntent.status === 'rejected_tampered') {
      return {
        success: false,
        status: currentIntent.status,
        error: currentIntent.resolution?.reason || 'Intent in terminal non-sale state.'
      };
    }

    const staffSnap = await transaction.get(staffRef);
    if (!staffSnap.exists) {
      throw new CheckoutError(CheckoutErrorCode.SESSION_INVALID);
    }
    const staff = staffSnap.data()!;
    if (staff.status !== 'active' || staff.sessionVersion !== identity.sessionVersion) {
      throw new CheckoutError(CheckoutErrorCode.SESSION_INVALID);
    }

    const shiftSnap = await transaction.get(shiftRef);
    if (!shiftSnap.exists) {
      throw new CheckoutError(CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED);
    }
    const shift = assertReconciliationShift(shiftSnap.id, shiftSnap.data()!, identity);

    const productSnaps = await Promise.all(productRefs.map((ref) => transaction.get(ref)));
    const accountSnap = await transaction.get(accountRef);

    // Evaluate products, stock availability, and prices
    let priceVarianceDetected = false;
    let authoritativeSubtotal = 0;
    let stockUnavailable = false;
    let stockUnavailableReason = '';
    let tamperingDetected = false;
    let tamperingReason = '';

    const receiptItems: CheckoutReceipt['items'] = [];
    const saleItems: Array<Record<string, unknown>> = [];
    const updates: Array<{ ref: admin.firestore.DocumentReference; updateData: Record<string, unknown>; movementRef: admin.firestore.DocumentReference; movementData: Record<string, unknown> }> = [];

    const committedAt = options.now ? options.now() : admin.firestore.Timestamp.now();

    for (let i = 0; i < productSnaps.length; i++) {
      const productSnap = productSnaps[i];
      const submitted = aggregatedItems[i];

      if (!productSnap.exists) {
        stockUnavailable = true;
        stockUnavailableReason = `Product ${submitted.productId} no longer exists.`;
        break;
      }

      const product = productSnap.data()!;
      if (product.tenantId !== tenantId || product.isActive !== true) {
        stockUnavailable = true;
        stockUnavailableReason = `Product ${product.name || submitted.productId} is inactive.`;
        break;
      }

      // Authoritative product binding checks:
      const productMode: 'discrete' | 'measured' = product.quantityMode === 'measured' ? 'measured' : 'discrete';
      if (submitted.quantityMode !== productMode) {
        tamperingDetected = true;
        tamperingReason = `Quantity mode mismatch: product is ${productMode} but submitted as ${submitted.quantityMode}.`;
        break;
      }

      if (!Number.isSafeInteger(product.salePrice) || product.salePrice < 0 ||
          !Number.isSafeInteger(product.costPrice) || product.costPrice < 0) {
        tamperingDetected = true;
        tamperingReason = `Authoritative product financial figures invalid for ${submitted.productId}.`;
        break;
      }

      const authorPrice = product.salePrice;
      const costPrice = product.costPrice;

      if (submitted.observedUnitPriceCentavos !== undefined && submitted.observedUnitPriceCentavos !== authorPrice) {
        priceVarianceDetected = true;
      }

      if (submitted.quantityMode === 'measured') {
        const expectedUnit = (product.sellingUnit || product.unit || 'kg').toLowerCase().trim();
        const submittedUnit = (submitted.sellingUnit || '').toLowerCase().trim();
        if (submittedUnit !== expectedUnit) {
          tamperingDetected = true;
          tamperingReason = `Unit mismatch for product ${submitted.productId}: expected ${expectedUnit}, got ${submittedUnit}.`;
          break;
        }

        const expectedScale = product.quantityScale || STANDARD_MEASURED_SCALE;
        if (submitted.quantityScale !== expectedScale || submitted.quantityScale !== 3) {
          tamperingDetected = true;
          tamperingReason = `Scale mismatch for product ${submitted.productId}: expected ${expectedScale}, got ${submitted.quantityScale}.`;
          break;
        }

        if (product.stockQuantityMinor === undefined || product.stockQuantityMinor === null || !Number.isSafeInteger(product.stockQuantityMinor) || product.stockQuantityMinor < 0) {
          tamperingDetected = true;
          tamperingReason = `Missing or invalid authoritative measured stock for ${submitted.productId}.`;
          break;
        }

        const availableMinor = product.stockQuantityMinor;
        if (availableMinor < submitted.quantityMinor) {
          stockUnavailable = true;
          stockUnavailableReason = `Insufficient stock for ${product.name}: requested ${submitted.quantityMinor / 1000} ${submitted.sellingUnit}, available ${availableMinor / 1000} ${submitted.sellingUnit}.`;
          break;
        }

        const lineTotal = computeLineFinancials(authorPrice, submitted.quantityMinor, submitted.quantityScale);
        const lineCost = computeLineFinancials(costPrice, submitted.quantityMinor, submitted.quantityScale);
        authoritativeSubtotal = safeAdd(authoritativeSubtotal, lineTotal);
        const newStockMinor = availableMinor - submitted.quantityMinor;

        receiptItems.push({
          productId: submitted.productId,
          name: product.name || 'Item',
          unit: submitted.sellingUnit || product.unit || 'kg',
          quantity: 1,
          quantityMinor: submitted.quantityMinor,
          quantityScale: submitted.quantityScale,
          sellingUnit: submitted.sellingUnit,
          quantityMode: 'measured',
          unitPriceCentavos: authorPrice,
          lineTotalCentavos: lineTotal
        });

        saleItems.push({
          productId: submitted.productId,
          name: product.name || 'Item',
          unit: submitted.sellingUnit || product.unit || 'kg',
          quantity: 1,
          quantityMinor: submitted.quantityMinor,
          quantityScale: submitted.quantityScale,
          sellingUnit: submitted.sellingUnit,
          quantityMode: 'measured',
          unitPriceCentavos: authorPrice,
          unitCostCentavos: costPrice,
          lineSubtotalCentavos: lineTotal,
          lineCostCentavos: lineCost,
          price: authorPrice,
          costPrice,
          lineCost,
          lineTotal
        });

        updates.push({
          ref: productRefs[i],
          updateData: { stockQuantityMinor: newStockMinor, updatedAt: committedAt },
          movementRef: movementRefs[i],
          movementData: {
            id: movementRefs[i].id,
            tenantId,
            productId: submitted.productId,
            type: 'sale',
            quantityMinorChange: -submitted.quantityMinor,
            quantityMode: 'measured',
            previousStockQuantityMinor: availableMinor,
            newStockQuantityMinor: newStockMinor,
            saleId: saleRef.id,
            shiftId,
            staffAccountId,
            createdAt: committedAt
          }
        });
      } else {
        // Discrete mode
        const qty = submitted.quantity;
        const availableStock = Number.isSafeInteger(product.currentStock) ? product.currentStock : 0;
        if (availableStock < qty) {
          stockUnavailable = true;
          stockUnavailableReason = `Insufficient stock for ${product.name}: requested ${qty}, available ${availableStock}.`;
          break;
        }

        const lineTotal = safeMultiply(authorPrice, qty);
        const lineCost = safeMultiply(costPrice, qty);
        authoritativeSubtotal = safeAdd(authoritativeSubtotal, lineTotal);
        const newStock = availableStock - qty;

        receiptItems.push({
          productId: submitted.productId,
          name: product.name || 'Item',
          unit: product.unit || 'pcs',
          quantity: qty,
          quantityMode: 'discrete',
          unitPriceCentavos: authorPrice,
          lineTotalCentavos: lineTotal
        });

        saleItems.push({
          productId: submitted.productId,
          name: product.name || 'Item',
          unit: product.unit || 'pcs',
          quantity: qty,
          quantityMode: 'discrete',
          unitPriceCentavos: authorPrice,
          unitCostCentavos: costPrice,
          lineSubtotalCentavos: lineTotal,
          lineCostCentavos: lineCost,
          price: authorPrice,
          costPrice,
          lineCost,
          lineTotal
        });

        updates.push({
          ref: productRefs[i],
          updateData: { currentStock: newStock, updatedAt: committedAt },
          movementRef: movementRefs[i],
          movementData: {
            id: movementRefs[i].id,
            tenantId,
            productId: submitted.productId,
            type: 'sale',
            quantityChange: -qty,
            quantityMode: 'discrete',
            previousStock: availableStock,
            newStock,
            saleId: saleRef.id,
            shiftId,
            staffAccountId,
            createdAt: committedAt
          }
        });
      }
    }

    if (tamperingDetected) {
      transaction.update(intentRef, {
        status: 'rejected_tampered',
        'resolution.reason': tamperingReason,
        'resolution.flaggedAt': committedAt,
        updatedAt: committedAt
      });
      return {
        success: false,
        status: 'rejected_tampered',
        error: tamperingReason
      };
    }

    // Handle stock insufficiency -> mark needs_review with zero financial writes
    if (stockUnavailable) {
      transaction.update(intentRef, {
        status: 'needs_review',
        'resolution.reason': stockUnavailableReason,
        'resolution.flaggedAt': committedAt,
        updatedAt: committedAt
      });
      return {
        success: false,
        status: 'needs_review',
        error: stockUnavailableReason
      };
    }

    // Validate cash tendered against authoritative total
    if (cashTendered < authoritativeSubtotal) {
      const reason = `Tendered cash (${cashTendered}) is less than authoritative total (${authoritativeSubtotal}).`;
      transaction.update(intentRef, {
        status: 'rejected_tampered',
        'resolution.reason': reason,
        'resolution.flaggedAt': committedAt,
        updatedAt: committedAt
      });
      return {
        success: false,
        status: 'rejected_tampered',
        error: reason
      };
    }

    const oldBalance = accountSnap.exists ? accountSnap.data()!.balance : 0;
    if (!Number.isSafeInteger(oldBalance) || oldBalance < 0) {
      throw new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE);
    }
    const newBalance = safeAdd(oldBalance, authoritativeSubtotal);

    const cashierDisplayName = nonEmptyString(staff.displayName)
      ? staff.displayName
      : nonEmptyString(staff.username)
      ? staff.username
      : 'Cashier';

    const finalStatus: 'accepted' | 'accepted_variance' = priceVarianceDetected ? 'accepted_variance' : 'accepted';

    const receipt: CheckoutReceipt = {
      saleId: saleRef.id,
      receiptNumber: saleRef.id,
      committedAt: committedAt.toDate().toISOString(),
      moduleId: BENTA_SNAP_MODULE_ID,
      paymentMethod: 'cash',
      shiftId,
      cashierDisplayName,
      items: receiptItems,
      subtotalCentavos: authoritativeSubtotal,
      totalCentavos: authoritativeSubtotal
    };

    const nextShiftAggregates = applySaleToShift(shift, 'cash', authoritativeSubtotal);

    // 1. Create Final Sale
    transaction.create(saleRef, {
      id: saleRef.id,
      tenantId,
      moduleId: BENTA_SNAP_MODULE_ID,
      shiftId,
      staffAccountId,
      actorId: `staff_${staffAccountId}`,
      intentId,
      items: saleItems,
      subtotalAmount: authoritativeSubtotal,
      discountAmount: 0,
      totalAmount: authoritativeSubtotal,
      paymentMethod: 'cash',
      transactionDate: committedAt,
      createdAt: committedAt
    });

    // 2. Inventory Deductions + Movements
    updates.forEach((entry) => {
      transaction.update(entry.ref, entry.updateData);
      transaction.create(entry.movementRef, entry.movementData);
    });

    // 3. Shift Aggregates
    transaction.update(shiftRef, { ...nextShiftAggregates, updatedAt: committedAt });

    // 4. Master Cash Account Balance
    transaction.set(
      accountRef,
      accountSnap.exists
        ? { balance: newBalance, updatedAt: committedAt }
        : {
            id: 'master-cash',
            tenantId,
            name: 'Main Cash Register',
            type: 'asset',
            balance: newBalance,
            isActive: true,
            createdAt: committedAt,
            updatedAt: committedAt
          },
      { merge: true }
    );

    // 5. Ledger Entry
    transaction.create(ledgerRef, {
      id: ledgerRef.id,
      tenantId,
      accountId: 'master-cash',
      amount: authoritativeSubtotal,
      type: 'income',
      category: 'Sales',
      description: 'Benta Snap Cashier Sale',
      saleId: saleRef.id,
      shiftId,
      actorId: `staff_${staffAccountId}`,
      paymentMethod: 'cash',
      date: committedAt,
      createdAt: committedAt
    });

    // 6. Audit Log
    transaction.create(auditRef, {
      id: auditRef.id,
      tenantId,
      type: 'cashier_checkout',
      action: 'finalize_hybrid_intent',
      actorId: `staff_${staffAccountId}`,
      staffAccountId,
      shiftId,
      intentId,
      saleId: saleRef.id,
      paymentMethod: 'cash',
      amountCentavos: authoritativeSubtotal,
      createdAt: committedAt
    });

    // 7. Update Intent document with Terminal Status and Authoritative Projection
    transaction.update(intentRef, {
      status: finalStatus,
      authoritativeSaleId: saleRef.id,
      finalization: {
        saleId: saleRef.id,
        receipt,
        finalizedAt: committedAt,
        authoritativeTotalCentavos: authoritativeSubtotal
      },
      updatedAt: committedAt
    });

    return {
      success: true,
      status: finalStatus,
      saleId: saleRef.id,
      receipt
    };
  });
}
