import test from 'node:test';
import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';

import { purchaseOrderSchema } from '../src/lib/schemas/supplier';
import {
  executeBentaInventoryRestock,
  createBentaInventoryRestockRouteHandler,
  validateBentaRestockRequest,
  restockIdempotencyDocumentId,
  restockFingerprint,
  sanitizeStoredRestockResult,
  BentaRestockError,
  BentaRestockErrorCode,
  type BentaRestockRequest,
  type BentaRestockServiceOptions,
} from '../src/lib/server/benta-inventory-restock';

interface MockDocumentReference {
  id: string;
  path: string;
  collection: (name: string) => MockCollectionReference;
}

interface MockCollectionReference {
  doc: (id?: string) => MockDocumentReference;
}

function createMockFirestore(seed: Record<string, Record<string, unknown>>, failCommit = false) {
  let sequence = 0;
  const store: Record<string, Record<string, unknown>> = JSON.parse(JSON.stringify(seed));

  const collection = (path: string): MockCollectionReference => ({
    doc: (id?: string): MockDocumentReference => {
      const docId = id || `generated_${++sequence}`;
      const fullPath = `${path}/${docId}`;
      return {
        id: docId,
        path: fullPath,
        collection: (name: string) => collection(`${fullPath}/${name}`),
      };
    },
  });

  const makeSnapshot = (ref: MockDocumentReference, source: Record<string, Record<string, unknown>>) => ({
    id: ref.id,
    ref,
    exists: source[ref.path] !== undefined,
    data: () => (source[ref.path] ? JSON.parse(JSON.stringify(source[ref.path])) : undefined),
  });

  const db = {
    collection,
    runTransaction: async (work: (transaction: unknown) => Promise<unknown>) => {
      const staged: Record<string, Record<string, unknown>> = JSON.parse(JSON.stringify(store));
      let writesPerformed = 0;

      const assertNoReadAfterWrite = (op: string, ref: MockDocumentReference) => {
        if (writesPerformed > 0) {
          throw new Error(`Firestore transaction discipline violated: ${op} called on ${ref.path} after ${writesPerformed} write(s)`);
        }
      };

      const transaction = {
        get: async (ref: MockDocumentReference) => {
          assertNoReadAfterWrite('get', ref);
          return makeSnapshot(ref, staged);
        },
        getAll: async (...refs: MockDocumentReference[]) => {
          for (const ref of refs) {
            assertNoReadAfterWrite('getAll', ref);
          }
          return refs.map((ref) => makeSnapshot(ref, staged));
        },
        set: (ref: MockDocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          writesPerformed++;
          if (options?.merge && staged[ref.path]) {
            staged[ref.path] = { ...staged[ref.path], ...JSON.parse(JSON.stringify(data)) };
          } else {
            staged[ref.path] = JSON.parse(JSON.stringify(data));
          }
        },
        update: (ref: MockDocumentReference, data: Record<string, unknown>) => {
          writesPerformed++;
          if (staged[ref.path] === undefined) {
            throw new Error(`Document missing at ${ref.path}`);
          }
          staged[ref.path] = { ...staged[ref.path], ...JSON.parse(JSON.stringify(data)) };
        },
        delete: (ref: MockDocumentReference) => {
          writesPerformed++;
          delete staged[ref.path];
        },
      };

      const result = await work(transaction);
      if (failCommit) {
        throw new Error('Injected transaction failure');
      }

      for (const key of Object.keys(store)) {
        delete store[key];
      }
      Object.assign(store, JSON.parse(JSON.stringify(staged)));
      return result;
    },
  };

  return {
    db: db as unknown as admin.firestore.Firestore,
    store,
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

const baseSeed = {
  [`tenants/${TENANT_ID}`]: {
    ownerUid: OWNER_UID,
    subscriptionStatus: 'active',
    moduleType: 'benta-snap',
    name: 'Tindahan ni Juan',
  },
  [`tenants/${TENANT_ID}/suppliers/supp-1`]: {
    name: 'San Miguel Corp',
  },
  [`tenants/${TENANT_ID}/suppliers/supp-rice`]: {
    name: 'Rice Wholesaler',
  },
  [`tenants/${TENANT_ID}/suppliers/supp-oil`]: {
    name: 'Oil Trader',
  },
  [`tenants/${TENANT_ID}/suppliers/supp-credit-1`]: {
    name: 'Credit Supplier Co',
  },
  [`tenants/${TENANT_ID}/accounts/master-cash`]: {
    balance: 500000,
  },
  [`tenants/${TENANT_ID}/products/prod_discrete`]: {
    name: 'Canned Goods',
    tenantId: TENANT_ID,
    isActive: true,
    currentStock: 5,
    costPrice: 2000,
    salePrice: 3000,
  },
  [`tenants/${TENANT_ID}/products/prod_measured`]: {
    name: 'Bigas Dinorado',
    tenantId: TENANT_ID,
    isActive: true,
    quantityMode: 'measured',
    stockQuantityMinor: 2000,
    quantityScale: 3,
    inventoryValueCentavos: 100000,
    averageUnitCostCentavos: 50000,
    costPrice: 50000,
    salePrice: 65000,
  },
  [`tenants/${TENANT_ID}/products/prod_exact_pool`]: {
    name: 'Cooking Oil',
    tenantId: TENANT_ID,
    isActive: true,
    currentStock: 3,
    costPrice: 9999,
    averageUnitCostCentavos: 33,
    inventoryValueCentavos: 100,
    salePrice: 12000,
  },
};

const mockAuth = createMockAuth({
  [TOKEN_VALID]: { uid: OWNER_UID },
  [TOKEN_OTHER]: { uid: 'other_user_456' },
});

const defaultNow = () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000);

test('Owner and tenant authorization are enforced', async () => {
  const { db } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const validRequest: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-auth-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  // 1. Invalid token
  await assert.rejects(
    () => executeBentaInventoryRestock('invalid_token', validRequest, options),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.AUTHENTICATION_REQUIRED,
  );

  // 2. Token UID does not own the tenant
  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_OTHER, validRequest, options),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.FORBIDDEN,
  );

  // 3. Missing tenant
  const missingTenantRequest = { ...validRequest, tenantId: 'tenant_missing' };
  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, missingTenantRequest, options),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.TENANT_NOT_FOUND,
  );

  // 4. Inactive tenant
  const inactiveSeed = {
    ...baseSeed,
    [`tenants/${TENANT_ID}`]: { ownerUid: OWNER_UID, subscriptionStatus: 'suspended', moduleType: 'benta-snap' },
  };
  const { db: inactiveDb } = createMockFirestore(inactiveSeed);
  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, validRequest, { ...options, adminFirestore: inactiveDb }),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.TENANT_INACTIVE,
  );
});

test('Active but ineligible tenant module is rejected', async () => {
  const ineligibleSeed = {
    ...baseSeed,
    [`tenants/${TENANT_ID}`]: { ownerUid: OWNER_UID, subscriptionStatus: 'active', moduleType: 'order-snap' },
  };
  const { db } = createMockFirestore(ineligibleSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const validRequest: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-ineligible-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, validRequest, options),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.TENANT_INACTIVE,
  );
});

test('Supplier authority: missing or mismatched supplier is rejected', async () => {
  const { db } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  // 1. Missing supplier in tenant subcollection
  const missingSupplierRequest: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-supp-missing-1',
    supplierId: 'supp-nonexistent',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, missingSupplierRequest, options),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.SUPPLIER_NOT_FOUND,
  );

  // 2. Mismatched supplier name
  const mismatchedSupplierRequest: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-supp-mismatch-1',
    supplierId: 'supp-1',
    supplierName: 'Fake Different Supplier Name',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, mismatchedSupplierRequest, options),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.INVALID_REQUEST,
  );
});

test('A discrete legacy product is projected and restocked correctly', async () => {
  const { db, store } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-discrete-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  const result = await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  assert.equal(result.success, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantityMode, 'discrete');
  assert.equal(result.items[0].purchasedQuantity, 10);
  assert.equal(result.items[0].quantityScale, 0);
  assert.equal(result.items[0].landedCostCentavos, 24000);
  assert.equal(result.items[0].latestPurchaseUnitCostCentavos, 2400);
  assert.equal(result.items[0].costMovement, 'increased');
  assert.equal(result.items[0].resultingPosition.quantityMinor, 15);
  assert.equal(result.items[0].resultingPosition.inventoryValueCentavos, 34000);
  assert.equal(result.items[0].resultingPosition.averageUnitCostCentavos, 2267);

  const updatedProd = store[`tenants/${TENANT_ID}/products/prod_discrete`];
  assert.equal(updatedProd.currentStock, 15);
  assert.equal(updatedProd.inventoryValueCentavos, 34000);
  assert.equal(updatedProd.averageUnitCostCentavos, 2267);
  assert.equal(updatedProd.costPrice, 2267);
  assert.equal(updatedProd.latestPurchaseUnitCostCentavos, 2400);
  assert.equal(updatedProd.salePrice, 3000);
});

test('A measured product uses stockQuantityMinor and scale 3', async () => {
  const { db, store } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-measured-1',
    supplierId: 'supp-rice',
    supplierName: 'Rice Wholesaler',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{
      productId: 'prod_measured',
      quantityMode: 'measured',
      quantityMinor: 5000,
      quantityScale: 3,
      supplierCostCentavos: 275000,
    }],
  };

  const result = await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  assert.equal(result.success, true);
  assert.equal(result.items[0].quantityMode, 'measured');
  assert.equal(result.items[0].purchasedQuantity, 5000);
  assert.equal(result.items[0].quantityScale, 3);
  assert.equal(result.items[0].resultingPosition.quantityMinor, 7000);
  assert.equal(result.items[0].resultingPosition.inventoryValueCentavos, 375000);
  assert.equal(result.items[0].resultingPosition.averageUnitCostCentavos, 53571);

  const updatedProd = store[`tenants/${TENANT_ID}/products/prod_measured`];
  assert.equal(updatedProd.stockQuantityMinor, 7000);
  assert.equal(updatedProd.currentStock, undefined);
  assert.equal(updatedProd.inventoryValueCentavos, 375000);
  assert.equal(updatedProd.averageUnitCostCentavos, 53571);
  assert.equal(updatedProd.costPrice, 53571);
  assert.equal(updatedProd.latestPurchaseUnitCostCentavos, 55000);
});

test('Missing measured quantity fails closed', async () => {
  const { db } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  // 1. Measured request sent for discrete product
  const mismatchedRequest1: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-fail-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantityMode: 'measured', quantityMinor: 1000, quantityScale: 3, supplierCostCentavos: 1000 }],
  };
  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, mismatchedRequest1, options),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.PRODUCT_INVALID,
  );

  // 2. Discrete request sent for measured product
  const mismatchedRequest2: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-fail-2',
    supplierId: 'supp-rice',
    supplierName: 'Rice Wholesaler',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_measured', quantity: 5, supplierCostCentavos: 1000 }],
  };
  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, mismatchedRequest2, options),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.PRODUCT_INVALID,
  );
});

test('Fail-closed stored product validation: malformed stored data aborts with zero writes', async () => {
  const malformedSeeds = [
    {
      label: 'missing/empty product name',
      seedMod: { name: '' },
    },
    {
      label: 'discrete product missing currentStock',
      seedMod: { currentStock: undefined },
    },
    {
      label: 'discrete product negative currentStock',
      seedMod: { currentStock: -5 },
    },
    {
      label: 'discrete product unsafe integer currentStock',
      seedMod: { currentStock: 1.5 },
    },
    {
      label: 'malformed non-number costPrice',
      seedMod: { costPrice: 'not-a-number' },
    },
    {
      label: 'negative costPrice',
      seedMod: { costPrice: -100 },
    },
    {
      label: 'malformed inventoryValueCentavos',
      seedMod: { inventoryValueCentavos: -500 },
    },
    {
      label: 'malformed averageUnitCostCentavos',
      seedMod: { averageUnitCostCentavos: 2.7 },
    },
    {
      label: 'measured product missing stockQuantityMinor',
      seedMod: { quantityMode: 'measured', stockQuantityMinor: undefined },
    },
    {
      label: 'measured product unsupported scale 2',
      seedMod: { quantityMode: 'measured', stockQuantityMinor: 1000, quantityScale: 2 },
    },
  ];

  for (const { label, seedMod } of malformedSeeds) {
    const testSeed = {
      ...baseSeed,
      [`tenants/${TENANT_ID}/products/prod_bad`]: {
        name: 'Test Product',
        tenantId: TENANT_ID,
        isActive: true,
        currentStock: 10,
        costPrice: 1000,
        ...seedMod,
      },
    };

    const { db, store } = createMockFirestore(testSeed);
    const snapshotBefore = JSON.stringify(store);
    const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

    const request: BentaRestockRequest = {
      tenantId: TENANT_ID,
      idempotencyKey: `idemp-bad-${label.replace(/\s+/g, '-')}`,
      supplierId: 'supp-1',
      supplierName: 'San Miguel Corp',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      items: [{
        productId: 'prod_bad',
        ...(seedMod.quantityMode === 'measured'
          ? { quantityMode: 'measured' as const, quantityMinor: 1000, quantityScale: 3 as const }
          : { quantity: 5 }),
        supplierCostCentavos: 5000,
      }],
    };

    await assert.rejects(
      () => executeBentaInventoryRestock(TOKEN_VALID, request, options),
      (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.PRODUCT_INVALID,
      `Failed to fail-closed on ${label}`,
    );

    const snapshotAfter = JSON.stringify(store);
    assert.equal(snapshotBefore, snapshotAfter, `Store must have zero writes for malformed stored data: ${label}`);
  }
});

test('Cash-account safety: missing, malformed, insufficient, and exact balance handling', async () => {
  const options = (db: admin.firestore.Firestore): BentaRestockServiceOptions => ({
    adminAuth: mockAuth,
    adminFirestore: db,
    now: defaultNow,
  });

  const validRequest: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-cash-safety-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  // 1. Missing master-cash account
  const noAccountSeed = { ...baseSeed };
  delete (noAccountSeed as Record<string, unknown>)[`tenants/${TENANT_ID}/accounts/master-cash`];
  const { db: dbNoAccount } = createMockFirestore(noAccountSeed);
  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, validRequest, options(dbNoAccount)),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.INSUFFICIENT_FUNDS,
  );

  // 2. Malformed balance (negative)
  const negBalanceSeed = {
    ...baseSeed,
    [`tenants/${TENANT_ID}/accounts/master-cash`]: { balance: -100 },
  };
  const { db: dbNegBalance } = createMockFirestore(negBalanceSeed);
  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, validRequest, options(dbNegBalance)),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.INSUFFICIENT_FUNDS,
  );

  // 3. Insufficient balance (balance < 24000)
  const lowBalanceSeed = {
    ...baseSeed,
    [`tenants/${TENANT_ID}/accounts/master-cash`]: { balance: 20000 },
  };
  const { db: dbLowBalance } = createMockFirestore(lowBalanceSeed);
  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, validRequest, options(dbLowBalance)),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.INSUFFICIENT_FUNDS,
  );

  // 4. Exact-balance payment (balance === 24000 -> resulting balance is exactly 0)
  const exactBalanceSeed = {
    ...baseSeed,
    [`tenants/${TENANT_ID}/accounts/master-cash`]: { balance: 24000 },
  };
  const { db: dbExactBalance, store: storeExact } = createMockFirestore(exactBalanceSeed);
  const result = await executeBentaInventoryRestock(TOKEN_VALID, validRequest, options(dbExactBalance));
  assert.equal(result.success, true);
  assert.equal(storeExact[`tenants/${TENANT_ID}/accounts/master-cash`].balance, 0);
});

test('Safe idempotency replay: strips unexpected stored fields and rejects malformed records', async () => {
  const validRequest: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-replay-safe-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  const idempDocId = restockIdempotencyDocumentId(OWNER_UID, validRequest.idempotencyKey);
  const validFp = restockFingerprint(OWNER_UID, validRequest, 'San Miguel Corp');

  // 1. Idempotency record with injected secret fields
  const tamperedSeed = {
    ...baseSeed,
    [`tenants/${TENANT_ID}/restock_idempotency/${idempDocId}`]: {
      idempotencyKey: validRequest.idempotencyKey,
      fingerprint: validFp,
      result: {
        success: true,
        purchaseOrderId: 'po_123',
        poNumber: 'PO-20260901-ABCD',
        committedAt: new Date().toISOString(),
        supplierId: 'supp-1',
        supplierName: 'San Miguel Corp',
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        totalAmountCentavos: 24000,
        secretApiKey: 'super_secret_leak',
        internalTenantPath: `tenants/${TENANT_ID}`,
        items: [
          {
            productId: 'prod_discrete',
            productName: 'Canned Goods',
            quantityMode: 'discrete',
            purchasedQuantity: 10,
            quantityScale: 0,
            landedCostCentavos: 24000,
            latestPurchaseUnitCostCentavos: 2400,
            costMovement: 'increased',
            privateAuditToken: 'leak_123',
            resultingPosition: {
              quantityMinor: 15,
              quantityScale: 0,
              inventoryValueCentavos: 34000,
              averageUnitCostCentavos: 2267,
              rawInternalBigInt: '12345',
            },
          },
        ],
      },
    },
  };

  const { db: dbTampered } = createMockFirestore(tamperedSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: dbTampered, now: defaultNow };

  const replayed = await executeBentaInventoryRestock(TOKEN_VALID, validRequest, options);

  assert.equal(replayed.success, true);
  assert.equal(replayed.purchaseOrderId, 'po_123');
  assert.equal((replayed as unknown as Record<string, unknown>).secretApiKey, undefined);
  assert.equal((replayed as unknown as Record<string, unknown>).internalTenantPath, undefined);
  assert.equal((replayed.items[0] as unknown as Record<string, unknown>).privateAuditToken, undefined);
  assert.equal((replayed.items[0].resultingPosition as unknown as Record<string, unknown>).rawInternalBigInt, undefined);
  assert.equal(Object.isFrozen(replayed), true);

  // 2. Corrupted/incomplete stored result fails closed as idempotency conflict
  const corruptedSeed = {
    ...baseSeed,
    [`tenants/${TENANT_ID}/restock_idempotency/${idempDocId}`]: {
      idempotencyKey: validRequest.idempotencyKey,
      fingerprint: validFp,
      result: {
        success: true,
        // missing required fields
      },
    },
  };
  const { db: dbCorrupted } = createMockFirestore(corruptedSeed);
  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, validRequest, { ...options, adminFirestore: dbCorrupted }),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.IDEMPOTENCY_CONFLICT,
  );
});

test('Existing exact inventory value takes precedence over legacy costPrice', async () => {
  const { db } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-exact-pool-1',
    supplierId: 'supp-oil',
    supplierName: 'Oil Trader',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_exact_pool', quantity: 3, supplierCostCentavos: 96 }],
  };

  const result = await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  assert.equal(result.items[0].resultingPosition.quantityMinor, 6);
  assert.equal(result.items[0].resultingPosition.inventoryValueCentavos, 196);
  assert.equal(result.items[0].resultingPosition.averageUnitCostCentavos, 33);
  assert.equal(result.items[0].costMovement, 'decreased');
});

test('Moving-average inventory value and average cost are persisted correctly', async () => {
  const { db, store } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-persist-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{
      productId: 'prod_discrete',
      quantity: 10,
      supplierCostCentavos: 24000,
      freightCentavos: 1000,
      otherAcquisitionCostCentavos: 500,
    }],
  };

  await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  const product = store[`tenants/${TENANT_ID}/products/prod_discrete`];
  assert.equal(product.inventoryValueCentavos, 35500);
  assert.equal(product.averageUnitCostCentavos, 2367);
  assert.equal(product.latestPurchaseUnitCostCentavos, 2550);
});

test('costPrice mirrors the resulting average, not the latest supplier price', async () => {
  const { db, store } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-cost-mirror-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 50000 }],
  };

  await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  const product = store[`tenants/${TENANT_ID}/products/prod_discrete`];
  assert.equal(product.latestPurchaseUnitCostCentavos, 5000);
  assert.equal(product.averageUnitCostCentavos, 4000);
  assert.equal(product.costPrice, 4000);
  assert.notEqual(product.costPrice, 5000);
});

test('Sale price remains unchanged', async () => {
  const { db, store } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-saleprice-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  const product = store[`tenants/${TENANT_ID}/products/prod_discrete`];
  assert.equal(product.salePrice, 3000);
});

test('Restock event snapshots contain correct previous and resulting positions', async () => {
  const { db, store } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-event-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  const eventEntry = Object.entries(store).find(([k]) => k.includes('/restock_events/'));
  assert.ok(eventEntry, 'Restock event must be created in store');
  const event = eventEntry[1] as Record<string, unknown>;

  assert.equal(event.tenantId, TENANT_ID);
  assert.equal(event.performedBy, OWNER_UID);
  assert.equal(event.idempotencyKey, 'idemp-event-1');
  assert.equal(event.inventoryItemId, 'prod_discrete');
  assert.equal(event.landedCostCentavos, 24000);
  assert.equal(event.costMovement, 'increased');

  const prev = event.previousPosition as Record<string, unknown>;
  assert.equal(prev.quantityMinor, 5);
  assert.equal(prev.inventoryValueCentavos, 10000);
  assert.equal(prev.averageUnitCostCentavos, 2000);

  const resulting = event.resultingPosition as Record<string, unknown>;
  assert.equal(resulting.quantityMinor, 15);
  assert.equal(resulting.inventoryValueCentavos, 34000);
  assert.equal(resulting.averageUnitCostCentavos, 2267);
});

test('Same key + same payload returns the prior result without a second stock increase', async () => {
  const { db, store } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-replay-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  const result1 = await executeBentaInventoryRestock(TOKEN_VALID, request, options);
  const stockAfterFirst = store[`tenants/${TENANT_ID}/products/prod_discrete`].currentStock;
  const cashAfterFirst = store[`tenants/${TENANT_ID}/accounts/master-cash`].balance;
  assert.equal(stockAfterFirst, 15);
  assert.equal(cashAfterFirst, 500000 - 24000);

  const result2 = await executeBentaInventoryRestock(TOKEN_VALID, request, options);
  assert.deepEqual(result1, result2);

  const stockAfterSecond = store[`tenants/${TENANT_ID}/products/prod_discrete`].currentStock;
  const cashAfterSecond = store[`tenants/${TENANT_ID}/accounts/master-cash`].balance;
  assert.equal(stockAfterSecond, 15);
  assert.equal(cashAfterSecond, 500000 - 24000);
});

test('Same key + different payload returns idempotency conflict', async () => {
  const { db } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request1: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-conflict-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  const request2: BentaRestockRequest = {
    ...request1,
    items: [{ productId: 'prod_discrete', quantity: 20, supplierCostCentavos: 48000 }],
  };

  await executeBentaInventoryRestock(TOKEN_VALID, request1, options);

  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, request2, options),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.IDEMPOTENCY_CONFLICT,
  );
});

test('Duplicate product IDs and malformed money/quantity values are rejected', () => {
  const baseRequest: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-validate-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  // 1. Duplicate product ID
  assert.throws(
    () => validateBentaRestockRequest({
      ...baseRequest,
      items: [
        { productId: 'prod_discrete', quantity: 5, supplierCostCentavos: 1000 },
        { productId: 'prod_discrete', quantity: 5, supplierCostCentavos: 1000 },
      ],
    }),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.INVALID_REQUEST,
  );

  // 2. Negative quantity
  assert.throws(
    () => validateBentaRestockRequest({
      ...baseRequest,
      items: [{ productId: 'prod_discrete', quantity: -5, supplierCostCentavos: 1000 }],
    }),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.INVALID_REQUEST,
  );

  // 3. Unsafe integer quantity
  assert.throws(
    () => validateBentaRestockRequest({
      ...baseRequest,
      items: [{ productId: 'prod_discrete', quantity: 1.5, supplierCostCentavos: 1000 }],
    }),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.INVALID_REQUEST,
  );

  // 4. Negative cost
  assert.throws(
    () => validateBentaRestockRequest({
      ...baseRequest,
      items: [{ productId: 'prod_discrete', quantity: 5, supplierCostCentavos: -100 }],
    }),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.INVALID_REQUEST,
  );

  // 5. Invalid payment combination (credit with paid)
  assert.throws(
    () => validateBentaRestockRequest({
      ...baseRequest,
      paymentMethod: 'supplier_credit',
      paymentStatus: 'paid',
    }),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.INVALID_REQUEST,
  );

  // 6. Unknown extra fields
  assert.throws(
    () => validateBentaRestockRequest({
      ...baseRequest,
      extraField: 'not_allowed',
    }),
    (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.INVALID_REQUEST,
  );
});

test('A transaction failure leaves inventory, PO, events, accounts, and idempotency state unchanged', async () => {
  const { db, store } = createMockFirestore(baseSeed, true); // failCommit = true
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const snapshotBefore = JSON.stringify(store);

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-rollback-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  await assert.rejects(
    () => executeBentaInventoryRestock(TOKEN_VALID, request, options),
    /Injected transaction failure/,
  );

  const snapshotAfter = JSON.stringify(store);
  assert.equal(snapshotBefore, snapshotAfter, 'All Firestore documents must remain completely untouched on failure');
});

test('Responses and errors contain no tenant/authentication/raw-error data', async () => {
  const { db } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-sanitize-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  const result = await executeBentaInventoryRestock(TOKEN_VALID, request, options);
  const resultJson = JSON.stringify(result);

  assert.ok(!resultJson.includes(TENANT_ID), 'Response must not contain tenant ID');
  assert.ok(!resultJson.includes(OWNER_UID), 'Response must not contain owner UID');
  assert.ok(!resultJson.includes('token_'), 'Response must not contain auth token');

  const handler = createBentaInventoryRestockRouteHandler(options);
  const badReq = new Request('http://localhost/api/owner/benta-inventory-restock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_OTHER}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const response = await handler(badReq);
  assert.equal(response.status, 403);
  const errorBody = await response.json();
  assert.deepEqual(errorBody, {
    error: 'Operation not permitted.',
    category: 'FORBIDDEN',
  });
});

test('Returned result objects are sanitized and immutable where applicable', async () => {
  const { db } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-freeze-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  const result = await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.items), true);
  assert.equal(Object.isFrozen(result.items[0]), true);
  assert.equal(Object.isFrozen(result.items[0].resultingPosition), true);
});

test('Cash payment updates master-cash and creates expense transaction', async () => {
  const { db, store } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-cash-payment-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash_drawer',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  const masterAccount = store[`tenants/${TENANT_ID}/accounts/master-cash`];
  assert.equal(masterAccount.balance, 500000 - 24000);

  const txEntry = Object.entries(store).find(([k]) => k.includes('/transactions/'));
  assert.ok(txEntry, 'Expense transaction must be created');
  const tx = txEntry[1] as Record<string, unknown>;
  assert.equal(tx.type, 'expense');
  assert.equal(tx.amount, 24000);
  assert.equal(tx.category, 'Restock / Inventory Purchase');
  assert.equal(tx.accountId, 'master-cash');
});

test('Credit payment creates payable record in credit_accounts', async () => {
  const { db, store } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-credit-1',
    supplierId: 'supp-credit-1',
    supplierName: 'Credit Supplier Co',
    paymentStatus: 'credit_unpaid',
    paymentMethod: 'supplier_credit',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  const masterAccount = store[`tenants/${TENANT_ID}/accounts/master-cash`];
  assert.equal(masterAccount.balance, 500000, 'Master cash must not be deducted for credit purchases');

  const creditEntry = Object.entries(store).find(([k]) => k.includes('/credit_accounts/'));
  assert.ok(creditEntry, 'Payable credit record must be created');
  const credit = creditEntry[1] as Record<string, unknown>;
  assert.equal(credit.type, 'payable');
  assert.equal(credit.status, 'UNPAID');
  assert.equal(credit.amountCentavos, 24000);
  assert.equal(credit.borrowerName, 'Credit Supplier Co');
});

test('HTTP route handler correctly handles requests and responses', async () => {
  const { db } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };
  const handler = createBentaInventoryRestockRouteHandler(options);

  // 1. Success 200
  const validReq = new Request('http://localhost/api/owner/benta-inventory-restock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_VALID}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      idempotencyKey: 'idemp-route-success-1',
      supplierId: 'supp-1',
      supplierName: 'San Miguel Corp',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
    }),
  });
  const res200 = await handler(validReq);
  assert.equal(res200.status, 200);
  const body200 = await res200.json();
  assert.equal(body200.success, true);
  assert.equal(body200.totalAmountCentavos, 24000);

  // 2. Missing token 401
  const noAuthReq = new Request('http://localhost/api/owner/benta-inventory-restock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const res401 = await handler(noAuthReq);
  assert.equal(res401.status, 401);

  // 3. Invalid JSON body 400
  const malformedReq = new Request('http://localhost/api/owner/benta-inventory-restock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_VALID}`, 'Content-Type': 'application/json' },
    body: '{not-json',
  });
  const res400 = await handler(malformedReq);
  assert.equal(res400.status, 400);
});

test('Fingerprint canonicalizes item order and creates deterministic idempotency IDs', () => {
  const reqA: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-order-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [
      { productId: 'prod_2', quantity: 5, supplierCostCentavos: 1000 },
      { productId: 'prod_1', quantity: 10, supplierCostCentavos: 2000 },
    ],
  };

  const reqB: BentaRestockRequest = {
    ...reqA,
    items: [...reqA.items].reverse(),
  };

  const fpA = restockFingerprint(OWNER_UID, reqA, 'San Miguel Corp');
  const fpB = restockFingerprint(OWNER_UID, reqB, 'San Miguel Corp');
  assert.equal(fpA, fpB, 'Fingerprint must be independent of item array ordering');

  const id1 = restockIdempotencyDocumentId(OWNER_UID, 'idemp-order-1');
  const id2 = restockIdempotencyDocumentId(OWNER_UID, 'idemp-order-1');
  assert.equal(id1, id2);
  assert.equal(id1.length, 64);
  assert.ok(!id1.includes(OWNER_UID));
});

test('Smart Restocking purchase order traceability, position snapshots, and retry stability', async () => {
  const { db, store } = createMockFirestore(baseSeed);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-trace-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  const result = await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  // 1. PO document exists with costingVersion === 'moving_average_v1'
  const poEntry = Object.entries(store).find(([k]) => k.includes('/purchase_orders/'));
  assert.ok(poEntry, 'Purchase order document must be created');
  const po = poEntry[1] as Record<string, unknown>;

  // Schema parsing check proves PO is valid against canonical schema
  const parsedPo = purchaseOrderSchema.parse(po);
  assert.equal(parsedPo.costingVersion, 'moving_average_v1');
  assert.equal(po.costingVersion, 'moving_average_v1');
  assert.ok(Array.isArray(po.restockEventIds));
  assert.equal((po.restockEventIds as string[]).length, 1);

  const expectedEventId = (po.restockEventIds as string[])[0];

  // 2. Restock event document exists with matching event ID
  const eventDoc = store[`tenants/${TENANT_ID}/restock_events/${expectedEventId}`];
  assert.ok(eventDoc, 'Restock event document must exist with deterministic event ID');
  assert.equal(eventDoc.eventId, expectedEventId);

  // 3. Every PO item references its actual restockEventId and stores position snapshots and unitCostCentavos
  const poItems = po.items as Array<Record<string, unknown>>;
  assert.equal(poItems.length, 1);
  assert.equal(poItems[0].restockEventId, expectedEventId);
  assert.equal(poItems[0].unitCostCentavos, 2400); // 2400 centavos = 24.00 unit cost
  assert.equal(poItems[0].latestPurchaseUnitCostCentavos, 2400);
  assert.equal(poItems[0].supplierCostCentavos, 24000);

  const prevSnap = poItems[0].previousPosition as Record<string, unknown>;
  assert.deepEqual(prevSnap, {
    quantityMinor: 5,
    quantityScale: 0,
    inventoryValueCentavos: 10000,
    averageUnitCostCentavos: 2000,
  });

  const resSnap = poItems[0].resultingPosition as Record<string, unknown>;
  assert.deepEqual(resSnap, {
    quantityMinor: 15,
    quantityScale: 0,
    inventoryValueCentavos: 34000,
    averageUnitCostCentavos: 2267,
  });

  // 4. Later product changes do NOT alter historical PO snapshots
  store[`tenants/${TENANT_ID}/products/prod_discrete`].currentStock = 999;
  store[`tenants/${TENANT_ID}/products/prod_discrete`].inventoryValueCentavos = 9999999;
  assert.equal((po.items as Array<Record<string, unknown>>)[0].previousPosition.quantityMinor, 5);
  assert.equal((po.items as Array<Record<string, unknown>>)[0].resultingPosition.quantityMinor, 15);

  // 5. Idempotent retry returns stable result and event IDs
  const retryResult = await executeBentaInventoryRestock(TOKEN_VALID, request, options);
  assert.deepEqual(result, retryResult);

  // 6. Public response does NOT contain private PO audit fields
  assert.equal((result as unknown as Record<string, unknown>).costingVersion, undefined);
  assert.equal((result as unknown as Record<string, unknown>).restockEventIds, undefined);
  assert.equal((result as unknown as Record<string, unknown>).tenantId, undefined);
  assert.equal((result as unknown as Record<string, unknown>).createdByUid, undefined);
  assert.equal((result.items[0] as unknown as Record<string, unknown>).restockEventId, undefined);
});

test('New Smart PO stores previous latest purchase cost internally and does not expose it in public result', async () => {
  const seedWithPriorLatestCost = {
    ...baseSeed,
    [`tenants/${TENANT_ID}/products/prod_discrete`]: {
      ...baseSeed[`tenants/${TENANT_ID}/products/prod_discrete`],
      latestPurchaseUnitCostCentavos: 1900,
    },
  };
  const { db, store } = createMockFirestore(seedWithPriorLatestCost);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-prev-cost-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  const result = await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  const poEntry = Object.entries(store).find(([k]) => k.includes('/purchase_orders/'));
  assert.ok(poEntry, 'Purchase order document must be created');
  const po = poEntry[1] as Record<string, unknown>;

  const poItems = po.items as Array<Record<string, unknown>>;
  assert.equal(poItems.length, 1);

  assert.equal(poItems[0].previousLatestPurchaseUnitCostCentavos, 1900);

  assert.equal((result.items[0] as unknown as Record<string, unknown>).previousLatestPurchaseUnitCostCentavos, undefined);
});

test('Old stored replay result without previousLatestPurchaseUnitCostCentavos remains valid', () => {
  const sanitized = sanitizeStoredRestockResult({
    success: true,
    purchaseOrderId: 'po_old',
    poNumber: 'PO-OLD',
    committedAt: '2026-09-01T00:00:00.000Z',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    totalAmountCentavos: 24000,
    items: [{
      productId: 'prod_discrete',
      productName: 'Canned Goods',
      quantityMode: 'discrete',
      purchasedQuantity: 10,
      quantityScale: 0,
      landedCostCentavos: 24000,
      latestPurchaseUnitCostCentavos: 2400,
      costMovement: 'increased',
      resultingPosition: {
        quantityMinor: 15,
        quantityScale: 0,
        inventoryValueCentavos: 34000,
        averageUnitCostCentavos: 2267,
      },
    }],
  });

  assert.ok(sanitized);
  assert.equal(sanitized.purchaseOrderId, 'po_old');
  assert.equal((sanitized.items[0] as unknown as Record<string, unknown>).previousLatestPurchaseUnitCostCentavos, undefined);
});

test('Malformed prior latest purchase cost fails closed before restock writes', async () => {
  for (const malformed of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
    const malformedSeed = {
      ...baseSeed,
      [`tenants/${TENANT_ID}/products/prod_discrete`]: {
        ...baseSeed[`tenants/${TENANT_ID}/products/prod_discrete`],
        latestPurchaseUnitCostCentavos: malformed,
      },
    };
    const { db } = createMockFirestore(malformedSeed);
    const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

    await assert.rejects(
      () => executeBentaInventoryRestock(TOKEN_VALID, {
        tenantId: TENANT_ID,
        idempotencyKey: `idemp-malformed-latest-${String(malformed)}`,
        supplierId: 'supp-1',
        supplierName: 'San Miguel Corp',
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
      }, options),
      (err: unknown) => err instanceof BentaRestockError && err.code === BentaRestockErrorCode.PRODUCT_INVALID,
    );
  }
});

test('Product without prior latest purchase cost stores undefined previousLatestPurchaseUnitCostCentavos', async () => {
  const seedWithoutLatestCost = {
    ...baseSeed,
    [`tenants/${TENANT_ID}/products/prod_discrete`]: {
      name: 'Canned Goods',
      tenantId: TENANT_ID,
      isActive: true,
      currentStock: 5,
      costPrice: 2000,
      salePrice: 3000,
    },
  };
  const { db, store } = createMockFirestore(seedWithoutLatestCost);
  const options: BentaRestockServiceOptions = { adminAuth: mockAuth, adminFirestore: db, now: defaultNow };

  const request: BentaRestockRequest = {
    tenantId: TENANT_ID,
    idempotencyKey: 'idemp-no-prev-cost-1',
    supplierId: 'supp-1',
    supplierName: 'San Miguel Corp',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    items: [{ productId: 'prod_discrete', quantity: 10, supplierCostCentavos: 24000 }],
  };

  const result = await executeBentaInventoryRestock(TOKEN_VALID, request, options);

  const poEntry = Object.entries(store).find(([k]) => k.includes('/purchase_orders/'));
  assert.ok(poEntry, 'Purchase order document must be created');
  const po = poEntry[1] as Record<string, unknown>;
  const poItems = po.items as Array<Record<string, unknown>>;

  assert.equal(poItems[0].previousLatestPurchaseUnitCostCentavos, undefined);
  assert.equal(result.success, true);
});
