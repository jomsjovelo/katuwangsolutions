import { DistributedStaffAuthRateLimiter, extractTrustedClientIp } from '../src/lib/server/rate-limiter';

type Stored = Record<string, Record<string, unknown>>;

function createTransactionalStore() {
  const records: Stored = {};
  let queue = Promise.resolve();
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
    runTransaction: <T>(operation: (transaction: any) => Promise<T>): Promise<T> => {
      const result = queue.then(async () => {
        const writes: Array<() => void> = [];
        const transaction = {
          get: async (ref: { path: string }) => ({
            exists: Object.prototype.hasOwnProperty.call(records, ref.path),
            data: () => records[ref.path]
          }),
          set: (ref: { path: string }, value: Record<string, unknown>) => writes.push(() => { records[ref.path] = value; }),
          delete: (ref: { path: string }) => writes.push(() => { delete records[ref.path]; })
        };
        const value = await operation(transaction);
        writes.forEach((write) => write());
        return value;
      });
      queue = result.then(() => undefined, () => undefined);
      return result;
    }
  };
  return { db, records };
}

const SECRET = 'phase_2a_isolated_hmac_secret_at_least_32_bytes';
const timestampFromMillis = (millis: number) => new Date(millis);

async function run() {
  let passed = 0;
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
    passed += 1;
    console.log(`PASS: ${message}`);
  };

  {
    const { db, records } = createTransactionalStore();
    let now = 10_000;
    let sequence = 0;
    const options = {
      getFirestore: () => db as any,
      hmacSecret: SECRET,
      now: () => now,
      timestampFromMillis,
      createReservationId: () => `reservation-${++sequence}`,
      accountMaxAttempts: 2,
      networkMaxAttempts: 100,
      accountRequestMax: 100,
      networkRequestMax: 100,
      windowMs: 100,
      requestWindowMs: 100,
      reservationTtlMs: 50,
      baseLockoutMs: 1_000,
      maxLockoutMs: 4_000,
      escalationDecayMs: 20_000
    };
    const limiter = new DistributedStaffAuthRateLimiter(options);
    const failTwice = async () => {
      for (let index = 0; index < 2; index += 1) {
        const admitted = await limiter.acquire('STORE-A:cashier', `198.51.100.${index + 1}`);
        assert(!admitted.isLimited && Boolean(admitted.reservationId), 'failed attempt receives an atomic reservation');
        assert(await limiter.finalizeFailure('STORE-A:cashier', `198.51.100.${index + 1}`, admitted.reservationId!), 'failed attempt finalizes durably');
      }
    };

    await failTwice();
    const firstLock = await limiter.acquire('STORE-A:cashier', '198.51.100.9');
    assert(firstLock.isLimited && firstLock.retryAfterSeconds === 1, 'first lockout uses the configured initial duration');

    now += 1_001;
    await failTwice();
    const secondLock = await limiter.acquire('STORE-A:cashier', '198.51.100.9');
    assert(secondLock.isLimited && secondLock.retryAfterSeconds === 2, 'second lockout escalates after attempt history expires');

    now += 2_001;
    await failTwice();
    const thirdLock = await limiter.acquire('STORE-A:cashier', '198.51.100.9');
    assert(thirdLock.isLimited && thirdLock.retryAfterSeconds === 4, 'later lockout reaches the configured maximum');

    now += 4_001;
    await failTwice();
    const cappedLock = await limiter.acquire('STORE-A:cashier', '198.51.100.9');
    assert(cappedLock.isLimited && cappedLock.retryAfterSeconds === 4, 'subsequent escalation remains capped at the maximum');

    now += 4_001;
    assert(await limiter.recoverAccount('STORE-A:cashier'), 'explicit account recovery succeeds');
    await failTwice();
    const recoveredLock = await limiter.acquire('STORE-A:cashier', '198.51.100.9');
    assert(recoveredLock.isLimited && recoveredLock.retryAfterSeconds === 1, 'explicit recovery resets account escalation deliberately');

    now += 21_001;
    await failTwice();
    const decayedLock = await limiter.acquire('STORE-A:cashier', '198.51.100.9');
    assert(decayedLock.isLimited && decayedLock.retryAfterSeconds === 1, 'escalation eventually decays without relying on TTL deletion');

    const serialized = JSON.stringify(records);
    assert(!serialized.includes('STORE-A') && !serialized.includes('cashier') && !serialized.includes('198.51.100'), 'stored documents contain no raw account or network identifiers');
    assert(Object.values(records).every((record) => record.expiresAt instanceof Date), 'all throttle records carry timestamp expiry metadata');
  }

  {
    const { db } = createTransactionalStore();
    let sequence = 0;
    const limiter = new DistributedStaffAuthRateLimiter({
      getFirestore: () => db as any,
      hmacSecret: SECRET,
      timestampFromMillis,
      createReservationId: () => `shared-success-${++sequence}`,
      accountMaxAttempts: 3,
      networkMaxAttempts: 3,
      accountRequestMax: 100,
      networkRequestMax: 100
    });
    for (let index = 0; index < 30; index += 1) {
      const account = `STORE-${index}:cashier`;
      const admitted = await limiter.acquire(account, '203.0.113.20');
      assert(!admitted.isLimited, 'shared-network successful login is admitted');
      assert(await limiter.finalizeSuccess(account, '203.0.113.20', admitted.reservationId!), 'successful login finalizes after authentication');
    }
    const next = await limiter.acquire('STORE-NEXT:cashier', '203.0.113.20');
    assert(!next.isLimited, 'many successful logins do not exhaust the shared-IP failure allowance');
  }

  {
    const { db } = createTransactionalStore();
    let sequence = 0;
    const limiter = new DistributedStaffAuthRateLimiter({
      getFirestore: () => db as any,
      hmacSecret: SECRET,
      timestampFromMillis,
      createReservationId: () => `rotating-${++sequence}`,
      accountMaxAttempts: 10,
      networkMaxAttempts: 3,
      accountRequestMax: 100,
      networkRequestMax: 100
    });
    for (let index = 0; index < 3; index += 1) {
      const account = `STORE-A:user-${index}`;
      const admitted = await limiter.acquire(account, '203.0.113.30');
      await limiter.finalizeFailure(account, '203.0.113.30', admitted.reservationId!);
    }
    const crossAccount = await limiter.acquire('STORE-A:user-4', '203.0.113.30');
    assert(crossAccount.isLimited && crossAccount.reason === 'network', 'failures across rotating usernames trigger shared-network protection');
  }

  {
    const { db } = createTransactionalStore();
    let sequence = 0;
    const limiter = new DistributedStaffAuthRateLimiter({
      getFirestore: () => db as any,
      hmacSecret: SECRET,
      timestampFromMillis,
      createReservationId: () => `scoped-recovery-${++sequence}`,
      accountMaxAttempts: 2,
      networkMaxAttempts: 2,
      accountRequestMax: 100,
      networkRequestMax: 100
    });
    for (let index = 0; index < 2; index += 1) {
      const admitted = await limiter.acquire('STORE-A:protected', '203.0.113.40');
      await limiter.finalizeFailure('STORE-A:protected', '203.0.113.40', admitted.reservationId!);
    }
    assert(await limiter.recoverNetwork('203.0.113.40'), 'network recovery completes independently');
    const accountStillProtected = await limiter.acquire('STORE-A:protected', '203.0.113.40');
    assert(accountStillProtected.isLimited && accountStillProtected.reason === 'account', 'network recovery does not erase account failure protection');
  }

  {
    const { db } = createTransactionalStore();
    let sequence = 0;
    const limiter = new DistributedStaffAuthRateLimiter({
      getFirestore: () => db as any,
      hmacSecret: SECRET,
      timestampFromMillis,
      createReservationId: () => `auth-recovery-${++sequence}`,
      accountMaxAttempts: 3,
      networkMaxAttempts: 20,
      accountRequestMax: 100,
      networkRequestMax: 100
    });
    for (let index = 0; index < 2; index += 1) {
      const failed = await limiter.acquire('STORE-A:recovering', '203.0.113.50');
      await limiter.finalizeFailure('STORE-A:recovering', '203.0.113.50', failed.reservationId!);
    }
    const successful = await limiter.acquire('STORE-A:recovering', '203.0.113.50');
    assert(await limiter.finalizeSuccess('STORE-A:recovering', '203.0.113.50', successful.reservationId!), 'successful authentication finalizes its reservation');
    assert(!(await limiter.acquire('STORE-A:recovering', '203.0.113.51')).isLimited, 'successful authentication recovers only the intended account failure state');
  }

  {
    const { db } = createTransactionalStore();
    let now = 1_000;
    let sequence = 0;
    const options = {
      getFirestore: () => db as any,
      hmacSecret: SECRET,
      now: () => now,
      timestampFromMillis,
      createReservationId: () => `account-${++sequence}`,
      accountMaxAttempts: 2,
      networkMaxAttempts: 100,
      accountRequestMax: 100,
      networkRequestMax: 100,
      reservationTtlMs: 100,
      requestWindowMs: 1_000
    };
    const limiters = Array.from({ length: 6 }, () => new DistributedStaffAuthRateLimiter(options));
    const reservations = await Promise.all(limiters.map((limiter) => limiter.acquire('STORE-A:target', '192.0.2.20')));
    assert(reservations.filter((decision) => !decision.isLimited).length === 2, 'concurrent reservations atomically enforce account capacity across newly constructed instances');
    assert(reservations.filter((decision) => decision.isLimited).length === 4, 'concurrent excess attempts are rejected');

    now += 101;
    const afterAbandonment = await limiters[0].acquire('STORE-A:target', '192.0.2.21');
    assert(!afterAbandonment.isLimited, 'abandoned reservations expire without becoming authentication failures');
  }

  {
    const { db } = createTransactionalStore();
    let sequence = 0;
    const limiter = new DistributedStaffAuthRateLimiter({
      getFirestore: () => db as any,
      hmacSecret: SECRET,
      timestampFromMillis,
      createReservationId: () => `request-${++sequence}`,
      accountMaxAttempts: 10,
      networkMaxAttempts: 10,
      accountRequestMax: 2,
      networkRequestMax: 20
    });
    for (let index = 0; index < 2; index += 1) {
      const admitted = await limiter.acquire('STORE-A:busy', '192.0.2.30');
      await limiter.finalizeSuccess('STORE-A:busy', '192.0.2.30', admitted.reservationId!);
    }
    assert((await limiter.acquire('STORE-A:busy', '192.0.2.30')).isLimited, 'independent request-rate protection survives successful finalization');
  }

  {
    const missingSecret = new DistributedStaffAuthRateLimiter({ hmacSecret: '', timestampFromMillis });
    assert((await missingSecret.acquire('STORE:user', '192.0.2.1')).isLimited, 'missing HMAC secret fails closed without storage contact');
    const failedStorage = new DistributedStaffAuthRateLimiter({
      getFirestore: () => ({ collection: () => ({ doc: () => ({}) }), runTransaction: async () => { throw new Error('isolated'); } }) as any,
      hmacSecret: SECRET,
      timestampFromMillis
    });
    assert((await failedStorage.acquire('STORE:user', '192.0.2.1')).isLimited, 'Firestore transaction failure fails closed');
  }

  {
    assert(extractTrustedClientIp(new Headers({ 'x-forwarded-for': 'forged, 203.0.113.7, 35.191.0.1' })) === '203.0.113.7', 'trusted IP extraction ignores attacker prefixes in local tests');
  }

  console.log(`STAFF AUTH DISTRIBUTED LIMITER: ${passed}/${passed} PASS`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
