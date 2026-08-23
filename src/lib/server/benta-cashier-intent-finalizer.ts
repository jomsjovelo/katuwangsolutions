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

export interface AggregatedIntentItem {
  productId: string;
  quantity: number;
  observedUnitPriceCentavos?: number;
}

/**
 * Validates and deterministically aggregates intent items.
 * Fails closed if any product ID is invalid or any quantity is non-integer, non-positive, or exceeds bounds.
 */
export function validateAndAggregateIntentItems(rawItems: unknown): AggregatedIntentItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 100) {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }

  const map = new Map<string, { quantity: number; observedUnitPriceCentavos?: number }>();

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') {
      throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
    }
    const productId = typeof item.productId === 'string' ? item.productId.trim() : '';
    if (!productId || !SERVER_IDENTIFIER.test(productId)) {
      throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
    }

    const qty = item.quantity;
    if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 1 || qty > 10_000) {
      throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
    }

    const observedUnit = typeof item.observedUnitPriceCentavos === 'number' && Number.isSafeInteger(item.observedUnitPriceCentavos) && item.observedUnitPriceCentavos >= 0
      ? item.observedUnitPriceCentavos
      : undefined;

    const existing = map.get(productId);
    if (existing) {
      existing.quantity = safeAdd(existing.quantity, qty);
    } else {
      map.set(productId, { quantity: qty, observedUnitPriceCentavos: observedUnit });
    }
  }

  return Array.from(map.entries())
    .map(([productId, data]) => ({
      productId,
      quantity: data.quantity,
      observedUnitPriceCentavos: data.observedUnitPriceCentavos
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
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
  } catch {
    // Malformed intent -> mark rejected_tampered
    await intentRef.update({
      status: 'rejected_tampered',
      'resolution.reason': 'Malformed or invalid item specifications.',
      'resolution.flaggedAt': admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return {
      success: false,
      status: 'rejected_tampered',
      error: 'Malformed or invalid item specifications.'
    };
  }

  const cashTendered = initialIntent.cashTenderedCentavos;
  if (typeof cashTendered !== 'number' || !Number.isSafeInteger(cashTendered) || cashTendered < 0) {
    await intentRef.update({
      status: 'rejected_tampered',
      'resolution.reason': 'Invalid cash tendered amount.',
      'resolution.flaggedAt': admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return {
      success: false,
      status: 'rejected_tampered',
      error: 'Invalid cash tendered amount.'
    };
  }

  const shiftRef = tenantRef.collection('shifts').doc(shiftId);
  const accountRef = tenantRef.collection('accounts').doc('master-cash');
  const productRefs = aggregatedItems.map((item) => tenantRef.collection('products').doc(item.productId));

  const saleRef = tenantRef.collection('sales').doc();
  const ledgerRef = tenantRef.collection('transactions').doc();
  const auditRef = tenantRef.collection('audit_log').doc();
  const movementRefs = productRefs.map(() => tenantRef.collection('inventory_transactions').doc());
  const committedAt = (options.now || admin.firestore.Timestamp.now)();

  return await db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(
      intentRef,
      tenantRef,
      staffRef,
      shiftRef,
      ...productRefs,
      accountRef
    );

    const [freshIntentSnap, tenantSnap, staffSnap, shiftSnap, ...remaining] = snapshots;
    const accountSnap = remaining.pop()!;
    const productSnaps = remaining;

    if (!freshIntentSnap.exists) {
      throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
    }

    const intent = freshIntentSnap.data()!;
    // Idempotent recovery inside transaction
    if (intent.status === 'accepted' || intent.status === 'accepted_variance') {
      return {
        success: true,
        status: intent.status,
        saleId: intent.authoritativeSaleId || intent.finalization?.saleId,
        receipt: intent.finalization?.receipt
      };
    }

    if (intent.status !== 'pending') {
      return {
        success: false,
        status: intent.status,
        error: 'Intent is not pending.'
      };
    }

    const staff = assertBentaCashierAuthorization(identity, tenantSnap, staffSnap);
    if (staff.activeShiftId !== shiftId) {
      throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
    }

    if (!shiftSnap.exists) {
      throw new CheckoutError(CheckoutErrorCode.ACTIVE_SHIFT_REQUIRED);
    }
    const shift = assertReconciliationShift(shiftSnap.id, shiftSnap.data()!, identity);

    let authoritativeSubtotal = 0;
    let priceVarianceDetected = false;
    let stockUnavailable = false;
    let stockUnavailableReason = '';

    const receiptItems: CheckoutReceipt['items'] = [];
    const saleItems: Array<Record<string, unknown>> = [];
    const updates: Array<{ ref: admin.firestore.DocumentReference; stock: number; movementRef: admin.firestore.DocumentReference }> = [];

    for (let i = 0; i < productSnaps.length; i++) {
      const productSnap = productSnaps[i];
      const submitted = aggregatedItems[i];
      const qty = submitted.quantity;

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

      if (product.currentStock < qty) {
        stockUnavailable = true;
        stockUnavailableReason = `Insufficient stock for ${product.name}: requested ${qty}, available ${product.currentStock}.`;
        break;
      }

      const authorPrice = Number.isSafeInteger(product.salePrice) && product.salePrice >= 0 ? product.salePrice : 0;
      const costPrice = Number.isSafeInteger(product.costPrice) && product.costPrice >= 0 ? product.costPrice : 0;

      if (submitted.observedUnitPriceCentavos !== undefined && submitted.observedUnitPriceCentavos !== authorPrice) {
        priceVarianceDetected = true;
      }

      const lineTotal = safeMultiply(authorPrice, qty);
      authoritativeSubtotal = safeAdd(authoritativeSubtotal, lineTotal);
      const newStock = product.currentStock - qty;

      receiptItems.push({
        productId: submitted.productId,
        name: product.name || 'Item',
        unit: product.unit || 'pcs',
        quantity: qty,
        unitPriceCentavos: authorPrice,
        lineTotalCentavos: lineTotal
      });

      saleItems.push({
        productId: submitted.productId,
        name: product.name || 'Item',
        unit: product.unit || 'pcs',
        quantity: qty,
        price: authorPrice,
        costPrice,
        lineTotal
      });

      updates.push({
        ref: productRefs[i],
        stock: newStock,
        movementRef: movementRefs[i]
      });
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
    updates.forEach((entry, idx) => {
      transaction.update(entry.ref, { currentStock: entry.stock, updatedAt: committedAt });
      transaction.create(entry.movementRef, {
        id: entry.movementRef.id,
        tenantId,
        productId: receiptItems[idx].productId,
        saleId: saleRef.id,
        shiftId,
        type: 'sale',
        quantity: -receiptItems[idx].quantity,
        balanceAfter: entry.stock,
        performedBy: `staff_${staffAccountId}`,
        createdAt: committedAt
      });
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
