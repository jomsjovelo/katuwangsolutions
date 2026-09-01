/**
 * Strict ASN.1 DER ECDSA Signature Parser for WebAuthn ES256 Assertions
 *
 * Real WebAuthn authenticators conforming to W3C WebAuthn Level 2/3 return
 * ECDSA P-256 signatures encoded as ASN.1 DER:
 *   ECDSA-Sig-Value ::= SEQUENCE {
 *     r     INTEGER,
 *     s     INTEGER
 *   }
 *
 * WebCrypto API (crypto.subtle.verify) expects raw IEEE-P1363 format (r || s, 64 bytes).
 * This module strictly parses canonical DER (r, s) integers and converts them to 64-byte P1363.
 *
 * Enforces:
 * - Reject non-SEQUENCE root tag (0x30).
 * - Reject trailing bytes or invalid sequence lengths.
 * - Reject non-INTEGER tags (0x02).
 * - Reject negative integers (MSB = 1 without 0x00 prefix).
 * - Reject noncanonical DER encodings (e.g. redundant leading zeros).
 * - Reject oversized integers (> 33 bytes or > 32 bytes without positive sign prefix).
 * - Reject raw 64-byte IEEE-P1363 signatures passed directly as WebAuthn assertion signatures.
 */

export interface ParsedEcdsaSignature {
  readonly r: Uint8Array; // Exactly 32 bytes
  readonly s: Uint8Array; // Exactly 32 bytes
  readonly p1363: Uint8Array; // Exactly 64 bytes (r || s)
}

export function parseWebAuthnDerSignature(derBytes: Uint8Array): ParsedEcdsaSignature {
  if (!derBytes || !(derBytes instanceof Uint8Array) || derBytes.length < 8) {
    throw new Error('malformed_der_signature_too_short');
  }

  // Reject raw 64-byte P1363 assertion signatures directly (must be valid ASN.1 DER)
  if (derBytes.length === 64 && derBytes[0] !== 0x30) {
    throw new Error('raw_p1363_webauthn_assertion_rejected_must_be_der');
  }

  let offset = 0;

  // 1. SEQUENCE Tag (0x30)
  if (derBytes[offset++] !== 0x30) {
    throw new Error('invalid_der_root_tag_expected_sequence');
  }

  // 2. SEQUENCE Length
  let seqLen = derBytes[offset++];
  if (seqLen === 0x81) {
    seqLen = derBytes[offset++];
    if (seqLen < 128) {
      throw new Error('noncanonical_der_sequence_length_encoding');
    }
  } else if (seqLen > 0x81) {
    throw new Error('der_sequence_length_exceeds_supported_range');
  }

  if (offset + seqLen !== derBytes.length) {
    throw new Error('der_sequence_length_mismatch_or_trailing_bytes');
  }

  // Helper to parse canonical ASN.1 DER integer (r or s)
  function parseInteger(): Uint8Array {
    if (offset >= derBytes.length) {
      throw new Error('unexpected_end_of_der_data');
    }

    const tag = derBytes[offset++];
    if (tag !== 0x02) {
      throw new Error(`invalid_der_integer_tag_expected_0x02_got_${tag}`);
    }

    const len = derBytes[offset++];
    if (len === 0 || offset + len > derBytes.length) {
      throw new Error('invalid_der_integer_length');
    }

    const intBytes = derBytes.subarray(offset, offset + len);
    offset += len;

    // Canonical DER integer checks:
    // A. Negative integer check: If high bit of first byte is set, integer is negative -> invalid for ECDSA
    if ((intBytes[0] & 0x80) !== 0) {
      throw new Error('negative_der_integer_not_allowed');
    }

    // B. Leading zero check (DER canonicality):
    // If first byte is 0x00:
    // - Length must be > 1
    // - Second byte MUST have high bit set (>= 0x80) to justify the 0x00 padding byte.
    if (intBytes[0] === 0x00) {
      if (intBytes.length === 1) {
        // Single 0x00 byte is allowed (value 0)
      } else if ((intBytes[1] & 0x80) === 0) {
        throw new Error('noncanonical_der_redundant_leading_zero');
      }
    }

    // Strip leading 0x00 if present
    let raw = intBytes;
    if (raw.length > 32 && raw[0] === 0x00) {
      raw = raw.subarray(1);
    }

    // ECDSA P-256 scalar must not exceed 32 bytes (256 bits)
    if (raw.length > 32) {
      throw new Error('der_integer_oversized_for_p256');
    }

    // Zero-pad to 32 bytes if shorter
    if (raw.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(raw, 32 - raw.length);
      return padded;
    }

    return new Uint8Array(raw);
  }

  // 3. Parse r and s
  const r = parseInteger();
  const s = parseInteger();

  // 4. Ensure no trailing bytes in SEQUENCE
  if (offset !== derBytes.length) {
    throw new Error('trailing_bytes_in_der_sequence');
  }

  // 5. Combine into IEEE-P1363 (64 bytes: r[32] || s[32])
  const p1363 = new Uint8Array(64);
  p1363.set(r, 0);
  p1363.set(s, 32);

  return { r, s, p1363 };
}
