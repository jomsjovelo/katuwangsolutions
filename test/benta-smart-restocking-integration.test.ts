import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAndProjectBentaRestockDraft,
  computeBentaRestockDraftFingerprint,
  generateSecureIdempotencyKey,
  submitBentaRestockPO,
  parseExactPositiveInteger,
  sanitizeBentaRestockClientResult,
  type BentaRestockDraftInput,
} from '../src/lib/client/benta-inventory-restock-client';

test('parseExactPositiveInteger rejects fractional, mixed-text, zero, and negative quantities', () => {
  // Valid integers
  assert.deepEqual(parseExactPositiveInteger('1'), { valid: true, value: 1 });
  assert.deepEqual(parseExactPositiveInteger(10), { valid: true, value: 10 });
  assert.deepEqual(parseExactPositiveInteger('999'), { valid: true, value: 999 });

  // Fractional / decimal numbers
  assert.equal(parseExactPositiveInteger('1.5').valid, false);
  assert.equal(parseExactPositiveInteger('0.5').valid, false);
  assert.equal(parseExactPositiveInteger(1.5).valid, false);

  // Mixed text and numbers
  assert.equal(parseExactPositiveInteger('1abc').valid, false);
  assert.equal(parseExactPositiveInteger('abc1').valid, false);
  assert.equal(parseExactPositiveInteger(' 10 pcs ').valid, false);

  // Zero and negative numbers
  assert.equal(parseExactPositiveInteger('0').valid, false);
  assert.equal(parseExactPositiveInteger(0).valid, false);
  assert.equal(parseExactPositiveInteger('-1').valid, false);
  assert.equal(parseExactPositiveInteger(-5).valid, false);

  // Blank / null / undefined
  assert.equal(parseExactPositiveInteger('').valid, false);
  assert.equal(parseExactPositiveInteger(null).valid, false);
  assert.equal(parseExactPositiveInteger(undefined).valid, false);
});

test('Benta creation projects discrete items correctly and excludes sale price mutations', () => {
  const draft: BentaRestockDraftInput = {
    tenantId: 'tenant_123',
    supplierId: 'supp_1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash_drawer',
    idempotencyKey: 'idemp-test-1',
    notes: 'Regular weekly delivery',
    items: [
      {
        productId: 'prod_discrete_1',
        productName: 'Canned Goods',
        quantity: '10',
        unitCostPeso: '24.00',
      },
    ],
    products: [
      {
        id: 'prod_discrete_1',
        name: 'Canned Goods',
        quantityMode: 'discrete',
      },
    ],
  };

  const projection = validateAndProjectBentaRestockDraft(draft);
  assert.equal(projection.valid, true);
  if (projection.valid) {
    assert.equal(projection.payload.tenantId, 'tenant_123');
    assert.equal(projection.payload.supplierId, 'supp_1');
    assert.equal(projection.payload.supplierName, 'San Miguel Corp');
    assert.equal(projection.payload.items.length, 1);
    assert.equal(projection.payload.items[0].productId, 'prod_discrete_1');
    assert.equal((projection.payload.items[0] as { quantity: number }).quantity, 10);
    assert.equal(projection.payload.items[0].supplierCostCentavos, 24000); // 24.00 * 10 = 24000 centavos
    assert.equal((projection.payload.items[0] as unknown as Record<string, unknown>).salePrice, undefined);
    assert.equal((projection.payload.items[0] as unknown as Record<string, unknown>).unitSalePriceCentavos, undefined);
  }
});

test('Benta creation fails closed on measured items with clear user guidance', () => {
  const draft: BentaRestockDraftInput = {
    tenantId: 'tenant_123',
    supplierId: 'supp_1',
    supplierName: 'Rice Wholesaler',
    paymentStatus: 'paid',
    paymentMethod: 'cash_drawer',
    idempotencyKey: 'idemp-test-2',
    items: [
      {
        productId: 'prod_measured_1',
        productName: 'Bigas Dinorado',
        quantity: 5,
        unitCostPeso: '50.00',
      },
    ],
    products: [
      {
        id: 'prod_measured_1',
        name: 'Bigas Dinorado',
        quantityMode: 'measured',
      },
    ],
  };

  const projection = validateAndProjectBentaRestockDraft(draft);
  assert.equal(projection.valid, false);
  if (!projection.valid) {
    assert.match(projection.error, /measured/i);
    assert.match(projection.error, /Hindi pa suportado ang measured restocking sa modal na ito/);
  }
});

test('Invalid money, overflow, fractional quantities, and duplicate product IDs fail closed', () => {
  const baseDraft: BentaRestockDraftInput = {
    tenantId: 'tenant_123',
    supplierId: 'supp_1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash_drawer',
    idempotencyKey: 'idemp-test-3',
    items: [
      {
        productId: 'prod_1',
        productName: 'Item 1',
        quantity: 5,
        unitCostPeso: '20.00',
      },
    ],
    products: [
      { id: 'prod_1', name: 'Item 1', quantityMode: 'discrete' },
      { id: 'prod_2', name: 'Item 2', quantityMode: 'discrete' },
    ],
  };

  // 1. Malformed money string
  const malformedMoneyDraft = {
    ...baseDraft,
    items: [{ productId: 'prod_1', productName: 'Item 1', quantity: 5, unitCostPeso: 'not-money' }],
  };
  assert.equal(validateAndProjectBentaRestockDraft(malformedMoneyDraft).valid, false);

  // 2. Negative quantity
  const negativeQtyDraft = {
    ...baseDraft,
    items: [{ productId: 'prod_1', productName: 'Item 1', quantity: -5, unitCostPeso: '20.00' }],
  };
  assert.equal(validateAndProjectBentaRestockDraft(negativeQtyDraft).valid, false);

  // 3. Fractional quantity string ("1.5")
  const fractionalQtyDraft = {
    ...baseDraft,
    items: [{ productId: 'prod_1', productName: 'Item 1', quantity: '1.5', unitCostPeso: '20.00' }],
  };
  assert.equal(validateAndProjectBentaRestockDraft(fractionalQtyDraft).valid, false);

  // 4. Duplicate product IDs in items
  const duplicateItemsDraft = {
    ...baseDraft,
    items: [
      { productId: 'prod_1', productName: 'Item 1', quantity: 5, unitCostPeso: '20.00' },
      { productId: 'prod_1', productName: 'Item 1', quantity: 3, unitCostPeso: '20.00' },
    ],
  };
  assert.equal(validateAndProjectBentaRestockDraft(duplicateItemsDraft).valid, false);

  // 5. Missing product in catalog
  const missingProdDraft = {
    ...baseDraft,
    items: [{ productId: 'prod_unknown', productName: 'Unknown', quantity: 5, unitCostPeso: '20.00' }],
  };
  assert.equal(validateAndProjectBentaRestockDraft(missingProdDraft).valid, false);
});

test('Fingerprint generation detects draft changes and preserves stability on unchanged draft', () => {
  const draftA = {
    tenantId: 'tenant_123',
    supplierId: 'supp_1',
    paymentStatus: 'paid',
    paymentMethod: 'cash_drawer',
    notes: 'Note 1',
    items: [
      { productId: 'prod_b', quantity: 2, unitCostPeso: '10.00' },
      { productId: 'prod_a', quantity: 5, unitCostPeso: '20.00' },
    ],
  };

  // Reordered items with same data
  const draftAReordered = {
    ...draftA,
    items: [
      { productId: 'prod_a', quantity: 5, unitCostPeso: '20.00' },
      { productId: 'prod_b', quantity: 2, unitCostPeso: '10.00' },
    ],
  };

  const fpA = computeBentaRestockDraftFingerprint(draftA);
  const fpAReordered = computeBentaRestockDraftFingerprint(draftAReordered);
  assert.equal(fpA, fpAReordered, 'Fingerprint must be identical when items are reordered');

  // Modified quantity -> different fingerprint
  const draftB = {
    ...draftA,
    items: [
      { productId: 'prod_a', quantity: 6, unitCostPeso: '20.00' },
      { productId: 'prod_b', quantity: 2, unitCostPeso: '10.00' },
    ],
  };
  const fpB = computeBentaRestockDraftFingerprint(draftB);
  assert.notEqual(fpA, fpB, 'Fingerprint must change when draft quantity is modified');
});

test('generateSecureIdempotencyKey produces unique UUIDs', () => {
  const key1 = generateSecureIdempotencyKey();
  const key2 = generateSecureIdempotencyKey();
  assert.notEqual(key1, key2);
  assert.match(key1, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('sanitizeBentaRestockClientResult validates required fields and strips injected/unexpected properties', () => {
  const validServerResult = {
    success: true,
    purchaseOrderId: 'po_123',
    poNumber: 'PO-20260901-ABCD',
    committedAt: '2026-09-01T12:00:00.000Z',
    supplierId: 'supp_1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash_drawer',
    totalAmountCentavos: 24000,
    injectedInternalSecret: 'leak_secret_key',
    internalTenantRef: 'tenants/tenant_123',
    items: [
      {
        productId: 'prod_1',
        productName: 'Canned Goods',
        quantityMode: 'discrete',
        purchasedQuantity: 10,
        quantityScale: 0,
        landedCostCentavos: 24000,
        latestPurchaseUnitCostCentavos: 2400,
        costMovement: 'increased',
        injectedAuditTrace: 'trace_secret',
        resultingPosition: {
          quantityMinor: 15,
          quantityScale: 0,
          inventoryValueCentavos: 34000,
          averageUnitCostCentavos: 2267,
          injectedDbMarker: 'marker_internal',
        },
      },
    ],
  };

  const sanitized = sanitizeBentaRestockClientResult(validServerResult);
  assert.ok(sanitized !== null);
  assert.equal(sanitized.success, true);
  assert.equal(sanitized.purchaseOrderId, 'po_123');
  assert.equal(sanitized.poNumber, 'PO-20260901-ABCD');
  assert.equal(sanitized.totalAmountCentavos, 24000);
  assert.equal(sanitized.items.length, 1);
  assert.equal(sanitized.items[0].latestPurchaseUnitCostCentavos, 2400);

  // Verify unexpected injected properties are completely removed
  assert.equal((sanitized as Record<string, unknown>).injectedInternalSecret, undefined);
  assert.equal((sanitized as Record<string, unknown>).internalTenantRef, undefined);
  assert.equal((sanitized.items[0] as Record<string, unknown>).injectedAuditTrace, undefined);
  assert.equal((sanitized.items[0].resultingPosition as Record<string, unknown>).injectedDbMarker, undefined);

  // Malformed result checks (must return null)
  assert.equal(sanitizeBentaRestockClientResult({ success: false }), null);
  assert.equal(sanitizeBentaRestockClientResult({ success: true, purchaseOrderId: '' }), null);
  assert.equal(sanitizeBentaRestockClientResult({ ...validServerResult, totalAmountCentavos: -100 }), null);
  assert.equal(sanitizeBentaRestockClientResult({ ...validServerResult, items: null }), null);
  assert.equal(
    sanitizeBentaRestockClientResult({
      ...validServerResult,
      items: [{ ...validServerResult.items[0], purchasedQuantity: -5 }],
    }),
    null,
  );
});

test('submitBentaRestockPO: handles success, network failure, malformed response, and unknown categories safely', async () => {
  const validPayload = {
    tenantId: 'tenant_123',
    idempotencyKey: 'idemp-1',
    supplierId: 'supp_1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid' as const,
    paymentMethod: 'cash_drawer' as const,
    items: [{ productId: 'prod_1', quantity: 5, supplierCostCentavos: 10000 }],
  };

  // 1. Success response
  let fetchCallCount = 0;
  const mockSuccessFetch: typeof fetch = async (input, init) => {
    fetchCallCount++;
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>)?.Authorization, 'Bearer token_123');
    return new Response(
      JSON.stringify({
        success: true,
        purchaseOrderId: 'po_abc',
        poNumber: 'PO-20260901-ABCD',
        committedAt: new Date().toISOString(),
        supplierId: 'supp_1',
        supplierName: 'San Miguel Corp',
        paymentStatus: 'paid',
        paymentMethod: 'cash_drawer',
        totalAmountCentavos: 10000,
        items: [
          {
            productId: 'prod_1',
            productName: 'Item 1',
            quantityMode: 'discrete',
            purchasedQuantity: 5,
            quantityScale: 0,
            landedCostCentavos: 10000,
            latestPurchaseUnitCostCentavos: 2000,
            costMovement: 'unchanged',
            resultingPosition: {
              quantityMinor: 5,
              quantityScale: 0,
              inventoryValueCentavos: 10000,
              averageUnitCostCentavos: 2000,
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const successRes = await submitBentaRestockPO({
    token: 'token_123',
    payload: validPayload,
    fetchFn: mockSuccessFetch,
  });

  assert.equal(fetchCallCount, 1);
  assert.equal(successRes.success, true);
  assert.equal(successRes.result?.purchaseOrderId, 'po_abc');

  // 2. Malformed success response (missing items or bad types) -> INVALID_RESPONSE
  const mockMalformedSuccessFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ success: true, bogus: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const malformedRes = await submitBentaRestockPO({
    token: 'token_123',
    payload: validPayload,
    fetchFn: mockMalformedSuccessFetch,
  });

  assert.equal(malformedRes.success, false);
  assert.equal(malformedRes.category, 'INVALID_RESPONSE');
  assert.match(malformedRes.error || '', /Nagkaroon ng problema sa server response/);

  // 3. Known error category: Insufficient funds (409)
  const mockInsufficientFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        error: 'Raw DB error message with table internal detail',
        category: 'INSUFFICIENT_FUNDS',
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const fundRes = await submitBentaRestockPO({
    token: 'token_123',
    payload: validPayload,
    fetchFn: mockInsufficientFetch,
  });

  assert.equal(fundRes.success, false);
  assert.equal(fundRes.category, 'INSUFFICIENT_FUNDS');
  assert.match(fundRes.error || '', /Kulang ang balanse sa Cash Drawer/);
  assert.ok(!fundRes.error?.includes('Raw DB error message'), 'Raw error text must never leak');

  // 4. Unknown error category (500) -> must use fixed generic message, NEVER errJson.error
  const mockUnknownErrorFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        error: 'FATAL SQL/FIRESTORE STACK TRACE: column undefined at internal/db.ts:99',
        category: 'UNEXPECTED_INTERNAL_SCHEMA_FAULT',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const unknownRes = await submitBentaRestockPO({
    token: 'token_123',
    payload: validPayload,
    fetchFn: mockUnknownErrorFetch,
  });

  assert.equal(unknownRes.success, false);
  assert.equal(unknownRes.category, 'UNEXPECTED_INTERNAL_SCHEMA_FAULT');
  assert.equal(unknownRes.error, 'May error sa pag-save ng Purchase Order.');
  assert.ok(!unknownRes.error.includes('STACK TRACE'), 'Raw error traces must never leak');

  // 5. Network throw
  const mockNetworkErrorFetch: typeof fetch = async () => {
    throw new Error('Network offline');
  };

  const netRes = await submitBentaRestockPO({
    token: 'token_123',
    payload: validPayload,
    fetchFn: mockNetworkErrorFetch,
  });

  assert.equal(netRes.success, false);
  assert.equal(netRes.category, 'NETWORK_ERROR');
  assert.ok(!netRes.error?.includes('Network offline'), 'Raw error exception must not be exposed');
  assert.match(netRes.error || '', /Hindi makakonekta sa server/);

  // 6. Missing token fails closed
  const noTokenRes = await submitBentaRestockPO({
    token: '',
    payload: validPayload,
  });
  assert.equal(noTokenRes.success, false);
  assert.equal(noTokenRes.category, 'AUTHENTICATION_REQUIRED');
});
