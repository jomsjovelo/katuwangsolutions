/**
 * Order Snap Trusted Public Key Registry
 *
 * Provides client-side trusted public keys for offline certificate verification.
 * The production registry is immutable after module initialization and sourced only
 * from audited build-time configuration.
 *
 * Client verification NEVER trusts public keys received in network responses,
 * stored in mutable IndexedDB, or supplied via public runtime setters.
 */

export interface TrustedPublicKeyEntry {
  readonly algorithm: 'ES256';
  readonly spki: string; // Base64 or PEM formatted SPKI public key
}

/**
 * Built-in immutable trusted public key registry mapping keyId -> TrustedPublicKeyEntry.
 * Sourced strictly at module load from audited build configuration.
 */
function buildProductionTrustedRegistry(): Readonly<Record<string, TrustedPublicKeyEntry>> {
  const registry: Record<string, TrustedPublicKeyEntry> = {};

  // Standard v2 build configuration
  const v2Key =
    typeof process !== 'undefined' &&
    process.env?.NEXT_PUBLIC_ORDER_SNAP_AUTHORITY_PUBLIC_KEY_V2
      ? process.env.NEXT_PUBLIC_ORDER_SNAP_AUTHORITY_PUBLIC_KEY_V2.trim()
      : '';

  if (v2Key) {
    registry['v2'] = Object.freeze({
      algorithm: 'ES256',
      spki: v2Key
    });
  }

  return Object.freeze(registry);
}

const PRODUCTION_TRUSTED_REGISTRY: Readonly<Record<string, TrustedPublicKeyEntry>> =
  buildProductionTrustedRegistry();

/**
 * Retrieves the trusted public key entry for a specific keyId from the immutable production registry.
 * Fails closed if the keyId is not registered, inactive, or algorithm is unsupported.
 */
export function getTrustedPublicKey(keyId: string): TrustedPublicKeyEntry | null {
  if (!keyId || typeof keyId !== 'string') return null;
  const entry = PRODUCTION_TRUSTED_REGISTRY[keyId];
  if (!entry) return null;
  if (entry.algorithm !== 'ES256') return null;
  if (!entry.spki || typeof entry.spki !== 'string' || entry.spki.trim().length === 0) return null;
  return entry;
}

/**
 * Validates whether the Order Snap offline authority trust root is properly configured in the current build.
 * Returns true if valid trusted public key(s) are present; false otherwise (fail-closed).
 * Used by the Order Snap controller to disable offline authority without breaking unrelated Katuwang modules.
 */
export function isOrderSnapOfflineAuthorityConfigured(): boolean {
  const keys = Object.keys(PRODUCTION_TRUSTED_REGISTRY);
  if (keys.length === 0) return false;
  return keys.some((k) => getTrustedPublicKey(k) !== null);
}
