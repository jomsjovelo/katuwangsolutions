import { createBentaCashierBootstrapRouteHandler } from '../src/lib/server/benta-cashier-bootstrap';

let passed = 0; let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
const allowed = { enabled: () => true, extractClientIp: () => 'hashed-at-limiter', admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }), getBootstrap: async (token: string) => ({ tenantId: 'tenant-1', tenantDisplayName: 'Store', moduleId: 'benta-snap' as const, staffAccountId: 'cashier-1', cashierDisplayName: token, currentShift: null, products: [] }) };

async function main() {
  console.log('BENTA CASHIER BOOTSTRAP ROUTE TESTS');
  let called = 0;
  const dormant = await createBentaCashierBootstrapRouteHandler({ ...allowed, enabled: () => false, getBootstrap: async () => { called++; return allowed.getBootstrap('x'); } })(new Request('http://local/api/cashier/benta-bootstrap'));
  assert(dormant.status === 503 && called === 0, 'bootstrap route is dormant and fail-closed by default boundary');
  const success = await createBentaCashierBootstrapRouteHandler(allowed)(new Request('http://local/api/cashier/benta-bootstrap?tenantId=forged', { headers: { authorization: 'Bearer trusted-token' } }));
  const body = await success.json(); assert(success.status === 200 && body.cashierDisplayName === 'trusted-token' && body.tenantId === 'tenant-1', 'route forwards only authenticated bearer authority');
  const missing = await createBentaCashierBootstrapRouteHandler(allowed)(new Request('http://local/api/cashier/benta-bootstrap'));
  assert(missing.status === 401 && (await missing.json()).category === 'AUTHENTICATION_REQUIRED', 'missing bearer token is sanitized');
  let admittedWork = 0;
  const limited = await createBentaCashierBootstrapRouteHandler({ ...allowed, admitNetworkRequest: async () => ({ isLimited: true, retryAfterSeconds: 12 }), getBootstrap: async () => { admittedWork++; return allowed.getBootstrap('x'); } })(new Request('http://local/api/cashier/benta-bootstrap', { headers: { authorization: 'Bearer token' } }));
  assert(limited.status === 429 && limited.headers.get('Retry-After') === '12' && admittedWork === 0, 'distributed admission rejects before bootstrap work');
  const storageFailure = await createBentaCashierBootstrapRouteHandler({ ...allowed, admitNetworkRequest: async () => ({ isLimited: true, retryAfterSeconds: 60, reason: 'unavailable' }) })(new Request('http://local/api/cashier/benta-bootstrap', { headers: { authorization: 'Bearer token' } }));
  assert(storageFailure.status === 503 && !(await storageFailure.text()).includes('Firestore'), 'admission storage failure is sanitized');
  const noIp = await createBentaCashierBootstrapRouteHandler({ ...allowed, extractClientIp: () => null })(new Request('http://local/api/cashier/benta-bootstrap', { headers: { authorization: 'Bearer token' } }));
  assert(noIp.status === 503, 'untrusted or missing client IP fails closed');
  console.log(`RESULT ${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
