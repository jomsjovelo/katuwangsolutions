import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  derToP1363,
  getWebAuthnClientVerifier,
  uint8ArrayToBase64Url,
  base64UrlToUint8Array
} from '../src/lib/client/webauthn-client-verifier';
import { TrustedDeviceLocalRecord } from '../src/lib/offline/webauthn-types';

test('WebAuthn ASN.1 DER to IEEE P1363 Signature Conversion', () => {
  // Test vector: r (32 bytes), s (32 bytes) wrapped in ASN.1 DER SEQUENCE
  const r = crypto.randomBytes(32);
  const s = crypto.randomBytes(32);

  // Encode in DER: 0x30 [len] 0x02 [rLen] [r] 0x02 [sLen] [s]
  const der = Buffer.concat([
    Buffer.from([0x30, 2 + 32 + 2 + 32]),
    Buffer.from([0x02, 32]),
    r,
    Buffer.from([0x02, 32]),
    s
  ]);

  const p1363 = derToP1363(new Uint8Array(der));
  assert.equal(p1363.length, 64, 'Output IEEE P1363 signature must be exactly 64 bytes');
  assert.deepEqual(Buffer.from(p1363.subarray(0, 32)), r);
  assert.deepEqual(Buffer.from(p1363.subarray(32, 64)), s);

  // Test vector with leading 0x00 padding (33 bytes r)
  const rWithZero = Buffer.concat([Buffer.from([0x00]), r]);
  const derWithZero = Buffer.concat([
    Buffer.from([0x30, 2 + 33 + 2 + 32]),
    Buffer.from([0x02, 33]),
    rWithZero,
    Buffer.from([0x02, 32]),
    s
  ]);

  const p1363Padded = derToP1363(new Uint8Array(derWithZero));
  assert.equal(p1363Padded.length, 64);
  assert.deepEqual(Buffer.from(p1363Padded.subarray(0, 32)), r);
  assert.deepEqual(Buffer.from(p1363Padded.subarray(32, 64)), s);
});

test('WebAuthn Client Offline Verifier: Validates assertion, UP/UV flags, counter, and cryptographic signature', async () => {
  const verifier = getWebAuthnClientVerifier();

  // Generate ECDSA P-256 key pair using Node.js crypto
  const keyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256'
  });

  const spkiDer = keyPair.publicKey.export({ type: 'spki', format: 'der' });
  const spkiBase64 = spkiDer.toString('base64');

  const trustedDevice: TrustedDeviceLocalRecord = {
    credentialId: 'test_cred_id_base64url',
    credentialIdHash: 'test_cred_hash',
    tenantId: 'tenant_1',
    staffAccountId: 'staff_1',
    authUid: 'uid_1',
    installationId: 'inst_1',
    deviceName: 'Test Terminal',
    publicKeySpki: spkiBase64,
    algorithm: -7, // ES256
    counter: 5,
    rpId: 'localhost',
    registeredAt: Date.now()
  };

  const challengeBytes = verifier.generateLocalChallenge();
  const challengeBase64Url = uint8ArrayToBase64Url(challengeBytes);

  // Create clientDataJSON
  const clientData = {
    type: 'webauthn.get',
    challenge: challengeBase64Url,
    origin: 'http://localhost:9002'
  };
  const clientDataBytes = new TextEncoder().encode(JSON.stringify(clientData));
  const clientDataHash = crypto.createHash('sha256').update(clientDataBytes).digest();

  // Create authenticatorData:
  // bytes 0..31: RP ID SHA-256 hash
  // byte 32: flags (0x01 UP + 0x04 UV = 0x05)
  // bytes 33..36: counter (e.g. 10)
  const rpIdHash = crypto.createHash('sha256').update('localhost').digest();
  const flags = 0x05; // User Present + User Verified
  const counterBuffer = Buffer.from([0x00, 0x00, 0x00, 0x0a]); // Counter = 10

  const authDataBuffer = Buffer.concat([rpIdHash, Buffer.from([flags]), counterBuffer]);
  const authDataBytes = new Uint8Array(authDataBuffer);

  // Sign authenticatorData || clientDataHash
  const signedData = Buffer.concat([authDataBuffer, clientDataHash]);
  const sign = crypto.createSign('SHA256');
  sign.update(signedData);
  const derSignature = sign.sign(keyPair.privateKey);
  const derSigBytes = new Uint8Array(derSignature);

  // 1. Positive Verification Test
  const validAssertion = {
    response: {
      clientDataJSON: clientDataBytes.buffer.slice(clientDataBytes.byteOffset, clientDataBytes.byteOffset + clientDataBytes.byteLength),
      authenticatorData: authDataBytes.buffer.slice(authDataBytes.byteOffset, authDataBytes.byteOffset + authDataBytes.byteLength),
      signature: derSigBytes.buffer.slice(derSigBytes.byteOffset, derSigBytes.byteOffset + derSigBytes.byteLength)
    }
  };

  const result = await verifier.verifyOfflineAssertion(
    validAssertion,
    challengeBytes,
    trustedDevice,
    'http://localhost:9002'
  );

  assert.equal(result.isValid, true);
  assert.equal(result.newCounter, 10);

  // 2. Negative Test: Mismatched Challenge
  const wrongChallengeBytes = verifier.generateLocalChallenge();
  const wrongChallengeResult = await verifier.verifyOfflineAssertion(
    validAssertion,
    wrongChallengeBytes,
    trustedDevice,
    'http://localhost:9002'
  );
  assert.equal(wrongChallengeResult.isValid, false);
  assert.ok(wrongChallengeResult.error?.includes('Challenge mismatch'));

  // 3. Negative Test: Missing User Verification (UV) flag
  const missingUvAuthData = Buffer.concat([rpIdHash, Buffer.from([0x01]), counterBuffer]); // Only UP, no UV
  const signMissingUv = crypto.createSign('SHA256');
  signMissingUv.update(Buffer.concat([missingUvAuthData, clientDataHash]));
  const missingUvSig = signMissingUv.sign(keyPair.privateKey);
  const missingUvSigBytes = new Uint8Array(missingUvSig);
  const missingUvAuthBytes = new Uint8Array(missingUvAuthData);

  const missingUvAssertion = {
    response: {
      clientDataJSON: clientDataBytes.buffer.slice(clientDataBytes.byteOffset, clientDataBytes.byteOffset + clientDataBytes.byteLength),
      authenticatorData: missingUvAuthBytes.buffer.slice(missingUvAuthBytes.byteOffset, missingUvAuthBytes.byteOffset + missingUvAuthBytes.byteLength),
      signature: missingUvSigBytes.buffer.slice(missingUvSigBytes.byteOffset, missingUvSigBytes.byteOffset + missingUvSigBytes.byteLength)
    }
  };

  const missingUvResult = await verifier.verifyOfflineAssertion(
    missingUvAssertion,
    challengeBytes,
    trustedDevice,
    'http://localhost:9002'
  );
  assert.equal(missingUvResult.isValid, false);
  assert.ok(missingUvResult.error?.includes('User Verification'));

  // 4. Negative Test: Counter Clone Detection (returned counter <= stored counter)
  const staleCounterBuffer = Buffer.from([0x00, 0x00, 0x00, 0x03]); // Counter = 3 <= stored 5
  const staleAuthData = Buffer.concat([rpIdHash, Buffer.from([flags]), staleCounterBuffer]);
  const signStale = crypto.createSign('SHA256');
  signStale.update(Buffer.concat([staleAuthData, clientDataHash]));
  const staleSig = signStale.sign(keyPair.privateKey);
  const staleSigBytes = new Uint8Array(staleSig);
  const staleAuthBytes = new Uint8Array(staleAuthData);

  const staleAssertion = {
    response: {
      clientDataJSON: clientDataBytes.buffer.slice(clientDataBytes.byteOffset, clientDataBytes.byteOffset + clientDataBytes.byteLength),
      authenticatorData: staleAuthBytes.buffer.slice(staleAuthBytes.byteOffset, staleAuthBytes.byteOffset + staleAuthBytes.byteLength),
      signature: staleSigBytes.buffer.slice(staleSigBytes.byteOffset, staleSigBytes.byteOffset + staleSigBytes.byteLength)
    }
  };

  const staleResult = await verifier.verifyOfflineAssertion(
    staleAssertion,
    challengeBytes,
    trustedDevice,
    'http://localhost:9002'
  );
  assert.equal(staleResult.isValid, false);
  assert.ok(staleResult.error?.includes('clone detected'));
});
