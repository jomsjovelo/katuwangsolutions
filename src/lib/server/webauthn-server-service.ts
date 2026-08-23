import { createHash, createHmac, timingSafeEqual, createPublicKey } from 'crypto';
import * as admin from 'firebase-admin';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  GenerateRegistrationOptionsOpts,
  VerifyRegistrationResponseOpts
} from '@simplewebauthn/server';
import {
  decodeCredentialPublicKey,
  convertCOSEtoPKCS
} from '@simplewebauthn/server/helpers';
import { getAdminFirestore } from '@/firebase/admin';
import { getWebAuthnConfig, getWebAuthnChallengeSecret } from './webauthn-env-config';
import {
  ServerTrustedDeviceDoc,
  WebAuthnChallengeCookiePayload,
  WebAuthnRegistrationVerifyResponse
} from '../offline/webauthn-types';
import { VerifiedCashierIdentity } from './cashier-server-authorization';

export const WEBAUTHN_COOKIE_NAME = 'katuwang_webauthn_reg';

// Standard 26-byte ASN.1 DER SPKI header for ECDSA P-256 (secp256r1)
const ECDSA_P256_SPKI_HEADER = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');

/**
 * Converts a verified COSE public key into standard X.509 SPKI DER bytes.
 * Strictly enforces ES256 (COSE alg -7, P-256) and verifies the resulting SPKI key material.
 */
export function convertVerifiedCoseToSpki(coseBytes: Uint8Array): {
  spkiBytes: Buffer;
  algorithm: -7;
  coseBase64Url: string;
} {
  const coseDecoded = decodeCredentialPublicKey(coseBytes);

  // COSE Key Map keys: 1: kty (2 = EC2), 3: alg (-7 = ES256), -1: crv (1 = P-256)
  const map = coseDecoded as Map<number, any>;
  const kty = map.get(1);
  const alg = map.get(3);
  const crv = map.get(-1);

  if (kty !== 2 || alg !== -7 || crv !== 1) {
    throw new Error(`unsupported_algorithm: Only verified ES256 (-7) ECDSA P-256 credentials are supported. Received kty=${kty}, alg=${alg}, crv=${crv}`);
  }

  const uncompressed = convertCOSEtoPKCS(coseBytes);
  if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
    throw new Error('invalid_key_coordinates: Expected 65-byte uncompressed P-256 public key (0x04 || x || y).');
  }

  const spkiBytes = Buffer.concat([ECDSA_P256_SPKI_HEADER, Buffer.from(uncompressed)]);

  // Verify that Node crypto accepts this as a valid EC P-256 SPKI public key
  try {
    const pubKey = createPublicKey({ key: spkiBytes, format: 'der', type: 'spki' });
    if (pubKey.asymmetricKeyType !== 'ec') {
      throw new Error('Invalid key type');
    }
  } catch (err: any) {
    throw new Error(`spki_verification_failed: ${err.message}`);
  }

  return {
    spkiBytes,
    algorithm: -7,
    coseBase64Url: Buffer.from(coseBytes).toString('base64url')
  };
}

/**
 * Computes canonical SHA-256 hash of credential ID buffer.
 */
export function computeCredentialIdHash(credentialIdBytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(credentialIdBytes).digest('hex');
}

/**
 * Computes canonical SHA-256 hash of public key SPKI buffer.
 */
export function computePublicKeyHash(publicKeySpkiBytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(publicKeySpkiBytes).digest('hex');
}

/**
 * Signs WebAuthn challenge payload into a tamper-proof cookie value.
 */
export function signChallengeCookie(payload: WebAuthnChallengeCookiePayload, secret: string): string {
  const json = JSON.stringify(payload);
  const base64Data = Buffer.from(json, 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(base64Data).digest('base64url');
  return `${base64Data}.${signature}`;
}

/**
 * Verifies signed challenge cookie value using constant-time comparison.
 */
export function verifyChallengeCookie(
  cookieValue: string,
  secret: string
): { isValid: boolean; payload?: WebAuthnChallengeCookiePayload; error?: string } {
  if (!cookieValue || typeof cookieValue !== 'string') {
    return { isValid: false, error: 'missing_challenge_cookie' };
  }

  const parts = cookieValue.split('.');
  if (parts.length !== 2) {
    return { isValid: false, error: 'malformed_challenge_cookie' };
  }

  const [base64Data, providedSig] = parts;
  const expectedSig = createHmac('sha256', secret).update(base64Data).digest('base64url');

  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');

  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    return { isValid: false, error: 'invalid_challenge_signature' };
  }

  try {
    const json = Buffer.from(base64Data, 'base64url').toString('utf8');
    const payload: WebAuthnChallengeCookiePayload = JSON.parse(json);

    if (Date.now() > payload.expiresAt) {
      return { isValid: false, error: 'challenge_expired' };
    }

    return { isValid: true, payload };
  } catch {
    return { isValid: false, error: 'corrupted_challenge_payload' };
  }
}

/**
 * Generates standards-compliant WebAuthn registration options using @simplewebauthn/server.
 * Enforces ES256 (-7) algorithm.
 */
export async function generateCashierRegistrationOptions(
  identity: VerifiedCashierIdentity,
  installationId: string,
  env?: Record<string, string | undefined>
): Promise<{
  options: any;
  cookieHeader: string;
  suggestedName: string;
}> {
  const config = getWebAuthnConfig(env);
  const secret = getWebAuthnChallengeSecret(env);

  const userIdBytes = Buffer.from(`${identity.tenantId}:${identity.staffAccountId}:${installationId}`, 'utf8');

  const opts: GenerateRegistrationOptionsOpts = {
    rpName: config.rpName,
    rpID: config.rpId,
    userID: new Uint8Array(userIdBytes),
    userName: (identity as any).displayName || `cashier_${identity.staffAccountId}`,
    userDisplayName: (identity as any).displayName || 'Katuwang Cashier',
    attestationType: 'none',
    supportedAlgorithmIDs: [-7], // Strictly ES256
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required'
    },
    timeout: 60000
  };

  const options = await generateRegistrationOptions(opts);

  const now = Date.now();
  const challengePayload: WebAuthnChallengeCookiePayload = {
    challenge: options.challenge,
    tenantId: identity.tenantId,
    staffAccountId: identity.staffAccountId,
    authUid: identity.uid,
    sessionVersion: identity.sessionVersion,
    installationId,
    rpId: config.rpId,
    origin: config.expectedOrigin,
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000 // 5 minutes
  };

  const cookieVal = signChallengeCookie(challengePayload, secret);
  const isSecure = !config.isLocalhost;
  const cookieHeader = `${WEBAUTHN_COOKIE_NAME}=${cookieVal}; Path=/; HttpOnly; SameSite=Strict; Max-Age=300${isSecure ? '; Secure' : ''}`;

  return {
    options,
    cookieHeader,
    suggestedName: 'Cashier Terminal'
  };
}

/**
 * Verifies WebAuthn registration response and registers trusted device using @simplewebauthn/server.
 * Rejects rebinding if credential exists for another identity.
 */
export async function verifyAndRegisterCashierDevice(
  identity: VerifiedCashierIdentity,
  installationId: string,
  registrationResponse: any,
  deviceName: string,
  challengePayload: WebAuthnChallengeCookiePayload,
  db?: admin.firestore.Firestore,
  env?: Record<string, string | undefined>
): Promise<WebAuthnRegistrationVerifyResponse> {
  const config = getWebAuthnConfig(env);
  const firestore = db || getAdminFirestore();

  // Validate caller identity matches challenge
  if (
    challengePayload.tenantId !== identity.tenantId ||
    challengePayload.staffAccountId !== identity.staffAccountId ||
    challengePayload.authUid !== identity.uid ||
    challengePayload.sessionVersion !== identity.sessionVersion ||
    challengePayload.installationId !== installationId
  ) {
    throw new Error('WebAuthn registration identity mismatch.');
  }

  const verifyOpts: VerifyRegistrationResponseOpts = {
    response: registrationResponse,
    expectedChallenge: challengePayload.challenge,
    expectedOrigin: config.expectedOrigin,
    expectedRPID: config.rpId,
    requireUserVerification: true,
    requireUserPresence: true
  };

  const verification = await verifyRegistrationResponse(verifyOpts);

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('WebAuthn registration verification failed');
  }

  const { credential } = verification.registrationInfo;
  const credentialId = credential.id;
  const credentialIdBytes = Buffer.from(credentialId, 'base64url');
  const credentialIdHash = computeCredentialIdHash(credentialIdBytes);

  // Convert verified COSE public key to valid X.509 SPKI bytes and derive algorithm strictly from key material
  const { spkiBytes, algorithm, coseBase64Url } = convertVerifiedCoseToSpki(credential.publicKey);
  const publicKeySpki = spkiBytes.toString('base64');
  const credentialPublicKeyHash = computePublicKeyHash(spkiBytes);

  const counter = credential.counter || 0;
  const docRef = firestore.collection('webauthn_credentials').doc(credentialIdHash);

  await firestore.runTransaction(async (transaction) => {
    const existingSnap = await transaction.get(docRef);

    if (existingSnap.exists) {
      const existingData = existingSnap.data() as ServerTrustedDeviceDoc;
      // Rebinding Protection: Reject if credential belongs to different tenant, staff, or installation
      if (
        existingData.tenantId !== identity.tenantId ||
        existingData.staffAccountId !== identity.staffAccountId ||
        existingData.installationId !== installationId
      ) {
        throw new Error('Security Error: Credential ID is already bound to another identity.');
      }
      // Idempotent update of existing registration for same identity
      transaction.update(docRef, {
        deviceName: deviceName.trim() || 'Cashier Terminal',
        credentialPublicKeyCose: coseBase64Url,
        publicKeySpki,
        credentialPublicKeyHash,
        algorithm,
        counter,
        status: 'active',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Create new global trusted credential document
      const deviceDoc: ServerTrustedDeviceDoc = {
        credentialId,
        credentialIdHash,
        credentialPublicKeyHash,
        tenantId: identity.tenantId,
        staffAccountId: identity.staffAccountId,
        authUid: identity.uid,
        sessionVersion: identity.sessionVersion,
        installationId,
        deviceName: deviceName.trim() || 'Cashier Terminal',
        credentialPublicKeyCose: coseBase64Url,
        publicKeySpki,
        algorithm,
        counter,
        transports: credential.transports,
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      transaction.set(docRef, deviceDoc);
    }
  });

  return {
    success: true,
    trustedDevice: {
      credentialId,
      credentialIdHash,
      credentialPublicKeyHash,
      deviceName: deviceName.trim() || 'Cashier Terminal',
      publicKeySpki,
      algorithm,
      counter,
      rpId: config.rpId
    }
  };
}

/**
 * Retrieves trusted device document by canonical credentialIdHash.
 */
export async function getTrustedDeviceByCredentialIdHash(
  credentialIdHash: string,
  db?: admin.firestore.Firestore
): Promise<ServerTrustedDeviceDoc | null> {
  const firestore = db || getAdminFirestore();
  const snap = await firestore.collection('webauthn_credentials').doc(credentialIdHash).get();
  return snap.exists ? (snap.data() as ServerTrustedDeviceDoc) : null;
}

/**
 * Retrieves active trusted device for a given installation and staff account.
 */
export async function getActiveTrustedDeviceForInstallation(
  tenantId: string,
  staffAccountId: string,
  installationId: string,
  db?: admin.firestore.Firestore
): Promise<ServerTrustedDeviceDoc | null> {
  const firestore = db || getAdminFirestore();
  const querySnap = await firestore
    .collection('webauthn_credentials')
    .where('tenantId', '==', tenantId)
    .where('staffAccountId', '==', staffAccountId)
    .where('installationId', '==', installationId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (querySnap.empty) return null;
  return querySnap.docs[0].data() as ServerTrustedDeviceDoc;
}

/**
 * Revokes a trusted device (Owner-only foundation).
 */
export async function revokeTrustedDevice(
  tenantId: string,
  credentialIdHash: string,
  reason: string,
  db?: admin.firestore.Firestore
): Promise<void> {
  const firestore = db || getAdminFirestore();
  const docRef = firestore.collection('webauthn_credentials').doc(credentialIdHash);
  const snap = await docRef.get();

  if (!snap.exists || snap.data()?.tenantId !== tenantId) {
    throw new Error('device_not_found');
  }

  await docRef.update({
    status: 'revoked',
    revokedAt: admin.firestore.FieldValue.serverTimestamp(),
    revocationReason: reason.trim() || 'Revoked by owner',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}
