'use client';

import { doc, setDoc, onSnapshot, collection, query, where, Firestore, Unsubscribe } from 'firebase/firestore';
import { initializeFirebase, isFirestorePersistenceActive } from '@/firebase';
import { CheckoutReceipt } from '@/lib/server/benta-cashier-checkout';

export interface HybridCashItemInput {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  salePriceCentavos: number;
}

export interface HybridCashCheckoutParams {
  tenantId: string;
  staffAccountId: string;
  authUid: string;
  shiftId: string;
  cashierDisplayName: string;
  catalogDigest?: string;
  items: HybridCashItemInput[];
  cashTenderedCentavos: number;
  /** The caller-owned idempotency key used as the immutable intent document ID. */
  idempotencyKey?: string;
}

export interface HybridSaleIntentDoc {
  schemaVersion: number;
  intentId: string;
  tenantId: string;
  authUid: string;
  staffAccountId: string;
  shiftId: string;
  tender: 'cash';
  items: Array<{
    productId: string;
    quantity: number;
    observedUnitPriceCentavos: number;
    observedSubtotalCentavos: number;
  }>;
  itemCount: number;
  observedCatalogDigest?: string;
  observedTotalCentavos: number;
  cashTenderedCentavos: number;
  changeRequiredCentavos: number;
  clientCreatedAt: string;
  status: 'pending' | 'accepted' | 'accepted_variance' | 'needs_review' | 'rejected_tampered';
  authoritativeSaleId?: string;
  finalization?: {
    saleId: string;
    receipt: CheckoutReceipt;
    finalizedAt: unknown;
    authoritativeTotalCentavos?: number;
  };
  resolution?: {
    reason?: string;
    flaggedAt?: unknown;
  };
}

export interface SubmitHybridCashSaleOptions {
  localAcceptanceTimeoutMs?: number;
  injectedDb?: Firestore;
  injectedSetIntent?: (tenantId: string, intentId: string, docData: HybridSaleIntentDoc) => Promise<void>;
  injectedLocalObserver?: (tenantId: string, intentId: string) => Promise<void>;
}

// In-memory guard to suppress duplicate concurrent finalization calls
const activeFinalizations = new Set<string>();

export async function finalizeIntentOnServer(
  getIdToken: () => Promise<string>,
  tenantId: string,
  intentId: string
): Promise<{ success: boolean; status: string; receipt?: CheckoutReceipt; error?: string }> {
  if (activeFinalizations.has(intentId)) {
    return { success: false, status: 'in_flight' };
  }

  activeFinalizations.add(intentId);
  try {
    const idToken = await getIdToken();
    const response = await fetch('/api/cashier/benta-finalize-intent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({ tenantId, intentId })
    });

    const data = await response.json();
    return data;
  } catch (err: any) {
    console.warn('[HYBRID_FINALIZER_WARN] Finalizer call failed (will retry on next snapshot/reconnect):', err);
    return { success: false, status: 'network_error', error: err?.message };
  } finally {
    activeFinalizations.delete(intentId);
  }
}

/**
 * Submits an immutable Cash sale intent to Firestore persistent local cache.
 * Implements Durable Local Acceptance:
 * 1. Attaches a scoped listener for this exact intent.
 * 2. Initiates the write to local persistent cache.
 * 3. Awaits ONLY until the intent is observed in local cache.
 * 4. Returns provisional receipt immediately without waiting for server finalization.
 * 5. If local write fails or times out, fails closed so caller can retain cart.
 */
export async function submitHybridCashSale(
  params: HybridCashCheckoutParams,
  options: SubmitHybridCashSaleOptions = {}
): Promise<{ intentId: string; provisionalReceipt: CheckoutReceipt }> {
  // Fail-closed guard: check persistent local cache
  if (!isFirestorePersistenceActive() && !options.injectedDb && !options.injectedSetIntent && !options.injectedLocalObserver) {
    throw new Error('Durable offline sales are unavailable on this browser/device. Paki-check ang private browsing o storage settings.');
  }

  // Use caller-supplied idempotencyKey as the immutable intent ID so repeated
  // submissions with the same cart key target the same Firestore document.
  const intentId = params.idempotencyKey
    ? params.idempotencyKey
    : typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `intent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const observedSubtotalCentavos = params.items.reduce(
    (acc, it) => acc + it.salePriceCentavos * it.quantity,
    0
  );
  const changeRequiredCentavos = Math.max(0, params.cashTenderedCentavos - observedSubtotalCentavos);

  const intentDoc: HybridSaleIntentDoc = {
    schemaVersion: 1,
    intentId,
    tenantId: params.tenantId,
    authUid: params.authUid,
    staffAccountId: params.staffAccountId,
    shiftId: params.shiftId,
    tender: 'cash',
    items: params.items.map((it) => ({
      productId: it.productId,
      quantity: it.quantity,
      observedUnitPriceCentavos: it.salePriceCentavos,
      observedSubtotalCentavos: it.salePriceCentavos * it.quantity
    })),
    itemCount: params.items.reduce((acc, it) => acc + it.quantity, 0),
    observedCatalogDigest: params.catalogDigest || '',
    observedTotalCentavos: observedSubtotalCentavos,
    cashTenderedCentavos: params.cashTenderedCentavos,
    changeRequiredCentavos,
    clientCreatedAt: new Date().toISOString(),
    status: 'pending'
  };

  const provisionalReceipt: CheckoutReceipt = {
    saleId: `prov_${intentId.substring(0, 8)}`,
    receiptNumber: `PROV-${intentId.substring(0, 8).toUpperCase()}`,
    committedAt: new Date().toISOString(),
    moduleId: 'benta-snap',
    paymentMethod: 'cash',
    shiftId: params.shiftId,
    cashierDisplayName: params.cashierDisplayName,
    items: params.items.map((it) => ({
      productId: it.productId,
      name: it.name,
      unit: it.unit,
      quantity: it.quantity,
      unitPriceCentavos: it.salePriceCentavos,
      lineTotalCentavos: it.salePriceCentavos * it.quantity
    })),
    subtotalCentavos: observedSubtotalCentavos,
    totalCentavos: observedSubtotalCentavos
  };

  const timeoutMs = options.localAcceptanceTimeoutMs || 5000;

  // 1 & 2 & 3: Attach listener and await local cache observation
  if (options.injectedLocalObserver) {
    if (options.injectedSetIntent) {
      options.injectedSetIntent(params.tenantId, intentId, intentDoc).catch((err) => {
        console.error('[HYBRID_CACHE_WRITE_ERROR] Injected setter error:', err);
      });
    }
    await options.injectedLocalObserver(params.tenantId, intentId);
  } else {
    const { db } = options.injectedDb ? { db: options.injectedDb } : initializeFirebase();
    const intentRef = doc(db, 'tenants', params.tenantId, 'cashier_sale_intents', intentId);

    const localObservationPromise = new Promise<void>((resolve, reject) => {
      let unsub: Unsubscribe | null = null;
      const timeoutTimer = setTimeout(() => {
        if (unsub) unsub();
        reject(new Error('Local storage timeout: Hindi maitala ang benta sa local database ng device.'));
      }, timeoutMs);

      unsub = onSnapshot(
        intentRef,
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.exists()) {
            clearTimeout(timeoutTimer);
            if (unsub) unsub();
            resolve();
          }
        },
        (err) => {
          clearTimeout(timeoutTimer);
          if (unsub) unsub();
          reject(err);
        }
      );
    });

    if (options.injectedSetIntent) {
      options.injectedSetIntent(params.tenantId, intentId, intentDoc).catch((err) => {
        console.error('[HYBRID_CACHE_WRITE_ERROR] Injected setter error:', err);
      });
    } else {
      setDoc(intentRef, intentDoc).catch((err) => {
        console.error('[HYBRID_CACHE_WRITE_ERROR] Failed to persist intent:', err);
      });
    }

    // Wait ONLY until the intent is confirmed in local cache
    await localObservationPromise;
  }

  // 4. Return provisional receipt immediately once durable local acceptance is verified
  return { intentId, provisionalReceipt };
}

export interface CashierPendingIntentRecord {
  id: string;
  status: string;
  totalCentavos: number;
  hasPendingWrites: boolean;
}

export interface ShiftIntentsSubscriptionOptions {
  tenantId: string;
  staffAccountId: string;
  authUid: string;
  shiftId: string;
  getIdToken?: () => Promise<string>;
  onReceiptUpdated?: (receipt: CheckoutReceipt) => void;
  onStatusChanged?: (intentId: string, status: string, reason?: string) => void;
  onIntentsSnapshot?: (intents: CashierPendingIntentRecord[]) => void;
  injectedDb?: Firestore;
}

/**
 * Subscribes to the authenticated Cashier's active shift intents.
 * Survives reloads, observes cached pending intents, and triggers idempotent server finalization upon reconnect.
 */
export function subscribeToCashierShiftIntents(
  options: ShiftIntentsSubscriptionOptions
): Unsubscribe {
  const { db } = options.injectedDb ? { db: options.injectedDb } : initializeFirebase();

  const q = query(
    collection(db, 'tenants', options.tenantId, 'cashier_sale_intents'),
    where('shiftId', '==', options.shiftId),
    where('authUid', '==', options.authUid),
    where('staffAccountId', '==', options.staffAccountId)
  );

  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (options.onIntentsSnapshot) {
        const intents: CashierPendingIntentRecord[] = snapshot.docs.map((d) => {
          const data = d.data() as HybridSaleIntentDoc;
          const totalCentavos = Array.isArray(data.items)
            ? data.items.reduce((sum, item) => sum + (item.observedSubtotalCentavos || (item.quantity * item.observedUnitPriceCentavos)), 0)
            : 0;
          return {
            id: d.id,
            status: data.status,
            totalCentavos,
            hasPendingWrites: d.metadata.hasPendingWrites
          };
        });
        options.onIntentsSnapshot(intents);
      }

      snapshot.docChanges().forEach(async (change) => {
        const docSnap = change.doc;
        const data = docSnap.data() as HybridSaleIntentDoc;
        const intentId = docSnap.id;

        if (options.onStatusChanged && data.status) {
          options.onStatusChanged(intentId, data.status, data.resolution?.reason);
        }

        // When document is server-acknowledged and pending, request finalization
        if (!docSnap.metadata.hasPendingWrites && data.status === 'pending' && options.getIdToken) {
          const res = await finalizeIntentOnServer(options.getIdToken, options.tenantId, intentId);
          if (res.receipt && options.onReceiptUpdated) {
            options.onReceiptUpdated(res.receipt);
          }
        }

        // When document is accepted, surface authoritative receipt
        if ((data.status === 'accepted' || data.status === 'accepted_variance') && data.finalization?.receipt) {
          if (options.onReceiptUpdated) {
            options.onReceiptUpdated(data.finalization.receipt);
          }
        }
      });
    },
    (error) => {
      console.warn('[SHIFT_INTENTS_LISTENER_WARN]', error);
    }
  );
}
