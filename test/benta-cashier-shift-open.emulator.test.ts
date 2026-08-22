import * as admin from 'firebase-admin';
import { CheckoutError, CheckoutErrorCode, completeBentaCashierCheckout } from '../src/lib/server/benta-cashier-checkout';
import { openBentaCashierShift } from '../src/lib/server/benta-cashier-shift-open';
import { closeBentaCashierShift, getCurrentShiftReceipt } from '../src/lib/server/benta-cashier-shift-receipt';
import { disableCashierAccount, LifecycleError, LifecycleErrorCode, removeCashierAccount } from '../src/lib/server/staff-lifecycle';

const PROJECT_ID = 'demo-katuwang-shift-open';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!PROJECT_ID.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(EMULATOR_HOST)) throw new Error('SECURITY_FAIL_CLOSED: emulator isolation violation');
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST; process.env.GCLOUD_PROJECT = PROJECT_ID;
const app = admin.apps.find((candidate): candidate is admin.app.App => candidate !== null && candidate.name === 'shift-open-emulator') || admin.initializeApp({ projectId: PROJECT_ID }, 'shift-open-emulator');
const db = app.firestore();
let passed = 0; let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
async function rejects(fn: () => Promise<unknown>, code: CheckoutErrorCode, message: string) { try { await fn(); assert(false, message); } catch (error) { assert(error instanceof CheckoutError && error.code === code, message); } }

const suffix = Date.now().toString(36); const tenantId = `tenant_open_${suffix}`; const tenantRef = db.collection('tenants').doc(tenantId);
const ownerUid = 'owner-1';
const claims: Record<string, any> = {
  cashier1: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: 'cashier-1', sessionVersion: 1 },
  cashier2: { uid: 'uid-2', role: 'cashier', tenantId, staffAccountId: 'cashier-2', sessionVersion: 1 },
  stale: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: 'cashier-1', sessionVersion: 99 },
  wronguid: { uid: 'wrong-uid', role: 'cashier', tenantId, staffAccountId: 'cashier-1', sessionVersion: 1 },
  wrongtenant: { uid: 'uid-x', role: 'cashier', tenantId: `missing_${suffix}`, staffAccountId: 'cashier-1', sessionVersion: 1 },
  owner: { uid: ownerUid }
};
const auth = { verifyIdToken: async (token: string) => { if (!claims[token]) throw new Error('invalid'); return claims[token]; } } as any;
const service = { adminAuth: auth, adminFirestore: db };
let keyCounter = 0;
function key() { return `423e4567-e89b-42d3-a456-${(426614174000 + keyCounter++).toString().padStart(12, '0')}`; }
function openRequest(startingCashCentavos: number, idempotencyKey = key()) { return { idempotencyKey, startingCashCentavos }; }
function checkoutRequest(shiftId: string, idempotencyKey = key()) { return { idempotencyKey, moduleId: 'benta-snap', shiftId, items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash' }; }

async function seed() {
  await Promise.all([
    tenantRef.set({ ownerUid, moduleType: 'benta-snap', subscriptionStatus: 'active' }),
    tenantRef.collection('staff_accounts').doc('cashier-1').set({ tenantId, authUid: 'uid-1', sessionVersion: 1, status: 'active', username: 'Maria' }),
    tenantRef.collection('staff_accounts').doc('cashier-2').set({ tenantId, authUid: 'uid-2', sessionVersion: 1, status: 'active', username: 'Jose' }),
    tenantRef.collection('accounts').doc('master-cash').set({ id: 'master-cash', tenantId, balance: 0 }),
    tenantRef.collection('products').doc('p1').set({ tenantId, isActive: true, name: 'Rice', unit: 'bag', salePrice: 10_000, costPrice: 5_000, currentStock: 20 })
  ]);
}

async function captureRelevantState() {
  const names = [
    'staff_accounts', 'shifts', 'audit_log', 'cashier_shift_open_idempotency', 'cashier_checkout_idempotency',
    'accounts', 'products', 'sales', 'transactions', 'inventory_transactions'
  ];
  const snapshots = await Promise.all(names.map((name) => tenantRef.collection(name).get()));
  return JSON.stringify(Object.fromEntries(snapshots.map((snapshot, index) => [
    names[index], snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() })).sort((a, b) => a.id.localeCompare(b.id))
  ])));
}

async function main() {
  console.log(`BENTA SECURE SHIFT OPEN EMULATOR ${PROJECT_ID} @ ${EMULATOR_HOST}`); await seed();
  await rejects(() => openBentaCashierShift('stale', openRequest(0), service), CheckoutErrorCode.SESSION_INVALID, 'stale session is rejected');
  await rejects(() => openBentaCashierShift('wronguid', openRequest(0), service), CheckoutErrorCode.SESSION_INVALID, 'mismatched UID is rejected');
  await rejects(() => openBentaCashierShift('wrongtenant', openRequest(0), service), CheckoutErrorCode.OPERATION_NOT_PERMITTED, 'wrong tenant is rejected');
  await tenantRef.collection('staff_accounts').doc('cashier-1').update({ status: 'disabled' });
  await rejects(() => openBentaCashierShift('cashier1', openRequest(0), service), CheckoutErrorCode.SESSION_INVALID, 'disabled Cashier is rejected');
  await tenantRef.collection('staff_accounts').doc('cashier-1').update({ status: 'active' });
  await tenantRef.update({ moduleType: 'build-stack' });
  await rejects(() => openBentaCashierShift('cashier1', openRequest(0), service), CheckoutErrorCode.CHECKOUT_UNAVAILABLE, 'wrong module is rejected');
  await tenantRef.update({ moduleType: 'benta-snap', subscriptionStatus: 'suspended' });
  await rejects(() => openBentaCashierShift('cashier1', openRequest(0), service), CheckoutErrorCode.CHECKOUT_UNAVAILABLE, 'inactive subscription is rejected');
  await tenantRef.update({ subscriptionStatus: 'active' });

  const requestA = openRequest(100_000); const requestB = openRequest(200_000);
  const concurrent = await Promise.allSettled([openBentaCashierShift('cashier1', requestA, service), openBentaCashierShift('cashier1', requestB, service)]);
  assert(concurrent.filter((result) => result.status === 'fulfilled').length === 1 && concurrent.filter((result) => result.status === 'rejected').length === 1, 'same-Cashier concurrent opening produces one success and one rejection');
  const winningIndex = concurrent.findIndex((result) => result.status === 'fulfilled');
  const winningRequest = winningIndex === 0 ? requestA : requestB;
  const first = (concurrent[winningIndex] as PromiseFulfilledResult<any>).value;
  const staff1Ref = tenantRef.collection('staff_accounts').doc('cashier-1');
  const staff1 = (await staff1Ref.get()).data()!;
  const firstShift = (await tenantRef.collection('shifts').doc(first.shiftId).get()).data()!;
  assert(staff1.activeShiftId === first.shiftId && firstShift.id === first.shiftId && firstShift.staffAccountId === 'cashier-1', 'one canonical pointer and bidirectional secure shift are committed');
  assert(firstShift.startingCash === winningRequest.startingCashCentavos && firstShift.cashSales === 0 && firstShift.saleCount === 0, 'authoritative starting cash is immutable and accounting starts at zero');
  const firstShifts = await tenantRef.collection('shifts').where('staffAccountId', '==', 'cashier-1').get();
  const openAudits = await tenantRef.collection('audit_log').where('action', '==', 'open_shift').get();
  const openIdempotency = await tenantRef.collection('cashier_shift_open_idempotency').get();
  assert(firstShifts.size === 1 && openAudits.size === 1 && openIdempotency.size === 1, 'losing concurrent request creates no orphan shift, audit, or idempotency record');
  const replayState = await captureRelevantState();
  const replay = await openBentaCashierShift('cashier1', winningRequest, service);
  assert(replay.shiftId === first.shiftId && await captureRelevantState() === replayState, 'open-shift replay with the correct pointer preserves all relevant documents');
  await rejects(() => openBentaCashierShift('cashier1', { ...winningRequest, startingCashCentavos: winningRequest.startingCashCentavos + 1 }, service), CheckoutErrorCode.IDEMPOTENCY_CONFLICT, 'same opening key with different starting cash conflicts');

  const firstShiftRef = tenantRef.collection('shifts').doc(first.shiftId);
  const expectOpenReplayRecovery = async (label: string, pointer: string | null, target?: Record<string, unknown>) => {
    if (target && pointer) await tenantRef.collection('shifts').doc(pointer).set(target);
    await staff1Ref.update(pointer === null ? { activeShiftId: admin.firestore.FieldValue.delete() } : { activeShiftId: pointer });
    const before = await captureRelevantState();
    await rejects(() => openBentaCashierShift('cashier1', winningRequest, service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, `open-shift replay with ${label} fails closed`);
    assert(await captureRelevantState() === before, `open-shift replay with ${label} preserves all relevant documents`);
    await staff1Ref.update({ activeShiftId: first.shiftId });
    if (target && pointer) await tenantRef.collection('shifts').doc(pointer).delete();
  };
  await expectOpenReplayRecovery('missing pointer', null);
  await expectOpenReplayRecovery('malformed pointer', 'bad/value');
  await expectOpenReplayRecovery('dangling pointer', 'missing-shift');
  await expectOpenReplayRecovery('different valid pointer', 'different-open-shift', { ...firstShift, id: 'different-open-shift', status: 'open' });
  await expectOpenReplayRecovery('corrupted pointer target', 'corrupted-open-shift', { ...firstShift, id: 'contradictory-id', status: 'open' });
  await firstShiftRef.update({ id: 'contradictory-id' });
  const corruptOriginalReplayState = await captureRelevantState();
  await rejects(() => openBentaCashierShift('cashier1', winningRequest, service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'opening replay rejects original stored id that contradicts the Firestore document id');
  assert(await captureRelevantState() === corruptOriginalReplayState, 'corrupted original replay preserves all relevant documents');
  await rejects(() => openBentaCashierShift('cashier1', openRequest(0), service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'active-pointer opening rejects corrupted bidirectional shift identity');
  await rejects(() => completeBentaCashierCheckout('cashier1', checkoutRequest(first.shiftId), service), CheckoutErrorCode.RECONCILIATION_INVALID, 'checkout rejects corrupted bidirectional shift identity');
  await rejects(() => closeBentaCashierShift('cashier1', { shiftId: first.shiftId, endingCashCentavos: 0 }, service), CheckoutErrorCode.RECONCILIATION_INVALID, 'shift close rejects corrupted bidirectional shift identity');
  assert(await captureRelevantState() === corruptOriginalReplayState, 'opening, checkout, and close corruption rejections create no mutations');
  await firstShiftRef.update({ id: first.shiftId });

  const wrongShiftId = 'not-authoritative';
  await tenantRef.collection('shifts').doc(wrongShiftId).set({ ...firstShift, id: wrongShiftId, status: 'open' });
  await rejects(() => completeBentaCashierCheckout('cashier1', checkoutRequest(wrongShiftId), service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'checkout rejects a non-pointer shift');
  await tenantRef.collection('shifts').doc(wrongShiftId).update({ status: 'closed' });
  const saleRequest = checkoutRequest(first.shiftId); const sale = await completeBentaCashierCheckout('cashier1', saleRequest, service);
  assert((await getCurrentShiftReceipt('cashier1', sale.saleId, service)).saleId === sale.saleId, 'receipt requires and accepts authoritative active pointer');
  await firstShiftRef.update({ id: 'contradictory-id' });
  const corruptReceiptState = await captureRelevantState();
  await rejects(() => getCurrentShiftReceipt('cashier1', sale.saleId, service), CheckoutErrorCode.RECEIPT_UNAVAILABLE, 'receipt retrieval rejects corrupted bidirectional shift identity');
  assert(await captureRelevantState() === corruptReceiptState, 'receipt corruption rejection preserves all relevant documents');
  await firstShiftRef.update({ id: first.shiftId });
  await rejects(() => closeBentaCashierShift('cashier1', { shiftId: wrongShiftId, endingCashCentavos: 0 }, service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'close rejects pointer mismatch');
  await closeBentaCashierShift('cashier1', { shiftId: first.shiftId, endingCashCentavos: winningRequest.startingCashCentavos + 10_000 }, service);
  assert(!Object.prototype.hasOwnProperty.call((await staff1Ref.get()).data()!, 'activeShiftId'), 'close atomically clears matching active pointer');
  assert((await completeBentaCashierCheckout('cashier1', saleRequest, service)).saleId === sale.saleId, 'completed checkout replay remains valid after closure');
  await rejects(() => completeBentaCashierCheckout('cashier1', checkoutRequest(first.shiftId), service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'new checkout after close fails');
  const closedNoPointerState = await captureRelevantState();
  const openReplay = await openBentaCashierShift('cashier1', winningRequest, service);
  assert(openReplay.shiftId === first.shiftId && openReplay.status === 'closed' && await captureRelevantState() === closedNoPointerState, 'closed-shift replay without a pointer preserves all relevant documents');
  const expectClosedReplayRecovery = async (label: string, pointer: string, target?: Record<string, unknown>) => {
    if (target) await tenantRef.collection('shifts').doc(pointer).set(target);
    await staff1Ref.update({ activeShiftId: pointer });
    const before = await captureRelevantState();
    await rejects(() => openBentaCashierShift('cashier1', winningRequest, service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, `closed-shift replay with ${label} fails closed`);
    assert(await captureRelevantState() === before, `closed-shift replay with ${label} preserves all relevant documents`);
    await staff1Ref.update({ activeShiftId: admin.firestore.FieldValue.delete() });
    if (target) await tenantRef.collection('shifts').doc(pointer).delete();
  };
  await expectClosedReplayRecovery('stale pointer to the original shift', first.shiftId);
  await expectClosedReplayRecovery('malformed pointer', 'bad/value');
  await expectClosedReplayRecovery('dangling pointer', 'missing-shift');
  const newerShiftId = 'newer-valid-shift';
  await tenantRef.collection('shifts').doc(newerShiftId).set({ ...firstShift, id: newerShiftId, status: 'open' });
  await staff1Ref.update({ activeShiftId: newerShiftId });
  const validNewerState = await captureRelevantState();
  const historicalReplay = await openBentaCashierShift('cashier1', winningRequest, service);
  assert(historicalReplay.shiftId === first.shiftId && historicalReplay.status === 'closed' && await captureRelevantState() === validNewerState, 'closed-shift replay validates a legitimate newer active shift and remains mutation-free');
  await tenantRef.collection('shifts').doc(newerShiftId).update({ id: 'contradictory-id' });
  const corruptNewerState = await captureRelevantState();
  await rejects(() => openBentaCashierShift('cashier1', winningRequest, service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'closed-shift replay rejects a corrupted newer active shift');
  assert(await captureRelevantState() === corruptNewerState, 'corrupted newer-shift replay preserves all relevant documents');
  await staff1Ref.update({ activeShiftId: admin.firestore.FieldValue.delete() });
  await tenantRef.collection('shifts').doc(newerShiftId).delete();

  for (const [label, pointer, shiftData] of [
    ['missing pointer target', 'missing-shift', null],
    ['malformed pointer', 'bad/value', null],
    ['closed referenced shift', first.shiftId, firstShift],
    ['legacy referenced shift', 'legacy-shift', { tenantId, staffId: 'staff_cashier-1', status: 'open' }],
    ['another Cashier shift', 'other-shift', { ...firstShift, id: 'other-shift', staffAccountId: 'cashier-2', staffId: 'staff_cashier-2', openedBy: 'staff_cashier-2', status: 'open' }]
  ] as const) {
    if (shiftData) await tenantRef.collection('shifts').doc(pointer).set({ ...shiftData, status: label === 'closed referenced shift' ? 'closed' : shiftData.status });
    await staff1Ref.update({ activeShiftId: pointer }); const before = JSON.stringify((await staff1Ref.get()).data());
    await rejects(() => openBentaCashierShift('cashier1', openRequest(0), service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, `${label} fails closed`);
    assert(JSON.stringify((await staff1Ref.get()).data()) === before, `${label} is not repaired`);
    await staff1Ref.update({ activeShiftId: admin.firestore.FieldValue.delete() });
    if (shiftData && pointer !== first.shiftId) await tenantRef.collection('shifts').doc(pointer).update({ status: 'closed' });
  }
  await tenantRef.collection('shifts').doc('orphan-open').set({ ...firstShift, id: 'orphan-open', status: 'open' });
  await rejects(() => openBentaCashierShift('cashier1', openRequest(0), service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'open secure shift without pointer blocks opening');
  await tenantRef.collection('shifts').doc('orphan-open').update({ status: 'closed' });
  await tenantRef.collection('shifts').doc('orphan-legacy').set({ tenantId, staffId: 'staff_cashier-1', status: 'open' });
  await rejects(() => openBentaCashierShift('cashier1', openRequest(0), service), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'open legacy shift without pointer blocks opening');
  await tenantRef.collection('shifts').doc('orphan-legacy').update({ status: 'closed' });

  const sharedKey = key();
  const [next1, next2] = await Promise.all([
    openBentaCashierShift('cashier1', openRequest(300_000, sharedKey), service),
    openBentaCashierShift('cashier2', openRequest(400_000, sharedKey), service)
  ]);
  const [staff1Next, staff2Next] = await Promise.all([staff1Ref.get(), tenantRef.collection('staff_accounts').doc('cashier-2').get()]);
  assert(next1.shiftId !== next2.shiftId && staff1Next.data()!.activeShiftId === next1.shiftId && staff2Next.data()!.activeShiftId === next2.shiftId, 'different Cashiers concurrently open independent shifts even with the same key');
  assert((await tenantRef.collection('shifts').doc(next1.shiftId).get()).data()!.startingCash === 300_000 && (await tenantRef.collection('shifts').doc(next2.shiftId).get()).data()!.startingCash === 400_000, 'multiple-Cashier shifts retain correct independent attribution and cash');

  try { await removeCashierAccount({ ownerToken: 'owner', tenantId, staffAccountId: 'cashier-1' }, service); assert(false, 'removal while active is denied'); }
  catch (error) { assert(error instanceof LifecycleError && error.code === LifecycleErrorCode.ACTIVE_SHIFT_EXISTS, 'removal while active is denied'); }
  await closeBentaCashierShift('cashier1', { shiftId: next1.shiftId, endingCashCentavos: 300_000 }, service);
  await removeCashierAccount({ ownerToken: 'owner', tenantId, staffAccountId: 'cashier-1' }, service);
  assert(!(await staff1Ref.get()).exists, 'removal after authoritative shift resolution remains permitted');
  await disableCashierAccount({ ownerToken: 'owner', tenantId, staffAccountId: 'cashier-2' }, service);
  const disabledStaff = (await tenantRef.collection('staff_accounts').doc('cashier-2').get()).data()!;
  assert(disabledStaff.status === 'disabled' && disabledStaff.activeShiftId === next2.shiftId && disabledStaff.sessionVersion === 2, 'disable revokes session without deleting active-shift accounting identity');
  try { await removeCashierAccount({ ownerToken: 'owner', tenantId, staffAccountId: 'cashier-2' }, service); assert(false, 'disabled active Cashier removal remains denied'); }
  catch (error) { assert(error instanceof LifecycleError && error.code === LifecycleErrorCode.ACTIVE_SHIFT_EXISTS, 'disabled active Cashier removal remains denied'); }

  console.log(`RESULT ${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
