/**
 * Order Snap Server Checkout & Synchronization Handler
 *
 * Implements:
 * - Strict Firebase ID token verification for both Owner and Cashier identities
 * - Zero trust of client-provided roles or tenant IDs
 * - JSON-only body size enforcement (<= 64KB)
 * - Safe error mapping with cashier COGS redaction
 * - Authoritative Firestore transaction orchestration via finalizeOrderSnapTransaction
 * - Injectable dependencies for deterministic unit & integration testing
 * - Strict Zod discriminated union for checkout mode; no field inference; no defaults
 * - Independent verification of asymmetric certificate (v2) or legacy HMAC grant (v1) for offline_sync
 */

import crypto from 'node:crypto';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  finalizeOrderSnapTransaction,
  OrderSnapError,
  OrderSnapErrorCode,
  sanitizedErrorResponse,
  VerifiedOrderSnapIdentity
} from './order-snap-finalizer';
import {
  verifyOrderSnapIdentity as verifyOrderSnapIdentityCanonical,
  VerifiedOrderSnapIdentity as VerifiedIdentity
} from './order-snap-identity';
import {
  OrderIngestionRequest,
  OrderIngestionRequestSchema
} from '../order-snap/order-ingestion';
import {
  admitStaffAuthRequest,
  extractTrustedClientIp,
  staffAuthRateLimiter,
  ThrottleDecision
} from './rate-limiter';
import { isSecureCashierSystemEnabled } from './secure-cashier-config';

import {
  OrderSnapAuthorityGrant,
  OrderSnapAuthorityGrantSchema
} from '../order-snap/offline-types';
import {
  OrderSnapGrantSigner
} from './order-snap-grant-signer';
import {
  OrderSnapCertificateSigner
} from './order-snap-certificate-signer';

// ---------------------------------------------------------------------------
// Strict discriminated union checkout payload schema
// No field inference: mode is always required and explicit.
// No paymentMethod default: must be supplied by the caller.
// online_direct: forbids authorityGrant, deviceId, catalogVersion.
// offline_sync:  requires authorityGrant, deviceId, catalogVersion.
// ---------------------------------------------------------------------------

const OnlineDirectPayloadSchema = z.object({
  mode: z.literal('online_direct'),
  request: OrderIngestionRequestSchema,
  paymentMethod: z.literal('cash'),
  paymentReference: z.string().optional()
}).strict();

const OfflineSyncPayloadSchema = z.object({
  mode: z.literal('offline_sync'),
  request: OrderIngestionRequestSchema,
  paymentMethod: z.literal('cash'),
  paymentReference: z.string().optional(),
  authorityGrant: OrderSnapAuthorityGrantSchema,
  deviceId: z.string().min(1).max(128),
  catalogVersion: z.string().min(1).max(128)
}).strict();

export const OrderSnapCheckoutPayloadSchema = z.discriminatedUnion('mode', [
  OnlineDirectPayloadSchema,
  OfflineSyncPayloadSchema
]);

export type OrderSnapCheckoutPayload = z.infer<typeof OrderSnapCheckoutPayloadSchema>;

export interface OrderSnapCheckoutHandlerOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  grantSigner?: OrderSnapGrantSigner;
  certificateSigner?: OrderSnapCertificateSigner;
  now?: () => admin.firestore.Timestamp;
  enabled?: () => boolean;
  extractClientIp?: (headers: Headers) => string | null;
  admitNetworkRequest?: (clientIp: string) => Promise<ThrottleDecision>;
  env?: Record<string, string | undefined>;
}

export async function verifyOrderSnapIdentityFromToken(
  idToken: string,
  auth: admin.auth.Auth,
  firestore: admin.firestore.Firestore
): Promise<VerifiedOrderSnapIdentity> {
  return verifyOrderSnapIdentityCanonical(idToken, auth, firestore);
}

export type VerifiedOrderSnapIdentityFromToken = VerifiedIdentity;

const MAX_PAYLOAD_BYTES = 64 * 1024;

export function createOrderSnapCheckoutRouteHandler(
  options: OrderSnapCheckoutHandlerOptions = {}
) {
  const isEnabled = options.enabled || (() => isSecureCashierSystemEnabled(options.env));
  const extractIp = options.extractClientIp || extractTrustedClientIp;

  return async function handleOrderSnapCheckout(req: Request): Promise<Response> {
    if (!isEnabled()) {
      return sanitizedErrorResponse(
        new OrderSnapError(OrderSnapErrorCode.SERVICE_UNAVAILABLE, 'Checkout system is not enabled')
      );
    }

    if (req.method !== 'POST') {
      return sanitizedErrorResponse(
        new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Method Not Allowed'),
        { Allow: 'POST' }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return sanitizedErrorResponse(
        new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Content-Type must be application/json')
      );
    }

    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return sanitizedErrorResponse(
        new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Payload size exceeds 64KB limit')
      );
    }

    let admission: ThrottleDecision;
    if (options.admitNetworkRequest) {
      const clientIp = extractIp(req.headers);
      if (!clientIp) {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.SERVICE_UNAVAILABLE, 'Untrusted client IP')
        );
      }
      admission = await options.admitNetworkRequest(clientIp);
    } else {
      admission = await admitStaffAuthRequest(req.headers);
    }

    if (admission.isLimited) {
      return sanitizedErrorResponse(
        new OrderSnapError(
          OrderSnapErrorCode.SERVICE_UNAVAILABLE,
          'Too many checkout attempts. Please wait.'
        ),
        {
          'Retry-After': String(admission.retryAfterSeconds)
        }
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

      // 1. Authoritative Live Identity Verification (enforces active account, sessionVersion, subscription)
      const identity = await verifyOrderSnapIdentityFromToken(idToken, auth, firestore);

      const rawText = await req.text();
      if (rawText.length > MAX_PAYLOAD_BYTES) {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Payload size exceeds 64KB limit')
        );
      }

      const utf8Bytes = new TextEncoder().encode(rawText).length;
      if (utf8Bytes > MAX_PAYLOAD_BYTES) {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Payload size exceeds 64KB limit')
        );
      }

      let rawBody: unknown;
      try {
        rawBody = JSON.parse(rawText);
      } catch {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Malformed JSON body')
        );
      }

      // 2. Strict discriminated union parse - mode must be explicit, no inference, no defaults, no unknown fields
      const parseResult = OrderSnapCheckoutPayloadSchema.safeParse(rawBody);
      if (!parseResult.success) {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Invalid checkout payload.')
        );
      }

      const body = parseResult.data;
      const orderRequest: OrderIngestionRequest = body.request;

      if (orderRequest.tenantId !== identity.tenantId) {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.OPERATION_NOT_PERMITTED, 'Tenant ID mismatch')
        );
      }

      // 3. Mode-specific authority verification
      if (body.mode === 'offline_sync') {
        const nowMs = options.now ? options.now().toMillis() : Date.now();
        const nowSec = Math.floor(nowMs / 1000);

        let grantPayload: any;

        // Check if grant is v2 asymmetric certificate or legacy v1 HMAC grant
        const rawGrant = body.authorityGrant as any;
        const isCertificate = rawGrant && typeof rawGrant === 'object' && rawGrant.payload && rawGrant.payload.version === 2;

        if (isCertificate) {
          const certSigner = options.certificateSigner || new OrderSnapCertificateSigner({ env: options.env });
          const verifyResult = certSigner.verifyCertificate(body.authorityGrant, { nowSeconds: nowSec });
          if (!verifyResult.isValid || !verifyResult.certificate) {
            return sanitizedErrorResponse(
              new OrderSnapError(
                OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
                'Invalid or expired offline authority certificate.'
              )
            );
          }
          grantPayload = verifyResult.certificate.payload;

          // Requirement 7: Authoritative server-side live credential check
          const credDoc = await firestore.collection('webauthn_credentials').doc(grantPayload.credentialIdFingerprint).get();
          if (!credDoc.exists) {
            return sanitizedErrorResponse(
              new OrderSnapError(
                OrderSnapErrorCode.AUTHENTICATION_REQUIRED,
                'Authentication required.'
              )
            );
          }

          const credData = credDoc.data() || {};
          const expectedCanonicalStaffAccountId = identity.staffAccountId || `owner_${identity.uid}`;

          // Verify credential public key fingerprint match
          const spkiCleaned = (credData.publicKeySpki || '')
            .replace(/-----BEGIN [^-]+-----/g, '')
            .replace(/-----END [^-]+-----/g, '')
            .replace(/\s+/g, '');
          const spkiBytes = Buffer.from(spkiCleaned, 'base64');
          const computedSpkiFingerprint = crypto
            .createHash('sha256')
            .update(spkiBytes)
            .digest('hex');

          if (
            credData.status !== 'active' ||
            credData.tenantId !== identity.tenantId ||
            credData.staffAccountId !== expectedCanonicalStaffAccountId ||
            credData.installationId !== grantPayload.deviceId ||
            credData.installationId !== body.deviceId ||
            computedSpkiFingerprint !== grantPayload.credentialPublicKeyFingerprint
          ) {
            return sanitizedErrorResponse(
              new OrderSnapError(
                OrderSnapErrorCode.AUTHENTICATION_REQUIRED,
                'Authentication required.'
              )
            );
          }
        } else {
          // Legacy v1 HMAC verification
          const grantSigner = options.grantSigner || new OrderSnapGrantSigner({ env: options.env });
          const verifyResult = grantSigner.verifyGrant(body.authorityGrant, { nowSeconds: nowSec });
          if (!verifyResult.isValid || !verifyResult.grant) {
            return sanitizedErrorResponse(
              new OrderSnapError(
                OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
                'Invalid or expired offline authority grant.'
              )
            );
          }
          grantPayload = verifyResult.grant.payload;
        }

        // Verify grant against canonical live identity
        if (grantPayload.tenantId !== identity.tenantId) {
          return sanitizedErrorResponse(
            new OrderSnapError(
              OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
              'Operation not permitted.'
            )
          );
        }

        const expectedStaffAccountId = identity.staffAccountId || `owner_${identity.uid}`;
        if (grantPayload.staffAccountId !== expectedStaffAccountId) {
          return sanitizedErrorResponse(
            new OrderSnapError(
              OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
              'Operation not permitted.'
            )
          );
        }

        if (grantPayload.actorId !== identity.actorId) {
          return sanitizedErrorResponse(
            new OrderSnapError(
              OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
              'Operation not permitted.'
            )
          );
        }

        if (grantPayload.role !== identity.role) {
          return sanitizedErrorResponse(
            new OrderSnapError(
              OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
              'Operation not permitted.'
            )
          );
        }

        if (grantPayload.authUid !== identity.uid) {
          return sanitizedErrorResponse(
            new OrderSnapError(
              OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
              'Operation not permitted.'
            )
          );
        }

        // Enforce live session version: never let a historical grant override a revoked/stale session
        if (grantPayload.sessionVersion !== identity.sessionVersion) {
          return sanitizedErrorResponse(
            new OrderSnapError(
              OrderSnapErrorCode.SESSION_REVOKED,
              'Session version revoked or stale.'
            )
          );
        }

        // Verify deviceId from the outbox envelope matches the signed grant exactly
        if (body.deviceId !== grantPayload.deviceId) {
          return sanitizedErrorResponse(
            new OrderSnapError(
              OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
              'Device ID mismatch.'
            )
          );
        }

        // Verify catalogVersion from the outbox envelope matches the signed grant exactly
        if (body.catalogVersion !== grantPayload.catalogVersion) {
          return sanitizedErrorResponse(
            new OrderSnapError(
              OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
              'Catalog version mismatch.'
            )
          );
        }

        // Cross-validate order request against grant
        if (orderRequest.tenantId !== grantPayload.tenantId) {
          return sanitizedErrorResponse(
            new OrderSnapError(
              OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
              'Operation not permitted.'
            )
          );
        }

        if (orderRequest.staffAccountId !== grantPayload.staffAccountId) {
          return sanitizedErrorResponse(
            new OrderSnapError(
              OrderSnapErrorCode.OPERATION_NOT_PERMITTED,
              'Operation not permitted.'
            )
          );
        }

        // Grant module binding: the signed moduleId must EXACTLY match the tenant's current authoritative module.
        const tenantSnap = await firestore.collection('tenants').doc(identity.tenantId).get();
        if (!tenantSnap.exists) {
          return sanitizedErrorResponse(
            new OrderSnapError(OrderSnapErrorCode.OPERATION_NOT_PERMITTED, 'Operation not permitted.')
          );
        }
        const currentModuleId = (tenantSnap.data() || {}).moduleType as string | undefined;
        if (!currentModuleId || grantPayload.moduleId !== currentModuleId) {
          return sanitizedErrorResponse(
            new OrderSnapError(OrderSnapErrorCode.OPERATION_NOT_PERMITTED, 'Operation not permitted.')
          );
        }
      }

      const finalizationOutcome = await finalizeOrderSnapTransaction(
        {
          identity,
          request: orderRequest
        },
        {
          adminFirestore: firestore,
          now: options.now
        }
      );

      if (!finalizationOutcome.success) {
        return sanitizedErrorResponse(
          new OrderSnapError(finalizationOutcome.errorCode, finalizationOutcome.error)
        );
      }

      const nowTimestamp = options.now?.()?.toDate()?.toISOString() || new Date().toISOString();
      return Response.json(
        {
          success: true,
          saleId: finalizationOutcome.saleId,
          snapshotId: finalizationOutcome.snapshotId,
          result: finalizationOutcome.result,
          committedAt: nowTimestamp
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
      return sanitizedErrorResponse(
        new OrderSnapError(OrderSnapErrorCode.SERVICE_UNAVAILABLE, 'Internal server error')
      );
    }
  };
}