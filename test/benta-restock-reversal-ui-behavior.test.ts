import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateIdempotencyKey,
  isValidIdempotencyKey,
  type RestockReversalReceipt,
  RestockReversalError,
} from '../src/lib/client/benta-restock-reversal-client';
import {
  classifyBentaRestockReversal,
  executeBentaRestockReversalOrchestration,
  isValidRestockReversalReason,
} from '../src/lib/client/benta-restock-reversal-orchestration';

const SMART_PO_FIXTURE = {
  id: 'po_smart_001',
  costingVersion: 'moving_average_v1' as const,
  items: [{ productId: 'prod_1', name: 'Item 1', quantity: 10, unitCostCentavos: 1000 }],
  totalAmountCentavos: 10000,
  paymentMethod: 'cash',
  paymentStatus: 'paid',
};

const LEGACY_PO_FIXTURE = {
  id: 'po_legacy_001',
  items: [{ productId: 'prod_1', name: 'Item 1', quantity: 10, unitCostCentavos: 1000 }],
  totalAmountCentavos: 10000,
};

const VOIDED_PO_FIXTURE = {
  id: 'po_voided_001',
  costingVersion: 'moving_average_v1' as const,
  status: 'voided' as const,
  items: [{ productId: 'prod_1', name: 'Item 1', quantity: 10, unitCostCentavos: 1000 }],
  totalAmountCentavos: 10000,
};

const GCASH_PO_FIXTURE = {
  id: 'po_gcash_001',
  costingVersion: 'moving_average_v1' as const,
  items: [{ productId: 'prod_1', name: 'Item 1', quantity: 10, unitCostCentavos: 1000 }],
  totalAmountCentavos: 10000,
  paymentMethod: 'gcash',
  paymentStatus: 'paid',
};

const MAYA_PO_FIXTURE = {
  id: 'po_maya_001',
  costingVersion: 'moving_average_v1' as const,
  items: [{ productId: 'prod_1', name: 'Item 1', quantity: 10, unitCostCentavos: 1000 }],
  totalAmountCentavos: 10000,
  paymentMethod: 'maya',
  paymentStatus: 'paid',
};

function createMockSubmitRestockReversal(shouldSucceed: boolean): (options: {tenantId: string; purchaseOrderId: string; reason: string; idempotencyKey: string; token?: string}) => Promise<RestockReversalReceipt> {
  return async (options) => {
    if (!shouldSucceed) {
      throw new RestockReversalError('Test error', 'INTEGRITY_ERROR', 409);
    }
    return {
      reversalId: 'rev_' + 'a'.repeat(56),
      purchaseOrderId: options.purchaseOrderId,
      voidedAt: new Date().toISOString(),
      productCount: 1,
      paymentEffect: 'cash_refunded',
      reversalVersion: 1,
    };
  };
}

function createMockVoidPurchaseOrder(shouldSucceed: boolean): (tenantId: string, poId: string, uid: string, userName: string) => Promise<boolean> {
  return async () => {
    if (!shouldSucceed) {
      throw new Error('Void failed');
    }
    return true;
  };
}

test('classifyBentaRestockReversal: Smart PO is classified as smart', () => {
  assert.equal(classifyBentaRestockReversal(SMART_PO_FIXTURE), true);
});

test('classifyBentaRestockReversal: legacy PO without costingVersion is not smart', () => {
  assert.equal(classifyBentaRestockReversal(LEGACY_PO_FIXTURE), false);
});

test('classifyBentaRestockReversal: null PO is not smart', () => {
  assert.equal(classifyBentaRestockReversal(null), false);
});

test('classifyBentaRestockReversal: undefined PO is not smart', () => {
  assert.equal(classifyBentaRestockReversal(undefined), false);
});

test('classifyBentaRestockReversal: empty object is not smart', () => {
  assert.equal(classifyBentaRestockReversal({}), false);
});

test('isValidIdempotencyKey: accepts valid UUID v4', () => {
  assert.equal(isValidIdempotencyKey(generateIdempotencyKey()), true);
});

test('isValidIdempotencyKey: rejects blank string', () => {
  assert.equal(isValidIdempotencyKey(''), false);
});

test('isValidIdempotencyKey: rejects malformed keys', () => {
  assert.equal(isValidIdempotencyKey('not-a-uuid'), false);
  assert.equal(isValidIdempotencyKey('00000000-0000-0000-0000-000000000000'), false);
});

test('isValidRestockReversalReason: blank reason is rejected', () => {
  const result = isValidRestockReversalReason('');
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.message.includes('Kailangan'));
  }
});

test('isValidRestockReversalReason: control characters are rejected', () => {
  const result = isValidRestockReversalReason('Test\x00NUL');
  assert.equal(result.valid, false, 'NUL character should be rejected');
  const lf = isValidRestockReversalReason('Test\nLF');
  assert.equal(lf.valid, false, 'LF should be rejected');
  const tab = isValidRestockReversalReason('Test\tTab');
  assert.equal(tab.valid, false, 'Tab should be rejected');
});

test('isValidRestockReversalReason: reason over 500 chars is rejected', () => {
  const result = isValidRestockReversalReason('a'.repeat(501));
  assert.equal(result.valid, false, 'Reason over 500 chars should be rejected');
});

test('isValidRestockReversalReason: valid reason is accepted and trimmed', () => {
  const result = isValidRestockReversalReason('  Supplier returned  ');
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.value, 'Supplier returned', 'Reason should be trimmed');
  }
});

test('executeBentaRestockReversalOrchestration: Smart PO + valid UUID → reversal + onSuccess once', async () => {
  let reversalCalled = false;
  let voidCalled = false;
  let successCalls = 0;

  const mockSubmit = async () => {
    reversalCalled = true;
    return {
      reversalId: 'rev_test',
      purchaseOrderId: SMART_PO_FIXTURE.id,
      voidedAt: new Date().toISOString(),
      productCount: 1,
      paymentEffect: 'cash_refunded' as const,
      reversalVersion: 1,
    };
  };

  const mockVoid = async () => {
    voidCalled = true;
  };

  const result = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: SMART_PO_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: mockSubmit,
    voidPurchaseOrder: mockVoid,
    idempotencyKey: generateIdempotencyKey(),
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, true);
  assert.equal(reversalCalled, true, 'Reversal must be called for Smart PO');
  assert.equal(voidCalled, false, 'Void must never be called for Smart PO');
  assert.equal(successCalls, 1, 'onSuccess must be called exactly once on successful reversal');
});

test('executeBentaRestockReversalOrchestration: Smart PO + blank key → fails before dependencies run', async () => {
  let reversalCalled = false;
  let voidCalled = false;
  let successCalls = 0;

  const result = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: SMART_PO_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: createMockSubmitRestockReversal(true),
    voidPurchaseOrder: createMockVoidPurchaseOrder(true),
    idempotencyKey: '',
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'INVALID_REQUEST');
  assert.equal(reversalCalled, false, 'Reversal must not be called with blank key');
  assert.equal(voidCalled, false, 'Void must not be called with blank key');
  assert.equal(successCalls, 0, 'onSuccess must not be called on validation failure');
});

test('executeBentaRestockReversalOrchestration: Smart PO + malformed key → fails before dependencies run', async () => {
  let reversalCalled = false;
  let voidCalled = false;
  let successCalls = 0;

  const result = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: SMART_PO_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: createMockSubmitRestockReversal(true),
    voidPurchaseOrder: createMockVoidPurchaseOrder(true),
    idempotencyKey: 'not-a-uuid',
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'INVALID_REQUEST');
  assert.equal(reversalCalled, false, 'Reversal must not be called with malformed key');
  assert.equal(voidCalled, false, 'Void must not be called with malformed key');
  assert.equal(successCalls, 0, 'onSuccess must not be called on validation failure');
});

test('executeBentaRestockReversalOrchestration: Smart PO + empty reason → fails before deps', async () => {
  let reversalCalled = false;
  let voidCalled = false;
  let successCalls = 0;

  const result = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: SMART_PO_FIXTURE,
    reason: '',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: createMockSubmitRestockReversal(true),
    voidPurchaseOrder: createMockVoidPurchaseOrder(true),
    idempotencyKey: generateIdempotencyKey(),
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'INVALID_REQUEST');
  assert.equal(reversalCalled, false);
  assert.equal(voidCalled, false);
  assert.equal(successCalls, 0);
});

test('executeBentaRestockReversalOrchestration: legacy PO → void + onSuccess once', async () => {
  let reversalCalled = false;
  let voidCalled = false;
  let successCalls = 0;

  const mockSubmit = async () => {
    reversalCalled = true;
    return { reversalId: 'rev', purchaseOrderId: 'po', voidedAt: '', productCount: 0, paymentEffect: 'cash_refunded' as const, reversalVersion: 1 };
  };

  const mockVoid = async () => {
    voidCalled = true;
  };

  const result = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: LEGACY_PO_FIXTURE,
    reason: '',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: mockSubmit,
    voidPurchaseOrder: mockVoid,
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, true);
  assert.equal(voidCalled, true, 'Void must be called for legacy PO');
  assert.equal(reversalCalled, false, 'Reversal must never be called for legacy PO');
  assert.equal(successCalls, 1, 'onSuccess must be called exactly once on successful legacy void');
});

test('executeBentaRestockReversalOrchestration: legacy PO + empty reason → void succeeds', async () => {
  let reversalCalled = false;
  let voidCalled = false;

  const mockSubmit = async () => {
    reversalCalled = true;
    return { reversalId: 'rev', purchaseOrderId: 'po', voidedAt: '', productCount: 0, paymentEffect: 'cash_refunded' as const, reversalVersion: 1 };
  };

  const mockVoid = async () => {
    voidCalled = true;
  };

  const result = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: LEGACY_PO_FIXTURE,
    reason: '',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: mockSubmit,
    voidPurchaseOrder: mockVoid,
  });

  assert.equal(result.success, true);
  assert.equal(voidCalled, true);
  assert.equal(reversalCalled, false);
});

test('executeBentaRestockReversalOrchestration: Smart reversal failure → never void, onSuccess zero', async () => {
  let voidCalled = false;
  let successCalls = 0;

  const mockSubmit = async () => {
    throw new RestockReversalError('Integrity error', 'INTEGRITY_ERROR', 409);
  };

  const mockVoid = async () => {
    voidCalled = true;
  };

  const result = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: SMART_PO_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: mockSubmit,
    voidPurchaseOrder: mockVoid,
    idempotencyKey: generateIdempotencyKey(),
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'INTEGRITY_ERROR');
  assert.equal(voidCalled, false, 'Void must not be called after Smart reversal failure');
  assert.equal(successCalls, 0, 'onSuccess must not be called on reversal failure');
});

test('executeBentaRestockReversalOrchestration: duplicate concurrent calls → one operation, second gets BUSY', async () => {
  let callCount = 0;
  let successCalls = 0;
  const lockRef = { current: false };

  const mockSubmit = async () => {
    callCount++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      reversalId: 'rev_test',
      purchaseOrderId: SMART_PO_FIXTURE.id,
      voidedAt: new Date().toISOString(),
      productCount: 1,
      paymentEffect: 'cash_refunded' as const,
      reversalVersion: 1,
    };
  };

  const key = generateIdempotencyKey();

  const [result1, result2] = await Promise.all([
    executeBentaRestockReversalOrchestration({
      tenantId: 'tenant_1',
      purchaseOrder: SMART_PO_FIXTURE,
      reason: 'Test void',
      uid: 'uid_1',
      userName: 'Test User',
      submitRestockReversal: mockSubmit,
      voidPurchaseOrder: createMockVoidPurchaseOrder(true),
      idempotencyKey: key,
      onSuccess: () => { successCalls++; },
      lockRef,
    }),
    executeBentaRestockReversalOrchestration({
      tenantId: 'tenant_1',
      purchaseOrder: SMART_PO_FIXTURE,
      reason: 'Test void',
      uid: 'uid_1',
      userName: 'Test User',
      submitRestockReversal: mockSubmit,
      voidPurchaseOrder: createMockVoidPurchaseOrder(true),
      idempotencyKey: key,
      onSuccess: () => { successCalls++; },
      lockRef,
    }),
  ]);

  assert.equal(callCount, 1, 'Submit must be called exactly once for concurrent calls');
  assert.equal(successCalls, 1, 'onSuccess must be called exactly once');
  assert.equal(result1.success, true, 'First call should succeed');
  assert.equal(result2.success, false, 'Second call should fail with BUSY');
  assert.equal(result2.error?.code, 'BUSY', 'Second call should return BUSY error');
});

test('executeBentaRestockReversalOrchestration: retry same key after retryable failure', async () => {
  let callCount = 0;
  let capturedKey = '';
  let successCalls = 0;

  const mockSubmit = async (options: { idempotencyKey: string }) => {
    callCount++;
    capturedKey = options.idempotencyKey;
    if (callCount === 1) {
      throw new RestockReversalError('Service unavailable', 'SERVICE_UNAVAILABLE', 503);
    }
    return {
      reversalId: 'rev_test',
      purchaseOrderId: SMART_PO_FIXTURE.id,
      voidedAt: new Date().toISOString(),
      productCount: 1,
      paymentEffect: 'cash_refunded' as const,
      reversalVersion: 1,
    };
  };

  const key = generateIdempotencyKey();

  const result1 = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: SMART_PO_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: mockSubmit,
    voidPurchaseOrder: createMockVoidPurchaseOrder(true),
    idempotencyKey: key,
    onSuccess: () => { successCalls++; },
  });

  assert.equal(callCount, 1);
  assert.equal(result1.success, false);
  assert.equal(result1.context.idempotencyKey, key, 'Context must contain provided key');
  assert.equal(result1.error?.isRetryable, true, 'SERVICE_UNAVAILABLE should be retryable');

  const result2 = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: SMART_PO_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: mockSubmit,
    voidPurchaseOrder: createMockVoidPurchaseOrder(true),
    idempotencyKey: key,
    onSuccess: () => { successCalls++; },
  });

  assert.equal(callCount, 2);
  assert.equal(result2.success, true);
  assert.equal(capturedKey, key, 'Same key must be reused on retry');
  assert.equal(successCalls, 1, 'onSuccess must be called once on successful retry');
});

test('executeBentaRestockReversalOrchestration: non-retryable failure clears attempt', async () => {
  let successCalls = 0;

  const mockSubmit = async () => {
    throw new RestockReversalError('Integrity error', 'INTEGRITY_ERROR', 409);
  };

  const result = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: SMART_PO_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: mockSubmit,
    voidPurchaseOrder: createMockVoidPurchaseOrder(true),
    idempotencyKey: generateIdempotencyKey(),
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'INTEGRITY_ERROR');
  assert.equal(result.error?.isRetryable, false, 'INTEGRITY_ERROR should not be retryable');
  assert.equal(successCalls, 0, 'onSuccess must not be called on non-retryable failure');
});

test('executeBentaRestockReversalOrchestration: GCash PO returns external_payment_unmodified warning', async () => {
  const mockSubmit = async () => {
    return {
      reversalId: 'rev_test',
      purchaseOrderId: GCASH_PO_FIXTURE.id,
      voidedAt: new Date().toISOString(),
      productCount: 1,
      paymentEffect: 'external_payment_unmodified',
      reversalVersion: 1,
    };
  };

  const result = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: GCASH_PO_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: mockSubmit,
    voidPurchaseOrder: createMockVoidPurchaseOrder(true),
    idempotencyKey: generateIdempotencyKey(),
  });

  assert.equal(result.success, true);
  assert.equal(result.receipt?.paymentEffect, 'external_payment_unmodified');
});

test('executeBentaRestockReversalOrchestration: Maya PO returns external_payment_unmodified warning', async () => {
  const mockSubmit = async () => {
    return {
      reversalId: 'rev_test',
      purchaseOrderId: MAYA_PO_FIXTURE.id,
      voidedAt: new Date().toISOString(),
      productCount: 1,
      paymentEffect: 'external_payment_unmodified',
      reversalVersion: 1,
    };
  };

  const result = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: MAYA_PO_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: mockSubmit,
    voidPurchaseOrder: createMockVoidPurchaseOrder(true),
    idempotencyKey: generateIdempotencyKey(),
  });

  assert.equal(result.success, true);
  assert.equal(result.receipt?.paymentEffect, 'external_payment_unmodified');
});

test('executeBentaRestockReversalOrchestration: INTEGRITY_ERROR never offers legacy fallback', async () => {
  let voidCalled = false;

  const mockSubmit = async () => {
    throw new RestockReversalError('Inventory changed since PO', 'INTEGRITY_ERROR', 409);
  };

  const mockVoid = async () => {
    voidCalled = true;
  };

  const result = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: SMART_PO_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: mockSubmit,
    voidPurchaseOrder: mockVoid,
    idempotencyKey: generateIdempotencyKey(),
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'INTEGRITY_ERROR');
  assert.equal(voidCalled, false, 'Legacy void must never be called after INTEGRITY_ERROR');
});

test('executeBentaRestockReversalOrchestration: Smart PO routes only to reversal', async () => {
  let voidCalled = false;

  const mockVoid = async () => {
    voidCalled = true;
  };

  await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: SMART_PO_FIXTURE,
    reason: 'Test',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: createMockSubmitRestockReversal(true),
    voidPurchaseOrder: mockVoid,
    idempotencyKey: generateIdempotencyKey(),
  });

  assert.equal(voidCalled, false, 'Smart PO must not route to legacy void');
});

test('executeBentaRestockReversalOrchestration: legacy PO routes only to void', async () => {
  let reversalCalled = false;

  const mockSubmit = async () => {
    reversalCalled = true;
    return { reversalId: 'rev', purchaseOrderId: 'po', voidedAt: '', productCount: 0, paymentEffect: 'cash_refunded' as const, reversalVersion: 1 };
  };

  await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: LEGACY_PO_FIXTURE,
    reason: '',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: mockSubmit,
    voidPurchaseOrder: createMockVoidPurchaseOrder(true),
  });

  assert.equal(reversalCalled, false, 'Legacy PO must not route to reversal');
});

test('executeBentaRestockReversalOrchestration: PO_NOT_REVERSIBLE error is non-retryable', async () => {
  let voidCalled = false;

  const mockSubmit = async () => {
    throw new RestockReversalError('PO not reversible', 'PO_NOT_REVERSIBLE', 409);
  };

  const mockVoid = async () => {
    voidCalled = true;
  };

  const result = await executeBentaRestockReversalOrchestration({
    tenantId: 'tenant_1',
    purchaseOrder: SMART_PO_FIXTURE,
    reason: 'Test',
    uid: 'uid_1',
    userName: 'Test User',
    submitRestockReversal: mockSubmit,
    voidPurchaseOrder: mockVoid,
    idempotencyKey: generateIdempotencyKey(),
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'PO_NOT_REVERSIBLE');
  assert.equal(result.error?.isRetryable, false);
  assert.equal(voidCalled, false, 'Void must never be called');
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
