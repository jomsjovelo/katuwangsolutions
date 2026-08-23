import { createHash, randomBytes } from 'crypto';
import * as admin from 'firebase-admin';
import { getAdminFirestore } from '@/firebase/admin';
import {
  CatalogSnapshot,
  ServerCatalogSnapshotItem,
  ClientCatalogSnapshotItem
} from '@/lib/offline/offline-types';
import { canonicalizeJson } from './offline-grant-signer';

// Conservative UTF-8 byte budget per chunk (200 KB)
export const MAX_CHUNK_BYTES = 200 * 1024;

export interface ProductCatalogInput {
  id: string;
  name: string;
  salePrice: number;
  costPrice: number;                   // Required fail-closed historical cost
  currentStock?: number;
  unit?: string;
  category?: string;
  sku?: string;
  barcode?: string;
  isActive?: boolean;
}

/**
 * Normalizes and validates active products into canonical server snapshot items sorted by id.
 * Fails closed if any product record contains missing/invalid price, missing/invalid cost, missing name, or non-safe integer.
 * Never defaults cost price to sale price.
 */
export function canonicalizeCatalogProducts(products: ProductCatalogInput[]): ServerCatalogSnapshotItem[] {
  const active = products.filter((p) => p.isActive !== false);

  return active
    .map((p) => {
      if (!p.id || typeof p.id !== 'string' || p.id.trim().length === 0) {
        throw new Error(`invalid_product_id: ${p.id}`);
      }

      if (!p.name || typeof p.name !== 'string' || p.name.trim().length === 0) {
        throw new Error(`invalid_product_name for ${p.id}`);
      }

      if (!Number.isSafeInteger(p.salePrice) || p.salePrice < 0) {
        throw new Error(`invalid_product_sale_price for ${p.id}: ${p.salePrice}`);
      }

      if (p.costPrice === undefined || !Number.isSafeInteger(p.costPrice) || p.costPrice < 0) {
        throw new Error(`invalid_or_missing_product_cost_price for ${p.id}: ${p.costPrice}`);
      }

      const unit = p.unit && typeof p.unit === 'string' && p.unit.trim().length > 0 ? p.unit.trim() : 'pcs';

      const item: ServerCatalogSnapshotItem = {
        id: p.id.trim(),
        name: p.name.trim(),
        salePriceCentavos: p.salePrice,
        costPriceCentavos: p.costPrice,
        unit,
        category: p.category && typeof p.category === 'string' ? p.category.trim() : 'General',
        sku: p.sku && typeof p.sku === 'string' ? p.sku.trim() : '',
        barcode: p.barcode && typeof p.barcode === 'string' ? p.barcode.trim() : '',
        isActive: true
      };

      const itemBytes = Buffer.byteLength(JSON.stringify(item), 'utf8');
      if (itemBytes > MAX_CHUNK_BYTES) {
        throw new Error(`product_exceeds_max_chunk_size: ${p.id} (${itemBytes} bytes)`);
      }

      return item;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Computes deterministic SHA-256 digest over public client-facing catalog definition fields.
 * Strictly separates immutable catalog attributes from volatile stock quantities.
 * Never includes costPrice or volatile stock in the public digest calculation.
 */
export function generateCatalogDigest(canonicalProducts: ServerCatalogSnapshotItem[]): string {
  const clientCatalogDefinition = canonicalProducts.map((p) => ({
    id: p.id,
    name: p.name,
    salePriceCentavos: p.salePriceCentavos,
    unit: p.unit,
    category: p.category,
    sku: p.sku,
    barcode: p.barcode,
    isActive: p.isActive
  }));

  const canonical = canonicalizeJson(clientCatalogDefinition);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Computes deterministic SHA-256 server digest over authoritative pricing and cost fields.
 */
export function generateServerCatalogDigest(canonicalProducts: ServerCatalogSnapshotItem[]): string {
  const serverCatalogDefinition = canonicalProducts.map((p) => ({
    id: p.id,
    name: p.name,
    salePriceCentavos: p.salePriceCentavos,
    costPriceCentavos: p.costPriceCentavos,
    unit: p.unit,
    category: p.category,
    sku: p.sku,
    barcode: p.barcode,
    isActive: p.isActive
  }));

  const canonical = canonicalizeJson(serverCatalogDefinition);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export interface CatalogSnapshotServiceOptions {
  db?: admin.firestore.Firestore;
  now?: () => Date;
}

export class CatalogSnapshotService {
  private db: admin.firestore.Firestore;
  private now: () => Date;

  constructor(options: CatalogSnapshotServiceOptions = {}) {
    this.db = options.db || getAdminFirestore();
    this.now = options.now || (() => new Date());
  }

  /**
   * Retrieves or creates an immutable CatalogSnapshot for a tenant.
   * Reuses an existing snapshot ONLY when fully verified via verified reassembly.
   * Chunk publication fails closed: chunk documents are written first before committing the manifest.
   */
  async getOrCreateSnapshot(tenantId: string, products: ProductCatalogInput[]): Promise<CatalogSnapshot> {
    const canonical = canonicalizeCatalogProducts(products);
    const catalogDigest = generateCatalogDigest(canonical);
    const serverCatalogDigest = generateServerCatalogDigest(canonical);
    const snapshotsRef = this.db.collection('tenants').doc(tenantId).collection('catalog_snapshots');

    // Query by serverCatalogDigest to find existing matching candidate
    const recentSnapshots = await snapshotsRef
      .where('serverCatalogDigest', '==', serverCatalogDigest)
      .limit(1)
      .get();

    if (!recentSnapshots.empty) {
      const existingDoc = recentSnapshots.docs[0];
      // Full verified reassembly check
      const reassembled = await this.getSnapshotById(tenantId, existingDoc.id);
      if (reassembled && reassembled.catalogDigest === catalogDigest && reassembled.serverCatalogDigest === serverCatalogDigest) {
        return reassembled;
      }
    }

    // Partition products into chunks using serialized byte budget
    const chunks: Array<{ chunkIndex: number; products: Record<string, ServerCatalogSnapshotItem> }> = [];
    let currentChunkMap: Record<string, ServerCatalogSnapshotItem> = {};
    let currentChunkBytes = 2; // "{}" baseline

    for (const item of canonical) {
      const itemJson = `"${item.id}":${JSON.stringify(item)}`;
      const itemBytes = Buffer.byteLength(itemJson, 'utf8') + 1; // comma

      if (Object.keys(currentChunkMap).length > 0 && currentChunkBytes + itemBytes > MAX_CHUNK_BYTES) {
        chunks.push({ chunkIndex: chunks.length, products: currentChunkMap });
        currentChunkMap = {};
        currentChunkBytes = 2;
      }

      currentChunkMap[item.id] = item;
      currentChunkBytes += itemBytes;
    }

    if (Object.keys(currentChunkMap).length > 0 || chunks.length === 0) {
      chunks.push({ chunkIndex: chunks.length, products: currentChunkMap });
    }

    // Create collision-resistant snapshot ID
    const timestamp = this.now().getTime();
    const nonce = randomBytes(4).toString('hex');
    const snapshotId = `snap_${tenantId}_${timestamp}_${nonce}`;
    const snapshotRef = snapshotsRef.doc(snapshotId);

    const isChunked = chunks.length > 1;
    const fullProductsMap: Record<string, ServerCatalogSnapshotItem> = {};
    for (const item of canonical) {
      fullProductsMap[item.id] = item;
    }

    if (isChunked) {
      // Step 1: Write all chunk documents first
      for (const chunk of chunks) {
        await snapshotRef.collection('chunks').doc(`chunk_${chunk.chunkIndex}`).set({
          chunkIndex: chunk.chunkIndex,
          productCount: Object.keys(chunk.products).length,
          products: chunk.products
        });
      }

      // Step 2: Publish complete parent manifest
      await snapshotRef.set({
        snapshotId,
        tenantId,
        catalogDigest,
        serverCatalogDigest,
        productCount: canonical.length,
        isChunked: true,
        expectedChunkCount: chunks.length,
        status: 'completed',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await snapshotRef.set({
        snapshotId,
        tenantId,
        catalogDigest,
        serverCatalogDigest,
        productCount: canonical.length,
        isChunked: false,
        status: 'completed',
        products: chunks[0]?.products || {},
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return {
      snapshotId,
      tenantId,
      createdAt: this.now().toISOString(),
      catalogDigest,
      serverCatalogDigest,
      productCount: canonical.length,
      isChunked,
      expectedChunkCount: isChunked ? chunks.length : undefined,
      products: fullProductsMap
    };
  }

  /**
   * Fetches an existing snapshot by ID for offline claim price and cost reconciliation.
   * Fails closed: rejects incomplete, missing, duplicate, non-contiguous, or digest-mismatched snapshots.
   */
  async getSnapshotById(tenantId: string, snapshotId: string): Promise<CatalogSnapshot | null> {
    const snapshotDoc = await this.db
      .collection('tenants')
      .doc(tenantId)
      .collection('catalog_snapshots')
      .doc(snapshotId)
      .get();

    if (!snapshotDoc.exists) return null;

    const data = snapshotDoc.data()!;
    if (data.status !== 'completed') return null; // Incomplete / interrupted write

    const productsMap: Record<string, ServerCatalogSnapshotItem> = {};

    if (data.isChunked) {
      const chunksSnap = await snapshotDoc.ref.collection('chunks').get();
      if (chunksSnap.docs.length !== data.expectedChunkCount) {
        return null; // Missing or incomplete chunks -> Fail Closed!
      }

      const expectedCount = data.expectedChunkCount as number;
      const seenIndices = new Set<number>();

      for (const chunkDoc of chunksSnap.docs) {
        const chunkData = chunkDoc.data();
        if (typeof chunkData.chunkIndex !== 'number' || seenIndices.has(chunkData.chunkIndex) ||
            chunkData.chunkIndex < 0 || chunkData.chunkIndex >= expectedCount) {
          return null; // Invalid or duplicate chunk index -> Fail Closed!
        }
        seenIndices.add(chunkData.chunkIndex);
        Object.assign(productsMap, chunkData.products || {});
      }

      // Check contiguous indices 0..expectedCount-1
      for (let i = 0; i < expectedCount; i++) {
        if (!seenIndices.has(i)) return null; // Non-contiguous index gap -> Fail Closed!
      }
    } else {
      Object.assign(productsMap, data.products || {});
    }

    // Product count check
    if (data.productCount !== undefined && Object.keys(productsMap).length !== data.productCount) {
      return null; // Reassembled product count mismatch -> Fail Closed!
    }

    // Verify reassembled products match authoritative server digest & public digest
    const reassembledList = Object.values(productsMap).sort((a, b) => a.id.localeCompare(b.id));
    const computedServerDigest = generateServerCatalogDigest(reassembledList);
    const computedPublicDigest = generateCatalogDigest(reassembledList);

    if (data.serverCatalogDigest && computedServerDigest !== data.serverCatalogDigest) {
      return null; // Server digest mismatch -> Fail Closed!
    }

    if (data.catalogDigest && computedPublicDigest !== data.catalogDigest) {
      return null; // Public digest mismatch -> Fail Closed!
    }

    return {
      snapshotId: snapshotDoc.id,
      tenantId,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : '',
      catalogDigest: data.catalogDigest || computedPublicDigest,
      serverCatalogDigest: data.serverCatalogDigest || computedServerDigest,
      productCount: data.productCount || Object.keys(productsMap).length,
      isChunked: data.isChunked,
      expectedChunkCount: data.expectedChunkCount,
      products: productsMap
    };
  }
}

let globalSnapshotService: CatalogSnapshotService | null = null;

export function getCatalogSnapshotService(): CatalogSnapshotService {
  if (!globalSnapshotService) {
    globalSnapshotService = new CatalogSnapshotService();
  }
  return globalSnapshotService;
}
