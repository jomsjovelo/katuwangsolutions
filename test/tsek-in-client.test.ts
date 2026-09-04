// test/tsek-in-client.test.ts
// Genuine tests for Tsek-In client API using injected fetch and token.

import {
  submitTsekInCheckIn,
  submitTsekInCheckOut,
  submitTsekInExtension,
  generateIdempotencyKey,
  isValidUUIDv4,
  TsekInClientError,
  TsekInClientErrorCode,
  type CheckInRequest,
  type CheckOutRequest,
  type ExtensionRequest,
} from '@/lib/client/tsek-in-client';

function makeResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function makeFetchStub(responses: Response[]) {
  let index = 0;
  return async (_url: string, _init: RequestInit) => responses[index++] ?? new Response('', { status: 500 });
}

const VALID_KEY = '123e4567-e89b-42d3-a456-426614174000';

const checkInReq: CheckInRequest = {
  idempotencyKey: VALID_KEY,
  roomId: 'room-1',
  guestName: 'John Doe',
  stayType: 'night',
  duration: 2,
  extraPax: 1,
  paymentMethod: 'cash',
  initialPaymentCentavos: 50000,
};

const checkOutReq: CheckOutRequest = {
  idempotencyKey: VALID_KEY,
  bookingId: 'booking-1',
  extraCharges: [{ description: 'Mini-bar', amountCentavos: 10000 }],
  paymentChannel: 'cash',
};

const extensionReq: ExtensionRequest = {
  idempotencyKey: VALID_KEY,
  bookingId: 'booking-1',
  extension: { type: 'night', duration: 1 },
  collectionCentavos: 25000,
  paymentChannel: 'card',
};

const checkInReceipt = {
  bookingId: 'booking-1',
  roomId: 'room-1',
  roomDisplayName: 'Room 101',
  stayType: 'night',
  duration: 2,
  totalCostCentavos: 100000,
  initialPaymentCentavos: 50000,
  remainingBalanceCentavos: 50000,
  paymentChannel: 'cash',
  requestedCheckOutAt: '2026-01-02T12:00:00.000Z',
  committedAt: '2026-01-01T12:00:00.000Z',
  moduleId: 'tsek-in',
};

const checkOutReceipt = {
  bookingId: 'booking-1',
  roomId: 'room-1',
  roomDisplayName: 'Room 101',
  checkoutStatus: 'CheckedOut',
  totalRoomCostCentavos: 100000,
  totalExtraChargesCentavos: 10000,
  totalDueCentavos: 50000,
  totalCollectedCentavos: 100000,
  amountMovedNowCentavos: 50000,
  paymentChannel: 'cash',
  action: 'settle',
  nextRoomState: 'Available',
  committedAt: '2026-01-01T12:00:00.000Z',
  moduleId: 'tsek-in',
};

const extensionReceipt = {
  bookingId: 'booking-1',
  roomId: 'room-1',
  roomDisplayName: 'Room 101',
  stayType: 'night',
  extensionDuration: 1,
  previousCheckOutAt: '2026-01-01T12:00:00.000Z',
  newCheckOutAt: '2026-01-02T12:00:00.000Z',
  additionalCostCentavos: 25000,
  newTotalRoomCostCentavos: 125000,
  amountCollectedNowCentavos: 25000,
  totalCollectedCentavos: 125000,
  remainingBalanceCentavos: 0,
  paymentChannel: 'card',
  bookingStatus: 'Active',
  roomStatus: 'Occupied',
  committedAt: '2026-01-01T12:00:00.000Z',
  moduleId: 'tsek-in',
};

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

  function assertThrowsAsync(fn: () => Promise<any>, code: TsekInClientErrorCode, message: string): void {
    fn().then(
      () => assert(false, `${message}: should have thrown`),
      (err) => {
        if (err instanceof TsekInClientError && err.code === code) {
          assert(true, message);
        } else {
          assert(false, `${message}: threw ${err?.code ?? err?.name ?? err} instead of ${code}`);
        }
      }
    );
  }

  // --- 1. Correct endpoint, method, headers, body ---
  {
    console.log('\nTesting request shape');
    const captured: { url: string; init: RequestInit; body: unknown }[] = [];
    const fetchFn = async (url: string, init: RequestInit) => {
      captured.push({ url, init, body: JSON.parse(init.body as string) });
      if (url === '/api/tsek-in/check-in') return makeResponse(200, checkInReceipt);
      if (url === '/api/tsek-in/check-out') return makeResponse(200, checkOutReceipt);
      if (url === '/api/tsek-in/extend') return makeResponse(200, extensionReceipt);
      return makeResponse(200, checkInReceipt);
    };

    await submitTsekInCheckIn(checkInReq, { token: 'test-token', fetchFn });
    assert(captured.length === 1, 'Check-in: fetch called once');
    assert(captured[0].url === '/api/tsek-in/check-in', 'Check-in: correct endpoint');
    assert(captured[0].init.method === 'POST', 'Check-in: POST method');
    assert(captured[0].init.headers && (captured[0].init.headers as Record<string, string>)['Content-Type'] === 'application/json', 'Check-in: JSON content-type');
    assert((captured[0].init.headers as Record<string, string>).Authorization === 'Bearer test-token', 'Check-in: Bearer token');
    assert((captured[0].body as CheckInRequest).idempotencyKey === VALID_KEY, 'Check-in: idempotency key in body');
    assert((captured[0].body as CheckInRequest).guestName === 'John Doe', 'Check-in: guest name in body');

    captured.length = 0;
    await submitTsekInCheckOut(checkOutReq, { token: 'test-token', fetchFn });
    assert(captured[0].url === '/api/tsek-in/check-out', 'Checkout: correct endpoint');
    assert((captured[0].body as CheckOutRequest).bookingId === 'booking-1', 'Checkout: bookingId in body');

    captured.length = 0;
    await submitTsekInExtension(extensionReq, { token: 'test-token', fetchFn });
    assert(captured[0].url === '/api/tsek-in/extend', 'Extension: correct endpoint');
    assert((captured[0].body as ExtensionRequest).extension.type === 'night', 'Extension: extension in body');
  }

  // --- 2. Valid success receipt returned ---
  {
    console.log('\nTesting success receipts');
    const fetchFnCheckIn = async (_url: string, _init: RequestInit) => makeResponse(200, checkInReceipt);
    const r = await submitTsekInCheckIn(checkInReq, { token: 't', fetchFn: fetchFnCheckIn });
    assert(r.bookingId === 'booking-1', 'Check-in: receipt returned');

    const fetchFnCheckOut = async (_url: string, _init: RequestInit) => makeResponse(200, checkOutReceipt);
    const r2 = await submitTsekInCheckOut(checkOutReq, { token: 't', fetchFn: fetchFnCheckOut });
    assert(r2.bookingId === 'booking-1', 'Checkout: receipt returned');

    const fetchFnExtend = async (_url: string, _init: RequestInit) => makeResponse(200, extensionReceipt);
    const r3 = await submitTsekInExtension(extensionReq, { token: 't', fetchFn: fetchFnExtend });
    assert(r3.bookingId === 'booking-1', 'Extension: receipt returned');
  }

  // --- 3. Idempotency key preserved ---
  {
    console.log('\nTesting idempotency key preservation');
    const captured: string[] = [];
    const fetchFn = async (_u: string, init: RequestInit) => {
      captured.push(JSON.parse(init.body as string).idempotencyKey);
      return makeResponse(200, checkInReceipt);
    };
    await submitTsekInCheckIn(checkInReq, { token: 't', fetchFn });
    await submitTsekInCheckIn(checkInReq, { token: 't', fetchFn });
    assert(captured[0] === VALID_KEY && captured[1] === VALID_KEY, 'Check-in: same key sent twice');
  }

  // --- 4. Optional contactInfo may be omitted ---
  {
    console.log('\nTesting optional contactInfo');
    const fetchFn = async () => makeResponse(200, checkInReceipt);
    const req = { ...checkInReq };
    delete (req as any).contactInfo;
    const r = await submitTsekInCheckIn(req, { token: 't', fetchFn });
    assert(r.bookingId === 'booking-1', 'Check-in: succeeds without contactInfo');
  }

  // --- 5. Blank provided token fails with AUTHENTICATION_REQUIRED before fetch ---
  {
    console.log('\nTesting blank token');
    let fetchCalled = false;
    const fetchFn = async () => { fetchCalled = true; return makeResponse(200, checkInReceipt); };
    await assertThrowsAsync(
      () => submitTsekInCheckIn(checkInReq, { token: '   ', fetchFn }),
      TsekInClientErrorCode.AUTHENTICATION_REQUIRED,
      'Blank token throws AUTHENTICATION_REQUIRED'
    );
    assert(!fetchCalled, 'Blank token: fetch not called');
  }

  // --- 6. Network failure maps to NETWORK_ERROR ---
  {
    console.log('\nTesting network error');
    const fetchFn = async () => { throw new TypeError('Failed to fetch'); };
    await assertThrowsAsync(
      () => submitTsekInCheckIn(checkInReq, { token: 't', fetchFn }),
      TsekInClientErrorCode.NETWORK_ERROR,
      'Network failure maps to NETWORK_ERROR'
    );
  }

  // --- 7. Server UNAUTHENTICATED maps to AUTHENTICATION_REQUIRED ---
  {
    console.log('\nTesting UNAUTHENTICATED mapping');
    const fetchFn = async () => makeResponse(401, { code: 'UNAUTHENTICATED', error: 'Server says: bad token' });
    await assertThrowsAsync(
      () => submitTsekInCheckIn(checkInReq, { token: 't', fetchFn }),
      TsekInClientErrorCode.AUTHENTICATION_REQUIRED,
      'Server UNAUTHENTICATED maps to AUTHENTICATION_REQUIRED'
    );
  }

  // --- 8. Known allowlisted server codes map correctly ---
  {
    console.log('\nTesting server error code mapping');
    const codes: [TsekInClientErrorCode, string][] = [
      [TsekInClientErrorCode.ROOM_NOT_FOUND, 'ROOM_NOT_FOUND'],
      [TsekInClientErrorCode.ROOM_UNAVAILABLE, 'ROOM_UNAVAILABLE'],
      [TsekInClientErrorCode.ROOM_DATA_INVALID, 'ROOM_DATA_INVALID'],
      [TsekInClientErrorCode.BOOKING_NOT_FOUND, 'BOOKING_NOT_FOUND'],
      [TsekInClientErrorCode.BOOKING_NOT_ACTIVE, 'BOOKING_NOT_ACTIVE'],
      [TsekInClientErrorCode.TENANT_INELIGIBLE, 'TENANT_INELIGIBLE'],
      [TsekInClientErrorCode.FORBIDDEN, 'FORBIDDEN'],
      [TsekInClientErrorCode.FINANCIAL_INTEGRITY_ERROR, 'FINANCIAL_INTEGRITY_ERROR'],
      [TsekInClientErrorCode.PAYMENT_ALLOCATION_ERROR, 'PAYMENT_ALLOCATION_ERROR'],
      [TsekInClientErrorCode.INSUFFICIENT_CASH, 'INSUFFICIENT_CASH'],
      [TsekInClientErrorCode.IDEMPOTENCY_CONFLICT, 'IDEMPOTENCY_CONFLICT'],
      [TsekInClientErrorCode.INVALID_EXTENSION, 'INVALID_EXTENSION'],
      [TsekInClientErrorCode.RATE_SNAPSHOT_INVALID, 'RATE_SNAPSHOT_INVALID'],
      [TsekInClientErrorCode.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE'],
      [TsekInClientErrorCode.INVALID_REQUEST, 'INVALID_REQUEST'],
    ];
    for (const [expectedCode, serverCode] of codes) {
      const fetchFn = async () => makeResponse(400, { code: serverCode, error: 'Server says: something' });
      let caughtCode: TsekInClientErrorCode | null = null;
      try {
        await submitTsekInCheckIn(checkInReq, { token: 't', fetchFn });
      } catch (e) {
        if (e instanceof TsekInClientError) caughtCode = e.code;
      }
      assert(caughtCode === expectedCode, `Server ${serverCode} maps to ${expectedCode}`);
    }
  }

  // --- 9. Unknown server code maps to UNKNOWN_ERROR ---
  {
    console.log('\nTesting unknown server code');
    const fetchFn = async () => makeResponse(400, { code: 'SOME_NEW_CODE', error: 'unknown' });
    await assertThrowsAsync(
      () => submitTsekInCheckIn(checkInReq, { token: 't', fetchFn }),
      TsekInClientErrorCode.UNKNOWN_ERROR,
      'Unknown server code maps to UNKNOWN_ERROR'
    );
  }

  // --- 10. Unsuccessful non-JSON response maps to UNKNOWN_ERROR ---
  {
    console.log('\nTesting non-JSON error response');
    const fetchFn = async () => new Response('not json', { status: 500, headers: { 'Content-Type': 'text/plain' } });
    await assertThrowsAsync(
      () => submitTsekInCheckIn(checkInReq, { token: 't', fetchFn }),
      TsekInClientErrorCode.UNKNOWN_ERROR,
      'Non-JSON error response maps to UNKNOWN_ERROR'
    );
  }

  // --- 11. Successful non-JSON response maps to INVALID_RESPONSE ---
  {
    console.log('\nTesting non-JSON success response');
    const fetchFn = async () => new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    await assertThrowsAsync(
      () => submitTsekInCheckIn(checkInReq, { token: 't', fetchFn }),
      TsekInClientErrorCode.INVALID_RESPONSE,
      'Non-JSON success response maps to INVALID_RESPONSE'
    );
  }

  // --- 12. Strict receipt rejection ---
  {
    console.log('\nTesting strict receipt validation');
    const missingField = { ...checkInReceipt };
    delete (missingField as any).bookingId;
    const badReceipts: Array<{ desc: string; receipt: any }> = [
      { desc: 'Missing field', receipt: missingField },
      { desc: 'Extra field', receipt: { ...checkInReceipt, extra: 'x' } },
      { desc: 'Wrong module', receipt: { ...checkInReceipt, moduleId: 'other' } },
      { desc: 'Invalid payment channel', receipt: { ...checkInReceipt, paymentChannel: 'bitcoin' } },
      { desc: 'Invalid checkout status', receipt: { ...checkOutReceipt, checkoutStatus: 'Cancelled' } },
      { desc: 'Invalid action', receipt: { ...checkOutReceipt, action: 'void' } },
      { desc: 'Negative total cost', receipt: { ...checkInReceipt, totalCostCentavos: -1 } },
      { desc: 'Negative initial payment', receipt: { ...checkInReceipt, initialPaymentCentavos: -1 } },
      { desc: 'Unsafe centavos', receipt: { ...checkInReceipt, totalCostCentavos: 1_000_000_000_001 } },
      { desc: 'Invalid timestamp', receipt: { ...checkInReceipt, requestedCheckOutAt: 'not-a-date' } },
    ];
    for (const { desc, receipt } of badReceipts) {
      const fetchFn = async () => makeResponse(200, receipt);
      let caughtCode: TsekInClientErrorCode | null = null;
      try {
        if (desc.includes('checkout') || desc.includes('action') || desc.includes('status')) {
          await submitTsekInCheckOut(checkOutReq, { token: 't', fetchFn });
        } else {
          await submitTsekInCheckIn(checkInReq, { token: 't', fetchFn });
        }
      } catch (e) {
        if (e instanceof TsekInClientError) caughtCode = e.code;
      }
      assert(caughtCode === TsekInClientErrorCode.INVALID_RESPONSE, `Receipt ${desc} throws INVALID_RESPONSE`);
    }
  }

  // --- 13. Runtime request rejection before fetch ---
  {
    console.log('\nTesting request validation before fetch');
    const fetchFn = async () => { throw new Error('fetch should not be called'); };

    const missingRoom = { ...checkInReq };
    delete (missingRoom as any).roomId;

    const badRequests: Array<{ desc: string; req: any }> = [
      { desc: 'Forged top-level field', req: { ...checkInReq, forged: 'x' } },
      { desc: 'Missing required field', req: missingRoom },
      { desc: 'Invalid UUID', req: { ...checkInReq, idempotencyKey: 'not-a-uuid' } },
      { desc: 'Invalid night duration', req: { ...checkInReq, stayType: 'night', duration: 0 } },
      { desc: 'Invalid night duration >365', req: { ...checkInReq, stayType: 'night', duration: 366 } },
      { desc: 'Invalid short duration', req: { ...checkInReq, stayType: 'short', duration: 5 } },
      { desc: 'Unexpected extension field', req: { ...extensionReq, extension: { type: 'night', duration: 1, extra: 'x' } } },
      { desc: 'Unexpected extra-charge field', req: { ...checkOutReq, extraCharges: [{ description: 'x', amountCentavos: 100, extra: 'y' }] } },
      { desc: 'Description over 200 chars', req: { ...checkOutReq, extraCharges: [{ description: 'x'.repeat(201), amountCentavos: 100 }] } },
      { desc: 'Control characters in description', req: { ...checkOutReq, extraCharges: [{ description: 'test\x00', amountCentavos: 100 }] } },
      { desc: 'Negative centavos', req: { ...checkInReq, initialPaymentCentavos: -1 } },
      { desc: 'Unsafe centavos', req: { ...checkInReq, initialPaymentCentavos: 1_000_000_000_001 } },
    ];

    for (const { desc, req } of badRequests) {
      let caughtCode: TsekInClientErrorCode | null = null;
      try {
        if (desc.includes('checkout') || desc.includes('extra-charge')) {
          await submitTsekInCheckOut(req, { token: 't', fetchFn });
        } else if (desc.includes('extension')) {
          await submitTsekInExtension(req, { token: 't', fetchFn });
        } else {
          await submitTsekInCheckIn(req, { token: 't', fetchFn });
        }
      } catch (e) {
        if (e instanceof TsekInClientError) caughtCode = e.code;
      }
      assert(caughtCode === TsekInClientErrorCode.INVALID_REQUEST, `Request ${desc} throws INVALID_REQUEST`);
    }
  }

  // --- 14. Error messages no leakage ---
  {
    console.log('\nTesting error message leakage');
    const sensitive = ['test-token', 'John Doe', 'room-1', 'booking-1', 'firestore', 'internal', '/api/'];
    const errorCases = [
      { desc: 'Network error', fn: () => submitTsekInCheckIn(checkInReq, { token: 'test-token', fetchFn: async () => { throw new TypeError('Failed'); } }) },
      { desc: 'Auth required', fn: () => submitTsekInCheckIn(checkInReq, { token: '   ', fetchFn: async () => makeResponse(200, checkInReceipt) }) },
      { desc: 'Server error', fn: () => submitTsekInCheckIn(checkInReq, { token: 't', fetchFn: async () => makeResponse(401, { code: 'UNAUTHENTICATED', error: 'Server says: bad' }) }) },
      { desc: 'Invalid receipt', fn: () => submitTsekInCheckIn(checkInReq, { token: 't', fetchFn: async () => makeResponse(200, { moduleId: 'x' }) }) },
    ];
    for (const { desc, fn } of errorCases) {
      let msg = '';
      try { await fn(); } catch (e) { if (e instanceof Error) msg = e.message; }
      for (const s of sensitive) {
        assert(!msg.includes(s), `${desc}: error message does not leak "${s}"`);
      }
    }
  }

  // --- 15. UUIDv4 format and uniqueness ---
  {
    console.log('\nTesting UUIDv4 generation');
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const k = generateIdempotencyKey();
      assert(isValidUUIDv4(k), `Generated key ${i} is valid UUIDv4`);
      assert(!keys.has(k), `Generated key ${i} is unique`);
      keys.add(k);
    }
  }

  // --- 16. No Math.random() dependency ---
  {
    console.log('\nTesting no Math.random() usage');
    const source = await import('@/lib/client/tsek-in-client').then(m => m.generateIdempotencyKey.toString());
    assert(!source.includes('Math.random'), 'generateIdempotencyKey does not use Math.random');
    assert(source.includes('getRandomValues') || source.includes('randomUUID'), 'generateIdempotencyKey uses crypto');
  }

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

runTests().catch((error) => {
  console.error('Test execution error:', error);
  process.exitCode = 1;
});