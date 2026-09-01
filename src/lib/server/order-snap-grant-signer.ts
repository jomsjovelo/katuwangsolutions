import { createHmac, timingSafeEqual } from 'crypto';
import {
  OrderSnapAuthorityGrant,
  OrderSnapAuthorityGrantPayload,
  OrderSnapAuthorityGrantSchema,
  ORDER_SNAP_GRANT_KEY_ID_V1
} from '../order-snap/offline-types';

/**
 * Strict canonical JSON serializer for Order Snap offline authority grant signing.
 * Recursively orders keys lexicographically and strictly validates that
 * all numbers are finite integers/floats (rejects NaN, Infinity, and undefined).
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`cannot_canonicalize_non_finite_number: ${value}`);
    }
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const elements = value.map((el) => canonicalizeJson(el));
    return `[${elements.join(',')}]`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const pairs: string[] = [];

    for (const key of sortedKeys) {
      const val = record[key];
      if (val !== undefined) {
        pairs.push(`${JSON.stringify(key)}:${canonicalizeJson(val)}`);
      }
    }

    return `{${pairs.join(',')}}`;
  }

  throw new Error(`unsupported_type_for_canonicalization: ${typeof value}`);
}

/**
 * Normalize a signing secret: trim leading/trailing ASCII whitespace only.
 * This is the single canonical normalization rule applied identically at sign and verify.
 */
function normalizeSecret(raw: string): string {
  return raw.replace(/^[\x20\x09\x0A\x0D]+|[\x20\x09\x0A\x0D]+$/g, '');
}

/**
 * Returns true only when the normalized secret is at least 32 UTF-8 bytes.
 */
function isSecretSufficient(normalized: string): boolean {
  return Buffer.byteLength(normalized, 'utf8') >= 32;
}

export interface OrderSnapGrantSignerOptions {
  keys?: Record<string, string>; // Map of keyId -> secret
  defaultKeyId?: string;
  env?: Record<string, string | undefined>;
}

/**
 * Dedicated server-side signer and constant-time verifier for Order Snap Offline Authority Grants.
 * Strictly uses dedicated Order Snap secrets (ORDER_SNAP_OFFLINE_GRANT_SECRET_V1)
 * and never reuses Benta offline secrets or rate-limit secrets.
 */
export class OrderSnapGrantSigner {
  private keys: Record<string, string>;
  private defaultKeyId: string;

  constructor(options: OrderSnapGrantSignerOptions = {}) {
    this.defaultKeyId = options.defaultKeyId || ORDER_SNAP_GRANT_KEY_ID_V1;
    this.keys = { ...options.keys };

    const env = options.env || process.env;

    // Resolve from environment if not explicitly injected
    if (!this.keys[ORDER_SNAP_GRANT_KEY_ID_V1] && env?.ORDER_SNAP_OFFLINE_GRANT_SECRET_V1) {
      this.keys[ORDER_SNAP_GRANT_KEY_ID_V1] = env.ORDER_SNAP_OFFLINE_GRANT_SECRET_V1;
    }
  }

  /**
   * Signs an OrderSnapAuthorityGrantPayload using HMAC-SHA256 over strict canonical JSON.
   */
  public signGrant(
    payload: OrderSnapAuthorityGrantPayload,
    keyId: string = this.defaultKeyId
  ): OrderSnapAuthorityGrant {
    const raw = this.keys[keyId];
    if (!raw || typeof raw !== 'string') {
      throw new Error('order_snap_grant_signing_unavailable');
    }
    const normalized = normalizeSecret(raw);
    if (!isSecretSufficient(normalized)) {
      throw new Error('order_snap_grant_signing_unavailable');
    }

    const canonical = canonicalizeJson(payload);
    const signature = createHmac('sha256', normalized).update(canonical, 'utf8').digest('hex');

    return {
      payload,
      signature,
      keyId
    };
  }

  /**
   * Verifies an OrderSnapAuthorityGrant in constant time.
   * Validates schema, keyId, cryptographic HMAC-SHA256 signature, and optional expiry time.
   * Public error strings never include key IDs, signatures, or internal validation details.
   */
  public verifyGrant(
    grant: unknown,
    options: { nowSeconds?: number; maxClockSkewSeconds?: number } = {}
  ): { isValid: boolean; grant?: OrderSnapAuthorityGrant; error?: string } {
    if (!grant || typeof grant !== 'object') {
      return { isValid: false, error: 'invalid_grant' };
    }

    let parsedGrant: OrderSnapAuthorityGrant;
    try {
      parsedGrant = OrderSnapAuthorityGrantSchema.parse(grant) as OrderSnapAuthorityGrant;
    } catch {
      // Do not surface Zod messages externally
      return { isValid: false, error: 'invalid_grant' };
    }

    const raw = this.keys[parsedGrant.keyId];
    if (!raw || typeof raw !== 'string') {
      return { isValid: false, error: 'invalid_grant' };
    }
    const normalized = normalizeSecret(raw);
    if (!isSecretSufficient(normalized)) {
      return { isValid: false, error: 'invalid_grant' };
    }

    try {
      const canonical = canonicalizeJson(parsedGrant.payload);
      const expectedSignature = createHmac('sha256', normalized).update(canonical, 'utf8').digest('hex');

      const sigBuffer = Buffer.from(parsedGrant.signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
        return { isValid: false, error: 'invalid_grant' };
      }

      if (options.nowSeconds !== undefined) {
        const skew = options.maxClockSkewSeconds ?? 60;
        if (parsedGrant.payload.expiresAt + skew < options.nowSeconds) {
          return { isValid: false, error: 'grant_expired' };
        }
        if (parsedGrant.payload.issuedAt - skew > options.nowSeconds) {
          return { isValid: false, error: 'grant_issued_in_future' };
        }
      }

      return {
        isValid: true,
        grant: parsedGrant
      };
    } catch {
      return { isValid: false, error: 'invalid_grant' };
    }
  }
}

let globalOrderSnapSigner: OrderSnapGrantSigner | null = null;

export function getOrderSnapGrantSigner(): OrderSnapGrantSigner {
  if (!globalOrderSnapSigner) {
    globalOrderSnapSigner = new OrderSnapGrantSigner();
  }
  return globalOrderSnapSigner;
}
