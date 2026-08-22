import assert from 'node:assert/strict';
import { createStaffPinLoginHandler } from '../src/lib/server/staff-pin-auth-handler';
import { isCashierIpThrottleEnabled, isSecureCashierSystemEnabled } from '../src/lib/server/secure-cashier-config';

assert.equal(isSecureCashierSystemEnabled({ BENTA_CASHIER_CHECKOUT_ENABLED: 'true' }), true);
assert.equal(isSecureCashierSystemEnabled({ BENTA_CASHIER_CHECKOUT_ENABLED: 'false' }), false);
assert.equal(isCashierIpThrottleEnabled({ BENTA_CASHIER_IP_THROTTLE_ENABLED: 'false' }), false);

async function main() {
let admission = 0;
let hashing = 0;
let storage = 0;
let tokenMint = 0;
const handler = createStaffPinLoginHandler({
  enabled: () => false,
  rateLimiter: {
    admitRequest: async () => { admission++; return { isLimited: false, retryAfterSeconds: 0, admissionId: 'x' }; },
    usesIpSpecificThrottling: () => false
  } as any,
  dummyVerify: async () => { hashing++; return false; },
  verifyPin: async () => { hashing++; return { isValid: true, needsMigration: true }; },
  hashPin: async () => { hashing++; return 'migrated'; },
  getFirestore: (() => { storage++; throw new Error('must not run'); }) as any,
  getAuth: (() => ({ createCustomToken: async () => { tokenMint++; return 'token'; } })) as any
});
const response = await handler(new Request('http://local/api/auth/staff-pin-login', {
  method: 'POST', body: JSON.stringify({ businessCode: 'STORE', username: 'cashier', pin: '1234' })
}));
assert.equal(response.status, 503, 'gate-off login fails closed with a generic unavailable response');
assert.deepEqual({ admission, hashing, storage, tokenMint }, { admission: 0, hashing: 0, storage: 0, tokenMint: 0 }, 'gate-off performs no admission, migration, storage, or token work');
const body = await response.json();
assert.equal(Object.keys(body).join(','), 'error', 'gate-off response exposes no activation or infrastructure detail');
console.log('SECURE CASHIER ACTIVATION: 6/6 PASS');
}

main().catch((error) => { console.error(error); process.exit(1); });
