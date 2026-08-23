import { createHmac, timingSafeEqual } from 'crypto';
import {
  OfflineAuthGrant,
  OfflineAuthGrantPayload,
  OFFLINE_GRANT_KEY_ID_V1
} from '@/lib/offline/offline-types';

/**
 * Strict canonical JSON serializer for offline grant signing.
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

export interface OfflineGrantSignerOptions {
  keys?: Record<string, string>;       // Map of keyId -> secret
  defaultKeyId?: string;
}

/**
 * Dedicated server-side signer and constant-time verifier for Offline Authorization Grants.
 * Strictly uses dedicated offline grant secrets (e.g. OFFLINE_GRANT_HMAC_SECRET_V1)
 * and never reuses rate-limit or PIN pepper secrets.
 */
export class OfflineGrantSigner {
  private keys: Record<string, string>;
  private defaultKeyId: string;

  constructor(options: OfflineGrantSignerOptions = {}) {
    this.defaultKeyId = options.defaultKeyId || OFFLINE_GRANT_KEY_ID_V1;
    this.keys = { ...options.keys };

    // Resolve from environment if not explicitly injected
    if (!this.keys[OFFLINE_GRANT_KEY_ID_V1] && process.env.OFFLINE_GRANT_HMAC_SECRET_V1) {
      this.keys[OFFLINE_GRANT_KEY_ID_V1] = process.env.OFFLINE_GRANT_HMAC_SECRET_V1;
    }
  }

  /**
   * Signs an OfflineAuthGrantPayload using HMAC-SHA256 over strict canonical JSON.
   */
  signGrant(payload: OfflineAuthGrantPayload, keyId: string = this.defaultKeyId): OfflineAuthGrant {
    const secret = this.keys[keyId];
    if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
      throw new Error(`offline_grant_signer_key_unavailable: ${keyId}`);
    }

    const canonical = canonicalizeJson(payload);
    const signature = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');

    return {
      payload,
      signature,
      keyId
    };
  }

  /**
   * Verifies an OfflineAuthGrant in constant time.
   * Returns true if and only if the signature is valid for the given payload and keyId.
   */
  verifyGrant(grant: unknown): { isValid: boolean; grant?: OfflineAuthGrant; error?: string } {
    if (!grant || typeof grant !== 'object') {
      return { isValid: false, error: 'invalid_grant_structure' };
    }

    const g = grant as Partial<OfflineAuthGrant>;
    if (!g.payload || typeof g.payload !== 'object' || typeof g.signature !== 'string' || typeof g.keyId !== 'string') {
      return { isValid: false, error: 'missing_grant_fields' };
    }

    const secret = this.keys[g.keyId];
    if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
      return { isValid: false, error: `unknown_key_id: ${g.keyId}` };
    }

    try {
      const canonical = canonicalizeJson(g.payload);
      const expectedSignature = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');

      const sigBuffer = Buffer.from(g.signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
        return { isValid: false, error: 'signature_mismatch' };
      }

      return {
        isValid: true,
        grant: {
          payload: g.payload as OfflineAuthGrantPayload,
          signature: g.signature,
          keyId: g.keyId
        }
      };
    } catch (err: any) {
      return { isValid: false, error: err.message || 'verification_failed' };
    }
  }
}

let globalSigner: OfflineGrantSigner | null = null;

export function getOfflineGrantSigner(): OfflineGrantSigner {
  if (!globalSigner) {
    globalSigner = new OfflineGrantSigner();
  }
  return globalSigner;
}
