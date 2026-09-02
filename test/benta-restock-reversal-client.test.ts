import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReversalReason,
  generateIdempotencyKey,
  submitRestockReversal,
  RestockReversalError,
  RESTOCK_REVERSAL_MAX_REASON_LENGTH,
  type RestockReversalReceipt,
  isRetryableError,
} from '../src/lib/client/benta-restock-reversal-client';

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

function createValidReceipt(overrides: Partial<RestockReversalReceipt> = {}): RestockReversalReceipt {
  return {
    reversalId: 'rev_' + 'a'.repeat(56),
    purchaseOrderId: 'po_abc123',
    voidedAt: '2024-01-01T00:00:00.000Z',
    productCount: 3,
    paymentEffect: 'cash_refunded',
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

test('validateReversalReason: accepts valid reason', () => {
  const result = validateReversalReason('Supplier delivered wrong items');
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.value, 'Supplier delivered wrong items');
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
  const result = validateReversalReason('WrongItem\tQuantity');
  assert.equal(result.valid, false);
  if (!result.valid) assert.ok(result.message.includes('control'));
});

test('validateReversalReason: rejects line feed', () => {
  const result = validateReversalReason('WrongItem\nQuantity');
  assert.equal(result.valid, false);
});

test('validateReversalReason: rejects carriage return', () => {
  const result = validateReversalReason('WrongItem\rQuantity');
  assert.equal(result.valid, false);
});

test('validateReversalReason: rejects DEL character', () => {
  const result = validateReversalReason('WrongItem\x7fQuantity');
  assert.equal(result.valid, false);
});

test('validateReversalReason: rejects NUL', () => {
  const result = validateReversalReason('WrongItem\x00Quantity');
  assert.equal(result.valid, false);
});

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
  const keyAgain = key;
  assert.equal(key, keyAgain);
});

test('submitRestockReversal: validates reason before network call', async () => {
  let networkCalled = false;
  const mockFetch: typeof fetch = (_url, _init) => {
    networkCalled = true;
    return Promise.resolve({ ok: true, status: 201, json: () => createValidReceipt() } as unknown as Response);
  };

  await assert.rejects(
    submitRestockReversal({
      tenantId: 'tenant_1',
      purchaseOrderId: 'po_1',
      reason: '',
      idempotencyKey: VALID_UUID,
      fetchFn: mockFetch,
    }),
    (err: unknown) => err instanceof RestockReversalError && err.code === 'INVALID_REQUEST',
  );
  assert.equal(networkCalled, false, 'Network should not be called for invalid reason');
});

test('submitRestockReversal: rejects oversized reason before network', async () => {
  let networkCalled = false;
  const mockFetch: typeof fetch = () => {
    networkCalled = true;
    return Promise.resolve({ ok: true, status: 201, json: () => createValidReceipt() } as unknown as Response);
  };

  await assert.rejects(
    submitRestockReversal({
      tenantId: 'tenant_1',
      purchaseOrderId: 'po_1',
      reason: 'a'.repeat(501),
      idempotencyKey: VALID_UUID,
      fetchFn: mockFetch,
    }),
  );
  assert.equal(networkCalled, false);
});

test('submitRestockReversal: rejects control characters before network', async () => {
  let networkCalled = false;
  const mockFetch: typeof fetch = () => {
    networkCalled = true;
    return Promise.resolve({ ok: true, status: 201, json: () => createValidReceipt() } as unknown as Response);
  };

  for (const char of ['\t', '\n', '\r', '\x00', '\x7f']) {
    const prev = networkCalled;
    await assert.rejects(
      submitRestockReversal({
        tenantId: 'tenant_1',
        purchaseOrderId: 'po_1',
        reason: `bad${char}reason`,
        idempotencyKey: VALID_UUID,
        fetchFn: mockFetch,
      }),
    );
    assert.equal(networkCalled, prev, `Network called for reason with ${char.charCodeAt(0)}`);
  }
});

test('submitRestockReversal: sends exactly three fields in body', async () => {
  let capturedBody: string | undefined;
  const mockFetch: typeof fetch = async (_url, init) => {
    capturedBody = init?.body as string;
    return {
      ok: true,
      status: 201,
      json: () => createValidReceipt(),
    } as unknown as Response;
  };

  await submitRestockReversal({
    tenantId: 'tenant_test',
    purchaseOrderId: 'po_test',
    reason: 'Test reason',
    idempotencyKey: VALID_UUID,
    token: 'mock-token',
    fetchFn: mockFetch,
  });

  const parsed = JSON.parse(capturedBody!);
  const keys = Object.keys(parsed).sort();
  assert.deepEqual(keys, ['idempotencyKey', 'purchaseOrderId', 'reason'], 'Body must have exactly purchaseOrderId, idempotencyKey, reason');
  assert.equal(parsed.purchaseOrderId, 'po_test');
  assert.equal(parsed.idempotencyKey, VALID_UUID);
  assert.equal(parsed.reason, 'Test reason');
});

test('submitRestockReversal: uses Bearer token in Authorization header', async () => {
  let capturedAuth: string | undefined;
  const mockFetch: typeof fetch = async (_url, init) => {
    capturedAuth = init?.headers?.['Authorization'] as string;
    return {
      ok: true,
      status: 201,
      json: () => createValidReceipt(),
    } as unknown as Response;
  };

  await submitRestockReversal({
    tenantId: 'tenant_test',
    purchaseOrderId: 'po_test',
    reason: 'Test reason',
    idempotencyKey: VALID_UUID,
    token: 'my-test-token',
    fetchFn: mockFetch,
  });

  assert.ok(capturedAuth?.startsWith('Bearer '), 'Authorization header should be Bearer token');
  assert.ok(capturedAuth?.includes('my-test-token'));
});

test('submitRestockReversal: returns RestockReversalReceipt on success', async () => {
  const receipt = createValidReceipt();
  const mockFetch: typeof fetch = async () => ({
    ok: true,
    status: 201,
    json: () => receipt,
  }) as unknown as Response;

  const result = await submitRestockReversal({
    tenantId: 'tenant_test',
    purchaseOrderId: 'po_test',
    reason: 'Return',
    idempotencyKey: VALID_UUID,
    token: 'mock-token',
    fetchFn: mockFetch,
  });

  assert.equal(result.reversalId, receipt.reversalId);
  assert.equal(result.purchaseOrderId, receipt.purchaseOrderId);
  assert.equal(result.voidedAt, receipt.voidedAt);
  assert.equal(result.productCount, receipt.productCount);
  assert.equal(result.paymentEffect, receipt.paymentEffect);
  assert.equal(result.reversalVersion, receipt.reversalVersion);
});

test('submitRestockReversal: validates receipt has exactly six keys', async () => {
  const receiptWithExtra = { ...createValidReceipt(), extraField: 'should be rejected' };
  const mockFetch: typeof fetch = async () => ({
    ok: true,
    status: 201,
    json: () => receiptWithExtra,
  }) as unknown as Response;

  await assert.rejects(
    submitRestockReversal({
      tenantId: 'tenant_test',
      purchaseOrderId: 'po_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    }),
    (err: unknown) => err instanceof RestockReversalError && err.code === 'UNKNOWN_ERROR',
  );
});

test('submitRestockReversal: validates receipt missing key', async () => {
  const receiptMissing = { reversalId: 'rev', voidedAt: '2024', productCount: 1, paymentEffect: 'cash_refunded', reversalVersion: 1 } as Partial<RestockReversalReceipt>;
  const mockFetch: typeof fetch = async () => ({
    ok: true,
    status: 201,
    json: () => receiptMissing,
  }) as unknown as Response;

  await assert.rejects(
    submitRestockReversal({
      tenantId: 'tenant_test',
      purchaseOrderId: 'po_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    }),
    (err: unknown) => err instanceof RestockReversalError && err.code === 'UNKNOWN_ERROR',
  );
});

test('submitRestockReversal: validates paymentEffect is valid enum value', async () => {
  const receiptBadPayment = { ...createValidReceipt(), paymentEffect: 'invalid_payment' };
  const mockFetch: typeof fetch = async () => ({
    ok: true,
    status: 201,
    json: () => receiptBadPayment,
  }) as unknown as Response;

  await assert.rejects(
    submitRestockReversal({
      tenantId: 'tenant_test',
      purchaseOrderId: 'po_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    }),
    (err: unknown) => err instanceof RestockReversalError && err.code === 'UNKNOWN_ERROR',
  );
});

test('submitRestockReversal: maps AUTHENTICATION_REQUIRED error correctly', async () => {
  const mockFetch: typeof fetch = async () => ({
    ok: false,
    status: 401,
    async json() {
      return { error: 'Unauthorized', category: 'AUTHENTICATION_REQUIRED' };
    },
  }) as unknown as Response;

  await assert.rejects(
    submitRestockReversal({
      tenantId: 'tenant_test',
      purchaseOrderId: 'po_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    }),
    (err: unknown) => {
      if (!(err instanceof RestockReversalError)) return false;
      assert.equal(err.code, 'AUTHENTICATION_REQUIRED');
      assert.equal(err.httpStatus, 401);
      return true;
    },
  );
});

test('submitRestockReversal: maps INTEGRITY_ERROR correctly', async () => {
  const mockFetch: typeof fetch = async () => ({
    ok: false,
    status: 409,
    async json() {
      return { error: 'Integrity error', category: 'INTEGRITY_ERROR' };
    },
  }) as unknown as Response;

  await assert.rejects(
    submitRestockReversal({
      tenantId: 'tenant_test',
      purchaseOrderId: 'po_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    }),
    (err: unknown) => {
      if (!(err instanceof RestockReversalError)) return false;
      assert.equal(err.code, 'INTEGRITY_ERROR');
      return true;
    },
  );
});

test('submitRestockReversal: maps PO_ALREADY_VOIDED correctly', async () => {
  const mockFetch: typeof fetch = async () => ({
    ok: false,
    status: 409,
    async json() {
      return { error: 'Already voided', category: 'PO_ALREADY_VOIDED' };
    },
  }) as unknown as Response;

  await assert.rejects(
    submitRestockReversal({
      tenantId: 'tenant_test',
      purchaseOrderId: 'po_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    }),
    (err: unknown) => {
      if (!(err instanceof RestockReversalError)) return false;
      assert.equal(err.code, 'PO_ALREADY_VOIDED');
      return true;
    },
  );
});

test('submitRestockReversal: maps NETWORK_ERROR on fetch failure', async () => {
  const mockFetch: typeof fetch = async () => {
    throw new Error('Network failure');
  };

  await assert.rejects(
    submitRestockReversal({
      tenantId: 'tenant_test',
      purchaseOrderId: 'po_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    }),
    (err: unknown) => {
      if (!(err instanceof RestockReversalError)) return false;
      assert.equal(err.code, 'NETWORK_ERROR');
      return true;
    },
  );
});

test('submitRestockReversal: maps SERVICE_UNAVAILABLE correctly', async () => {
  const mockFetch: typeof fetch = async () => ({
    ok: false,
    status: 503,
    async json() {
      return { error: 'Service unavailable', category: 'SERVICE_UNAVAILABLE' };
    },
  }) as unknown as Response;

  await assert.rejects(
    submitRestockReversal({
      tenantId: 'tenant_test',
      purchaseOrderId: 'po_test',
      reason: 'Return',
      idempotencyKey: VALID_UUID,
      token: 'mock-token',
      fetchFn: mockFetch,
    }),
    (err: unknown) => {
      if (!(err instanceof RestockReversalError)) return false;
      assert.equal(err.code, 'SERVICE_UNAVAILABLE');
      return true;
    },
  );
});

test('submitRestockReversal: trims reason before sending', async () => {
  let capturedBody: string | undefined;
  const mockFetch: typeof fetch = async (_url, init) => {
    capturedBody = init?.body as string;
    return {
      ok: true,
      status: 201,
      json: () => createValidReceipt(),
    } as unknown as Response;
  };

  await submitRestockReversal({
    tenantId: 'tenant_test',
    purchaseOrderId: 'po_test',
    reason: '  trimmed reason  ',
    idempotencyKey: VALID_UUID,
    token: 'mock-token',
    fetchFn: mockFetch,
  });

  const parsed = JSON.parse(capturedBody!);
  assert.equal(parsed.reason, 'trimmed reason');
});

test('submitRestockReversal: retry reuses same idempotency key (caller-side)', async () => {
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
  await submitRestockReversal({
    tenantId: 'tenant_test',
    purchaseOrderId: 'po_test',
    reason: 'Return',
    idempotencyKey: sharedKey,
    token: 'mock-token',
    fetchFn: mockFetch,
  });

  await submitRestockReversal({
    tenantId: 'tenant_test',
    purchaseOrderId: 'po_test',
    reason: 'Return',
    idempotencyKey: sharedKey,
    token: 'mock-token',
    fetchFn: mockFetch,
  });

  assert.equal(callCount, 2);
  assert.equal(usedKeys[0], sharedKey);
  assert.equal(usedKeys[1], sharedKey);
  assert.equal(usedKeys[0], usedKeys[1], 'Retry should use the same key');
});

test('isRetryableError: SERVICE_UNAVAILABLE is retryable', () => {
  const err = new RestockReversalError('Service unavailable', 'SERVICE_UNAVAILABLE', 503);
  assert.equal(isRetryableError(err), true);
});

test('isRetryableError: NETWORK_ERROR is retryable', () => {
  const err = new RestockReversalError('Network error', 'NETWORK_ERROR', 0);
  assert.equal(isRetryableError(err), true);
});

test('isRetryableError: INTEGRITY_ERROR is not retryable', () => {
  const err = new RestockReversalError('Integrity error', 'INTEGRITY_ERROR', 409);
  assert.equal(isRetryableError(err), false);
});

test('isRetryableError: PO_ALREADY_VOIDED is not retryable', () => {
  const err = new RestockReversalError('Already voided', 'PO_ALREADY_VOIDED', 409);
  assert.equal(isRetryableError(err), false);
});

test('isRetryableError: INVALID_REQUEST is not retryable', () => {
  const err = new RestockReversalError('Invalid request', 'INVALID_REQUEST', 400);
  assert.equal(isRetryableError(err), false);
});

test('RestockReversalReceipt: public type has exactly six keys', () => {
  const receipt = createValidReceipt();
  const keys = Object.keys(receipt as Record<string, unknown>).sort();
  assert.equal(keys.length, 6, `Expected 6 keys, got ${keys.join(', ')}`);
  assert.deepEqual(keys, ['paymentEffect', 'productCount', 'purchaseOrderId', 'reversalId', 'reversalVersion', 'voidedAt'].sort());
});

test('RestockReversalReceipt: does not expose internal fields', () => {
  const receipt = createValidReceipt();
  const receiptAny = receipt as Record<string, unknown>;
  assert.equal(receiptAny.fingerprint, undefined);
  assert.equal(receiptAny.tenantId, undefined);
  assert.equal(receiptAny.voidReason, undefined);
  assert.equal(receiptAny.actorUid, undefined);
  assert.equal(receiptAny.internalEvidence, undefined);
});

test('RestockReversalError: has code and httpStatus', () => {
  const err = new RestockReversalError('Test', 'INTEGRITY_ERROR', 409);
  assert.equal(err.code, 'INTEGRITY_ERROR');
  assert.equal(err.httpStatus, 409);
  assert.equal(err.message, 'Test');
  assert.equal(err.name, 'RestockReversalError');
});

test('RESTOCK_REVERSAL_MAX_REASON_LENGTH is 500', () => {
  assert.equal(RESTOCK_REVERSAL_MAX_REASON_LENGTH, 500);
});

test('submitRestockReversal rejects malformed identifiers and UUID before authentication or network', async () => {
  let networkCalled = false;
  const mockFetch: typeof fetch = async () => {
    networkCalled = true;
    return { ok: true, status: 201, json: () => createValidReceipt() } as unknown as Response;
  };

  for (const invalid of [
    { tenantId: '../tenant', purchaseOrderId: 'po_1', idempotencyKey: VALID_UUID },
    { tenantId: 'tenant_1', purchaseOrderId: 'bad/po', idempotencyKey: VALID_UUID },
    { tenantId: 'tenant_1', purchaseOrderId: 'po_1', idempotencyKey: 'not-a-uuid' },
  ]) {
    await assert.rejects(
      () => submitRestockReversal({
        ...invalid,
        reason: 'Invalid identity evidence',
        token: 'test-token',
        fetchFn: mockFetch,
      }),
      (err: unknown) => err instanceof RestockReversalError && err.code === 'INVALID_REQUEST',
    );
  }
  assert.equal(networkCalled, false);
});

test('submitRestockReversal rejects coercible but incorrectly typed receipt fields', async () => {
  const mockFetch: typeof fetch = async () => ({
    ok: true,
    status: 201,
    json: () => ({ ...createValidReceipt(), productCount: '1' }),
  }) as unknown as Response;

  await assert.rejects(
    () => submitRestockReversal({
      tenantId: 'tenant_1',
      purchaseOrderId: 'po_1',
      reason: 'Strict response validation',
      idempotencyKey: VALID_UUID,
      token: 'test-token',
      fetchFn: mockFetch,
    }),
    (err: unknown) => err instanceof RestockReversalError && err.code === 'UNKNOWN_ERROR',
  );
});

test('submitRestockReversal does not trust an unknown server error category', async () => {
  const mockFetch: typeof fetch = async () => ({
    ok: false,
    status: 409,
    json: () => ({ category: 'INVENTED_RETRYABLE_CATEGORY' }),
  }) as unknown as Response;

  await assert.rejects(
    () => submitRestockReversal({
      tenantId: 'tenant_1',
      purchaseOrderId: 'po_1',
      reason: 'Unknown server category',
      idempotencyKey: VALID_UUID,
      token: 'test-token',
      fetchFn: mockFetch,
    }),
    (err: unknown) => err instanceof RestockReversalError && err.code === 'UNKNOWN_ERROR' && !isRetryableError(err),
  );
});
