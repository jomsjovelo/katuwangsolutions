export interface WebAuthnConfig {
  rpId: string;
  rpName: string;
  expectedOrigin: string;
  isLocalhost: boolean;
}

/**
 * Retrieves fail-closed WebAuthn environment configuration.
 * Localhost is strictly locked to http://localhost:9002 and rpId 'localhost'.
 * Production requires explicit, validated environment variables.
 */
export function getWebAuthnConfig(env: Record<string, string | undefined> = process.env): WebAuthnConfig {
  const isEmulator = env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' || env.NODE_ENV === 'development';

  if (isEmulator) {
    return {
      rpId: 'localhost',
      rpName: 'Katuwang Cashier (Localhost)',
      expectedOrigin: 'http://localhost:9002',
      isLocalhost: true
    };
  }

  const productionOrigin = env.NEXT_PUBLIC_APP_URL?.trim();
  const productionRpId = env.WEBAUTHN_RP_ID?.trim();

  if (!productionOrigin || !productionRpId) {
    throw new Error('[WEBAUTHN_CONFIG_ERROR] Missing required production WebAuthn configuration (NEXT_PUBLIC_APP_URL or WEBAUTHN_RP_ID).');
  }

  // Reject insecure or placeholder production configurations
  if (!productionOrigin.startsWith('https://')) {
    throw new Error(`[WEBAUTHN_CONFIG_ERROR] Production WebAuthn origin must use HTTPS: ${productionOrigin}`);
  }

  return {
    rpId: productionRpId,
    rpName: 'Katuwang Solutions',
    expectedOrigin: productionOrigin,
    isLocalhost: false
  };
}

export function getWebAuthnChallengeSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.WEBAUTHN_CHALLENGE_HMAC_SECRET_V1;
  if (!secret || secret.trim().length < 32) {
    // In emulator/dev mode fallback to a deterministic test secret if not set
    const isEmulator = env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' || env.NODE_ENV === 'development';
    if (isEmulator) {
      return 'katuwang_local_webauthn_challenge_secret_32bytes_min';
    }
    throw new Error('[WEBAUTHN_SECRET_ERROR] Missing or insufficient WEBAUTHN_CHALLENGE_HMAC_SECRET_V1.');
  }
  return secret.trim();
}
