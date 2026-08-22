import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  verifyPinWithMigrationCheck,
  hashPinModern,
  dummyVerifyModernPin,
  generateCashierAuthUid
} from './pin-security';
import { staffAuthRateLimiter, extractTrustedClientIp } from './rate-limiter';
import { isSecureCashierSystemEnabled } from './secure-cashier-config';
import * as admin from 'firebase-admin';

const GENERIC_AUTH_ERROR = 'Maling Business Code, Username, o PIN. Paki-check at subukan muli.';

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  Response.json(body, { status, headers });

interface StaffPinLoginDependencies {
  enabled: () => boolean;
  getFirestore: typeof getAdminFirestore;
  getAuth: typeof getAdminAuth;
  rateLimiter: typeof staffAuthRateLimiter;
  extractClientIp: typeof extractTrustedClientIp;
  verifyPin: typeof verifyPinWithMigrationCheck;
  hashPin: typeof hashPinModern;
  dummyVerify: typeof dummyVerifyModernPin;
  generateAuthUid: typeof generateCashierAuthUid;
  serverTimestamp: () => admin.firestore.FieldValue;
}

/** Server-only dependency seam. Production always uses the defaults below. */
export function createStaffPinLoginHandler(overrides: Partial<StaffPinLoginDependencies> = {}) {
  const deps: StaffPinLoginDependencies = {
    enabled: isSecureCashierSystemEnabled,
    getFirestore: getAdminFirestore,
    getAuth: getAdminAuth,
    rateLimiter: staffAuthRateLimiter,
    extractClientIp: extractTrustedClientIp,
    verifyPin: verifyPinWithMigrationCheck,
    hashPin: hashPinModern,
    dummyVerify: dummyVerifyModernPin,
    generateAuthUid: generateCashierAuthUid,
    serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    ...overrides
  };

  const fail = (status = 401) => json({ error: GENERIC_AUTH_ERROR }, status);
  const limited = (retryAfterSeconds: number) => json({
    error: GENERIC_AUTH_ERROR,
    retryAfter: retryAfterSeconds
  }, 429, { 'Retry-After': String(retryAfterSeconds) });

  return async function handleStaffPinLogin(request: Request): Promise<Response> {
    try {
      if (!deps.enabled()) return fail(503);
      const ipMode = deps.rateLimiter.usesIpSpecificThrottling?.() ?? true;
      const clientIp = ipMode ? deps.extractClientIp(request.headers) : null;
      if (ipMode && !clientIp) return limited(60);
      const networkAdmission = deps.rateLimiter.admitRequest
        ? await deps.rateLimiter.admitRequest(clientIp)
        : await deps.rateLimiter.admitNetworkRequest(clientIp!);
      if (networkAdmission.isLimited) return limited(networkAdmission.retryAfterSeconds);
      const admissionId = networkAdmission.admissionId;
      if (!admissionId) return limited(60);

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        await deps.dummyVerify('0000');
        return json({ error: GENERIC_AUTH_ERROR }, 400);
      }

      const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
      const code = typeof payload.businessCode === 'string' ? payload.businessCode.trim().toUpperCase() : '';
      const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
      const pin = typeof payload.pin === 'string' ? payload.pin.trim() : '';
      const accountKey = `${code}:${username}`;

      if (!code || !username || !/^\d{4}$/.test(pin)) {
        await deps.dummyVerify(pin);
        return json({ error: GENERIC_AUTH_ERROR }, 400);
      }

      const throttle = await deps.rateLimiter.acquireAuthentication(accountKey, clientIp, admissionId);
      if (throttle.isLimited) return limited(throttle.retryAfterSeconds);
      const reservationId = throttle.reservationId;
      if (!reservationId) return limited(60);
      const failAuthentication = async () => {
        const finalized = await deps.rateLimiter.finalizeFailure(accountKey, clientIp, reservationId);
        return finalized ? fail() : limited(60);
      };

      const db = deps.getFirestore();
      const codeDoc = await db.collection('business_codes').doc(code).get();
      const tenantId = codeDoc.exists ? codeDoc.data()?.tenantId : undefined;
      if (!tenantId) {
        await deps.dummyVerify(pin);
        return failAuthentication();
      }

      const staffQuery = await db.collection('tenants').doc(tenantId)
        .collection('staff_accounts').where('usernameLower', '==', username).limit(1).get();
      if (staffQuery.empty) {
        await deps.dummyVerify(pin);
        return failAuthentication();
      }

      const initialStaffDoc = staffQuery.docs[0];
      const initial = initialStaffDoc.data();
      if (initial.status !== 'active') {
        await deps.dummyVerify(pin);
        return failAuthentication();
      }

      const verification = await deps.verifyPin(pin, initial.pinHash);
      if (!verification.isValid) return failAuthentication();

      const initialHash = initial.pinHash;
      const initialSessionVersion = typeof initial.sessionVersion === 'number' ? initial.sessionVersion : 1;
      const expectedAuthUid = initial.authUid || deps.generateAuthUid(tenantId, initialStaffDoc.id);
      const migrationHash = verification.needsMigration ? await deps.hashPin(pin) : null;
      const codeRef = db.collection('business_codes').doc(code);
      const tenantRef = db.collection('tenants').doc(tenantId);
      const staffRef = initialStaffDoc.ref;

      let authoritative;
      try {
        authoritative = await db.runTransaction(async (transaction) => {
          const freshCode = await transaction.get(codeRef);
          const freshTenant = await transaction.get(tenantRef);
          const freshStaff = await transaction.get(staffRef);
          if (!freshCode.exists || freshCode.data()?.tenantId !== tenantId || !freshTenant.exists || !freshStaff.exists) {
            throw new Error('authoritative_state_changed');
          }

          const tenant = freshTenant.data() || {};
          const staff = freshStaff.data() || {};
          const sessionVersion = typeof staff.sessionVersion === 'number' ? staff.sessionVersion : 1;
          const authUid = staff.authUid || deps.generateAuthUid(tenantId, initialStaffDoc.id);
          if (staff.status !== 'active' || staff.pinHash !== initialHash ||
              sessionVersion !== initialSessionVersion || authUid !== expectedAuthUid) {
            throw new Error('authoritative_state_changed');
          }

          const updates: Record<string, unknown> = { lastLoginAt: deps.serverTimestamp() };
          if (migrationHash) {
            updates.pinHash = migrationHash;
            updates.credentialVersion = 2;
            updates.migratedAt = deps.serverTimestamp();
          }
          if (!staff.authUid) updates.authUid = authUid;
          if (typeof staff.sessionVersion !== 'number') updates.sessionVersion = sessionVersion;
          transaction.update(staffRef, updates);

          return {
            authUid,
            sessionVersion,
            tenantName: tenant.name || 'Store',
            moduleType: tenant.moduleType || 'benta-snap',
            staffAccount: { id: initialStaffDoc.id, username: staff.username, status: staff.status }
          };
        });
      } catch {
        return failAuthentication();
      }

      let customToken: string;
      try {
        customToken = await deps.getAuth().createCustomToken(authoritative.authUid, {
          role: 'cashier',
          tenantId,
          staffAccountId: authoritative.staffAccount.id,
          sessionVersion: authoritative.sessionVersion
        });
      } catch {
        // Leave the reservation to expire naturally. Valid account history is not
        // erased unless token minting has completed successfully.
        return fail(500);
      }

      if (!await deps.rateLimiter.finalizeSuccess(accountKey, clientIp, reservationId)) {
        return fail(500);
      }

      return json({ success: true, customToken, tenantId, ...authoritative });
    } catch {
      console.error('[AUTH_ERROR] Staff login failed: internal_error');
      return fail(500);
    }
  };
}
