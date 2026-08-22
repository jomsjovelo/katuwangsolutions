import * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { admitStaffAuthRequest, extractTrustedClientIp, staffAuthRateLimiter } from './rate-limiter';
import { isSecureCashierSystemEnabled } from './secure-cashier-config';
import {
  assertBentaCashierAuthorization, BENTA_SNAP_MODULE_ID, CheckoutError, CheckoutErrorCode,
  sanitizedErrorResponse, SERVER_IDENTIFIER, verifyBentaCashierIdentity
} from './cashier-server-authorization';
import { assertReconciliationShift } from './benta-cashier-shift-receipt';

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

export interface BentaCashierBootstrapResponse {
  tenantId: string;
  tenantDisplayName: string;
  moduleId: typeof BENTA_SNAP_MODULE_ID;
  staffAccountId: string;
  cashierDisplayName: string;
  currentShift: SanitizedBootstrapShift | null;
  products: SanitizedBootstrapProduct[];
}

export interface BootstrapServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
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
  idToken: string, options: BootstrapServiceOptions = {}
): Promise<BentaCashierBootstrapResponse> {
  const auth = options.adminAuth || getAdminAuth();
  const identity = await verifyBentaCashierIdentity(idToken, auth);
  const db = options.adminFirestore || getAdminFirestore();
  const tenantRef = db.collection('tenants').doc(identity.tenantId);
  const staffRef = tenantRef.collection('staff_accounts').doc(identity.staffAccountId);
  try {
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
      const productSnapshots = await transaction.get(tenantRef.collection('products').where('isActive', '==', true));
      const products = productSnapshots.docs
        .map((snapshot) => sanitizeProduct(snapshot, identity.tenantId))
        .filter((product): product is SanitizedBootstrapProduct => product !== null)
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
      return {
        tenantId: identity.tenantId,
        tenantDisplayName: safeDisplayName(tenant.name, 'Store'),
        moduleId: BENTA_SNAP_MODULE_ID,
        staffAccountId: identity.staffAccountId,
        cashierDisplayName: safeDisplayName(staff.displayName, safeDisplayName(staff.username, 'Cashier')),
        currentShift,
        products
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
  getBootstrap: (token: string) => Promise<BentaCashierBootstrapResponse>;
}> = {}, serviceOptions?: BootstrapServiceOptions) {
  const dependencies = {
    enabled: isSecureCashierSystemEnabled,
    extractClientIp: extractTrustedClientIp,
    admitNetworkRequest: (networkIdentifier: string) => staffAuthRateLimiter.admitNetworkRequest(networkIdentifier),
    getBootstrap: (token: string) => getBentaCashierBootstrap(token, serviceOptions),
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
      return Response.json(await dependencies.getBootstrap(match[1]), { status: 200 });
    } catch (error) {
      return sanitizedErrorResponse(error instanceof CheckoutError ? error : new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE));
    }
  };
}
