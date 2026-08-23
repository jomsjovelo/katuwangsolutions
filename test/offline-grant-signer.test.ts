import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeJson,
  OfflineGrantSigner
} from '../src/lib/server/offline-grant-signer';
import { OfflineAuthGrantPayload } from '../src/lib/offline/offline-types';

test('canonicalizeJson recursively sorts keys deterministically and formats finite values', () => {
  const obj1 = { b: 2, a: 1, nested: { z: 26, y: 25 } };
  const obj2 = { a: 1, nested: { y: 25, z: 26 }, b: 2 };

  const json1 = canonicalizeJson(obj1);
  const json2 = canonicalizeJson(obj2);

  assert.equal(json1, json2);
  assert.equal(json1, '{"a":1,"b":2,"nested":{"y":25,"z":26}}');
});

test('canonicalizeJson rejects non-finite numbers', () => {
  assert.throws(() => canonicalizeJson({ a: NaN }), /cannot_canonicalize_non_finite_number/);
  assert.throws(() => canonicalizeJson({ a: Infinity }), /cannot_canonicalize_non_finite_number/);
});

test('OfflineGrantSigner creates deterministic HMAC-SHA256 signature', () => {
  const signer = new OfflineGrantSigner({
    keys: { v1: 'test_secret_key_12345678901234567890' }
  });

  const payload: OfflineAuthGrantPayload = {
    grantId: '550e8400-e29b-41d4-a716-446655440000',
    tenantId: 'demo-tenant',
    staffAccountId: 'staff-1',
    authUid: 'cashier_abc123',
    sessionVersion: 1,
    shiftId: 'shift-1',
    installationId: 'inst-1',
    snapshotId: 'snap-1',
    catalogDigest: 'abcdef1234567890',
    issuedAt: 1787387400,
    allowedTenders: ['cash']
  };

  const signed = signer.signGrant(payload, 'v1');
  assert.equal(signed.keyId, 'v1');
  assert.ok(typeof signed.signature === 'string' && signed.signature.length === 64);

  // Re-sign produces identical signature
  const signed2 = signer.signGrant(payload, 'v1');
  assert.equal(signed.signature, signed2.signature);

  // Verification succeeds
  const verifyResult = signer.verifyGrant(signed);
  assert.equal(verifyResult.isValid, true);
  assert.equal(verifyResult.grant?.payload.grantId, payload.grantId);
});

test('OfflineGrantSigner rejects wrong key, wrong keyId, and tampered payload', () => {
  const signer = new OfflineGrantSigner({
    keys: { v1: 'correct_secret_key_1234567890123456' }
  });

  const otherSigner = new OfflineGrantSigner({
    keys: { v1: 'wrong_secret_key_99999999999999999' }
  });

  const payload: OfflineAuthGrantPayload = {
    grantId: 'grant-test',
    tenantId: 'tenant-1',
    staffAccountId: 'staff-1',
    authUid: 'cashier-1',
    sessionVersion: 1,
    shiftId: 'shift-1',
    installationId: 'inst-1',
    snapshotId: 'snap-1',
    catalogDigest: 'digest-1',
    issuedAt: 1000,
    allowedTenders: ['cash']
  };

  const validGrant = signer.signGrant(payload, 'v1');

  // 1. Wrong secret verification fails
  const wrongSecretResult = otherSigner.verifyGrant(validGrant);
  assert.equal(wrongSecretResult.isValid, false);
  assert.equal(wrongSecretResult.error, 'signature_mismatch');

  // 2. Modified payload fails
  const tamperedGrant = {
    ...validGrant,
    payload: {
      ...validGrant.payload,
      sessionVersion: 2 // Modified!
    }
  };
  const tamperedResult = signer.verifyGrant(tamperedGrant);
  assert.equal(tamperedResult.isValid, false);
  assert.equal(tamperedResult.error, 'signature_mismatch');

  // 3. Unknown keyId fails
  const unknownKeyGrant = { ...validGrant, keyId: 'v99' };
  const unknownKeyResult = signer.verifyGrant(unknownKeyGrant);
  assert.equal(unknownKeyResult.isValid, false);
  assert.ok(unknownKeyResult.error?.includes('unknown_key_id'));

  // 4. Malformed signature fails
  const badSigGrant = { ...validGrant, signature: 'deadbeef' };
  const badSigResult = signer.verifyGrant(badSigGrant);
  assert.equal(badSigResult.isValid, false);
});
