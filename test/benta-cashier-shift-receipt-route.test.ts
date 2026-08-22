import { CheckoutError, CheckoutErrorCode } from '../src/lib/server/benta-cashier-checkout';
import { createBentaReceiptRouteHandler, createBentaShiftCloseRouteHandler } from '../src/lib/server/benta-cashier-shift-receipt';

let passed = 0;
let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
const headers = { authorization: 'Bearer token', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.1, 127.0.0.1' };
const admission = { enabled: () => true, extractClientIp: () => '203.0.113.1', admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }) };

async function main() {
  console.log('BENTA CASHIER SHIFT / RECEIPT ROUTE TESTS');
  let calls = 0;
  const dormantClose = createBentaShiftCloseRouteHandler({ closeShift: async () => { calls++; return {}; } });
  const dormantResponse = await dormantClose(new Request('http://localhost/api/cashier/benta-shift-reconciliation', { method: 'POST', headers, body: '{}' }));
  assert(dormantResponse.status === 503 && calls === 0, 'close route is dormant and fail-closed by default');
  const dormantReceipt = createBentaReceiptRouteHandler({ getReceipt: async () => { calls++; return {}; } });
  assert((await dormantReceipt(new Request('http://localhost/api/cashier/benta-receipt?saleId=sale-1', { headers }))).status === 503 && calls === 0, 'receipt route is dormant and fail-closed by default');

  const close = createBentaShiftCloseRouteHandler({ ...admission, closeShift: async (token, body) => { calls++; assert(token === 'token' && (body as any).shiftId === 'shift-1', 'close route passes only authenticated token and parsed request'); return { shiftId: 'shift-1', expectedPhysicalCashCentavos: 110000 }; } });
  const closeResponse = await close(new Request('http://localhost/api/cashier/benta-shift-reconciliation', { method: 'POST', headers, body: JSON.stringify({ shiftId: 'shift-1', endingCashCentavos: 110000 }) }));
  assert(closeResponse.status === 200 && (await closeResponse.json()).expectedPhysicalCashCentavos === 110000, 'valid controlled close response succeeds');

  const receipt = createBentaReceiptRouteHandler({ ...admission, getReceipt: async (token, saleId) => { assert(token === 'token' && saleId === 'sale-1', 'receipt route passes authenticated token and sale selector'); return { saleId }; } });
  const receiptResponse = await receipt(new Request('http://localhost/api/cashier/benta-receipt?saleId=sale-1', { headers }));
  assert(receiptResponse.status === 200 && (await receiptResponse.json()).saleId === 'sale-1', 'valid current-shift receipt response succeeds');

  calls = 0;
  const limited = createBentaShiftCloseRouteHandler({ ...admission, admitNetworkRequest: async () => ({ isLimited: true, retryAfterSeconds: 9, reason: 'network' }), closeShift: async () => { calls++; return {}; } });
  const limitedResponse = await limited(new Request('http://localhost/api/cashier/benta-shift-reconciliation', { method: 'POST', headers, body: '{}' }));
  assert(limitedResponse.status === 429 && limitedResponse.headers.get('retry-after') === '9' && calls === 0, 'request admission rejects before close processing');
  const malformed = await close(new Request('http://localhost/api/cashier/benta-shift-reconciliation', { method: 'POST', headers, body: '{bad' }));
  assert(malformed.status === 400, 'malformed close JSON is sanitized');
  const missingAuth = await receipt(new Request('http://localhost/api/cashier/benta-receipt?saleId=sale-1', { headers: { 'x-forwarded-for': '203.0.113.1, 127.0.0.1' } }));
  assert(missingAuth.status === 401, 'receipt route requires bearer authentication');
  const internal = createBentaReceiptRouteHandler({ ...admission, getReceipt: async () => { throw new Error('secret firestore path'); } });
  const internalResponse = await internal(new Request('http://localhost/api/cashier/benta-receipt?saleId=sale-1', { headers }));
  const internalBody = JSON.stringify(await internalResponse.json());
  assert(internalResponse.status === 503 && !internalBody.includes('secret') && !internalBody.includes('firestore'), 'internal receipt failure is sanitized');
  const denied = createBentaReceiptRouteHandler({ ...admission, getReceipt: async () => { throw new CheckoutError(CheckoutErrorCode.RECEIPT_UNAVAILABLE); } });
  assert((await denied(new Request('http://localhost/api/cashier/benta-receipt?saleId=other', { headers }))).status === 404, 'receipt authorization denial exposes only stable category');

  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
