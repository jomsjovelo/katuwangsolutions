import test from 'node:test';
import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';
import {
  projectBentaProductCostPosition,
  consumeBentaProductSale,
  type BentaProductCostingInput,
} from '../src/lib/shared/benta-inventory-costing-adapter';
import {
  completeBentaCashierCheckout,
  CheckoutError,
  type CheckoutRequest,
  type CheckoutReceipt,
} from '../src/lib/server/benta-cashier-checkout';
import {
  finalizeCashierSaleIntent,
} from '../src/lib/server/benta-cashier-intent-finalizer';
import {
  handleBentaSyncClaims,
} from '../src/lib/server/benta-sync-claims-handler';
import { OfflineGrantSigner } from '../src/lib/server/offline-grant-signer';
import { CatalogSnapshotService } from '../src/lib/server/catalog-snapshot-service';
import type {
  CatalogSnapshot,
  OfflineClaimSyncRequest,
  ServerOfflineGrantDoc,
} from '../src/lib/offline/offline-types';

// In-memory Firestore mock for transaction integration tests
function createInMemoryFirestoreMock() {
  const store = new Map<string, Record<string, unknown>>();

  function getDoc(path: string): Record<string, unknown> | undefined {
    return store.get(path);
  }

  function setDoc(path: string, data: Record<string, unknown>): void {
    store.set(path, JSON.parse(JSON.stringify(data)));
  }

  const mockDb = {
    _store: store,
    collection: (collName: string) => ({
      doc: (docId?: string) => {
        const id = docId || `doc_${Math.random().toString(36).slice(2, 9)}`;
        const path = `${collName}/${id}`;
        return {
          id,
          path,
          get: async () => {
            const data = getDoc(path);
            return {
              id,
              exists: !!data,
              data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
              ref: { path, id },
            };
          },
          set: async (d: Record<string, unknown>) => setDoc(path, d),
          update: async (d: Record<string, unknown>) => {
            const current = getDoc(path) || {};
            setDoc(path, { ...current, ...d });
          },
          collection: (subColl: string) => ({
            doc: (subId?: string) => {
              const sid = subId || `doc_${Math.random().toString(36).slice(2, 9)}`;
              const subPath = `${path}/${subColl}/${sid}`;
              return {
                id: sid,
                path: subPath,
                get: async () => {
                  const data = getDoc(subPath);
                  return {
                    id: sid,
                    exists: !!data,
                    data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
                    ref: { path: subPath, id: sid },
                  };
                },
                set: async (d: Record<string, unknown>) => setDoc(subPath, d),
                update: async (d: Record<string, unknown>) => {
                  const current = getDoc(subPath) || {};
                  setDoc(subPath, { ...current, ...d });
                },
              };
            },
          }),
        };
      },
    }),
    runTransaction: async <T>(updateFunction: (t: {
      get: (ref: { path: string; id: string }) => Promise<{ id: string; exists: boolean; data: () => Record<string, unknown> | undefined; ref: { path: string; id: string } }>;
      getAll: (...refs: Array<{ path: string; id: string }>) => Promise<Array<{ id: string; exists: boolean; data: () => Record<string, unknown> | undefined; ref: { path: string; id: string } }>>;
      set: (ref: { path: string; id: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
      create: (ref: { path: string; id: string }, data: Record<string, unknown>) => void;
      update: (ref: { path: string; id: string }, data: Record<string, unknown>) => void;
    }) => Promise<T>): Promise<T> => {
      const stagedWrites: Array<() => void> = [];
      const tx = {
        get: async (ref: { path: string; id: string }) => {
          const data = getDoc(ref.path);
          return {
            id: ref.id,
            exists: !!data,
            data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
            ref,
          };
        },
        getAll: async (...refs: Array<{ path: string; id: string }>) => {
          return refs.map((ref) => {
            const data = getDoc(ref.path);
            return {
              id: ref.id,
              exists: !!data,
              data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
              ref,
            };
          });
        },
        set: (ref: { path: string; id: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          stagedWrites.push(() => {
            if (options?.merge) {
              const current = getDoc(ref.path) || {};
              setDoc(ref.path, { ...current, ...data });
            } else {
              setDoc(ref.path, data);
            }
          });
        },
        create: (ref: { path: string; id: string }, data: Record<string, unknown>) => {
          stagedWrites.push(() => {
            setDoc(ref.path, data);
          });
        },
        update: (ref: { path: string; id: string }, data: Record<string, unknown>) => {
          stagedWrites.push(() => {
            const current = getDoc(ref.path) || {};
            setDoc(ref.path, { ...current, ...data });
          });
        },
      };

      const result = await updateFunction(tx);
      for (const write of stagedWrites) {
        write();
      }
      return result;
    },
  };

  return mockDb;
}

test('projectBentaProductCostPosition: strict exact-pool validation', () => {
  // 1. Missing-value-only fails closed
  assert.throws(
    () =>
      projectBentaProductCostPosition({
        quantityMode: 'discrete',
        currentStock: 5,
        costPrice: 1000,
        averageUnitCostCentavos: 1000,
      }),
    /Partial exact-pool costing fields/,
  );

  // 2. Missing-average-only fails closed
  assert.throws(
    () =>
      projectBentaProductCostPosition({
        quantityMode: 'discrete',
        currentStock: 5,
        costPrice: 1000,
        inventoryValueCentavos: 5000,
      }),
    /Partial exact-pool costing fields/,
  );

  // 3. Inconsistent stored average fails closed
  assert.throws(
    () =>
      projectBentaProductCostPosition({
        quantityMode: 'discrete',
        currentStock: 3,
        costPrice: 1000,
        inventoryValueCentavos: 100, // Derived average = 33
        averageUnitCostCentavos: 50, // Inconsistent with 33!
      }),
    /Inconsistent stored averageUnitCostCentavos/,
  );

  // 4. Malformed average fails closed
  assert.throws(
    () =>
      projectBentaProductCostPosition({
        quantityMode: 'discrete',
        currentStock: 5,
        costPrice: 1000,
        inventoryValueCentavos: 5000,
        averageUnitCostCentavos: -100,
      }),
    /averageUnitCostCentavos must be a non-negative safe integer/,
  );

  // 5. Valid legacy fallback when both are absent
  const legacyProj = projectBentaProductCostPosition({
    quantityMode: 'discrete',
    currentStock: 5,
    costPrice: 1000,
  });
  assert.equal(legacyProj.source, 'legacy-derived');
  assert.equal(legacyProj.position.inventoryValueCentavos, 5000);
  assert.equal(legacyProj.position.averageUnitCostCentavos, 1000);
});

test('consumeBentaProductSale: discrete exact-pool partial consumption', () => {
  const result = consumeBentaProductSale(
    {
      quantityMode: 'discrete',
      currentStock: 10,
      costPrice: 5000,
      inventoryValueCentavos: 50000,
      averageUnitCostCentavos: 5000,
    },
    3,
  );

  assert.equal(result.previousPosition.quantityMinor, 10);
  assert.equal(result.previousPosition.inventoryValueCentavos, 50000);
  assert.equal(result.previousPosition.averageUnitCostCentavos, 5000);

  // Consumed
  assert.equal(result.consumption.consumedQuantityMinor, 3);
  assert.equal(result.consumption.consumedCostCentavos, 15000);
  assert.equal(result.consumption.consumptionUnitCostCentavos, 5000);

  // Remaining
  assert.equal(result.productUpdates.currentStock, 7);
  assert.equal(result.productUpdates.inventoryValueCentavos, 35000);
  assert.equal(result.productUpdates.averageUnitCostCentavos, 5000);
  assert.equal(result.productUpdates.costPrice, 5000);

  // Historical COGS
  assert.equal(result.historicalCogs.unitCostCentavos, 5000);
  assert.equal(result.historicalCogs.lineCostCentavos, 15000);
  assert.equal(result.historicalCogs.costPrice, 5000);
});

test('consumeBentaProductSale: measured scale-3 partial consumption', () => {
  const result = consumeBentaProductSale(
    {
      quantityMode: 'measured',
      currentStock: 0,
      stockQuantityMinor: 5000, // 5.000 kg
      quantityScale: 3,
      costPrice: 20000, // P200.00 / kg
      inventoryValueCentavos: 100000, // P1,000.00
      averageUnitCostCentavos: 20000,
    },
    1500, // 1.500 kg
  );

  assert.equal(result.previousPosition.quantityMinor, 5000);
  assert.equal(result.previousPosition.quantityScale, 3);
  assert.equal(result.consumption.consumedQuantityMinor, 1500);
  assert.equal(result.consumption.consumedCostCentavos, 30000); // P300.00

  // Remaining
  assert.equal(result.productUpdates.stockQuantityMinor, 3500); // 3.500 kg
  assert.equal(result.productUpdates.inventoryValueCentavos, 70000); // P700.00
  assert.equal(result.productUpdates.averageUnitCostCentavos, 20000);
  assert.equal(result.productUpdates.costPrice, 20000);
});

test('consumeBentaProductSale: legacy fallback migration on first sale', () => {
  const result = consumeBentaProductSale(
    {
      quantityMode: 'discrete',
      currentStock: 4,
      costPrice: 2500,
    },
    1,
  );

  // Migrated from legacy 4 * 2500 = 10000
  assert.equal(result.previousPosition.inventoryValueCentavos, 10000);
  assert.equal(result.previousPosition.averageUnitCostCentavos, 2500);

  // Resulting exact-pool updates
  assert.equal(result.productUpdates.currentStock, 3);
  assert.equal(result.productUpdates.inventoryValueCentavos, 7500);
  assert.equal(result.productUpdates.averageUnitCostCentavos, 2500);
  assert.equal(result.productUpdates.costPrice, 2500);
});

test('consumeBentaProductSale: full consumption produces 0/0 basis', () => {
  const result = consumeBentaProductSale(
    {
      quantityMode: 'discrete',
      currentStock: 5,
      costPrice: 3000,
      inventoryValueCentavos: 15000,
      averageUnitCostCentavos: 3000,
    },
    5,
  );

  assert.equal(result.consumption.consumedCostCentavos, 15000);
  assert.equal(result.productUpdates.currentStock, 0);
  assert.equal(result.productUpdates.inventoryValueCentavos, 0);
  assert.equal(result.productUpdates.averageUnitCostCentavos, 0);
  assert.equal(result.productUpdates.costPrice, 0);
});

test('consumeBentaProductSale: exact half-up COGS and value conservation', () => {
  // 3 items with total pool value 100 centavos (average = 33.333... -> 33)
  const result1 = consumeBentaProductSale(
    {
      quantityMode: 'discrete',
      currentStock: 3,
      costPrice: 33,
      inventoryValueCentavos: 100,
      averageUnitCostCentavos: 33,
    },
    1,
  );

  // roundHalfUp(1 * 100 / 3) = round(33.333) = 33
  assert.equal(result1.consumption.consumedCostCentavos, 33);
  assert.equal(result1.productUpdates.inventoryValueCentavos, 67); // 100 - 33 = 67
  assert.equal(result1.productUpdates.currentStock, 2);

  // Consume 1 more from remaining pool of 2 items worth 67 centavos
  const result2 = consumeBentaProductSale(
    {
      quantityMode: 'discrete',
      currentStock: 2,
      costPrice: result1.productUpdates.costPrice,
      inventoryValueCentavos: result1.productUpdates.inventoryValueCentavos,
      averageUnitCostCentavos: result1.productUpdates.averageUnitCostCentavos,
    },
    1,
  );

  // roundHalfUp(1 * 67 / 2) = round(33.5) = 34
  assert.equal(result2.consumption.consumedCostCentavos, 34);
  assert.equal(result2.productUpdates.inventoryValueCentavos, 33); // 67 - 34 = 33
  assert.equal(result2.productUpdates.currentStock, 1);

  // Consume final item
  const result3 = consumeBentaProductSale(
    {
      quantityMode: 'discrete',
      currentStock: 1,
      costPrice: result2.productUpdates.costPrice,
      inventoryValueCentavos: result2.productUpdates.inventoryValueCentavos,
      averageUnitCostCentavos: result2.productUpdates.averageUnitCostCentavos,
    },
    1,
  );

  // 33 - 33 = 0
  assert.equal(result3.consumption.consumedCostCentavos, 33);
  assert.equal(result3.productUpdates.inventoryValueCentavos, 0);
  assert.equal(result3.productUpdates.currentStock, 0);

  // Sum of all 3 consumptions: 33 + 34 + 33 = 100 (exact conservation!)
  assert.equal(
    result1.consumption.consumedCostCentavos +
      result2.consumption.consumedCostCentavos +
      result3.consumption.consumedCostCentavos,
    100,
  );
});

test('consumeBentaProductSale: fails closed on malformed exact-pool or negative values', () => {
  assert.throws(
    () =>
      consumeBentaProductSale(
        {
          quantityMode: 'discrete',
          currentStock: 10,
          costPrice: 5000,
          inventoryValueCentavos: -100,
          averageUnitCostCentavos: 5000,
        },
        1,
      ),
    /inventoryValueCentavos must be a non-negative safe integer/,
  );

  assert.throws(
    () =>
      consumeBentaProductSale(
        {
          quantityMode: 'discrete',
          currentStock: 10,
          costPrice: 5000,
          inventoryValueCentavos: 1.5,
          averageUnitCostCentavos: 5000,
        },
        1,
      ),
    /inventoryValueCentavos must be a non-negative safe integer/,
  );

  assert.throws(
    () =>
      consumeBentaProductSale(
        {
          quantityMode: 'discrete',
          currentStock: 2,
          costPrice: 1000,
          inventoryValueCentavos: 2000,
          averageUnitCostCentavos: 1000,
        },
        5, // consumed > available
      ),
    /Consumption cannot exceed available inventory quantity/,
  );

  assert.throws(
    () =>
      consumeBentaProductSale(
        {
          quantityMode: 'discrete',
          currentStock: 10,
          costPrice: 1000,
        },
        0, // non-positive
      ),
    /consumedQuantity must be a positive safe integer/,
  );
});

test('Cashier Checkout: atomic exact-pool consumption on sale, immutable COGS, receipt without cost', async () => {
  const mockDb = createInMemoryFirestoreMock();

  const tenantId = 'tenant_benta_1';
  const staffAccountId = 'staff_1';
  const shiftId = 'shift_1';

  mockDb._store.set(`tenants/${tenantId}`, {
    id: tenantId,
    status: 'active',
    subscriptionStatus: 'active',
    moduleType: 'benta-snap',
    assignedStaffCount: 1,
    activeStaffAccounts: [staffAccountId],
  });

  mockDb._store.set(`tenants/${tenantId}/staff_accounts/${staffAccountId}`, {
    id: staffAccountId,
    tenantId,
    authUid: 'user_123',
    username: 'cashier1',
    displayName: 'Juan Cashier',
    role: 'cashier',
    status: 'active',
    activeShiftId: shiftId,
    sessionVersion: 1,
  });

  mockDb._store.set(`tenants/${tenantId}/shifts/${shiftId}`, {
    id: shiftId,
    tenantId,
    moduleId: 'benta-snap',
    staffAccountId,
    staffId: `staff_${staffAccountId}`,
    openedBy: `staff_${staffAccountId}`,
    status: 'open',
    startingCash: 1000,
    reconciliationVersion: 1,
    cashSales: 0,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 0,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 0,
  });

  mockDb._store.set(`tenants/${tenantId}/accounts/master-cash`, {
    id: 'master-cash',
    tenantId,
    balance: 50000,
    isActive: true,
  });

  // Seed discrete product with exact cost pool
  mockDb._store.set(`tenants/${tenantId}/products/prod_discrete`, {
    id: 'prod_discrete',
    tenantId,
    name: 'Coke 1.5L',
    unit: 'pcs',
    salePrice: 7500, // P75.00
    costPrice: 5000, // P50.00
    currentStock: 10,
    inventoryValueCentavos: 50000, // P500.00
    averageUnitCostCentavos: 5000,
    latestPurchaseUnitCostCentavos: 5200,
    isActive: true,
    quantityMode: 'discrete',
  });

  // Seed measured product
  mockDb._store.set(`tenants/${tenantId}/products/prod_measured`, {
    id: 'prod_measured',
    tenantId,
    name: 'Brown Sugar',
    unit: 'kg',
    sellingUnit: 'kg',
    salePrice: 8000, // P80.00 / kg
    costPrice: 5000, // P50.00 / kg
    currentStock: 0,
    stockQuantityMinor: 10000, // 10.000 kg
    quantityScale: 3,
    inventoryValueCentavos: 50000, // P500.00
    averageUnitCostCentavos: 5000,
    latestPurchaseUnitCostCentavos: 5000,
    isActive: true,
    quantityMode: 'measured',
  });

  const mockAuth: admin.auth.Auth = {
    verifyIdToken: async (token: string) => {
      assert.equal(token, 'valid_cashier_token');
      return {
        uid: 'user_123',
        tenantId,
        staffAccountId,
        role: 'cashier',
        sessionVersion: 1,
        isBentaStaff: true,
      } as unknown as admin.auth.DecodedIdToken;
    },
  } as unknown as admin.auth.Auth;

  const request: CheckoutRequest = {
    idempotencyKey: '00000000-0000-4000-8000-000000000001',
    moduleId: 'benta-snap',
    shiftId,
    paymentMethod: 'cash',
    items: [
      { productId: 'prod_discrete', quantityMode: 'discrete', quantity: 2 },
      { productId: 'prod_measured', quantityMode: 'measured', quantityMinor: 2000, quantityScale: 3, sellingUnit: 'kg' },
    ],
  };

  const receipt = await completeBentaCashierCheckout('valid_cashier_token', request, {
    adminAuth: mockAuth,
    adminFirestore: mockDb as unknown as admin.firestore.Firestore,
  });

  assert.ok(receipt);
  assert.equal(receipt.totalCentavos, 15000 + 16000); // 2*7500 + 2*8000 = 31000

  // 1. Verify Receipt NEVER exposes cost data
  for (const item of receipt.items) {
    const itemRecord = item as unknown as Record<string, unknown>;
    assert.equal(itemRecord.costPrice, undefined);
    assert.equal(itemRecord.unitCostCentavos, undefined);
    assert.equal(itemRecord.lineCostCentavos, undefined);
    assert.equal(itemRecord.inventoryValueCentavos, undefined);
  }

  // 2. Verify Discrete Product Updates in Firestore
  const updatedDiscrete = mockDb._store.get(`tenants/${tenantId}/products/prod_discrete`)!;
  assert.equal(updatedDiscrete.currentStock, 8); // 10 - 2 = 8
  assert.equal(updatedDiscrete.inventoryValueCentavos, 40000); // 50000 - 10000 = 40000
  assert.equal(updatedDiscrete.averageUnitCostCentavos, 5000);
  assert.equal(updatedDiscrete.costPrice, 5000);
  // Sale price & latest purchase cost MUST remain unchanged
  assert.equal(updatedDiscrete.salePrice, 7500);
  assert.equal(updatedDiscrete.latestPurchaseUnitCostCentavos, 5200);

  // 3. Verify Measured Product Updates in Firestore
  const updatedMeasured = mockDb._store.get(`tenants/${tenantId}/products/prod_measured`)!;
  assert.equal(updatedMeasured.stockQuantityMinor, 8000); // 10000 - 2000 = 8000
  assert.equal(updatedMeasured.inventoryValueCentavos, 40000); // 50000 - 10000 = 40000
  assert.equal(updatedMeasured.averageUnitCostCentavos, 5000);
  assert.equal(updatedMeasured.costPrice, 5000);
  assert.equal(updatedMeasured.salePrice, 8000);
  assert.equal(updatedMeasured.latestPurchaseUnitCostCentavos, 5000);

  // 4. Verify Immutable Sale Items in Firestore
  const saleDoc = Array.from(mockDb._store.entries()).find(([k]) => k.startsWith(`tenants/${tenantId}/sales/`))![1];
  assert.ok(saleDoc);
  const itemsArray = saleDoc.items as Array<Record<string, unknown>>;
  assert.equal(itemsArray.length, 2);

  const saleDiscrete = itemsArray.find((it) => it.productId === 'prod_discrete')!;
  assert.equal(saleDiscrete.quantity, 2);
  assert.equal(saleDiscrete.price, 7500);
  assert.equal(saleDiscrete.costPrice, 5000);
  assert.equal(saleDiscrete.unitCostCentavos, 5000);
  assert.equal(saleDiscrete.lineCostCentavos, 10000); // 2 * 5000
  assert.equal(saleDiscrete.lineTotal, 15000);

  const saleMeasured = itemsArray.find((it) => it.productId === 'prod_measured')!;
  assert.equal(saleMeasured.quantityMinor, 2000);
  assert.equal(saleMeasured.price, 8000);
  assert.equal(saleMeasured.costPrice, 5000);
  assert.equal(saleMeasured.unitCostCentavos, 5000);
  assert.equal(saleMeasured.lineCostCentavos, 10000); // 2kg * P50/kg
  assert.equal(saleMeasured.lineTotal, 16000);

  // 5. Verify Idempotency replay does NOT consume twice
  const replayReceipt = await completeBentaCashierCheckout('valid_cashier_token', request, {
    adminAuth: mockAuth,
    adminFirestore: mockDb as unknown as admin.firestore.Firestore,
  });
  assert.equal(replayReceipt.saleId, receipt.saleId);

  const discreteAfterReplay = mockDb._store.get(`tenants/${tenantId}/products/prod_discrete`)!;
  assert.equal(discreteAfterReplay.currentStock, 8); // Still 8!
  assert.equal(discreteAfterReplay.inventoryValueCentavos, 40000); // Still 40000!

  // 6. Verify subsequent restock does NOT mutate historical sale COGS
  mockDb._store.set(`tenants/${tenantId}/products/prod_discrete`, {
    ...discreteAfterReplay,
    currentStock: 18,
    inventoryValueCentavos: 100000,
    averageUnitCostCentavos: 5555,
    costPrice: 5555,
  });

  const saleDocAfterRestock = Array.from(mockDb._store.entries()).find(([k]) => k.startsWith(`tenants/${tenantId}/sales/`))![1];
  const saleItemsAfterRestock = saleDocAfterRestock.items as Array<Record<string, unknown>>;
  const saleDiscreteAfterRestock = saleItemsAfterRestock.find((it) => it.productId === 'prod_discrete')!;
  assert.equal(saleDiscreteAfterRestock.unitCostCentavos, 5000); // Frozen historical COGS!
  assert.equal(saleDiscreteAfterRestock.lineCostCentavos, 10000);
  assert.equal(saleDiscreteAfterRestock.costPrice, 5000);
});

test('Cashier Checkout: insufficient stock performs zero writes and does not mutate cost pool', async () => {
  const mockDb = createInMemoryFirestoreMock();

  const tenantId = 'tenant_benta_zero_writes';
  const staffAccountId = 'staff_1';
  const shiftId = 'shift_1';

  mockDb._store.set(`tenants/${tenantId}`, {
    id: tenantId,
    status: 'active',
    subscriptionStatus: 'active',
    moduleType: 'benta-snap',
  });

  mockDb._store.set(`tenants/${tenantId}/staff_accounts/${staffAccountId}`, {
    id: staffAccountId,
    tenantId,
    authUid: 'user_123',
    username: 'cashier1',
    displayName: 'Juan Cashier',
    role: 'cashier',
    status: 'active',
    activeShiftId: shiftId,
    sessionVersion: 1,
  });

  mockDb._store.set(`tenants/${tenantId}/shifts/${shiftId}`, {
    id: shiftId,
    tenantId,
    moduleId: 'benta-snap',
    staffAccountId,
    staffId: `staff_${staffAccountId}`,
    openedBy: `staff_${staffAccountId}`,
    status: 'open',
    startingCash: 1000,
    reconciliationVersion: 1,
    cashSales: 0,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 0,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 0,
  });

  mockDb._store.set(`tenants/${tenantId}/accounts/master-cash`, {
    id: 'master-cash',
    tenantId,
    balance: 50000,
    isActive: true,
  });

  mockDb._store.set(`tenants/${tenantId}/products/prod_1`, {
    id: 'prod_1',
    tenantId,
    name: 'Item 1',
    unit: 'pcs',
    salePrice: 1000,
    costPrice: 500,
    currentStock: 2,
    inventoryValueCentavos: 1000,
    averageUnitCostCentavos: 500,
    isActive: true,
    quantityMode: 'discrete',
  });

  const mockAuth: admin.auth.Auth = {
    verifyIdToken: async () => ({
      uid: 'user_123',
      tenantId,
      staffAccountId,
      role: 'cashier',
      sessionVersion: 1,
      isBentaStaff: true,
    } as unknown as admin.auth.DecodedIdToken),
  } as unknown as admin.auth.Auth;

  const request: CheckoutRequest = {
    idempotencyKey: '00000000-0000-4000-8000-000000000002',
    moduleId: 'benta-snap',
    shiftId,
    paymentMethod: 'cash',
    items: [{ productId: 'prod_1', quantityMode: 'discrete', quantity: 5 }], // 5 > 2!
  };

  await assert.rejects(
    async () => {
      await completeBentaCashierCheckout('valid_token', request, {
        adminAuth: mockAuth,
        adminFirestore: mockDb as unknown as admin.firestore.Firestore,
      });
    },
    (err: unknown) => err instanceof CheckoutError && err.code === 'INSUFFICIENT_STOCK',
  );

  // Assert product stock and value are completely untouched
  const product = mockDb._store.get(`tenants/${tenantId}/products/prod_1`)!;
  assert.equal(product.currentStock, 2);
  assert.equal(product.inventoryValueCentavos, 1000);
  assert.equal(product.averageUnitCostCentavos, 500);

  // Assert no sale or transaction documents created
  const sales = Array.from(mockDb._store.keys()).filter((k) => k.startsWith(`tenants/${tenantId}/sales/`));
  assert.equal(sales.length, 0);
  const transactions = Array.from(mockDb._store.keys()).filter((k) => k.startsWith(`tenants/${tenantId}/transactions/`));
  assert.equal(transactions.length, 0);
});

test('Cashier Intent Finalizer: atomic exact-pool consumption on intent finalization', async () => {
  const mockDb = createInMemoryFirestoreMock();

  const tenantId = 'tenant_benta_intent';
  const staffAccountId = 'staff_1';
  const shiftId = 'shift_1';
  const intentId = 'intent_123';

  mockDb._store.set(`tenants/${tenantId}`, {
    id: tenantId,
    status: 'active',
    subscriptionStatus: 'active',
    moduleType: 'benta-snap',
  });

  mockDb._store.set(`tenants/${tenantId}/staff_accounts/${staffAccountId}`, {
    id: staffAccountId,
    tenantId,
    authUid: 'user_123',
    username: 'cashier1',
    displayName: 'Juan Cashier',
    role: 'cashier',
    status: 'active',
    activeShiftId: shiftId,
    sessionVersion: 1,
  });

  mockDb._store.set(`tenants/${tenantId}/shifts/${shiftId}`, {
    id: shiftId,
    tenantId,
    moduleId: 'benta-snap',
    staffAccountId,
    staffId: `staff_${staffAccountId}`,
    openedBy: `staff_${staffAccountId}`,
    status: 'open',
    startingCash: 1000,
    reconciliationVersion: 1,
    cashSales: 0,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 0,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 0,
  });

  mockDb._store.set(`tenants/${tenantId}/accounts/master-cash`, {
    id: 'master-cash',
    tenantId,
    balance: 50000,
    isActive: true,
  });

  mockDb._store.set(`tenants/${tenantId}/products/prod_discrete`, {
    id: 'prod_discrete',
    tenantId,
    name: 'Coke 1.5L',
    unit: 'pcs',
    salePrice: 7500,
    costPrice: 5000,
    currentStock: 10,
    inventoryValueCentavos: 50000,
    averageUnitCostCentavos: 5000,
    isActive: true,
    quantityMode: 'discrete',
  });

  mockDb._store.set(`tenants/${tenantId}/cashier_sale_intents/${intentId}`, {
    id: intentId,
    tenantId,
    staffAccountId,
    authUid: 'user_123',
    shiftId,
    status: 'pending',
    cashTenderedCentavos: 20000,
    items: [{ productId: 'prod_discrete', quantity: 2, observedUnitPriceCentavos: 7500 }],
  });

  const mockAuth: admin.auth.Auth = {
    verifyIdToken: async () => ({
      uid: 'user_123',
      tenantId,
      staffAccountId,
      role: 'cashier',
      sessionVersion: 1,
      isBentaStaff: true,
    } as unknown as admin.auth.DecodedIdToken),
  } as unknown as admin.auth.Auth;

  const result = await finalizeCashierSaleIntent('valid_token', { tenantId, intentId }, {
    adminAuth: mockAuth,
    adminFirestore: mockDb as unknown as admin.firestore.Firestore,
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 'accepted');

  // Verify product updates in Firestore
  const updatedProduct = mockDb._store.get(`tenants/${tenantId}/products/prod_discrete`)!;
  assert.equal(updatedProduct.currentStock, 8);
  assert.equal(updatedProduct.inventoryValueCentavos, 40000);
  assert.equal(updatedProduct.averageUnitCostCentavos, 5000);
  assert.equal(updatedProduct.costPrice, 5000);

  // Verify sale item historical COGS
  const saleDoc = Array.from(mockDb._store.entries()).find(([k]) => k.startsWith(`tenants/${tenantId}/sales/`))![1];
  assert.ok(saleDoc);
  const itemsArray = saleDoc.items as Array<Record<string, unknown>>;
  const saleItem = itemsArray[0];
  assert.equal(saleItem.unitCostCentavos, 5000);
  assert.equal(saleItem.lineCostCentavos, 10000);
  assert.equal(saleItem.costPrice, 5000);
});

test('Offline Sync Claims: in-stock exact-pool consumption, insufficient stock variance protection, and immutable COGS', async () => {
  const mockDb = createInMemoryFirestoreMock();

  const tenantId = 'tenant_benta_offline';
  const staffAccountId = 'staff_offline_1';
  const shiftId = 'shift_offline_1';
  const grantId = 'grant_offline_1';
  const snapshotId = 'snap_offline_1';

  const signer = new OfflineGrantSigner({
    keys: { v1: 'test_secret_key_12345678901234567890' },
  });

  const grantPayload = {
    grantId,
    tenantId,
    staffAccountId,
    authUid: 'user_offline_1',
    sessionVersion: 1,
    shiftId,
    snapshotId,
    catalogDigest: 'digest_123',
    installationId: 'inst_123',
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 86400,
    maxTenderMinor: 10000000,
    allowedTenders: ['cash'],
  };

  const grant = signer.signGrant(grantPayload, 'v1');

  // Seed tenant, staff, shift, server grant, accounts
  mockDb._store.set(`tenants/${tenantId}`, {
    id: tenantId,
    status: 'active',
    subscriptionStatus: 'active',
    moduleType: 'benta-snap',
    assignedStaffCount: 1,
    activeStaffAccounts: [staffAccountId],
  });

  mockDb._store.set(`tenants/${tenantId}/staff_accounts/${staffAccountId}`, {
    id: staffAccountId,
    tenantId,
    authUid: 'user_offline_1',
    username: 'offline_cashier',
    displayName: 'Offline Cashier',
    role: 'cashier',
    status: 'active',
    activeShiftId: shiftId,
    sessionVersion: 1,
  });

  mockDb._store.set(`tenants/${tenantId}/shifts/${shiftId}`, {
    id: shiftId,
    tenantId,
    moduleId: 'benta-snap',
    staffAccountId,
    staffId: `staff_${staffAccountId}`,
    openedBy: `staff_${staffAccountId}`,
    status: 'open',
    startingCash: 1000,
    reconciliationVersion: 1,
    cashSales: 0,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 0,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 0,
  });

  const serverGrantDoc: ServerOfflineGrantDoc = {
    grantId,
    tenantId,
    staffAccountId,
    authUid: 'user_offline_1',
    sessionVersion: 1,
    shiftId,
    snapshotId,
    catalogDigest: 'digest_123',
    installationId: 'inst_123',
    issuedAtEpochMs: Date.now(),
    expiresAtEpochMs: Date.now() + 86400000,
    status: 'active',
    allowedTenders: ['cash'],
    maxTenderMinor: 10000000,
  };
  mockDb._store.set(`tenants/${tenantId}/offline_grants/${grantId}`, serverGrantDoc as unknown as Record<string, unknown>);

  mockDb._store.set(`tenants/${tenantId}/accounts/master-cash`, {
    id: 'master-cash',
    tenantId,
    balance: 50000,
    isActive: true,
  });

  // Seed Product 1: In-stock discrete product (has 10, selling 2)
  mockDb._store.set(`tenants/${tenantId}/products/prod_instock`, {
    id: 'prod_instock',
    tenantId,
    name: 'In Stock Item',
    unit: 'pcs',
    salePrice: 5000,
    costPrice: 3000,
    currentStock: 10,
    inventoryValueCentavos: 30000,
    averageUnitCostCentavos: 3000,
    isActive: true,
    quantityMode: 'discrete',
  });

  // Seed Product 2: Insufficient stock product (has 1, selling 5)
  mockDb._store.set(`tenants/${tenantId}/products/prod_insufficient`, {
    id: 'prod_insufficient',
    tenantId,
    name: 'Insufficient Item',
    unit: 'pcs',
    salePrice: 6000,
    costPrice: 4000,
    currentStock: 1,
    inventoryValueCentavos: 4000,
    averageUnitCostCentavos: 4000,
    isActive: true,
    quantityMode: 'discrete',
  });

  class MockCatalogSnapshotService extends CatalogSnapshotService {
    constructor() {
      super({ db: mockDb as unknown as admin.firestore.Firestore });
    }

    override async getSnapshotById(tId: string, sId: string): Promise<CatalogSnapshot | null> {
      return {
        snapshotId: sId,
        tenantId: tId,
        createdAt: new Date().toISOString(),
        catalogDigest: 'digest_123',
        serverCatalogDigest: 'server_digest_123',
        productCount: 2,
        isChunked: false,
        products: {
          prod_instock: {
            id: 'prod_instock',
            name: 'In Stock Item',
            unit: 'pcs',
            salePriceCentavos: 5000,
            costPriceCentavos: 3000,
            isActive: true,
          },
          prod_insufficient: {
            id: 'prod_insufficient',
            name: 'Insufficient Item',
            unit: 'pcs',
            salePriceCentavos: 6000,
            costPriceCentavos: 4000,
            isActive: true,
          },
        },
      };
    }
  }

  const mockSnapshotService = new MockCatalogSnapshotService();

  const mockAuth: admin.auth.Auth = {
    verifyIdToken: async () => ({
      uid: 'user_offline_1',
      tenantId,
      staffAccountId,
      role: 'cashier',
      sessionVersion: 1,
      isBentaStaff: true,
    } as unknown as admin.auth.DecodedIdToken),
  } as unknown as admin.auth.Auth;

  const options = {
    adminAuth: mockAuth,
    adminFirestore: mockDb as unknown as admin.firestore.Firestore,
    grantSigner: signer,
    snapshotService: mockSnapshotService,
    now: () => ({ toMillis: () => 2000 * 1000, toDate: () => new Date(2000 * 1000) } as unknown as admin.firestore.Timestamp),
    env: { BENTA_CASHIER_CHECKOUT_ENABLED: 'true', BENTA_CASHIER_OFFLINE_ENABLED: 'true' },
  };

  // Sync Request 1: In-stock claim (2 * 5000 = 10000)
  const syncReq1: OfflineClaimSyncRequest = {
    grant,
    claims: [
      {
        entryId: 'entry_1',
        idempotencyKey: '00000000-0000-4000-8000-000000000010',
        seqIndex: 1,
        clientTimestamp: new Date().toISOString(),
        items: [{ productId: 'prod_instock', quantity: 2 }],
        paymentMethod: 'cash',
        totalCentavos: 10000,
        cashTenderedCentavos: 10000,
      },
    ],
  };

  const syncResponse1 = await handleBentaSyncClaims('valid_token', syncReq1, options);

  assert.equal(syncResponse1.status, 200);
  const body1 = syncResponse1.body as { syncedCount: number; results: Array<{ status: string }> };
  assert.equal(body1.syncedCount, 1);
  assert.equal(body1.results[0].status, 'accepted');

  // Verify in-stock product was updated with exact-pool relief
  const prodInstockAfter = mockDb._store.get(`tenants/${tenantId}/products/prod_instock`)!;
  assert.equal(prodInstockAfter.currentStock, 8); // 10 - 2 = 8
  assert.equal(prodInstockAfter.inventoryValueCentavos, 24000); // 30000 - 6000 = 24000
  assert.equal(prodInstockAfter.averageUnitCostCentavos, 3000);

  // Verify movement document has exact relief fields
  const movementInstock = Array.from(mockDb._store.entries()).find(([k]) => k.includes('/inventory_transactions/'))![1];
  assert.equal(movementInstock.appliedQuantity, 2);
  assert.equal(movementInstock.unappliedQuantity, 0);
  assert.equal(movementInstock.balanceAfter, 8);
  assert.equal(movementInstock.inventoryCostReliefCentavos, 6000);
  assert.equal(movementInstock.costVarianceCentavos, 0);
  assert.equal(movementInstock.reconciliationStatus, 'fully_applied');

  // Sync Request 2: Insufficient stock claim (5 * 6000 = 30000)
  const syncReq2: OfflineClaimSyncRequest = {
    grant,
    claims: [
      {
        entryId: 'entry_2',
        idempotencyKey: '00000000-0000-4000-8000-000000000020',
        seqIndex: 2,
        clientTimestamp: new Date().toISOString(),
        items: [{ productId: 'prod_insufficient', quantity: 5 }], // requested 5, stock is only 1!
        paymentMethod: 'cash',
        totalCentavos: 30000,
        cashTenderedCentavos: 30000,
      },
    ],
  };

  const syncResponse2 = await handleBentaSyncClaims('valid_token', syncReq2, options);

  assert.equal(syncResponse2.status, 200);
  const body2 = syncResponse2.body as { syncedCount: number; results: Array<{ status: string }> };
  assert.equal(body2.syncedCount, 1);
  assert.equal(body2.results[0].status, 'accepted_with_inventory_variance');

  // CRITICAL: Verify insufficient stock product was NEVER mutated to negative stock!
  const prodInsufficientAfter = mockDb._store.get(`tenants/${tenantId}/products/prod_insufficient`)!;
  assert.equal(prodInsufficientAfter.currentStock, 1); // Still 1! Not -4!
  assert.equal(prodInsufficientAfter.inventoryValueCentavos, 4000); // Unchanged!
  assert.equal(prodInsufficientAfter.averageUnitCostCentavos, 4000);

  // Verify variance movement record
  const allMovements = Array.from(mockDb._store.entries()).filter(([k]) => k.includes('/inventory_transactions/'));
  const movementInsufficient = allMovements[allMovements.length - 1][1];
  assert.equal(movementInsufficient.requestedQuantity, 5);
  assert.equal(movementInsufficient.appliedQuantity, 0);
  assert.equal(movementInsufficient.unappliedQuantity, 5);
  assert.equal(movementInsufficient.balanceAfter, 1);
  assert.equal(movementInsufficient.inventoryCostReliefCentavos, 0);
  assert.equal(movementInsufficient.costVarianceCentavos, 20000); // 5 * 4000 - 0 = 20000
  assert.equal(movementInsufficient.reconciliationStatus, 'unapplied_insufficient_stock');
});
