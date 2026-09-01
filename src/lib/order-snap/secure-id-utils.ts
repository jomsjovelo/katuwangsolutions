/**
 * Order Snap Secure ID & Randomness Utility
 *
 * Provides environment-agnostic secure ID generation that:
 * - Prefers `crypto.randomUUID()` (browser, Node 19+, Deno, Bun)
 * - Falls back to `crypto.getRandomValues()`
 * - Fails closed when secure cryptography is unavailable
 * - Supports dependency injection for deterministic tests
 */

export interface SecureCryptoProvider {
  readonly randomUUID?: () => string;
  readonly getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
}

const DEFAULT_NODE_CRYPTO: SecureCryptoProvider | undefined =
  typeof globalThis !== 'undefined' && (globalThis as { crypto?: SecureCryptoProvider }).crypto
    ? (globalThis as { crypto: SecureCryptoProvider }).crypto
    : undefined;

function resolveCrypto(
  injected?: SecureCryptoProvider
): SecureCryptoProvider {
  if (injected) return injected;
  if (typeof globalThis !== 'undefined') {
    const gc = (globalThis as { crypto?: SecureCryptoProvider }).crypto;
    if (gc && (gc.randomUUID || gc.getRandomValues)) {
      return gc;
    }
  }
  if (typeof window !== 'undefined') {
    const wc = (window as { crypto?: SecureCryptoProvider }).crypto;
    if (wc && (wc.randomUUID || wc.getRandomValues)) {
      return wc;
    }
    const ms = (window as { msCrypto?: SecureCryptoProvider }).msCrypto;
    if (ms && (ms.randomUUID || ms.getRandomValues)) {
      return ms;
    }
  }
  return DEFAULT_NODE_CRYPTO ?? {};
}

export function secureRandomHex(
  byteLength: number,
  crypto?: SecureCryptoProvider
): string {
  const provider = resolveCrypto(crypto);
  if (provider.randomUUID && byteLength === 16) {
    return provider.randomUUID().replace(/-/g, '');
  }
  if (provider.getRandomValues) {
    const arr = new Uint8Array(byteLength);
    provider.getRandomValues(arr);
    let hex = '';
    for (let i = 0; i < arr.length; i++) {
      hex += arr[i].toString(16).padStart(2, '0');
    }
    return hex;
  }
  throw new Error('Secure randomness unavailable');
}

export function generateSecureId(
  prefix: string,
  crypto?: SecureCryptoProvider
): string {
  const provider = resolveCrypto(crypto);
  if (provider.randomUUID) {
    return prefix + provider.randomUUID();
  }
  if (provider.getRandomValues) {
    return prefix + secureRandomHex(16, provider);
  }
  throw new Error('Secure randomness unavailable');
}

/**
 * Builds a deterministic-secure test provider.
 * When `seedHex` is provided, produces repeatable hex output (test-only).
 */
export function createDeterministicTestProvider(seedHex?: string): SecureCryptoProvider {
  if (!seedHex) {
    const counter = { n: 0 };
    return {
      randomUUID: () => {
        counter.n++;
        return `00000000-0000-4000-8000-${counter.n.toString(16).padStart(12, '0')}`;
      }
    };
  }
  return {
    randomUUID: () => seedHex
  };
}
