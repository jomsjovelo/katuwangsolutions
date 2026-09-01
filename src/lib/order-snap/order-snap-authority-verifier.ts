/**
 * Order Snap Client Authority Certificate Verifier
 *
 * Verifies server-issued ECDSA P-256 / SHA-256 authority certificates
 * using a bundled/trusted public key registry.
 *
 * Standards:
 * - Signature is IEEE-P1363 raw 64-byte r || s (128 hex chars).
 * - Verified against trusted public key registry (never trusting in-band keys).
 * - Deterministic canonical JSON payload verification.
 * - Works in browser WebCrypto and Node.js environments.
 */

import {
  OrderSnapAuthorityCertificate,
  OrderSnapAuthorityCertificateSchema
} from './offline-types';
import { canonicalizeJson } from '../server/order-snap-grant-signer';
import { getTrustedPublicKey, TrustedPublicKeyEntry } from './order-snap-public-keys';

function base64ToUint8Array(base64: string): Uint8Array {
  // Strip PEM headers/footers and whitespace if present
  const cleaned = base64
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');

  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(cleaned, 'base64');
    return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  const binaryString = atob(cleaned);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export interface VerifyCertificateOptions {
  nowSeconds?: number;
  maxClockSkewSeconds?: number;
  trustedRegistry?: Record<string, TrustedPublicKeyEntry>;
}

export interface VerifyCertificateResult {
  isValid: boolean;
  certificate?: OrderSnapAuthorityCertificate;
  error?: string;
}

/**
 * Cryptographically verifies an OrderSnapAuthorityCertificate using ECDSA P-256 / SHA-256.
 */
export async function verifyAuthorityCertificate(
  certificate: unknown,
  options: VerifyCertificateOptions = {}
): Promise<VerifyCertificateResult> {
  if (!certificate || typeof certificate !== 'object') {
    return { isValid: false, error: 'invalid_certificate' };
  }

  let parsedCert: OrderSnapAuthorityCertificate;
  try {
    parsedCert = OrderSnapAuthorityCertificateSchema.parse(certificate) as OrderSnapAuthorityCertificate;
  } catch {
    return { isValid: false, error: 'invalid_certificate_schema' };
  }

  // 1. Resolve trusted public key from registry (fails closed on untrusted keyId)
  const trustedEntry = options.trustedRegistry
    ? options.trustedRegistry[parsedCert.keyId]
    : getTrustedPublicKey(parsedCert.keyId);

  if (!trustedEntry || trustedEntry.algorithm !== 'ES256') {
    return { isValid: false, error: 'untrusted_or_unknown_key_id' };
  }

  // 2. Validate time boundaries:
  // - Strict expiry: expired certificate must NEVER authorize checkout beyond expiresAt.
  // - Skew tolerance: permits up to maxClockSkewSeconds (default 60s) for clock drift on issuedAt.
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = options.maxClockSkewSeconds ?? 60;

  if (now >= parsedCert.payload.expiresAt) {
    return { isValid: false, error: 'certificate_expired' };
  }
  if (parsedCert.payload.issuedAt - skew > now) {
    return { isValid: false, error: 'certificate_issued_in_future' };
  }

  // 3. Deterministic canonical JSON serialization
  let canonicalPayload: string;
  try {
    canonicalPayload = canonicalizeJson(parsedCert.payload);
  } catch {
    return { isValid: false, error: 'payload_canonicalization_failed' };
  }

  const payloadBytes = new TextEncoder().encode(canonicalPayload);
  const sigBytes = hexToUint8Array(parsedCert.signature);

  // 4. Verify signature using WebCrypto (fails closed if Web Crypto unavailable)
  try {
    const spkiBytes = base64ToUint8Array(trustedEntry.spki);

    const subtle = typeof window !== 'undefined' && window.crypto?.subtle
      ? window.crypto.subtle
      : typeof globalThis !== 'undefined' && globalThis.crypto?.subtle
        ? globalThis.crypto.subtle
        : null;

    if (!subtle) {
      return { isValid: false, error: 'web_crypto_unavailable' };
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
      sigBytes as unknown as BufferSource,
      payloadBytes as unknown as BufferSource
    );

    if (!isSigValid) {
      return { isValid: false, error: 'signature_verification_failed' };
    }

    return {
      isValid: true,
      certificate: parsedCert
    };
  } catch {
    return { isValid: false, error: 'cryptographic_verification_error' };
  }
}
