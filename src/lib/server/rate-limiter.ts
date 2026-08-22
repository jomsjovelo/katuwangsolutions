import crypto from 'crypto';
import { isIP } from 'net';
import * as admin from 'firebase-admin';
import { getAdminFirestore } from '@/firebase/admin';
import { isCashierIpThrottleEnabled } from './secure-cashier-config';

const THROTTLE_COLLECTION = '_security_staff_auth_throttles';
const FAIL_CLOSED_RETRY_SECONDS = 60;

export interface RateLimiterConfig {
  hmacSecret?: string;
}

export interface DistributedRateLimiterOptions extends RateLimiterConfig {
  getFirestore?: typeof getAdminFirestore;
  now?: () => number;
  timestampFromMillis?: (millis: number) => unknown;
  createReservationId?: () => string;
  accountMaxAttempts?: number;
  networkMaxAttempts?: number;
  windowMs?: number;
  accountRequestMax?: number;
  networkRequestMax?: number;
  requestWindowMs?: number;
  reservationTtlMs?: number;
  baseLockoutMs?: number;
  maxLockoutMs?: number;
  escalationDecayMs?: number;
  ipThrottleEnabled?: boolean;
}

export interface ThrottleDecision {
  isLimited: boolean;
  retryAfterSeconds: number;
  reason?: 'account' | 'network' | 'global' | 'unavailable';
  reservationId?: string;
  admissionId?: string;
}

type ThrottleScope = 'account' | 'network' | 'global';
type TimedEntry = { id: string; at: unknown };

interface StoredThrottle {
  requestsAt?: unknown[];
  failures?: TimedEntry[];
  reservations?: TimedEntry[];
  lockedUntil?: unknown;
  escalationLevel?: number;
  lastLockoutAt?: unknown;
}

interface PreparedThrottle {
  requests: Array<{ id: string; at: number }>;
  failures: Array<{ id: string; at: number }>;
  reservations: Array<{ id: string; at: number }>;
  lockedUntil?: number;
  escalationLevel: number;
  lastLockoutAt?: number;
}

export function getRateLimitHmacSecret(injectedSecret?: string): string {
  const secret = (injectedSecret !== undefined ? injectedSecret : process.env.RATE_LIMIT_HMAC_SECRET)?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('[SECURITY_FAIL_CLOSED] Missing or invalid RATE_LIMIT_HMAC_SECRET.');
  }
  return secret;
}

export function hashRateLimitKey(rawKey: string, config?: RateLimiterConfig): string {
  const secret = getRateLimitHmacSecret(config?.hmacSecret);
  return crypto.createHmac('sha256', secret).update(rawKey.trim()).digest('hex');
}

function toMillis(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return undefined;
}

function retrySeconds(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 1000));
}

/**
 * Distributed two-phase authentication throttle.
 *
 * admitNetworkRequest() consumes request-rate capacity before parsing.
 * acquireAuthentication() then atomically reserves possible failure capacity for
 * account and network without counting the network request again. Failure/success
 * finalization preserves the existing scoped recovery rules. Abandoned reservations
 * expire after reservationTtlMs while request admission retains its own window.
 */
export class DistributedStaffAuthRateLimiter {
  private readonly getFirestore: typeof getAdminFirestore;
  private readonly now: () => number;
  private readonly timestampFromMillis: (millis: number) => unknown;
  private readonly createReservationId: () => string;
  private readonly hmacSecret?: string;
  private readonly accountMaxAttempts: number;
  private readonly networkMaxAttempts: number;
  private readonly windowMs: number;
  private readonly accountRequestMax: number;
  private readonly networkRequestMax: number;
  private readonly requestWindowMs: number;
  private readonly reservationTtlMs: number;
  private readonly baseLockoutMs: number;
  private readonly maxLockoutMs: number;
  private readonly escalationDecayMs: number;
  private readonly ipThrottleEnabled: boolean;

  constructor(options: DistributedRateLimiterOptions = {}) {
    this.getFirestore = options.getFirestore || getAdminFirestore;
    this.now = options.now || Date.now;
    this.timestampFromMillis = options.timestampFromMillis || ((millis) => admin.firestore.Timestamp.fromMillis(millis));
    this.createReservationId = options.createReservationId || crypto.randomUUID;
    this.hmacSecret = options.hmacSecret;
    this.accountMaxAttempts = options.accountMaxAttempts ?? 5;
    this.networkMaxAttempts = options.networkMaxAttempts ?? 25;
    this.windowMs = options.windowMs ?? 15 * 60 * 1000;
    this.accountRequestMax = options.accountRequestMax ?? 20;
    this.networkRequestMax = options.networkRequestMax ?? 100;
    this.requestWindowMs = options.requestWindowMs ?? 60 * 1000;
    this.reservationTtlMs = options.reservationTtlMs ?? 2 * 60 * 1000;
    this.baseLockoutMs = options.baseLockoutMs ?? 15 * 60 * 1000;
    this.maxLockoutMs = options.maxLockoutMs ?? 24 * 60 * 60 * 1000;
    this.escalationDecayMs = options.escalationDecayMs ?? 24 * 60 * 60 * 1000;
    // Controlled callers retain the established verified-network policy unless
    // they explicitly select non-IP mode. The production singleton below is
    // always bound to the environment flag.
    this.ipThrottleEnabled = options.ipThrottleEnabled ?? true;
  }

  private documentId(scope: ThrottleScope, rawIdentifier: string): string {
    return `${scope}_${hashRateLimitKey(`${scope}:${rawIdentifier}`, { hmacSecret: this.hmacSecret })}`;
  }

  private failClosed(): ThrottleDecision {
    return { isLimited: true, retryAfterSeconds: FAIL_CLOSED_RETRY_SECONDS, reason: 'unavailable' };
  }

  private prepare(stored: StoredThrottle, now: number): PreparedThrottle {
    const requests = (Array.isArray(stored.requestsAt) ? stored.requestsAt : [])
      .map((entry, index) => {
        const candidate = entry as Partial<TimedEntry>;
        const objectTime = toMillis(candidate?.at);
        if (typeof candidate?.id === 'string' && objectTime !== undefined) return { id: candidate.id, at: objectTime };
        const legacyTime = toMillis(entry);
        return legacyTime === undefined ? null : { id: `legacy-${index}-${legacyTime}`, at: legacyTime };
      })
      .filter((entry): entry is { id: string; at: number } => entry !== null && now - entry.at < this.requestWindowMs);
    const timed = (entries: unknown, maxAge: number) => (Array.isArray(entries) ? entries : [])
      .map((entry) => {
        const candidate = entry as Partial<TimedEntry>;
        const at = toMillis(candidate.at);
        return typeof candidate.id === 'string' && at !== undefined ? { id: candidate.id, at } : null;
      })
      .filter((entry): entry is { id: string; at: number } => entry !== null && now - entry.at < maxAge);
    const storedLevel = Number.isSafeInteger(stored.escalationLevel) && (stored.escalationLevel as number) >= 0
      ? stored.escalationLevel as number
      : 0;
    const lastLockoutAt = toMillis(stored.lastLockoutAt);
    const escalationLevel = !lastLockoutAt || now - lastLockoutAt >= this.escalationDecayMs ? 0 : storedLevel;
    return {
      requests,
      failures: timed(stored.failures, this.windowMs),
      reservations: timed(stored.reservations, this.reservationTtlMs),
      lockedUntil: toMillis(stored.lockedUntil),
      escalationLevel,
      lastLockoutAt: escalationLevel === 0 ? undefined : lastLockoutAt
    };
  }

  private stored(scope: ThrottleScope, state: PreparedThrottle, now: number): Record<string, unknown> {
    const lockedUntil = state.lockedUntil && state.lockedUntil > now ? state.lockedUntil : undefined;
    const expiresAt = Math.max(
      now + this.requestWindowMs,
      now + this.windowMs,
      now + this.reservationTtlMs,
      state.lastLockoutAt ? state.lastLockoutAt + this.escalationDecayMs : 0,
      lockedUntil || 0
    );
    return {
      schemaVersion: 2,
      scope,
      requestsAt: state.requests.map((entry) => ({ id: entry.id, at: this.timestampFromMillis(entry.at) })),
      failures: state.failures.map((entry) => ({ id: entry.id, at: this.timestampFromMillis(entry.at) })),
      reservations: state.reservations.map((entry) => ({ id: entry.id, at: this.timestampFromMillis(entry.at) })),
      escalationLevel: state.escalationLevel,
      lastLockoutAt: state.lastLockoutAt ? this.timestampFromMillis(state.lastLockoutAt) : null,
      lockedUntil: lockedUntil ? this.timestampFromMillis(lockedUntil) : null,
      updatedAt: this.timestampFromMillis(now),
      expiresAt: this.timestampFromMillis(expiresAt)
    };
  }

  private async admitScope(scope: 'network' | 'global', identifier: string): Promise<ThrottleDecision> {
    try {
      const documentId = this.documentId(scope, identifier);
      const db = this.getFirestore();
      if (!db || typeof db.runTransaction !== 'function') return this.failClosed();
      const throttleRef = db.collection(THROTTLE_COLLECTION).doc(documentId);
      const now = this.now();
      const admissionId = this.createReservationId();
      return await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(throttleRef);
        const state = this.prepare(snapshot.exists ? snapshot.data() as StoredThrottle : {}, now);
        if (state.lockedUntil && state.lockedUntil > now) {
          return { isLimited: true, retryAfterSeconds: retrySeconds(state.lockedUntil, now), reason: scope };
        }
        if (state.requests.length >= this.networkRequestMax) {
          return {
            isLimited: true,
            retryAfterSeconds: retrySeconds(state.requests[0].at + this.requestWindowMs, now),
            reason: scope
          };
        }
        state.requests.push({ id: admissionId, at: now });
        transaction.set(throttleRef, this.stored(scope, state, now));
        return { isLimited: false, retryAfterSeconds: 0, admissionId };
      }) as ThrottleDecision;
    } catch {
      return this.failClosed();
    }
  }

  /** Compatibility API for the verified-IP policy and its controlled tests. */
  public async admitNetworkRequest(networkIdentifier: string): Promise<ThrottleDecision> {
    return this.admitScope('network', networkIdentifier);
  }

  /**
   * Production admission entry point. In temporary non-IP mode this uses a
   * dedicated global request-admission scope, not a fabricated network/IP.
   */
  public async admitRequest(networkIdentifier?: string | null): Promise<ThrottleDecision> {
    if (this.ipThrottleEnabled) {
      if (!networkIdentifier) return this.failClosed();
      return this.admitScope('network', networkIdentifier);
    }
    return this.admitScope('global', 'secure-cashier-request-admission-v1');
  }

  public usesIpSpecificThrottling(): boolean {
    return this.ipThrottleEnabled;
  }

  /**
   * Reserves account/network failure capacity for a syntactically valid login.
   * The preceding network admission is verified and is not counted a second time.
   */
  public async acquireAuthentication(
    accountIdentifier: string,
    networkIdentifier: string | null,
    admissionId: string
  ): Promise<ThrottleDecision> {
    try {
      const accountId = this.documentId('account', accountIdentifier);
      if (this.ipThrottleEnabled && !networkIdentifier) return this.failClosed();
      const admissionScope = this.ipThrottleEnabled ? 'network' as const : 'global' as const;
      const admissionIdentifier = this.ipThrottleEnabled ? networkIdentifier! : 'secure-cashier-request-admission-v1';
      const networkId = this.documentId(admissionScope, admissionIdentifier);
      const db = this.getFirestore();
      if (!db || typeof db.runTransaction !== 'function' || !admissionId) return this.failClosed();
      const accountRef = db.collection(THROTTLE_COLLECTION).doc(accountId);
      const networkRef = db.collection(THROTTLE_COLLECTION).doc(networkId);
      const now = this.now();
      const reservationId = this.createReservationId();

      return await db.runTransaction(async (transaction) => {
        const [accountSnapshot, networkSnapshot] = await Promise.all([
          transaction.get(accountRef),
          transaction.get(networkRef)
        ]);
        const entries = [
          {
            scope: 'account' as const,
            ref: accountRef,
            state: this.prepare(accountSnapshot.exists ? accountSnapshot.data() as StoredThrottle : {}, now),
            failureMax: this.accountMaxAttempts
          },
          {
            scope: admissionScope,
            ref: networkRef,
            state: this.prepare(networkSnapshot.exists ? networkSnapshot.data() as StoredThrottle : {}, now),
            failureMax: this.networkMaxAttempts
          }
        ];
        const networkEntry = entries[1];
        if (!networkEntry.state.requests.some((request) => request.id === admissionId)) return this.failClosed();

        for (const entry of entries.filter((entry) => entry.scope !== 'global')) {
          if (entry.state.lockedUntil && entry.state.lockedUntil > now) {
            return { isLimited: true, retryAfterSeconds: retrySeconds(entry.state.lockedUntil, now), reason: entry.scope };
          }
        }
        if (entries[0].state.requests.length >= this.accountRequestMax) {
          return {
            isLimited: true,
            retryAfterSeconds: retrySeconds(entries[0].state.requests[0].at + this.requestWindowMs, now),
            reason: 'account'
          };
        }

        for (const entry of entries.filter((entry) => entry.scope !== 'global')) {
          if (entry.state.failures.length >= entry.failureMax) {
            const duration = Math.min(
              this.baseLockoutMs * (2 ** Math.min(entry.state.escalationLevel, 30)),
              this.maxLockoutMs
            );
            entry.state.lockedUntil = now + duration;
            entry.state.lastLockoutAt = now;
            entry.state.escalationLevel += 1;
            transaction.set(entry.ref, this.stored(entry.scope, entry.state, now));
            return { isLimited: true, retryAfterSeconds: retrySeconds(now + duration, now), reason: entry.scope };
          }
          if (entry.state.failures.length + entry.state.reservations.length >= entry.failureMax) {
            const retryAt = Math.min(...entry.state.reservations.map((reservation) => reservation.at + this.reservationTtlMs));
            return { isLimited: true, retryAfterSeconds: retrySeconds(retryAt, now), reason: entry.scope };
          }
        }

        entries[0].state.requests.push({ id: reservationId, at: now });
        for (const entry of entries.filter((entry) => entry.scope !== 'global')) {
          entry.state.reservations.push({ id: reservationId, at: now });
          transaction.set(entry.ref, this.stored(entry.scope, entry.state, now));
        }
        return { isLimited: false, retryAfterSeconds: 0, reservationId };
      }) as ThrottleDecision;
    } catch {
      return this.failClosed();
    }
  }

  /** Compatibility helper used by controlled limiter tests. */
  public async acquire(accountIdentifier: string, networkIdentifier: string): Promise<ThrottleDecision> {
    const admission = await this.admitNetworkRequest(networkIdentifier);
    if (admission.isLimited || !admission.admissionId) return admission;
    return this.acquireAuthentication(accountIdentifier, networkIdentifier, admission.admissionId);
  }

  public async finalizeFailure(
    accountIdentifier: string,
    networkIdentifier: string | null,
    reservationId: string
  ): Promise<boolean> {
    return this.finalize(accountIdentifier, networkIdentifier, reservationId, false);
  }

  public async finalizeSuccess(
    accountIdentifier: string,
    networkIdentifier: string | null,
    reservationId: string
  ): Promise<boolean> {
    return this.finalize(accountIdentifier, networkIdentifier, reservationId, true);
  }

  private async finalize(
    accountIdentifier: string,
    networkIdentifier: string | null,
    reservationId: string,
    success: boolean
  ): Promise<boolean> {
    try {
      const accountId = this.documentId('account', accountIdentifier);
      if (this.ipThrottleEnabled && !networkIdentifier) return false;
      const secondaryScope = this.ipThrottleEnabled ? 'network' as const : 'global' as const;
      const secondaryIdentifier = this.ipThrottleEnabled ? networkIdentifier! : 'secure-cashier-request-admission-v1';
      const networkId = this.documentId(secondaryScope, secondaryIdentifier);
      const db = this.getFirestore();
      if (!db || typeof db.runTransaction !== 'function' || !reservationId) return false;
      const accountRef = db.collection(THROTTLE_COLLECTION).doc(accountId);
      const networkRef = db.collection(THROTTLE_COLLECTION).doc(networkId);
      const now = this.now();

      await db.runTransaction(async (transaction) => {
        const [accountSnapshot, networkSnapshot] = await Promise.all([
          transaction.get(accountRef),
          transaction.get(networkRef)
        ]);
        const entries = [
          { scope: 'account' as const, ref: accountRef, state: this.prepare(accountSnapshot.exists ? accountSnapshot.data() as StoredThrottle : {}, now) },
          { scope: secondaryScope, ref: networkRef, state: this.prepare(networkSnapshot.exists ? networkSnapshot.data() as StoredThrottle : {}, now) }
        ];
        for (const entry of entries) {
          if (entry.scope === 'global') continue;
          entry.state.reservations = entry.state.reservations.filter((item) => item.id !== reservationId);
          if (success && entry.scope === 'account') {
            entry.state.failures = [];
            entry.state.lockedUntil = undefined;
            entry.state.escalationLevel = 0;
            entry.state.lastLockoutAt = undefined;
          } else if (!success && !entry.state.failures.some((item) => item.id === reservationId)) {
            entry.state.failures.push({ id: reservationId, at: now });
          }
          transaction.set(entry.ref, this.stored(entry.scope, entry.state, now));
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Owner recovery resets only account punishment; request-rate history remains. */
  public async recoverAccount(accountIdentifier: string): Promise<boolean> {
    return this.recoverScope('account', accountIdentifier);
  }

  /** Operational network recovery never touches any account throttle document. */
  public async recoverNetwork(networkIdentifier: string): Promise<boolean> {
    return this.recoverScope('network', networkIdentifier);
  }

  private async recoverScope(scope: ThrottleScope, identifier: string): Promise<boolean> {
    try {
      const documentId = this.documentId(scope, identifier);
      const db = this.getFirestore();
      if (!db || typeof db.runTransaction !== 'function') return false;
      const throttleRef = db.collection(THROTTLE_COLLECTION).doc(documentId);
      const now = this.now();
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(throttleRef);
        if (!snapshot.exists) return;
        const state = this.prepare(snapshot.data() as StoredThrottle, now);
        state.failures = [];
        state.lockedUntil = undefined;
        state.escalationLevel = 0;
        state.lastLockoutAt = undefined;
        transaction.set(throttleRef, this.stored(scope, state, now));
      });
      return true;
    } catch {
      return false;
    }
  }
}

export const staffAuthRateLimiter = new DistributedStaffAuthRateLimiter({
  ipThrottleEnabled: isCashierIpThrottleEnabled()
});

/**
 * Performs request admission without consulting forwarding headers while the
 * temporary non-IP policy is active.
 */
export async function admitStaffAuthRequest(
  headers: Headers,
  limiter: DistributedStaffAuthRateLimiter = staffAuthRateLimiter
): Promise<ThrottleDecision> {
  if (!limiter.usesIpSpecificThrottling()) return limiter.admitRequest(null);
  return limiter.admitRequest(extractTrustedClientIp(headers));
}

export function extractTrustedClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get('x-forwarded-for');
  if (!forwardedFor) return null;
  const parts = forwardedFor.split(',').map((part) => part.trim());
  if (parts.length < 2) return null;
  const candidate = parts[parts.length - 2];
  if (!candidate || candidate.length > 64 || isIP(candidate) === 0) return null;
  return candidate.toLowerCase();
}
