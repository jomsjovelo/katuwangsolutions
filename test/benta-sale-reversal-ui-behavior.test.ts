import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBentaExactPoolCostedSale,
  BENTA_INVENTORY_COSTING_VERSION,
} from '../src/lib/shared/benta-sale-mutation-guard';
import {
  generateIdempotencyKey,
  isValidIdempotencyKey,
  validateReversalReason,
  SaleReversalError,
  type SaleReversalReceipt,
} from '../src/lib/client/benta-sale-reversal-client';
import {
  classifyBentaSaleVoid,
  executeBentaVoid,
} from '../src/lib/client/benta-void-orchestration';

const PROTECTED_SALE_FIXTURE = {
  id: 'sale_protected_001',
  costingVersion: 'moving_average_v1',
  items: [{ productId: 'prod_1', name: 'Item 1', price: 1000, quantity: 1 }],
  totalAmount: 1000,
  shiftId: 'shift_001',
  staffAccountId: 'staff_001',
  moduleId: 'benta-snap',
};

const LEGACY_SALE_FIXTURE = {
  id: 'sale_legacy_001',
  items: [{ productId: 'prod_1', name: 'Item 1', price: 1000, quantity: 1 }],
  totalAmount: 1000,
};

const PREMARKER_PROTECTED_FIXTURE = {
  id: 'sale_premarker_001',
  shiftId: 'shift_001',
  staffAccountId: 'staff_001',
  moduleId: 'benta-snap',
  items: [{ productId: 'prod_1', name: 'Item 1', price: 1000, quantity: 1, unitCostCentavos: 500 }],
};

const GENUINE_LEGACY_FIXTURE = {
  id: 'sale_genuine_legacy_001',
  moduleId: 'benta-snap',
  items: [{ productId: 'prod_1', name: 'Item 1', price: 1000, quantity: 1 }],
};

const PARTIAL_METADATA_FIXTURE = {
  id: 'sale_partial_001',
  moduleId: 'benta-snap',
  shiftId: 'shift_partial',
  items: [{ productId: 'prod_test', quantity: 1 }],
};

function createMockSubmitSaleReversal(shouldSucceed: boolean): (options: {tenantId: string; saleId: string; reason: string; idempotencyKey: string; token?: string}) => Promise<SaleReversalReceipt> {
  return async (options) => {
    if (!shouldSucceed) {
      throw new SaleReversalError('Test error', 'REVERSAL_INTEGRITY_ERROR', 409);
    }
    return {
      reversalId: 'rev_' + 'a'.repeat(56),
      saleId: options.saleId,
      voidedAt: new Date().toISOString(),
      paymentMethod: 'cash',
      productCount: 1,
      shiftStatus: 'open' as const,
      reversalVersion: 1,
    };
  };
}

function createMockDeleteSale(shouldSucceed: boolean): (tenantId: string, saleId: string, uid: string, userName: string) => Promise<void> {
  return async () => {
    if (!shouldSucceed) {
      throw new Error('Delete failed');
    }
  };
}

test('classifyBentaSaleVoid: explicit costingVersion is protected', () => {
  assert.equal(classifyBentaSaleVoid(PROTECTED_SALE_FIXTURE), true);
});

test('classifyBentaSaleVoid: complete pre-marker secure-cashier is protected', () => {
  assert.equal(classifyBentaSaleVoid(PREMARKER_PROTECTED_FIXTURE), true);
});

test('classifyBentaSaleVoid: partial secure metadata fails closed (protected)', () => {
  assert.equal(classifyBentaSaleVoid(PARTIAL_METADATA_FIXTURE), true, 'Partial secure metadata must be protected');
});

test('classifyBentaSaleVoid: genuine legacy is not protected', () => {
  assert.equal(classifyBentaSaleVoid(GENUINE_LEGACY_FIXTURE), false);
});

test('classifyBentaSaleVoid: legacy without secure metadata is not protected', () => {
  assert.equal(classifyBentaSaleVoid(LEGACY_SALE_FIXTURE), false);
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

test('executeBentaVoid: protected + valid UUID → reversal + onSuccess once', async () => {
  let reversalCalled = false;
  let deleteCalled = false;
  let successCalls = 0;

  const mockSubmit = async () => {
    reversalCalled = true;
    return {
      reversalId: 'rev_test',
      saleId: PROTECTED_SALE_FIXTURE.id,
      voidedAt: new Date().toISOString(),
      paymentMethod: 'cash',
      productCount: 1,
      shiftStatus: 'open' as const,
      reversalVersion: 1,
    };
  };

  const mockDelete = async () => {
    deleteCalled = true;
  };

  const result = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: PROTECTED_SALE_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: mockSubmit as any,
    deleteSale: mockDelete as any,
    idempotencyKey: generateIdempotencyKey(),
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, true);
  assert.equal(reversalCalled, true, 'Reversal must be called for protected sale');
  assert.equal(deleteCalled, false, 'Delete must never be called for protected sale');
  assert.equal(successCalls, 1, 'onSuccess must be called exactly once on successful reversal');
});

test('executeBentaVoid: protected + blank key → fails before dependencies run', async () => {
  let reversalCalled = false;
  let deleteCalled = false;
  let successCalls = 0;

  const result = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: PROTECTED_SALE_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: createMockSubmitSaleReversal(true) as any,
    deleteSale: createMockDeleteSale(true) as any,
    idempotencyKey: '',
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'INVALID_REQUEST');
  assert.equal(reversalCalled, false, 'Reversal must not be called with blank key');
  assert.equal(deleteCalled, false, 'Delete must not be called with blank key');
  assert.equal(successCalls, 0, 'onSuccess must not be called on validation failure');
});

test('executeBentaVoid: protected + malformed key → fails before dependencies run', async () => {
  let reversalCalled = false;
  let deleteCalled = false;
  let successCalls = 0;

  const result = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: PROTECTED_SALE_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: createMockSubmitSaleReversal(true) as any,
    deleteSale: createMockDeleteSale(true) as any,
    idempotencyKey: 'not-a-uuid',
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'INVALID_REQUEST');
  assert.equal(reversalCalled, false, 'Reversal must not be called with malformed key');
  assert.equal(deleteCalled, false, 'Delete must not be called with malformed key');
  assert.equal(successCalls, 0, 'onSuccess must not be called on validation failure');
});

test('executeBentaVoid: legacy without key → delete + onSuccess once', async () => {
  let reversalCalled = false;
  let deleteCalled = false;
  let successCalls = 0;

  const mockSubmit = async () => {
    reversalCalled = true;
    return { reversalId: 'rev', saleId: 'sale', voidedAt: '', paymentMethod: 'cash', productCount: 0, shiftStatus: 'open' as const, reversalVersion: 1 };
  };

  const mockDelete = async () => {
    deleteCalled = true;
  };

  const result = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: LEGACY_SALE_FIXTURE,
    reason: '',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: mockSubmit as any,
    deleteSale: mockDelete as any,
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, true);
  assert.equal(deleteCalled, true, 'Delete must be called for legacy sale');
  assert.equal(reversalCalled, false, 'Reversal must never be called for legacy sale');
  assert.equal(successCalls, 1, 'onSuccess must be called exactly once on successful legacy deletion');
});

test('executeBentaVoid: legacy + empty reason → delete succeeds', async () => {
  let reversalCalled = false;
  let deleteCalled = false;

  const mockSubmit = async () => {
    reversalCalled = true;
    return { reversalId: 'rev', saleId: 'sale', voidedAt: '', paymentMethod: 'cash', productCount: 0, shiftStatus: 'open' as const, reversalVersion: 1 };
  };

  const mockDelete = async () => {
    deleteCalled = true;
  };

  const result = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: LEGACY_SALE_FIXTURE,
    reason: '',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: mockSubmit as any,
    deleteSale: mockDelete as any,
  });

  assert.equal(result.success, true);
  assert.equal(deleteCalled, true);
  assert.equal(reversalCalled, false);
});

test('executeBentaVoid: protected + empty reason → fails before deps', async () => {
  let reversalCalled = false;
  let deleteCalled = false;
  let successCalls = 0;

  const result = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: PROTECTED_SALE_FIXTURE,
    reason: '',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: createMockSubmitSaleReversal(true) as any,
    deleteSale: createMockDeleteSale(true) as any,
    idempotencyKey: generateIdempotencyKey(),
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'INVALID_REQUEST');
  assert.equal(reversalCalled, false);
  assert.equal(deleteCalled, false);
  assert.equal(successCalls, 0);
});

test('executeBentaVoid: partial secure metadata (protected) → reversal + onSuccess once', async () => {
  let reversalCalled = false;
  let deleteCalled = false;
  let successCalls = 0;

  const mockSubmit = async () => {
    reversalCalled = true;
    return { reversalId: 'rev', saleId: 'sale', voidedAt: '', paymentMethod: 'cash', productCount: 0, shiftStatus: 'open' as const, reversalVersion: 1 };
  };

  const mockDelete = async () => {
    deleteCalled = true;
  };

  const result = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: PARTIAL_METADATA_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: mockSubmit as any,
    deleteSale: mockDelete as any,
    idempotencyKey: generateIdempotencyKey(),
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, true);
  assert.equal(reversalCalled, true);
  assert.equal(deleteCalled, false);
  assert.equal(successCalls, 1);
});

test('executeBentaVoid: reversal failure → never delete, onSuccess zero', async () => {
  let deleteCalled = false;
  let successCalls = 0;

  const mockSubmit = async () => {
    throw new SaleReversalError('Integrity error', 'REVERSAL_INTEGRITY_ERROR', 409);
  };

  const mockDelete = async () => {
    deleteCalled = true;
  };

  const result = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: PROTECTED_SALE_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: mockSubmit,
    deleteSale: mockDelete,
    idempotencyKey: generateIdempotencyKey(),
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'REVERSAL_INTEGRITY_ERROR');
  assert.equal(deleteCalled, false, 'Delete must not be called after reversal failure');
  assert.equal(successCalls, 0, 'onSuccess must not be called on reversal failure');
});

test('executeBentaVoid: duplicate concurrent calls → one operation, second gets BUSY', async () => {
  let callCount = 0;
  let successCalls = 0;
  const lockRef = { current: false };

  const mockSubmit = async () => {
    callCount++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      reversalId: 'rev_test',
      saleId: PROTECTED_SALE_FIXTURE.id,
      voidedAt: new Date().toISOString(),
      paymentMethod: 'cash',
      productCount: 1,
      shiftStatus: 'open' as const,
      reversalVersion: 1,
    };
  };

  const key = generateIdempotencyKey();

  const [result1, result2] = await Promise.all([
    executeBentaVoid({
      tenantId: 'tenant_1',
      sale: PROTECTED_SALE_FIXTURE,
      reason: 'Test void',
      uid: 'uid_1',
      userName: 'Test User',
      submitSaleReversal: mockSubmit as any,
      deleteSale: createMockDeleteSale(true) as any,
      idempotencyKey: key,
      onSuccess: () => { successCalls++; },
      lockRef,
    }),
    executeBentaVoid({
      tenantId: 'tenant_1',
      sale: PROTECTED_SALE_FIXTURE,
      reason: 'Test void',
      uid: 'uid_1',
      userName: 'Test User',
      submitSaleReversal: mockSubmit as any,
      deleteSale: createMockDeleteSale(true) as any,
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

test('executeBentaVoid: retry same key after retryable failure', async () => {
  let callCount = 0;
  let capturedKey = '';
  let successCalls = 0;

  const mockSubmit = async (options: { idempotencyKey: string }) => {
    callCount++;
    capturedKey = options.idempotencyKey;
    if (callCount === 1) {
      throw new SaleReversalError('Service unavailable', 'SERVICE_UNAVAILABLE', 503);
    }
    return {
      reversalId: 'rev_test',
      saleId: PROTECTED_SALE_FIXTURE.id,
      voidedAt: new Date().toISOString(),
      paymentMethod: 'cash',
      productCount: 1,
      shiftStatus: 'open' as const,
      reversalVersion: 1,
    };
  };

  const key = generateIdempotencyKey();

  const result1 = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: PROTECTED_SALE_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: mockSubmit as any,
    deleteSale: createMockDeleteSale(true) as any,
    idempotencyKey: key,
    onSuccess: () => { successCalls++; },
  });

  assert.equal(callCount, 1);
  assert.equal(result1.success, false);
  assert.equal(result1.context.idempotencyKey, key, 'Context must contain provided key');

  const result2 = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: PROTECTED_SALE_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: mockSubmit as any,
    deleteSale: createMockDeleteSale(true) as any,
    idempotencyKey: key,
    onSuccess: () => { successCalls++; },
  });

  assert.equal(callCount, 2);
  assert.equal(result2.success, true);
  assert.equal(capturedKey, key, 'Same key must be reused on retry');
  assert.equal(successCalls, 1, 'onSuccess must be called once on successful retry');
});

test('executeBentaVoid: invalid reason returns error without calling any endpoint', async () => {
  let reversalCalled = false;
  let deleteCalled = false;
  let successCalls = 0;

  const mockSubmit = async () => {
    reversalCalled = true;
    return { reversalId: 'rev', saleId: 'sale', voidedAt: '', paymentMethod: 'cash', productCount: 0, shiftStatus: 'open' as const, reversalVersion: 1 };
  };

  const mockDelete = async () => {
    deleteCalled = true;
  };

  const result = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: PROTECTED_SALE_FIXTURE,
    reason: '',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: mockSubmit as any,
    deleteSale: mockDelete as any,
    idempotencyKey: generateIdempotencyKey(),
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'INVALID_REQUEST');
  assert.equal(reversalCalled, false, 'Reversal must not be called with invalid reason');
  assert.equal(deleteCalled, false, 'Delete must not be called with invalid reason');
  assert.equal(successCalls, 0, 'onSuccess must not be called on validation failure');
});

test('executeBentaVoid: integrity failure → no legacy mutation, onSuccess zero', async () => {
  let deleteCalled = false;
  let successCalls = 0;

  const mockSubmit = async () => {
    throw new SaleReversalError('Integrity error', 'REVERSAL_INTEGRITY_ERROR', 409);
  };

  const mockDelete = async () => {
    deleteCalled = true;
  };

  const result = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: PROTECTED_SALE_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: mockSubmit as any,
    deleteSale: mockDelete as any,
    idempotencyKey: generateIdempotencyKey(),
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'REVERSAL_INTEGRITY_ERROR');
  assert.equal(deleteCalled, false, 'No legacy mutation should occur on integrity failure');
  assert.equal(successCalls, 0, 'onSuccess must not be called on integrity failure');
});

test('executeBentaVoid: replay receipt → onSuccess once', async () => {
  let successCalls = 0;

  const mockSubmit = async () => {
    return {
      reversalId: 'rev_replay',
      saleId: PROTECTED_SALE_FIXTURE.id,
      voidedAt: new Date().toISOString(),
      paymentMethod: 'cash',
      productCount: 1,
      shiftStatus: 'open' as const,
      reversalVersion: 1,
    };
  };

  const result = await executeBentaVoid({
    tenantId: 'tenant_1',
    sale: PROTECTED_SALE_FIXTURE,
    reason: 'Test void',
    uid: 'uid_1',
    userName: 'Test User',
    submitSaleReversal: mockSubmit as any,
    deleteSale: createMockDeleteSale(true) as any,
    idempotencyKey: generateIdempotencyKey(),
    onSuccess: () => { successCalls++; },
  });

  assert.equal(result.success, true);
  assert.equal(successCalls, 1, 'onSuccess must be called exactly once on replay receipt');
});

test('validateReversalReason: blank reason is rejected', () => {
  const result = validateReversalReason('');
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.message.includes('Kailangan'));
  }
});

test('validateReversalReason: control characters are rejected', () => {
  const result = validateReversalReason('Test\x00NUL');
  assert.equal(result.valid, false, 'NUL character should be rejected');
  const lf = validateReversalReason('Test\nLF');
  assert.equal(lf.valid, false, 'LF should be rejected');
  const tab = validateReversalReason('Test\tTab');
  assert.equal(tab.valid, false, 'Tab should be rejected');
});

test('validateReversalReason: reason over 500 chars is rejected', () => {
  const result = validateReversalReason('a'.repeat(501));
  assert.equal(result.valid, false, 'Reason over 500 chars should be rejected');
});

test('validateReversalReason: valid reason is accepted and trimmed', () => {
  const result = validateReversalReason('  Customer return  ');
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.value, 'Customer return', 'Reason should be trimmed');
  }
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

test('BENTA_INVENTORY_COSTING_VERSION constant is moving_average_v1', () => {
  assert.equal(BENTA_INVENTORY_COSTING_VERSION, 'moving_average_v1');
});
