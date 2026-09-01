/**
 * Order Snap Client Authority Manager
 *
 * Manages the client-side lifecycle of offline authority:
 * 1. Online establishment: verifies server-issued asymmetric certificate (ECDSA P-256)
 *    and registers the trusted WebAuthn credential metadata in IndexedDB.
 * 2. Reload restoration: restores authority into locked offline state ('offline-locked').
 *    Persisted authority is ALWAYS stored locally locked.
 * 3. Offline unlock: enforces fresh WebAuthn ceremony with cryptographic signature verification
 *    (DER ASN.1 to WebCrypto), strictly increasing counter policy, and transactional counter update.
 *    Transitions to 'offline-unlocked' ONLY in memory.
 */

import {
  OrderSnapAuthorityGrant,
  OrderSnapAuthorityCertificate,
  OrderSnapAuthorityCertificateSchema,
  OrderSnapPersistedAuthority,
  OrderSnapWebAuthnCredential,
  ORDER_SNAP_AUTHORIZED_MODULE_IDS,
  isAuthorityCertificate
} from './offline-types';
import {
  OrderSnapOutboxDB,
  getOrderSnapOutboxDB
} from './order-snap-outbox-db';
import { verifyAuthorityCertificate } from './order-snap-authority-verifier';
import { TrustedPublicKeyEntry } from './order-snap-public-keys';
import { parseWebAuthnDerSignature } from './webauthn-der-parser';

export type AuthorityState =
  | 'uninitialized'
  | 'online-authorized'
  | 'offline-locked'
  | 'offline-unlocked'
  | 'expired'
  | 'catalog-mismatch'
  | 'unauthorized';

export interface SanitizedOrderSnapSession {
  readonly grantId: string;
  readonly moduleId: 'order-snap' | 'timpla-track' | 'bite-snap';
  readonly tenantId: string;
  readonly staffAccountId: string;
  readonly actorId: string;
  readonly authUid: string;
  readonly sessionVersion: number;
  readonly role: 'cashier' | 'owner';
  readonly displayName: string;
  readonly deviceId: string;
  readonly catalogVersion: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly allowedTenders: readonly ['cash'];
  readonly isLocalLocked: boolean;
}

export type AuthorityFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface EstablishAuthorityParams {
  idToken: string;
  tenantId: string;
  deviceId: string;
  catalogVersion: string;
  authorityEndpoint?: string;
  fetchFn?: AuthorityFetchFn;
}

export interface EstablishAuthorityResult {
  success: boolean;
  state: AuthorityState;
  session?: SanitizedOrderSnapSession;
  error?: string;
}

export interface RestoreOfflineAuthoritySafeParams {
  tenantId: string;
  deviceId: string;
  currentCatalogVersion: string;
  authUid: string;
}

export interface RestoreOfflineAuthoritySafeResult {
  success: boolean;
  state: AuthorityState;
  session?: SanitizedOrderSnapSession;
  reason?: string;
}

export interface RestoreAuthorityParams {
  tenantId: string;
  staffAccountId?: string;
  deviceId: string;
  currentCatalogVersion: string;
  nowSeconds?: number;
}

export interface RestoreAuthorityResult {
  success: boolean;
  state: AuthorityState;
  session?: SanitizedOrderSnapSession;
  reason?: string;
}

export interface WebAuthnAssertionResponse {
  id?: string;
  rawId?: ArrayBuffer | Uint8Array | string;
  response: {
    clientDataJSON: ArrayBuffer | Uint8Array | string;
    authenticatorData: ArrayBuffer | Uint8Array | string;
    signature: ArrayBuffer | Uint8Array | string;
  };
}

export type WebAuthnCeremonyProvider = (params: {
  challenge: Uint8Array;
  credentialId: string;
  rpId: string;
  requireUserVerification: boolean;
}) => Promise<WebAuthnAssertionResponse>;

export interface WebAuthnUnlockOptions {
  ceremonyProvider?: WebAuthnCeremonyProvider;
  nowSeconds?: number;
}

export interface OrderSnapAuthorityManagerOptions {
  trustedRegistry?: Record<string, TrustedPublicKeyEntry>;
  randomBytesFn?: (length: number) => Uint8Array;
}

// ---------------------------------------------------------------------------
// Binary and Encoding Utilities
// ---------------------------------------------------------------------------

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(padded, 'base64');
    return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(cleaned, 'base64');
    return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof Buffer !== 'undefined'
    ? Buffer.from(bytes).toString('base64')
    : btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toUint8Array(data: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (data instanceof Uint8Array) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data.slice(0));
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  if (typeof data === 'string') {
    try {
      return base64UrlToUint8Array(data);
    } catch {
      return new TextEncoder().encode(data);
    }
  }
  throw new Error('invalid_binary_input_data');
}

async function sha256Digest(data: Uint8Array): Promise<Uint8Array> {
  const subtle = typeof window !== 'undefined' && window.crypto?.subtle
    ? window.crypto.subtle
    : typeof globalThis !== 'undefined' && globalThis.crypto?.subtle
      ? globalThis.crypto.subtle
      : null;

  if (!subtle) {
    throw new Error('web_crypto_unavailable');
  }

  const digest = await subtle.digest('SHA-256', data as unknown as BufferSource);
  return new Uint8Array(digest);
}

export class OrderSnapAuthorityManager {
  private outboxDB: OrderSnapOutboxDB;
  private state: AuthorityState = 'uninitialized';
  private currentSession: SanitizedOrderSnapSession | null = null;
  private currentGrant: OrderSnapAuthorityGrant | null = null;
  private trustedRegistry?: Record<string, TrustedPublicKeyEntry>;
  private randomBytesFn: (length: number) => Uint8Array;

  constructor(outboxDB?: OrderSnapOutboxDB, options?: OrderSnapAuthorityManagerOptions) {
    this.outboxDB = outboxDB || getOrderSnapOutboxDB();
    this.trustedRegistry = options?.trustedRegistry;
    this.randomBytesFn = options?.randomBytesFn || ((len) => {
      const bytes = new Uint8Array(len);
      if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(bytes);
      } else if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
      } else {
        throw new Error('web_crypto_unavailable');
      }
      return bytes;
    });
  }

  public getState(): AuthorityState {
    return this.state;
  }

  public getSession(): SanitizedOrderSnapSession | null {
    return this.currentSession;
  }

  public getActiveGrant(): OrderSnapAuthorityGrant | null {
    return this.currentGrant;
  }

  public isAuthorizedForOfflineCheckout(currentCatalogVersion?: string): boolean {
    if (!this.currentSession) return false;
    if (this.state !== 'online-authorized' && this.state !== 'offline-unlocked') return false;

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= this.currentSession.expiresAt) return false;

    if (
      currentCatalogVersion &&
      this.currentSession.catalogVersion !== currentCatalogVersion
    ) {
      return false;
    }

    return true;
  }

  /**
   * Establishes online authority with a server-issued asymmetric certificate.
   * Fails closed if the server response contains a legacy v1 grant or an invalid certificate.
   */
  public async establishOnlineAuthority(
    params: EstablishAuthorityParams
  ): Promise<EstablishAuthorityResult> {
    const {
      idToken,
      tenantId,
      deviceId,
      catalogVersion,
      authorityEndpoint = '/api/order-snap/authority',
      fetchFn = fetch
    } = params;

    if (!idToken || !tenantId || !deviceId || !catalogVersion) {
      this.state = 'unauthorized';
      return {
        success: false,
        state: 'unauthorized',
        error: 'unauthorized'
      };
    }

    try {
      const response = await fetchFn(authorityEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceId,
          catalogVersion
        })
      });

      if (!response.ok) {
        if (response.status === 400) {
          let errJson: any;
          try { errJson = await response.json(); } catch {}
          if (errJson?.error && typeof errJson.error === 'string' && errJson.error.includes('Catalog version mismatch')) {
            this.state = 'catalog-mismatch';
            return { success: false, state: 'catalog-mismatch', error: 'catalog_mismatch' };
          }
        }
        this.state = 'unauthorized';
        return {
          success: false,
          state: 'unauthorized',
          error: 'unauthorized'
        };
      }

      const body = await response.json();
      if (!body || !body.success || !body.grant || !body.webAuthnCredential) {
        this.state = 'unauthorized';
        return {
          success: false,
          state: 'unauthorized',
          error: 'unauthorized'
        };
      }

      // Mandatory Policy 4: Reject server response containing a v1 HMAC grant.
      // New authority establishment requires v2 asymmetric certificates.
      if (!isAuthorityCertificate(body.grant) || body.grant.payload?.version !== 2) {
        this.state = 'unauthorized';
        return {
          success: false,
          state: 'unauthorized',
          error: 'unauthorized'
        };
      }

      const validatedGrant = OrderSnapAuthorityCertificateSchema.parse(body.grant);
      const payload = validatedGrant.payload;

      // Cryptographically verify server-issued asymmetric certificate
      const verifyRes = await verifyAuthorityCertificate(validatedGrant, {
        trustedRegistry: this.trustedRegistry
      });

      if (!verifyRes.isValid) {
        this.state = 'unauthorized';
        return {
          success: false,
          state: 'unauthorized',
          error: 'unauthorized'
        };
      }

      // Scope checks
      if (payload.tenantId !== tenantId) {
        this.state = 'unauthorized';
        return { success: false, state: 'unauthorized', error: 'tenant_mismatch' };
      }
      if (payload.deviceId !== deviceId) {
        this.state = 'unauthorized';
        return { success: false, state: 'unauthorized', error: 'device_mismatch' };
      }
      if (payload.catalogVersion !== catalogVersion) {
        this.state = 'catalog-mismatch';
        return { success: false, state: 'catalog-mismatch', error: 'catalog_mismatch' };
      }
      if (!ORDER_SNAP_AUTHORIZED_MODULE_IDS.includes(payload.moduleId as any)) {
        this.state = 'unauthorized';
        return { success: false, state: 'unauthorized', error: 'unauthorized' };
      }

      // WebAuthn Credential validation
      const webAuthnCredential = body.webAuthnCredential as OrderSnapWebAuthnCredential;
      if (
        !webAuthnCredential ||
        !webAuthnCredential.credentialId ||
        !webAuthnCredential.publicKeySpki
      ) {
        this.state = 'unauthorized';
        return {
          success: false,
          state: 'unauthorized',
          error: 'unauthorized'
        };
      }

      // Cross-check credential fingerprints against signed certificate
      const credIdBytes = base64UrlToUint8Array(webAuthnCredential.credentialId);
      const computedCredIdFingerprint = uint8ArrayToHex(await sha256Digest(credIdBytes));

      const spkiBytes = base64ToUint8Array(webAuthnCredential.publicKeySpki);
      const computedSpkiFingerprint = uint8ArrayToHex(await sha256Digest(spkiBytes));

      if (
        computedCredIdFingerprint !== payload.credentialIdFingerprint ||
        computedSpkiFingerprint !== payload.credentialPublicKeyFingerprint
      ) {
        this.state = 'unauthorized';
        return {
          success: false,
          state: 'unauthorized',
          error: 'unauthorized'
        };
      }

      // Persist into IndexedDB (persisted record is ALWAYS isLocalLocked: true)
      const persistedRecord: OrderSnapPersistedAuthority = {
        tenantId: payload.tenantId,
        staffAccountId: payload.staffAccountId,
        deviceId: payload.deviceId,
        grant: validatedGrant,
        catalogVersion: payload.catalogVersion,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt,
        isLocalLocked: true, // In DB, always stored locked
        updatedAt: Date.now(),
        webAuthnCredential: {
          ...webAuthnCredential,
          rpId: webAuthnCredential.rpId || payload.rpId
        }
      };

      await this.outboxDB.saveAuthority(persistedRecord);

      const sanitizedSession: SanitizedOrderSnapSession = {
        grantId: payload.grantId,
        moduleId: payload.moduleId,
        tenantId: payload.tenantId,
        staffAccountId: payload.staffAccountId,
        actorId: payload.actorId,
        authUid: payload.authUid,
        sessionVersion: payload.sessionVersion,
        role: payload.role,
        displayName: payload.displayName,
        deviceId: payload.deviceId,
        catalogVersion: payload.catalogVersion,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt,
        allowedTenders: ['cash'],
        isLocalLocked: false // Live in-memory session is active
      };

      this.currentGrant = validatedGrant;
      this.currentSession = sanitizedSession;
      this.state = 'online-authorized';

      return {
        success: true,
        state: 'online-authorized',
        session: sanitizedSession
      };
    } catch (err) {
      console.error('[ESTABLISH_ERR]', err);
      this.state = 'unauthorized';
      return {
        success: false,
        state: 'unauthorized',
        error: 'unauthorized'
      };
    }
  }

  /**
   * Safely restores offline authority after a page reload.
   * Fail-closed on ambiguity: zero valid candidates returns locked, multiple fail closed.
   * authUid is required and must match the verified certificate payload.
   */
  public async restoreOfflineAuthoritySafe(
    params: RestoreOfflineAuthoritySafeParams
  ): Promise<RestoreOfflineAuthoritySafeResult> {
    const {
      tenantId,
      deviceId,
      currentCatalogVersion,
      authUid,
    } = params;

    if (!authUid) {
      this.clearAuthority();
      return { success: false, state: 'unauthorized', reason: 'auth_uid_required' };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);

    try {
      // Query all persisted authority candidates for this tenant and device
      const candidates = await this.getAllAuthorityCandidates(tenantId, deviceId);

      // Verify each candidate's asymmetric certificate before trusting any payload identity
      const verifiedCandidates: OrderSnapPersistedAuthority[] = [];

      for (const candidate of candidates) {
        if (!isAuthorityCertificate(candidate.grant)) {
          // Legacy v1 HMAC grants cannot be verified with the safe method
          continue;
        }

        // Verify v2 certificate
        const verifyRes = await verifyAuthorityCertificate(candidate.grant, {
          nowSeconds,
          trustedRegistry: this.trustedRegistry
        });

        if (!verifyRes.isValid) {
          continue; // Skip invalid certificates
        }

        // Verify certificate expiry
        if (nowSeconds >= candidate.expiresAt) {
          continue; // Skip expired
        }

        const payload = candidate.grant.payload;

        // Verify against requested tenantId, deviceId, catalogVersion
        if (payload.tenantId !== tenantId) continue;
        if (payload.deviceId !== deviceId) continue;
        if (payload.catalogVersion !== currentCatalogVersion) continue;

        // Verify authUid binding from verified certificate payload
        if (payload.authUid !== authUid) {
          continue; // Skip mismatched UID binding
        }

        // Candidate passed all verification checks
        verifiedCandidates.push(candidate);
      }

      // Strict policy:
      // - Zero valid candidates: return locked/unavailable
      if (verifiedCandidates.length === 0) {
        this.clearAuthority();
        return { success: false, state: 'unauthorized', reason: 'no_valid_authority_candidate' };
      }

      // - Multiple valid candidates: fail closed (ambiguous)
      if (verifiedCandidates.length > 1) {
        this.clearAuthority();
        return { success: false, state: 'unauthorized', reason: 'ambiguous_authority_candidates' };
      }

      // Exactly one valid candidate
      const validCandidate = verifiedCandidates[0];
      const grant = validCandidate.grant;

      if (isAuthorityCertificate(grant)) {
        const payload = grant.payload;

        const sanitizedSession: SanitizedOrderSnapSession = {
          grantId: payload.grantId,
          moduleId: payload.moduleId,
          tenantId: payload.tenantId,
          staffAccountId: payload.staffAccountId,
          actorId: payload.actorId,
          authUid: payload.authUid,
          sessionVersion: payload.sessionVersion,
          role: payload.role,
          displayName: payload.displayName,
          deviceId: payload.deviceId,
          catalogVersion: payload.catalogVersion,
          issuedAt: payload.issuedAt,
          expiresAt: payload.expiresAt,
          allowedTenders: ['cash'],
          isLocalLocked: true
        };

        this.currentGrant = grant;
        this.currentSession = sanitizedSession;
        this.state = 'offline-locked';

        return {
          success: true,
          state: 'offline-locked',
          session: sanitizedSession
        };
      } else {
        // This should never happen since we filtered out non-certificates earlier
        this.clearAuthority();
        return { success: false, state: 'unauthorized', reason: 'invalid_grant_type' };
      }
    } catch (err) {
      console.error('[RESTORE_SAFE_ERR]');
      this.clearAuthority();
      return { success: false, state: 'unauthorized', reason: 'unauthorized' };
    }
  }

  /**
   * Gets all persisted authority candidates for a tenant and device (for safe restoration).
   */
  public async getAllAuthorityCandidates(
    tenantId: string,
    deviceId: string
  ): Promise<readonly OrderSnapPersistedAuthority[]> {
    return this.outboxDB.getAuthorityCandidatesForTenantDevice(tenantId, deviceId);
  }

  /**
   * Strict offline authority restoration using staffAccountId.
   * This is the existing API for callers that have the staffAccountId.
   */
  public async restoreOfflineAuthority(
    params: RestoreAuthorityParams
  ): Promise<RestoreAuthorityResult> {
    const {
      tenantId,
      staffAccountId,
      deviceId,
      currentCatalogVersion,
      nowSeconds = Math.floor(Date.now() / 1000)
    } = params;

    try {
      if (staffAccountId) {
        const persisted = await this.outboxDB.getAuthority(tenantId, staffAccountId, deviceId);
        if (!persisted) {
          this.clearAuthority();
          return { success: false, state: 'unauthorized', reason: 'unauthorized' };
        }

        if (nowSeconds >= persisted.expiresAt) {
          this.state = 'expired';
          return { success: false, state: 'expired', reason: 'authority_expired' };
        }

        if (persisted.catalogVersion !== currentCatalogVersion) {
          this.state = 'catalog-mismatch';
          return { success: false, state: 'catalog-mismatch', reason: 'catalog_mismatch' };
        }

        const grant = persisted.grant;

        if (isAuthorityCertificate(grant)) {
          const verifyRes = await verifyAuthorityCertificate(grant, {
            nowSeconds,
            trustedRegistry: this.trustedRegistry
          });

          if (!verifyRes.isValid) {
            this.clearAuthority();
            return { success: false, state: 'unauthorized', reason: 'unauthorized' };
          }

          const payload = grant.payload;

          const sanitizedSession: SanitizedOrderSnapSession = {
            grantId: payload.grantId,
            moduleId: payload.moduleId,
            tenantId: payload.tenantId,
            staffAccountId: payload.staffAccountId,
            actorId: payload.actorId,
            authUid: payload.authUid,
            sessionVersion: payload.sessionVersion,
            role: payload.role,
            displayName: payload.displayName,
            deviceId: payload.deviceId,
            catalogVersion: payload.catalogVersion,
            issuedAt: payload.issuedAt,
            expiresAt: payload.expiresAt,
            allowedTenders: ['cash'],
            isLocalLocked: true
          };

          this.currentGrant = grant;
          this.currentSession = sanitizedSession;
          this.state = 'offline-locked';

          return {
            success: true,
            state: 'offline-locked',
            session: sanitizedSession
          };
        } else {
          const v1Grant = grant as any;
          const v1Payload = v1Grant.payload ? v1Grant.payload : v1Grant;

          const sanitizedSession: SanitizedOrderSnapSession = {
            grantId: v1Payload.grantId,
            moduleId: v1Payload.moduleId,
            tenantId: v1Payload.tenantId,
            staffAccountId: v1Payload.staffAccountId,
            actorId: v1Payload.actorId,
            authUid: v1Payload.authUid,
            sessionVersion: v1Payload.sessionVersion,
            role: v1Payload.role,
            displayName: v1Payload.displayName,
            deviceId: v1Payload.deviceId,
            catalogVersion: v1Payload.catalogVersion,
            issuedAt: v1Payload.issuedAt,
            expiresAt: v1Payload.expiresAt,
            allowedTenders: ['cash'],
            isLocalLocked: true
          };

          this.currentGrant = v1Grant;
          this.currentSession = sanitizedSession;
          this.state = 'offline-locked';

          return {
            success: true,
            state: 'offline-locked',
            session: sanitizedSession
          };
        }
      } else {
        const candidates = await this.getAllAuthorityCandidates(tenantId, deviceId);
        const validCandidates = candidates.filter(c => c.catalogVersion === currentCatalogVersion);

        if (validCandidates.length !== 1) {
          this.clearAuthority();
          return { success: false, state: 'unauthorized', reason: 'unauthorized' };
        }

        const persisted = validCandidates[0];

        if (nowSeconds >= persisted.expiresAt) {
          this.state = 'expired';
          return { success: false, state: 'expired', reason: 'authority_expired' };
        }

        const grant = persisted.grant;

        if (isAuthorityCertificate(grant)) {
          const verifyRes = await verifyAuthorityCertificate(grant, {
            nowSeconds,
            trustedRegistry: this.trustedRegistry
          });

          if (!verifyRes.isValid) {
            this.clearAuthority();
            return { success: false, state: 'unauthorized', reason: 'unauthorized' };
          }

          const payload = grant.payload;

          const sanitizedSession: SanitizedOrderSnapSession = {
            grantId: payload.grantId,
            moduleId: payload.moduleId,
            tenantId: payload.tenantId,
            staffAccountId: payload.staffAccountId,
            actorId: payload.actorId,
            authUid: payload.authUid,
            sessionVersion: payload.sessionVersion,
            role: payload.role,
            displayName: payload.displayName,
            deviceId: payload.deviceId,
            catalogVersion: payload.catalogVersion,
            issuedAt: payload.issuedAt,
            expiresAt: payload.expiresAt,
            allowedTenders: ['cash'],
            isLocalLocked: true
          };

          this.currentGrant = grant;
          this.currentSession = sanitizedSession;
          this.state = 'offline-locked';

          return {
            success: true,
            state: 'offline-locked',
            session: sanitizedSession
          };
        } else {
          const v1Grant = grant as any;
          const v1Payload = v1Grant.payload ? v1Grant.payload : v1Grant;

          const sanitizedSession: SanitizedOrderSnapSession = {
            grantId: v1Payload.grantId,
            moduleId: v1Payload.moduleId,
            tenantId: v1Payload.tenantId,
            staffAccountId: v1Payload.staffAccountId,
            actorId: v1Payload.actorId,
            authUid: v1Payload.authUid,
            sessionVersion: v1Payload.sessionVersion,
            role: v1Payload.role,
            displayName: v1Payload.displayName,
            deviceId: v1Payload.deviceId,
            catalogVersion: v1Payload.catalogVersion,
            issuedAt: v1Payload.issuedAt,
            expiresAt: v1Payload.expiresAt,
            allowedTenders: ['cash'],
            isLocalLocked: true
          };

          this.currentGrant = v1Grant;
          this.currentSession = sanitizedSession;
          this.state = 'offline-locked';

          return {
            success: true,
            state: 'offline-locked',
            session: sanitizedSession
          };
        }
      }
    } catch (err) {
      console.error('[RESTORE_ERR]');
      this.clearAuthority();
      return { success: false, state: 'unauthorized', reason: 'unauthorized' };
    }
  }

  /**
   * Unlocks offline authority using fresh WebAuthn user presence & cryptographic verification.
   *
   * Enforces:
   * 1. Fresh 32-byte cryptographic challenge generated internally per attempt.
   * 2. Origin strictly taken from the signed certificate payload.
   * 3. ASN.1 DER ECDSA assertion signature parsed and validated.
   * 4. Sign counter policy (0 allowed for unsupported hardware; positive counters strictly increasing).
   * 5. Cryptographic signature verification over authenticatorData || SHA-256(clientDataJSON).
   * 6. Transactional compare-and-update counter in IndexedDB.
   * 7. Transitions state to 'offline-unlocked' ONLY in memory.
   */
  public async attemptWebAuthnUnlock(
    options: WebAuthnUnlockOptions = {}
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.currentSession || !this.currentGrant) {
      return { success: false, error: 'unauthorized' };
    }

    if (this.state !== 'offline-locked') {
      return { success: false, error: 'invalid_authority_state' };
    }

    // Legacy v1 HMAC grants cannot unlock with WebAuthn
    const grant = this.currentGrant as any;
    if (!isAuthorityCertificate(grant) || grant.payload.version !== 2) {
      return { success: false, error: 'legacy_grant_cannot_unlock' };
    }

    const certificate = grant as OrderSnapAuthorityCertificate;
    const certPayload = certificate.payload;

    // Load persisted authority and WebAuthn credential record
    const persisted = await this.outboxDB.getAuthority(
      this.currentSession.tenantId,
      this.currentSession.staffAccountId,
      this.currentSession.deviceId
    );

    if (!persisted || !persisted.webAuthnCredential) {
      return { success: false, error: 'unauthorized' };
    }

    const webAuthnCred = persisted.webAuthnCredential;

    // Verify credential ID fingerprint match
    const credIdBytes = base64UrlToUint8Array(webAuthnCred.credentialId);
    const credIdDigest = await sha256Digest(credIdBytes);
    if (uint8ArrayToHex(credIdDigest) !== certPayload.credentialIdFingerprint) {
      return { success: false, error: 'unauthorized' };
    }

    // Verify public key fingerprint match
    const spkiBytes = base64ToUint8Array(webAuthnCred.publicKeySpki);
    const spkiDigest = await sha256Digest(spkiBytes);
    if (uint8ArrayToHex(spkiDigest) !== certPayload.credentialPublicKeyFingerprint) {
      return { success: false, error: 'unauthorized' };
    }

    // Requirement 2: Generate a fresh 32-byte secure challenge internally for every unlock attempt
    const challengeBytes = this.randomBytesFn(32);

    // Requirement 2: Strict origin from signed certificate
    const expectedOrigin = certPayload.expectedOrigin;

    // Execute WebAuthn assertion ceremony
    let assertion: WebAuthnAssertionResponse;
    if (options.ceremonyProvider) {
      try {
        assertion = await options.ceremonyProvider({
          challenge: challengeBytes,
          credentialId: webAuthnCred.credentialId,
          rpId: certPayload.rpId,
          requireUserVerification: certPayload.requireUserVerification
        });
      } catch {
        return { success: false, error: 'ceremony_failed' };
      }
    } else {
      // Browser native ceremony provider
      if (typeof navigator === 'undefined' || !navigator.credentials?.get) {
        return { success: false, error: 'webauthn_unsupported' };
      }

      try {
        const rawAssertion: any = await navigator.credentials.get({
          publicKey: {
            challenge: challengeBytes as unknown as BufferSource,
            rpId: certPayload.rpId,
            allowCredentials: [
              {
                id: credIdBytes as unknown as BufferSource,
                type: 'public-key'
              }
            ],
            userVerification: certPayload.requireUserVerification ? 'required' : 'preferred',
            timeout: 60000
          }
        });

        if (!rawAssertion || !rawAssertion.response) {
          return { success: false, error: 'ceremony_cancelled' };
        }

        assertion = {
          id: rawAssertion.id,
          rawId: rawAssertion.rawId,
          response: {
            clientDataJSON: rawAssertion.response.clientDataJSON,
            authenticatorData: rawAssertion.response.authenticatorData,
            signature: rawAssertion.response.signature
          }
        };
      } catch {
        return { success: false, error: 'ceremony_failed' };
      }
    }

    if (!assertion || !assertion.response) {
      return { success: false, error: 'ceremony_failed' };
    }

    // -------------------------------------------------------------------------
    // Cryptographic Assertion Verification
    // -------------------------------------------------------------------------
    try {
      const clientDataBytes = toUint8Array(assertion.response.clientDataJSON);
      const authDataBytes = toUint8Array(assertion.response.authenticatorData);
      const rawSignatureBytes = toUint8Array(assertion.response.signature);

      // 1. Verify clientDataJSON
      const clientDataStr = new TextDecoder('utf-8').decode(clientDataBytes);
      let clientData: any;
      try {
        clientData = JSON.parse(clientDataStr);
      } catch {
        return { success: false, error: 'assertion_verification_failed' };
      }

      if (clientData.type !== 'webauthn.get') {
        return { success: false, error: 'assertion_verification_failed' };
      }

      const expectedChallengeBase64Url = uint8ArrayToBase64Url(challengeBytes);
      if (clientData.challenge !== expectedChallengeBase64Url) {
        return { success: false, error: 'assertion_verification_failed' };
      }

      if (clientData.origin !== expectedOrigin) {
        return { success: false, error: 'assertion_verification_failed' };
      }

      // 2. Parse & Verify authenticatorData
      if (authDataBytes.length < 37) {
        return { success: false, error: 'assertion_verification_failed' };
      }

      // RP ID SHA-256 Hash check (bytes 0..31)
      const rpIdBytes = new TextEncoder().encode(certPayload.rpId);
      const expectedRpIdDigest = await sha256Digest(rpIdBytes);
      const returnedRpIdDigest = authDataBytes.subarray(0, 32);

      for (let i = 0; i < 32; i++) {
        if (returnedRpIdDigest[i] !== expectedRpIdDigest[i]) {
          return { success: false, error: 'assertion_verification_failed' };
        }
      }

      // Flags check (byte 32)
      const flags = authDataBytes[32];
      const userPresent = (flags & 0x01) !== 0; // Bit 0: UP
      const userVerified = (flags & 0x04) !== 0; // Bit 2: UV

      if (!userPresent && certPayload.requireUserPresence) {
        return { success: false, error: 'assertion_verification_failed' };
      }

      if (!userVerified && certPayload.requireUserVerification) {
        return { success: false, error: 'assertion_verification_failed' };
      }

      // Requirement 6: Unsigned 32-bit big-endian sign-counter parsing (DataView.getUint32)
      const authDataView = new DataView(
        authDataBytes.buffer,
        authDataBytes.byteOffset,
        authDataBytes.byteLength
      );
      const returnedCounter = authDataView.getUint32(33, false); // Big-Endian unsigned 32-bit

      // Requirement 3: Strict ASN.1 DER signature parsing
      const parsedSig = parseWebAuthnDerSignature(rawSignatureBytes);
      const p1363Sig = parsedSig.p1363;

      // Signature verification: authenticatorData || SHA-256(clientDataJSON)
      const clientDataHash = await sha256Digest(clientDataBytes);
      const signedBytes = new Uint8Array(authDataBytes.length + clientDataHash.length);
      signedBytes.set(authDataBytes, 0);
      signedBytes.set(clientDataHash, authDataBytes.length);

      const subtle = typeof window !== 'undefined' && window.crypto?.subtle
        ? window.crypto.subtle
        : typeof globalThis !== 'undefined' && globalThis.crypto?.subtle
          ? globalThis.crypto.subtle
          : null;

      if (!subtle) {
        return { success: false, error: 'assertion_verification_failed' };
      }

      const cryptoKey = await subtle.importKey(
        'spki',
        spkiBytes as unknown as BufferSource,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );

      const isSigValid = await subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        cryptoKey,
        p1363Sig as unknown as BufferSource,
        signedBytes as unknown as BufferSource
      );

      if (!isSigValid) {
        return { success: false, error: 'assertion_verification_failed' };
      }

      // Requirement 6: Transactional compare-and-update counter in IndexedDB
      const counterUpdateRes = await this.outboxDB.updateAuthorityCounterAtomic(
        this.currentSession.tenantId,
        this.currentSession.staffAccountId,
        this.currentSession.deviceId,
        returnedCounter
      );

      if (!counterUpdateRes.success) {
        return { success: false, error: 'counter_replay_detected' };
      }

      // Unlock ONLY in memory
      this.state = 'offline-unlocked';
      this.currentSession = {
        ...this.currentSession,
        isLocalLocked: false
      };

      return { success: true };
    } catch (err) {
      console.error('[UNLOCK_ERR]', err);
      return { success: false, error: 'assertion_verification_failed' };
    }
  }

  public lock(): void {
    if (this.currentSession) {
      this.state = 'offline-locked';
      this.currentSession = {
        ...this.currentSession,
        isLocalLocked: true
      };
    }
  }

  public clearAuthority(): void {
    this.state = 'uninitialized';
    this.currentSession = null;
    this.currentGrant = null;
  }
}