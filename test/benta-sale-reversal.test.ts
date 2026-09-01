import test from 'node:test';
import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';
import {
  executeBentaSaleReversal,
  validateReversalRequest,
  reversalIdDocumentId,
  reversalIdempotencyDocumentId,
  reversalFingerprint,
  compensatingLedgerId,
  inventoryMovementId,
  auditEventId,
  createSaleReversalRouteHandler,
  ReversalError,
  ReversalErrorCode,
  REVERSAL_VERSION,
  BENTA_SNAP_MODULE_ID,
  type SaleReversalRequest,
  type ReversalServiceOptions,
} from '../src/lib/server/benta-sale-reversal';

// ============================================================
// In-memory Firestore double with real transaction semantics
// ============================================================

interface StoredDoc {
  data: Record<string, unknown>;
  exists: boolean;
}

interface QueryFilter {
  field: string;
  op: '==';
  value: unknown;
}

class MockQuery {
  collectionPath: string;
  filters: QueryFilter[];
  constructor(collectionPath: string, filters: QueryFilter[]) {
    this.collectionPath = collectionPath;
    this.filters = filters;
  }
}

interface MockDocSnapshot {
  id: string;
  ref: MockDocRef;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

interface MockQuerySnapshot {
  docs: MockDocSnapshot[];
}

class MockFirestore {
  docs = new Map<string, StoredDoc>(); // path -> doc
  writeCount = { create: 0, update: 0, set: 0 };
  readAfterWriteDetected = false;
  lastTransactionWriteCount = 0;
  transactionReadCount = 0;
  transactionWriteCount = 0;
  retryCount = 0;

  set(path: string, data: Record<string, unknown>, opts?: { merge?: boolean }): void {
    const existing = this.docs.get(path);
    if (opts?.merge && existing && existing.exists) {
      this.docs.set(path, { exists: true, data: { ...existing.data, ...data } });
    } else {
      this.docs.set(path, { exists: true, data: { ...data } });
    }
  }

  get(path: string): StoredDoc {
    const d = this.docs.get(path);
    if (!d || !d.exists) return { exists: false, data: {} };
    return { exists: true, data: { ...d.data } };
  }

  exists(path: string): boolean {
    const d = this.docs.get(path);
    return !!d && d.exists;
  }
}

class MockCollectionRef {
  constructor(public path: string, public firestore: MockFirestore) {}
  doc(id?: string): MockDocRef {
    const docId = id || `auto_${Math.random().toString(36).slice(2, 10)}`;
    const fullPath = `${this.path}/${docId}`;
    return new MockDocRef(fullPath, this.firestore);
  }
  where(field: string, op: '==', value: unknown): MockQuery {
    return new MockQuery(this.path, [{ field, op, value }]);
  }
}

class MockDocRef {
  constructor(public path: string, public firestore: MockFirestore) {}

  get parent(): MockCollectionRef {
    const parts = this.path.split('/');
    parts.pop();
    return new MockCollectionRef(parts.join('/'), this.firestore);
  }

  collection(name: string): MockCollectionRef {
    return new MockCollectionRef(`${this.path}/${name}`, this.firestore);
  }

  get id(): string {
    return this.path.split('/').pop() || '';
  }
}

interface StagedWrite {
  type: 'create' | 'update' | 'set';
  ref: MockDocRef;
  data: Record<string, unknown>;
  opts?: { merge?: boolean };
}

class MockTransaction {
  stagedWrites = new Map<string, StagedWrite>();
  hasWritten = false;
  firestore: MockFirestore;

  constructor(firestore: MockFirestore) {
    this.firestore = firestore;
  }

  _checkReadAfterWrite(): void {
    if (this.hasWritten) {
      this.firestore.readAfterWriteDetected = true;
    }
  }

  getAll(...refs: MockDocRef[]): MockDocSnapshot[] {
    this._checkReadAfterWrite();
    return refs.map((ref) => {
      this.firestore.transactionReadCount++;
      const path = ref && ref.path ? ref.path : '';
      const stored = this.firestore.get(path);
      return {
        id: ref.id,
        ref,
        exists: stored.exists,
        data: () => (stored.exists ? { ...stored.data } : undefined),
      };
    });
  }

  get(ref: MockDocRef): MockDocSnapshot;
  get(query: MockQuery): MockQuerySnapshot;
  get(arg: MockDocRef | MockQuery): MockDocSnapshot | MockQuerySnapshot {
    this._checkReadAfterWrite();
    if (arg instanceof MockQuery) {
      this.firestore.transactionReadCount++;
      const results: MockDocSnapshot[] = [];
      const prefix = `${arg.collectionPath}/`;
      for (const [path, doc] of this.firestore.docs) {
        if (!doc.exists) continue;
        if (!path.startsWith(prefix)) continue;
        const remainder = path.slice(prefix.length);
        if (remainder.includes('/')) continue; // Ensure direct child of collection

        const matches = arg.filters.every((f: QueryFilter) => {
          const val = doc.data[f.field];
          return val === f.value;
        });
        if (matches) {
          const ref = new MockDocRef(path, this.firestore);
          results.push({
            id: ref.id,
            ref,
            exists: true,
            data: () => ({ ...doc.data }),
          });
        }
      }
      return { docs: results };
    }

    // It's a MockDocRef
    this.firestore.transactionReadCount++;
    const path = arg.path || '';
    const stored = this.firestore.get(path);
    return {
      id: arg.id,
      ref: arg,
      exists: stored.exists,
      data: () => (stored.exists ? { ...stored.data } : undefined),
    };
  }

  getAllFromQuery(query: MockQuery): MockDocSnapshot[] {
    this._checkReadAfterWrite();
    const results: MockDocSnapshot[] = [];
    const prefix = `${query.collectionPath}/`;
    for (const [path, doc] of this.firestore.docs) {
      if (!doc.exists) continue;
      if (!path.startsWith(prefix)) continue;
      const remainder = path.slice(prefix.length);
      if (remainder.includes('/')) continue;

      const matches = query.filters.every((f) => {
        const val = doc.data[f.field];
        return val === f.value;
      });
      if (matches) {
        const ref = new MockDocRef(path, this.firestore);
        results.push({
          id: ref.id,
          ref,
          exists: true,
          data: () => ({ ...doc.data }),
        });
      }
    }
    this.firestore.transactionReadCount++;
    return results;
  }

  create(ref: MockDocRef, data: Record<string, unknown>): void {
    this.hasWritten = true;
    if (this.firestore.exists(ref.path) || this.stagedWrites.has(ref.path)) {
      throw new Error('Document already exists at: ' + ref.path);
    }
    this.stagedWrites.set(ref.path, { type: 'create', ref, data });
  }

  update(ref: MockDocRef, data: Record<string, unknown>): void {
    this.hasWritten = true;
    const existsInStore = this.firestore.exists(ref.path);
    const staged = this.stagedWrites.get(ref.path);
    if (!existsInStore && (!staged || staged.type !== 'create')) {
      throw new Error('Document does not exist at: ' + ref.path);
    }
    this.stagedWrites.set(ref.path, { type: 'update', ref, data });
  }

  set(ref: MockDocRef, data: Record<string, unknown>, opts?: { merge?: boolean }): void {
    this.hasWritten = true;
    this.stagedWrites.set(ref.path, { type: 'set', ref, data, opts });
  }

  commit(): void {
    // PREFLIGHT: check all staged creates and updates before applying any writes
    for (const [path, op] of this.stagedWrites) {
      if (op.type === 'create') {
        if (this.firestore.exists(path)) {
          throw new Error('Document already exists at: ' + path);
        }
      } else if (op.type === 'update') {
        if (!this.firestore.exists(path)) {
          throw new Error('Document does not exist at: ' + path);
        }
      }
    }

    for (const [path, op] of this.stagedWrites) {
      if (op.type === 'create') {
        this.firestore.writeCount.create++;
        this.firestore.transactionWriteCount++;
        this.firestore.set(path, op.data);
      } else if (op.type === 'update') {
        this.firestore.writeCount.update++;
        this.firestore.transactionWriteCount++;
        const existing = this.firestore.get(path);
        this.firestore.set(path, { ...existing.data, ...op.data });
      } else if (op.type === 'set') {
        this.firestore.writeCount.set++;
        this.firestore.transactionWriteCount++;
        this.firestore.set(path, op.data, op.opts);
      }
    }
    this.firestore.lastTransactionWriteCount = this.stagedWrites.size;
  }
}

interface MockAuth {
  verifyIdToken: (token: string) => Promise<admin.auth.DecodedIdToken>;
}

function createMockAuth(uid: string, validTokens: readonly string[] = [OWNER_TOKEN]): MockAuth {
  return {
    verifyIdToken: async (token: string) => {
      if (!validTokens.includes(token)) {
        const err = new Error('Invalid token');
        Object.assign(err, { code: 'auth/argument-error' });
        throw err;
      }
      return {
        uid,
        aud: 'test',
        auth_time: 0,
        exp: 9999999999,
        firebase: { identities: {}, sign_in_provider: 'custom' },
        iat: 0,
        iss: 'test',
        sub: uid,
      } as unknown as admin.auth.DecodedIdToken;
    },
  };
}

function createMockFirestore(): MockFirestore {
  return new MockFirestore();
}

function createMockFirestoreClient(firestore: MockFirestore): admin.firestore.Firestore {
  return {
    collection(name: string): MockCollectionRef {
      return new MockCollectionRef(name, firestore);
    },
    runTransaction: async <T>(fn: (txn: MockTransaction) => Promise<T>): Promise<T> => {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        const txn = new MockTransaction(firestore);
        try {
          const result = await fn(txn);
          txn.commit();
          return result;
        } catch (err) {
          lastErr = err;
          if (err instanceof Error && err.message.includes('Document already exists at:')) {
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    },
  } as unknown as admin.firestore.Firestore;
}

// ============================================================
// Test fixture builders
// ============================================================

const VALID_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const VALID_UUID_2 = 'b47ac10b-58cc-4372-a567-0e02b2c3d479';
const OWNER_UID = 'owner_uid_001';
const OWNER_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.differentFromUid.payload';
const TENANT_ID = 'tenant_test_001';
const SALE_ID = 'sale_test_001';
const SHIFT_ID = 'shift_test_001';
const PRODUCT_A = 'prod_a';
const PRODUCT_B = 'prod_b';
const ACCOUNT_ID = 'master-cash';

function makeTimestamp(): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromMillis(1700000000000);
}

function seedTenant(firestore: MockFirestore, overrides: Record<string, unknown> = {}): void {
  firestore.set(`tenants/${TENANT_ID}`, {
    ownerUid: OWNER_UID,
    subscriptionStatus: 'active',
    moduleType: BENTA_SNAP_MODULE_ID,
    ...overrides,
  });
}

function seedSale(firestore: MockFirestore, overrides: Record<string, unknown> = {}): void {
  firestore.set(`tenants/${TENANT_ID}/sales/${SALE_ID}`, {
    tenantId: TENANT_ID,
    moduleId: BENTA_SNAP_MODULE_ID,
    shiftId: SHIFT_ID,
    staffAccountId: 'staff_001',
    items: [
      {
        productId: PRODUCT_A,
        quantity: 2,
        price: 5000,
        lineTotal: 10000,
        lineCostCentavos: 6000,
      },
    ],
    subtotalAmount: 10000,
    discountAmount: 0,
    totalAmount: 10000,
    paymentMethod: 'cash',
    transactionDate: makeTimestamp(),
    createdAt: makeTimestamp(),
    costingVersion: 'moving_average_v1',
    ...overrides,
  });
}

function seedProduct(firestore: MockFirestore, productId: string, overrides: Record<string, unknown> = {}): void {
  firestore.set(`tenants/${TENANT_ID}/products/${productId}`, {
    tenantId: TENANT_ID,
    name: `Product ${productId}`,
    unit: 'pc',
    currentStock: 5,
    costPrice: 3000,
    salePrice: 5000,
    isActive: true,
    inventoryValueCentavos: 15000,
    averageUnitCostCentavos: 3000,
    ...overrides,
  });
}

function seedShift(firestore: MockFirestore, overrides: Record<string, unknown> = {}): void {
  firestore.set(`tenants/${TENANT_ID}/shifts/${SHIFT_ID}`, {
    tenantId: TENANT_ID,
    status: 'open',
    reconciliationVersion: 1,
    startingCash: 5000,
    cashSales: 10000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 10000,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
    staffId: 'staff_staff_001',
    staffAccountId: 'staff_001',
    openedBy: 'staff_staff_001',
    moduleId: BENTA_SNAP_MODULE_ID,
    ...overrides,
  });
}

function seedAccount(firestore: MockFirestore, balance: number, overrides: Record<string, unknown> = {}): void {
  firestore.set(`tenants/${TENANT_ID}/accounts/${ACCOUNT_ID}`, {
    tenantId: TENANT_ID,
    name: 'Main Cash',
    type: 'asset',
    balance,
    isActive: true,
    ...overrides,
  });
}

function seedIncomeLedger(firestore: MockFirestore, overrides: Record<string, unknown> = {}): void {
  const ledgerId = 'ledger_income_001';
  firestore.set(`tenants/${TENANT_ID}/transactions/${ledgerId}`, {
    tenantId: TENANT_ID,
    accountId: ACCOUNT_ID,
    amount: 10000,
    type: 'income',
    category: 'Sales',
    saleId: SALE_ID,
    shiftId: SHIFT_ID,
    paymentMethod: 'cash',
    date: makeTimestamp(),
    createdAt: makeTimestamp(),
    ...overrides,
  });
  return ledgerId;
}

function buildRequest(overrides: Partial<SaleReversalRequest> = {}): SaleReversalRequest {
  return {
    saleId: SALE_ID,
    idempotencyKey: VALID_UUID,
    reason: 'Customer returned defective item',
    ...overrides,
  };
}

function buildServiceOptions(firestore: MockFirestore, uid = OWNER_UID): ReversalServiceOptions {
  return {
    adminAuth: createMockAuth(uid) as unknown as admin.auth.Auth,
    adminFirestore: createMockFirestoreClient(firestore),
    now: () => makeTimestamp(),
  };
}

function seedCompleteFixture(firestore: MockFirestore, saleOverrides: Record<string, unknown> = {}): void {
  seedTenant(firestore);
  seedSale(firestore, saleOverrides);
  seedProduct(firestore, PRODUCT_A);
  seedShift(firestore);
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore);
}

// ============================================================
// Validation tests
// ============================================================

test('validateReversalRequest: accepts valid request', () => {
  const result = validateReversalRequest({
    saleId: SALE_ID,
    idempotencyKey: VALID_UUID,
    reason: 'Customer returned',
  });
  assert.equal(result.saleId, SALE_ID);
  assert.equal(result.idempotencyKey, VALID_UUID);
  assert.equal(result.reason, 'Customer returned');
});

test('validateReversalRequest: rejects extra body keys including tenantId', () => {
  assert.throws(
    () => validateReversalRequest({
      saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: 'x', tenantId: TENANT_ID,
    }),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.INVALID_REQUEST,
  );
});

test('validateReversalRequest: rejects non-UUID v4 keys (v1)', () => {
  assert.throws(
    () => validateReversalRequest({
      saleId: SALE_ID, idempotencyKey: 'f47ac10b-58cc-1372-a567-0e02b2c3d479', reason: 'x',
    }),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.INVALID_REQUEST,
  );
});

test('validateReversalRequest: rejects non-UUID v4 keys (v3)', () => {
  assert.throws(
    () => validateReversalRequest({
      saleId: SALE_ID, idempotencyKey: 'f47ac10b-58cc-3372-a567-0e02b2c3d479', reason: 'x',
    }),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.INVALID_REQUEST,
  );
});

test('validateReversalRequest: rejects non-UUID v4 keys (v5)', () => {
  assert.throws(
    () => validateReversalRequest({
      saleId: SALE_ID, idempotencyKey: 'f47ac10b-58cc-5372-a567-0e02b2c3d479', reason: 'x',
    }),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.INVALID_REQUEST,
  );
});

test('validateReversalRequest: accepts genuine UUID v4', () => {
  const result = validateReversalRequest({
    saleId: SALE_ID,
    idempotencyKey: 'f47ac10b-58cc-4272-a567-0e02b2c3d479',
    reason: 'x',
  });
  assert.equal(result.idempotencyKey, 'f47ac10b-58cc-4272-a567-0e02b2c3d479');
});

test('validateReversalRequest: rejects empty reason', () => {
  assert.throws(
    () => validateReversalRequest({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: '' }),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.INVALID_REQUEST,
  );
});

test('validateReversalRequest: rejects reason over 500 chars', () => {
  assert.throws(
    () => validateReversalRequest({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: 'a'.repeat(501) }),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.INVALID_REQUEST,
  );
});

test('validateReversalRequest: rejects control characters', () => {
  assert.throws(
    () => validateReversalRequest({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: 'ok\u0000bad' }),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.INVALID_REQUEST,
  );
});

test('validateReversalRequest: rejects horizontal tab (\\t)', () => {
  assert.throws(
    () => validateReversalRequest({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: 'Defective\tItem' }),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.INVALID_REQUEST,
  );
});

test('validateReversalRequest: rejects line feed (\\n)', () => {
  assert.throws(
    () => validateReversalRequest({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: 'Defective\nItem' }),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.INVALID_REQUEST,
  );
});

test('validateReversalRequest: rejects carriage return (\\r)', () => {
  assert.throws(
    () => validateReversalRequest({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: 'Defective\rItem' }),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.INVALID_REQUEST,
  );
});

test('validateReversalRequest: trims reason whitespace', () => {
  const result = validateReversalRequest({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: '  trimmed  ' });
  assert.equal(result.reason, 'trimmed');
});

// ============================================================
// Helper function tests
// ============================================================

test('reversalIdDocumentId: deterministic SHA-256', () => {
  const id1 = reversalIdDocumentId(TENANT_ID, SALE_ID);
  const id2 = reversalIdDocumentId(TENANT_ID, SALE_ID);
  assert.equal(id1, id2);
  assert.equal(id1.length, 64);
});

test('reversalIdempotencyDocumentId: includes tenantId, ownerUid, and key', () => {
  const id1 = reversalIdempotencyDocumentId(TENANT_ID, OWNER_UID, VALID_UUID);
  const id2 = reversalIdempotencyDocumentId(TENANT_ID, OWNER_UID, VALID_UUID_2);
  const id3 = reversalIdempotencyDocumentId(TENANT_ID, 'other_owner', VALID_UUID);
  const id4 = reversalIdempotencyDocumentId('other_tenant', OWNER_UID, VALID_UUID);
  assert.notEqual(id1, id2, 'different key');
  assert.notEqual(id1, id3, 'different owner');
  assert.notEqual(id1, id4, 'different tenant');
  assert.equal(id1.length, 64);
});

test('compensatingLedgerId: deterministic', () => {
  const id = compensatingLedgerId(TENANT_ID, SALE_ID);
  assert.equal(id, compensatingLedgerId(TENANT_ID, SALE_ID));
  assert.equal(id.length, 64);
});

test('inventoryMovementId: per-product', () => {
  const a = inventoryMovementId(TENANT_ID, SALE_ID, PRODUCT_A);
  const b = inventoryMovementId(TENANT_ID, SALE_ID, PRODUCT_B);
  assert.notEqual(a, b);
});

test('auditEventId: 32 chars', () => {
  const id = auditEventId(TENANT_ID, 'reversal_abc');
  assert.equal(id.length, 32);
});

test('reversalFingerprint: changes with reason', () => {
  const f1 = reversalFingerprint(TENANT_ID, SALE_ID, 'reason a');
  const f2 = reversalFingerprint(TENANT_ID, SALE_ID, 'reason b');
  assert.notEqual(f1, f2);
});

// ============================================================
// Authentication tests
// ============================================================

test('authentication: valid token with different text and decoded UID succeeds', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  assert.equal(result.reversalId, reversalIdDocumentId(TENANT_ID, SALE_ID));
  assert.equal(result.paymentMethod, 'cash');
  assert.equal(result.productCount, 1);
});

test('authentication: wrong token rejected with zero writes', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  const beforeWrites = firestore.transactionWriteCount;

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, 'invalid.token', buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.AUTHENTICATION_REQUIRED,
  );

  assert.equal(firestore.transactionWriteCount, beforeWrites, 'zero writes');
});

test('authentication: wrong owner rejected with zero writes', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore); // owner is OWNER_UID
  seedSale(firestore);
  seedProduct(firestore, PRODUCT_A);
  seedShift(firestore);
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore);

  const beforeWrites = firestore.transactionWriteCount;

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(),
      buildServiceOptions(firestore, 'different_owner'),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.FORBIDDEN,
  );

  assert.equal(firestore.transactionWriteCount, beforeWrites, 'zero writes');
});

// ============================================================
// Sale reversibility tests
// ============================================================

test('sale reversibility: marker direct discrete reversal', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore, { costingVersion: 'moving_average_v1' });

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  assert.equal(result.productCount, 1);
  // Product should be restored: was 5, sold 2, so 7
  const productDoc = firestore.get(`tenants/${TENANT_ID}/products/${PRODUCT_A}`);
  assert.equal(productDoc.data.currentStock, 7);
  // Account: was 50000, minus 10000 = 40000
  const accountDoc = firestore.get(`tenants/${TENANT_ID}/accounts/${ACCOUNT_ID}`);
  assert.equal(accountDoc.data.balance, 40000);
});

test('sale reversibility: marker measured reversal', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore, {
    costingVersion: 'moving_average_v1',
    items: [{
      productId: PRODUCT_A,
      quantity: 1,
      quantityMode: 'measured',
      quantityMinor: 1500,
      quantityScale: 3,
      sellingUnit: 'kg',
      price: 10000,
      lineTotal: 10000,
      lineCostCentavos: 6000,
    }],
    totalAmount: 10000,
  });
  seedProduct(firestore, PRODUCT_A, {
    quantityMode: 'measured',
    currentStock: 0,
    stockQuantityMinor: 3000,
    quantityScale: 3,
    sellingUnit: 'kg',
    inventoryValueCentavos: 9000,
    averageUnitCostCentavos: 3000,
    costPrice: 3000,
  });
  seedShift(firestore);
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore);

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  assert.equal(result.productCount, 1);
  // Was 3000, added 1500, now 4500
  const productDoc = firestore.get(`tenants/${TENANT_ID}/products/${PRODUCT_A}`);
  assert.equal(productDoc.data.stockQuantityMinor, 4500);
});

test('sale reversibility: genuine pre-marker without marker', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore, {
    costingVersion: undefined,
    items: [{
      productId: PRODUCT_A,
      quantity: 2,
      lineCostCentavos: 6000,
    }],
  });

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  assert.equal(result.productCount, 1);
});

test('sale reversibility: ordinary legacy rejected', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore, {
    moduleId: 'retail',
    items: [{ productId: PRODUCT_A, quantity: 1, costPrice: 1000 }],
  });
  seedProduct(firestore, PRODUCT_A);
  seedShift(firestore);
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore);

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.SALE_NOT_REVERSIBLE,
  );
});

test('sale reversibility: absent status accepted as completed', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore, { status: undefined });
  seedProduct(firestore, PRODUCT_A);
  seedShift(firestore);
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore);

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  assert.equal(result.productCount, 1);
});

// ============================================================
// Aggregation tests
// ============================================================

test('aggregation: duplicate product lines aggregate to one update/movement', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore, {
    items: [
      { productId: PRODUCT_A, quantity: 1, lineCostCentavos: 3000 },
      { productId: PRODUCT_A, quantity: 2, lineCostCentavos: 6000 },
    ],
    totalAmount: 15000,
  });
  seedProduct(firestore, PRODUCT_A);
  seedShift(firestore, { cashSales: 15000, totalShiftSales: 15000 });
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore, { amount: 15000 });

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  assert.equal(result.productCount, 1, 'one product restored');
  // Verify only one movement doc exists
  let movementCount = 0;
  for (const path of firestore.docs.keys()) {
    if (path.includes('inventory_transactions/')) {
      movementCount++;
    }
  }
  assert.equal(movementCount, 1, 'one movement document');
  // Product: was 5, added 3 (1+2) -> 8
  const productDoc = firestore.get(`tenants/${TENANT_ID}/products/${PRODUCT_A}`);
  assert.equal(productDoc.data.currentStock, 8);
});

test('aggregation: direct inventory relief equals line COGS', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore, {
    items: [
      { productId: PRODUCT_A, quantity: 1, lineCostCentavos: 3000 },
      { productId: PRODUCT_B, quantity: 2, lineCostCentavos: 4000 },
    ],
    totalAmount: 14000,
  });
  seedProduct(firestore, PRODUCT_A);
  seedProduct(firestore, PRODUCT_B);
  seedShift(firestore, { cashSales: 14000, totalShiftSales: 14000 });
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore, { amount: 14000 });

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  assert.equal(result.productCount, 2);
  const movA = firestore.get(`tenants/${TENANT_ID}/inventory_transactions/${inventoryMovementId(TENANT_ID, SALE_ID, PRODUCT_A)}`);
  const movB = firestore.get(`tenants/${TENANT_ID}/inventory_transactions/${inventoryMovementId(TENANT_ID, SALE_ID, PRODUCT_B)}`);
  assert.equal(movA.data.lineCostCentavos, 3000);
  assert.equal(movA.data.actualInventoryReliefCentavos, 3000);
  assert.equal(movB.data.lineCostCentavos, 4000);
  assert.equal(movB.data.actualInventoryReliefCentavos, 4000);
});

test('aggregation: offline partial application', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore, {
    isOfflineSync: true,
    items: [{
      productId: PRODUCT_A,
      quantity: 5,
      lineCostCentavos: 20000,
      appliedQuantity: 1,
      unappliedQuantity: 4,
      inventoryCostReliefCentavos: 4000,
      costVarianceCentavos: 16000,
    }],
    totalAmount: 10000,
  });
  seedProduct(firestore, PRODUCT_A);
  seedShift(firestore);
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore, { amount: 10000 });

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  // Only applied quantity is restored (1, not 5)
  const productDoc = firestore.get(`tenants/${TENANT_ID}/products/${PRODUCT_A}`);
  assert.equal(productDoc.data.currentStock, 6); // 5 + 1
});

test('aggregation: offline zero-variance still uses offline semantics', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore, {
    isOfflineSync: true,
    items: [{
      productId: PRODUCT_A,
      quantity: 2,
      lineCostCentavos: 6000,
      appliedQuantity: 2,
      unappliedQuantity: 0,
      inventoryCostReliefCentavos: 6000,
      costVarianceCentavos: 0,
    }],
    totalAmount: 10000,
  });
  seedProduct(firestore, PRODUCT_A);
  seedShift(firestore);
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore, { amount: 10000 });

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  assert.equal(result.productCount, 1);
  // Verify the movement has offline fields
  const mov = firestore.get(`tenants/${TENANT_ID}/inventory_transactions/${inventoryMovementId(TENANT_ID, SALE_ID, PRODUCT_A)}`);
  assert.equal(mov.data.signedVarianceCentavos, 0);
  assert.equal(mov.data.actualInventoryReliefCentavos, 6000);
});

test('aggregation: negative variance', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore, {
    isOfflineSync: true,
    items: [{
      productId: PRODUCT_A,
      quantity: 1,
      lineCostCentavos: 2000,
      appliedQuantity: 1,
      unappliedQuantity: 0,
      inventoryCostReliefCentavos: 3000,
      costVarianceCentavos: -1000,
    }],
    totalAmount: 10000,
  });
  seedProduct(firestore, PRODUCT_A);
  seedShift(firestore);
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore, { amount: 10000 });

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  assert.equal(result.productCount, 1);
  const productDoc = firestore.get(`tenants/${TENANT_ID}/products/${PRODUCT_A}`);
  assert.equal(productDoc.data.currentStock, 6);
});

test('aggregation: unapplied-only missing product succeeds financially', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore, {
    isOfflineSync: true,
    items: [{
      productId: 'prod_missing',
      quantity: 10,
      lineCostCentavos: 50000,
      appliedQuantity: 0,
      unappliedQuantity: 10,
      inventoryCostReliefCentavos: 0,
      costVarianceCentavos: 50000,
    }],
    totalAmount: 10000,
  });
  // Note: NO product seeded for prod_missing
  seedShift(firestore);
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore, { amount: 10000 });

  const beforeProductReads = firestore.transactionReadCount;
  const beforeWrites = firestore.transactionWriteCount;

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  assert.equal(result.productCount, 0, 'no product count for unapplied-only');
  // Financial reversal still happens
  const accountDoc = firestore.get(`tenants/${TENANT_ID}/accounts/${ACCOUNT_ID}`);
  assert.equal(accountDoc.data.balance, 40000);
  // No movement for missing product
  assert.equal(firestore.exists(`tenants/${TENANT_ID}/inventory_transactions/${inventoryMovementId(TENANT_ID, SALE_ID, 'prod_missing')}`), false);
});

test('aggregation: applied zero with nonzero inventory relief rejected', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore, {
    isOfflineSync: true,
    items: [{
      productId: PRODUCT_A,
      quantity: 5,
      lineCostCentavos: 10000,
      appliedQuantity: 0,
      unappliedQuantity: 5,
      inventoryCostReliefCentavos: 5000,
      costVarianceCentavos: 5000,
    }],
    totalAmount: 10000,
  });
  seedProduct(firestore, PRODUCT_A);
  seedShift(firestore);
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore, { amount: 10000 });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.SALE_NOT_REVERSIBLE,
  );
});

test('aggregation: offline sale with direct-shaped line rejected', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore, {
    isOfflineSync: true,
    items: [{ productId: PRODUCT_A, quantity: 1, lineCostCentavos: 3000 }], // missing offline fields
  });
  seedProduct(firestore, PRODUCT_A);
  seedShift(firestore);
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore);

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.SALE_NOT_REVERSIBLE,
  );
});

test('aggregation: direct sale with offline metadata rejected', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore, {
    isOfflineSync: undefined,
    items: [{
      productId: PRODUCT_A,
      quantity: 1,
      lineCostCentavos: 3000,
      appliedQuantity: 1,
      unappliedQuantity: 0,
      inventoryCostReliefCentavos: 3000,
      costVarianceCentavos: 0,
    }],
  });
  seedProduct(firestore, PRODUCT_A);
  seedShift(firestore);
  seedAccount(firestore, 50000);
  seedIncomeLedger(firestore);

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.SALE_NOT_REVERSIBLE,
  );
});

test('aggregation: malformed product position gives zero writes', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  // Set product to have malformed position
  firestore.set(`tenants/${TENANT_ID}/products/${PRODUCT_A}`, {
    tenantId: TENANT_ID,
    name: 'Prod A',
    unit: 'pc',
    currentStock: 5,
    costPrice: 0,
    salePrice: 5000,
    isActive: true,
    inventoryValueCentavos: 15000,
    averageUnitCostCentavos: 0, // inconsistent
  });

  const beforeWrites = firestore.transactionWriteCount;

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.SALE_NOT_REVERSIBLE,
  );

  assert.equal(firestore.transactionWriteCount, beforeWrites, 'zero writes');
});

// ============================================================
// Ledger tests
// ============================================================

test('ledger: missing income ledger', async () => {
  const firestore = createMockFirestore();
  seedTenant(firestore);
  seedSale(firestore);
  seedProduct(firestore, PRODUCT_A);
  seedShift(firestore);
  seedAccount(firestore, 50000);
  // No income ledger seeded

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.LEDGER_ERROR,
  );
});

test('ledger: ambiguous (two) income ledgers', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  // Add second income ledger
  firestore.set(`tenants/${TENANT_ID}/transactions/ledger_income_002`, {
    tenantId: TENANT_ID,
    accountId: ACCOUNT_ID,
    amount: 5000,
    type: 'income',
    saleId: SALE_ID,
    shiftId: SHIFT_ID,
    paymentMethod: 'cash',
  });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.LEDGER_ERROR,
  );
});

test('ledger: shift mismatch rejected', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  seedIncomeLedger(firestore, { shiftId: 'shift_different' });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.LEDGER_ERROR,
  );
});

test('ledger: amount mismatch rejected', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  seedIncomeLedger(firestore, { amount: 5000 });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.LEDGER_ERROR,
  );
});

test('ledger: payment mismatch rejected', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  seedIncomeLedger(firestore, { paymentMethod: 'gcash' });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.LEDGER_ERROR,
  );
});

test('ledger: account ID different from payment-method text succeeds and uses ledger account', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  // Sale is cash, but ledger account is named "master-cash" (different from payment method text)
  seedIncomeLedger(firestore, { accountId: 'master-cash' });

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  assert.equal(result.paymentMethod, 'cash');
  // Account from ledger is used (master-cash)
  const accountDoc = firestore.get(`tenants/${TENANT_ID}/accounts/master-cash`);
  assert.equal(accountDoc.data.balance, 40000);
});

test('ledger: account missing rejected', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  seedIncomeLedger(firestore, { accountId: 'nonexistent_account' });
  // Remove the seeded account
  firestore.docs.delete(`tenants/${TENANT_ID}/accounts/${ACCOUNT_ID}`);

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.LEDGER_ERROR,
  );
});

test('ledger: account underflow rejected', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  seedAccount(firestore, 5000); // less than ledger amount of 10000

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.UNDERFLOW,
  );
});

test('ledger: expense ledger uses positive amount', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  const compLedgerId = compensatingLedgerId(TENANT_ID, SALE_ID);
  const compDoc = firestore.get(`tenants/${TENANT_ID}/transactions/${compLedgerId}`);
  assert.equal(compDoc.data.type, 'expense');
  assert.equal(compDoc.data.amount, 10000);
  assert.ok(compDoc.data.amount > 0);
});

// ============================================================
// Shift tests
// ============================================================

test('shift: missing shift rejected', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  firestore.docs.delete(`tenants/${TENANT_ID}/shifts/${SHIFT_ID}`);

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.SHIFT_ERROR,
  );
});

test('shift: malformed open shift rejected (not normalized)', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  // Shift with malformed aggregate (negative value)
  firestore.set(`tenants/${TENANT_ID}/shifts/${SHIFT_ID}`, {
    tenantId: TENANT_ID,
    status: 'open',
    reconciliationVersion: 1,
    startingCash: 5000,
    cashSales: -100, // invalid
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 0,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
  });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.SHIFT_ERROR,
  );
});

test('shift: open shift uses partial update patch', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  const shiftDoc = firestore.get(`tenants/${TENANT_ID}/shifts/${SHIFT_ID}`);
  // cashSales was 10000, minus 10000 = 0
  assert.equal(shiftDoc.data.cashSales, 0);
  assert.equal(shiftDoc.data.totalShiftSales, 0);
  assert.equal(shiftDoc.data.saleCount, 0);
  // Tenant-owned fields remain
  assert.equal(shiftDoc.data.tenantId, TENANT_ID);
  assert.equal(shiftDoc.data.status, 'open');
});

test('shift: closed shift byte-for-byte unchanged', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  const originalShift = {
    tenantId: TENANT_ID,
    status: 'closed',
    reconciliationVersion: 1,
    startingCash: 5000,
    cashSales: 10000,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 10000,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 1,
    customField: 'preserved',
    closedAt: '2024-01-01',
  };
  firestore.set(`tenants/${TENANT_ID}/shifts/${SHIFT_ID}`, originalShift);

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  assert.equal(result.shiftStatus, 'closed');
  const after = firestore.get(`tenants/${TENANT_ID}/shifts/${SHIFT_ID}`);
  assert.equal(after.data.cashSales, 10000);
  assert.equal(after.data.customField, 'preserved');
  assert.equal(after.data.closedAt, '2024-01-01');
  // Check no updatedAt was added
  assert.equal(after.data.updatedAt, undefined);
});

test('shift: no synthetic shift created when missing', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  firestore.docs.delete(`tenants/${TENANT_ID}/shifts/${SHIFT_ID}`);

  const beforeShift = firestore.docs.size;
  const beforeWrites = firestore.transactionWriteCount;

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.SHIFT_ERROR,
  );

  assert.equal(firestore.docs.size, beforeShift, 'no docs created');
  assert.equal(firestore.transactionWriteCount, beforeWrites, 'zero writes');
});

// ============================================================
// Replay tests
// ============================================================

test('replay: same-key valid replay', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  const opts = buildServiceOptions(firestore);

  const result1 = await executeBentaSaleReversal(TENANT_ID, OWNER_TOKEN, buildRequest(), opts);
  const writesAfterFirst = firestore.transactionWriteCount;
  const readsAfterFirst = firestore.transactionReadCount;

  // Same key replay
  const result2 = await executeBentaSaleReversal(TENANT_ID, OWNER_TOKEN, buildRequest(), opts);

  assert.equal(result1.reversalId, result2.reversalId);
  assert.equal(result1.voidedAt, result2.voidedAt);
  // Second call should be cheaper (replay branch reads less)
  // But at minimum, no new writes
  assert.equal(firestore.transactionWriteCount, writesAfterFirst, 'no new writes on replay');
});

test('replay: same-key conflicting request rejected', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  const opts = buildServiceOptions(firestore);

  await executeBentaSaleReversal(TENANT_ID, OWNER_TOKEN, buildRequest(), opts);

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN,
      buildRequest({ reason: 'different reason' }),
      opts,
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.IDEMPOTENCY_CONFLICT,
  );
});

test('replay: same-key missing reversal integrity error', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  // Manually create an idempotency record with matching fingerprint but no reversal
  const fp = reversalFingerprint(TENANT_ID, SALE_ID, 'Customer returned defective item');
  const idemId = reversalIdempotencyDocumentId(TENANT_ID, OWNER_UID, VALID_UUID);
  const receipt = {
    reversalId: 'orphan_id',
    saleId: SALE_ID,
    voidedAt: '2024-01-01T00:00:00.000Z',
    paymentMethod: 'cash' as const,
    productCount: 1,
    shiftStatus: 'open' as const,
    reversalVersion: REVERSAL_VERSION,
  };
  firestore.set(`tenants/${TENANT_ID}/reversal_idempotency/${idemId}`, {
    fingerprint: fp,
    saleId: SALE_ID,
    reversalId: 'orphan_id',
    receipt,
  });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.REVERSAL_INTEGRITY_ERROR,
  );
});

test('replay: same-key receipt mismatch integrity error', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const fp = reversalFingerprint(TENANT_ID, SALE_ID, 'Customer returned defective item');
  const idemId = reversalIdempotencyDocumentId(TENANT_ID, OWNER_UID, VALID_UUID);
  // Receipt with wrong data
  const badReceipt = {
    reversalId: 'wrong_id',
    saleId: SALE_ID,
    voidedAt: '2024-01-01T00:00:00.000Z',
    paymentMethod: 'cash' as const,
    productCount: 99,
    shiftStatus: 'open' as const,
    reversalVersion: REVERSAL_VERSION,
  };
  firestore.set(`tenants/${TENANT_ID}/reversal_idempotency/${idemId}`, {
    fingerprint: fp,
    saleId: SALE_ID,
    reversalId: 'wrong_id',
    receipt: badReceipt,
  });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.REVERSAL_INTEGRITY_ERROR,
  );
});

test('replay: same-key both receipts wrong saleId rejected with integrity error', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const fp = reversalFingerprint(TENANT_ID, SALE_ID, 'Customer returned defective item');
  const idemId = reversalIdempotencyDocumentId(TENANT_ID, OWNER_UID, VALID_UUID);
  const detId = reversalIdDocumentId(TENANT_ID, SALE_ID);

  const wrongSaleId = 'sale_9999999999';
  const corruptedReceipt = {
    reversalId: detId,
    saleId: wrongSaleId,
    voidedAt: '2024-01-01T00:00:00.000Z',
    paymentMethod: 'cash' as const,
    productCount: 1,
    shiftStatus: 'open' as const,
    reversalVersion: REVERSAL_VERSION,
  };

  firestore.set(`tenants/${TENANT_ID}/reversal_idempotency/${idemId}`, {
    fingerprint: fp,
    saleId: SALE_ID,
    reversalId: detId,
    receipt: corruptedReceipt,
  });
  firestore.set(`tenants/${TENANT_ID}/sale_reversals/${detId}`, {
    id: detId,
    reversalId: detId,
    tenantId: TENANT_ID,
    saleId: SALE_ID,
    reversalVersion: REVERSAL_VERSION,
    fingerprint: fp,
    voidReason: 'Customer returned defective item',
    receipt: corruptedReceipt,
  });
  firestore.set(`tenants/${TENANT_ID}/sales/${SALE_ID}`, {
    ...firestore.get(`tenants/${TENANT_ID}/sales/${SALE_ID}`).data,
    status: 'voided',
    voidedBy: OWNER_UID,
    voidReason: 'Customer returned defective item',
    reversalId: detId,
    reversalVersion: REVERSAL_VERSION,
  });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.REVERSAL_INTEGRITY_ERROR,
  );
});

test('replay: same-key both receipts wrong reversalId rejected with integrity error', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const fp = reversalFingerprint(TENANT_ID, SALE_ID, 'Customer returned defective item');
  const idemId = reversalIdempotencyDocumentId(TENANT_ID, OWNER_UID, VALID_UUID);
  const detId = reversalIdDocumentId(TENANT_ID, SALE_ID);

  const wrongReversalId = 'rev_wrong_reversal_id_0000000000000000000000000000000000000000000000';
  const corruptedReceipt = {
    reversalId: wrongReversalId,
    saleId: SALE_ID,
    voidedAt: '2024-01-01T00:00:00.000Z',
    paymentMethod: 'cash' as const,
    productCount: 1,
    shiftStatus: 'open' as const,
    reversalVersion: REVERSAL_VERSION,
  };

  firestore.set(`tenants/${TENANT_ID}/reversal_idempotency/${idemId}`, {
    fingerprint: fp,
    saleId: SALE_ID,
    reversalId: detId,
    receipt: corruptedReceipt,
  });
  firestore.set(`tenants/${TENANT_ID}/sale_reversals/${detId}`, {
    id: detId,
    reversalId: detId,
    tenantId: TENANT_ID,
    saleId: SALE_ID,
    reversalVersion: REVERSAL_VERSION,
    fingerprint: fp,
    voidReason: 'Customer returned defective item',
    receipt: corruptedReceipt,
  });
  firestore.set(`tenants/${TENANT_ID}/sales/${SALE_ID}`, {
    ...firestore.get(`tenants/${TENANT_ID}/sales/${SALE_ID}`).data,
    status: 'voided',
    voidedBy: OWNER_UID,
    voidReason: 'Customer returned defective item',
    reversalId: detId,
    reversalVersion: REVERSAL_VERSION,
  });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.REVERSAL_INTEGRITY_ERROR,
  );
});

test('replay: wrong reversal-record reversalVersion rejected with integrity error', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const detId = reversalIdDocumentId(TENANT_ID, SALE_ID);
  const fp = reversalFingerprint(TENANT_ID, SALE_ID, 'Customer returned defective item');
  const validReceipt = {
    reversalId: detId,
    saleId: SALE_ID,
    voidedAt: '2024-01-01T00:00:00.000Z',
    paymentMethod: 'cash' as const,
    productCount: 1,
    shiftStatus: 'open' as const,
    reversalVersion: REVERSAL_VERSION,
  };

  firestore.set(`tenants/${TENANT_ID}/sale_reversals/${detId}`, {
    id: detId,
    reversalId: detId,
    tenantId: TENANT_ID,
    saleId: SALE_ID,
    reversalVersion: 99,
    fingerprint: fp,
    voidReason: 'Customer returned defective item',
    receipt: validReceipt,
  });
  firestore.set(`tenants/${TENANT_ID}/sales/${SALE_ID}`, {
    ...firestore.get(`tenants/${TENANT_ID}/sales/${SALE_ID}`).data,
    status: 'voided',
    voidedBy: OWNER_UID,
    voidReason: 'Customer returned defective item',
    reversalId: detId,
    reversalVersion: REVERSAL_VERSION,
  });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest({ idempotencyKey: VALID_UUID_2 }), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.REVERSAL_INTEGRITY_ERROR,
  );
});

test('replay: wrong reversal-record id rejected with integrity error', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const detId = reversalIdDocumentId(TENANT_ID, SALE_ID);
  const fp = reversalFingerprint(TENANT_ID, SALE_ID, 'Customer returned defective item');
  const validReceipt = {
    reversalId: detId,
    saleId: SALE_ID,
    voidedAt: '2024-01-01T00:00:00.000Z',
    paymentMethod: 'cash' as const,
    productCount: 1,
    shiftStatus: 'open' as const,
    reversalVersion: REVERSAL_VERSION,
  };

  firestore.set(`tenants/${TENANT_ID}/sale_reversals/${detId}`, {
    id: 'mismatched_id',
    reversalId: detId,
    tenantId: TENANT_ID,
    saleId: SALE_ID,
    reversalVersion: REVERSAL_VERSION,
    fingerprint: fp,
    voidReason: 'Customer returned defective item',
    receipt: validReceipt,
  });
  firestore.set(`tenants/${TENANT_ID}/sales/${SALE_ID}`, {
    ...firestore.get(`tenants/${TENANT_ID}/sales/${SALE_ID}`).data,
    status: 'voided',
    voidedBy: OWNER_UID,
    voidReason: 'Customer returned defective item',
    reversalId: detId,
    reversalVersion: REVERSAL_VERSION,
  });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest({ idempotencyKey: VALID_UUID_2 }), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.REVERSAL_INTEGRITY_ERROR,
  );
});

test('replay: wrong reversal-record reversalId rejected with integrity error', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const detId = reversalIdDocumentId(TENANT_ID, SALE_ID);
  const fp = reversalFingerprint(TENANT_ID, SALE_ID, 'Customer returned defective item');
  const validReceipt = {
    reversalId: detId,
    saleId: SALE_ID,
    voidedAt: '2024-01-01T00:00:00.000Z',
    paymentMethod: 'cash' as const,
    productCount: 1,
    shiftStatus: 'open' as const,
    reversalVersion: REVERSAL_VERSION,
  };

  firestore.set(`tenants/${TENANT_ID}/sale_reversals/${detId}`, {
    id: detId,
    reversalId: 'mismatched_reversal_id',
    tenantId: TENANT_ID,
    saleId: SALE_ID,
    reversalVersion: REVERSAL_VERSION,
    fingerprint: fp,
    voidReason: 'Customer returned defective item',
    receipt: validReceipt,
  });
  firestore.set(`tenants/${TENANT_ID}/sales/${SALE_ID}`, {
    ...firestore.get(`tenants/${TENANT_ID}/sales/${SALE_ID}`).data,
    status: 'voided',
    voidedBy: OWNER_UID,
    voidReason: 'Customer returned defective item',
    reversalId: detId,
    reversalVersion: REVERSAL_VERSION,
  });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest({ idempotencyKey: VALID_UUID_2 }), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.REVERSAL_INTEGRITY_ERROR,
  );
});

test('replay: corrupted reversal-record fingerprint rejected with integrity error', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const detId = reversalIdDocumentId(TENANT_ID, SALE_ID);
  const validReceipt = {
    reversalId: detId,
    saleId: SALE_ID,
    voidedAt: '2024-01-01T00:00:00.000Z',
    paymentMethod: 'cash' as const,
    productCount: 1,
    shiftStatus: 'open' as const,
    reversalVersion: REVERSAL_VERSION,
  };

  firestore.set(`tenants/${TENANT_ID}/sale_reversals/${detId}`, {
    id: detId,
    reversalId: detId,
    tenantId: TENANT_ID,
    saleId: SALE_ID,
    reversalVersion: REVERSAL_VERSION,
    fingerprint: 'corrupted_hex_fingerprint_0000000000000000000000000000000000000000',
    voidReason: 'Customer returned defective item',
    receipt: validReceipt,
  });
  firestore.set(`tenants/${TENANT_ID}/sales/${SALE_ID}`, {
    ...firestore.get(`tenants/${TENANT_ID}/sales/${SALE_ID}`).data,
    status: 'voided',
    voidedBy: OWNER_UID,
    voidReason: 'Customer returned defective item',
    reversalId: detId,
    reversalVersion: REVERSAL_VERSION,
  });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest({ idempotencyKey: VALID_UUID_2 }), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.REVERSAL_INTEGRITY_ERROR,
  );
});

test('replay: sale voidReason inconsistent with reversal record voidReason rejected with integrity error', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const detId = reversalIdDocumentId(TENANT_ID, SALE_ID);
  const fp = reversalFingerprint(TENANT_ID, SALE_ID, 'Customer returned defective item');
  const validReceipt = {
    reversalId: detId,
    saleId: SALE_ID,
    voidedAt: '2024-01-01T00:00:00.000Z',
    paymentMethod: 'cash' as const,
    productCount: 1,
    shiftStatus: 'open' as const,
    reversalVersion: REVERSAL_VERSION,
  };

  firestore.set(`tenants/${TENANT_ID}/sale_reversals/${detId}`, {
    id: detId,
    reversalId: detId,
    tenantId: TENANT_ID,
    saleId: SALE_ID,
    reversalVersion: REVERSAL_VERSION,
    fingerprint: fp,
    voidReason: 'Customer returned defective item',
    receipt: validReceipt,
  });
  firestore.set(`tenants/${TENANT_ID}/sales/${SALE_ID}`, {
    ...firestore.get(`tenants/${TENANT_ID}/sales/${SALE_ID}`).data,
    status: 'voided',
    voidedBy: OWNER_UID,
    voidReason: 'Different reason recorded on sale',
    reversalId: detId,
    reversalVersion: REVERSAL_VERSION,
  });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest({ idempotencyKey: VALID_UUID_2 }), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.REVERSAL_INTEGRITY_ERROR,
  );
});

test('replay: different-key valid replay with zero writes', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  const opts = buildServiceOptions(firestore);

  // First reversal
  await executeBentaSaleReversal(TENANT_ID, OWNER_TOKEN, buildRequest(), opts);

  const writesBeforeReplay = firestore.transactionWriteCount;
  const readsBeforeReplay = firestore.transactionReadCount;

  // Different idempotency key, same sale
  const result2 = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN,
    buildRequest({ idempotencyKey: VALID_UUID_2 }),
    opts,
  );

  assert.equal(firestore.transactionWriteCount, writesBeforeReplay, 'zero writes on different-key replay');
  // Should have done minimal reads
  const result1Doc = firestore.get(`tenants/${TENANT_ID}/sale_reversals/${reversalIdDocumentId(TENANT_ID, SALE_ID)}`);
  assert.equal(result1Doc.exists, true);
});

test('replay: already-voided inconsistent metadata rejected', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  // Manually create a reversal record
  const reversalId = reversalIdDocumentId(TENANT_ID, SALE_ID);
  firestore.set(`tenants/${TENANT_ID}/sale_reversals/${reversalId}`, {
    id: reversalId,
    tenantId: TENANT_ID,
    saleId: SALE_ID,
    receipt: {
      reversalId,
      saleId: SALE_ID,
      voidedAt: '2024-01-01T00:00:00.000Z',
      paymentMethod: 'cash',
      productCount: 1,
      shiftStatus: 'open',
      reversalVersion: REVERSAL_VERSION,
    },
  });

  // Sale is not voided -> should be integrity error
  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.REVERSAL_INTEGRITY_ERROR,
  );
});

test('deterministic: compensating ledger conflict produces integrity error', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  // Pre-seed a compensating ledger
  const compId = compensatingLedgerId(TENANT_ID, SALE_ID);
  firestore.set(`tenants/${TENANT_ID}/transactions/${compId}`, {
    tenantId: TENANT_ID,
    type: 'expense',
    amount: 1,
  });

  await assert.rejects(
    executeBentaSaleReversal(
      TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
    ),
    (err: unknown) => err instanceof ReversalError && err.code === ReversalErrorCode.REVERSAL_INTEGRITY_ERROR,
  );
});

// ============================================================
// Transaction structure tests
// ============================================================

test('transaction: retry produces exactly one reversal, one movement, one expense ledger, one audit', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  let attempts = 0;
  const client = {
    collection(name: string): MockCollectionRef {
      return new MockCollectionRef(name, firestore);
    },
    runTransaction: async <T>(fn: (txn: MockTransaction) => Promise<T>): Promise<T> => {
      attempts++;
      if (attempts === 1) {
        const txn1 = new MockTransaction(firestore);
        try {
          await fn(txn1);
        } catch {
          // Ignore simulated transient error
        }
        // Simulate abort on attempt 1 (staged writes discarded)
        throw new Error('transient retryable conflict');
      }
      const txn2 = new MockTransaction(firestore);
      const result = await fn(txn2);
      txn2.commit();
      return result;
    },
  } as unknown as admin.firestore.Firestore;

  const opts: ReversalServiceOptions = {
    adminAuth: createMockAuth(OWNER_UID) as unknown as admin.auth.Auth,
    adminFirestore: client,
    now: () => makeTimestamp(),
  };

  // First call fails with transient error
  await assert.rejects(
    executeBentaSaleReversal(TENANT_ID, OWNER_TOKEN, buildRequest(), opts),
    /transient retryable conflict/,
  );

  // Second call (retry) succeeds
  await executeBentaSaleReversal(TENANT_ID, OWNER_TOKEN, buildRequest(), opts);

  const expectedReversalId = reversalIdDocumentId(TENANT_ID, SALE_ID);
  const expectedMovementId = inventoryMovementId(TENANT_ID, SALE_ID, PRODUCT_A);
  const expectedAuditId = auditEventId(TENANT_ID, expectedReversalId);
  const expectedCompLedgerId = compensatingLedgerId(TENANT_ID, SALE_ID);

  let reversalCount = 0;
  let movementCount = 0;
  let auditCount = 0;
  let compLedgerCount = 0;
  for (const [path] of firestore.docs) {
    if (path === `tenants/${TENANT_ID}/sale_reversals/${expectedReversalId}`) reversalCount++;
    if (path === `tenants/${TENANT_ID}/inventory_transactions/${expectedMovementId}`) movementCount++;
    if (path === `tenants/${TENANT_ID}/audit_log/${expectedAuditId}`) auditCount++;
    if (path === `tenants/${TENANT_ID}/transactions/${expectedCompLedgerId}`) compLedgerCount++;
  }
  assert.equal(reversalCount, 1);
  assert.equal(movementCount, 1);
  assert.equal(auditCount, 1);
  assert.equal(compLedgerCount, 1);
});

test('transaction: concurrent different-key reversals commit exactly once and second call replays', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);
  const opts = buildServiceOptions(firestore);

  const req1 = buildRequest({ idempotencyKey: VALID_UUID });
  const req2 = buildRequest({ idempotencyKey: VALID_UUID_2 });

  // Run both concurrently
  const [res1, res2] = await Promise.all([
    executeBentaSaleReversal(TENANT_ID, OWNER_TOKEN, req1, opts),
    executeBentaSaleReversal(TENANT_ID, OWNER_TOKEN, req2, opts),
  ]);

  // Both receive valid receipts for the same reversal
  assert.equal(res1.reversalId, res2.reversalId);
  assert.equal(res1.saleId, SALE_ID);
  assert.equal(res2.saleId, SALE_ID);

  // Exact accounting verification:
  // 1. Account decremented exactly once by 10000 centavos
  const accountDoc = firestore.get(`tenants/${TENANT_ID}/accounts/${ACCOUNT_ID}`);
  assert.equal(accountDoc.data.balance, 50000 - 10000);

  // 2. Product stock restored exactly once (+2 discrete from 5 to 7)
  const productDoc = firestore.get(`tenants/${TENANT_ID}/products/${PRODUCT_A}`);
  assert.equal(productDoc.data.currentStock, 5 + 2);

  // 3. Shift decremented exactly once (-10000 centavos)
  const shiftDoc = firestore.get(`tenants/${TENANT_ID}/shifts/${SHIFT_ID}`);
  assert.equal(shiftDoc.data.cashSales, 10000 - 10000);
  assert.equal(shiftDoc.data.totalShiftSales, 10000 - 10000);
  assert.equal(shiftDoc.data.saleCount, 1 - 1);

  // 4. Exactly one reversal record
  const detId = reversalIdDocumentId(TENANT_ID, SALE_ID);
  const reversalDoc = firestore.get(`tenants/${TENANT_ID}/sale_reversals/${detId}`);
  assert.equal(reversalDoc.exists, true);

  // 5. Exactly one compensating ledger
  const compId = compensatingLedgerId(TENANT_ID, SALE_ID);
  const compDoc = firestore.get(`tenants/${TENANT_ID}/transactions/${compId}`);
  assert.equal(compDoc.exists, true);

  // 6. Exactly one inventory movement
  const movId = inventoryMovementId(TENANT_ID, SALE_ID, PRODUCT_A);
  const movDoc = firestore.get(`tenants/${TENANT_ID}/inventory_transactions/${movId}`);
  assert.equal(movDoc.exists, true);

  // 7. Exactly one audit log
  const auditId = auditEventId(TENANT_ID, detId);
  const auditDoc = firestore.get(`tenants/${TENANT_ID}/audit_log/${auditId}`);
  assert.equal(auditDoc.exists, true);
});

test('transaction: no reads after writes', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  // Track reads and writes per phase
  let writesAtReadTime = 0;

  // We need a custom transaction that tracks read-after-write
  class TrackingTransaction extends MockTransaction {
    override get(ref: MockDocRef): MockDocSnapshot;
    override get(query: MockQuery): MockQuerySnapshot;
    override get(arg: MockDocRef | MockQuery): MockDocSnapshot | MockQuerySnapshot {
      if (this.hasWritten) writesAtReadTime++;
      return super.get(arg as MockDocRef);
    }
    override getAll(...refs: MockDocRef[]): MockDocSnapshot[] {
      if (this.hasWritten) writesAtReadTime++;
      return super.getAll(...refs);
    }
  }

  const trackingFirestore = new MockFirestore();
  // Copy seeded data
  for (const [path, doc] of firestore.docs) {
    trackingFirestore.set(path, doc.data);
  }

  const client = {
    collection(name: string): MockCollectionRef { return new MockCollectionRef(name, trackingFirestore); },
    runTransaction: async <T>(fn: (txn: MockTransaction) => Promise<T>): Promise<T> => {
      const txn = new TrackingTransaction(trackingFirestore);
      try {
        const result = await fn(txn);
        txn.commit();
        return result;
      } catch (err) {
        throw err;
      }
    },
  } as unknown as admin.firestore.Firestore;

  const opts: ReversalServiceOptions = {
    adminAuth: createMockAuth(OWNER_UID) as unknown as admin.auth.Auth,
    adminFirestore: client,
    now: () => makeTimestamp(),
  };

  await executeBentaSaleReversal(TENANT_ID, OWNER_TOKEN, buildRequest(), opts);

  assert.equal(writesAtReadTime, 0, 'no reads after writes');
});

// ============================================================
// Persistence tests
// ============================================================

test('persistence: original sale retained with lifecycle additions only', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const originalSale = firestore.get(`tenants/${TENANT_ID}/sales/${SALE_ID}`);
  const originalKeys = Object.keys(originalSale.data).sort();

  await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  const afterSale = firestore.get(`tenants/${TENANT_ID}/sales/${SALE_ID}`);
  // All original keys still present
  for (const key of originalKeys) {
    assert.ok(key in afterSale.data, `original key ${key} preserved`);
  }
  // Lifecycle additions present
  assert.equal(afterSale.data.status, 'voided');
  assert.equal(afterSale.data.voidedBy, OWNER_UID);
  assert.ok(afterSale.data.voidedAt);
  assert.equal(afterSale.data.reversalId, reversalIdDocumentId(TENANT_ID, SALE_ID));
  assert.equal(afterSale.data.reversalVersion, REVERSAL_VERSION);
});

test('persistence: original income ledger unchanged', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const originalLedger = firestore.get(`tenants/${TENANT_ID}/transactions/ledger_income_001`);

  await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  const afterLedger = firestore.get(`tenants/${TENANT_ID}/transactions/ledger_income_001`);
  assert.deepEqual(afterLedger.data, originalLedger.data);
});

test('persistence: raw idempotency key absent from stored records', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  // Check idempotency doc
  const idemId = reversalIdempotencyDocumentId(TENANT_ID, OWNER_UID, VALID_UUID);
  const idemDoc = firestore.get(`tenants/${TENANT_ID}/reversal_idempotency/${idemId}`);
  const serialized = JSON.stringify(idemDoc.data);
  assert.equal(serialized.includes(VALID_UUID), false, 'raw UUID not in idempotency doc');
  assert.equal(idemDoc.data.idempotencyKey, undefined);

  // Check reversal doc
  const reversalId = reversalIdDocumentId(TENANT_ID, SALE_ID);
  const reversalDoc = firestore.get(`tenants/${TENANT_ID}/sale_reversals/${reversalId}`);
  const revSerialized = JSON.stringify(reversalDoc.data);
  assert.equal(revSerialized.includes(VALID_UUID), false, 'raw UUID not in reversal doc');
});

test('persistence: no expiry or TTL fields', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  const idemId = reversalIdempotencyDocumentId(TENANT_ID, OWNER_UID, VALID_UUID);
  const idemDoc = firestore.get(`tenants/${TENANT_ID}/reversal_idempotency/${idemId}`);
  assert.equal(idemDoc.data.expiresAt, undefined);
  assert.equal(idemDoc.data.ttl, undefined);
  assert.equal(idemDoc.data.expirationTime, undefined);
});

test('persistence: internal reversal evidence complete', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  const reversalId = reversalIdDocumentId(TENANT_ID, SALE_ID);
  const reversalDoc = firestore.get(`tenants/${TENANT_ID}/sale_reversals/${reversalId}`);

  // Required evidence fields
  assert.equal(reversalDoc.data.tenantId, TENANT_ID);
  assert.equal(reversalDoc.data.saleId, SALE_ID);
  assert.equal(reversalDoc.data.shiftId, SHIFT_ID);
  assert.ok(reversalDoc.data.shiftStatus);
  assert.equal(reversalDoc.data.paymentMethod, 'cash');
  assert.equal(reversalDoc.data.totalAmountCentavos, 10000);
  assert.equal(reversalDoc.data.authoritativeAccountId, ACCOUNT_ID);
  assert.ok(reversalDoc.data.originalIncomeLedgerId);
  assert.ok(reversalDoc.data.compensatingLedgerId);
  assert.ok(reversalDoc.data.receipt);
  assert.ok(reversalDoc.data.internalEvidence);
  assert.ok(reversalDoc.data.fingerprint);
  assert.equal(reversalDoc.data.voidedBy, OWNER_UID);
  assert.ok(reversalDoc.data.voidedAt);

  // Internal evidence has per-product data
  const evidence = reversalDoc.data.internalEvidence as Record<string, unknown>;
  assert.ok(Array.isArray(evidence.perLineEvidence));
  assert.ok(Array.isArray(evidence.perProductAggregation));
  assert.ok(Array.isArray(evidence.productRestorations));
});

test('persistence: public receipt has exact key set only', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const result = await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  const expectedKeys = ['reversalId', 'saleId', 'voidedAt', 'paymentMethod', 'productCount', 'shiftStatus', 'reversalVersion'].sort();
  const actualKeys = Object.keys(result).sort();
  assert.deepEqual(actualKeys, expectedKeys);
});

// ============================================================
// Audit tests
// ============================================================

test('audit: deterministic audit ID committed', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  await executeBentaSaleReversal(
    TENANT_ID, OWNER_TOKEN, buildRequest(), buildServiceOptions(firestore),
  );

  const expectedAuditId = auditEventId(TENANT_ID, reversalIdDocumentId(TENANT_ID, SALE_ID));
  const auditDoc = firestore.get(`tenants/${TENANT_ID}/audit_log/${expectedAuditId}`);
  assert.equal(auditDoc.exists, true, 'audit document at deterministic ID');
  assert.equal(auditDoc.data.type, 'sale_reversal');
  assert.equal(auditDoc.data.action, 'sale_reversed');
});

// ============================================================
// Route tests
// ============================================================

test('route: body tenantId rejected', async () => {
  const firestore = createMockFirestore();
  seedCompleteFixture(firestore);

  const handler = createSaleReversalRouteHandler(buildServiceOptions(firestore));
  const request = new Request('http://localhost/test', {
    method: 'POST',
    headers: { authorization: `Bearer ${OWNER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      saleId: SALE_ID,
      idempotencyKey: VALID_UUID,
      reason: 'test',
      tenantId: TENANT_ID,
    }),
  });
  const ctx = { params: Promise.resolve({ tenantId: TENANT_ID }) };

  const response = await handler(request, ctx);
  assert.equal(response.status, 400);
});

test('route: invalid path tenantId rejected', async () => {
  const handler = createSaleReversalRouteHandler();
  const request = new Request('http://localhost/test', {
    method: 'POST',
    headers: { authorization: `Bearer ${OWNER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: 'test' }),
  });
  const ctx = { params: Promise.resolve({ tenantId: 'invalid tenant id' }) };

  const response = await handler(request, ctx);
  assert.equal(response.status, 400);
});

test('route: unexpected service failure returns 503', async () => {
  // Service that throws non-ReversalError
  const fakeFirestore = {
    collection(name: string): MockCollectionRef { return new MockCollectionRef(name, createMockFirestore()); },
    runTransaction: async () => { throw new Error('unexpected boom'); },
  } as unknown as admin.firestore.Firestore;

  const handler = createSaleReversalRouteHandler({
    adminAuth: createMockAuth(OWNER_UID) as unknown as admin.auth.Auth,
    adminFirestore: fakeFirestore,
    now: () => makeTimestamp(),
  });

  const request = new Request('http://localhost/test', {
    method: 'POST',
    headers: { authorization: `Bearer ${OWNER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: 'test' }),
  });
  const ctx = { params: Promise.resolve({ tenantId: TENANT_ID }) };

  const response = await handler(request, ctx);
  assert.equal(response.status, 503);
});

test('route: missing bearer token returns 401', async () => {
  const handler = createSaleReversalRouteHandler();
  const request = new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: 'test' }),
  });
  const ctx = { params: Promise.resolve({ tenantId: TENANT_ID }) };

  const response = await handler(request, ctx);
  assert.equal(response.status, 401);
});

test('route: horizontal tab in reason rejected', async () => {
  const handler = createSaleReversalRouteHandler();
  const request = new Request('http://localhost/test', {
    method: 'POST',
    headers: { authorization: `Bearer ${OWNER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: 'Tab\tReason' }),
  });
  const ctx = { params: Promise.resolve({ tenantId: TENANT_ID }) };

  const response = await handler(request, ctx);
  assert.equal(response.status, 400);
});

test('route: line feed in reason rejected', async () => {
  const handler = createSaleReversalRouteHandler();
  const request = new Request('http://localhost/test', {
    method: 'POST',
    headers: { authorization: `Bearer ${OWNER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: 'Line\nReason' }),
  });
  const ctx = { params: Promise.resolve({ tenantId: TENANT_ID }) };

  const response = await handler(request, ctx);
  assert.equal(response.status, 400);
});

test('route: carriage return in reason rejected', async () => {
  const handler = createSaleReversalRouteHandler();
  const request = new Request('http://localhost/test', {
    method: 'POST',
    headers: { authorization: `Bearer ${OWNER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ saleId: SALE_ID, idempotencyKey: VALID_UUID, reason: 'CR\rReason' }),
  });
  const ctx = { params: Promise.resolve({ tenantId: TENANT_ID }) };

  const response = await handler(request, ctx);
  assert.equal(response.status, 400);
});
