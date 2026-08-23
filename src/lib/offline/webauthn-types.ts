/**
 * WebAuthn Trusted-Device & Cryptographic Assertion Contracts
 */

export interface ServerTrustedDeviceDoc {
  credentialId: string;                 // Base64URL credential ID string
  credentialIdHash: string;             // SHA-256 of canonical credential ID bytes (hex)
  credentialPublicKeyHash: string;      // SHA-256 of canonical SPKI public key bytes (hex)
  tenantId: string;
  staffAccountId: string;
  authUid: string;
  sessionVersion: number;
  installationId: string;
  deviceName: string;                   // User-provided friendly name (e.g. "Counter 1 Tablet")
  credentialPublicKeyCose: string;      // Canonical Base64URL COSE public key
  publicKeySpki: string;                // Canonical Base64 SPKI public key (for Web Crypto import)
  algorithm: number;                    // -7 (ES256)
  counter: number;
  transports?: string[];
  backupEligible?: boolean;
  backupState?: boolean;
  status: 'active' | 'revoked' | 'superseded';
  revokedAt?: unknown;                  // Firestore Timestamp
  revocationReason?: string;
  createdAt: unknown;                   // Firestore Timestamp
  updatedAt: unknown;                   // Firestore Timestamp
}

export interface TrustedDeviceLocalRecord {
  credentialId: string;                 // Base64URL
  credentialIdHash: string;             // SHA-256 (hex)
  credentialPublicKeyHash: string;      // SHA-256 (hex)
  tenantId: string;
  staffAccountId: string;
  authUid: string;
  installationId: string;
  deviceName: string;
  publicKeySpki: string;                // Base64 SPKI
  algorithm: number;                    // -7 (ES256)
  counter: number;
  rpId: string;
  registeredAt: number;
}

export interface WebAuthnChallengeCookiePayload {
  challenge: string;                    // Base64URL challenge
  tenantId: string;
  staffAccountId: string;
  authUid: string;
  sessionVersion: number;
  installationId: string;
  rpId: string;
  origin: string;
  createdAt: number;                    // Epoch ms
  expiresAt: number;                    // Epoch ms (5 min lifetime)
}

export interface WebAuthnRegistrationOptionsResponse {
  options: any;                         // PublicKeyCredentialCreationOptionsJSON
  deviceNameSuggested: string;
}

export interface WebAuthnRegistrationVerifyRequest {
  response: any;                        // RegistrationResponseJSON
  deviceName: string;
}

export interface WebAuthnRegistrationVerifyResponse {
  success: boolean;
  trustedDevice: {
    credentialId: string;
    credentialIdHash: string;
    credentialPublicKeyHash: string;
    deviceName: string;
    publicKeySpki: string;
    algorithm: number;
    counter: number;
    rpId: string;
  };
}

export interface OfflineWebAuthnAssertionResult {
  isValid: boolean;
  error?: string;
  newCounter?: number;
  warning?: string;
}
