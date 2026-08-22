import * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { admitStaffAuthRequest, extractTrustedClientIp, staffAuthRateLimiter } from './rate-limiter';
import {
  CheckoutError, CheckoutErrorCode, sanitizedErrorResponse,
  verifyBentaCashierIdentity
} from './cashier-server-authorization';

export interface StaffLogoutServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

export async function revokeStaffSession(
  idToken: string, options: StaffLogoutServiceOptions = {}
): Promise<{ success: true }> {
  const auth = options.adminAuth || getAdminAuth();
  const identity = await verifyBentaCashierIdentity(idToken, auth);
  const db = options.adminFirestore || getAdminFirestore();
  const tenantRef = db.collection('tenants').doc(identity.tenantId);
  const staffRef = tenantRef.collection('staff_accounts').doc(identity.staffAccountId);
  const revokedAt = (options.now || admin.firestore.Timestamp.now)();
  try {
    await db.runTransaction(async (transaction) => {
      const [tenantSnapshot, staffSnapshot] = await transaction.getAll(tenantRef, staffRef);
      if (!tenantSnapshot.exists) throw new CheckoutError(CheckoutErrorCode.OPERATION_NOT_PERMITTED);
      if (!staffSnapshot.exists) throw new CheckoutError(CheckoutErrorCode.SESSION_INVALID);
      const staff = staffSnapshot.data()!;
      if (staff.status !== 'active' || staff.tenantId !== identity.tenantId || staff.authUid !== identity.uid ||
          staff.sessionVersion !== identity.sessionVersion) {
        throw new CheckoutError(CheckoutErrorCode.SESSION_INVALID);
      }
      if (!Number.isSafeInteger(staff.sessionVersion) || (staff.sessionVersion as number) >= Number.MAX_SAFE_INTEGER) {
        throw new CheckoutError(CheckoutErrorCode.SESSION_INVALID);
      }
      transaction.update(staffRef, { sessionVersion: (staff.sessionVersion as number) + 1, updatedAt: revokedAt });
    });
    return { success: true };
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    throw new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE);
  }
}

export function createStaffLogoutRouteHandler(overrides: Partial<{
  enabled: () => boolean;
  extractClientIp: (headers: Headers) => string | null;
  admitNetworkRequest: (networkIdentifier: string) => Promise<{ isLimited: boolean; retryAfterSeconds: number; reason?: 'account' | 'network' | 'global' | 'unavailable' }>;
  revokeSession: (token: string) => Promise<{ success: true }>;
}> = {}, serviceOptions?: StaffLogoutServiceOptions) {
  const dependencies = {
    // Logout/revocation intentionally remains available while activation is off.
    enabled: () => true,
    extractClientIp: extractTrustedClientIp,
    admitNetworkRequest: (networkIdentifier: string) => staffAuthRateLimiter.admitNetworkRequest(networkIdentifier),
    revokeSession: (token: string) => revokeStaffSession(token, serviceOptions),
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
      return Response.json(await dependencies.revokeSession(match[1]), { status: 200 });
    } catch (error) {
      return sanitizedErrorResponse(error instanceof CheckoutError ? error : new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE));
    }
  };
}
