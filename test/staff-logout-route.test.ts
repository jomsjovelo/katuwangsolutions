import { createStaffLogoutRouteHandler } from '../src/lib/server/staff-logout-handler';

let passed = 0; let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
const allowed = { enabled: () => true, extractClientIp: () => 'network-key-input', admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }), revokeSession: async (_token: string) => ({ success: true as const }) };
async function main() {
  console.log('STAFF LOGOUT ROUTE TESTS');
  let calls = 0;
  const dormant = await createStaffLogoutRouteHandler({ ...allowed, enabled: () => false, revokeSession: async () => { calls++; return { success: true }; } })(new Request('http://local/api/auth/staff-logout', { method: 'POST' }));
  assert(dormant.status === 503 && calls === 0, 'logout route remains dormant and fail-closed');
  process.env.BENTA_CASHIER_CHECKOUT_ENABLED = 'false';
  const { enabled: _testGate, ...logoutAvailable } = allowed;
  const gateOffLogout = await createStaffLogoutRouteHandler(logoutAvailable)(new Request('http://local/api/auth/staff-logout', { method: 'POST', headers: { authorization: 'Bearer token' } }));
  assert(gateOffLogout.status === 200, 'trusted logout remains available when the unified activation gate is off');
  const success = await createStaffLogoutRouteHandler(allowed)(new Request('http://local/api/auth/staff-logout', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: 'forged', staffAccountId: 'forged', sessionVersion: 999 }) }));
  assert(success.status === 200 && (await success.json()).success === true, 'logout ignores browser authority fields and uses only bearer identity');
  const missing = await createStaffLogoutRouteHandler(allowed)(new Request('http://local/api/auth/staff-logout', { method: 'POST' }));
  assert(missing.status === 401 && (await missing.json()).category === 'AUTHENTICATION_REQUIRED', 'missing token is sanitized');
  let revokeCalls = 0;
  const limited = await createStaffLogoutRouteHandler({ ...allowed, admitNetworkRequest: async () => ({ isLimited: true, retryAfterSeconds: 8 }), revokeSession: async () => { revokeCalls++; return { success: true }; } })(new Request('http://local/api/auth/staff-logout', { method: 'POST', headers: { authorization: 'Bearer token' } }));
  assert(limited.status === 429 && limited.headers.get('Retry-After') === '8' && revokeCalls === 0, 'request admission rejects before logout transaction');
  const unavailable = await createStaffLogoutRouteHandler({ ...allowed, admitNetworkRequest: async () => ({ isLimited: true, retryAfterSeconds: 60, reason: 'unavailable' }) })(new Request('http://local/api/auth/staff-logout', { method: 'POST', headers: { authorization: 'Bearer token' } }));
  assert(unavailable.status === 503 && !(await unavailable.text()).includes('Firestore'), 'admission storage failure is sanitized');
  const noIp = await createStaffLogoutRouteHandler({ ...allowed, extractClientIp: () => null })(new Request('http://local/api/auth/staff-logout', { method: 'POST', headers: { authorization: 'Bearer token' } }));
  assert(noIp.status === 503, 'untrusted or missing client IP fails closed');
  console.log(`RESULT ${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
