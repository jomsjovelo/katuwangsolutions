import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeCatalogProducts,
  generateCatalogDigest,
  generateServerCatalogDigest,
  CatalogSnapshotService,
  MAX_CHUNK_BYTES
} from '../src/lib/server/catalog-snapshot-service';

test('canonicalizeCatalogProducts filters inactive and sorts products by ID, preserving costPrice', () => {
  const input = [
    { id: 'prod_z', name: 'Zebra Drink', salePrice: 3500, costPrice: 2000, isActive: true },
    { id: 'prod_a', name: 'Apple Juice', salePrice: 2500, costPrice: 1500, isActive: true },
    { id: 'prod_inactive', name: 'Old Item', salePrice: 1000, costPrice: 500, isActive: false }
  ];

  const canonical = canonicalizeCatalogProducts(input);
  assert.equal(canonical.length, 2);
  assert.equal(canonical[0].id, 'prod_a');
  assert.equal(canonical[1].id, 'prod_z');
  assert.equal(canonical[0].salePriceCentavos, 2500);
  assert.equal(canonical[0].costPriceCentavos, 1500);
});

test('canonicalizeCatalogProducts fails closed on invalid product data or missing costPrice', () => {
  assert.throws(() => canonicalizeCatalogProducts([{ id: '', name: 'Invalid', salePrice: 100, costPrice: 50 }]), /invalid_product_id/);
  assert.throws(() => canonicalizeCatalogProducts([{ id: 'p1', name: '', salePrice: 100, costPrice: 50 }]), /invalid_product_name/);
  assert.throws(() => canonicalizeCatalogProducts([{ id: 'p1', name: 'Valid', salePrice: -10, costPrice: 50 }]), /invalid_product_sale_price/);
  assert.throws(() => canonicalizeCatalogProducts([{ id: 'p1', name: 'Valid', salePrice: 10.5, costPrice: 50 }]), /invalid_product_sale_price/);
  assert.throws(() => canonicalizeCatalogProducts([{ id: 'p1', name: 'Valid', salePrice: 100, costPrice: -5 }]), /invalid_or_missing_product_cost_price/);
  assert.throws(() => canonicalizeCatalogProducts([{ id: 'p1', name: 'Valid', salePrice: 100 } as any]), /invalid_or_missing_product_cost_price/);
});

test('canonicalizeCatalogProducts rejects single oversized product safely', () => {
  const giantDescription = 'X'.repeat(MAX_CHUNK_BYTES + 100);
  assert.throws(
    () => canonicalizeCatalogProducts([{ id: 'giant_prod', name: giantDescription, salePrice: 100, costPrice: 50 }]),
    /product_exceeds_max_chunk_size/
  );
});

test('generateCatalogDigest produces identical public digest while generateServerCatalogDigest detects cost changes', () => {
  const list1 = canonicalizeCatalogProducts([
    { id: 'p1', name: 'P1', salePrice: 100, costPrice: 80, currentStock: 50 }
  ]);

  const list2 = canonicalizeCatalogProducts([
    { id: 'p1', name: 'P1', salePrice: 100, costPrice: 90, currentStock: 50 } // Different costPrice!
  ]);

  const listStockChange = canonicalizeCatalogProducts([
    { id: 'p1', name: 'P1', salePrice: 100, costPrice: 80, currentStock: 5 } // Stock-only change!
  ]);

  // Public digests are identical (cost-free)
  const publicDigest1 = generateCatalogDigest(list1);
  const publicDigest2 = generateCatalogDigest(list2);
  const publicDigestStock = generateCatalogDigest(listStockChange);
  assert.equal(publicDigest1, publicDigest2);
  assert.equal(publicDigest1, publicDigestStock, 'Stock-only changes must produce identical public catalog digest');

  // Authoritative server digests are distinct on cost change, but identical on stock change
  const serverDigest1 = generateServerCatalogDigest(list1);
  const serverDigest2 = generateServerCatalogDigest(list2);
  const serverDigestStock = generateServerCatalogDigest(listStockChange);
  assert.notEqual(serverDigest1, serverDigest2);
  assert.equal(serverDigest1, serverDigestStock, 'Stock-only changes must not alter server catalog digest');
});

test('cost-only change creates a new immutable snapshot in CatalogSnapshotService', async () => {
  const store: Record<string, any> = {};

  const mockDb: any = {
    collection: (coll: string) => ({
      doc: (docId: string) => ({
        collection: (subColl: string) => ({
          doc: (snapId: string) => ({
            set: async (data: any) => {
              store[`${docId}/${subColl}/${snapId}`] = data;
            },
            get: async () => ({
              exists: !!store[`${docId}/${subColl}/${snapId}`],
              id: snapId,
              data: () => store[`${docId}/${subColl}/${snapId}`]
            })
          }),
          where: (field: string, op: string, val: any) => ({
            limit: () => ({
              get: async () => {
                const matches = Object.entries(store)
                  .filter(([k, v]) => k.startsWith(`${docId}/${subColl}/`) && v[field] === val)
                  .map(([k, v]) => ({ id: k.split('/').pop()!, data: () => v }));
                return { empty: matches.length === 0, docs: matches };
              }
            })
          })
        })
      })
    })
  };

  let tick = 1000;
  const service = new CatalogSnapshotService({
    db: mockDb,
    now: () => new Date(tick++)
  });

  const products1 = [{ id: 'p1', name: 'Item', salePrice: 1000, costPrice: 500 }];
  const snap1 = await service.getOrCreateSnapshot('demo-tenant', products1);

  // Same products -> reuses snapshot
  const snap1Reuse = await service.getOrCreateSnapshot('demo-tenant', products1);
  assert.equal(snap1Reuse.snapshotId, snap1.snapshotId);

  // Cost-only change -> creates a NEW snapshot
  const products2 = [{ id: 'p1', name: 'Item', salePrice: 1000, costPrice: 700 }];
  const snap2 = await service.getOrCreateSnapshot('demo-tenant', products2);
  assert.notEqual(snap2.snapshotId, snap1.snapshotId);
  assert.equal(snap2.catalogDigest, snap1.catalogDigest); // Same public digest
  assert.notEqual(snap2.serverCatalogDigest, snap1.serverCatalogDigest); // Different server digest
});

test('CatalogSnapshotService generates collision-resistant concurrent IDs', async () => {
  const store: Record<string, any> = {};

  const mockDb: any = {
    collection: (coll: string) => ({
      doc: (docId: string) => ({
        collection: (subColl: string) => ({
          doc: (snapId: string) => ({
            set: async (data: any) => {
              store[`${docId}/${subColl}/${snapId}`] = data;
            },
            get: async () => ({
              exists: !!store[`${docId}/${subColl}/${snapId}`],
              id: snapId,
              data: () => store[`${docId}/${subColl}/${snapId}`]
            })
          }),
          where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) })
        })
      })
    })
  };

  const fixedTime = new Date(1700000000000);
  const service = new CatalogSnapshotService({ db: mockDb, now: () => fixedTime });

  const snapA = await service.getOrCreateSnapshot('demo-tenant', [{ id: 'p1', name: 'Item A', salePrice: 100, costPrice: 50 }]);
  const snapB = await service.getOrCreateSnapshot('demo-tenant', [{ id: 'p2', name: 'Item B', salePrice: 200, costPrice: 100 }]);

  assert.notEqual(snapA.snapshotId, snapB.snapshotId, 'Concurrent snapshot IDs at identical millisecond must not collide');
});

test('CatalogSnapshotService rejects incomplete chunks and corrupted writes fail closed', async () => {
  const store: Record<string, any> = {};

  const mockDb: any = {
    collection: (coll: string) => ({
      doc: (docId: string) => ({
        collection: (subColl: string) => ({
          doc: (snapId: string) => ({
            get: async () => ({
              exists: !!store[`${docId}/${subColl}/${snapId}`],
              id: snapId,
              ref: {
                collection: (chunkColl: string) => ({
                  get: async () => {
                    const docs = Object.keys(store)
                      .filter((k) => k.startsWith(`${docId}/${subColl}/${snapId}/${chunkColl}/`))
                      .map((k) => ({
                        id: k.split('/').pop()!,
                        data: () => store[k]
                      }));
                    return { docs };
                  }
                })
              },
              data: () => store[`${docId}/${subColl}/${snapId}`]
            })
          })
        })
      })
    })
  };

  const service = new CatalogSnapshotService({ db: mockDb });

  // 1. Interrupted write (status != completed)
  store['demo-tenant/catalog_snapshots/snap_interrupted'] = {
    status: 'in_progress',
    isChunked: false
  };
  const interrupted = await service.getSnapshotById('demo-tenant', 'snap_interrupted');
  assert.equal(interrupted, null);

  // 2. Missing chunk (expected 2 chunks, only 1 present)
  store['demo-tenant/catalog_snapshots/snap_missing_chunk'] = {
    status: 'completed',
    isChunked: true,
    expectedChunkCount: 2,
    serverCatalogDigest: 'digest-1'
  };
  store['demo-tenant/catalog_snapshots/snap_missing_chunk/chunks/chunk_0'] = {
    chunkIndex: 0,
    products: { p1: { id: 'p1', name: 'P1', salePriceCentavos: 100, costPriceCentavos: 50, isActive: true } }
  };
  const missingChunk = await service.getSnapshotById('demo-tenant', 'snap_missing_chunk');
  assert.equal(missingChunk, null);
});
