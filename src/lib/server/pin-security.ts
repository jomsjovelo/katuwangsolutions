import crypto from 'crypto';

/**
 * Modern Slow, Salted PIN Hashing & Legacy Migration Module
 * 
 * Algorithm: scrypt with N=16384, r=8, p=1, keylen=32, salt=16 bytes
 * Modern Format: scrypt:v2:<pepperVersion>:<salt_hex>:<derived_key_hex>
 * Legacy format supported: 64-char SHA-256 hex or fallback_<hex>
 */

export const MODERN_SCRYPT_V2_PREFIX = 'scrypt:v2';
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024
};

// Constant dummy salt and key for timing-resistant verification of absent/disabled/malformed accounts
const DUMMY_SALT = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
const DUMMY_KEY = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
const DUMMY_PEPPER = 'katuwang_dummy_constant_timing_safe_pepper_secret_v1';

export interface PepperConfigOptions {
  peppers?: Record<string, string>;
  activeVersion?: string;
}

/**
 * Retrieves the server-held pepper for a given version.
 * Fails closed if the pepper version or secret is missing, blank, or unsupported.
 * ZERO silent default fallback to 'v1'.
 */
export function getServerPepper(version?: string, injectedConfig?: PepperConfigOptions): { version: string; secret: string } {
  const activeVersion = (version || injectedConfig?.activeVersion || process.env.STAFF_PIN_PEPPER_ACTIVE_VERSION)?.trim();
  
  if (!activeVersion || !/^[a-zA-Z0-9_-]{1,16}$/.test(activeVersion)) {
    throw new Error('[SECURITY_FAIL_CLOSED] Missing or invalid STAFF_PIN_PEPPER_ACTIVE_VERSION. Must be explicitly configured.');
  }

  let secret: string | undefined;
  if (injectedConfig?.peppers) {
    secret = injectedConfig.peppers[activeVersion];
  } else {
    const envVarName = `STAFF_PIN_PEPPER_${activeVersion.toUpperCase()}`;
    secret = process.env[envVarName]?.trim();
  }

  if (!secret || secret.length < 16) {
    throw new Error(`[SECURITY_FAIL_CLOSED] Missing or invalid server pepper secret for version '${activeVersion}'. Authentication fails closed.`);
  }

  return { version: activeVersion, secret };
}

/**
 * Derives a cryptographic seed from PIN and versioned pepper using HMAC-SHA256.
 */
function derivePinPepperInput(pin: string, pepperSecret: string): Buffer {
  return crypto.createHmac('sha256', pepperSecret).update(pin).digest();
}

/**
 * Hashes a 4-digit PIN using versioned pepper and slow, salted scrypt KDF.
 * Format: scrypt:v2:<pepperVersion>:<salt_hex>:<derived_key_hex>
 */
export async function hashPinModern(pin: string, config?: PepperConfigOptions): Promise<string> {
  const cleanPin = pin.trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    throw new Error('PIN must be a 4-digit numeric string.');
  }

  const { version, secret } = getServerPepper(config?.activeVersion, config);
  const pinSeed = derivePinPepperInput(cleanPin, secret);
  const salt = crypto.randomBytes(SALT_BYTES);

  return new Promise((resolve, reject) => {
    crypto.scrypt(pinSeed, salt, KEY_BYTES, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${MODERN_SCRYPT_V2_PREFIX}:${version}:${salt.toString('hex')}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a PIN against a modern scrypt:v2 peppered hash using constant-time comparison.
 * If pepper version is unsupported or hash is malformed, runs dummy KDF before returning false to prevent timing oracles.
 */
export async function verifyModernPin(pin: string, storedHash: string, config?: PepperConfigOptions): Promise<boolean> {
  if (!pin || !storedHash) {
    await dummyVerifyModernPin(pin || '0000');
    return false;
  }

  const cleanPin = pin.trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    await dummyVerifyModernPin(cleanPin);
    return false;
  }

  const parts = storedHash.split(':');
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== MODERN_SCRYPT_V2_PREFIX) {
    await dummyVerifyModernPin(cleanPin);
    return false;
  }

  const pepperVersion = parts[2];
  let pepperSecret: string;
  try {
    const pepper = getServerPepper(pepperVersion, config);
    pepperSecret = pepper.secret;
  } catch {
    // Missing or invalid pepper version: execute dummy KDF so timing oracle is not created
    await dummyVerifyModernPin(cleanPin);
    return false;
  }

  const saltHex = parts[3];
  const expectedKeyHex = parts[4];

  if (!/^[0-9a-fA-F]{32}$/.test(saltHex) || !/^[0-9a-fA-F]{64}$/.test(expectedKeyHex)) {
    await dummyVerifyModernPin(cleanPin);
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expectedKey = Buffer.from(expectedKeyHex, 'hex');

  if (salt.length !== SALT_BYTES || expectedKey.length !== KEY_BYTES) {
    await dummyVerifyModernPin(cleanPin);
    return false;
  }

  const pinSeed = derivePinPepperInput(cleanPin, pepperSecret);

  return new Promise((resolve) => {
    crypto.scrypt(pinSeed, salt, KEY_BYTES, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const match = crypto.timingSafeEqual(derivedKey, expectedKey);
        resolve(match);
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Executes an identical scrypt KDF operation against dummy data to prevent
 * timing differences when an account, business code, or pepper does not exist or is disabled/malformed.
 */
export async function dummyVerifyModernPin(pin: string): Promise<boolean> {
  const cleanPin = (typeof pin === 'string' ? pin : '').trim().slice(0, 4);
  const pinSeed = derivePinPepperInput(cleanPin || '0000', DUMMY_PEPPER);

  return new Promise((resolve) => {
    crypto.scrypt(pinSeed, DUMMY_SALT, KEY_BYTES, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        crypto.timingSafeEqual(derivedKey, DUMMY_KEY);
        resolve(false);
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Generates a stable, deterministic, length-safe tenant-qualified Firebase Cashier UID.
 * Ensures cross-tenant isolation and strict bounds (length <= 32 chars).
 */
export function generateCashierAuthUid(tenantId: string, staffAccountId: string): string {
  const cleanTenant = (tenantId || '').trim();
  const cleanStaff = (staffAccountId || '').trim();
  if (!cleanTenant || !cleanStaff) {
    throw new Error('Tenant ID and Staff Account ID are required to generate auth UID.');
  }

  const hash = crypto.createHash('sha256').update(`${cleanTenant}:${cleanStaff}`).digest('hex').slice(0, 24);
  return `cashier_${hash}`;
}

/**
 * Checks if a stored hash is in the legacy SHA-256 or fallback format and requires migration.
 */
export function isLegacyHash(storedHash: string): boolean {
  if (!storedHash) return false;
  if (storedHash.startsWith(`${MODERN_SCRYPT_V2_PREFIX}:`)) return false;
  return /^[0-9a-fA-F]{64}$/.test(storedHash) || storedHash.startsWith('fallback_');
}

/**
 * Verifies a PIN against legacy unsalted SHA-256 or fallback hash using constant-time comparison.
 */
export function verifyLegacyPin(pin: string, storedHash: string): boolean {
  if (!pin || !storedHash) return false;
  const cleanPin = pin.trim();

  if (/^[0-9a-fA-F]{64}$/.test(storedHash)) {
    const computedHash = crypto.createHash('sha256').update(cleanPin).digest('hex');
    const computedBuf = Buffer.from(computedHash, 'utf8');
    const storedBuf = Buffer.from(storedHash, 'utf8');
    if (computedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, storedBuf);
  }

  if (storedHash.startsWith('fallback_')) {
    let hash = 0;
    for (let i = 0; i < cleanPin.length; i++) {
      const char = cleanPin.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    const computedFallback = 'fallback_' + Math.abs(hash).toString(16);
    const computedBuf = Buffer.from(computedFallback, 'utf8');
    const storedBuf = Buffer.from(storedHash, 'utf8');
    if (computedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, storedBuf);
  }

  return false;
}

export interface VerificationResult {
  isValid: boolean;
  needsMigration: boolean;
}

/**
 * Unified verification function handling both modern scrypt:v2 and legacy credentials.
 * Returns { isValid, needsMigration }.
 */
export async function verifyPinWithMigrationCheck(
  pin: string, 
  storedHash: string, 
  config?: PepperConfigOptions
): Promise<VerificationResult> {
  if (!pin || !storedHash) {
    await dummyVerifyModernPin(pin || '0000');
    return { isValid: false, needsMigration: false };
  }

  if (storedHash.startsWith(`${MODERN_SCRYPT_V2_PREFIX}:`)) {
    const isValid = await verifyModernPin(pin, storedHash, config);
    return { isValid, needsMigration: false };
  }

  if (isLegacyHash(storedHash)) {
    const isValid = verifyLegacyPin(pin, storedHash);
    // Legacy SHA/fallback checks are intentionally followed by the same slow
    // KDF used for unknown accounts. This prevents the migration window from
    // exposing which Cashier records still use a legacy credential format.
    await dummyVerifyModernPin(pin);
    return { isValid, needsMigration: isValid };
  }

  await dummyVerifyModernPin(pin || '0000');
  return { isValid: false, needsMigration: false };
}
