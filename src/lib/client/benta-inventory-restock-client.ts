import { parsePesoToCentavos } from '../shared/pricing-math';
import type { BentaRestockRequest, BentaRestockResult, BentaRestockItemResult } from '../server/benta-inventory-restock';

export interface BentaDraftProductLookup {
  readonly id?: string;
  readonly name?: string;
  readonly quantityMode?: 'discrete' | 'measured';
}

export interface BentaDraftItemInput {
  readonly productId: string;
  readonly productName?: string;
  readonly quantity: number | string;
  readonly unitCostPeso: string | number;
}

export interface BentaRestockDraftInput {
  readonly tenantId: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly paymentStatus: 'paid' | 'credit_unpaid';
  readonly paymentMethod: 'cash' | 'cash_drawer' | 'gcash' | 'maya' | 'supplier_credit';
  readonly notes?: string;
  readonly idempotencyKey: string;
  readonly items: readonly BentaDraftItemInput[];
  readonly products: readonly BentaDraftProductLookup[];
}

export interface BentaRestockClientResponse {
  readonly success: boolean;
  readonly result?: BentaRestockResult;
  readonly error?: string;
  readonly category?: string;
}

export function parseExactPositiveInteger(
  input: string | number | undefined | null,
): { valid: true; value: number } | { valid: false; error: string } {
  if (input === undefined || input === null || input === '') {
    return { valid: false, error: 'Kailangan ang dami ng paninda.' };
  }

  const str = typeof input === 'number' ? input.toString() : input.toString().trim();
  if (!/^[1-9]\d*$/.test(str)) {
    return { valid: false, error: 'Dapat ay buong bilang (positive integer) na higit sa 0 ang dami.' };
  }

  const val = Number(str);
  if (!Number.isSafeInteger(val) || val <= 0) {
    return { valid: false, error: 'Sobra sa pinapayagang limit ang dami.' };
  }

  return { valid: true, value: val };
}

export function generateSecureIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  throw new Error('Secure random generation unavailable');
}

export function computeBentaRestockDraftFingerprint(draft: {
  readonly tenantId: string;
  readonly supplierId: string;
  readonly paymentStatus: string;
  readonly paymentMethod: string;
  readonly notes?: string;
  readonly items: readonly { readonly productId: string; readonly quantity: number | string; readonly unitCostPeso: string | number }[];
}): string {
  const normalizedItems = [...draft.items]
    .map((it) => {
      const parsedQty = parseExactPositiveInteger(it.quantity);
      return {
        productId: it.productId,
        quantity: parsedQty.valid ? parsedQty.value : 0,
        unitCostPeso: String(it.unitCostPeso).trim(),
      };
    })
    .sort((a, b) => a.productId.localeCompare(b.productId));

  return JSON.stringify({
    tenantId: draft.tenantId,
    supplierId: draft.supplierId,
    paymentStatus: draft.paymentStatus,
    paymentMethod: draft.paymentMethod,
    notes: draft.notes?.trim() || '',
    items: normalizedItems,
  });
}

export function validateAndProjectBentaRestockDraft(
  draft: BentaRestockDraftInput,
): { valid: true; payload: BentaRestockRequest } | { valid: false; error: string } {
  if (!draft.tenantId || typeof draft.tenantId !== 'string') {
    return { valid: false, error: 'Kailangan ang Tenant ID.' };
  }

  if (!draft.supplierId || typeof draft.supplierId !== 'string' || !draft.supplierName) {
    return { valid: false, error: 'Pumili ng wastong supplier.' };
  }

  if (!draft.idempotencyKey || typeof draft.idempotencyKey !== 'string') {
    return { valid: false, error: 'Kailangan ang idempotency key.' };
  }

  if (!Array.isArray(draft.items) || draft.items.length === 0) {
    return { valid: false, error: 'Maglagay ng kahit isang paninda para sa restock.' };
  }

  const productsMap = new Map<string, BentaDraftProductLookup>();
  for (const p of draft.products) {
    if (p.id) {
      productsMap.set(p.id, p);
    }
  }

  const normalizedItems: Array<{
    productId: string;
    quantity: number;
    supplierCostCentavos: number;
  }> = [];

  const seenProductIds = new Set<string>();

  for (const item of draft.items) {
    if (!item.productId) {
      return { valid: false, error: 'May panindang walang product ID.' };
    }

    if (seenProductIds.has(item.productId)) {
      return { valid: false, error: 'Hindi maaaring ulitin ang parehong paninda sa isang purchase order.' };
    }
    seenProductIds.add(item.productId);

    const product = productsMap.get(item.productId);
    if (!product) {
      return { valid: false, error: `Hindi matagpuan ang paninda: ${item.productName || item.productId}` };
    }

    // Fail-closed for measured products
    if (product.quantityMode === 'measured') {
      return {
        valid: false,
        error: `Ang panindang "${product.name || item.productName || item.productId}" ay measured (tinitimbang/sinusukat). Hindi pa suportado ang measured restocking sa modal na ito.`,
      };
    }

    const parsedQty = parseExactPositiveInteger(item.quantity);
    if (!parsedQty.valid) {
      return { valid: false, error: `Maling dami para sa "${item.productName || item.productId}". ${parsedQty.error}` };
    }
    const qty = parsedQty.value;

    const parsedCost = parsePesoToCentavos(item.unitCostPeso);
    if (!parsedCost.valid || parsedCost.centavos < 0) {
      return { valid: false, error: parsedCost.error || `Maling cost price para sa "${item.productName || item.productId}".` };
    }

    const totalSupplierCostCentavos = parsedCost.centavos * qty;
    if (!Number.isSafeInteger(totalSupplierCostCentavos) || totalSupplierCostCentavos < 0) {
      return { valid: false, error: `Sobra sa pinapayagang halaga ang kabuuang cost para sa "${item.productName || item.productId}".` };
    }

    normalizedItems.push({
      productId: item.productId,
      quantity: qty,
      supplierCostCentavos: totalSupplierCostCentavos,
    });
  }

  const payload: BentaRestockRequest = {
    tenantId: draft.tenantId,
    idempotencyKey: draft.idempotencyKey,
    supplierId: draft.supplierId,
    supplierName: draft.supplierName,
    paymentStatus: draft.paymentStatus,
    paymentMethod: draft.paymentMethod,
    items: normalizedItems,
    ...(draft.notes ? { notes: draft.notes.trim() } : {}),
  };

  return { valid: true, payload };
}

const ERROR_CATEGORY_MESSAGES: Record<string, string> = {
  AUTHENTICATION_REQUIRED: 'Kailangang mag-log in muli para i-save ang Purchase Order.',
  FORBIDDEN: 'Wala kayong pahintulot na mag-restock sa tindahang ito.',
  INSUFFICIENT_FUNDS: 'Kulang ang balanse sa Cash Drawer para sa purchase order na ito.',
  IDEMPOTENCY_CONFLICT: 'Nagkaroon ng conflict sa duplicate submission. Pakisubukan muli.',
  TENANT_INACTIVE: 'Hindi aktibo ang subscription ng tindahan.',
  PRODUCT_INVALID: 'May maling impormasyon sa mga napiling paninda.',
  SUPPLIER_NOT_FOUND: 'Hindi matagpuan ang supplier na pinili.',
  INVALID_REQUEST: 'Hindi wasto ang impormasyon ng purchase order.',
  SERVICE_UNAVAILABLE: 'Pansamantalang hindi available ang server. Subukan muli mamaya.',
};

export function sanitizeBentaRestockClientResult(data: unknown): BentaRestockResult | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const obj = data as Record<string, unknown>;
  if (
    obj.success !== true ||
    typeof obj.purchaseOrderId !== 'string' ||
    !obj.purchaseOrderId ||
    typeof obj.poNumber !== 'string' ||
    !obj.poNumber ||
    typeof obj.committedAt !== 'string' ||
    !obj.committedAt ||
    typeof obj.supplierId !== 'string' ||
    !obj.supplierId ||
    typeof obj.supplierName !== 'string' ||
    !obj.supplierName ||
    (obj.paymentStatus !== 'paid' && obj.paymentStatus !== 'credit_unpaid') ||
    (obj.paymentMethod !== 'cash' &&
      obj.paymentMethod !== 'cash_drawer' &&
      obj.paymentMethod !== 'gcash' &&
      obj.paymentMethod !== 'maya' &&
      obj.paymentMethod !== 'supplier_credit') ||
    !Number.isSafeInteger(obj.totalAmountCentavos) ||
    (obj.totalAmountCentavos as number) < 0 ||
    !Array.isArray(obj.items)
  ) {
    return null;
  }

  const sanitizedItems: BentaRestockItemResult[] = [];
  for (const it of obj.items) {
    if (typeof it !== 'object' || it === null) {
      return null;
    }
    const itemObj = it as Record<string, unknown>;
    if (
      typeof itemObj.productId !== 'string' ||
      !itemObj.productId ||
      typeof itemObj.productName !== 'string' ||
      !itemObj.productName ||
      (itemObj.quantityMode !== 'discrete' && itemObj.quantityMode !== 'measured') ||
      !Number.isSafeInteger(itemObj.purchasedQuantity) ||
      (itemObj.purchasedQuantity as number) <= 0 ||
      (itemObj.quantityScale !== 0 && itemObj.quantityScale !== 3) ||
      !Number.isSafeInteger(itemObj.landedCostCentavos) ||
      (itemObj.landedCostCentavos as number) < 0 ||
      !Number.isSafeInteger(itemObj.latestPurchaseUnitCostCentavos) ||
      (itemObj.latestPurchaseUnitCostCentavos as number) < 0 ||
      (itemObj.costMovement !== 'increased' &&
        itemObj.costMovement !== 'decreased' &&
        itemObj.costMovement !== 'unchanged') ||
      typeof itemObj.resultingPosition !== 'object' ||
      itemObj.resultingPosition === null
    ) {
      return null;
    }

    const pos = itemObj.resultingPosition as Record<string, unknown>;
    if (
      !Number.isSafeInteger(pos.quantityMinor) ||
      (pos.quantityMinor as number) < 0 ||
      (pos.quantityScale !== 0 && pos.quantityScale !== 3) ||
      !Number.isSafeInteger(pos.inventoryValueCentavos) ||
      (pos.inventoryValueCentavos as number) < 0 ||
      !Number.isSafeInteger(pos.averageUnitCostCentavos) ||
      (pos.averageUnitCostCentavos as number) < 0
    ) {
      return null;
    }

    sanitizedItems.push(
      Object.freeze({
        productId: itemObj.productId,
        productName: itemObj.productName,
        quantityMode: itemObj.quantityMode,
        purchasedQuantity: itemObj.purchasedQuantity as number,
        quantityScale: itemObj.quantityScale as 0 | 3,
        landedCostCentavos: itemObj.landedCostCentavos as number,
        latestPurchaseUnitCostCentavos: itemObj.latestPurchaseUnitCostCentavos as number,
        costMovement: itemObj.costMovement,
        resultingPosition: Object.freeze({
          quantityMinor: pos.quantityMinor as number,
          quantityScale: pos.quantityScale as 0 | 3,
          inventoryValueCentavos: pos.inventoryValueCentavos as number,
          averageUnitCostCentavos: pos.averageUnitCostCentavos as number,
        }),
      }),
    );
  }

  return Object.freeze({
    success: true as const,
    purchaseOrderId: obj.purchaseOrderId,
    poNumber: obj.poNumber,
    committedAt: obj.committedAt,
    supplierId: obj.supplierId,
    supplierName: obj.supplierName,
    paymentStatus: obj.paymentStatus,
    paymentMethod: obj.paymentMethod,
    totalAmountCentavos: obj.totalAmountCentavos as number,
    items: Object.freeze(sanitizedItems),
  });
}

export async function submitBentaRestockPO(options: {
  readonly token: string;
  readonly payload: BentaRestockRequest;
  readonly fetchFn?: typeof fetch;
}): Promise<BentaRestockClientResponse> {
  const { token, payload, fetchFn = fetch } = options;

  if (!token || typeof token !== 'string') {
    return {
      success: false,
      error: 'Kailangang mag-log in muli upang makapag-save ng purchase order.',
      category: 'AUTHENTICATION_REQUIRED',
    };
  }

  try {
    const response = await fetchFn('/api/owner/benta-inventory-restock', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const json: unknown = await response.json();
      const sanitized = sanitizeBentaRestockClientResult(json);
      if (!sanitized) {
        return {
          success: false,
          error: 'Nagkaroon ng problema sa server response.',
          category: 'INVALID_RESPONSE',
        };
      }
      return { success: true, result: sanitized };
    }

    let category = '';

    try {
      const errJson = (await response.json()) as Record<string, unknown>;
      if (typeof errJson?.category === 'string') {
        category = errJson.category;
      }
    } catch {
      // Ignored: JSON parse fallback
    }

    // For non-success responses, only use predefined category messages. Never leak unknown error strings.
    const localizedMessage = ERROR_CATEGORY_MESSAGES[category] || 'May error sa pag-save ng Purchase Order.';

    return {
      success: false,
      error: localizedMessage,
      category: category || 'UNKNOWN_ERROR',
    };
  } catch {
    return {
      success: false,
      error: 'Hindi makakonekta sa server. Pakitingnan ang internet connection.',
      category: 'NETWORK_ERROR',
    };
  }
}
