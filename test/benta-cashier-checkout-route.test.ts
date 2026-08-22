import { CheckoutError, CheckoutErrorCode, createBentaCheckoutRouteHandler } from '../src/lib/server/benta-cashier-checkout';

let passed = 0;
let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
const validBody = { idempotencyKey: '123e4567-e89b-42d3-a456-426614174000', moduleId: 'benta-snap', shiftId: 'shift-1', items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash' };
function request(body: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/cashier/benta-checkout', { method: 'POST', body, headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.1, 127.0.0.1', ...headers } });
}

async function main() {
  console.log('BENTA CASHIER CHECKOUT ROUTE TESTS');
  let work = 0;
  const dormant = createBentaCheckoutRouteHandler({ completeCheckout: async () => { work++; return {}; } });
  const dormantResponse = await dormant(request(JSON.stringify(validBody)));
  assert(dormantResponse.status === 503 && work === 0, 'default activation gate is fail-closed before checkout work');

  const receipt = { saleId: 'sale-1', receiptNumber: 'sale-1' };
  const active = createBentaCheckoutRouteHandler({ enabled: () => true, extractClientIp: () => '203.0.113.1', admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }), completeCheckout: async (token, body) => { work++; assert(token === 'valid-token' && (body as any).moduleId === 'benta-snap', 'route passes bearer token and parsed body to service'); return receipt; } });
  const success = await active(request(JSON.stringify(validBody)));
  assert(success.status === 201 && (await success.json()).saleId === 'sale-1', 'controlled valid Cashier request returns sanitized receipt');

  work = 0;
  const limited = createBentaCheckoutRouteHandler({ enabled: () => true, extractClientIp: () => '203.0.113.1', admitNetworkRequest: async () => ({ isLimited: true, retryAfterSeconds: 17 }), completeCheckout: async () => { work++; return {}; } });
  const limitedResponse = await limited(request(JSON.stringify(validBody)));
  assert(limitedResponse.status === 429 && limitedResponse.headers.get('retry-after') === '17' && work === 0, 'request admission rejects before checkout/authentication work');
  const unavailableAdmission = createBentaCheckoutRouteHandler({ enabled: () => true, extractClientIp: () => '203.0.113.1', admitNetworkRequest: async () => ({ isLimited: true, retryAfterSeconds: 60, reason: 'unavailable' }), completeCheckout: async () => { work++; return {}; } });
  assert((await unavailableAdmission(request(JSON.stringify(validBody)))).status === 503 && work === 0, 'distributed admission storage failure is fail-closed before checkout work');

  const missingToken = await active(request(JSON.stringify(validBody), { authorization: '' }));
  assert(missingToken.status === 401 && (await missingToken.json()).category === CheckoutErrorCode.AUTHENTICATION_REQUIRED, 'missing bearer token is sanitized');
  const malformed = await active(request('{bad json'));
  assert(malformed.status === 400 && (await malformed.json()).category === CheckoutErrorCode.INVALID_REQUEST, 'malformed JSON is sanitized');
  const wrongContent = await active(request(JSON.stringify(validBody), { 'content-type': 'text/plain' }));
  assert(wrongContent.status === 400, 'non-JSON content type rejected');
  const internal = createBentaCheckoutRouteHandler({ enabled: () => true, extractClientIp: () => '203.0.113.1', admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }), completeCheckout: async () => { throw new Error('Firestore path and secret'); } });
  const internalResponse = await internal(request(JSON.stringify(validBody)));
  const internalBody = JSON.stringify(await internalResponse.json());
  assert(internalResponse.status === 503 && !internalBody.includes('Firestore') && !internalBody.includes('secret'), 'infrastructure failure is sanitized');
  const sessionFailure = createBentaCheckoutRouteHandler({ enabled: () => true, extractClientIp: () => '203.0.113.1', admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }), completeCheckout: async () => { throw new CheckoutError(CheckoutErrorCode.SESSION_INVALID); } });
  const sessionResponse = await sessionFailure(request(JSON.stringify(validBody)));
  assert(sessionResponse.status === 401 && (await sessionResponse.json()).category === CheckoutErrorCode.SESSION_INVALID, 'claim/session rejection preserves stable category');
  const noIp = createBentaCheckoutRouteHandler({ enabled: () => true, extractClientIp: () => null });
  assert((await noIp(request(JSON.stringify(validBody)))).status === 503, 'untrusted/missing client IP fails closed');

  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
