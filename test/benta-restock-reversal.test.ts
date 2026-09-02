import test from 'node:test';
import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';
import {
  executeBentaRestockReversal,
  validateRestockReversalRequest,
  restockReversalIdDocumentId,
  restockReversalIdempotencyDocumentId,
  restockReversalFingerprint,
  restockReversalCompensatingLedgerId,
  restockReversalMovementId,
  restockReversalAuditEventId,
  createRestockReversalRouteHandler,
  RestockReversalError,
  RestockReversalErrorCode,
  RESTOCK_REVERSAL_VERSION,
  BENTA_SNAP_MODULE_ID,
  type RestockReversalRequest,
  type ReversalServiceOptions,
} from '../src/lib/server/benta-restock-reversal';

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
  where(field: string, op: '==', value: unknown): MockQuery {
    return new MockQuery(this.collectionPath, [...this.filters, { field, op, value }]);
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
  docs = new Map<string, StoredDoc>();
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

class MockCreateConflict extends Error {}

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
        if (remainder.includes('/')) continue;

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

  create(ref: MockDocRef, data: Record<string, unknown>): void {
    this.hasWritten = true;
    this.firestore.transactionWriteCount++;
    this.stagedWrites.set(ref.path, { type: 'create', ref, data });
  }

  update(ref: MockDocRef, data: Record<string, unknown>): void {
    this.hasWritten = true;
    this.firestore.transactionWriteCount++;
    this.stagedWrites.set(ref.path, { type: 'update', ref, data });
  }

  set(ref: MockDocRef, data: Record<string, unknown>, opts?: { merge?: boolean }): void {
    this.hasWritten = true;
    this.firestore.transactionWriteCount++;
    this.stagedWrites.set(ref.path, { type: 'set', ref, data, opts });
  }

  commit(): void {
    for (const write of this.stagedWrites.values()) {
      if (write.type === 'create' && this.firestore.exists(write.ref.path)) {
        throw new MockCreateConflict(`Document already exists: ${write.ref.path}`);
      }
    }
    for (const write of this.stagedWrites.values()) {
      if (write.type === 'create' || write.type === 'set') {
        this.firestore.set(write.ref.path, write.data, write.opts);
      } else if (write.type === 'update') {
        const existing = this.firestore.get(write.ref.path);
        this.firestore.set(write.ref.path, { ...existing.data, ...write.data });
      }
    }
    this.stagedWrites.clear();
    this.hasWritten = false;
  }

  rollback(): void {
    this.stagedWrites.clear();
    this.hasWritten = false;
  }
}

function createMockFirestore(seed: Record<string, Record<string, unknown>> = {}, failCommit = false) {
  const store: Record<string, Record<string, unknown>> = JSON.parse(JSON.stringify(seed));
  const firestore = new MockFirestore();

  for (const [path, data] of Object.entries(store)) {
    firestore.docs.set(path, { exists: true, data: JSON.parse(JSON.stringify(data)) });
  }

  const db = {
    collection(path: string): MockCollectionRef {
      return new MockCollectionRef(path, firestore);
    },
    runTransaction: async <T>(work: (transaction: MockTransaction) => Promise<T>): Promise<T> => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const txn = new MockTransaction(firestore);
        try {
          const result = await work(txn);
          if (failCommit) {
            txn.rollback();
            throw new Error('Injected transaction failure');
          }
          txn.commit();
          return result;
        } catch (err) {
          txn.rollback();
          if (err instanceof MockCreateConflict && attempt < 2) {
            continue;
          }
          throw err;
        }
      }
      throw new Error('Transaction retry limit exceeded');
    },
  };

  return {
    db: db as unknown as admin.firestore.Firestore,
    store: firestore,
  };
}

function createMockAuth(tokens: Record<string, { uid: string }>) {
  return {
    verifyIdToken: async (token: string) => {
      if (tokens[token]) {
        return tokens[token];
      }
      throw new Error('Invalid token');
    },
  } as unknown as admin.auth.Auth;
}

const OWNER_UID = 'owner_123';
const TENANT_ID = 'tenant_abc';
const TOKEN_VALID = 'token_valid_owner';
const TOKEN_OTHER = 'token_other_user';
const defaultNow = () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000);

function makePoItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    productId: 'prod_discrete',
    productName: 'Canned Goods',
    quantity: 10,
    quantityMode: 'discrete',
    unitCostCentavos: 2400,
    supplierCostCentavos: 24000,
    freightCentavos: 0,
    otherAcquisitionCostCentavos: 0,
    landedCostCentavos: 24000,
    latestPurchaseUnitCostCentavos: 2400,
    restockEventId: 'event_restock_1',
    previousPosition: {
      quantityMinor: 5,
      quantityScale: 0,
      inventoryValueCentavos: 10000,
      averageUnitCostCentavos: 2000,
    },
    resultingPosition: {
      quantityMinor: 15,
      quantityScale: 0,
      inventoryValueCentavos: 34000,
      averageUnitCostCentavos: 2267,
    },
    ...overrides,
  };
}

function buildBaseSeed(poOverrides: Record<string, unknown> = {}, productOverrides: Record<string, unknown> = {}) {
  return {
    [`tenants/${TENANT_ID}`]: {
      ownerUid: OWNER_UID,
      subscriptionStatus: 'active',
      moduleType: 'benta-snap',
      name: 'Tindahan ni Juan',
    },
    [`tenants/${TENANT_ID}/products/prod_discrete`]: {
      name: 'Canned Goods',
      tenantId: TENANT_ID,
      isActive: true,
      currentStock: 15,
      costPrice: 2267,
      inventoryValueCentavos: 34000,
      averageUnitCostCentavos: 2267,
      latestPurchaseUnitCostCentavos: 2400,
      salePrice: 3000,
      ...productOverrides,
    },
    [`tenants/${TENANT_ID}/products/prod_measured`]: {
      name: 'Bigas Dinorado',
      tenantId: TENANT_ID,
      isActive: true,
      quantityMode: 'measured',
      stockQuantityMinor: 7000,
      quantityScale: 3,
      costPrice: 53571,
      inventoryValueCentavos: 375000,
      averageUnitCostCentavos: 53571,
      latestPurchaseUnitCostCentavos: 55000,
      salePrice: 65000,
    },
    [`tenants/${TENANT_ID}/purchase_orders/po_1`]: {
      id: 'po_1',
      tenantId: TENANT_ID,
      costingVersion: 'moving_average_v1',
      status: 'received',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      supplierId: 'supp-1',
      supplierName: 'San Miguel Corp',
      totalAmountCentavos: 24000,
      restockEventIds: ['event_restock_1'],
      items: [makePoItem()],
      createdByUid: OWNER_UID,
      createdAt: defaultNow(),
      updatedAt: defaultNow(),
      ...poOverrides,
    },
    [`tenants/${TENANT_ID}/restock_events/event_restock_1`]: {
      id: 'event_restock_1',
      eventId: 'event_restock_1',
      tenantId: TENANT_ID,
      inventoryItemId: 'prod_discrete',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      purchasedQuantityMinor: 10,
      supplierCostCentavos: 24000,
      freightCentavos: 0,
      otherAcquisitionCostCentavos: 0,
      landedCostCentavos: 24000,
      latestPurchaseUnitCostCentavos: 2400,
      costMovement: 'increased',
      previousPosition: {
        quantityMinor: 5,
        quantityScale: 0,
        inventoryValueCentavos: 10000,
        averageUnitCostCentavos: 2000,
      },
      resultingPosition: {
        quantityMinor: 15,
        quantityScale: 0,
        inventoryValueCentavos: 34000,
        averageUnitCostCentavos: 2267,
      },
      occurredAtEpochMs: 1_700_000_000_000,
    },
    [`tenants/${TENANT_ID}/accounts/master-cash`]: {
      balance: 500000,
    },
    [`tenants/${TENANT_ID}/transactions/expense_1`]: {
      id: 'expense_1',
      tenantId: TENANT_ID,
      accountId: 'master-cash',
      amount: 24000,
      type: 'expense',
      category: 'Restock / Inventory Purchase',
      description: 'Purchase Order (PO-20260901-ABCD) - San Miguel Corp',
      poId: 'po_1',
      paymentMethod: 'cash',
      createdAt: defaultNow(),
    },
  };
}

const mockAuth = createMockAuth({
  [TOKEN_VALID]: { uid: OWNER_UID },
  [TOKEN_OTHER]: { uid: 'other_user_456' },
});

// ============================================================
// Tests
// ============================================================

test('validateRestockReversalRequest accepts valid request', () => {
  const req = validateRestockReversalRequest({
    purchaseOrderId: 'po_abc',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Wrong supplier',
  });
  assert.equal(req.purchaseOrderId, 'po_abc');
  assert.equal(req.idempotencyKey, '12345678-1234-4238-8234-123456789012');
  assert.equal(req.reason, 'Wrong supplier');
});

test('validateRestockReversalRequest rejects missing fields', () => {
  assert.throws(() => validateRestockReversalRequest({}), (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.INVALID_REQUEST);
  assert.throws(() => validateRestockReversalRequest({ purchaseOrderId: 'po_1' }), (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.INVALID_REQUEST);
});

test('validateRestockReversalRequest rejects unknown fields', () => {
  assert.throws(() => validateRestockReversalRequest({
    purchaseOrderId: 'po_abc',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
    extraField: 'not_allowed',
  }), (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.INVALID_REQUEST);
});

test('validateRestockReversalRequest rejects invalid idempotency key', () => {
  assert.throws(() => validateRestockReversalRequest({
    purchaseOrderId: 'po_abc',
    idempotencyKey: 'not-a-uuid',
    reason: 'Test',
  }), (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.INVALID_REQUEST);
});

test('validateRestockReversalRequest rejects blank reason', () => {
  assert.throws(() => validateRestockReversalRequest({
    purchaseOrderId: 'po_abc',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: '   ',
  }), (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.INVALID_REQUEST);
  assert.throws(() => validateRestockReversalRequest({
    purchaseOrderId: 'po_abc',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: '',
  }), (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.INVALID_REQUEST);
});

test('validateRestockReversalRequest rejects control characters in reason', () => {
  assert.throws(() => validateRestockReversalRequest({
    purchaseOrderId: 'po_abc',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test\x00Null',
  }), (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.INVALID_REQUEST);
});

test('owner authentication and tenant isolation', async () => {
  const seed = buildBaseSeed();
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test reversal',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, 'invalid_token', req, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.AUTHENTICATION_REQUIRED,
  );

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_OTHER, req, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.FORBIDDEN,
  );

  await assert.rejects(
    () => executeBentaRestockReversal('tenant_missing', TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.TENANT_NOT_FOUND,
  );
});

test('ineligible tenant module is rejected', async () => {
  const seed = {
    ...buildBaseSeed(),
    [`tenants/${TENANT_ID}`]: {
      ownerUid: OWNER_UID,
      subscriptionStatus: 'active',
      moduleType: 'order-snap',
      name: 'Tindahan ni Juan',
    },
  };
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.TENANT_INELIGIBLE,
  );
});

test('PO not found is rejected', async () => {
  const seed = buildBaseSeed();
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_missing',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.PO_NOT_FOUND,
  );
});

test('already voided PO is rejected', async () => {
  const seed = buildBaseSeed({ status: 'voided', voidReason: 'Already voided', voidedBy: OWNER_UID, voidedAt: defaultNow() });
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.PO_ALREADY_VOIDED,
  );
});

test('legacy PO is rejected', async () => {
  const seed = buildBaseSeed({ costingVersion: 'legacy_v1' });
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.PO_NOT_REVERSIBLE,
  );
});

test('pending PO is rejected', async () => {
  const seed = buildBaseSeed({ status: 'pending' });
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.PO_NOT_REVERSIBLE,
  );
});

test('successful discrete reversal restores product', async () => {
  const seed = buildBaseSeed();
  const { db, store } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test reversal',
  };

  const result = await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options);

  assert.equal(result.reversalId.length, 64);
  assert.equal(result.purchaseOrderId, 'po_1');
  assert.equal(result.productCount, 1);
  assert.equal(result.paymentEffect, 'cash_refunded');
  assert.equal(result.reversalVersion, 1);

  const updatedProd = store.get(`tenants/${TENANT_ID}/products/prod_discrete`);
  assert.equal(updatedProd.data.currentStock, 5);
  assert.equal(updatedProd.data.inventoryValueCentavos, 10000);
  assert.equal(updatedProd.data.averageUnitCostCentavos, 2000);

  const voidedPo = store.get(`tenants/${TENANT_ID}/purchase_orders/po_1`);
  assert.equal(voidedPo.data.status, 'voided');
  assert.equal(voidedPo.data.paymentStatus, 'voided');
  assert.equal(voidedPo.data.voidReason, 'Test reversal');
});

test('successful measured scale-3 reversal restores measured product', async () => {
  const measuredSeed = {
    [`tenants/${TENANT_ID}`]: {
      ownerUid: OWNER_UID,
      subscriptionStatus: 'active',
      moduleType: 'benta-snap',
      name: 'Tindahan ni Juan',
    },
    [`tenants/${TENANT_ID}/products/prod_measured`]: {
      name: 'Bigas Dinorado',
      tenantId: TENANT_ID,
      isActive: true,
      quantityMode: 'measured',
      stockQuantityMinor: 7000,
      quantityScale: 3,
      costPrice: 53571,
      inventoryValueCentavos: 375000,
      averageUnitCostCentavos: 53571,
      latestPurchaseUnitCostCentavos: 55000,
      salePrice: 65000,
    },
    [`tenants/${TENANT_ID}/purchase_orders/po_measured`]: {
      id: 'po_measured',
      tenantId: TENANT_ID,
      costingVersion: 'moving_average_v1',
      status: 'received',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      supplierId: 'supp-rice',
      supplierName: 'Rice Wholesaler',
      totalAmountCentavos: 275000,
      restockEventIds: ['event_restock_rice'],
      items: [{
        productId: 'prod_measured',
        productName: 'Bigas Dinorado',
        quantity: 5000,
        unitCostCentavos: 55000,
        quantityMode: 'measured',
        quantityMinor: 5000,
        quantityScale: 3,
        supplierCostCentavos: 275000,
        freightCentavos: 0,
        otherAcquisitionCostCentavos: 0,
        landedCostCentavos: 275000,
        latestPurchaseUnitCostCentavos: 55000,
        restockEventId: 'event_restock_rice',
        previousPosition: {
          quantityMinor: 2000,
          quantityScale: 3,
          inventoryValueCentavos: 100000,
          averageUnitCostCentavos: 50000,
        },
        resultingPosition: {
          quantityMinor: 7000,
          quantityScale: 3,
          inventoryValueCentavos: 375000,
          averageUnitCostCentavos: 53571,
        },
      }],
      createdByUid: OWNER_UID,
    },
    [`tenants/${TENANT_ID}/restock_events/event_restock_rice`]: {
      id: 'event_restock_rice',
      eventId: 'event_restock_rice',
      tenantId: TENANT_ID,
      inventoryItemId: 'prod_measured',
      idempotencyKey: 'po_measured',
      purchasedQuantityMinor: 5000,
      supplierCostCentavos: 275000,
      freightCentavos: 0,
      otherAcquisitionCostCentavos: 0,
      landedCostCentavos: 275000,
      latestPurchaseUnitCostCentavos: 55000,
      costMovement: 'increased',
      previousPosition: {
        quantityMinor: 2000,
        quantityScale: 3,
        inventoryValueCentavos: 100000,
        averageUnitCostCentavos: 50000,
      },
      resultingPosition: {
        quantityMinor: 7000,
        quantityScale: 3,
        inventoryValueCentavos: 375000,
        averageUnitCostCentavos: 53571,
      },
      occurredAtEpochMs: 1_700_000_000_000,
    },
    [`tenants/${TENANT_ID}/accounts/master-cash`]: {
      balance: 500000,
    },
    [`tenants/${TENANT_ID}/transactions/expense_rice`]: {
      id: 'expense_rice',
      tenantId: TENANT_ID,
      accountId: 'master-cash',
      amount: 275000,
      type: 'expense',
      category: 'Restock / Inventory Purchase',
      poId: 'po_measured',
      paymentMethod: 'cash',
      createdAt: defaultNow(),
    },
  };

  const { db, store } = createMockFirestore(measuredSeed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_measured',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test measured reversal',
  };

  const result = await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options);

  assert.equal(result.productCount, 1);
  assert.equal(result.paymentEffect, 'cash_refunded');

  const updatedProd = store.get(`tenants/${TENANT_ID}/products/prod_measured`);
  assert.equal(updatedProd.data.stockQuantityMinor, 2000);
  assert.equal(updatedProd.data.inventoryValueCentavos, 100000);
  assert.equal(updatedProd.data.averageUnitCostCentavos, 50000);
});

test('changed product position causes zero writes', async () => {
  const seed = buildBaseSeed({}, { currentStock: 20 });
  const { db, store } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  const snapshotBefore = JSON.stringify(Array.from(store.docs.entries()));

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.PO_NOT_REVERSIBLE,
  );

  const snapshotAfter = JSON.stringify(Array.from(store.docs.entries()));
  assert.equal(snapshotBefore, snapshotAfter, 'Store must be unchanged after failed reversal');
});

test('malformed restock event causes zero writes', async () => {
  const seed = buildBaseSeed();
  delete (seed[`tenants/${TENANT_ID}/restock_events/event_restock_1`] as Record<string, unknown>).landedCostCentavos;
  const { db, store } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  const snapshotBefore = JSON.stringify(Array.from(store.docs.entries()));

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError,
  );

  const snapshotAfter = JSON.stringify(Array.from(store.docs.entries()));
  assert.equal(snapshotBefore, snapshotAfter);
});

test('same-key replay returns same receipt', async () => {
  const seed = buildBaseSeed();
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test reversal',
  };

  const result1 = await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options);
  const result2 = await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options);

  assert.equal(result1.reversalId, result2.reversalId);
  assert.equal(result1.purchaseOrderId, result2.purchaseOrderId);
  assert.equal(result1.voidedAt, result2.voidedAt);
  assert.equal(result1.paymentEffect, result2.paymentEffect);
});

test('different key replay validates stored integrity', async () => {
  const seed = buildBaseSeed();
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req1: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Original reason',
  };

  const result1 = await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req1, options);

  const req2: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '87654321-4321-4238-8234-210987654321',
    reason: 'Different reason',
  };

  const result2 = await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req2, options);

  assert.equal(result1.reversalId, result2.reversalId);
  assert.equal(result1.purchaseOrderId, result2.purchaseOrderId);
});

test('concurrent different-key requests reverse exactly once and replay one receipt', async () => {
  const seed = buildBaseSeed();
  const { db, store } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const [first, second] = await Promise.all([
    executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, {
      purchaseOrderId: 'po_1',
      idempotencyKey: '12345678-1234-4238-8234-123456789012',
      reason: 'First operator reason',
    }, options),
    executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, {
      purchaseOrderId: 'po_1',
      idempotencyKey: '87654321-4321-4238-8234-210987654321',
      reason: 'Second operator reason',
    }, options),
  ]);

  assert.deepEqual(second, first);
  const reversalDocs = Array.from(store.docs.keys()).filter((path) => path.includes('/restock_reversals/'));
  const movementDocs = Array.from(store.docs.keys()).filter((path) => path.includes('/inventory_transactions/'));
  assert.equal(reversalDocs.length, 1);
  assert.equal(movementDocs.length, 1);
});

test('supplier credit payment creates payable voiding', async () => {
  const creditSeed = {
    [`tenants/${TENANT_ID}`]: {
      ownerUid: OWNER_UID,
      subscriptionStatus: 'active',
      moduleType: 'benta-snap',
      name: 'Tindahan ni Juan',
    },
    [`tenants/${TENANT_ID}/products/prod_discrete`]: {
      name: 'Canned Goods',
      tenantId: TENANT_ID,
      isActive: true,
      currentStock: 15,
      costPrice: 2267,
      inventoryValueCentavos: 34000,
      averageUnitCostCentavos: 2267,
      latestPurchaseUnitCostCentavos: 2400,
    },
    [`tenants/${TENANT_ID}/purchase_orders/po_credit`]: {
      id: 'po_credit',
      tenantId: TENANT_ID,
      costingVersion: 'moving_average_v1',
      status: 'received',
      paymentStatus: 'credit_unpaid',
      paymentMethod: 'supplier_credit',
      supplierId: 'supp-1',
      supplierName: 'San Miguel Corp',
      totalAmountCentavos: 24000,
      restockEventIds: ['event_credit_1'],
      items: [makePoItem({ restockEventId: 'event_credit_1' })],
      createdByUid: OWNER_UID,
    },
    [`tenants/${TENANT_ID}/restock_events/event_credit_1`]: {
      id: 'event_credit_1',
      eventId: 'event_credit_1',
      tenantId: TENANT_ID,
      inventoryItemId: 'prod_discrete',
      idempotencyKey: 'po_credit',
      purchasedQuantityMinor: 10,
      supplierCostCentavos: 24000,
      freightCentavos: 0,
      otherAcquisitionCostCentavos: 0,
      landedCostCentavos: 24000,
      latestPurchaseUnitCostCentavos: 2400,
      costMovement: 'increased',
      previousPosition: { quantityMinor: 5, quantityScale: 0, inventoryValueCentavos: 10000, averageUnitCostCentavos: 2000 },
      resultingPosition: { quantityMinor: 15, quantityScale: 0, inventoryValueCentavos: 34000, averageUnitCostCentavos: 2267 },
      occurredAtEpochMs: 1_700_000_000_000,
    },
    [`tenants/${TENANT_ID}/credit_accounts/payable_1`]: {
      id: 'payable_1',
      borrowerName: 'San Miguel Corp',
      type: 'payable',
      amountCentavos: 24000,
      description: 'Utang sa Supplier (PO #PO-20260901-ABCD)',
      status: 'UNPAID',
      poId: 'po_credit',
      createdAt: defaultNow(),
    },
  };

  const { db, store } = createMockFirestore(creditSeed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_credit',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Supplier agreed to cancel',
  };

  const result = await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options);

  assert.equal(result.paymentEffect, 'payable_voided');
  assert.equal(result.productCount, 1);

  const payable = store.get(`tenants/${TENANT_ID}/credit_accounts/payable_1`);
  assert.equal(payable.data.status, 'VOIDED');
});

test('gcash payment returns external_payment_unmodified', async () => {
  const gcashSeed = {
    [`tenants/${TENANT_ID}`]: {
      ownerUid: OWNER_UID,
      subscriptionStatus: 'active',
      moduleType: 'benta-snap',
      name: 'Tindahan ni Juan',
    },
    [`tenants/${TENANT_ID}/products/prod_discrete`]: {
      name: 'Canned Goods',
      tenantId: TENANT_ID,
      isActive: true,
      currentStock: 15,
      costPrice: 2267,
      inventoryValueCentavos: 34000,
      averageUnitCostCentavos: 2267,
      latestPurchaseUnitCostCentavos: 2400,
    },
    [`tenants/${TENANT_ID}/purchase_orders/po_gcash`]: {
      id: 'po_gcash',
      tenantId: TENANT_ID,
      costingVersion: 'moving_average_v1',
      status: 'received',
      paymentStatus: 'paid',
      paymentMethod: 'gcash',
      supplierId: 'supp-1',
      supplierName: 'San Miguel Corp',
      totalAmountCentavos: 24000,
      restockEventIds: ['event_gcash_1'],
      items: [makePoItem({ restockEventId: 'event_gcash_1' })],
      createdByUid: OWNER_UID,
    },
    [`tenants/${TENANT_ID}/restock_events/event_gcash_1`]: {
      id: 'event_gcash_1',
      eventId: 'event_gcash_1',
      tenantId: TENANT_ID,
      inventoryItemId: 'prod_discrete',
      idempotencyKey: 'po_gcash',
      purchasedQuantityMinor: 10,
      supplierCostCentavos: 24000,
      freightCentavos: 0,
      otherAcquisitionCostCentavos: 0,
      landedCostCentavos: 24000,
      latestPurchaseUnitCostCentavos: 2400,
      costMovement: 'increased',
      previousPosition: { quantityMinor: 5, quantityScale: 0, inventoryValueCentavos: 10000, averageUnitCostCentavos: 2000 },
      resultingPosition: { quantityMinor: 15, quantityScale: 0, inventoryValueCentavos: 34000, averageUnitCostCentavos: 2267 },
      occurredAtEpochMs: 1_700_000_000_000,
    },
  };

  const { db, store } = createMockFirestore(gcashSeed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_gcash',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test gcash reversal',
  };

  const result = await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options);

  assert.equal(result.paymentEffect, 'external_payment_unmodified');
  assert.equal(result.productCount, 1);

  const updatedProd = store.get(`tenants/${TENANT_ID}/products/prod_discrete`);
  assert.equal(updatedProd.data.currentStock, 5);
});

test('cash balance is restored on successful reversal', async () => {
  const seed = buildBaseSeed();
  const { db, store } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options);

  const cashAccount = store.get(`tenants/${TENANT_ID}/accounts/master-cash`);
  assert.equal(cashAccount.data.balance, 524000);
});

test('raw idempotency key absent from all persisted writes', async () => {
  const seed = buildBaseSeed();
  const { db, store } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options);

  for (const [path, doc] of store.docs) {
    const json = JSON.stringify(doc.data);
    assert.ok(!json.includes('12345678-1234-4238-8234-123456789012'), `Raw idempotency key found in ${path}`);
  }
});

test('no transaction reads after writes', async () => {
  const seed = buildBaseSeed();
  const { db, store: firestore } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options);

  assert.equal(firestore.readAfterWriteDetected, false);
});

test('public receipt does not expose internal fields', async () => {
  const seed = buildBaseSeed();
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  const result = await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options);
  const json = JSON.stringify(result);

  assert.ok(!json.includes('tenantId'));
  assert.ok(!json.includes('ownerUid'));
  assert.ok(!json.includes('eventId'));
  assert.ok(!json.includes('hash'));
  assert.ok(!json.includes('internalEvidence'));
});

test('previousLatestPurchaseUnitCostCentavos is restored', async () => {
  const seed = buildBaseSeed(
    { items: [makePoItem({ previousLatestPurchaseUnitCostCentavos: 2000 })] },
    { latestPurchaseUnitCostCentavos: 3000 },
  );
  const { db, store } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options);

  const updatedProd = store.get(`tenants/${TENANT_ID}/products/prod_discrete`);
  assert.equal(updatedProd.data.latestPurchaseUnitCostCentavos, 2000);
});

test('missing restock event causes failure', async () => {
  const seed = buildBaseSeed();
  delete seed[`tenants/${TENANT_ID}/restock_events/event_restock_1`];
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError,
  );
});

test('tampered PO restockEventIds list causes zero writes', async () => {
  const seed = buildBaseSeed({ restockEventIds: ['different_event'] });
  const { db, store } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };
  const before = JSON.stringify(Array.from(store.docs.entries()));

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, {
      purchaseOrderId: 'po_1',
      idempotencyKey: '12345678-1234-4238-8234-123456789012',
      reason: 'Tampered traceability',
    }, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.INTEGRITY_ERROR,
  );

  assert.equal(JSON.stringify(Array.from(store.docs.entries())), before);
});

test('invalid payment status and method combination fails closed', async () => {
  const seed = buildBaseSeed({ paymentMethod: 'gcash', paymentStatus: 'credit_unpaid' });
  const { db, store } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };
  const before = JSON.stringify(Array.from(store.docs.entries()));

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, {
      purchaseOrderId: 'po_1',
      idempotencyKey: '12345678-1234-4238-8234-123456789012',
      reason: 'Invalid payment evidence',
    }, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.PAYMENT_EVIDENCE_INVALID,
  );

  assert.equal(JSON.stringify(Array.from(store.docs.entries())), before);
});

test('duplicate product IDs in PO causes failure', async () => {
  const seed = buildBaseSeed({
    items: [
      makePoItem({ productId: 'prod_discrete', restockEventId: 'event_1' }),
      makePoItem({ productId: 'prod_discrete', restockEventId: 'event_2' }),
    ],
  });
  seed[`tenants/${TENANT_ID}/restock_events/event_2`] = {
    ...seed[`tenants/${TENANT_ID}/restock_events/event_restock_1`],
    id: 'event_2',
    inventoryItemId: 'prod_discrete',
    idempotencyKey: 'po_1',
  };
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError,
  );
});

test('PO total mismatch causes failure', async () => {
  const seed = buildBaseSeed({ totalAmountCentavos: 99999 });
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError,
  );
});

test('missing expense ledger causes payment_evidence_invalid', async () => {
  const seed = buildBaseSeed();
  delete seed[`tenants/${TENANT_ID}/transactions/expense_1`];
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.PAYMENT_EVIDENCE_INVALID,
  );
});

test('HTTP route handler returns 401 without token', async () => {
  const seed = buildBaseSeed();
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };
  const handler = createRestockReversalRouteHandler(options);

  const req = new Request(`http://localhost/api/owner/tenants/${TENANT_ID}/benta-restock-reversal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchaseOrderId: 'po_1', idempotencyKey: '12345678-1234-4238-8234-123456789012', reason: 'Test' }),
  });

  const resp = await handler(req, { params: Promise.resolve({ tenantId: TENANT_ID }) });
  assert.equal(resp.status, 401);
});

test('HTTP route handler returns 400 for invalid body', async () => {
  const seed = buildBaseSeed();
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };
  const handler = createRestockReversalRouteHandler(options);

  const req = new Request(`http://localhost/api/owner/tenants/${TENANT_ID}/benta-restock-reversal`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_VALID}`, 'Content-Type': 'application/json' },
    body: '{not-json',
  });

  const resp = await handler(req, { params: Promise.resolve({ tenantId: TENANT_ID }) });
  assert.equal(resp.status, 400);
});

test('HTTP route handler returns 201 on success', async () => {
  const seed = buildBaseSeed();
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };
  const handler = createRestockReversalRouteHandler(options);

  const req = new Request(`http://localhost/api/owner/tenants/${TENANT_ID}/benta-restock-reversal`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_VALID}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchaseOrderId: 'po_1', idempotencyKey: '12345678-1234-4238-8234-123456789012', reason: 'Test reversal' }),
  });

  const resp = await handler(req, { params: Promise.resolve({ tenantId: TENANT_ID }) });
  assert.equal(resp.status, 201);

  const body = await resp.json();
  assert.equal(body.reversalId.length, 64);
  assert.equal(body.purchaseOrderId, 'po_1');
  assert.equal(body.paymentEffect, 'cash_refunded');
});

test('idempotency conflict on different fingerprint', async () => {
  const seed = buildBaseSeed();
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req1: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'First reason',
  };

  await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req1, options);

  const req2: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Second reason',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req2, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.IDEMPOTENCY_CONFLICT,
  );
});

test('original events and ledgers are retained', async () => {
  const seed = buildBaseSeed();
  const { db, store } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options);

  const originalEvent = store.get(`tenants/${TENANT_ID}/restock_events/event_restock_1`);
  assert.equal(originalEvent.exists, true);
  assert.equal(originalEvent.data.idempotencyKey, '11111111-1111-4111-8111-111111111111');

  const originalExpense = store.get(`tenants/${TENANT_ID}/transactions/expense_1`);
  assert.equal(originalExpense.exists, true);
  assert.equal(originalExpense.data.type, 'expense');
});

test('transaction failure leaves inventory unchanged', async () => {
  const seed = buildBaseSeed({}, { currentStock: 15 });
  const { db, store } = createMockFirestore(seed, true);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    /Injected transaction failure/,
  );

  const updatedProd = store.get(`tenants/${TENANT_ID}/products/prod_discrete`);
  assert.equal(updatedProd.data.currentStock, 15);
});

test('restock reversal idempotency document ID is deterministic', () => {
  const id1 = restockReversalIdDocumentId(TENANT_ID, 'po_1');
  const id2 = restockReversalIdDocumentId(TENANT_ID, 'po_1');
  assert.equal(id1, id2);
  assert.equal(id1.length, 64);
});

test('restock reversal fingerprint is deterministic', () => {
  const fp1 = restockReversalFingerprint(TENANT_ID, 'po_1', 'Test reason');
  const fp2 = restockReversalFingerprint(TENANT_ID, 'po_1', 'Test reason');
  assert.equal(fp1, fp2);
});

test('restock reversal movement ID is deterministic', () => {
  const movId1 = restockReversalMovementId(TENANT_ID, 'po_1', 'prod_1');
  const movId2 = restockReversalMovementId(TENANT_ID, 'po_1', 'prod_1');
  assert.equal(movId1, movId2);
  assert.equal(movId1.length, 64);
});

test('voided PO with paymentStatus voided returns PO_ALREADY_VOIDED', async () => {
  const seed = buildBaseSeed({ status: 'voided', paymentStatus: 'voided' });
  const { db } = createMockFirestore(seed);
  const options: ReversalServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const req: RestockReversalRequest = {
    purchaseOrderId: 'po_1',
    idempotencyKey: '12345678-1234-4238-8234-123456789012',
    reason: 'Test',
  };

  await assert.rejects(
    () => executeBentaRestockReversal(TENANT_ID, TOKEN_VALID, req, options),
    (err: unknown) => err instanceof RestockReversalError && err.code === RestockReversalErrorCode.PO_ALREADY_VOIDED,
  );
});
