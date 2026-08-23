import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signChallengeCookie,
  verifyChallengeCookie,
  computeCredentialIdHash,
  computePublicKeyHash
} from '../src/lib/server/webauthn-server-service';
import { WebAuthnChallengeCookiePayload } from '../src/lib/offline/webauthn-types';

test('WebAuthn Challenge Cookie: Signs, verifies, and detects tampering with constant-time security', () => {
  const secret = 'test_webauthn_secret_must_be_32_chars_long_12345';
  const now = Date.now();
  const payload: WebAuthnChallengeCookiePayload = {
    challenge: 'test_challenge_base64url_string',
    tenantId: 'tenant_test_1',
    staffAccountId: 'staff_acc_1',
    authUid: 'cashier_uid_1',
    sessionVersion: 1,
    installationId: 'inst_uuid_12345678',
    rpId: 'localhost',
    origin: 'http://localhost:9002',
    createdAt: now,
    expiresAt: now + 300000 // 5 mins
  };

  const cookie = signChallengeCookie(payload, secret);
  assert.ok(cookie.includes('.'), 'Cookie should contain payload and signature separated by dot');

  // Successful verification
  const verification = verifyChallengeCookie(cookie, secret);
  assert.equal(verification.isValid, true);
  assert.equal(verification.payload?.challenge, 'test_challenge_base64url_string');
  assert.equal(verification.payload?.tenantId, 'tenant_test_1');

  // Tampered payload
  const parts = cookie.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, tenantId: 'attacker_tenant' })).toString('base64url');
  const tamperedCookie = `${tamperedPayload}.${parts[1]}`;
  const tamperedCheck = verifyChallengeCookie(tamperedCookie, secret);
  assert.equal(tamperedCheck.isValid, false);
  assert.equal(tamperedCheck.error, 'invalid_challenge_signature');

  // Expired payload
  const expiredPayload: WebAuthnChallengeCookiePayload = {
    ...payload,
    expiresAt: now - 1000 // Expired 1 second ago
  };
  const expiredCookie = signChallengeCookie(expiredPayload, secret);
  const expiredCheck = verifyChallengeCookie(expiredCookie, secret);
  assert.equal(expiredCheck.isValid, false);
  assert.equal(expiredCheck.error, 'challenge_expired');

  // Wrong secret
  const wrongSecretCheck = verifyChallengeCookie(cookie, 'wrong_secret_32_chars_long_1234567890');
  assert.equal(wrongSecretCheck.isValid, false);
  assert.equal(wrongSecretCheck.error, 'invalid_challenge_signature');
});

test('Canonical Hashes: Computes deterministic SHA-256 hashes for credential ID and public key', () => {
  const credentialBytes = Buffer.from('credential_id_sample_bytes_12345');
  const hash1 = computeCredentialIdHash(credentialBytes);
  const hash2 = computeCredentialIdHash(credentialBytes);
  assert.equal(hash1, hash2);
  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64); // SHA-256 hex string length

  const pubKeyBytes = Buffer.from('public_key_spki_sample_bytes_67890');
  const pubHash1 = computePublicKeyHash(pubKeyBytes);
  const pubHash2 = computePublicKeyHash(pubKeyBytes);
  assert.equal(pubHash1, pubHash2);
  assert.notEqual(hash1, pubHash1);
});

test('COSE to SPKI Conversion: Verified COSE key converted to valid X.509 SPKI importable in Web Crypto', () => {
  const { convertVerifiedCoseToSpki } = require('../src/lib/server/webauthn-server-service');
  const { isoCBOR } = require('@simplewebauthn/server/helpers');
  const crypto = require('crypto');

  // Generate real P-256 key pair
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const uncompressed = ecdh.getPublicKey(); // 04 || x (32) || y (32)
  const x = uncompressed.subarray(1, 33);
  const y = uncompressed.subarray(33, 65);

  // Construct valid COSE EC2 P-256 CBOR Map
  const coseMap = new Map();
  coseMap.set(1, 2);   // kty: 2 (EC2)
  coseMap.set(3, -7);  // alg: -7 (ES256)
  coseMap.set(-1, 1);  // crv: 1 (P-256)
  coseMap.set(-2, x);  // x coordinate
  coseMap.set(-3, y);  // y coordinate

  const coseBytes = isoCBOR.encode(coseMap);
  const { spkiBytes, algorithm, coseBase64Url } = convertVerifiedCoseToSpki(coseBytes);

  assert.equal(algorithm, -7);
  assert.equal(spkiBytes.length, 91, 'Standard ECDSA P-256 SPKI DER length is 91 bytes');
  assert.ok(typeof coseBase64Url === 'string');

  // Verify Node crypto accepts this SPKI buffer
  const nodePubKey = crypto.createPublicKey({ key: spkiBytes, format: 'der', type: 'spki' });
  assert.equal(nodePubKey.asymmetricKeyType, 'ec');

  // Test Algorithm Restriction: Reject non-ES256 algorithms (e.g. RS256 / alg -257)
  const invalidAlgMap = new Map(coseMap);
  invalidAlgMap.set(3, -257); // RS256
  const invalidCoseBytes = isoCBOR.encode(invalidAlgMap);

  assert.throws(
    () => convertVerifiedCoseToSpki(invalidCoseBytes),
    /unsupported_algorithm/
  );
});
