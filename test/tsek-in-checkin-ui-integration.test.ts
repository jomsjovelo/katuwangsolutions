// test/tsek-in-checkin-ui-integration.test.ts
// Behavioral tests for Check-In Modal UI integration with client API.
// Tests the real helpers from tsek-in-checkin-intent.ts.

import {
  submitTsekInCheckIn,
  generateIdempotencyKey,
  TsekInClientError,
  TsekInClientErrorCode,
  type CheckInRequest,
} from '@/lib/client/tsek-in-client';
import {
  buildTsekInCheckInBusinessPayload,
  resolveTsekInCheckInIntent,
  type TsekInCheckInFormValues,
  type TsekInCheckInIntent,
} from '@/lib/client/tsek-in-checkin-intent';
import { RoomData } from '@/firebase/firestore/tsek-in-actions';

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

  // Mock Rooms
  const mockRooms: RoomData[] = [
    { id: 'room-1', roomNumber: '101', rateCentavos: 50000, shortTimeRatesCentavos: { '3h': 15000, '6h': 25000, '8h': 30000, '12h': 40000 }, extraPaxFeeCentavos: 10000, capacity: 2, status: 'Available' },
    { id: 'room-2', roomNumber: '102', rateCentavos: 60000, shortTimeRatesCentavos: { '3h': 18000, '6h': 30000, '8h': 36000, '12h': 48000 }, extraPaxFeeCentavos: 12000, capacity: 3, status: 'Available' },
  ];

  console.log('\nTesting Check-In Modal - Client API Integration');

  // 1. Verify no checkInGuest import in component
  {
    console.log('\nTesting module imports');
    const fs = await import('fs');
    const modalPath = 'src/components/dashboard/hospitality/modals/check-in-modal.tsx';
    const modalCode = fs.readFileSync(modalPath, 'utf-8');

    assert(!modalCode.includes('checkInGuest'), 'Modal does not import checkInGuest');
    assert(!modalCode.includes('tsek-in-actions'), 'Modal does not import from tsek-in-actions');
    assert(modalCode.includes('submitTsekInCheckIn'), 'Modal imports submitTsekInCheckIn');
    assert(modalCode.includes('generateIdempotencyKey'), 'Modal imports generateIdempotencyKey');
    assert(modalCode.includes('TsekInClientError'), 'Modal imports TsekInClientError');
    assert(modalCode.includes('buildTsekInCheckInBusinessPayload'), 'Modal imports buildTsekInCheckInBusinessPayload');
    assert(modalCode.includes('resolveTsekInCheckInIntent'), 'Modal imports resolveTsekInCheckInIntent');
    assert(!modalCode.includes('currentTenantId'), 'Modal does not use currentTenantId');
    assert(!modalCode.includes('user?.uid'), 'Modal does not use user.uid');
    assert(!modalCode.includes('user?.displayName'), 'Modal does not use user.displayName');
    assert(!modalCode.includes('user?.email'), 'Modal does not use user.email');
    assert(!modalCode.includes('buildRequestPayload'), 'Modal does not use local buildRequestPayload');
    assert(!modalCode.includes('handleCheckIn(e)'), 'Modal has no recursive handleCheckIn call');
    assert(!modalCode.includes('lastSubmittedPayload'), 'Modal does not use lastSubmittedPayload');
  }

  // 2. buildTsekInCheckInBusinessPayload returns exactly the business fields
  {
    console.log('\nTesting buildTsekInCheckInBusinessPayload');
    const formValues: TsekInCheckInFormValues = {
      roomId: 'room-1',
      guestName: 'John Doe',
      contactInfo: '555-1234',
      durationType: 'Daily',
      nights: '2',
      extraPax: '1',
      paymentMethod: 'cash',
      initialPayment: '250.00',
    };
    const payload = buildTsekInCheckInBusinessPayload(formValues);
    const keys = Object.keys(payload).sort();
    assert(JSON.stringify(keys) === JSON.stringify([
      'contactInfo',
      'duration',
      'extraPax',
      'guestName',
      'initialPaymentCentavos',
      'paymentMethod',
      'roomId',
      'stayType',
    ]), 'Business payload contains exactly eight allowed fields (no idempotencyKey)');
    assert(payload.contactInfo === '555-1234', 'Contact info included when provided');
    assert(payload.stayType === 'night', 'Daily maps to night stayType');
    assert(payload.duration === 2, 'Duration uses nights value');
  }

  // 3. Optional contactInfo omitted when blank
  {
    console.log('\nTesting optional contactInfo omission');
    const formValues: TsekInCheckInFormValues = {
      roomId: 'room-1',
      guestName: 'Jane Doe',
      contactInfo: '',
      durationType: 'Daily',
      nights: '1',
      extraPax: '0',
      paymentMethod: 'cash',
      initialPayment: '100.00',
    };
    const payload = buildTsekInCheckInBusinessPayload(formValues);
    assert(!Object.prototype.hasOwnProperty.call(payload, 'contactInfo') || payload.contactInfo === undefined, 'contactInfo key absent when blank');
  }

  // 4. Night and short-duration mappings
  {
    console.log('\nTesting duration type mapping');
    const nightMap = buildTsekInCheckInBusinessPayload({
      roomId: 'room-1', guestName: 'Test', contactInfo: '', durationType: 'Daily', nights: '3', extraPax: '0', paymentMethod: 'cash', initialPayment: '100.00'
    });
    assert(nightMap.stayType === 'night' && nightMap.duration === 3, 'Daily maps to night with correct nights');

    const short3h = buildTsekInCheckInBusinessPayload({
      roomId: 'room-1', guestName: 'Test', contactInfo: '', durationType: '3h', nights: '1', extraPax: '0', paymentMethod: 'cash', initialPayment: '100.00'
    });
    assert(short3h.stayType === 'short' && short3h.duration === 3, '3h maps to short with duration 3');

    const short6h = buildTsekInCheckInBusinessPayload({
      roomId: 'room-1', guestName: 'Test', contactInfo: '', durationType: '6h', nights: '1', extraPax: '0', paymentMethod: 'cash', initialPayment: '100.00'
    });
    assert(short6h.stayType === 'short' && short6h.duration === 6, '6h maps to short with duration 6');

    const short8h = buildTsekInCheckInBusinessPayload({
      roomId: 'room-1', guestName: 'Test', contactInfo: '', durationType: '8h', nights: '1', extraPax: '0', paymentMethod: 'cash', initialPayment: '100.00'
    });
    assert(short8h.stayType === 'short' && short8h.duration === 8, '8h maps to short with duration 8');

    const short12h = buildTsekInCheckInBusinessPayload({
      roomId: 'room-1', guestName: 'Test', contactInfo: '', durationType: '12h', nights: '1', extraPax: '0', paymentMethod: 'cash', initialPayment: '100.00'
    });
    assert(short12h.stayType === 'short' && short12h.duration === 12, '12h maps to short with duration 12');
  }

  // 5. Forged rates, totals, tenant/user data, timestamps are absent
  {
    console.log('\nTesting forbidden fields absent from business payload');
    const payload = buildTsekInCheckInBusinessPayload({
      roomId: 'room-1', guestName: 'Test', contactInfo: 'info', durationType: 'Daily', nights: '1', extraPax: '0', paymentMethod: 'cash', initialPayment: '100.00'
    });
    const forbidden = [
      'tenantId', 'roomName', 'roomDisplayName', 'rateCentavos', 'totalRoomCostCentavos',
      'checkInDate', 'expectedCheckOutDate', 'userId', 'userName', 'actorId', 'accountId',
      'extraPaxCostCentavos', 'fingerprint', 'idempotencyKey'
    ];
    for (const f of forbidden) {
      assert(!Object.prototype.hasOwnProperty.call(payload, f), `Forbidden field "${f}" is absent`);
    }
  }

  // 6. resolveTsekInCheckInIntent - identical retry reuses the key
  {
    console.log('\nTesting resolveTsekInCheckInIntent - identical retry preserves key');
    const payload = buildTsekInCheckInBusinessPayload({
      roomId: 'room-1', guestName: 'Test', contactInfo: '', durationType: 'Daily', nights: '1', extraPax: '0', paymentMethod: 'cash', initialPayment: '100.00'
    });
    let intent: TsekInCheckInIntent | null = null;

    const { request: req1, nextIntent: intent1 } = resolveTsekInCheckInIntent(payload, null, () => 'new-key-1');
    assert(req1.idempotencyKey === 'new-key-1', 'First call generates new key');

    const { request: req2, nextIntent: intent2 } = resolveTsekInCheckInIntent(payload, intent1, () => 'new-key-2');
    assert(req2.idempotencyKey === 'new-key-1', 'Identical retry reuses previous key');
    assert(intent2.idempotencyKey === 'new-key-1', 'Intent state preserves key');
  }

  // 7. resolveTsekInCheckInIntent - changed input generates exactly one new key
  {
    console.log('\nTesting resolveTsekInCheckInIntent - changed input generates one new key');
    const payload1 = buildTsekInCheckInBusinessPayload({
      roomId: 'room-1', guestName: 'Test', contactInfo: '', durationType: 'Daily', nights: '1', extraPax: '0', paymentMethod: 'cash', initialPayment: '100.00'
    });
    let intent: TsekInCheckInIntent | null = null;

    const { request: req1, nextIntent: intent1 } = resolveTsekInCheckInIntent(payload1, null, () => 'key-1');
    assert(req1.idempotencyKey === 'key-1', 'First call uses key-1');

    // Change guest name
    const payload2 = buildTsekInCheckInBusinessPayload({
      roomId: 'room-1', guestName: 'Different', contactInfo: '', durationType: 'Daily', nights: '1', extraPax: '0', paymentMethod: 'cash', initialPayment: '100.00'
    });
    const { request: req2, nextIntent: intent2 } = resolveTsekInCheckInIntent(payload2, intent1, () => 'key-2');
    assert(req2.idempotencyKey === 'key-2', 'Changed payload generates exactly one new key');
    assert(req2.idempotencyKey !== req1.idempotencyKey, 'New key differs from previous');
  }

  // 8. Fingerprint excludes UUID - verify by checking that identical payload with different previous key still matches
  {
    console.log('\nTesting fingerprint excludes UUID');
    const payload = buildTsekInCheckInBusinessPayload({
      roomId: 'room-1', guestName: 'Test', contactInfo: '', durationType: 'Daily', nights: '1', extraPax: '0', paymentMethod: 'cash', initialPayment: '100.00'
    });
    // First intent with key A
    const { request: req1, nextIntent: intent1 } = resolveTsekInCheckInIntent(payload, null, () => 'key-A');
    // Second call with different previous intent (simulating different key) but same business payload
    const intentWithDifferentKey: TsekInCheckInIntent = { idempotencyKey: 'key-B', businessPayload: payload };
    const { request: req2, nextIntent: intent2 } = resolveTsekInCheckInIntent(payload, intentWithDifferentKey, () => 'key-C');
    assert(req2.idempotencyKey === 'key-B', 'Fingerprint matches despite different previous key - reuses key-B');
  }

  // 9. Request mapping excludes forbidden fields
  {
    console.log('\nTesting full request mapping excludes forbidden fields');
    const payload = buildTsekInCheckInBusinessPayload({
      roomId: 'room-1', guestName: 'Test', contactInfo: 'info', durationType: 'Daily', nights: '1', extraPax: '0', paymentMethod: 'cash', initialPayment: '100.00'
    });
    const { request } = resolveTsekInCheckInIntent(payload, null, () => 'key-1');
    const forbidden = [
      'tenantId', 'roomName', 'roomDisplayName', 'rateCentavos', 'totalRoomCostCentavos',
      'checkInDate', 'expectedCheckOutDate', 'userId', 'userName', 'actorId', 'accountId',
      'extraPaxCostCentavos', 'fingerprint'
    ];
    for (const f of forbidden) {
      assert(!Object.prototype.hasOwnProperty.call(request, f), `Request excludes forbidden field "${f}"`);
    }
    // Verify required fields present
    assert(request.idempotencyKey !== undefined, 'Request includes idempotencyKey');
    assert(request.guestName === 'Test', 'Request includes guestName');
  }

  // 10. Extra-pax price is not editable in component
  {
    console.log('\nTesting extra-pax price not editable');
    const fs = await import('fs');
    const modalPath = 'src/components/dashboard/hospitality/modals/check-in-modal.tsx';
    const modalCode = fs.readFileSync(modalPath, 'utf-8');
    assert(modalCode.includes('server-authoritative'), 'Extra-pax cost shows server-authoritative label');
    assert(!modalCode.includes('handleExtraPaxCostChange') || modalCode.includes('Disabled'), 'Extra-pax cost change handler is disabled or removed');
  }

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

runTests().catch((error) => {
  console.error('Test execution error:', error);
  process.exitCode = 1;
});
