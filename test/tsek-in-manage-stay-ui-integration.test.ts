import { readFileSync } from 'node:fs';
import {
  buildTsekInCheckOutBusinessPayload,
  buildTsekInExtensionBusinessPayload,
  resolveTsekInCheckOutIntent,
  resolveTsekInExtensionIntent,
  type TsekInCheckOutIntent,
  type TsekInExtensionIntent,
} from '@/lib/client/tsek-in-manage-stay-intent';

let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string): void {
  if (condition) {
    console.log(`  PASS ${message}`);
    passed++;
  } else {
    console.error(`  FAIL ${message}`);
    failed++;
  }
}

function exactKeys(value: object, expected: string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

console.log('\nTesting Manage Stay secure API integration');

const checkoutPayload = buildTsekInCheckOutBusinessPayload({
  bookingId: ' booking-1 ',
  extraCharges: [{ description: ' Late checkout ', amountCentavos: 5000 }],
  paymentChannel: 'cash',
});
assert(exactKeys(checkoutPayload, ['bookingId', 'extraCharges', 'paymentChannel']), 'Checkout payload contains only server-authorized business fields');
assert(checkoutPayload.bookingId === 'booking-1', 'Checkout booking ID is normalized');
assert(checkoutPayload.extraCharges[0].description === 'Late checkout', 'Extra-charge description is normalized');

const checkoutFirst = resolveTsekInCheckOutIntent(checkoutPayload, null, () => 'checkout-key-1');
const checkoutRetry = resolveTsekInCheckOutIntent(checkoutPayload, checkoutFirst.nextIntent, () => 'checkout-key-2');
assert(checkoutRetry.request.idempotencyKey === 'checkout-key-1', 'Identical checkout retry reuses its idempotency key');
const changedCheckout = buildTsekInCheckOutBusinessPayload({ ...checkoutPayload, paymentChannel: 'gcash' });
let checkoutGenerations = 0;
const checkoutChanged = resolveTsekInCheckOutIntent(changedCheckout, checkoutFirst.nextIntent, () => {
  checkoutGenerations++;
  return 'checkout-key-2';
});
assert(checkoutChanged.request.idempotencyKey === 'checkout-key-2' && checkoutGenerations === 1, 'Changed checkout generates exactly one new key');

const nightExtension = buildTsekInExtensionBusinessPayload({
  bookingId: ' booking-1 ',
  durationType: 'Daily',
  nights: '2',
  collection: '125.50',
  paymentChannel: 'maya',
});
assert(exactKeys(nightExtension, ['bookingId', 'extension', 'collectionCentavos', 'paymentChannel']), 'Extension payload contains only server-authorized business fields');
assert(nightExtension.extension.type === 'night' && nightExtension.extension.duration === 2, 'Daily extension maps to two nights');
assert(nightExtension.collectionCentavos === 12550, 'Extension collection maps to centavos');

for (const [durationType, hours] of [['3h', 3], ['6h', 6], ['8h', 8], ['12h', 12]] as const) {
  const payload = buildTsekInExtensionBusinessPayload({
    bookingId: 'booking-1', durationType, nights: '1', collection: '', paymentChannel: 'cash',
  });
  assert(payload.extension.type === 'short' && payload.extension.duration === hours, `${durationType} maps to a ${hours}-hour short extension`);
}

const extensionFirst = resolveTsekInExtensionIntent(nightExtension, null, () => 'extension-key-1');
const extensionRetry = resolveTsekInExtensionIntent(nightExtension, extensionFirst.nextIntent, () => 'extension-key-2');
assert(extensionRetry.request.idempotencyKey === 'extension-key-1', 'Identical extension retry reuses its idempotency key');
const changedExtension = { ...nightExtension, collectionCentavos: 20000 };
let extensionGenerations = 0;
const extensionChanged = resolveTsekInExtensionIntent(changedExtension, extensionFirst.nextIntent, () => {
  extensionGenerations++;
  return 'extension-key-2';
});
assert(extensionChanged.request.idempotencyKey === 'extension-key-2' && extensionGenerations === 1, 'Changed extension generates exactly one new key');

const forbiddenFields = [
  'tenantId', 'roomId', 'roomName', 'userId', 'userName', 'actorId',
  'checkOutDate', 'expectedCheckOutDate', 'addedCostCentavos',
  'totalCostCentavos', 'finalPaymentCentavos',
];
for (const field of forbiddenFields) {
  assert(!(field in checkoutFirst.request) && !(field in extensionFirst.request), `Requests exclude browser-controlled ${field}`);
}

const modalCode = readFileSync('src/components/dashboard/hospitality/modals/manage-stay-modal.tsx', 'utf8');
assert(!modalCode.includes('tsek-in-actions'), 'Manage Stay modal no longer imports direct Firestore actions');
assert(!modalCode.includes('checkOutGuest'), 'Manage Stay modal no longer calls checkOutGuest');
assert(!modalCode.includes('extendGuestStay'), 'Manage Stay modal no longer calls extendGuestStay');
assert(modalCode.includes('submitTsekInCheckOut'), 'Manage Stay modal submits through checkout API client');
assert(modalCode.includes('submitTsekInExtension'), 'Manage Stay modal submits through extension API client');
assert(modalCode.includes('inFlightRef.current'), 'Manage Stay modal blocks duplicate in-flight submissions');
assert(modalCode.includes('checkoutIntentRef.current = nextIntent'), 'Checkout intent is retained before the request');
assert(modalCode.includes('extensionIntentRef.current = nextIntent'), 'Extension intent is retained before the request');
assert(modalCode.includes('safeErrorMessage(error)') && !modalCode.includes('catch (e: any)'), 'Only allowlisted client errors are displayed');
assert(!modalCode.includes('datetime-local'), 'Browser cannot choose the authoritative checkout timestamp');
assert(modalCode.includes('server confirms the final balance and checkout timestamp'), 'Checkout UI labels server-authoritative values');
assert(modalCode.includes('server confirms the extension rate and new checkout time'), 'Extension UI labels server-authoritative values');

const dashboardCode = readFileSync('src/components/dashboard/hospitality/tsek-in-dashboard.tsx', 'utf8');
assert(!/checkInGuest|checkOutGuest|extendGuestStay/.test(dashboardCode), 'Dashboard no longer imports legacy stay mutation functions');
assert(!/currentTenantId=|user=|tenantStandardCheckOutTime=/.test(dashboardCode.slice(dashboardCode.indexOf('<ManageStayModal'))), 'Manage Stay receives no tenant, actor, or timestamp authority props');

console.log(`\nRESULT ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
