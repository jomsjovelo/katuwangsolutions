import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleBentaSyncClaims,
  offlineClaimFingerprint
} from '../src/lib/server/benta-sync-claims-handler';
import {
  checkoutFingerprint,
  checkoutIdempotencyDocumentId,
  completeBentaCashierCheckout,
  CheckoutError
} from '../src/lib/server/benta-cashier-checkout';
import { OfflineGrantSigner } from '../src/lib/server/offline-grant-signer';
import { OfflineAuthGrantPayload, OfflineClaimSyncRequest } from '../src/lib/offline/offline-types';

test('shared checkoutFingerprint matches between online and offline checkouts', () => {
  const staffAccountId = 'staff-123';
  const shiftId = 'shift-456';
  const items = [
    { productId: 'prod_b', quantity: 2 },
    { productId: 'prod_a', quantity: 1 }
  ];

  // Online request
  const onlineFp = checkoutFingerprint(staffAccountId, {
    moduleId: 'benta-snap',
    shiftId,
    items,
    paymentMethod: 'cash',
    paymentReference: ''
  });

  // Offline claim (same items in different order)
  const offlineFp = offlineClaimFingerprint(
    staffAccountId,
    shiftId,
    [
      { productId: 'prod_a', quantity: 1 },
      { productId: 'prod_b', quantity: 2 }
    ],
    'cash',
    ''
  );

  // Cross-path identical match
  assert.equal(onlineFp, offlineFp);

  // Changed payload produces distinct fingerprint
  const changedFp = offlineClaimFingerprint(
    staffAccountId,
    shiftId,
    [{ productId: 'prod_a', quantity: 2 }],
    'cash',
    ''
  );
  assert.notEqual(onlineFp, changedFp);
});

test('handleBentaSyncClaims returns 503 when feature gate is disabled', async () => {
  const result = await handleBentaSyncClaims('mock-token', {}, {
    env: { BENTA_CASHIER_CHECKOUT_ENABLED: 'true', BENTA_CASHIER_OFFLINE_ENABLED: 'false' }
  });

  assert.equal(result.status, 503);
  assert.ok((result.body.error as string).includes('not enabled'));
});

test('handleBentaSyncClaims enforces full online authorization, claimSnap outcome protection, and cross-path online/offline idempotency', async () => {
  const signer = new OfflineGrantSigner({
    keys: { v1: 'test_signing_key_secret_for_claims_12345' }
  });

  const tenantId = 'demo-tenant-1';
  const staffAccountId = 'staff-acc-1';
  const authUid = 'cashier_test_uid';
  const shiftId = 'shift-active-1';
  const snapshotId = 'snap-1';
  const grantId = 'grant-uuid-1';

  const snapshotProducts = {
    p1: { id: 'p1', name: 'Corned Beef', salePriceCentavos: 4500, costPriceCentavos: 3200, unit: 'pcs', category: 'Canned', sku: 'CB1', barcode: '111', isActive: true },
    p2: { id: 'p2', name: 'Bottled Water', salePriceCentavos: 1500, costPriceCentavos: 800, unit: 'pcs', category: 'Drinks', sku: 'BW1', barcode: '222', isActive: true }
  };

  const digest = 'digest_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  const grantPayload: OfflineAuthGrantPayload = {
    grantId,
    tenantId,
    staffAccountId,
    authUid,
    sessionVersion: 1,
    shiftId,
    installationId: 'inst-1',
    snapshotId,
    catalogDigest: digest,
    issuedAt: 1000,
    allowedTenders: ['cash']
  };

  const signedGrant = signer.signGrant(grantPayload, 'v1');

  // In-memory Firestore mock store
  const store: Record<string, any> = {
    [`tenants/${tenantId}`]: {
      id: tenantId,
      moduleType: 'benta-snap',
      subscriptionStatus: 'active'
    },
    [`tenants/${tenantId}/staff_accounts/${staffAccountId}`]: {
      id: staffAccountId,
      tenantId,
      status: 'active',
      sessionVersion: 1,
      authUid,
      displayName: 'Jane Cashier',
      activeShiftId: shiftId
    },
    [`tenants/${tenantId}/shifts/${shiftId}`]: {
      id: shiftId,
      tenantId,
      moduleId: 'benta-snap',
      staffId: `staff_${staffAccountId}`,
      staffAccountId,
      openedBy: `staff_${staffAccountId}`,
      status: 'open',
      reconciliationVersion: 1,
      startingCash: 150000,
      cashSales: 0,
      gcashSales: 0,
      mayaSales: 0,
      totalShiftSales: 0,
      electronicReceipts: 0,
      physicalCashAdjustments: 0,
      saleCount: 0
    },
    [`tenants/${tenantId}/accounts/master-cash`]: {
      id: 'master-cash',
      balance: 10000 // Initial balance ₱100.00
    },
    [`tenants/${tenantId}/offline_grants/${grantId}`]: {
      grantId,
      tenantId,
      staffAccountId,
      authUid,
      sessionVersion: 1,
      shiftId,
      snapshotId,
      catalogDigest: digest,
      installationId: 'inst-1',
      allowedTenders: ['cash'],
      status: 'active'
    },
    [`tenants/${tenantId}/products/p1`]: {
      id: 'p1',
      name: 'Corned Beef',
      salePrice: 4500,
      currentStock: 10
    },
    [`tenants/${tenantId}/products/p2`]: {
      id: 'p2',
      name: 'Bottled Water',
      salePrice: 1500,
      currentStock: 1 // Only 1 in stock!
    }
  };

  const mockDb: any = {
    collection: (collName: string) => ({
      doc: (docId?: string) => {
        const id = docId || `auto_${Math.random().toString(36).slice(2, 9)}`;
        const docPath = `${collName}/${id}`;
        return {
          id,
          path: docPath,
          ref: { path: docPath },
          collection: (subColl: string) => ({
            doc: (subDocId?: string) => {
              const subId = subDocId || `auto_${Math.random().toString(36).slice(2, 9)}`;
              const subDocPath = `${docPath}/${subColl}/${subId}`;
              return {
                id: subId,
                path: subDocPath,
                ref: { path: subDocPath },
                get: async () => ({
                  exists: !!store[subDocPath],
                  id: subId,
                  data: () => store[subDocPath]
                }),
                set: async (val: any) => {
                  store[subDocPath] = val;
                }
              };
            }
          }),
          get: async () => ({
            exists: !!store[docPath],
            id,
            data: () => store[docPath]
          })
        };
      }
    }),
    runTransaction: async (updateFn: any) => {
      const transaction: any = {
        getAll: async (...refs: any[]) => {
          return refs.map((r: any) => {
            const p = r.path || (r.ref && r.ref.path) || '';
            const data = store[p];
            return {
              exists: !!data,
              id: p.split('/').pop() || '',
              path: p,
              ref: { path: p },
              data: () => data
            };
          });
        },
        get: async (ref: any) => {
          const p = ref.path || (ref.ref && ref.ref.path) || '';
          const data = store[p];
          return {
            exists: !!data,
            id: p.split('/').pop() || '',
            path: p,
            ref: { path: p },
            data: () => data
          };
        },
        set: (ref: any, data: any) => {
          const p = ref.path || (ref.ref && ref.ref.path);
          store[p] = data;
        },
        create: (ref: any, data: any) => {
          const p = ref.path || (ref.ref && ref.ref.path);
          store[p] = data;
        },
        update: (ref: any, data: any) => {
          const p = ref.path || (ref.ref && ref.ref.path);
          if (!store[p]) store[p] = {};
          for (const [k, v] of Object.entries(data)) {
            if (typeof v === 'object' && v !== null && (v as any).constructor?.name?.includes('NumericIncrementTransform')) {
              store[p][k] = (store[p][k] || 0) + (v as any).operand;
            } else {
              store[p][k] = v;
            }
          }
        }
      };
      return await updateFn(transaction);
    }
  };

  const mockAuth: any = {
    verifyIdToken: async () => ({
      uid: authUid,
      role: 'cashier',
      tenantId,
      staffAccountId,
      sessionVersion: 1
    })
  };

  const mockSnapshotService: any = {
    getSnapshotById: async () => ({
      snapshotId,
      tenantId,
      catalogDigest: digest,
      serverCatalogDigest: 'server_' + digest,
      products: snapshotProducts
    })
  };

  const options = {
    adminAuth: mockAuth,
    adminFirestore: mockDb,
    grantSigner: signer,
    snapshotService: mockSnapshotService,
    now: () => ({ toMillis: () => 2000 * 1000, toDate: () => new Date(2000 * 1000) } as any),
    env: { BENTA_CASHIER_CHECKOUT_ENABLED: 'true', BENTA_CASHIER_OFFLINE_ENABLED: 'true' }
  };

  // 1. Initial Offline Sync
  const claimIdemKey = '550e8400-e29b-41d4-a716-446655440001';
  const syncRequest: OfflineClaimSyncRequest = {
    grant: signedGrant,
    claims: [
      {
        entryId: '550e8400-e29b-41d4-a716-446655440001',
        seqIndex: 1,
        idempotencyKey: claimIdemKey,
        clientTimestamp: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 1, unitPriceCentavos: 4500 }],
        paymentMethod: 'cash',
        cashTenderedCentavos: 5000,
        totalCentavos: 4500
      }
    ]
  };

  const response = await handleBentaSyncClaims('valid-token', syncRequest, options);
  assert.equal(response.status, 200);
  const body = response.body as any;
  assert.equal(body.syncedCount, 1);
  assert.equal(body.results[0].status, 'accepted');
  const acceptedSaleId = body.results[0].saleId;

  // Master cash balance = initial 10000 + 4500 = 14500
  assert.equal(store[`tenants/${tenantId}/accounts/master-cash`].balance, 14500);

  // 2. Offline -> Online Replay Test (Invoke real completeBentaCashierCheckout)
  // Calling online checkout with the same idempotency key and items returns the offline receipt without re-decrementing stock!
  const onlineRequest = {
    idempotencyKey: claimIdemKey,
    moduleId: 'benta-snap',
    shiftId,
    items: [{ productId: 'p1', quantity: 1 }],
    paymentMethod: 'cash'
  };

  const onlineReceipt = await completeBentaCashierCheckout('valid-token', onlineRequest, options) as any;
  assert.equal(onlineReceipt.saleId, acceptedSaleId);
  // Stock remains 9 (not 8!)
  assert.equal(store[`tenants/${tenantId}/products/p1`].currentStock, 9);
  // Master cash balance remains 14500
  assert.equal(store[`tenants/${tenantId}/accounts/master-cash`].balance, 14500);

  // 3. Online conflict on same key with different payload
  const onlineConflictRequest = {
    idempotencyKey: claimIdemKey,
    moduleId: 'benta-snap',
    shiftId,
    items: [{ productId: 'p1', quantity: 2 }], // Different qty!
    paymentMethod: 'cash'
  };
  await assert.rejects(
    () => completeBentaCashierCheckout('valid-token', onlineConflictRequest, options),
    (err: any) => err instanceof CheckoutError && err.message.includes('Idempotency')
  );

  // 4. claimSnap Terminal Outcome Protection Test:
  // Delete the cashier_checkout_idempotency document (simulating TTL expiration or cleanup)
  const idemDocId = checkoutIdempotencyDocumentId(staffAccountId, claimIdemKey);
  delete store[`tenants/${tenantId}/cashier_checkout_idempotency/${idemDocId}`];

  // Also revoke the authoritative grant
  store[`tenants/${tenantId}/offline_grants/${grantId}`].status = 'revoked';

  // Re-syncing the claim MUST use claimSnap to return the original accepted sale and NEVER duplicate or downgrade!
  const retryResponse = await handleBentaSyncClaims('valid-token', syncRequest, options);
  const retryBody = retryResponse.body as any;
  assert.equal(retryBody.syncedCount, 1);
  assert.equal(retryBody.results[0].status, 'accepted');
  assert.equal(retryBody.results[0].saleId, acceptedSaleId);

  // Stock remains 9, master cash remains 14500
  assert.equal(store[`tenants/${tenantId}/products/p1`].currentStock, 9);
  assert.equal(store[`tenants/${tenantId}/accounts/master-cash`].balance, 14500);
});
