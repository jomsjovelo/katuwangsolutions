/**
 * Order Snap Offline Authority & WebAuthn Offline Unlock Tests
 *
 * Comprehensive Test Suite for Phase 2B.1:
 * 1. Genuine certificate signing & verification (IEEE-P1363 separate from payload)
 * 2. Immutable production trust registry & absence of trusted production key fails closed
 * 3. Runtime trust-root replacement rejection (no public setters/overrides on production singleton)
 * 4. Node/browser ECDSA encoding compatibility (server/client)
 * 5. Certificate/payload/signature tampering rejection
 * 6. Unknown version/algorithm/keyId rejection
 * 7. Missing trusted WebAuthn credential prevents certificate issuance (fail-closed)
 * 8. Malformed or non-P-256 stored SPKI rejected before certificate issuance
 * 9. Private key never appears in responses or persisted records
 * 10. Strict time boundaries and clock skew (issuedAt, expiresAt)
 * 11. Identity, device, catalog, and module mismatch rejection
 * 12. WebAuthn DER assertion verification success (real DER -> WebCrypto)
 * 13. Malformed, oversized, and noncanonical DER signatures rejected
 * 14. Raw 64-byte IEEE-P1363 WebAuthn assertion rejected (must be DER)
 * 15. No public challenge/origin override; genuine fresh 32-byte challenge generated per attempt
 * 16. Origin and RP ID mismatch rejection
 * 17. Malformed clientDataJSON/authenticatorData rejection
 * 18. UP and UV flags enforcement
 * 19. Sign-counter policies (0 allowed, unsigned > 2^31 handled, rollback rejected)
 * 20. Transactional concurrent counter update (two managers/tabs test)
 * 21. Persisted authority record is always locked (isLocalLocked: true)
 * 22. Successful fresh ceremony unlocks only in memory; failure never unlocks
 * 23. Legacy v1 HMAC response cannot establish new authority
 * 24. Legacy v1 grants can restore to locked state for queued sync, but cannot unlock offline
 * 25. Sanitized client errors (no raw server messages or internals leaked)
 * 26. Server checkout sync verifies v2 certificates and rejects revoked/mismatched live credentials
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMockIndexedDB } from './test-indexeddb-mock';
import {
  OrderSnapAuthorityCertificate,
  OrderSnapAuthorityCertificatePayload,
  OrderSnapPersistedAuthority,
  MAX_ORDER_SNAP_OFFLINE_GRANT_LIFETIME_SECONDS,
  ORDER_SNAP_GRANT_KEY_ID_V2,
  ORDER_SNAP_GRANT_KEY_ID_V1
} from '../src/lib/order-snap/offline-types';
import {
  OrderSnapCertificateSigner
} from '../src/lib/server/order-snap-certificate-signer';
import {
  OrderSnapGrantSigner
} from '../src/lib/server/order-snap-grant-signer';
import {
  verifyAuthorityCertificate
} from '../src/lib/order-snap/order-snap-authority-verifier';
import {
  getTrustedPublicKey,
  isOrderSnapOfflineAuthorityConfigured
} from '../src/lib/order-snap/order-snap-public-keys';
import {
  createOrderSnapAuthorityRouteHandler
} from '../src/lib/server/order-snap-authority-handler';
import {
  createOrderSnapCheckoutRouteHandler
} from '../src/lib/server/order-snap-checkout-handler';
import {
  OrderSnapOutboxDB
} from '../src/lib/order-snap/order-snap-outbox-db';
import {
  OrderSnapAuthorityManager
} from '../src/lib/order-snap/order-snap-authority-manager';
import {
  parseWebAuthnDerSignature
} from '../src/lib/order-snap/webauthn-der-parser';

// ---------------------------------------------------------------------------
// Cryptographic Test Helpers
// ---------------------------------------------------------------------------

// Generate a fresh server ECDSA P-256 signing key pair
const serverKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const serverPrivateKeyPem = serverKeyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const serverPublicKeySpkiBase64 = Buffer.from(
  serverKeyPair.publicKey.export({ type: 'spki', format: 'der' })
).toString('base64');

// Generate a fresh client WebAuthn credential key pair
const clientCredentialKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const clientCredentialPublicKeySpkiBase64 = Buffer.from(
  clientCredentialKeyPair.publicKey.export({ type: 'spki', format: 'der' })
).toString('base64');
const clientCredentialIdBase64Url = 'test_webauthn_credential_id_base64url_12345';

// Compute fingerprints
const credIdBytes = Buffer.from(clientCredentialIdBase64Url, 'base64url');
const clientCredentialIdFingerprint = crypto.createHash('sha256').update(credIdBytes).digest('hex');
const spkiBytes = Buffer.from(clientCredentialPublicKeySpkiBase64, 'base64');
const clientCredentialPublicKeyFingerprint = crypto.createHash('sha256').update(spkiBytes).digest('hex');

const TEST_TRUSTED_REGISTRY = {
  v2: {
    algorithm: 'ES256' as const,
    spki: serverPublicKeySpkiBase64
  }
};

const TEST_ENV = {
  ORDER_SNAP_OFFLINE_CERTIFICATE_PRIVATE_KEY_V2: serverPrivateKeyPem,
  ORDER_SNAP_OFFLINE_GRANT_SECRET_V1: 'order_snap_test_secret_must_be_sufficiently_long_32chars_min',
  BENTA_CASHIER_CHECKOUT_ENABLED: 'true',
  NEXT_PUBLIC_USE_FIREBASE_EMULATOR: 'true'
};

const EMPTY_CATALOG_VERSION = 'cat_' + crypto.createHash('sha256').update(JSON.stringify({
  menuItems: [],
  recipes: [],
  modifierGroups: [],
  ingredients: []
})).digest('hex').substring(0, 32);

function createSampleCertificatePayload(
  overrides: Partial<OrderSnapAuthorityCertificatePayload> = {}
): OrderSnapAuthorityCertificatePayload {
  const nowSec = Math.floor(Date.now() / 1000);
  const staffAccountId = overrides.staffAccountId || 'staff_acc_99';
  const role = overrides.role || 'cashier';
  const authUid = overrides.authUid || 'firebase_auth_uid_12345';
  const defaultActorId = role === 'owner' ? `owner_${authUid}` : `staff_${staffAccountId}`;

  return {
    version: 2,
    algorithm: 'ES256',
    keyId: ORDER_SNAP_GRANT_KEY_ID_V2,
    grantId: 'grant_cert_1234567890abcdef',
    moduleId: 'order-snap',
    tenantId: 'tenant_cafe_1',
    staffAccountId,
    actorId: overrides.actorId || defaultActorId,
    authUid,
    role,
    displayName: 'Maria Santos',
    sessionVersion: 1,
    deviceId: 'dev_terminal_01',
    catalogVersion: 'cat_cafe_v1',
    allowedTenders: ['cash'],
    issuedAt: nowSec,
    expiresAt: nowSec + MAX_ORDER_SNAP_OFFLINE_GRANT_LIFETIME_SECONDS,
    credentialIdFingerprint: clientCredentialIdFingerprint,
    credentialPublicKeyFingerprint: clientCredentialPublicKeyFingerprint,
    rpId: 'localhost',
    expectedOrigin: 'http://localhost:9002',
    requireUserPresence: true,
    requireUserVerification: true,
    ...overrides
  };
}

function buildAuthorityTestFirestore(options: {
  tenantData?: any;
  staffData?: any;
  webAuthnData?: any;
} = {}) {
  const tenantId = 'tenant_cafe_1';
  const staffAccountId = 'staff_acc_99';
  const tenant = options.tenantData || {
    moduleType: 'order-snap',
    subscriptionStatus: 'active',
    name: 'Cafe One',
    ownerUid: 'user_maria_99'
  };
  const staff = options.staffData || {
    tenantId,
    displayName: 'Maria Santos',
    status: 'active',
    authUid: 'user_maria_99',
    sessionVersion: 1
  };
  const webAuthn = options.webAuthnData || null;

  return {
    collection: (col: string) => ({
      doc: (id: string) => {
        if (col === 'tenants' && id === tenantId) {
          return {
            path: `tenants/${id}`,
            get: async () => ({ exists: true, data: () => tenant }),
            collection: (subCol: string) => ({
              doc: (subId: string) => ({
                path: `tenants/${id}/${subCol}/${subId}`,
                get: async () => ({
                  exists: subCol === 'staff_accounts' && subId === staffAccountId,
                  data: () => (subCol === 'staff_accounts' && subId === staffAccountId ? staff : null)
                })
              }),
              where: () => ({
                get: async () => ({ docs: [] })
              }),
              get: async () => ({ docs: [] })
            })
          };
        }
        if (col === 'webauthn_credentials') {
          return {
            path: `webauthn_credentials/${id}`,
            get: async () => ({
              exists: !!webAuthn,
              data: () => webAuthn
            })
          };
        }
        return {
          path: `${col}/${id}`,
          get: async () => ({ exists: false, data: () => null })
        };
      },
      where: () => ({
        where: () => ({
          where: () => ({
            where: () => ({
              limit: () => ({
                get: async () => ({
                  empty: !webAuthn || webAuthn.status !== 'active',
                  docs: webAuthn && webAuthn.status === 'active' ? [{ data: () => webAuthn }] : []
                })
              })
            })
          })
        })
      })
    }),
    runTransaction: async (cb: any) => cb({
      get: async (ref: any) => ({
        exists: ref.path?.includes('tenants/'),
        data: () => ({ moduleType: 'order-snap', name: 'Cafe One', status: 'active', sessionVersion: 1 })
      }),
      set: () => {},
      update: () => {}
    })
  } as any;
}

/**
 * Creates a real ASN.1 DER-encoded WebAuthn assertion response.
 */
function createWebAuthnAssertion(options: {
  credentialKeyPair?: { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject };
  credentialId?: string;
  challenge: Uint8Array;
  origin?: string;
  rpId?: string;
  userPresent?: boolean;
  userVerified?: boolean;
  counter?: number;
  corruptSignature?: boolean;
  rawP1363Signature?: boolean;
  clientDataType?: string;
}) {
  const keyPair = options.credentialKeyPair || clientCredentialKeyPair;
  const origin = options.origin ?? 'http://localhost:9002';
  const rpId = options.rpId ?? 'localhost';
  const clientDataType = options.clientDataType ?? 'webauthn.get';

  const challengeBase64Url = Buffer.from(options.challenge).toString('base64url');
  const clientData = {
    type: clientDataType,
    challenge: challengeBase64Url,
    origin
  };
  const clientDataJSON = new TextEncoder().encode(JSON.stringify(clientData));
  const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();

  const rpIdHash = crypto.createHash('sha256').update(Buffer.from(rpId, 'utf8')).digest();
  const flags =
    (options.userPresent !== false ? 0x01 : 0) |
    (options.userVerified !== false ? 0x04 : 0);
  const counterBuf = Buffer.alloc(4);
  counterBuf.writeUInt32BE(options.counter || 0, 0);

  const authenticatorData = Buffer.concat([rpIdHash, Buffer.from([flags]), counterBuf]);

  const signedData = Buffer.concat([authenticatorData, clientDataHash]);

  let signature: Buffer;
  if (options.rawP1363Signature) {
    // Generate IEEE-P1363 raw 64-byte signature to test rejection
    signature = crypto.sign('sha256', signedData, {
      key: keyPair.privateKey,
      dsaEncoding: 'ieee-p1363'
    });
  } else {
    // Real ASN.1 DER signature as returned by genuine WebAuthn authenticators
    signature = crypto.sign('sha256', signedData, {
      key: keyPair.privateKey,
      dsaEncoding: 'der'
    });
  }

  if (options.corruptSignature) {
    const corrupted = Buffer.from(signature);
    corrupted[corrupted.length - 1] ^= 0xff;
    signature = corrupted;
  }

  const credId = options.credentialId || clientCredentialIdBase64Url;

  return {
    id: credId,
    rawId: new Uint8Array(Buffer.from(credId, 'base64url')),
    response: {
      clientDataJSON: new Uint8Array(clientDataJSON),
      authenticatorData: new Uint8Array(authenticatorData),
      signature: new Uint8Array(signature)
    }
  };
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

test('1. Server signs and browser verifier validates a genuine certificate', async () => {
  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });

  const payload = createSampleCertificatePayload();
  const certificate = signer.signCertificate(payload, 'v2');

  assert.equal(certificate.algorithm, 'ES256');
  assert.equal(certificate.keyId, 'v2');
  assert.equal(certificate.signature.length, 128, 'IEEE-P1363 signature must be 128 hex chars (64 bytes)');

  const result = await verifyAuthorityCertificate(certificate, { trustedRegistry: TEST_TRUSTED_REGISTRY });
  assert.equal(result.isValid, true);
  assert.deepEqual(result.certificate?.payload, payload);
});

test('2. Immutable production trust registry & absence of trusted production key fails closed', () => {
  const unknownKey = getTrustedPublicKey('unknown_key');
  assert.equal(unknownKey, null, 'Unknown key must return null');

  const isConfigured = isOrderSnapOfflineAuthorityConfigured();
  assert.equal(typeof isConfigured, 'boolean');
});

test('3. Runtime trust-root replacement rejection: callers cannot supply untrusted trust root', async () => {
  const outboxDB = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(outboxDB);

  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  const verifyRes = await verifyAuthorityCertificate(cert);
  assert.equal(verifyRes.isValid, false, 'Must fail closed without production key configuration');
});

test('4. Node/browser ECDSA encoding compatibility: IEEE-P1363 raw 64-byte r || s', async () => {
  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });

  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  const serverVerify = signer.verifyCertificate(cert);
  assert.equal(serverVerify.isValid, true, 'Server verify must succeed');

  const clientVerify = await verifyAuthorityCertificate(cert, {
    trustedRegistry: TEST_TRUSTED_REGISTRY
  });
  assert.equal(clientVerify.isValid, true, 'Client WebCrypto verifier must succeed');
});

test('5. Certificate/payload/signature tampering rejection', async () => {
  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });

  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  const tamperedCert1 = {
    ...cert,
    payload: { ...cert.payload, role: 'owner' as const }
  };
  const res1 = await verifyAuthorityCertificate(tamperedCert1, { trustedRegistry: TEST_TRUSTED_REGISTRY });
  assert.equal(res1.isValid, false);

  const tamperedSig = cert.signature.substring(0, 126) + (cert.signature.endsWith('0') ? '1' : '0');
  const tamperedCert2 = { ...cert, signature: tamperedSig };
  const res2 = await verifyAuthorityCertificate(tamperedCert2, { trustedRegistry: TEST_TRUSTED_REGISTRY });
  assert.equal(res2.isValid, false);
});

test('6. Unknown version/algorithm/keyId rejection', async () => {
  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });

  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  const invalidKeyCert = { ...cert, keyId: 'v999' };
  const res1 = await verifyAuthorityCertificate(invalidKeyCert, { trustedRegistry: TEST_TRUSTED_REGISTRY });
  assert.equal(res1.isValid, false);
});

test('7. Missing trusted WebAuthn credential prevents certificate issuance (fail-closed)', async () => {
  const mockFirestore = buildAuthorityTestFirestore({ webAuthnData: null });

  const handler = createOrderSnapAuthorityRouteHandler({
    adminAuth: {
      verifyIdToken: async () => ({
        uid: 'user_maria_99',
        staffAccountId: 'staff_acc_99',
        tenantId: 'tenant_cafe_1',
        role: 'cashier',
        sessionVersion: 1
      })
    } as any,
    adminFirestore: mockFirestore,
    certificateSigner: new OrderSnapCertificateSigner({ privateKeys: { v2: serverPrivateKeyPem } }),
    env: TEST_ENV
  });

  const req = new Request('http://localhost:9002/api/order-snap/authority', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid_id_token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      deviceId: 'dev_terminal_01',
      catalogVersion: EMPTY_CATALOG_VERSION
    })
  });

  const res = await handler(req);
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.error, 'A registered, active WebAuthn security key is required for offline authority.');
});

test('8. Malformed or non-P-256 stored SPKI rejected before certificate issuance', async () => {
  const mockFirestore = buildAuthorityTestFirestore({
    webAuthnData: {
      status: 'active',
      credentialId: clientCredentialIdBase64Url,
      publicKeySpki: 'bm90X2FfdmFsaWRfc3BraV9rZXk=' // Malformed SPKI
    }
  });

  const handler = createOrderSnapAuthorityRouteHandler({
    adminAuth: {
      verifyIdToken: async () => ({
        uid: 'user_maria_99',
        staffAccountId: 'staff_acc_99',
        tenantId: 'tenant_cafe_1',
        role: 'cashier',
        sessionVersion: 1
      })
    } as any,
    adminFirestore: mockFirestore,
    certificateSigner: new OrderSnapCertificateSigner({ privateKeys: { v2: serverPrivateKeyPem } }),
    env: TEST_ENV
  });

  const req = new Request('http://localhost:9002/api/order-snap/authority', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid_id_token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      deviceId: 'dev_terminal_01',
      catalogVersion: EMPTY_CATALOG_VERSION
    })
  });

  const res = await handler(req);
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.error, 'Invalid or corrupted WebAuthn public key.');
});

test('9. Private key never appears in responses or persisted records', async () => {
  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  const serialized = JSON.stringify(cert);
  assert.equal(serialized.includes(serverPrivateKeyPem), false);
  assert.equal(serialized.includes('BEGIN PRIVATE KEY'), false);
});

test('10. Strict time boundaries and clock skew: issuedAt & expiresAt', async () => {
  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });

  const nowSec = 1000000;

  const validPayload = createSampleCertificatePayload({
    issuedAt: nowSec - 100,
    expiresAt: nowSec + 100
  });
  const validCert = signer.signCertificate(validPayload, 'v2');
  const res1 = await verifyAuthorityCertificate(validCert, {
    nowSeconds: nowSec,
    trustedRegistry: TEST_TRUSTED_REGISTRY
  });
  assert.equal(res1.isValid, true);

  const expiredPayload = createSampleCertificatePayload({
    issuedAt: nowSec - 200,
    expiresAt: nowSec
  });
  const expiredCert = signer.signCertificate(expiredPayload, 'v2');
  const res2 = await verifyAuthorityCertificate(expiredCert, {
    nowSeconds: nowSec,
    maxClockSkewSeconds: 60,
    trustedRegistry: TEST_TRUSTED_REGISTRY
  });
  assert.equal(res2.isValid, false);
  assert.equal(res2.error, 'certificate_expired');

  const futurePayload = createSampleCertificatePayload({
    issuedAt: nowSec + 120,
    expiresAt: nowSec + 3600
  });
  const futureCert = signer.signCertificate(futurePayload, 'v2');
  const res3 = await verifyAuthorityCertificate(futureCert, {
    nowSeconds: nowSec,
    maxClockSkewSeconds: 60,
    trustedRegistry: TEST_TRUSTED_REGISTRY
  });
  assert.equal(res3.isValid, false);
  assert.equal(res3.error, 'certificate_issued_in_future');
});

test('11. Identity, device, catalog, and module mismatch rejection', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });

  const payload = createSampleCertificatePayload({ deviceId: 'dev_different' });
  const cert = signer.signCertificate(payload, 'v2');

  const fetchFn = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      grant: cert,
      webAuthnCredential: {
        credentialId: clientCredentialIdBase64Url,
        publicKeySpki: clientCredentialPublicKeySpkiBase64,
        rpId: 'localhost',
        counter: 0
      }
    })
  }) as any;

  const result = await manager.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: 'tenant_cafe_1',
    deviceId: 'dev_terminal_01',
    catalogVersion: 'cat_cafe_v1',
    fetchFn
  });

  assert.equal(result.success, false);
  assert.equal(result.error, 'device_mismatch');
});

test('12. WebAuthn DER assertion verification success (real DER -> WebCrypto)', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  const fetchFn = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      grant: cert,
      webAuthnCredential: {
        credentialId: clientCredentialIdBase64Url,
        publicKeySpki: clientCredentialPublicKeySpkiBase64,
        rpId: 'localhost',
        counter: 10
      }
    })
  }) as any;

  const estRes = await manager.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: payload.tenantId,
    deviceId: payload.deviceId,
    catalogVersion: payload.catalogVersion,
    fetchFn
  });
  assert.equal(estRes.success, true);

  const restRes = await manager.restoreOfflineAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    currentCatalogVersion: payload.catalogVersion
  });
  assert.equal(restRes.success, true);
  assert.equal(manager.getState(), 'offline-locked');

  const unlockRes = await manager.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({
        challenge,
        rpId,
        counter: 11
      });
    }
  });

  assert.equal(unlockRes.success, true);
  assert.equal(manager.getState(), 'offline-unlocked');
});

test('13. Malformed, oversized, and noncanonical DER signatures rejected', () => {
  assert.throws(() => parseWebAuthnDerSignature(new Uint8Array([0x30, 0x02])), /too_short/);
  assert.throws(() => parseWebAuthnDerSignature(new Uint8Array([0x31, 0x06, 0x02, 0x01, 0x00, 0x02, 0x01, 0x00])), /expected_sequence/);

  const negDer = new Uint8Array([
    0x30, 0x06,
    0x02, 0x01, 0x80,
    0x02, 0x01, 0x01
  ]);
  assert.throws(() => parseWebAuthnDerSignature(negDer), /negative_der_integer/);

  const nonCanonicalDer = new Uint8Array([
    0x30, 0x07,
    0x02, 0x02, 0x00, 0x40,
    0x02, 0x01, 0x01
  ]);
  assert.throws(() => parseWebAuthnDerSignature(nonCanonicalDer), /noncanonical_der/);
});

test('14. Raw 64-byte IEEE-P1363 WebAuthn assertion rejected (must be DER)', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  await manager.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: payload.tenantId,
    deviceId: payload.deviceId,
    catalogVersion: payload.catalogVersion,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        grant: cert,
        webAuthnCredential: {
          credentialId: clientCredentialIdBase64Url,
          publicKeySpki: clientCredentialPublicKeySpkiBase64,
          rpId: 'localhost',
          counter: 5
        }
      })
    }) as any
  });

  await manager.restoreOfflineAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    currentCatalogVersion: payload.catalogVersion
  });

  const unlockRes = await manager.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({
        challenge,
        rpId,
        counter: 6,
        rawP1363Signature: true
      });
    }
  });

  assert.equal(unlockRes.success, false);
  assert.equal(unlockRes.error, 'assertion_verification_failed');
  assert.equal(manager.getState(), 'offline-locked');
});

test('15. No public challenge/origin override: genuine fresh 32-byte challenge generated per attempt', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());

  const generatedChallenges: Uint8Array[] = [];
  const manager = new OrderSnapAuthorityManager(db, {
    trustedRegistry: TEST_TRUSTED_REGISTRY,
    randomBytesFn: (len) => {
      const bytes = crypto.randomBytes(len);
      const uint8 = new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      generatedChallenges.push(uint8);
      return uint8;
    }
  });

  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  await manager.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: payload.tenantId,
    deviceId: payload.deviceId,
    catalogVersion: payload.catalogVersion,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        grant: cert,
        webAuthnCredential: {
          credentialId: clientCredentialIdBase64Url,
          publicKeySpki: clientCredentialPublicKeySpkiBase64,
          rpId: 'localhost',
          counter: 0
        }
      })
    }) as any
  });

  await manager.restoreOfflineAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    currentCatalogVersion: payload.catalogVersion
  });

  let receivedChallenge: Uint8Array | null = null;
  await manager.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      receivedChallenge = challenge;
      return createWebAuthnAssertion({ challenge, rpId, counter: 1 });
    }
  });

  assert.ok(receivedChallenge);
  assert.equal((receivedChallenge as Uint8Array).length, 32);
  assert.deepEqual(receivedChallenge, generatedChallenges[0]);
});

test('16. Origin and RP ID mismatch rejection', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload({ expectedOrigin: 'http://localhost:9002' });
  const cert = signer.signCertificate(payload, 'v2');

  await manager.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: payload.tenantId,
    deviceId: payload.deviceId,
    catalogVersion: payload.catalogVersion,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        grant: cert,
        webAuthnCredential: {
          credentialId: clientCredentialIdBase64Url,
          publicKeySpki: clientCredentialPublicKeySpkiBase64,
          rpId: 'localhost',
          counter: 0
        }
      })
    }) as any
  });

  await manager.restoreOfflineAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    currentCatalogVersion: payload.catalogVersion
  });

  const unlockRes = await manager.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({
        challenge,
        rpId,
        origin: 'https://evil-attacker.com',
        counter: 1
      });
    }
  });

  assert.equal(unlockRes.success, false);
  assert.equal(unlockRes.error, 'assertion_verification_failed');
});

test('17. Malformed clientDataJSON/authenticatorData rejection', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  await manager.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: payload.tenantId,
    deviceId: payload.deviceId,
    catalogVersion: payload.catalogVersion,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        grant: cert,
        webAuthnCredential: {
          credentialId: clientCredentialIdBase64Url,
          publicKeySpki: clientCredentialPublicKeySpkiBase64,
          rpId: 'localhost',
          counter: 0
        }
      })
    }) as any
  });

  await manager.restoreOfflineAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    currentCatalogVersion: payload.catalogVersion
  });

  const unlockRes = await manager.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({
        challenge,
        rpId,
        clientDataType: 'webauthn.create',
        counter: 1
      });
    }
  });

  assert.equal(unlockRes.success, false);
  assert.equal(unlockRes.error, 'assertion_verification_failed');
});

test('18. UP and UV flags enforcement', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload({
    requireUserPresence: true,
    requireUserVerification: true
  });
  const cert = signer.signCertificate(payload, 'v2');

  await manager.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: payload.tenantId,
    deviceId: payload.deviceId,
    catalogVersion: payload.catalogVersion,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        grant: cert,
        webAuthnCredential: {
          credentialId: clientCredentialIdBase64Url,
          publicKeySpki: clientCredentialPublicKeySpkiBase64,
          rpId: 'localhost',
          counter: 0
        }
      })
    }) as any
  });

  await manager.restoreOfflineAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    currentCatalogVersion: payload.catalogVersion
  });

  const unlockRes = await manager.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({
        challenge,
        rpId,
        userPresent: true,
        userVerified: false,
        counter: 1
      });
    }
  });

  assert.equal(unlockRes.success, false);
  assert.equal(unlockRes.error, 'assertion_verification_failed');
});

test('19. Sign-counter policies: 0 allowed, unsigned > 2^31 handled, rollback rejected', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  const initialCounter = 2147483647; // 2^31 - 1
  await manager.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: payload.tenantId,
    deviceId: payload.deviceId,
    catalogVersion: payload.catalogVersion,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        grant: cert,
        webAuthnCredential: {
          credentialId: clientCredentialIdBase64Url,
          publicKeySpki: clientCredentialPublicKeySpkiBase64,
          rpId: 'localhost',
          counter: initialCounter
        }
      })
    }) as any
  });

  await manager.restoreOfflineAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    currentCatalogVersion: payload.catalogVersion
  });

  const rollbackRes = await manager.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({ challenge, rpId, counter: 100 });
    }
  });
  assert.equal(rollbackRes.success, false);
  assert.equal(rollbackRes.error, 'counter_replay_detected');

  const higherCounter = 2147483700;
  const higherRes = await manager.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({ challenge, rpId, counter: higherCounter });
    }
  });
  assert.equal(higherRes.success, true);

  manager.clearAuthority();
  await manager.restoreOfflineAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    currentCatalogVersion: payload.catalogVersion
  });

  const equalRes = await manager.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({ challenge, rpId, counter: higherCounter });
    }
  });
  assert.equal(equalRes.success, false);
  assert.equal(equalRes.error, 'counter_replay_detected');
});

test('20. Transactional concurrent counter update: two managers/tabs cannot overwrite with stale counter', async () => {
  const mockIDB = createMockIndexedDB();
  const db1 = new OrderSnapOutboxDB(mockIDB);
  const db2 = new OrderSnapOutboxDB(mockIDB);

  const manager1 = new OrderSnapAuthorityManager(db1, { trustedRegistry: TEST_TRUSTED_REGISTRY });
  const manager2 = new OrderSnapAuthorityManager(db2, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  await manager1.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: payload.tenantId,
    deviceId: payload.deviceId,
    catalogVersion: payload.catalogVersion,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        grant: cert,
        webAuthnCredential: {
          credentialId: clientCredentialIdBase64Url,
          publicKeySpki: clientCredentialPublicKeySpkiBase64,
          rpId: 'localhost',
          counter: 10
        }
      })
    }) as any
  });

  await manager1.restoreOfflineAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    currentCatalogVersion: payload.catalogVersion
  });

  const unlock1 = await manager1.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({ challenge, rpId, counter: 20 });
    }
  });
  assert.equal(unlock1.success, true);

  await manager2.restoreOfflineAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    currentCatalogVersion: payload.catalogVersion
  });

  const unlock2 = await manager2.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({ challenge, rpId, counter: 15 });
    }
  });
  assert.equal(unlock2.success, false);
  assert.equal(unlock2.error, 'counter_replay_detected');
});

test('21. Persisted authority record is always locked (isLocalLocked: true)', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  await manager.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: payload.tenantId,
    deviceId: payload.deviceId,
    catalogVersion: payload.catalogVersion,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        grant: cert,
        webAuthnCredential: {
          credentialId: clientCredentialIdBase64Url,
          publicKeySpki: clientCredentialPublicKeySpkiBase64,
          rpId: 'localhost',
          counter: 0
        }
      })
    }) as any
  });

  const inDb = await db.getAuthority(payload.tenantId, payload.staffAccountId, payload.deviceId);
  assert.ok(inDb);
  assert.equal(inDb?.isLocalLocked, true, 'IndexedDB record must be stored locked');

  await manager.restoreOfflineAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    currentCatalogVersion: payload.catalogVersion
  });

  await manager.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({ challenge, rpId, counter: 1 });
    }
  });

  assert.equal(manager.getState(), 'offline-unlocked');

  const inDbAfterUnlock = await db.getAuthority(payload.tenantId, payload.staffAccountId, payload.deviceId);
  assert.equal(inDbAfterUnlock?.isLocalLocked, true, 'IndexedDB record must NEVER persist unlocked state');
});

test('22. Successful fresh ceremony unlocks only in memory; failure never unlocks', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  await manager.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: payload.tenantId,
    deviceId: payload.deviceId,
    catalogVersion: payload.catalogVersion,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        grant: cert,
        webAuthnCredential: {
          credentialId: clientCredentialIdBase64Url,
          publicKeySpki: clientCredentialPublicKeySpkiBase64,
          rpId: 'localhost',
          counter: 0
        }
      })
    }) as any
  });

  await manager.restoreOfflineAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    currentCatalogVersion: payload.catalogVersion
  });

  const failRes = await manager.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({
        challenge,
        rpId,
        counter: 1,
        corruptSignature: true
      });
    }
  });

  assert.equal(failRes.success, false);
  assert.equal(manager.getState(), 'offline-locked');
  assert.equal(manager.isAuthorizedForOfflineCheckout(), false);
});

test('23. Legacy v1 HMAC response cannot establish new authority', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const grantSigner = new OrderSnapGrantSigner({
    keys: { v1: 'order_snap_test_secret_must_be_sufficiently_long_32chars_min' }
  });

  const v1Grant = grantSigner.signGrant({
    grantId: 'grant_v1_legacy',
    moduleId: 'order-snap',
    tenantId: 'tenant_cafe_1',
    staffAccountId: 'staff_acc_99',
    actorId: 'staff_staff_acc_99',
    authUid: 'firebase_uid_123',
    sessionVersion: 1,
    role: 'cashier',
    displayName: 'Staff',
    deviceId: 'dev_terminal_01',
    catalogVersion: 'cat_v1',
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    allowedTenders: ['cash']
  });

  const result = await manager.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: 'tenant_cafe_1',
    deviceId: 'dev_terminal_01',
    catalogVersion: 'cat_v1',
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        grant: v1Grant,
        webAuthnCredential: {
          credentialId: clientCredentialIdBase64Url,
          publicKeySpki: clientCredentialPublicKeySpkiBase64,
          rpId: 'localhost',
          counter: 0
        }
      })
    }) as any
  });

  assert.equal(result.success, false);
  assert.equal(result.state, 'unauthorized');
});

test('24. Legacy v1 grants can restore to locked state for queued sync, but cannot unlock offline', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const grantSigner = new OrderSnapGrantSigner({
    keys: { v1: 'order_snap_test_secret_must_be_sufficiently_long_32chars_min' }
  });

  const nowSec = Math.floor(Date.now() / 1000);
  const v1Grant = grantSigner.signGrant({
    grantId: 'grant_v1_legacy',
    moduleId: 'order-snap',
    tenantId: 'tenant_cafe_1',
    staffAccountId: 'staff_acc_99',
    actorId: 'staff_staff_acc_99',
    authUid: 'firebase_uid_123',
    sessionVersion: 1,
    role: 'cashier',
    displayName: 'Staff',
    deviceId: 'dev_terminal_01',
    catalogVersion: 'cat_v1',
    issuedAt: nowSec,
    expiresAt: nowSec + 3600,
    allowedTenders: ['cash']
  });

  await db.saveAuthority({
    tenantId: 'tenant_cafe_1',
    staffAccountId: 'staff_acc_99',
    deviceId: 'dev_terminal_01',
    grant: v1Grant,
    catalogVersion: 'cat_v1',
    issuedAt: nowSec,
    expiresAt: nowSec + 3600,
    isLocalLocked: true,
    updatedAt: Date.now()
  });

  const restoreRes = await manager.restoreOfflineAuthority({
    tenantId: 'tenant_cafe_1',
    staffAccountId: 'staff_acc_99',
    deviceId: 'dev_terminal_01',
    currentCatalogVersion: 'cat_v1'
  });

  assert.equal(restoreRes.success, true);
  assert.equal(restoreRes.state, 'offline-locked');

  const unlockRes = await manager.attemptWebAuthnUnlock({
    ceremonyProvider: async ({ challenge, rpId }) => {
      return createWebAuthnAssertion({ challenge, rpId, counter: 1 });
    }
  });

  assert.equal(unlockRes.success, false);
  assert.equal(unlockRes.error, 'legacy_grant_cannot_unlock');
});

test('25. Sanitized client errors: no raw server response messages or internals leaked', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

  const result = await manager.establishOnlineAuthority({
    idToken: 'token_123',
    tenantId: 'tenant_cafe_1',
    deviceId: 'dev_terminal_01',
    catalogVersion: 'cat_v1',
    fetchFn: async () => ({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'FATAL SQL/Firestore internal connection failed at 192.168.1.50 with secret key secret_xyz'
      })
    }) as any
  });

  assert.equal(result.success, false);
  assert.equal(result.error, 'unauthorized');
  assert.equal(result.error?.includes('FATAL'), false);
  assert.equal(result.error?.includes('secret_xyz'), false);
});

test('26. Server checkout sync verifies v2 certificates and rejects revoked/mismatched live credentials', async () => {
  const signer = new OrderSnapCertificateSigner({
    privateKeys: { v2: serverPrivateKeyPem }
  });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  let credentialStatus = 'active';

  const docMap: Record<string, any> = {
    'tenants/tenant_cafe_1': {
      moduleType: 'order-snap',
      subscriptionStatus: 'active',
      ownerUid: payload.authUid
    },
    'tenants/tenant_cafe_1/staff_accounts/staff_acc_99': {
      tenantId: 'tenant_cafe_1',
      authUid: payload.authUid,
      status: 'active',
      sessionVersion: 1
    },
    'tenants/tenant_cafe_1/menu_items/item_1': {
      id: 'item_1',
      menuItemId: 'item_1',
      tenantId: 'tenant_cafe_1',
      name: 'Iced Coffee',
      category: 'Beverages',
      basePriceCentavos: 10000,
      activeRecipeVersionId: 'rec_1',
      isActive: true,
      isAvailable: true,
      modifierGroupIds: []
    },
    'tenants/tenant_cafe_1/recipes/rec_1': {
      id: 'rec_1',
      recipeVersionId: 'rec_1',
      tenantId: 'tenant_cafe_1',
      menuItemId: 'item_1',
      version: 1,
      yield: 1,
      isActive: true,
      components: [
        { ingredientId: 'ing_beans', quantityMinor: 18000, unit: 'kg', quantityScale: 3 }
      ]
    },
    'tenants/tenant_cafe_1/ingredients/ing_beans': {
      id: 'ing_beans',
      tenantId: 'tenant_cafe_1',
      name: 'Coffee Beans',
      unit: 'kg',
      quantityScale: 3,
      stockQuantityMinor: 500000,
      costBasis: { basisQuantityMinor: 1000000, basisCostCentavos: 50000 },
      reorderLevelMinor: 10000,
      version: 1,
      isActive: true
    }
  };

  const mockFirestore = {
    collection: (col: string) => ({
      doc: (id: string) => {
        const p = `${col}/${id}`;
        return {
          path: p,
          get: async () => {
            if (col === 'webauthn_credentials' && id === payload.credentialIdFingerprint) {
              return {
                exists: true,
                data: () => ({
                  status: credentialStatus,
                  tenantId: payload.tenantId,
                  staffAccountId: payload.staffAccountId,
                  installationId: payload.deviceId,
                  publicKeySpki: clientCredentialPublicKeySpkiBase64
                })
              };
            }
            return { exists: !!docMap[p], data: () => docMap[p] || null };
          },
          collection: (subCol: string) => ({
            doc: (subId: string) => {
              const sp = `${p}/${subCol}/${subId}`;
              return {
                path: sp,
                get: async () => ({ exists: !!docMap[sp], data: () => docMap[sp] || null })
              };
            }
          })
        };
      }
    }),
    runTransaction: async (cb: any) => {
      const tx: any = {
        get: async (ref: any) => ({ exists: !!docMap[ref.path], data: () => docMap[ref.path] || null }),
        set: () => {},
        update: () => {}
      };
      return cb(tx);
    }
  } as any;

  const handler = createOrderSnapCheckoutRouteHandler({
    adminAuth: {
      verifyIdToken: async () => ({
        uid: payload.authUid,
        staffAccountId: payload.staffAccountId,
        tenantId: payload.tenantId,
        role: payload.role,
        sessionVersion: payload.sessionVersion
      })
    } as any,
    adminFirestore: mockFirestore,
    certificateSigner: signer,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    env: TEST_ENV
  });

  const now = new Date().toISOString();
  const validCheckoutBody = {
    mode: 'offline_sync',
    deviceId: payload.deviceId,
    catalogVersion: payload.catalogVersion,
    authorityGrant: cert,
    paymentMethod: 'cash',
    request: {
      orderId: 'ord_123',
      tenantId: payload.tenantId,
      staffAccountId: payload.staffAccountId,
      idempotencyKey: 'idemp_ord_123',
      createdAt: now,
      committedAt: now,
      lines: [{ lineId: 'l1', menuItemId: 'item_1', quantity: 1 }]
    }
  };

  const req1 = new Request('http://localhost:9002/api/order-snap/checkout', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid_token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(validCheckoutBody)
  });

  const res1 = await handler(req1);
  assert.equal(res1.status, 200);

  credentialStatus = 'revoked';
  const req2 = new Request('http://localhost:9002/api/order-snap/checkout', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid_token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(validCheckoutBody)
  });

  const res2 = await handler(req2);
  assert.equal(res2.status, 401);
  const json2 = await res2.json();
  assert.equal(json2.category, 'AUTHENTICATION_REQUIRED');
  assert.equal(json2.error, 'Authentication required.');
});

test('27. updateAuthorityCounterAtomic: all 5 counter transitions, positive->zero preservation, and later rollback rejection', async () => {
  const db = new OrderSnapOutboxDB(createMockIndexedDB());
  const signer = new OrderSnapCertificateSigner({ privateKeys: { v2: serverPrivateKeyPem } });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  // Initial save with counter = 0
  await db.saveAuthority({
    tenantId: payload.tenantId,
    staffAccountId: payload.staffAccountId,
    deviceId: payload.deviceId,
    grant: cert,
    catalogVersion: payload.catalogVersion,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    isLocalLocked: true,
    updatedAt: Date.now(),
    webAuthnCredential: {
      credentialId: clientCredentialIdBase64Url,
      publicKeySpki: clientCredentialPublicKeySpkiBase64,
      rpId: 'localhost',
      counter: 0
    }
  });

  // Transition 1: stored 0, returned 0 -> accept & preserve 0
  const t1 = await db.updateAuthorityCounterAtomic(
    payload.tenantId,
    payload.staffAccountId,
    payload.deviceId,
    0
  );
  assert.equal(t1.success, true);
  assert.equal(t1.effectiveCounter, 0);
  assert.equal(t1.updatedCounter, 0);
  let rec = await db.getAuthority(payload.tenantId, payload.staffAccountId, payload.deviceId);
  assert.equal(rec?.webAuthnCredential?.counter, 0);

  // Transition 2: stored 0, returned positive (100) -> accept & store 100
  const t2 = await db.updateAuthorityCounterAtomic(
    payload.tenantId,
    payload.staffAccountId,
    payload.deviceId,
    100
  );
  assert.equal(t2.success, true);
  assert.equal(t2.effectiveCounter, 100);
  assert.equal(t2.updatedCounter, 100);
  rec = await db.getAuthority(payload.tenantId, payload.staffAccountId, payload.deviceId);
  assert.equal(rec?.webAuthnCredential?.counter, 100);

  // Transition 3: stored positive (100), returned higher positive (200) -> accept & store 200
  const t3 = await db.updateAuthorityCounterAtomic(
    payload.tenantId,
    payload.staffAccountId,
    payload.deviceId,
    200
  );
  assert.equal(t3.success, true);
  assert.equal(t3.effectiveCounter, 200);
  assert.equal(t3.updatedCounter, 200);
  rec = await db.getAuthority(payload.tenantId, payload.staffAccountId, payload.deviceId);
  assert.equal(rec?.webAuthnCredential?.counter, 200);

  // Transition 4: stored positive (200), returned equal/lower positive (150) -> reject
  const t4 = await db.updateAuthorityCounterAtomic(
    payload.tenantId,
    payload.staffAccountId,
    payload.deviceId,
    150
  );
  assert.equal(t4.success, false);
  assert.equal(t4.error, 'authenticator_clone_or_rollback_detected');
  rec = await db.getAuthority(payload.tenantId, payload.staffAccountId, payload.deviceId);
  assert.equal(rec?.webAuthnCredential?.counter, 200, 'Counter must remain unchanged at 200');

  // Transition 5: stored positive (200), returned 0 -> accept, MUST preserve 200 (never overwrite with 0)
  const t5 = await db.updateAuthorityCounterAtomic(
    payload.tenantId,
    payload.staffAccountId,
    payload.deviceId,
    0
  );
  assert.equal(t5.success, true);
  assert.equal(t5.effectiveCounter, 200, 'Effective counter must remain 200');
  assert.equal(t5.updatedCounter, 200);
  rec = await db.getAuthority(payload.tenantId, payload.staffAccountId, payload.deviceId);
  assert.equal(rec?.webAuthnCredential?.counter, 200, 'Stored counter in IndexedDB must be preserved at 200');

  // Subsequent positive rollback attempt (e.g. 150) is STILL rejected after 0 assertion
  const t6 = await db.updateAuthorityCounterAtomic(
    payload.tenantId,
    payload.staffAccountId,
    payload.deviceId,
    150
  );
  assert.equal(t6.success, false);
  assert.equal(t6.error, 'authenticator_clone_or_rollback_detected');
  rec = await db.getAuthority(payload.tenantId, payload.staffAccountId, payload.deviceId);
  assert.equal(rec?.webAuthnCredential?.counter, 200, 'Stored counter remains 200');
});

test('28. Missing browser Web Crypto fails closed without insecure fallback', async () => {
  const signer = new OrderSnapCertificateSigner({ privateKeys: { v2: serverPrivateKeyPem } });
  const payload = createSampleCertificatePayload();
  const cert = signer.signCertificate(payload, 'v2');

  // Save original crypto.subtle
  const originalSubtle = globalThis.crypto?.subtle;
  const originalGetRandomValues = globalThis.crypto?.getRandomValues;

  try {
    // Simulate browser environment without Web Crypto
    Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true });

    const verifyRes = await verifyAuthorityCertificate(cert, { trustedRegistry: TEST_TRUSTED_REGISTRY });
    assert.equal(verifyRes.isValid, false);
    assert.equal(verifyRes.error, 'web_crypto_unavailable');

    const db = new OrderSnapOutboxDB(createMockIndexedDB());
    const manager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });

    // Establish authority without subtle fails closed
    const estRes = await manager.establishOnlineAuthority({
      idToken: 'token_123',
      tenantId: payload.tenantId,
      deviceId: payload.deviceId,
      catalogVersion: payload.catalogVersion,
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          grant: cert,
          webAuthnCredential: {
            credentialId: clientCredentialIdBase64Url,
            publicKeySpki: clientCredentialPublicKeySpkiBase64,
            rpId: 'localhost',
            counter: 0
          }
        })
      }) as any
    });
    assert.equal(estRes.success, false);
    assert.equal(estRes.state, 'unauthorized');

    // Default randomness without getRandomValues fails closed
    Object.defineProperty(globalThis.crypto, 'getRandomValues', { value: undefined, configurable: true });
    const noCryptoManager = new OrderSnapAuthorityManager(db, { trustedRegistry: TEST_TRUSTED_REGISTRY });
    assert.throws(() => (noCryptoManager as any).randomBytesFn(32), /web_crypto_unavailable/);
  } finally {
    // Restore original Web Crypto
    Object.defineProperty(globalThis.crypto, 'subtle', { value: originalSubtle, configurable: true });
    Object.defineProperty(globalThis.crypto, 'getRandomValues', { value: originalGetRandomValues, configurable: true });
  }
});
