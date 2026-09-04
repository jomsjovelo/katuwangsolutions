// test/tsek-in-api-routes.test.ts
// Genuine isolated handler tests using real production handlers with injected service stubs.

import {
  createTsekInCheckInRouteHandler,
} from '@/lib/server/tsek-in-checkin-handler';

import {
  createTsekInCheckOutRouteHandler,
} from '@/lib/server/tsek-in-checkout-handler';

import {
  createTsekInExtendRouteHandler,
} from '@/lib/server/tsek-in-extend-handler';

import {
  CheckinError,
  CheckinErrorCode,
} from '@/lib/server/tsek-in-checkin-service';

import {
  CheckoutError,
  CheckoutErrorCode,
} from '@/lib/server/tsek-in-checkout-service';

import {
  ExtensionError,
  ExtensionErrorCode,
} from '@/lib/server/tsek-in-extension-service';

interface HandlerSuite {
  name: string;
  createHandler: (service: any) => (req: Request) => Promise<Response>;
  ErrorClass: new (code: any, message?: string) => Error;
  errorCode: { [key: string]: string };
  successStatus: number;
  validToken: string;
  sampleBody: any;
  sampleReceipt: any;
}

const suites: HandlerSuite[] = [
  {
    name: 'Check-in',
    createHandler: (service) => createTsekInCheckInRouteHandler({ service }),
    ErrorClass: CheckinError,
    errorCode: CheckinErrorCode,
    successStatus: 201,
    validToken: 'Bearer valid-token',
    sampleBody: { bookingId: 'test-booking', roomId: 'room-1' },
    sampleReceipt: {
      bookingId: 'test-booking',
      roomId: 'test-room',
      roomDisplayName: 'Room 101',
      stayType: 'night',
      duration: 1,
      totalCostCentavos: 1000,
      initialPaymentCentavos: 500,
      remainingBalanceCentavos: 500,
      paymentChannel: 'cash',
      requestedCheckOutAt: '2026-01-02T12:00:00.000Z',
      committedAt: '2026-01-01T12:00:00.000Z',
      moduleId: 'tsek-in',
    },
  },
  {
    name: 'Checkout',
    createHandler: (service) => createTsekInCheckOutRouteHandler({ service }),
    ErrorClass: CheckoutError,
    errorCode: CheckoutErrorCode,
    successStatus: 200,
    validToken: 'Bearer valid-token',
    sampleBody: { bookingId: 'test-booking' },
    sampleReceipt: {
      bookingId: 'test-booking',
      roomId: 'test-room',
      roomDisplayName: 'Room 101',
      checkoutStatus: 'CheckedOut',
      totalRoomCostCentavos: 1000,
      totalExtraChargesCentavos: 0,
      totalDueCentavos: 500,
      totalCollectedCentavos: 1000,
      amountMovedNowCentavos: 500,
      paymentChannel: 'cash',
      action: 'settle',
      nextRoomState: 'Available',
      committedAt: '2026-01-01T12:00:00.000Z',
      moduleId: 'tsek-in',
    },
  },
  {
    name: 'Extend',
    createHandler: (service) => createTsekInExtendRouteHandler({ service }),
    ErrorClass: ExtensionError,
    errorCode: ExtensionErrorCode,
    successStatus: 200,
    validToken: 'Bearer valid-token',
    sampleBody: { bookingId: 'test-booking' },
    sampleReceipt: {
      bookingId: 'test-booking',
      roomId: 'test-room',
      roomDisplayName: 'Room 101',
      stayType: 'night',
      extensionDuration: 1,
      previousCheckOutAt: '2026-01-01T12:00:00.000Z',
      newCheckOutAt: '2026-01-02T12:00:00.000Z',
      additionalCostCentavos: 250000,
      newTotalRoomCostCentavos: 800000,
      amountCollectedNowCentavos: 0,
      totalCollectedCentavos: 200000,
      remainingBalanceCentavos: 600000,
      paymentChannel: 'cash',
      bookingStatus: 'Active',
      roomStatus: 'Occupied',
      committedAt: '2026-01-01T12:00:00.000Z',
      moduleId: 'tsek-in',
    },
  },
];

function makeRequest(body: any, authHeader: string, method = 'POST'): Request {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  if (authHeader) headers.set('authorization', authHeader);
  return {
    method,
    headers,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function makeInvalidJsonRequest(body: any, authHeader: string): Request {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  if (authHeader) headers.set('authorization', authHeader);
  return {
    method: 'POST',
    headers,
    async text() {
      return 'not valid json';
    },
  };
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(value: unknown, message: string): void {
    if (value) {
      console.log(`  PASS ${message}`);
      passed++;
    } else {
      console.error(`  FAIL ${message}`);
      failed++;
    }
  }

  function assertJsonContains(json: any, forbidden: string[], label: string): void {
    const str = JSON.stringify(json);
    for (const f of forbidden) {
      assert(!str.includes(f), `${label}: does not leak "${f}"`);
    }
  }

  for (const s of suites) {
    console.log(`\nTesting ${s.name} Handler`);

    const domainError = new s.ErrorClass(s.errorCode.ROOM_NOT_FOUND);
    const unexpectedError = new Error('Database connection failed');

    // 1. Success forwards exact Bearer token and parsed body, returns correct status and receipt
    {
      let capturedToken: string | null = null;
      let capturedBody: any = null;
      const service = async (token: string, body: any) => {
        capturedToken = token;
        capturedBody = body;
        return s.sampleReceipt;
      };
      const handler = s.createHandler(service);
      const req = makeRequest(s.sampleBody, s.validToken);
      const res = await handler(req);

      assert(res.status === s.successStatus, `${s.name}: success returns ${s.successStatus}`);
      assert(res.headers.get('cache-control') === 'no-store', `${s.name}: Cache-Control: no-store`);
      const json = await res.json();
      assert(json.bookingId === s.sampleReceipt.bookingId, `${s.name}: receipt matches`);
      assert(capturedToken === 'valid-token', `${s.name}: exact token forwarded`);
      assert(capturedBody !== null, `${s.name}: body forwarded`);
      assertJsonContains(json, ['valid-token', 'Bearer', 'tenantId', 'stack', 'firestore', 'internal'], `${s.name}: success response`);
    }

    // 2. Missing Authorization returns UNAUTHENTICATED
    {
      const service = async () => { throw new Error('should not be called'); };
      const handler = s.createHandler(service);
      const req = makeRequest(s.sampleBody, '');
      const res = await handler(req);

      assert(res.status === 401, `${s.name}: missing auth returns 401`);
      const json = await res.json();
      assert(json.code === 'UNAUTHENTICATED', `${s.name}: missing auth code UNAUTHENTICATED`);
      assert(json.error === 'Authentication required.', `${s.name}: missing auth message`);
    }

    // 3. Blank Bearer token returns UNAUTHENTICATED
    {
      const service = async () => { throw new Error('should not be called'); };
      const handler = s.createHandler(service);
      const req = makeRequest(s.sampleBody, 'Bearer');
      const res = await handler(req);

      assert(res.status === 401, `${s.name}: blank bearer returns 401`);
      const json = await res.json();
      assert(json.code === 'UNAUTHENTICATED', `${s.name}: blank bearer code UNAUTHENTICATED`);
    }

    // 4. Basic authentication returns UNAUTHENTICATED
    {
      const service = async () => { throw new Error('should not be called'); };
      const handler = s.createHandler(service);
      const req = makeRequest(s.sampleBody, 'Basic dG9rZW4=');
      const res = await handler(req);

      assert(res.status === 401, `${s.name}: basic auth returns 401`);
      const json = await res.json();
      assert(json.code === 'UNAUTHENTICATED', `${s.name}: basic auth code UNAUTHENTICATED`);
    }

    // 5. Malformed Bearer headers (missing space after Bearer) are rejected
    {
      const service = async () => { throw new Error('should not be called'); };
      const handler = s.createHandler(service);
      const req = makeRequest(s.sampleBody, 'Bearer');
      const res = await handler(req);

      assert(res.status === 401, `${s.name}: malformed bearer returns 401`);
      const json = await res.json();
      assert(json.code === 'UNAUTHENTICATED', `${s.name}: malformed bearer code UNAUTHENTICATED`);
    }

    // 6. Invalid JSON returns INVALID_REQUEST without invoking service
    {
      let serviceCalled = false;
      const service = async () => { serviceCalled = true; throw new Error('should not be called'); };
      const handler = s.createHandler(service);
      const req = makeInvalidJsonRequest(s.sampleBody, s.validToken);
      const res = await handler(req);

      assert(!serviceCalled, `${s.name}: invalid JSON does not call service`);
      assert(res.status === 400, `${s.name}: invalid JSON returns 400`);
      const json = await res.json();
      assert(json.code === 'INVALID_REQUEST', `${s.name}: invalid JSON code INVALID_REQUEST`);
      assert(json.error === 'Invalid request.', `${s.name}: invalid JSON message`);
    }

    // 7. Domain error preserves safe HTTP status, code, and user message
    {
      const service = async () => { throw domainError; };
      const handler = s.createHandler(service);
      const req = makeRequest(s.sampleBody, s.validToken);
      const res = await handler(req);

      const expectedStatus = (s.ErrorClass as any).ERROR_DETAILS?.[domainError.code]?.status ?? domainError.httpStatus;
      assert(res.status === expectedStatus, `${s.name}: domain error status ${expectedStatus}`);
      const json = await res.json();
      assert(json.code === domainError.code, `${s.name}: domain error code preserved`);
      assert(json.error === domainError.userMessage, `${s.name}: domain error message preserved`);
      assertJsonContains(json, ['stack', 'firestore', 'internal'], `${s.name}: domain error response`);
    }

    // 8. Unexpected error becomes sanitized SERVICE_UNAVAILABLE
    {
      const service = async () => { throw unexpectedError; };
      const handler = s.createHandler(service);
      const req = makeRequest(s.sampleBody, s.validToken);
      const res = await handler(req);

      assert(res.status === 503, `${s.name}: unexpected error returns 503`);
      const json = await res.json();
      assert(json.code === 'SERVICE_UNAVAILABLE', `${s.name}: unexpected error code SERVICE_UNAVAILABLE`);
      assert(json.error === 'Internal server error', `${s.name}: unexpected error message`);
      assertJsonContains(json, ['Database connection failed', 'stack', 'firestore', 'tenantId'], `${s.name}: unexpected error sanitized`);
    }
  }

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

runTests().catch((error) => {
  console.error('Test execution error:', error);
  process.exitCode = 1;
});