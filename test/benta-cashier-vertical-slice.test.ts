import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBentaCashierBootstrap,
  BentaCashierBootstrapResponse
} from '../src/lib/server/benta-cashier-bootstrap';
import { OfflineGrantSigner } from '../src/lib/server/offline-grant-signer';
import { CatalogSnapshotService } from '../src/lib/server/catalog-snapshot-service';
import { CashierOfflineSyncCoordinator } from '../src/lib/client/cashier-offline-sync-coordinator';
import { CashierOfflineManager } from '../src/lib/client/cashier-offline-manager';
import { useSecureCashierStore, shouldBlockCheckoutForCashierLock } from '../src/store/use-secure-cashier-store';

function createMockEnvironment(initialStore: Record<string, any> = {}) {
  const store: Record<string, any> = { ...initialStore };
  let writeCount = 0;

  const mockDb: any = {
    collection: (coll: string) => {
      const collectionWhere = (filters: Array<{ field: string; val: any }>) => {
        const matches = () => Object.entries(store)
          .filter(([k, v]) => {
            if (!k.startsWith(`${coll}/`)) return false;
            return filters.every(f => v[f.field] === f.val);
          })
          .map(([k, v]) => ({ id: k.split('/').pop()!, data: () => v }));

        const queryObj: any = {
          where: (f: string, op: string, v: any) => collectionWhere([...filters, { field: f, val: v }]),
          limit: () => ({
            get: async () => {
              const docs = matches();
              return { empty: docs.length === 0, docs };
            }
          }),
          get: async () => {
            const docs = matches();
            return { empty: docs.length === 0, docs };
          }
        };
        return queryObj;
      };

      return {
        where: (field: string, op: string, val: any) => collectionWhere([{ field, val }]),
        doc: (docId: string) => ({
          id: docId,
          path: `${coll}/${docId}`,
          collection: (subColl: string) => ({
            doc: (subDocId: string) => ({
              id: subDocId,
              path: `${coll}/${docId}/${subColl}/${subDocId}`,
              get: async () => ({
                exists: !!store[`${coll}/${docId}/${subColl}/${subDocId}`],
                id: subDocId,
                data: () => store[`${coll}/${docId}/${subColl}/${subDocId}`]
              }),
              set: async (val: any) => {
                writeCount++;
                store[`${coll}/${docId}/${subColl}/${subDocId}`] = val;
              }
            }),
            where: (field: string, op: string, val: any) => {
              const matches = () => Object.entries(store)
                .filter(([k, v]) => k.startsWith(`${coll}/${docId}/${subColl}/`) && v[field] === val)
                .map(([k, v]) => ({ id: k.split('/').pop()!, data: () => v }));

              const queryObj: any = {
                where: (f2: string, op2: string, v2: any) => {
                  const subMatches = () => Object.entries(store)
                    .filter(([k, v]) => k.startsWith(`${coll}/${docId}/${subColl}/`) && v[field] === val && v[f2] === v2)
                    .map(([k, v]) => ({ id: k.split('/').pop()!, data: () => v }));

                  return {
                    where: () => ({ limit: () => ({ get: async () => ({ empty: subMatches().length === 0, docs: subMatches() }) }) }),
                    limit: () => ({ get: async () => ({ empty: subMatches().length === 0, docs: subMatches() }) }),
                    get: async () => ({ empty: subMatches().length === 0, docs: subMatches() })
                  };
                },
                limit: () => ({ get: async () => ({ empty: matches().length === 0, docs: matches() }) }),
                get: async () => ({ empty: matches().length === 0, docs: matches() })
              };
              return queryObj;
            }
          }),
          get: async () => ({
            exists: !!store[`${coll}/${docId}`],
            id: docId,
            data: () => store[`${coll}/${docId}`]
          }),
          set: async (val: any) => {
            writeCount++;
            store[`${coll}/${docId}`] = val;
          }
        })
      };
    },
    runTransaction: async (updateFn: any) => {
      const tx: any = {
        getAll: async (...refs: any[]) => refs.map((r: any) => {
          const p = r.path;
          return { exists: !!store[p], id: p.split('/').pop() || '', path: p, data: () => store[p] };
        }),
        get: async (queryOrRef: any) => {
          if (queryOrRef.path) {
            const p = queryOrRef.path;
            return { exists: !!store[p], id: p.split('/').pop() || '', path: p, data: () => store[p] };
          }
          if (typeof queryOrRef.get === 'function') {
            return await queryOrRef.get();
          }
          const docs = Object.entries(store)
            .filter(([k]) => k.startsWith('tenants/demo-tenant-1/products/'))
            .map(([k, v]) => ({ id: k.split('/').pop()!, data: () => v }));
          return { docs };
        },
        set: (ref: any, data: any) => {
          writeCount++;
          store[ref.path] = data;
        }
      };
      return await updateFn(tx);
    }
  };

  return { store, mockDb, getWriteCount: () => writeCount };
}

test('Strict Public Catalog Boundary: Bootstrap response contains zero cost fields and stock baseline', async () => {
  const tenantId = 'demo-tenant-1';
  const staffAccountId = 'staff-1';
  const authUid = 'cashier-1';
  const shiftId = 'shift-1';

  const rawProducts = [
    { id: 'p1', name: 'Product 1', salePrice: 1000, costPrice: 650, currentStock: 50, unit: 'pcs', category: 'General', isActive: true, moduleId: 'benta-snap' },
    { id: 'p2', name: 'Product 2', salePrice: 2500, costPrice: 1800, currentStock: 20, unit: 'pcs', category: 'Drinks', isActive: true, moduleId: 'benta-snap' }
  ];

  const initialStore = {
    [`tenants/${tenantId}`]: { id: tenantId, moduleType: 'benta-snap', subscriptionStatus: 'active', name: 'Aling Nena Sari-Sari Store' },
    [`tenants/${tenantId}/staff_accounts/${staffAccountId}`]: {
      id: staffAccountId, tenantId, status: 'active', sessionVersion: 1, authUid, displayName: 'Ana Ramos', activeShiftId: shiftId
    },
    [`tenants/${tenantId}/shifts/${shiftId}`]: {
      id: shiftId, tenantId, moduleId: 'benta-snap', staffId: `staff_${staffAccountId}`, staffAccountId, openedBy: `staff_${staffAccountId}`,
      status: 'open', reconciliationVersion: 1, startingCash: 15000, cashSales: 0, gcashSales: 0, mayaSales: 0,
      totalShiftSales: 0, electronicReceipts: 0, physicalCashAdjustments: 0, saleCount: 0,
      openedAt: { toDate: () => new Date('2026-08-22T08:00:00Z') }
    },
    [`tenants/${tenantId}/products/p1`]: { ...rawProducts[0], tenantId, moduleId: 'benta-snap' },
    [`tenants/${tenantId}/products/p2`]: { ...rawProducts[1], tenantId, moduleId: 'benta-snap' },
    // Registered trusted device document in webauthn_credentials
    [`webauthn_credentials/cred_hash_1`]: {
      credentialId: 'cred_id_1',
      credentialIdHash: 'cred_hash_1',
      tenantId,
      staffAccountId,
      installationId: 'inst_test_valid_1',
      publicKeySpki: Buffer.from('spki_sample_key').toString('base64'),
      algorithm: -7,
      counter: 0,
      status: 'active'
    }
  };

  const { mockDb, getWriteCount } = createMockEnvironment(initialStore);

  const mockAuth: any = {
    verifyIdToken: async () => ({ uid: authUid, role: 'cashier', tenantId, staffAccountId, sessionVersion: 1 })
  };

  const signer = new OfflineGrantSigner({ keys: { v1: 'test_signing_key_for_boundary_test_12345' } });
  const snapshotService = new CatalogSnapshotService({ db: mockDb });

  const options = {
    adminAuth: mockAuth,
    adminFirestore: mockDb,
    grantSigner: signer,
    snapshotService,
    env: { BENTA_CASHIER_CHECKOUT_ENABLED: 'true', BENTA_CASHIER_OFFLINE_ENABLED: 'true' }
  };

  // 1. Initial Bootstrap Request with valid installation ID
  const bootstrap: BentaCashierBootstrapResponse = await getBentaCashierBootstrap('token', options, 'inst_test_valid_1');
  assert.ok(bootstrap.offlineAuthority, 'Offline authority must be present for active shift and valid installation ID');

  // Verify Serialized JSON contains NO cost fields
  const serialized = JSON.stringify(bootstrap);
  assert.equal(serialized.includes('costPrice'), false, 'Serialized bootstrap response must NEVER leak costPrice');
  assert.equal(serialized.includes('costPriceCentavos'), false, 'Serialized bootstrap response must NEVER leak costPriceCentavos');
  assert.equal(serialized.includes('serverCatalogDigest'), false, 'Serialized bootstrap response must NEVER leak serverCatalogDigest');

  // Verify Stock Baseline is present
  assert.equal(bootstrap.offlineAuthority?.stockBaseline?.p1, 50);
  assert.equal(bootstrap.offlineAuthority?.stockBaseline?.p2, 20);

  // 2. Stock-Only Invariance & Deterministic Grant Reuse Test
  const initialWrites = getWriteCount();
  // Simulate stock mutation in product store
  initialStore[`tenants/${tenantId}/products/p1`].currentStock = 45;
  const secondBootstrap = await getBentaCashierBootstrap('token', options, 'inst_test_valid_1');
  assert.equal(secondBootstrap.offlineAuthority?.grant.payload.grantId, bootstrap.offlineAuthority?.grant.payload.grantId);
  assert.equal(secondBootstrap.offlineAuthority?.snapshot.catalogDigest, bootstrap.offlineAuthority?.snapshot.catalogDigest);
  assert.equal(getWriteCount(), initialWrites, 'Stock changes must not create new snapshots or grants');

  // 3. Strict Installation Identity: Missing/invalid installation ID must return undefined offline authority
  const onlineOnlyBootstrap = await getBentaCashierBootstrap('token', options, '');
  assert.equal(onlineOnlyBootstrap.offlineAuthority, undefined, 'Server must never mint an offline grant for empty installation ID');
});

test('Authorization Precedence: Disabled staff account fails immediately with zero snapshot writes', async () => {
  const tenantId = 'demo-tenant-1';
  const staffAccountId = 'staff-disabled';
  const authUid = 'cashier-disabled';

  const initialStore = {
    [`tenants/${tenantId}`]: { id: tenantId, moduleType: 'benta-snap', subscriptionStatus: 'active', name: 'Test Store' },
    [`tenants/${tenantId}/staff_accounts/${staffAccountId}`]: {
      id: staffAccountId, tenantId, status: 'disabled', sessionVersion: 1, authUid, displayName: 'Disabled Staff'
    }
  };

  const { mockDb, getWriteCount } = createMockEnvironment(initialStore);
  const mockAuth: any = {
    verifyIdToken: async () => ({ uid: authUid, role: 'cashier', tenantId, staffAccountId, sessionVersion: 1 })
  };

  const snapshotService = new CatalogSnapshotService({ db: mockDb });
  const options = {
    adminAuth: mockAuth,
    adminFirestore: mockDb,
    snapshotService,
    env: { BENTA_CASHIER_CHECKOUT_ENABLED: 'true', BENTA_CASHIER_OFFLINE_ENABLED: 'true' }
  };

  await assert.rejects(
    getBentaCashierBootstrap('token', options, 'inst_1'),
    /Session invalid/
  );

  assert.equal(getWriteCount(), 0, 'Zero snapshot or grant writes must occur when staff authorization fails');
});

test('Fail-Closed Metadata & Exact Values: Missing bootstrap metadata fails restoration cleanly', async () => {
  const tenantId = 'demo-tenant-1';
  const staffAccountId = 'staff-1';
  const shiftId = 'shift-1';

  const mockGrant = {
    payload: {
      grantId: 'g1', tenantId, staffAccountId, authUid: 'c1', sessionVersion: 1,
      shiftId, installationId: 'inst_1', snapshotId: 's1', catalogDigest: 'd1', issuedAt: 1000, allowedTenders: ['cash' as const]
    },
    signature: 'sig', keyId: 'v1'
  };

  const mockSnapshot = {
    snapshotId: 's1', catalogDigest: 'd1', productCount: 1,
    products: { p1: { id: 'p1', name: 'Milk', salePriceCentavos: 5000, currentStock: 20, unit: 'can', isActive: true } }
  };

  // 1. Missing bootstrap meta fails restoration
  const dbWithoutMeta: any = {
    getLatestGrant: async () => mockGrant,
    getAuthorityContext: async () => ({ grant: mockGrant, snapshot: mockSnapshot, bootstrapMeta: null, stockBaseline: { p1: 20 } }),
    getPendingDeductionsMap: async () => ({}),
    getPendingEntries: async () => [],
    isShiftProvisionallyClosed: async () => false,
    getOrCreateInstallationId: async () => 'inst_1'
  };

  const manager = new CashierOfflineManager(dbWithoutMeta);
  const failedResult = await manager.restoreOfflineContext();
  assert.equal(failedResult.restored, false);
  assert.equal(failedResult.reason, 'missing_exact_bootstrap_metadata');

  // 2. Missing stock baseline fails restoration cleanly
  const dbWithoutStock: any = {
    ...dbWithoutMeta,
    getAuthorityContext: async () => ({
      grant: mockGrant,
      snapshot: mockSnapshot,
      bootstrapMeta: {
        tenantDisplayName: 'Store',
        cashierDisplayName: 'Cashier',
        currentShift: { id: shiftId, moduleId: 'benta-snap', status: 'open', startingCashCentavos: 15000, openedAt: '2026-08-22T08:00:00Z' }
      },
      stockBaseline: null
    })
  };
  const noStockManager = new CashierOfflineManager(dbWithoutStock);
  const noStockResult = await noStockManager.restoreOfflineContext();
  assert.equal(noStockResult.restored, false);
  assert.equal(noStockResult.reason, 'missing_stock_baseline', 'Missing stock baseline must fail closed');

  // 3. Full valid metadata and stock baseline restores exact values and projected stock
  const validMeta = {
    tenantDisplayName: 'Aling Nena Sari-Sari Store',
    cashierDisplayName: 'Ana Ramos',
    currentShift: { id: shiftId, moduleId: 'benta-snap' as const, status: 'open' as const, startingCashCentavos: 15000, openedAt: '2026-08-22T08:00:00Z' }
  };

  const dbWithMeta: any = {
    ...dbWithoutMeta,
    getAuthorityContext: async () => ({
      grant: mockGrant,
      snapshot: mockSnapshot,
      bootstrapMeta: validMeta,
      stockBaseline: { p1: 20 },
      stockCapturedAtIso: '2026-08-22T08:00:00Z'
    }),
    getPendingDeductionsMap: async () => ({ p1: 3 })
  };

  const validManager = new CashierOfflineManager(dbWithMeta);
  const successResult = await validManager.restoreOfflineContext();
  assert.equal(successResult.restored, true);
  assert.equal(successResult.bootstrap?.tenantDisplayName, 'Aling Nena Sari-Sari Store');
  assert.equal(successResult.bootstrap?.cashierDisplayName, 'Ana Ramos');
  assert.equal(successResult.bootstrap?.currentShift?.startingCashCentavos, 15000);
  assert.equal(successResult.bootstrap?.products[0].currentStock, 17, 'Projected stock: 20 baseline - 3 pending = 17');
});

test('Online Login vs Offline Restoration Lock States: Online login enters unlocked state directly, offline restoration starts locked', async () => {
  const store = useSecureCashierStore.getState();

  const mockBootstrapData = {
    tenantId: 'demo-tenant',
    tenantDisplayName: 'Store',
    moduleId: 'benta-snap' as const,
    staffAccountId: 'staff-1',
    cashierDisplayName: 'Cashier Ana',
    currentShift: { id: 'shift-1', moduleId: 'benta-snap' as const, status: 'open' as const, startingCashCentavos: 5000, openedAt: '2026-08-22T08:00:00Z' },
    products: []
  };

  // 1. Online PIN login via setOnlineBootstrap enters unlocked state directly (no WebAuthn forced)
  store.setOnlineBootstrap(mockBootstrapData);
  assert.equal(useSecureCashierStore.getState().isLocalLocked, false, 'Live online login must directly enter unlocked state without requiring WebAuthn');

  // 2. Offline restoration via setRestoredOfflineBootstrap starts locally locked
  store.setRestoredOfflineBootstrap(mockBootstrapData);
  assert.equal(useSecureCashierStore.getState().isLocalLocked, true, 'Restored offline session must start locally locked');

  // 3. Online login directly unlocks session
  useSecureCashierStore.getState().unlockViaOnlineAuth();
  assert.equal(useSecureCashierStore.getState().isLocalLocked, false, 'Online authentication unlocks session');

  // 4. Lock session explicitly
  useSecureCashierStore.getState().lockCashierSession();
  assert.equal(useSecureCashierStore.getState().isLocalLocked, true, 'Explicit lock action sets isLocalLocked to true');
});

test('Grant-WebAuthn Binding Validation: Substituted local credential fails unlock and checkout', async () => {
  const mockGrant = {
    payload: {
      grantId: 'g1',
      tenantId: 'tenant-1',
      staffAccountId: 'staff-1',
      authUid: 'cashier-1',
      sessionVersion: 1,
      shiftId: 'shift-1',
      installationId: 'inst-1',
      credentialIdHash: 'expected_cred_hash_123',
      snapshotId: 'snap-1',
      catalogDigest: 'd1',
      issuedAt: 1000,
      allowedTenders: ['cash' as const]
    },
    signature: 'sig',
    keyId: 'v1'
  };

  // 1. Substituted local trusted device with wrong credential ID hash fails unlock
  const substitutedDevice = {
    credentialId: 'attacker_cred_id',
    credentialIdHash: 'attacker_cred_hash_999', // Mismatch!
    tenantId: 'tenant-1',
    staffAccountId: 'staff-1',
    authUid: 'cashier-1',
    installationId: 'inst-1',
    deviceName: 'Attacker Key',
    publicKeySpki: 'spki_key',
    algorithm: -7,
    counter: 1,
    rpId: 'localhost',
    registeredAt: Date.now()
  };

  const mockJournalDB: any = {
    getTrustedDevice: async () => substitutedDevice,
    getLatestGrant: async () => mockGrant,
    getScopedGrant: async () => mockGrant,
    getOrCreateInstallationId: async () => 'inst-1',
    getAuthorityContext: async () => ({
      grant: mockGrant,
      snapshot: { snapshotId: 'snap-1', catalogDigest: 'd1', products: {} }
    }),
    isShiftProvisionallyClosed: async () => false
  };

  const manager = new CashierOfflineManager(mockJournalDB);

  // Substituted credential unlock attempt fails
  const unlockResult = await manager.unlockViaWebAuthn({
    assertionResponse: {},
    challengeBytes: new Uint8Array(32),
    tenantId: 'tenant-1',
    staffAccountId: 'staff-1',
    installationId: 'inst-1',
    shiftId: 'shift-1'
  });

  assert.equal(unlockResult.success, false);
  assert.ok(unlockResult.error?.includes('credential_grant_binding_mismatch'), 'Substituted credential ID must fail binding validation');

  // 2. Substituted public key hash with identical credential ID fails unlock and checkout
  const substitutedKeyDevice = {
    credentialId: 'expected_cred_id',
    credentialIdHash: 'expected_cred_hash_123', // Matches grant
    credentialPublicKeyHash: 'attacker_pubkey_hash_999', // Mismatch with grant!
    tenantId: 'tenant-1',
    staffAccountId: 'staff-1',
    authUid: 'cashier-1',
    installationId: 'inst-1',
    deviceName: 'Attacker Key',
    publicKeySpki: 'spki_key_attacker',
    algorithm: -7,
    counter: 1,
    rpId: 'localhost',
    registeredAt: Date.now()
  };

  const grantWithPubkeyHash = {
    ...mockGrant,
    payload: {
      ...mockGrant.payload,
      credentialPublicKeyHash: 'real_pubkey_hash_123'
    }
  };

  const mockJournalDB2: any = {
    ...mockJournalDB,
    getTrustedDevice: async () => substitutedKeyDevice,
    getLatestGrant: async () => grantWithPubkeyHash,
    getScopedGrant: async () => grantWithPubkeyHash,
    getAuthorityContext: async () => ({
      grant: grantWithPubkeyHash,
      snapshot: { snapshotId: 'snap-1', catalogDigest: 'd1', products: {} }
    })
  };

  const manager2 = new CashierOfflineManager(mockJournalDB2);
  const keyMismatchUnlock = await manager2.unlockViaWebAuthn({
    assertionResponse: {},
    challengeBytes: new Uint8Array(32),
    tenantId: 'tenant-1',
    staffAccountId: 'staff-1',
    installationId: 'inst-1',
    shiftId: 'shift-1'
  });
  assert.equal(keyMismatchUnlock.success, false);
  assert.ok(keyMismatchUnlock.error?.includes('credential_grant_binding_mismatch'), 'Substituted public key hash must fail binding validation');

  // Substituted credential checkout attempt throws
  await assert.rejects(
    manager.executeOfflineCashCheckout({
      tenantId: 'tenant-1',
      staffAccountId: 'staff-1',
      shiftId: 'shift-1',
      cartItems: [{ productId: 'p1', quantity: 1 }],
      idempotencyKey: 'k1'
    }),
    /credential_grant_binding_mismatch/
  );
});

test('Idempotent Shift Close: Duplicate provisional close calls return identical record', async () => {
  const closeRecords: Record<string, any> = {};
  let seq = 0;

  const mockJournalDB: any = {
    getOrCreateInstallationId: async () => 'inst_1',
    getAuthorityContext: async () => ({
      grant: { payload: { grantId: 'g1', tenantId: 't1', staffAccountId: 's1', shiftId: 'sh1', installationId: 'inst_1', snapshotId: 'snap1' } },
      snapshot: { snapshotId: 'snap1', catalogDigest: 'd1', products: {} }
    }),
    isShiftProvisionallyClosed: async () => !!closeRecords['sh1'],
    appendShiftCloseEntry: async (params: any) => {
      if (closeRecords['sh1']) {
        return closeRecords['sh1']; // Idempotent return
      }
      seq++;
      const entry = { entryId: 'close_entry_1', kind: 'shift_close', seqIndex: seq, ...params };
      closeRecords['sh1'] = entry;
      return entry;
    }
  };

  const manager = new CashierOfflineManager(mockJournalDB);

  const firstClose = await manager.provisionalCloseShift({
    tenantId: 't1', staffAccountId: 's1', shiftId: 'sh1', endingCashCentavos: 20000, notes: 'End shift'
  });

  const secondClose = await manager.provisionalCloseShift({
    tenantId: 't1', staffAccountId: 's1', shiftId: 'sh1', endingCashCentavos: 20000, notes: 'End shift'
  });

  assert.equal(firstClose.entryId, secondClose.entryId);
  assert.equal(secondClose.seqIndex, 1, 'Duplicate close must not increment sequence or mint duplicates');
});

test('Sale-Before-Close Ordering & Receipt Reconciliation: Coordinator flushes sales before shift close', async () => {
  const journalState: Record<string, any> = {
    sale_1: {
      entryId: 'sale_1', kind: 'sale', seqIndex: 1, idempotencyKey: 'k1', tenantId: 't1', staffAccountId: 's1', shiftId: 'sh1',
      status: 'pending_sync', items: [{ productId: 'p1', quantity: 1, unitPriceCentavos: 1000 }], totalCentavos: 1000,
      provisionalReceiptNumber: 'PROV-SH1-1'
    },
    close_1: {
      entryId: 'close_1', kind: 'shift_close', seqIndex: 2, idempotencyKey: 'k2', tenantId: 't1', staffAccountId: 's1', shiftId: 'sh1',
      status: 'pending_sync', endingCashCentavos: 15000
    }
  };

  const mockJournalDB: any = {
    getPendingEntries: async () => Object.values(journalState).filter((e: any) => e.status === 'pending_sync' || e.status === 'retryable_error'),
    getAuthorityContext: async () => ({
      grant: { payload: { grantId: 'g1', tenantId: 't1', staffAccountId: 's1', shiftId: 'sh1', snapshotId: 'snap1' }, signature: 'sig1' }
    }),
    updateEntryStatus: async (id: string, st: string, extra?: any) => {
      if (journalState[id]) {
        journalState[id].status = st;
        if (extra?.serverSaleId) journalState[id].serverSaleId = extra.serverSaleId;
        if (extra?.authoritativeReceiptNumber) journalState[id].authoritativeReceiptNumber = extra.authoritativeReceiptNumber;
      }
    },
    saveReceiptMapping: async () => {},
    assertAllPriorSalesTerminal: async () => {},
    recoverStaleInFlightEntries: async () => 0
  };

  const syncCalls: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string, init: any) => {
    syncCalls.push(url.toString());
    if (url.toString().includes('benta-sync-claims')) {
      return {
        ok: true,
        json: async () => ({
          results: [{ entryId: 'sale_1', status: 'accepted', saleId: 'srv_sale_123', receiptNumber: 'RCP-20260822-001' }]
        })
      };
    }
    if (url.toString().includes('benta-shift-reconciliation')) {
      return {
        ok: true,
        json: async () => ({ success: true, endingCashCentavos: 15000 })
      };
    }
    return { ok: false };
  }) as any;

  let notifiedAuthNumber = '';
  const coordinator = new CashierOfflineSyncCoordinator({
    getIdToken: async () => 'mock-token',
    journalDB: mockJournalDB,
    syncEndpoint: 'https://mock.local/benta-sync-claims',
    reconciliationEndpoint: 'https://mock.local/benta-shift-reconciliation',
    onReceiptReconciled: (prov, auth) => {
      notifiedAuthNumber = auth;
    }
  });

  try {
    const res = await coordinator.triggerSync();
    assert.equal(res.syncedCount, 1);
    assert.equal(syncCalls[0], 'https://mock.local/benta-sync-claims', 'Sales must be submitted before shift reconciliation');
    assert.equal(journalState.sale_1.status, 'accepted');
    assert.equal(journalState.sale_1.authoritativeReceiptNumber, 'RCP-20260822-001');
    assert.equal(notifiedAuthNumber, 'RCP-20260822-001', 'UI reconciliation listener must be notified with server receipt number');
  } finally {
    globalThis.fetch = originalFetch;
    coordinator.destroy();
  }
});

test('Shift Close Gate: Unaccepted, in-flight, or needs-review claims block shift closure', async () => {
  const journalState: Record<string, any> = {
    sale_pending: {
      entryId: 'sale_pending', kind: 'sale', seqIndex: 1, idempotencyKey: 'k_pending', tenantId: 't1', staffAccountId: 's1', shiftId: 'sh1',
      status: 'pending_sync', items: [{ productId: 'p1', quantity: 1, unitPriceCentavos: 1000 }], totalCentavos: 1000,
      provisionalReceiptNumber: 'PROV-SH1-1'
    },
    close_entry: {
      entryId: 'close_entry', kind: 'shift_close', seqIndex: 2, idempotencyKey: 'k_close', tenantId: 't1', staffAccountId: 's1', shiftId: 'sh1',
      status: 'pending_sync', endingCashCentavos: 15000
    }
  };

  const mockJournalDB: any = {
    getPendingEntries: async () => [journalState.close_entry], // Suppose only close was picked or pending sales were in needs_review
    getAuthorityContext: async () => ({
      grant: { payload: { grantId: 'g1', tenantId: 't1', staffAccountId: 's1', shiftId: 'sh1', snapshotId: 'snap1' }, signature: 'sig1' }
    }),
    getJournalEntriesForShift: async () => Object.values(journalState),
    assertAllPriorSalesTerminal: async (t: string, s: string, sh: string, closeSeq: number) => {
      const entries = Object.values(journalState);
      for (const e of entries) {
        if (e.seqIndex < closeSeq && e.kind !== 'shift_close') {
          if (e.status !== 'accepted' && e.status !== 'accepted_variance') {
            throw new Error(`shift_close_blocked_by_unresolved_claim: entry ${e.entryId} is in status '${e.status}'`);
          }
        }
      }
    },
    updateEntryStatus: async (id: string, st: string, extra?: any) => {
      if (journalState[id]) {
        journalState[id].status = st;
        journalState[id].lastError = extra?.lastError;
      }
    },
    recoverStaleInFlightEntries: async () => 0
  };

  let reconciliationCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (url.toString().includes('benta-shift-reconciliation')) {
      reconciliationCalled = true;
      return { ok: true, json: async () => ({ success: true }) };
    }
    return { ok: false };
  }) as any;

  const coordinator = new CashierOfflineSyncCoordinator({
    getIdToken: async () => 'mock-token',
    journalDB: mockJournalDB,
    syncEndpoint: 'https://mock.local/benta-sync-claims',
    reconciliationEndpoint: 'https://mock.local/benta-shift-reconciliation'
  });

  try {
    await coordinator.triggerSync();
    assert.equal(reconciliationCalled, false, 'Shift reconciliation endpoint MUST NOT be called when prior sales are unaccepted');
    assert.equal(journalState.close_entry.status, 'retryable_error');
    assert.ok(journalState.close_entry.lastError?.includes('shift_close_blocked_by_unresolved_claim'));
  } finally {
    globalThis.fetch = originalFetch;
    coordinator.destroy();
  }
});

test('Checkout lock predicate: Owner not blocked by Cashier lock, Cashier blocked when locked', () => {
  // Owner + Cashier store locked → allow
  assert.equal(shouldBlockCheckoutForCashierLock(false, true), false, 'Owner should not be blocked by Cashier lock');
  // Cashier + locked → blocked
  assert.equal(shouldBlockCheckoutForCashierLock(true, true), true, 'Cashier should be blocked when locked');
  // Cashier + unlocked → allow
  assert.equal(shouldBlockCheckoutForCashierLock(true, false), false, 'Cashier should not be blocked when unlocked');
});
