/**
 * Order Snap Server Authority & Bootstrap Handler
 *
 * Implements:
 * - Strict Firebase ID token verification for both Owner and Cashier identities
 * - Zero trust of client-provided roles or tenant IDs
 * - Gated exclusively to authorized F&B modules ('order-snap', 'timpla-track', 'bite-snap')
 * - Explicit rejection of retail 'benta-snap' tenants
 * - Validation of caller-provided stable device ID and catalogVersion
 * - Mandatory match against authoritative cashier-safe catalog version
 * - Server-minted, ECDSA P-256/SHA-256 signed Order Snap authority certificate with bounded expiry
 * - Fail-closed before certificate issuance if no active, valid WebAuthn credential exists
 * - Sanitized error responses without sensitive internals, keys, or stack traces
 */

import crypto from 'node:crypto';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  OrderSnapError,
  OrderSnapErrorCode,
  sanitizedErrorResponse,
  SERVER_IDENTIFIER,
  ALLOWED_MODULE_IDS
} from './order-snap-finalizer';
import {
  verifyOrderSnapIdentity
} from './order-snap-identity';
import {
  OrderSnapAuthorityCertificatePayload,
  OrderSnapAuthorityCertificate,
  ORDER_SNAP_GRANT_KEY_ID_V2,
  MAX_ORDER_SNAP_OFFLINE_GRANT_LIFETIME_SECONDS,
  ORDER_SNAP_AUTHORIZED_MODULE_IDS
} from '../order-snap/offline-types';
import {
  OrderSnapCertificateSigner
} from './order-snap-certificate-signer';
import { buildCatalogSnapshot } from './order-snap-catalog-handler';
import { generateSecureId } from '../order-snap/secure-id-utils';
import { getWebAuthnConfig } from './webauthn-env-config';
import { getActiveTrustedDeviceForInstallation } from './webauthn-server-service';

export interface OrderSnapAuthorityHandlerOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  certificateSigner?: OrderSnapCertificateSigner;
  now?: () => admin.firestore.Timestamp;
  env?: Record<string, string | undefined>;
}

export const OrderSnapAuthorityRequestSchema = z
  .object({
    deviceId: z
      .string()
      .min(1, 'Device ID is required')
      .max(128, 'Device ID too long')
      .regex(SERVER_IDENTIFIER, 'Invalid device ID format'),
    catalogVersion: z
      .string()
      .min(1, 'Catalog version is required')
      .max(128, 'Catalog version too long')
      .regex(SERVER_IDENTIFIER, 'Invalid catalog version format')
  })
  .strict();

export type OrderSnapAuthorityRequest = z.infer<typeof OrderSnapAuthorityRequestSchema>;

function safeDisplayName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized && normalized.length <= 100 && !/[\u0000-\u001F\u007F]/.test(normalized)
    ? normalized
    : fallback;
}

const MAX_AUTHORITY_BODY_BYTES = 16 * 1024;

export function createOrderSnapAuthorityRouteHandler(
  options: OrderSnapAuthorityHandlerOptions = {}
) {
  return async function handleOrderSnapAuthority(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
      return sanitizedErrorResponse(
        new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Method Not Allowed'),
        { Allow: 'POST' }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return sanitizedErrorResponse(
        new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Content-Type must be application/json')
      );
    }

    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return sanitizedErrorResponse(
        new OrderSnapError(OrderSnapErrorCode.AUTHENTICATION_REQUIRED, 'Missing or invalid Authorization header')
      );
    }
    const idToken = authHeader.substring(7).trim();
    if (!idToken) {
      return sanitizedErrorResponse(
        new OrderSnapError(OrderSnapErrorCode.AUTHENTICATION_REQUIRED, 'Empty bearer token')
      );
    }

    try {
      const auth = options.adminAuth || getAdminAuth();
      const firestore = options.adminFirestore || getAdminFirestore();

      // 1. Authoritative Live Identity Verification
      const identity = await verifyOrderSnapIdentity(idToken, auth, firestore);

      // 2. Validate request payload size & schema
      const rawText = await req.text();
      if (rawText.length > MAX_AUTHORITY_BODY_BYTES) {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Payload size exceeds 16KB limit')
        );
      }

      const utf8Bytes = new TextEncoder().encode(rawText).length;
      if (utf8Bytes > MAX_AUTHORITY_BODY_BYTES) {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Payload size exceeds 16KB limit')
        );
      }

      let bodyJson: unknown;
      try {
        bodyJson = JSON.parse(rawText);
      } catch {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Malformed JSON body')
        );
      }

      const parseResult = OrderSnapAuthorityRequestSchema.safeParse(bodyJson);
      if (!parseResult.success) {
        return sanitizedErrorResponse(
          new OrderSnapError(
            OrderSnapErrorCode.INVALID_REQUEST,
            'Invalid authority request parameters.'
          )
        );
      }
      const { deviceId, catalogVersion: requestedCatalogVersion } = parseResult.data;

      // 3. Re-read tenant for authoritative module & subscription validation
      const tenantRef = firestore.collection('tenants').doc(identity.tenantId);
      const tenantSnap = await tenantRef.get();
      if (!tenantSnap.exists) {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.CHECKOUT_UNAVAILABLE, 'Tenant not found.')
        );
      }

      const tenantData = tenantSnap.data() || {};
      const moduleType = tenantData.moduleType as string;

      if (!ALLOWED_MODULE_IDS.includes(moduleType as any)) {
        return sanitizedErrorResponse(
          new OrderSnapError(
            OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
            'Module not authorized for Order Snap offline authority.'
          )
        );
      }

      // Reject benta-snap and any module not in the F&B authorized list
      if (!ORDER_SNAP_AUTHORIZED_MODULE_IDS.includes(moduleType as any)) {
        return sanitizedErrorResponse(
          new OrderSnapError(
            OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
            'Module not authorized for Order Snap offline authority.'
          )
        );
      }

      if (tenantData.subscriptionStatus !== 'active') {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.CHECKOUT_UNAVAILABLE, 'Subscription inactive.')
        );
      }

      // 4. Resolve Authoritative Display Name
      let displayName = 'Staff';
      if (identity.role === 'cashier' && identity.staffAccountId) {
        const staffSnap = await tenantRef
          .collection('staff_accounts')
          .doc(identity.staffAccountId)
          .get();
        if (staffSnap.exists) {
          const staffData = staffSnap.data() || {};
          displayName = safeDisplayName(staffData.displayName, safeDisplayName(staffData.username, 'Cashier'));
        }
      } else if (identity.role === 'owner') {
        displayName = safeDisplayName(tenantData.name, 'Owner');
      }

      // 5. Authoritative Catalog Verification
      const currentCatalog = await buildCatalogSnapshot(
        identity.tenantId,
        identity.role,
        identity.staffAccountId,
        firestore,
        options.now
      );

      if (!currentCatalog) {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.CHECKOUT_UNAVAILABLE, 'Operational catalog unavailable.')
        );
      }

      if (currentCatalog.catalogVersion !== requestedCatalogVersion) {
        return sanitizedErrorResponse(
          new OrderSnapError(
            OrderSnapErrorCode.INVALID_REQUEST,
            'Catalog version mismatch. Please refresh catalog.'
          )
        );
      }

      // 6. Look up trusted WebAuthn device for this staff account and device ID
      const canonicalStaffAccountId = identity.role === 'owner'
        ? `owner_${identity.uid}`
        : identity.staffAccountId!;

      const trustedDevice = await getActiveTrustedDeviceForInstallation(
        identity.tenantId,
        canonicalStaffAccountId,
        deviceId,
        firestore
      );

      // Requirement 1 & 7: Fail closed BEFORE certificate issuance if trusted WebAuthn device is unavailable
      if (
        !trustedDevice ||
        trustedDevice.status !== 'active' ||
        !trustedDevice.credentialId ||
        !trustedDevice.publicKeySpki
      ) {
        return sanitizedErrorResponse(
          new OrderSnapError(
            OrderSnapErrorCode.AUTHENTICATION_REQUIRED,
            'A registered, active WebAuthn security key is required for offline authority.'
          )
        );
      }

      // 7. Resolve WebAuthn RP ID and Origin configuration
      const webAuthnConfig = getWebAuthnConfig(options.env);

      // Compute cryptographic fingerprints (SHA-256)
      const credentialIdBytes = Buffer.from(trustedDevice.credentialId, 'base64url');
      const credentialIdFingerprint = crypto
        .createHash('sha256')
        .update(credentialIdBytes)
        .digest('hex');

      const spkiCleaned = trustedDevice.publicKeySpki
        .replace(/-----BEGIN [^-]+-----/g, '')
        .replace(/-----END [^-]+-----/g, '')
        .replace(/\s+/g, '');
      const spkiBytes = Buffer.from(spkiCleaned, 'base64');

      // Requirement 7: Validate stored SPKI as a genuine ECDSA P-256 public key before certificate issuance
      let parsedPublicKey: crypto.KeyObject;
      try {
        parsedPublicKey = crypto.createPublicKey({
          key: spkiBytes,
          format: 'der',
          type: 'spki'
        });
      } catch {
        return sanitizedErrorResponse(
          new OrderSnapError(
            OrderSnapErrorCode.AUTHENTICATION_REQUIRED,
            'Invalid or corrupted WebAuthn public key.'
          )
        );
      }

      if (
        parsedPublicKey.asymmetricKeyType !== 'ec' ||
        parsedPublicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
      ) {
        return sanitizedErrorResponse(
          new OrderSnapError(
            OrderSnapErrorCode.AUTHENTICATION_REQUIRED,
            'WebAuthn public key must be an ECDSA P-256 (prime256v1) key.'
          )
        );
      }

      const credentialPublicKeyFingerprint = crypto
        .createHash('sha256')
        .update(spkiBytes)
        .digest('hex');

      // 8. Compute bounded expiry times (conservative explicit lifetime)
      const nowMs = options.now ? options.now().toMillis() : Date.now();
      const issuedAtSec = Math.floor(nowMs / 1000);
      const expiresAtSec = issuedAtSec + MAX_ORDER_SNAP_OFFLINE_GRANT_LIFETIME_SECONDS;

      // 9. Build the strict certificate payload (No empty hashes, fully bound)
      const certificatePayload: OrderSnapAuthorityCertificatePayload = {
        version: 2,
        algorithm: 'ES256',
        keyId: ORDER_SNAP_GRANT_KEY_ID_V2,
        grantId: generateSecureId('grant_'),
        moduleId: moduleType as 'order-snap' | 'timpla-track' | 'bite-snap',
        tenantId: identity.tenantId,
        staffAccountId: canonicalStaffAccountId,
        actorId: identity.actorId,
        authUid: identity.uid,
        role: identity.role,
        displayName,
        sessionVersion: identity.sessionVersion,
        deviceId,
        catalogVersion: currentCatalog.catalogVersion,
        allowedTenders: ['cash'],
        issuedAt: issuedAtSec,
        expiresAt: expiresAtSec,
        credentialIdFingerprint,
        credentialPublicKeyFingerprint,
        rpId: webAuthnConfig.rpId,
        expectedOrigin: webAuthnConfig.expectedOrigin,
        requireUserPresence: true,
        requireUserVerification: true
      };

      // 10. Cryptographically Sign Certificate with Order Snap Private Key
      const signer = options.certificateSigner || new OrderSnapCertificateSigner({ env: options.env });
      let signedCertificate: OrderSnapAuthorityCertificate;
      try {
        signedCertificate = signer.signCertificate(certificatePayload, ORDER_SNAP_GRANT_KEY_ID_V2);
      } catch (signerErr: any) {
        console.error('[ORDER_SNAP_AUTHORITY] certificate_signing_unavailable');
        return sanitizedErrorResponse(
          new OrderSnapError(
            OrderSnapErrorCode.SERVICE_UNAVAILABLE,
            'Authority certificate signing service unavailable.'
          )
        );
      }

      return Response.json(
        {
          success: true,
          grant: signedCertificate,
          webAuthnCredential: {
            credentialId: trustedDevice.credentialId,
            publicKeySpki: trustedDevice.publicKeySpki,
            rpId: webAuthnConfig.rpId,
            counter: trustedDevice.counter || 0
          }
        },
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
          }
        }
      );
    } catch (err: any) {
      if (err instanceof OrderSnapError) {
        return sanitizedErrorResponse(err);
      }
      console.error('[ORDER_SNAP_AUTHORITY] unexpected_error');
      return sanitizedErrorResponse(
        new OrderSnapError(OrderSnapErrorCode.SERVICE_UNAVAILABLE, 'Internal server error.')
      );
    }
  };
}