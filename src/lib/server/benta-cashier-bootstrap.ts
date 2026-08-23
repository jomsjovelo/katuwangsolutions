import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { admitStaffAuthRequest, extractTrustedClientIp, staffAuthRateLimiter } from './rate-limiter';
import { isSecureCashierOfflineEnabled, isSecureCashierSystemEnabled } from './secure-cashier-config';
import {
  assertBentaCashierAuthorization, BENTA_SNAP_MODULE_ID, CheckoutError, CheckoutErrorCode,
  sanitizedErrorResponse, SERVER_IDENTIFIER, verifyBentaCashierIdentity
} from './cashier-server-authorization';
import { assertReconciliationShift } from './benta-cashier-shift-receipt';
import {
  getCatalogSnapshotService,
  CatalogSnapshotService,
  canonicalizeCatalogProducts,
  generateCatalogDigest,
  generateServerCatalogDigest
} from './catalog-snapshot-service';
import { getOfflineGrantSigner, OfflineGrantSigner } from './offline-grant-signer';
import {
  OfflineAuthGrant,
  OfflineAuthGrantPayload,
  ClientCatalogSnapshotItem
} from '@/lib/offline/offline-types';
import { ServerTrustedDeviceDoc } from '@/lib/offline/webauthn-types';
import { computeCredentialIdHash, computePublicKeyHash } from './webauthn-server-service';

export interface SanitizedBootstrapProduct {
  id: string;
  name: string;
  salePrice: number;
  currentStock: number;
  unit: string;
  isActive: true;
  sku?: string;
  barcode?: string;
  category?: string;
  minStock?: number;
}

export interface SanitizedBootstrapShift {
  id: string;
  moduleId: typeof BENTA_SNAP_MODULE_ID;
  status: 'open';
  startingCashCentavos: number;
  openedAt: string;
}

export interface ClientSafeCatalogSnapshot {
  snapshotId: string;
  catalogDigest: string;
  productCount: number;
  products: Record<string, ClientCatalogSnapshotItem>;
}

export interface BentaCashierBootstrapResponse {
  tenantId: string;
  tenantDisplayName: string;
  moduleId: typeof BENTA_SNAP_MODULE_ID;
  staffAccountId: string;
  cashierDisplayName: string;
  currentShift: SanitizedBootstrapShift | null;
  products: SanitizedBootstrapProduct[];
  offlineAuthority?: {
    grant: OfflineAuthGrant;
    snapshot: ClientSafeCatalogSnapshot;
    stockBaseline: Record<string, number>;
    stockCapturedAtIso: string;
  };
}

export interface BootstrapServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  grantSigner?: OfflineGrantSigner;
  snapshotService?: CatalogSnapshotService;
  now?: () => Date;
  env?: Record<string, string | undefined>;
}

function safeDisplayName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized && normalized.length <= 100 && !/[\u0000-\u001F\u007F]/.test(normalized) ? normalized : fallback;
}

function safeOptionalDisplay(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= 128 && !/[\u0000-\u001F\u007F]/.test(normalized) ? normalized : undefined;
}

function timestampIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

function sanitizeProduct(snapshot: admin.firestore.QueryDocumentSnapshot, tenantId: string): SanitizedBootstrapProduct | null {
  const product = snapshot.data();
  if (!SERVER_IDENTIFIER.test(snapshot.id) || (product.id !== undefined && product.id !== snapshot.id) ||
      product.tenantId !== tenantId || product.isActive !== true ||
      (product.moduleId !== undefined && product.moduleId !== BENTA_SNAP_MODULE_ID) ||
      typeof product.name !== 'string' || !product.name.trim() || product.name.trim().length > 200 ||
      /[\u0000-\u001F\u007F]/.test(product.name) || typeof product.unit !== 'string' || !product.unit.trim() ||
      product.unit.trim().length > 64 || /[\u0000-\u001F\u007F]/.test(product.unit) ||
      !Number.isSafeInteger(product.salePrice) || product.salePrice < 0 ||
      !Number.isSafeInteger(product.currentStock) || product.currentStock < 0 ||
      (product.minStock !== undefined && (!Number.isSafeInteger(product.minStock) || product.minStock < 0))) {
    return null;
  }
  const sku = safeOptionalDisplay(product.sku);
  const barcode = safeOptionalDisplay(product.barcode);
  const category = safeOptionalDisplay(product.category);
  return {
    id: snapshot.id,
    name: product.name.trim(),
    ...(sku ? { sku } : {}),
    ...(barcode ? { barcode } : {}),
    ...(category ? { category } : {}),
    salePrice: product.salePrice,
    currentStock: product.currentStock,
    ...(product.minStock !== undefined ? { minStock: product.minStock } : {}),
    unit: product.unit.trim(),
    isActive: true
  };
}

export async function getBentaCashierBootstrap(
  idToken: string,
  options: BootstrapServiceOptions = {},
  clientInstallationId?: string
): Promise<BentaCashierBootstrapResponse> {
  const auth = options.adminAuth || getAdminAuth();
  const identity = await verifyBentaCashierIdentity(idToken, auth);
  const db = options.adminFirestore || getAdminFirestore();
  const tenantRef = db.collection('tenants').doc(identity.tenantId);
  const staffRef = tenantRef.collection('staff_accounts').doc(identity.staffAccountId);
  const nowDate = options.now ? options.now() : new Date();
  const nowEpoch = Math.floor(nowDate.getTime() / 1000);
  const env = options.env || process.env;

  const hasValidInstallation = typeof clientInstallationId === 'string' &&
    clientInstallationId.trim().length > 0 &&
    SERVER_IDENTIFIER.test(clientInstallationId.trim());

  const validatedInstallationId = hasValidInstallation ? clientInstallationId.trim() : null;

  try {
    // 1. Authorized Read-Only Capture Phase:
    // Assert full tenant/staff authorization and active shift integrity before snapshot creation
    const [initialTenantSnap, initialStaffSnap] = typeof tenantRef.get === 'function'
      ? await Promise.all([tenantRef.get(), staffRef.get()])
      : await db.runTransaction(async (tx: any) => tx.getAll(tenantRef, staffRef));

    const initialStaff = assertBentaCashierAuthorization(identity, initialTenantSnap, initialStaffSnap);

    if (!initialStaff.activeShiftId || typeof initialStaff.activeShiftId !== 'string') {
      // Check for orphan open shifts without pointer
      const [accountOpenShifts, actorOpenShifts] = typeof tenantRef.collection === 'function' && typeof tenantRef.collection('shifts').where === 'function'
        ? await Promise.all([
            tenantRef.collection('shifts').where('staffAccountId', '==', identity.staffAccountId).where('status', '==', 'open').get(),
            tenantRef.collection('shifts').where('staffId', '==', identity.actorId).where('status', '==', 'open').get()
          ])
        : [ { empty: true, size: 0, docs: [] }, { empty: true, size: 0, docs: [] } ];

      if (accountOpenShifts.size > 0 || actorOpenShifts.size > 0) {
        throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
      }

      // No active shift -> online bootstrap without offline grant
      const productSnapshots = await tenantRef.collection('products').where('isActive', '==', true).get();
      const products = productSnapshots.docs
        .map((snapshot: any) => sanitizeProduct(snapshot, identity.tenantId))
        .filter((product: any): product is SanitizedBootstrapProduct => product !== null)
        .sort((left: any, right: any) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

      return {
        tenantId: identity.tenantId,
        tenantDisplayName: safeDisplayName(initialTenantSnap.data()?.name, 'Store'),
        moduleId: BENTA_SNAP_MODULE_ID,
        staffAccountId: identity.staffAccountId,
        cashierDisplayName: safeDisplayName(initialStaff.displayName, safeDisplayName(initialStaff.username, 'Cashier')),
        currentShift: null,
        products
      };
    }

    const initialProductSnapshots = await tenantRef.collection('products').where('isActive', '==', true).get();

    let externalSnapshot: any = null;
    let clientSafeSnapshot: ClientSafeCatalogSnapshot | null = null;

    // 2. External Snapshot Publication Phase (OUTSIDE retryable transaction):
    if (isSecureCashierOfflineEnabled(env) && validatedInstallationId) {
      const snapshotService = options.snapshotService || getCatalogSnapshotService();

      const catalogProductsForSnapshot = initialProductSnapshots.docs
        .map((snapshot) => {
          const data = snapshot.data();
          return {
            id: snapshot.id,
            name: data.name || '',
            salePrice: data.salePrice || 0,
            costPrice: data.costPrice !== undefined ? data.costPrice : 0,
            unit: data.unit || 'pcs',
            category: data.category || 'General',
            sku: data.sku || '',
            barcode: data.barcode || '',
            isActive: data.isActive === true
          };
        })
        .filter((p) => p.isActive && p.name && Number.isSafeInteger(p.salePrice) && Number.isSafeInteger(p.costPrice));

      externalSnapshot = await snapshotService.getOrCreateSnapshot(identity.tenantId, catalogProductsForSnapshot);

      const clientSafeProducts: Record<string, ClientCatalogSnapshotItem> = {};
      for (const [pId, pItem] of Object.entries(externalSnapshot.products as Record<string, any>)) {
        clientSafeProducts[pId] = {
          id: pItem.id,
          name: pItem.name,
          salePriceCentavos: pItem.salePriceCentavos,
          unit: pItem.unit,
          category: pItem.category,
          sku: pItem.sku,
          barcode: pItem.barcode,
          isActive: pItem.isActive
        };
      }

      clientSafeSnapshot = {
        snapshotId: externalSnapshot.snapshotId,
        catalogDigest: externalSnapshot.catalogDigest,
        productCount: externalSnapshot.productCount,
        products: clientSafeProducts
      };
    }

    // 3. Final Atomic Revalidation Transaction:
    return await db.runTransaction(async (transaction) => {
      const [tenantSnapshot, staffSnapshot] = await transaction.getAll(tenantRef, staffRef);
      const staff = assertBentaCashierAuthorization(identity, tenantSnapshot, staffSnapshot);
      const tenant = tenantSnapshot.data()!;

      let currentShift: SanitizedBootstrapShift | null = null;
      let activeShiftDocumentId: string | null = null;

      if (Object.prototype.hasOwnProperty.call(staff, 'activeShiftId')) {
        if (typeof staff.activeShiftId !== 'string' || !SERVER_IDENTIFIER.test(staff.activeShiftId)) {
          throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
        }
        const shiftSnapshot = await transaction.get(tenantRef.collection('shifts').doc(staff.activeShiftId));
        if (!shiftSnapshot.exists) throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
        let shift;
        try { shift = assertReconciliationShift(shiftSnapshot.id, shiftSnapshot.data()!, identity); }
        catch { throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED); }
        const openedAt = timestampIso(shiftSnapshot.data()!.openedAt);
        if (!openedAt || shiftSnapshot.id !== staff.activeShiftId) throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
        activeShiftDocumentId = shiftSnapshot.id;
        currentShift = {
          id: shiftSnapshot.id,
          moduleId: BENTA_SNAP_MODULE_ID,
          status: 'open',
          startingCashCentavos: shift.startingCash,
          openedAt
        };
      }

      const [accountOpenShifts, actorOpenShifts] = await Promise.all([
        transaction.get(tenantRef.collection('shifts').where('staffAccountId', '==', identity.staffAccountId).where('status', '==', 'open')),
        transaction.get(tenantRef.collection('shifts').where('staffId', '==', identity.actorId).where('status', '==', 'open'))
      ]);
      const associatedOpenShiftIds = new Set([
        ...accountOpenShifts.docs.map((snapshot) => snapshot.id),
        ...actorOpenShifts.docs.map((snapshot) => snapshot.id)
      ]);
      if (activeShiftDocumentId === null) {
        if (associatedOpenShiftIds.size !== 0) throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
      } else if (associatedOpenShiftIds.size !== 1 || !associatedOpenShiftIds.has(activeShiftDocumentId)) {
        throw new CheckoutError(CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED);
      }

      // Re-read current product records in transaction
      const productSnapshots = await transaction.get(tenantRef.collection('products').where('isActive', '==', true));
      const products = productSnapshots.docs
        .map((snapshot) => sanitizeProduct(snapshot, identity.tenantId))
        .filter((product): product is SanitizedBootstrapProduct => product !== null)
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

      let offlineAuthority: BentaCashierBootstrapResponse['offlineAuthority'] = undefined;

      // Revalidate Catalog Race & Issue Grant if active Trusted Device exists
      if (
        isSecureCashierOfflineEnabled(env) &&
        currentShift &&
        validatedInstallationId &&
        clientSafeSnapshot &&
        externalSnapshot
      ) {
        // Two-Phase Catalog Validation: Recompute digests from current Firestore transaction read
        const txCatalogProducts = productSnapshots.docs
          .map((snapshot) => {
            const data = snapshot.data();
            return {
              id: snapshot.id,
              name: data.name || '',
              salePrice: data.salePrice || 0,
              costPrice: data.costPrice !== undefined ? data.costPrice : 0,
              unit: data.unit || 'pcs',
              category: data.category || 'General',
              sku: data.sku || '',
              barcode: data.barcode || '',
              isActive: data.isActive === true
            };
          })
          .filter((p) => p.isActive && p.name && Number.isSafeInteger(p.salePrice) && Number.isSafeInteger(p.costPrice));

        const txCanonicalProducts = canonicalizeCatalogProducts(txCatalogProducts);
        const txPublicDigest = generateCatalogDigest(txCanonicalProducts);
        const txServerDigest = generateServerCatalogDigest(txCanonicalProducts);

        if (
          txPublicDigest !== externalSnapshot.catalogDigest ||
          txServerDigest !== externalSnapshot.serverCatalogDigest
        ) {
          throw new CheckoutError(CheckoutErrorCode.CHECKOUT_UNAVAILABLE);
        }

        // Capture fresh stock baseline directly from transaction product read
        const stockBaseline: Record<string, number> = {};
        for (const p of products) {
          stockBaseline[p.id] = p.currentStock;
        }

        // Query trusted device document
        const trustedDeviceQuery = await transaction.get(
          db.collection('webauthn_credentials')
            .where('tenantId', '==', identity.tenantId)
            .where('staffAccountId', '==', identity.staffAccountId)
            .where('installationId', '==', validatedInstallationId)
            .where('status', '==', 'active')
            .limit(1)
        );

        // Only mint offline grant if active trusted device exists
        if (!trustedDeviceQuery.empty) {
          const trustedDevice = trustedDeviceQuery.docs[0].data() as ServerTrustedDeviceDoc;
          const signer = options.grantSigner || getOfflineGrantSigner();

          const credentialIdBytes = Buffer.from(trustedDevice.credentialId, 'base64url');
          const credentialIdHash = computeCredentialIdHash(credentialIdBytes);
          const publicKeySpkiBytes = Buffer.from(trustedDevice.publicKeySpki, 'base64');
          const credentialPublicKeyHash = computePublicKeyHash(publicKeySpkiBytes);

          const deterministicGrantId = createHash('sha256')
            .update(`grant:${identity.tenantId}:${identity.staffAccountId}:${currentShift.id}:${validatedInstallationId}:${credentialIdHash}:${externalSnapshot.snapshotId}`)
            .digest('hex');

          const grantDocRef = tenantRef.collection('offline_grants').doc(deterministicGrantId);
          const grantSnap = await transaction.get(grantDocRef);

          let signedGrant: OfflineAuthGrant;

          if (
            grantSnap.exists &&
            grantSnap.data()?.status === 'active' &&
            grantSnap.data()?.sessionVersion === identity.sessionVersion &&
            grantSnap.data()?.catalogDigest === externalSnapshot.catalogDigest &&
            grantSnap.data()?.credentialIdHash === credentialIdHash
          ) {
            const gData = grantSnap.data()!;
            const grantPayload: OfflineAuthGrantPayload = {
              grantId: deterministicGrantId,
              tenantId: identity.tenantId,
              staffAccountId: identity.staffAccountId,
              authUid: identity.uid,
              sessionVersion: identity.sessionVersion,
              shiftId: currentShift.id,
              installationId: validatedInstallationId,
              credentialIdHash,
              credentialPublicKeyHash,
              snapshotId: externalSnapshot.snapshotId,
              catalogDigest: externalSnapshot.catalogDigest,
              issuedAt: gData.issuedAt?.toDate ? Math.floor(gData.issuedAt.toDate().getTime() / 1000) : nowEpoch,
              allowedTenders: ['cash']
            };
            signedGrant = signer.signGrant(grantPayload);
          } else {
            const grantPayload: OfflineAuthGrantPayload = {
              grantId: deterministicGrantId,
              tenantId: identity.tenantId,
              staffAccountId: identity.staffAccountId,
              authUid: identity.uid,
              sessionVersion: identity.sessionVersion,
              shiftId: currentShift.id,
              installationId: validatedInstallationId,
              credentialIdHash,
              credentialPublicKeyHash,
              snapshotId: externalSnapshot.snapshotId,
              catalogDigest: externalSnapshot.catalogDigest,
              issuedAt: nowEpoch,
              allowedTenders: ['cash']
            };

            signedGrant = signer.signGrant(grantPayload);

            transaction.set(grantDocRef, {
              grantId: deterministicGrantId,
              tenantId: identity.tenantId,
              staffAccountId: identity.staffAccountId,
              authUid: identity.uid,
              sessionVersion: identity.sessionVersion,
              shiftId: currentShift.id,
              snapshotId: externalSnapshot.snapshotId,
              catalogDigest: externalSnapshot.catalogDigest,
              installationId: validatedInstallationId,
              credentialIdHash,
              credentialPublicKeyHash,
              allowedTenders: ['cash'],
              status: 'active',
              issuedAt: admin.firestore.FieldValue.serverTimestamp(),
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }

          offlineAuthority = {
            grant: signedGrant,
            snapshot: clientSafeSnapshot,
            stockBaseline,
            stockCapturedAtIso: nowDate.toISOString()
          };
        }
      }

      return {
        tenantId: identity.tenantId,
        tenantDisplayName: safeDisplayName(tenant.name, 'Store'),
        moduleId: BENTA_SNAP_MODULE_ID,
        staffAccountId: identity.staffAccountId,
        cashierDisplayName: safeDisplayName(staff.displayName, safeDisplayName(staff.username, 'Cashier')),
        currentShift,
        products,
        ...(offlineAuthority ? { offlineAuthority } : {})
      };
    });
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    throw new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE);
  }
}

export function createBentaCashierBootstrapRouteHandler(overrides: Partial<{
  enabled: () => boolean;
  extractClientIp: (headers: Headers) => string | null;
  admitNetworkRequest: (networkIdentifier: string) => Promise<{ isLimited: boolean; retryAfterSeconds: number; reason?: 'account' | 'network' | 'global' | 'unavailable' }>;
  getBootstrap: (token: string, clientInstallationId?: string) => Promise<BentaCashierBootstrapResponse>;
}> = {}, serviceOptions?: BootstrapServiceOptions) {
  const dependencies = {
    enabled: isSecureCashierSystemEnabled,
    extractClientIp: extractTrustedClientIp,
    admitNetworkRequest: (networkIdentifier: string) => staffAuthRateLimiter.admitNetworkRequest(networkIdentifier),
    getBootstrap: (token: string, clientInstallationId?: string) => getBentaCashierBootstrap(token, serviceOptions, clientInstallationId),
    ...overrides
  };
  return async (request: Request): Promise<Response> => {
    if (!dependencies.enabled()) return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.CHECKOUT_UNAVAILABLE));
    try {
      const clientIp = overrides.admitNetworkRequest ? dependencies.extractClientIp(request.headers) : null;
      if (overrides.admitNetworkRequest && !clientIp) return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE));
      const admission = overrides.admitNetworkRequest
        ? await dependencies.admitNetworkRequest(clientIp!)
        : await admitStaffAuthRequest(request.headers);
      if (admission.isLimited) {
        const unavailable = admission.reason === 'unavailable';
        const error = new CheckoutError(unavailable ? CheckoutErrorCode.SERVICE_UNAVAILABLE : CheckoutErrorCode.CHECKOUT_UNAVAILABLE);
        return Response.json({ error: error.userMessage, category: error.code }, {
          status: unavailable ? 503 : 429,
          headers: { 'Retry-After': String(Math.max(1, admission.retryAfterSeconds)) }
        });
      }
      const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '');
      if (!match) return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.AUTHENTICATION_REQUIRED));

      const clientInstallationId = request.headers.get('x-installation-id')?.trim();
      return Response.json(await dependencies.getBootstrap(match[1], clientInstallationId), { status: 200 });
    } catch (error) {
      return sanitizedErrorResponse(error instanceof CheckoutError ? error : new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE));
    }
  };
}
