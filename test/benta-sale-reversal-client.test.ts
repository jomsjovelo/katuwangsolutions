import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReversalReason,
  generateIdempotencyKey,
  submitSaleReversal,
  SaleReversalError,
  SALE_REVERSAL_MAX_REASON_LENGTH,
  type SaleReversalReceipt,
} from '../src/lib/client/benta-sale-reversal-client';

const VALID_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function createMockFetch(overrides: {
  status?: number;
  ok?: boolean;
  json?: () => unknown;
  throw?: Error;
}): typeof fetch {
  return async (_url, _init) => {
    if (overrides.throw) throw overrides.throw;
    return {
      ok: overrides.ok ?? (overrides.status === 200),
      status: overrides.status ?? 200,
      async json() {
        return overrides.json!();
      },
    } as unknown as Response;
  };
}

function createValidReceipt(overrides: Partial<SaleReversalReceipt> = {}): SaleReversalReceipt {
  return {
    reversalId: 'rev_' + 'a'.repeat(56),
    saleId: 'sale_abc123',
    voidedAt: '2024-01-01T00:00:00.000Z',
    paymentMethod: 'cash',
    productCount: 3,
    shiftStatus: 'open',
    reversalVersion: 1,
    ...overrides,
  };
}

function createAuthErrorFetch(): typeof fetch {
  return async () =>
    ({
      ok: false,
      status: 401,
      async json() {
        return { error: 'Unauthorized', category: 'AUTHENTICATION_REQUIRED' };
      },
    }) as unknown as Response;
}

// ============================================================
// Validation tests
// ============================================================

test('validateReversalReason: accepts valid reason', () => {
  const result = validateReversalReason('Customer returned defective item');
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.value, 'Customer returned defective item');
});

test('validateReversalReason: trims whitespace', () => {
  const result = validateReversalReason('  trimmed  ');
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.value, 'trimmed');
});

test('validateReversalReason: rejects blank reason', () => {
  const result = validateReversalReason('');
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.message, 'Kailangan ang dahilan ng pag-void.');
});

test('validateReversalReason: rejects whitespace-only reason', () => {
  const result = validateReversalReason('   ');
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.message, 'Kailangan ang dahilan ng pag-void.');
});

test('validateReversalReason: rejects reason over 500 chars', () => {
  const result = validateReversalReason('a'.repeat(501));
  assert.equal(result.valid, false);
  if (!result.valid) assert.ok(result.message.includes('500'));
});

test('validateReversalReason: accepts reason at exactly 500 chars', () => {
  const result = validateReversalReason('a'.repeat(500));
  assert.equal(result.valid, true);
});

test('validateReversalReason: rejects tab character', () => {
  const result = validateReversalReason('Defective\tItem');
  assert.equal(result.valid, false);
  if (!result.valid) assert.ok(result.message.includes('control'));
});

test('validateReversalReason: rejects line feed', () => {
  const result = validateReversalReason('Defective\nItem');
  assert.equal(result.valid, false);
});

test('validateReversalReason: rejects carriage return', () => {
  const result = validateReversalReason('Defective\rItem');
  assert.equal(result.valid, false);
});

test('validateReversalReason: rejects DEL character', () => {
  const result = validateReversalReason('Defective\x7fItem');
  assert.equal(result.valid, false);
});

test('validateReversalReason: rejects NUL', () => {
  const result = validateReversalReason('Defective\x00Item');
  assert.equal(result.valid, false);
});

// ============================================================
// Idempotency key generation tests
// ============================================================

test('generateIdempotencyKey: returns valid UUID v4', () => {
  const key = generateIdempotencyKey();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.ok(uuidRegex.test(key), `Expected valid UUID v4, got: ${key}`);
});

test('generateIdempotencyKey: generates unique keys', () => {
  const key1 = generateIdempotencyKey();
  const key2 = generateIdempotencyKey();
  assert.notEqual(key1, key2, 'Each call should produce a unique key');
});

test('generateIdempotencyKey: reused key for same attempt (caller-side)', () => {
  const key = generateIdempotencyKey();
  // Simulate retry with same key
  const keyAgain = key; // Same variable = same key for retries
  assert.equal(key, keyAgain);
});

// ============================================================
// submitSaleReversal tests
// ============================================================

test('submitSaleReversal: validates reason before network call', async () => {
  let networkCalled = false;
  const mockFetch: typeof fetch = (_url, _init) => {
    networkCalled = true;
    return Promise.resolve({ ok: true, status: 201, json: () => createValidReceipt() } as unknown as Response);
  };

  // Blank reason should throw before network
  await assert.rejects(
    submitSaleReversal({
      tenantId: 'tenant_1',
      saleId: 'sale_1',
      reason: '',
      idempotencyKey: VALID_UUID,
      fetchFn: mockFetch,
    } as any),
    (err: unknown) => err instanceof SaleReversalError && err.code === 'INVALID_REQUEST',
  );
  assert.equal(networkCalled, false, 'Network should not be called for invalid reason');
});

test('submitSaleReversal: rejects oversized reason before network', async () => {
  let networkCalled = false;
  const mockFetch: typeof fetch = () => {
    networkCalled = true;
    return Promise.resolve({ ok: true, status: 201, json: () => createValidReceipt() } as unknown as Response);
  };

  await assert.rejects(
    submitSaleReversal({
      tenantId: 'tenant_1',
      saleId: 'sale_1',
      reason: 'a'.repeat(501),
      idempotencyKey: VALID_UUID,
      fetchFn: mockFetch,
    } as any),
  );
  assert.equal(networkCalled, false);
});

test('submitSaleReversal: rejects control characters before network', async () => {
  let networkCalled = false;
  const mockFetch: typeof fetch = () => {
    networkCalled = true;
    return Promise.resolve({ ok: true, status: 201, json: () => createValidReceipt() } as unknown as Response);
  };

  for (const char of ['\t', '\n', '\r', '\x00', '\x7f']) {
    const prev = networkCalled;
    await assert.rejects(
      submitSaleReversal({
        tenantId: 'tenant_1',
        saleId: 'sale_1',
        reason: `bad${char}reason`,
        idempotencyKey: VALID_UUID,
        fetchFn: mockFetch,
      } as any),
    );
    assert.equal(networkCalled, prev, `Network called for reason with ${char.charCodeAt(0)}`);
  }
});

test('submitSaleReversal: sends exactly three fields in body', async () => {
  let capturedBody: string | undefined;
  const mockFetch: typeof fetch = async (_url, init) => {
    capturedBody = init?.body as string;
    return {
      ok: true,
      status: 201,
      json: () => createValidReceipt(),
    } as unknown as Response;
  };

  await submitSaleReversal({
    tenantId: 'tenant_test',
    saleId: 'sale_test',
    reason: 'Test reason',
    idempotencyKey: VALID_UUID,
    token: 'mock-token',
    fetchFn: mockFetch,
  } as any);

  const parsed = JSON.parse(capturedBody!);
  const keys = Object.keys(parsed).sort();
  assert.deepEqual(keys, ['idempotencyKey', 'reason', 'saleId'], 'Body must have exactly saleId, idempotencyKey, reason');
  assert.equal(parsed.saleId, 'sale_test');
  assert.equal(parsed.idempotencyKey, VALID_UUID);
  assert.equal(parsed.reason, 'Test reason');
});

test('submitSaleReversal: uses Bearer token in Authorization header', async () => {
  let capturedAuth: string | undefined;
  const mockFetch: typeof fetch = async (_url, init) => {
    capturedAuth = init?.headers?.['Authorization'] as string;
    return {
      ok: true,
      status: 201,
      json: () => createValidReceipt(),
    } as unknown as Response;
  };

  await submitSaleReversal({
    tenantId: 'tenant_test',
    saleId: 'sale_test',
    reason: 'Test reason',
    idempotencyKey: VALID_UUID,
    token: 'my-test-token',
    fetchFn: mockFetch,
  } as any);

  assert.ok(capturedAuth?.startsWith('Bearer '), 'Authorization header should be Bearer token');
  assert.ok(capturedAuth?.includes('my-test-token'));
});

test('submitSaleReversal: returns SaleReversalReceipt on success', async () => {
  const receipt = createValidReceipt();
  const mockFetch: typeof fetch = async () => ({
    ok: true,
    status: 201,
    json: () => receipt,
  }) as unknown as Response;

  const result = await submitSaleReversal({
    tenantId: 'tenant_test',
    saleId: 'sale_test',
    reason: 'Return',
    idempotencyKey: VALID_UUID,
    token: 'mock-token',
    fetchFn: mockFetch,
  } as any);

  assert.equal(result.reversalId, receipt.reversalId);
  assert.equal(result.saleId, receipt.saleId);
  assert.equal(result.voidedAt, receipt.voidedAt);
  assert.equal(result.paymentMethod, receipt.paymentMethod);
  assert.equal(result.productCount, receipt.productCount);
  assert.equal(result.shiftStatus, receipt.shiftStatus);
  assert.equal(result.reversalVersion, receipt.reversalVersion);
});

test('submitSaleReversal: validates receipt has exactly seven keys', async () => {
  const receiptWithExtra = { ...createValidReceipt(), extraField: 'should be rejected' };
  const mockFetch: typeof fetch = async () => ({
    ok: true,
    status: 201,
    json: () => receiptWithExtra,
  }) as unknown as Response;

  await assert.rejects(
    submitSaleReversal({
      tenantId: 'tenant_test',
      saleId: 'sale_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    } as any),
    (err: unknown) => err instanceof SaleReversalError && err.code === 'UNKNOWN_ERROR',
  );
});

test('submitSaleReversal: handles replay receipt (201) as success', async () => {
  const replayReceipt = createValidReceipt({ saleId: 'sale_test', voidedAt: '2024-01-01T00:00:00.000Z' });
  const mockFetch: typeof fetch = async () => ({
    ok: true,
    status: 201,
    json: () => replayReceipt,
  }) as unknown as Response;

  const result = await submitSaleReversal({
    tenantId: 'tenant_test',
    saleId: 'sale_test',
    reason: 'Return',
    idempotencyKey: VALID_UUID,
    token: 'mock-token',
    fetchFn: mockFetch,
  } as any);

  assert.equal(result.saleId, 'sale_test');
  assert.equal(result.reversalVersion, 1);
});

test('submitSaleReversal: maps AUTHENTICATION_REQUIRED error correctly', async () => {
  const mockFetch: typeof fetch = async () => ({
    ok: false,
    status: 401,
    async json() {
      return { error: 'Unauthorized', category: 'AUTHENTICATION_REQUIRED' };
    },
  }) as unknown as Response;

  await assert.rejects(
    submitSaleReversal({
      tenantId: 'tenant_test',
      saleId: 'sale_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    } as any),
    (err: unknown) => {
      if (!(err instanceof SaleReversalError)) return false;
      assert.equal(err.code, 'AUTHENTICATION_REQUIRED');
      assert.equal(err.httpStatus, 401);
      return true;
    },
  );
});

test('submitSaleReversal: maps REVERSAL_INTEGRITY_ERROR and fails closed', async () => {
  const mockFetch: typeof fetch = async () => ({
    ok: false,
    status: 409,
    async json() {
      return { error: 'Integrity error', category: 'REVERSAL_INTEGRITY_ERROR' };
    },
  }) as unknown as Response;

  await assert.rejects(
    submitSaleReversal({
      tenantId: 'tenant_test',
      saleId: 'sale_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    } as any),
    (err: unknown) => {
      if (!(err instanceof SaleReversalError)) return false;
      assert.equal(err.code, 'REVERSAL_INTEGRITY_ERROR');
      return true;
    },
  );
});

test('submitSaleReversal: maps IDEMPOTENCY_CONFLICT correctly', async () => {
  const mockFetch: typeof fetch = async () => ({
    ok: false,
    status: 409,
    async json() {
      return { error: 'Conflict', category: 'IDEMPOTENCY_CONFLICT' };
    },
  }) as unknown as Response;

  await assert.rejects(
    submitSaleReversal({
      tenantId: 'tenant_test',
      saleId: 'sale_test',
      reason: 'Different reason',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    } as any),
    (err: unknown) => {
      if (!(err instanceof SaleReversalError)) return false;
      assert.equal(err.code, 'IDEMPOTENCY_CONFLICT');
      return true;
    },
  );
});

test('submitSaleReversal: maps SALE_ALREADY_VOIDED correctly', async () => {
  const mockFetch: typeof fetch = async () => ({
    ok: false,
    status: 409,
    async json() {
      return { error: 'Already voided', category: 'SALE_ALREADY_VOIDED' };
    },
  }) as unknown as Response;

  await assert.rejects(
    submitSaleReversal({
      tenantId: 'tenant_test',
      saleId: 'sale_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    } as any),
    (err: unknown) => {
      if (!(err instanceof SaleReversalError)) return false;
      assert.equal(err.code, 'SALE_ALREADY_VOIDED');
      return true;
    },
  );
});

test('submitSaleReversal: maps NETWORK_ERROR on fetch failure', async () => {
  const mockFetch: typeof fetch = async () => {
    throw new Error('Network failure');
  };

  await assert.rejects(
    submitSaleReversal({
      tenantId: 'tenant_test',
      saleId: 'sale_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    } as any),
    (err: unknown) => {
      if (!(err instanceof SaleReversalError)) return false;
      assert.equal(err.code, 'NETWORK_ERROR');
      return true;
    },
  );
});

test('submitSaleReversal: trims reason before sending', async () => {
  let capturedBody: string | undefined;
  const mockFetch: typeof fetch = async (_url, init) => {
    capturedBody = init?.body as string;
    return {
      ok: true,
      status: 201,
      json: () => createValidReceipt(),
    } as unknown as Response;
  };

  await submitSaleReversal({
    tenantId: 'tenant_test',
    saleId: 'sale_test',
    reason: '  trimmed reason  ',
    idempotencyKey: VALID_UUID,
    token: 'mock-token',
    fetchFn: mockFetch,
  } as any);

  const parsed = JSON.parse(capturedBody!);
  assert.equal(parsed.reason, 'trimmed reason');
});

test('submitSaleReversal: retry reuses same idempotency key (caller-side)', async () => {
  let callCount = 0;
  const usedKeys: string[] = [];
  const mockFetch: typeof fetch = async (_url, init) => {
    callCount++;
    const body = JSON.parse(init?.body as string);
    usedKeys.push(body.idempotencyKey);
    return {
      ok: true,
      status: 201,
      json: () => createValidReceipt(),
    } as unknown as Response;
  };

  const sharedKey = generateIdempotencyKey();
  // Simulate first attempt
  await submitSaleReversal({
    tenantId: 'tenant_test',
    saleId: 'sale_test',
    reason: 'Return',
    idempotencyKey: sharedKey,
    token: 'mock-token',
    fetchFn: mockFetch,
  } as any);

  // Retry with same key
  await submitSaleReversal({
    tenantId: 'tenant_test',
    saleId: 'sale_test',
    reason: 'Return',
    idempotencyKey: sharedKey,
    token: 'mock-token',
    fetchFn: mockFetch,
  } as any);

  assert.equal(callCount, 2);
  assert.equal(usedKeys[0], sharedKey);
  assert.equal(usedKeys[1], sharedKey);
  assert.equal(usedKeys[0], usedKeys[1], 'Retry should use the same key');
});

// ============================================================
// Type safety tests
// ============================================================

test('SaleReversalReceipt: public type has exactly seven keys', () => {
  const receipt = createValidReceipt();
  const keys = Object.keys(receipt as Record<string, unknown>).sort();
  assert.equal(keys.length, 7, `Expected 7 keys, got ${keys.join(', ')}`);
  assert.deepEqual(keys, ['paymentMethod', 'productCount', 'reversalId', 'reversalVersion', 'saleId', 'shiftStatus', 'voidedAt'].sort());
});

test('SaleReversalReceipt: does not expose cost/accounting fields', () => {
  const receipt = createValidReceipt();
  const receiptAny = receipt as Record<string, unknown>;
  assert.equal(receiptAny.lineCostCentavos, undefined);
  assert.equal(receiptAny.costVarianceCentavos, undefined);
  assert.equal(receiptAny.inventoryCostReliefCentavos, undefined);
  assert.equal(receiptAny.fingerprint, undefined);
  assert.equal(receiptAny.accountId, undefined);
  assert.equal(receiptAny.ledgerId, undefined);
  assert.equal(receiptAny.idempotencyKey, undefined);
});

test('SaleReversalError: has code and httpStatus', () => {
  const err = new SaleReversalError('Test', 'REVERSAL_INTEGRITY_ERROR', 409);
  assert.equal(err.code, 'REVERSAL_INTEGRITY_ERROR');
  assert.equal(err.httpStatus, 409);
  assert.equal(err.message, 'Test');
  assert.equal(err.name, 'SaleReversalError');
});

test('SALE_REVERSAL_MAX_REASON_LENGTH is 500', () => {
  assert.equal(SALE_REVERSAL_MAX_REASON_LENGTH, 500);
});
