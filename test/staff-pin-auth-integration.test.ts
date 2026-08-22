import { createStaffPinLoginHandler } from '../src/lib/server/staff-pin-auth-handler';

process.env.BENTA_CASHIER_CHECKOUT_ENABLED = 'true';

type RecordMap = Record<string, Record<string, unknown>>;

function ref(path: string) {
  const parts = path.split('/');
  return { path, id: parts[parts.length - 1] };
}

function createIsolatedFirestore(beforeTransactionRead?: (path: string, records: RecordMap) => void) {
  const records: RecordMap = {
    'business_codes/STORE123': { tenantId: 'tenant-a' },
    'tenants/tenant-a': { ownerUid: 'owner-a', name: 'Test Store', moduleType: 'benta-snap' },
    'tenants/tenant-a/staff_accounts/cashier-1': {
      id: 'cashier-1',
      tenantId: 'tenant-a',
      username: 'Cashier One',
      usernameLower: 'cashier1',
      pinHash: 'controlled-hash',
      status: 'active',
      sessionVersion: 4,
      authUid: 'cashier_auth_uid'
    }
  };

  const snapshot = (path: string) => ({
    exists: Boolean(records[path]),
    data: () => records[path],
    id: ref(path).id,
    ref: ref(path)
  });

  const collection = (path: string): any => ({
    path,
    doc: (id: string) => document(`${path}/${id}`),
    where: (field: string, _operator: string, value: unknown) => {
      const query: any = {
        limit: () => query,
        get: async () => {
          const prefix = `${path}/`;
          const docs = Object.keys(records)
            .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
            .filter((key) => records[key][field] === value)
            .map((key) => snapshot(key));
          return { empty: docs.length === 0, docs };
        }
      };
      return query;
    }
  });

  const document = (path: string): any => ({
    ...ref(path),
    get: async () => snapshot(path),
    collection: (name: string) => collection(`${path}/${name}`)
  });

  let transactionHookUsed = false;
  const db = {
    collection,
    runTransaction: async (operation: (transaction: any) => Promise<unknown>) => operation({
      get: async (documentRef: { path: string }) => {
        if (!transactionHookUsed && beforeTransactionRead) {
          transactionHookUsed = true;
          beforeTransactionRead(documentRef.path, records);
        }
        return snapshot(documentRef.path);
      },
      update: (documentRef: { path: string }, values: Record<string, unknown>) => {
        records[documentRef.path] = { ...records[documentRef.path], ...values };
      }
    })
  };

  return { db, records };
}

function createLimiter(events?: string[]) {
  return {
    networkAdmissions: 0,
    acquisitions: 0,
    failureFinalizations: 0,
    successFinalizations: 0,
    async admitNetworkRequest() {
      this.networkAdmissions += 1;
      return { isLimited: false, retryAfterSeconds: 0, admissionId: `test-admission-${this.networkAdmissions}` };
    },
    async acquireAuthentication() {
      this.acquisitions += 1;
      return { isLimited: false, retryAfterSeconds: 0, reservationId: `test-reservation-${this.acquisitions}` };
    },
    async finalizeFailure() { events?.push('finalize-failure'); this.failureFinalizations += 1; return true; },
    async finalizeSuccess() { events?.push('finalize-success'); this.successFinalizations += 1; return true; },
    async recoverAccount() { return true; }
  };
}

function request(body: unknown) {
  return new Request('http://localhost/api/auth/staff-pin-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': 'attacker-value, 127.0.0.1, 10.0.0.1' },
    body: JSON.stringify(body)
  });
}

async function run() {
  let passed = 0;
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
    passed += 1;
    console.log(`PASS: ${message}`);
  };

  {
    const { db, records } = createIsolatedFirestore();
    const events: string[] = [];
    const accountLimiter = createLimiter(events);
    const issued: Array<{ uid: string; claims: Record<string, unknown> }> = [];
    const handler = createStaffPinLoginHandler({
      getFirestore: () => db as any,
      getAuth: () => ({
        createCustomToken: async (uid: string, claims: Record<string, unknown>) => {
          events.push('token-minted');
          issued.push({ uid, claims });
          return 'isolated-custom-token';
        }
      }) as any,
      rateLimiter: accountLimiter as any,
      verifyPin: async () => ({ isValid: true, needsMigration: false }),
      dummyVerify: async () => false,
      serverTimestamp: () => 'SERVER_TIMESTAMP' as any
    });

    const response = await handler(request({ businessCode: 'store123', username: 'cashier1', pin: '1234' }));
    const body = await response.json();
    assert(response.status === 200 && body.success === true, 'actual login handler accepts a controlled valid Cashier');
    assert(issued.length === 1 && issued[0].uid === 'cashier_auth_uid', 'custom token is minted only for the authoritative Cashier UID');
    assert(issued[0].claims.staffAccountId === 'cashier-1' && issued[0].claims.sessionVersion === 4, 'custom claims come from the authoritative transaction');
    assert(records['tenants/tenant-a/staff_accounts/cashier-1'].lastLoginAt === 'SERVER_TIMESTAMP', 'successful login updates lastLoginAt inside the transaction');
    assert(accountLimiter.successFinalizations === 1, 'successful login finalizes throttle state after token minting');
    assert(accountLimiter.networkAdmissions === 1 && accountLimiter.acquisitions === 1, 'normal authentication uses one network admission and one account reservation');
    assert(events.join(',') === 'token-minted,finalize-success', 'successful throttle finalization occurs strictly after token minting');
  }

  {
    const { db } = createIsolatedFirestore((_path, records) => {
      records['tenants/tenant-a/staff_accounts/cashier-1'].status = 'disabled';
      records['tenants/tenant-a/staff_accounts/cashier-1'].sessionVersion = 5;
    });
    let tokenCount = 0;
    const handler = createStaffPinLoginHandler({
      getFirestore: () => db as any,
      getAuth: () => ({ createCustomToken: async () => { tokenCount += 1; return 'must-not-mint'; } }) as any,
      rateLimiter: createLimiter() as any,
      verifyPin: async () => ({ isValid: true, needsMigration: false }),
      dummyVerify: async () => false,
      serverTimestamp: () => 'SERVER_TIMESTAMP' as any
    });

    const response = await handler(request({ businessCode: 'STORE123', username: 'cashier1', pin: '1234' }));
    assert(response.status === 401, 'concurrent disable/session rotation aborts authentication');
    assert(tokenCount === 0, 'no custom token is minted after concurrent revocation');
  }

  for (const scenario of [
    {
      name: 'disabled Cashier',
      mutate: (records: RecordMap) => { records['tenants/tenant-a/staff_accounts/cashier-1'].status = 'disabled'; }
    },
    {
      name: 'stale session version',
      mutate: (records: RecordMap) => { records['tenants/tenant-a/staff_accounts/cashier-1'].sessionVersion = 99; }
    }
  ]) {
    const { db } = createIsolatedFirestore((_path, records) => scenario.mutate(records));
    let tokenCount = 0;
    const handler = createStaffPinLoginHandler({
      getFirestore: () => db as any,
      getAuth: () => ({ createCustomToken: async () => { tokenCount += 1; return 'must-not-mint'; } }) as any,
      rateLimiter: createLimiter() as any,
      verifyPin: async () => ({ isValid: true, needsMigration: false }),
      dummyVerify: async () => false,
      serverTimestamp: () => 'SERVER_TIMESTAMP' as any
    });
    const response = await handler(request({ businessCode: 'STORE123', username: 'cashier1', pin: '1234' }));
    assert(response.status === 401 && tokenCount === 0, `no custom token is minted after authoritative ${scenario.name} race`);
  }

  {
    let dummyRuns = 0;
    const handler = createStaffPinLoginHandler({
      rateLimiter: createLimiter() as any,
      dummyVerify: async () => { dummyRuns += 1; return false; }
    });
    const response = await handler(request({ businessCode: 'STORE123', username: 'cashier1', pin: '12' }));
    const body = await response.json();
    assert(response.status === 400 && !JSON.stringify(body).includes('Firebase'), 'malformed requests receive only a generic safe error');
    assert(dummyRuns === 1, 'malformed credential requests execute the timing-equalization path');
  }

  {
    const { db } = createIsolatedFirestore();
    let tokenCount = 0;
    const handler = createStaffPinLoginHandler({
      getFirestore: () => db as any,
      getAuth: () => ({ createCustomToken: async () => { tokenCount += 1; return 'must-not-mint'; } }) as any,
      rateLimiter: {
        admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0, admissionId: 'lockout-admission' }),
        acquireAuthentication: async () => ({ isLimited: true, retryAfterSeconds: 37, reason: 'account' }),
        finalizeFailure: async () => true,
        finalizeSuccess: async () => true,
        recoverAccount: async () => true
      } as any,
      verifyPin: async () => ({ isValid: true, needsMigration: false })
    });
    const response = await handler(request({ businessCode: 'STORE123', username: 'cashier1', pin: '1234' }));
    const body = await response.json();
    assert(response.status === 429 && response.headers.get('Retry-After') === '37', 'active lockout rejects a correct PIN and returns Retry-After');
    assert(body.error === 'Maling Business Code, Username, o PIN. Paki-check at subukan muli.', 'lockout response remains enumeration-resistant and generic');
    assert(tokenCount === 0, 'no custom token is minted after active lockout');
  }

  {
    const { db } = createIsolatedFirestore();
    let tokenCount = 0;
    const handler = createStaffPinLoginHandler({
      getFirestore: () => db as any,
      getAuth: () => ({ createCustomToken: async () => { tokenCount += 1; return 'must-not-mint'; } }) as any,
      rateLimiter: {
        admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0, admissionId: 'recovery-admission' }),
        acquireAuthentication: async () => ({ isLimited: false, retryAfterSeconds: 0, reservationId: 'recovery-failure' }),
        finalizeFailure: async () => true,
        finalizeSuccess: async () => false,
        recoverAccount: async () => true
      } as any,
      verifyPin: async () => ({ isValid: true, needsMigration: false }),
      serverTimestamp: () => 'SERVER_TIMESTAMP' as any
    });
    const response = await handler(request({ businessCode: 'STORE123', username: 'cashier1', pin: '1234' }));
    const body = await response.json();
    assert(response.status === 500, 'successful-authentication finalization storage failure fails authentication closed');
    assert(tokenCount === 1 && body.customToken === undefined, 'post-mint storage failure returns no token or successful response');
  }

  {
    const { db } = createIsolatedFirestore();
    let attempts = 0;
    let tokenCount = 0;
    const handler = createStaffPinLoginHandler({
      getFirestore: () => db as any,
      getAuth: () => ({ createCustomToken: async () => { tokenCount += 1; return 'recovered-token'; } }) as any,
      rateLimiter: {
        admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0, admissionId: `ordinary-admission-${attempts + 1}` }),
        acquireAuthentication: async () => ({ isLimited: attempts++ >= 3, retryAfterSeconds: 60, reservationId: `ordinary-${attempts}` }),
        finalizeFailure: async () => true,
        finalizeSuccess: async () => true,
        recoverAccount: async () => true
      } as any,
      verifyPin: async (pin: string) => ({ isValid: pin === '1234', needsMigration: false }),
      serverTimestamp: () => 'SERVER_TIMESTAMP' as any
    });
    await handler(request({ businessCode: 'STORE123', username: 'cashier1', pin: '1111' }));
    await handler(request({ businessCode: 'STORE123', username: 'cashier1', pin: '2222' }));
    const response = await handler(request({ businessCode: 'STORE123', username: 'cashier1', pin: '1234' }));
    assert(response.status === 200 && tokenCount === 1, 'correct PIN after ordinary failures succeeds before active lockout');
  }

  {
    const { db } = createIsolatedFirestore();
    const limiter = createLimiter();
    const handler = createStaffPinLoginHandler({
      getFirestore: () => db as any,
      getAuth: () => ({ createCustomToken: async () => { throw new Error('isolated token mint failure'); } }) as any,
      rateLimiter: limiter as any,
      verifyPin: async () => ({ isValid: true, needsMigration: false }),
      serverTimestamp: () => 'SERVER_TIMESTAMP' as any
    });
    const response = await handler(request({ businessCode: 'STORE123', username: 'cashier1', pin: '1234' }));
    const body = await response.json();
    assert(response.status === 500 && body.error === 'Maling Business Code, Username, o PIN. Paki-check at subukan muli.', 'token-mint failure returns no success and exposes only the generic browser error');
    assert(limiter.successFinalizations === 0, 'token-mint failure does not erase account throttle history');
    assert(limiter.failureFinalizations === 0, 'validated credentials with token failure leave the reservation for explicit expiry');
  }

  console.log(`STAFF PIN AUTH INTEGRATION: ${passed}/${passed} PASS`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
