/**
 * Order Snap Asymmetric Authority Certificate Signer
 *
 * Implements ECDSA P-256 / SHA-256 signing for Order Snap authority certificates.
 * Enforces IEEE-P1363 signature encoding (raw 64-byte r || s as 128 hex characters).
 * Deterministically signs only the canonicalized payload.
 *
 * Private keys are server-only environment configuration and are never logged, returned, or persisted to client DB.
 */

import crypto from 'node:crypto';
import {
  OrderSnapAuthorityCertificate,
  OrderSnapAuthorityCertificatePayload,
  OrderSnapAuthorityCertificateSchema,
  ORDER_SNAP_GRANT_KEY_ID_V2
} from '../order-snap/offline-types';
import { canonicalizeJson } from './order-snap-grant-signer';

export interface OrderSnapCertificateSignerOptions {
  /** Map of keyId -> PEM-encoded ECDSA P-256 private key (PKCS#8 or SEC1) */
  privateKeys?: Record<string, string>;
  /** Optional map of keyId -> PEM-encoded ECDSA P-256 public key (SPKI) */
  publicKeys?: Record<string, string>;
  defaultKeyId?: string;
  env?: Record<string, string | undefined>;
}

export class OrderSnapCertificateSigner {
  private privateKeyMap: Map<string, crypto.KeyObject>;
  private publicKeyMap: Map<string, crypto.KeyObject>;
  private defaultKeyId: string;

  constructor(options: OrderSnapCertificateSignerOptions = {}) {
    this.defaultKeyId = options.defaultKeyId || ORDER_SNAP_GRANT_KEY_ID_V2;
    this.privateKeyMap = new Map();
    this.publicKeyMap = new Map();

    const env = options.env || process.env;

    // Load explicitly passed private keys
    if (options.privateKeys) {
      for (const [keyId, pem] of Object.entries(options.privateKeys)) {
        if (pem && typeof pem === 'string') {
          const keyObj = crypto.createPrivateKey(pem);
          this.privateKeyMap.set(keyId, keyObj);
          try {
            const pubKeyObj = crypto.createPublicKey(keyObj);
            this.publicKeyMap.set(keyId, pubKeyObj);
          } catch {
            // Public key derivation failed
          }
        }
      }
    }

    // Load explicitly passed public keys
    if (options.publicKeys) {
      for (const [keyId, pem] of Object.entries(options.publicKeys)) {
        if (pem && typeof pem === 'string') {
          this.publicKeyMap.set(keyId, crypto.createPublicKey(pem));
        }
      }
    }

    // Load from environment if v2 not already configured
    if (!this.privateKeyMap.has(ORDER_SNAP_GRANT_KEY_ID_V2) && env?.ORDER_SNAP_OFFLINE_CERTIFICATE_PRIVATE_KEY_V2) {
      const pem = env.ORDER_SNAP_OFFLINE_CERTIFICATE_PRIVATE_KEY_V2;
      const keyObj = crypto.createPrivateKey(pem);
      this.privateKeyMap.set(ORDER_SNAP_GRANT_KEY_ID_V2, keyObj);
      try {
        const pubKeyObj = crypto.createPublicKey(keyObj);
        this.publicKeyMap.set(ORDER_SNAP_GRANT_KEY_ID_V2, pubKeyObj);
      } catch {
        // Public key derivation failed
      }
    }
  }

  /**
   * Signs an OrderSnapAuthorityCertificatePayload using ECDSA P-256 with SHA-256.
   * Outputs raw IEEE-P1363 64-byte signature formatted as 128 hex characters.
   */
  public signCertificate(
    payload: OrderSnapAuthorityCertificatePayload,
    keyId: string = this.defaultKeyId
  ): OrderSnapAuthorityCertificate {
    const privateKey = this.privateKeyMap.get(keyId);
    if (!privateKey) {
      throw new Error('order_snap_certificate_signing_unavailable');
    }

    const canonical = canonicalizeJson(payload);
    const dataBuf = Buffer.from(canonical, 'utf8');

    // Sign with IEEE-P1363 formatting (r || s, 64 bytes total)
    const signatureBuffer = crypto.sign(
      'sha256',
      dataBuf,
      {
        key: privateKey,
        dsaEncoding: 'ieee-p1363'
      }
    );

    const signatureHex = signatureBuffer.toString('hex').toLowerCase();

    return {
      payload,
      signature: signatureHex,
      keyId,
      algorithm: 'ES256'
    };
  }

  /**
   * Verifies an OrderSnapAuthorityCertificate on the server using ECDSA P-256 / SHA-256.
   */
  public verifyCertificate(
    certificate: unknown,
    options: { nowSeconds?: number; maxClockSkewSeconds?: number } = {}
  ): { isValid: boolean; certificate?: OrderSnapAuthorityCertificate; error?: string } {
    if (!certificate || typeof certificate !== 'object') {
      return { isValid: false, error: 'invalid_certificate' };
    }

    let parsedCert: OrderSnapAuthorityCertificate;
    try {
      parsedCert = OrderSnapAuthorityCertificateSchema.parse(certificate) as OrderSnapAuthorityCertificate;
    } catch {
      return { isValid: false, error: 'invalid_certificate' };
    }

    const publicKey = this.publicKeyMap.get(parsedCert.keyId);
    if (!publicKey) {
      return { isValid: false, error: 'invalid_certificate' };
    }

    try {
      const canonical = canonicalizeJson(parsedCert.payload);
      const dataBuf = Buffer.from(canonical, 'utf8');
      const sigBuf = Buffer.from(parsedCert.signature, 'hex');

      const isSigValid = crypto.verify(
        'sha256',
        dataBuf,
        {
          key: publicKey,
          dsaEncoding: 'ieee-p1363'
        },
        sigBuf
      );

      if (!isSigValid) {
        return { isValid: false, error: 'invalid_certificate' };
      }

      if (options.nowSeconds !== undefined) {
        const skew = options.maxClockSkewSeconds ?? 60;
        if (parsedCert.payload.expiresAt + skew < options.nowSeconds) {
          return { isValid: false, error: 'grant_expired' };
        }
        if (parsedCert.payload.issuedAt - skew > options.nowSeconds) {
          return { isValid: false, error: 'grant_issued_in_future' };
        }
      }

      return {
        isValid: true,
        certificate: parsedCert
      };
    } catch {
      return { isValid: false, error: 'invalid_certificate' };
    }
  }

  /**
   * Returns the SPKI public key in base64 format for a given keyId.
   */
  public getPublicKeySpkiBase64(keyId: string = this.defaultKeyId): string | null {
    const pubKey = this.publicKeyMap.get(keyId);
    if (!pubKey) return null;
    const der = pubKey.export({ type: 'spki', format: 'der' });
    return Buffer.from(der).toString('base64');
  }
}

let globalCertificateSigner: OrderSnapCertificateSigner | null = null;

export function getOrderSnapCertificateSigner(): OrderSnapCertificateSigner {
  if (!globalCertificateSigner) {
    globalCertificateSigner = new OrderSnapCertificateSigner();
  }
  return globalCertificateSigner;
}