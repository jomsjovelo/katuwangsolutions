import {
  TrustedDeviceLocalRecord,
  OfflineWebAuthnAssertionResult
} from '../offline/webauthn-types';

/**
 * Converts standard WebAuthn ASN.1 DER-encoded ECDSA signature to IEEE P1363 (64-byte raw r || s)
 * required by the W3C Web Crypto API.
 */
export function derToP1363(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) {
    throw new Error('Invalid ASN.1 DER sequence header');
  }

  let offset = 2;
  if (der[1] & 0x80) {
    const lenBytes = der[1] & 0x7f;
    offset = 2 + lenBytes;
  }

  // Parse r
  if (der[offset] !== 0x02) throw new Error('Invalid ASN.1 DER integer tag for r');
  offset++;
  const rLen = der[offset++];
  let r = der.subarray(offset, offset + rLen);
  offset += rLen;

  // Trim leading zero padding if 33 bytes
  if (r.length === 33 && r[0] === 0x00) {
    r = r.subarray(1);
  }

  // Parse s
  if (der[offset] !== 0x02) throw new Error('Invalid ASN.1 DER integer tag for s');
  offset++;
  const sLen = der[offset++];
  let s = der.subarray(offset, offset + sLen);

  // Trim leading zero padding if 33 bytes
  if (s.length === 33 && s[0] === 0x00) {
    s = s.subarray(1);
  }

  const p1363 = new Uint8Array(64);
  // Copy r right-aligned into first 32 bytes
  p1363.set(r, 32 - r.length);
  // Copy s right-aligned into second 32 bytes
  p1363.set(s, 64 - s.length);

  return p1363;
}

/**
 * Helper to convert Base64URL string to Uint8Array buffer.
 */
export function base64UrlToUint8Array(base64url: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64url, 'base64'));
  }
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Helper to convert Uint8Array to Base64URL string.
 */
export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class WebAuthnClientVerifier {
  /**
   * Generates a fresh 32-byte cryptographic random challenge buffer in client memory.
   */
  public generateLocalChallenge(): Uint8Array {
    const challenge = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(challenge);
    } else {
      for (let i = 0; i < 32; i++) challenge[i] = Math.floor(Math.random() * 256);
    }
    return challenge;
  }

  /**
   * Initiates browser WebAuthn assertion ceremony for offline re-entry.
   */
  public async performAssertionCeremony(
    trustedDevice: TrustedDeviceLocalRecord,
    challengeBytes: Uint8Array
  ): Promise<any> {
    if (typeof navigator === 'undefined' || !navigator.credentials?.get) {
      throw new Error('WebAuthn ay hindi suportado sa browser o device na ito.');
    }

    const credentialIdBytes = base64UrlToUint8Array(trustedDevice.credentialId);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challengeBytes as unknown as BufferSource,
        rpId: trustedDevice.rpId,
        allowCredentials: [
          {
            id: credentialIdBytes as unknown as BufferSource,
            type: 'public-key'
          }
        ],
        userVerification: 'required',
        timeout: 60000
      }
    });

    if (!assertion) {
      throw new Error('Walang natanggap na assertion response mula sa device.');
    }

    return assertion;
  }

  /**
   * Verifies WebAuthn assertion response locally offline using Web Crypto API.
   * Enforces challenge, origin, RP ID hash, UP/UV flags, counter rules, and cryptographic signature.
   */
  public async verifyOfflineAssertion(
    assertionResponse: {
      rawId?: ArrayBuffer;
      id?: string;
      response: {
        clientDataJSON: ArrayBuffer;
        authenticatorData: ArrayBuffer;
        signature: ArrayBuffer;
      };
    },
    expectedChallengeBytes: Uint8Array,
    trustedDevice: TrustedDeviceLocalRecord,
    expectedOrigin?: string
  ): Promise<OfflineWebAuthnAssertionResult> {
    try {
      const { clientDataJSON, authenticatorData, signature } = assertionResponse.response;

      // 1. Verify clientDataJSON
      const clientDataStr = new TextDecoder('utf-8').decode(new Uint8Array(clientDataJSON));
      const clientData = JSON.parse(clientDataStr);

      if (clientData.type !== 'webauthn.get') {
        return { isValid: false, error: 'Invalid clientData type: expected webauthn.get' };
      }

      const returnedChallengeBase64Url = clientData.challenge;
      const expectedChallengeBase64Url = uint8ArrayToBase64Url(expectedChallengeBytes);

      if (returnedChallengeBase64Url !== expectedChallengeBase64Url) {
        return { isValid: false, error: 'Challenge mismatch: returned challenge does not match local challenge' };
      }

      const validOrigin = expectedOrigin || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9002');
      if (clientData.origin !== validOrigin) {
        return { isValid: false, error: `Origin mismatch: expected ${validOrigin}, got ${clientData.origin}` };
      }

      // 2. Parse & Verify authenticatorData
      const authDataBytes = new Uint8Array(authenticatorData);
      if (authDataBytes.length < 37) {
        return { isValid: false, error: 'Malformed authenticatorData: length < 37 bytes' };
      }

      // RP ID SHA-256 Hash check (bytes 0..31)
      const rpIdBuffer = new TextEncoder().encode(trustedDevice.rpId);
      const expectedRpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', rpIdBuffer as unknown as BufferSource));
      const returnedRpIdHash = authDataBytes.subarray(0, 32);

      for (let i = 0; i < 32; i++) {
        if (returnedRpIdHash[i] !== expectedRpIdHash[i]) {
          return { isValid: false, error: 'RP ID hash mismatch in authenticator data' };
        }
      }

      // Flags check (byte 32)
      const flags = authDataBytes[32];
      const userPresent = (flags & 0x01) !== 0;     // Bit 0: UP
      const userVerified = (flags & 0x04) !== 0;    // Bit 2: UV

      if (!userPresent) {
        return { isValid: false, error: 'User Presence (UP) flag was not set by authenticator' };
      }
      if (!userVerified) {
        return { isValid: false, error: 'User Verification (UV) flag was not set by authenticator' };
      }

      // Signature Counter check (bytes 33..36, Big-Endian)
      const counter = (authDataBytes[33] << 24) | (authDataBytes[34] << 16) | (authDataBytes[35] << 8) | authDataBytes[36];
      const storedCounter = trustedDevice.counter || 0;

      // When non-zero counter is used, require strictly increasing counter
      if (counter > 0 && storedCounter > 0 && counter <= storedCounter) {
        return {
          isValid: false,
          error: `Potential authenticator clone detected: returned counter ${counter} <= stored counter ${storedCounter}`
        };
      }

      // 3. Cryptographic Signature Verification
      const clientDataHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSON as unknown as BufferSource));
      const signedData = new Uint8Array(authDataBytes.length + clientDataHash.length);
      signedData.set(authDataBytes, 0);
      signedData.set(clientDataHash, authDataBytes.length);

      const spkiBytes = base64UrlToUint8Array(trustedDevice.publicKeySpki);

      let isSignatureValid = false;

      if (trustedDevice.algorithm === -7) {
        // ES256 (ECDSA P-256)
        const cryptoKey = await crypto.subtle.importKey(
          'spki',
          spkiBytes as unknown as BufferSource,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['verify']
        );

        const rawSignatureBytes = new Uint8Array(signature);
        // If ASN.1 DER (starts with 0x30), convert to IEEE P1363
        const p1363Sig = rawSignatureBytes[0] === 0x30 ? derToP1363(rawSignatureBytes) : rawSignatureBytes;

        isSignatureValid = await crypto.subtle.verify(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          cryptoKey,
          p1363Sig as unknown as BufferSource,
          signedData as unknown as BufferSource
        );
      } else if (trustedDevice.algorithm === -257) {
        // RS256 (RSASSA-PKCS1-v1_5)
        const cryptoKey = await crypto.subtle.importKey(
          'spki',
          spkiBytes as unknown as BufferSource,
          { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
          false,
          ['verify']
        );

        isSignatureValid = await crypto.subtle.verify(
          { name: 'RSASSA-PKCS1-v1_5' },
          cryptoKey,
          signature as unknown as BufferSource,
          signedData as unknown as BufferSource
        );
      } else {
        return { isValid: false, error: `Unsupported WebAuthn algorithm: ${trustedDevice.algorithm}` };
      }

      if (!isSignatureValid) {
        return { isValid: false, error: 'WebAuthn cryptographic signature verification failed' };
      }

      return {
        isValid: true,
        newCounter: counter
      };
    } catch (err: any) {
      return { isValid: false, error: err.message || 'Error during offline WebAuthn verification' };
    }
  }
}

let globalClientVerifier: WebAuthnClientVerifier | null = null;

export function getWebAuthnClientVerifier(): WebAuthnClientVerifier {
  if (!globalClientVerifier) {
    globalClientVerifier = new WebAuthnClientVerifier();
  }
  return globalClientVerifier;
}

/**
 * Native browser WebAuthn registration initiator.
 */
export async function startWebAuthnRegistration(options: any): Promise<any> {
  if (typeof navigator === 'undefined' || !navigator.credentials?.create) {
    throw new Error('WebAuthn is not supported in this browser/device.');
  }

  const challengeBytes = base64UrlToUint8Array(options.challenge);
  const userIdBytes = base64UrlToUint8Array(options.user.id);

  const publicKey: any = {
    challenge: challengeBytes,
    rp: options.rp,
    user: {
      ...options.user,
      id: userIdBytes
    },
    pubKeyCredParams: options.pubKeyCredParams,
    authenticatorSelection: options.authenticatorSelection,
    timeout: options.timeout || 60000,
    attestation: options.attestation || 'none'
  };

  const credential: any = await navigator.credentials.create({ publicKey });
  if (!credential) {
    throw new Error('Registration ceremony canceled or returned null.');
  }

  return {
    id: credential.id,
    rawId: uint8ArrayToBase64Url(new Uint8Array(credential.rawId)),
    type: credential.type,
    response: {
      clientDataJSON: uint8ArrayToBase64Url(new Uint8Array(credential.response.clientDataJSON)),
      attestationObject: uint8ArrayToBase64Url(new Uint8Array(credential.response.attestationObject)),
      transports: credential.response.getTransports ? credential.response.getTransports() : undefined,
      publicKeyAlgorithm: options.pubKeyCredParams?.[0]?.alg || -7
    }
  };
}
