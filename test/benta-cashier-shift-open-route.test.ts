import { createBentaShiftOpenRouteHandler } from '../src/lib/server/benta-cashier-shift-open';

let passed = 0; let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
const headers = { authorization: 'Bearer token', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.1, 127.0.0.1' };
async function main() {
  console.log('BENTA SECURE SHIFT OPEN ROUTE TESTS'); let calls = 0;
  const dormant = createBentaShiftOpenRouteHandler({ openShift: async () => { calls++; return {}; } });
  assert((await dormant(new Request('http://localhost/api/cashier/benta-shift-open', { method: 'POST', headers, body: '{}' }))).status === 503 && calls === 0, 'route is dormant by default');
  const active = createBentaShiftOpenRouteHandler({ enabled: () => true, extractClientIp: () => '203.0.113.1', admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }), openShift: async (token, body) => { calls++; assert(token === 'token' && (body as any).startingCashCentavos === 0, 'route forwards authenticated token and parsed body'); return { shiftId: 'shift-1', status: 'open' }; } });
  const success = await active(new Request('http://localhost/api/cashier/benta-shift-open', { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: '123e4567-e89b-42d3-a456-426614174000', startingCashCentavos: 0 }) }));
  assert(success.status === 201 && (await success.json()).shiftId === 'shift-1', 'valid controlled opening succeeds');
  calls = 0;
  const limited = createBentaShiftOpenRouteHandler({ enabled: () => true, extractClientIp: () => '203.0.113.1', admitNetworkRequest: async () => ({ isLimited: true, retryAfterSeconds: 8, reason: 'network' }), openShift: async () => { calls++; return {}; } });
  const limitedResponse = await limited(new Request('http://localhost/api/cashier/benta-shift-open', { method: 'POST', headers, body: '{}' }));
  assert(limitedResponse.status === 429 && limitedResponse.headers.get('retry-after') === '8' && calls === 0, 'request admission rejects before opening work');
  assert((await active(new Request('http://localhost/api/cashier/benta-shift-open', { method: 'POST', headers, body: '{bad' }))).status === 400, 'malformed JSON is sanitized');
  assert((await active(new Request('http://localhost/api/cashier/benta-shift-open', { method: 'POST', headers: { ...headers, authorization: '' }, body: '{}' }))).status === 401, 'bearer token is required');
  console.log(`RESULT ${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
