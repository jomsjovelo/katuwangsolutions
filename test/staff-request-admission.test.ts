import { createStaffPinLoginHandler } from '../src/lib/server/staff-pin-auth-handler';
import { DistributedStaffAuthRateLimiter } from '../src/lib/server/rate-limiter';

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
          set: (ref: { path: string }, value: Record<string, unknown>) => writes.push(() => { records[ref.path] = value; })
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

const SECRET = 'phase_2a_request_admission_hmac_secret_32_bytes';
const timestampFromMillis = (millis: number) => new Date(millis);
const forwardedHeaders = {
  'content-type': 'application/json',
  'x-forwarded-for': 'untrusted-prefix, 203.0.113.70, 35.191.0.1'
};

function rawRequest(body: string) {
  return new Request('http://localhost/api/auth/staff-pin-login', {
    method: 'POST',
    headers: forwardedHeaders,
    body
  });
}

function limiterOptions(db: any, createReservationId: () => string, networkRequestMax: number) {
  return {
    getFirestore: () => db as any,
    hmacSecret: SECRET,
    timestampFromMillis,
    createReservationId,
    accountMaxAttempts: 3,
    networkMaxAttempts: 3,
    accountRequestMax: 100,
    networkRequestMax,
    requestWindowMs: 60_000,
    ipThrottleEnabled: true
  };
}

async function run() {
  process.env.BENTA_CASHIER_CHECKOUT_ENABLED = 'true';
  let passed = 0;
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
    passed += 1;
    console.log(`PASS: ${message}`);
  };

  {
    const { db, records } = createTransactionalStore();
    let sequence = 0;
    const limiter = new DistributedStaffAuthRateLimiter({
      ...limiterOptions(db, () => `global-${++sequence}`, 2),
      ipThrottleEnabled: false,
      accountMaxAttempts: 2
    });
    const first = await limiter.admitRequest(null);
    const second = await limiter.admitRequest(null);
    const third = await limiter.admitRequest(null);
    assert(!first.isLimited && !second.isLimited && third.isLimited && third.reason === 'global', 'non-IP mode provides bounded distributed global admission');
    assert(!limiter.usesIpSpecificThrottling(), 'non-IP mode is explicit and does not depend on forwarding headers');
    assert(Object.keys(records).every((key) => key.includes('/global_')), 'global admission is a distinct scope and stores no pseudo-network identity');

    const accountLimiter = new DistributedStaffAuthRateLimiter({
      ...limiterOptions(db, () => `account-global-${++sequence}`, 100),
      ipThrottleEnabled: false,
      accountMaxAttempts: 2
    });
    for (let index = 0; index < 2; index += 1) {
      const admission = await accountLimiter.admitRequest(null);
      const reservation = await accountLimiter.acquireAuthentication('STORE123:target', null, admission.admissionId!);
      await accountLimiter.finalizeFailure('STORE123:target', null, reservation.reservationId!);
    }
    const admission = await accountLimiter.admitRequest(null);
    const blocked = await accountLimiter.acquireAuthentication('STORE123:target', null, admission.admissionId!);
    assert(blocked.isLimited && blocked.reason === 'account', 'account lockout remains enforced without IP-specific throttling');
    assert(Object.keys(records).every((key) => !key.includes('/network_')), 'non-IP mode never creates network throttle documents');
  }

  {
    const { db, records } = createTransactionalStore();
    let sequence = 0;
    let dummyRuns = 0;
    const limiter = new DistributedStaffAuthRateLimiter({
      ...limiterOptions(db, () => `global-handler-${++sequence}`, 2),
      ipThrottleEnabled: false
    });
    const handler = createStaffPinLoginHandler({
      enabled: () => true,
      rateLimiter: limiter,
      getFirestore: () => { throw new Error('credential storage must not be reached'); },
      dummyVerify: async () => { dummyRuns += 1; return false; }
    });
    const withoutForwardingHeader = () => new Request('http://localhost/api/auth/staff-pin-login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{'
    });
    const responses = [
      await handler(withoutForwardingHeader()),
      await handler(withoutForwardingHeader()),
      await handler(withoutForwardingHeader())
    ];
    assert(responses.map((response) => response.status).join(',') === '400,400,429', 'malformed login traffic uses global admission without any forwarding header');
    assert(dummyRuns === 2 && Object.keys(records).every((key) => key.includes('/global_')), 'global rejection occurs before expensive dummy KDF and creates no account/network document');
  }

  {
    const { db, records } = createTransactionalStore();
    let sequence = 0;
    let dummyRuns = 0;
    let verifyRuns = 0;
    const limiter = new DistributedStaffAuthRateLimiter(limiterOptions(db, () => `json-${++sequence}`, 2));
    const handler = createStaffPinLoginHandler({
      rateLimiter: limiter,
      getFirestore: () => { throw new Error('credential storage must not be reached'); },
      dummyVerify: async () => { dummyRuns += 1; return false; },
      verifyPin: async () => { verifyRuns += 1; return { isValid: false, needsMigration: false }; }
    });
    const responses = [
      await handler(rawRequest('{"rawSecretMarker":')),
      await handler(rawRequest('{"rawSecretMarker":')),
      await handler(rawRequest('{"rawSecretMarker":'))
    ];
    const rejectedValidRequest = await handler(rawRequest(JSON.stringify({ businessCode: 'STORE123', username: 'cashier', pin: '1234' })));
    assert(responses.map((response) => response.status).join(',') === '400,400,429', 'repeated malformed JSON reaches distributed network request-rate protection');
    assert(rejectedValidRequest.status === 429 && dummyRuns === 2 && verifyRuns === 0, 'request-rate rejection occurs before dummy or real PIN work');
    assert(Object.keys(records).every((key) => key.includes('/network_')), 'malformed JSON creates no account throttle document');
    const serialized = JSON.stringify(records);
    assert(!serialized.includes('203.0.113.70') && !serialized.includes('rawSecretMarker'), 'malformed request storage contains no raw IP or request body');
  }

  {
    const { db, records } = createTransactionalStore();
    let sequence = 0;
    let dummyRuns = 0;
    const limiter = new DistributedStaffAuthRateLimiter(limiterOptions(db, () => `pin-${++sequence}`, 2));
    const handler = createStaffPinLoginHandler({
      rateLimiter: limiter,
      getFirestore: () => { throw new Error('credential storage must not be reached'); },
      dummyVerify: async () => { dummyRuns += 1; return false; }
    });
    const invalidPin = JSON.stringify({ businessCode: 'STORE123', username: 'cashier', pin: '12' });
    const responses = [
      await handler(rawRequest(invalidPin)),
      await handler(rawRequest(invalidPin)),
      await handler(rawRequest(invalidPin))
    ];
    assert(responses.map((response) => response.status).join(',') === '400,400,429', 'repeated malformed PIN formats reach network request-rate protection');
    assert(dummyRuns === 2, 'dummy KDF is not executed after malformed-PIN request-rate rejection');
    assert(Object.keys(records).every((key) => key.includes('/network_')), 'malformed PIN traffic does not create or escalate account lockouts');
  }

  {
    const { db } = createTransactionalStore();
    let sequence = 0;
    let dummyRuns = 0;
    const options = limiterOptions(db, () => `concurrent-${++sequence}`, 3);
    const handlers = Array.from({ length: 8 }, () => createStaffPinLoginHandler({
      rateLimiter: new DistributedStaffAuthRateLimiter(options),
      getFirestore: () => { throw new Error('credential storage must not be reached'); },
      dummyVerify: async () => { dummyRuns += 1; return false; }
    }));
    const responses = await Promise.all(handlers.map((handler) => handler(rawRequest('{'))));
    assert(responses.filter((response) => response.status === 400).length === 3, 'concurrent malformed requests admit only the configured distributed burst');
    assert(responses.filter((response) => response.status === 429).length === 5, 'concurrent malformed excess is atomically rejected across limiter instances');
    assert(dummyRuns === 3, 'only admitted concurrent malformed requests execute dummy KDF work');
  }

  {
    let dummyRuns = 0;
    let verifyRuns = 0;
    const failedStorageLimiter = new DistributedStaffAuthRateLimiter({
      getFirestore: () => { throw new Error('isolated storage failure'); },
      hmacSecret: SECRET,
      timestampFromMillis
    });
    const handler = createStaffPinLoginHandler({
      rateLimiter: failedStorageLimiter,
      dummyVerify: async () => { dummyRuns += 1; return false; },
      verifyPin: async () => { verifyRuns += 1; return { isValid: false, needsMigration: false }; }
    });
    const response = await handler(rawRequest(JSON.stringify({ businessCode: 'STORE123', username: 'cashier', pin: '1234' })));
    const body = await response.json();
    assert(response.status === 429 && typeof body.error === 'string' && !JSON.stringify(body).includes('storage'), 'distributed admission storage failure fails closed with a sanitized response');
    assert(dummyRuns === 0 && verifyRuns === 0, 'storage failure rejects before expensive dummy or real hashing');
  }

  {
    const { db, records } = createTransactionalStore();
    let sequence = 0;
    const limiter = new DistributedStaffAuthRateLimiter(limiterOptions(db, () => `normal-${++sequence}`, 5));
    const admission = await limiter.admitNetworkRequest('203.0.113.80');
    const reservation = await limiter.acquireAuthentication('STORE123:cashier', '203.0.113.80', admission.admissionId!);
    assert(!reservation.isLimited && await limiter.finalizeSuccess('STORE123:cashier', '203.0.113.80', reservation.reservationId!), 'normal authentication completes through one admission and one authentication reservation');
    const networkRecord = Object.entries(records).find(([key]) => key.includes('/network_'))?.[1];
    assert(Array.isArray(networkRecord?.requestsAt) && networkRecord.requestsAt.length === 1, 'normal authentication is not double-counted in network request history');
  }

  {
    const { db } = createTransactionalStore();
    let sequence = 0;
    const limiter = new DistributedStaffAuthRateLimiter({
      ...limiterOptions(db, () => `failure-${++sequence}`, 100),
      accountMaxAttempts: 2,
      networkMaxAttempts: 2
    });
    for (let index = 0; index < 2; index += 1) {
      const account = `STORE123:user-${index}`;
      const admission = await limiter.admitNetworkRequest('203.0.113.90');
      const reservation = await limiter.acquireAuthentication(account, '203.0.113.90', admission.admissionId!);
      await limiter.finalizeFailure(account, '203.0.113.90', reservation.reservationId!);
    }
    const thirdAdmission = await limiter.admitNetworkRequest('203.0.113.90');
    const networkBlocked = await limiter.acquireAuthentication('STORE123:user-3', '203.0.113.90', thirdAdmission.admissionId!);
    assert(networkBlocked.isLimited && networkBlocked.reason === 'network', 'valid failures across accounts continue updating network failed-authentication protection');

    const accountNetwork = '203.0.113.91';
    for (let index = 0; index < 2; index += 1) {
      const admission = await limiter.admitNetworkRequest(accountNetwork);
      const reservation = await limiter.acquireAuthentication('STORE123:target', accountNetwork, admission.admissionId!);
      await limiter.finalizeFailure('STORE123:target', accountNetwork, reservation.reservationId!);
    }
    const accountAdmission = await limiter.admitNetworkRequest('203.0.113.92');
    const accountBlocked = await limiter.acquireAuthentication('STORE123:target', '203.0.113.92', accountAdmission.admissionId!);
    assert(accountBlocked.isLimited && accountBlocked.reason === 'account', 'valid failures continue updating the correct account failed-authentication protection');
  }

  console.log(`STAFF REQUEST ADMISSION: ${passed}/${passed} PASS`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
