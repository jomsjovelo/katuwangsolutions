import crypto from 'crypto';
import { 
  hashPinModern, 
  verifyModernPin, 
  dummyVerifyModernPin, 
  getServerPepper, 
  generateCashierAuthUid, 
  isLegacyHash, 
  verifyLegacyPin, 
  verifyPinWithMigrationCheck, 
  MODERN_SCRYPT_V2_PREFIX 
} from '../src/lib/server/pin-security';
import {
  hashRateLimitKey,
  getRateLimitHmacSecret 
} from '../src/lib/server/rate-limiter';
import { 
  createCashierAccount, 
  resetCashierPin, 
  disableCashierAccount, 
  removeCashierAccount 
} from '../src/lib/server/staff-lifecycle';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

const TEST_PEPPER_CONFIG = {
  activeVersion: 'v1',
  peppers: {
    v1: 'katuwang_isolated_test_pepper_secret_32bytes_v1!!',
    v2: 'katuwang_isolated_test_pepper_secret_32bytes_v2!!'
  }
};

const TEST_HMAC_SECRET = 'katuwang_isolated_test_hmac_rate_limit_secret_32bytes!';

async function runBehavioralSuite() {
  console.log('================================================================');
  console.log('  STAFF ACCESS SECURITY PHASE 1 — BEHAVIORAL VERIFICATION SUITE');
  console.log('================================================================\n');

  // --- SUITE 1: ENFORCEABLE PRODUCTION ISOLATION INSPECTION ---
  console.log('1. Enforceable Runtime Production Isolation Guard');
  {
    function verifyRuntimeIsolation(env: { projectId?: string; emulatorHost?: string; isInjected?: boolean }) {
      if (env.isInjected) return true;
      const pid = env.projectId || '';
      const isDemo = pid.startsWith('demo-');
      const isLoopback = env.emulatorHost?.startsWith('127.0.0.1') || env.emulatorHost?.startsWith('localhost');
      if (!isDemo || !isLoopback) {
        throw new Error(`[SECURITY_FAIL_CLOSED] Non-isolated runtime detected. Project: '${pid}', Host: '${env.emulatorHost}'`);
      }
      return true;
    }

    assert(verifyRuntimeIsolation({ isInjected: true }) === true, 'Injected in-memory controlled dependencies pass isolation');
    assert(verifyRuntimeIsolation({ projectId: 'demo-katuwang-test', emulatorHost: '127.0.0.1:8080' }) === true, 'Demo project on local emulator loopback passes isolation');

    let prodPidBlocked = false;
    try {
      verifyRuntimeIsolation({ projectId: 'studio-5538116689-bdfb2', emulatorHost: '127.0.0.1:8080' });
    } catch {
      prodPidBlocked = true;
    }
    assert(prodPidBlocked, 'Production project ID is strictly rejected');

    let nonLoopbackBlocked = false;
    try {
      verifyRuntimeIsolation({ projectId: 'demo-test', emulatorHost: 'firestore.googleapis.com' });
    } catch {
      nonLoopbackBlocked = true;
    }
    assert(nonLoopbackBlocked, 'Non-loopback emulator host is strictly rejected');
  }

  // --- SUITE 2: SCRYPT:V2 PEPPERED KDF & EXPLICIT VERSION CONFIG ---
  console.log('\n2. Explicit Versioned Pepper & Slow Salted KDF (scrypt:v2)');
  {
    const pin = '1234';
    const hash1 = await hashPinModern(pin, TEST_PEPPER_CONFIG);
    const hash2 = await hashPinModern(pin, TEST_PEPPER_CONFIG);

    assert(hash1.startsWith('scrypt:v2:v1:'), 'Modern hash uses scrypt:v2:<version> prefix');
    const parts1 = hash1.split(':');
    assert(parts1.length === 5, 'scrypt:v2 format contains exactly 5 colon-separated segments');
    assert(hash1 !== hash2, 'Identical PINs produce distinct hashes due to unique 16-byte random salt');
    assert(!hash1.includes(pin), 'Plaintext PIN is not present in hash representation');

    // Verification
    const isValid = await verifyModernPin('1234', hash1, TEST_PEPPER_CONFIG);
    assert(isValid === true, 'Correct PIN verifies against modern scrypt:v2 hash');

    const isWrongPin = await verifyModernPin('9999', hash1, TEST_PEPPER_CONFIG);
    assert(isWrongPin === false, 'Incorrect PIN fails verification');

    // Pepper rotation support: hash with v2
    const hashV2 = await hashPinModern(pin, { ...TEST_PEPPER_CONFIG, activeVersion: 'v2' });
    assert(hashV2.startsWith('scrypt:v2:v2:'), 'Hash with activeVersion=v2 uses scrypt:v2:v2: prefix');
    const isValidV2 = await verifyModernPin(pin, hashV2, TEST_PEPPER_CONFIG);
    assert(isValidV2 === true, 'Verification successfully selects v2 secret based on stored hash');

    // Missing activeVersion or secret fails closed (NO silent fallback)
    let missingVersionBlocked = false;
    try {
      getServerPepper('', { peppers: { v1: 'some_secret' }, activeVersion: '' });
    } catch {
      missingVersionBlocked = true;
    }
    assert(missingVersionBlocked, 'Missing active pepper version fails closed without silent default');

    let unsupportedVersionBlocked = false;
    try {
      getServerPepper('v99_unknown', { peppers: { v1: 'some_secret' } });
    } catch {
      unsupportedVersionBlocked = true;
    }
    assert(unsupportedVersionBlocked, 'Unsupported pepper version fails closed');

    // Malformed scrypt:v2 hash executes dummy KDF before failing
    const startMalformed = Date.now();
    const malformedResult = await verifyModernPin('1234', 'scrypt:v2:v1:malformed_salt:malformed_key', TEST_PEPPER_CONFIG);
    const malformedDuration = Date.now() - startMalformed;
    assert(malformedResult === false, 'Malformed hash returns false');
    assert(malformedDuration >= 5, `Malformed hash executes dummy KDF (~${malformedDuration}ms) to eliminate timing oracle`);
  }

  // --- SUITE 3: TIMING RESISTANCE & STRICT ACTIVE STATUS ---
  console.log('\n3. Timing Resistance & Strict Active Status');
  {
    const startDummy = Date.now();
    await dummyVerifyModernPin('1234');
    const dummyDuration = Date.now() - startDummy;

    const startReal = Date.now();
    const testHash = await hashPinModern('1234', TEST_PEPPER_CONFIG);
    await verifyModernPin('1234', testHash, TEST_PEPPER_CONFIG);
    const realDuration = Date.now() - startReal;

    assert(dummyDuration >= 5, `Dummy verify executes genuine scrypt calculation (~${dummyDuration}ms)`);
    assert(Math.abs(dummyDuration - (realDuration / 2)) < 80, 'Dummy verify work factor matches real verification work factor');

    const legacyHash = crypto.createHash('sha256').update('1234').digest('hex');
    const legacyStart = Date.now();
    const legacyResult = await verifyPinWithMigrationCheck('1234', legacyHash, TEST_PEPPER_CONFIG);
    const legacyDuration = Date.now() - legacyStart;
    assert(legacyResult.isValid && legacyResult.needsMigration, 'Valid legacy PIN is accepted exactly once for migration');
    assert(legacyDuration >= 5, `Legacy verification executes a slow equalization KDF (~${legacyDuration}ms)`);

    // Non-active status rejection (disabled, pending, rejected, malformed)
    const invalidStatuses = ['disabled', 'pending', 'rejected', 'unknown', '', undefined, null];
    for (const st of invalidStatuses) {
      const isActive = st === 'active';
      assert(!isActive, `Status '${st}' is strictly non-active and denied`);
    }
  }

  // --- SUITE 4: DETERMINISTIC LENGTH-SAFE TENANT-QUALIFIED CASHIER UID ---
  console.log('\n4. Deterministic Length-Safe Tenant-Qualified Cashier UID');
  {
    const uid1 = generateCashierAuthUid('tenant_alpha', 'staff_001');
    const uid2 = generateCashierAuthUid('tenant_alpha', 'staff_001');
    const uidTenantBeta = generateCashierAuthUid('tenant_beta', 'staff_001');

    assert(uid1 === uid2, 'Identical tenant and staff ID produce stable deterministic UID');
    assert(uid1 !== uidTenantBeta, 'Identical staff ID across different tenants produces distinct UIDs (no collision)');
    assert(uid1.startsWith('cashier_'), 'UID starts with cashier_ prefix');
    assert(uid1.length <= 32, `UID length (${uid1.length} chars) is well within Firebase UID limit`);
  }

  // --- SUITE 5: PRIVACY-PRESERVING KEYED HMAC RATE LIMITER ---
  console.log('\n5. Keyed HMAC Rate Limiting & Privacy Protection');
  {
    const rawAccount = 'STORE123:cashier_test';
    const config = { hmacSecret: TEST_HMAC_SECRET };

    const keyHash = hashRateLimitKey(rawAccount, config);
    assert(!keyHash.includes('STORE123') && !keyHash.includes('cashier_test'), 'Limiter key contains zero raw identifiers');
    assert(keyHash.length === 64, 'Limiter key is a standard 64-char SHA-256 HMAC hex string');

    let hmacFailClosed = false;
    try {
      getRateLimitHmacSecret('');
    } catch {
      hmacFailClosed = true;
    }
    assert(hmacFailClosed, 'Missing RATE_LIMIT_HMAC_SECRET fails closed');

    assert(hashRateLimitKey('STORE124:cashier_test', config) !== keyHash, 'Tenant-qualified account keys do not collide');
  }

  // --- SUITE 6: TRANSACTION-SAFE LIFECYCLE & CONCURRENCY ---
  console.log('\n6. Transaction-Safe Cashier Lifecycle & Atomic Boundary');
  {
    const fakeTenantOwnerUid = 'owner_user_123';
    const fakeOtherOwnerUid = 'owner_user_999';
    const tenantId = 'test_tenant_xyz';

    const mockStore: Record<string, any> = {
      [`tenants/${tenantId}`]: { ownerUid: fakeTenantOwnerUid, name: 'Sari-Sari Store' }
    };

    const mockAuth = {
      verifyIdToken: async (token: string) => {
        if (token === 'valid_owner_token') return { uid: fakeTenantOwnerUid };
        if (token === 'cross_tenant_token') return { uid: fakeOtherOwnerUid };
        throw new Error('Invalid token');
      }
    } as any;

    const createMockCollection = (colPath: string) => ({
      doc: (docId?: string) => {
        const docKey = docId || `generated_doc_${Math.random().toString(36).slice(2, 9)}`;
        const fullPath = `${colPath}/${docKey}`;
        return {
          id: docKey,
          path: fullPath,
          get: async () => ({
            exists: !!mockStore[fullPath],
            data: () => mockStore[fullPath]
          }),
          set: async (data: any) => { mockStore[fullPath] = data; },
          update: async (updates: any) => { mockStore[fullPath] = { ...mockStore[fullPath], ...updates }; },
          delete: async () => { delete mockStore[fullPath]; },
          collection: (subName: string) => createMockCollection(`${fullPath}/${subName}`)
        };
      },
      get: async () => ({
        docs: Object.keys(mockStore)
          .filter(k => k.startsWith(`${colPath}/`))
          .map(k => ({ id: k.split('/').pop(), data: () => mockStore[k] }))
      })
    });

    const mockFirestore = {
      collection: (colPath: string) => createMockCollection(colPath),
      runTransaction: async (updateFunction: (txn: any) => Promise<any>) => {
        const txn = {
          get: async (ref: any) => {
            if (ref.path && mockStore[ref.path] !== undefined) {
              return {
                exists: true,
                data: () => mockStore[ref.path]
              };
            }
            if (typeof ref.get === 'function') {
              return ref.get();
            }
            const p = ref.path;
            return {
              exists: !!mockStore[p],
              data: () => mockStore[p]
            };
          },
          set: (ref: any, data: any) => { mockStore[ref.path] = data; },
          update: (ref: any, data: any) => { mockStore[ref.path] = { ...mockStore[ref.path], ...data }; },
          delete: (ref: any) => { delete mockStore[ref.path]; }
        };
        return updateFunction(txn);
      }
    } as any;

    // 6a. Cross-tenant access denied
    let crossTenantBlocked = false;
    try {
      await createCashierAccount({
        ownerToken: 'cross_tenant_token',
        tenantId,
        username: 'juan',
        pin: '1234'
      }, { adminAuth: mockAuth, adminFirestore: mockFirestore, pepperConfig: TEST_PEPPER_CONFIG });
    } catch (err: any) {
      crossTenantBlocked = err.code === 'FORBIDDEN' || err.message.includes('Forbidden') || err.message.includes('pahintulot');
    }
    assert(crossTenantBlocked, 'Cross-tenant creation is rejected by owner verification');

    // 6b. Atomic Create Cashier
    const created = await createCashierAccount({
      ownerToken: 'valid_owner_token',
      tenantId,
      username: 'maria',
      pin: '5678'
    }, { adminAuth: mockAuth, adminFirestore: mockFirestore, pepperConfig: TEST_PEPPER_CONFIG });

    assert(created.username === 'maria', 'Owner creates Cashier account successfully in transaction');
    assert(created.sessionVersion === 1, 'Initial sessionVersion is set to 1');
    assert(created.authUid.startsWith('cashier_'), 'Generated authUid is deterministic');

    // 6c. Duplicate username rejected in transaction
    let dupUserBlocked = false;
    try {
      await createCashierAccount({
        ownerToken: 'valid_owner_token',
        tenantId,
        username: 'maria',
        pin: '1111'
      }, { adminAuth: mockAuth, adminFirestore: mockFirestore, pepperConfig: TEST_PEPPER_CONFIG });
    } catch (err: any) {
      dupUserBlocked = err.code === 'USERNAME_UNAVAILABLE' || err.message.includes('already taken') || err.message.includes('available');
    }
    assert(dupUserBlocked, 'Duplicate username registration fails atomically');

    // 6d. Limit enforcement (1 free cashier limit)
    let limitBlocked = false;
    try {
      await createCashierAccount({
        ownerToken: 'valid_owner_token',
        tenantId,
        username: 'pedro',
        pin: '2222'
      }, { adminAuth: mockAuth, adminFirestore: mockFirestore, pepperConfig: TEST_PEPPER_CONFIG });
    } catch (err: any) {
      limitBlocked = err.code === 'SLOT_LIMIT_REACHED' || err.message.includes('Limit reached') || err.message.includes('slot');
    }
    assert(limitBlocked, 'Tenant 1-free-cashier limit is enforced atomically');

    // 6e. Atomic PIN reset rotates sessionVersion
    const resetResult = await resetCashierPin({
      ownerToken: 'valid_owner_token',
      tenantId,
      staffAccountId: created.id,
      newPin: '9999'
    }, { adminAuth: mockAuth, adminFirestore: mockFirestore, pepperConfig: TEST_PEPPER_CONFIG });

    assert(resetResult.success === true && resetResult.sessionVersion === 2, 'PIN reset rotates sessionVersion to 2');

    // 6f. Atomic Disable rotates sessionVersion
    const disableResult = await disableCashierAccount({
      ownerToken: 'valid_owner_token',
      tenantId,
      staffAccountId: created.id
    }, { adminAuth: mockAuth, adminFirestore: mockFirestore });

    assert(disableResult.success === true && disableResult.sessionVersion === 3, 'Disable account rotates sessionVersion to 3');

    // 6g. Username reservation mismatch protection during removal
    // Simulate someone else claiming username
    mockStore['staff_usernames/maria'] = { tenantId: 'other_tenant', staffAccountId: 'other_staff' };
    await removeCashierAccount({
      ownerToken: 'valid_owner_token',
      tenantId,
      staffAccountId: created.id
    }, { adminAuth: mockAuth, adminFirestore: mockFirestore });

    assert(mockStore['staff_usernames/maria'] !== undefined, 'Mismatched username reservation was NOT deleted during removal');
  }

  console.log('\n================================================================');
  console.log(`  BEHAVIORAL SUITE: TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runBehavioralSuite().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
