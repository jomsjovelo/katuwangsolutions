import * as admin from 'firebase-admin';
import { CheckoutError, CheckoutErrorCode } from '../src/lib/server/cashier-server-authorization';
import { revokeStaffSession } from '../src/lib/server/staff-logout-handler';

let passed = 0; let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
async function rejects(fn: () => Promise<unknown>, code: CheckoutErrorCode, message: string) { try { await fn(); assert(false, message); } catch (error) { assert(error instanceof CheckoutError && error.code === code, message); } }
function memory(seed: Record<string, any>, fail = false) {
  const store = structuredClone(seed);
  const collection = (path: string): any => ({ doc: (id: string) => ({ id, path: `${path}/${id}`, collection: (child: string) => collection(`${path}/${id}/${child}`) }) });
  const snapshot = (ref: any, source: Record<string, any>) => ({ id: ref.id, exists: source[ref.path] !== undefined, data: () => source[ref.path] });
  return { store, db: { collection, runTransaction: async (work: (transaction: any) => Promise<unknown>) => {
    const staged = structuredClone(store);
    const result = await work({ getAll: async (...refs: any[]) => refs.map((ref) => snapshot(ref, staged)), update: (ref: any, data: any) => { staged[ref.path] = { ...staged[ref.path], ...data }; } });
    if (fail) throw new Error('storage failed'); Object.keys(store).forEach((key) => delete store[key]); Object.assign(store, staged); return result;
  } } as any };
}
const tenantId = 'tenant-1'; const staffId = 'cashier-1';
const claims: Record<string, any> = {
  old: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: staffId, sessionVersion: 1 },
  fresh: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: staffId, sessionVersion: 2 },
  stale: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: staffId, sessionVersion: 0 }
};
const auth = { verifyIdToken: async (token: string) => { if (!claims[token]) throw new Error('raw token failure'); return claims[token]; } } as any;
const seed = {
  [`tenants/${tenantId}`]: { moduleType: 'benta-snap', subscriptionStatus: 'active' },
  [`tenants/${tenantId}/staff_accounts/${staffId}`]: { tenantId, authUid: 'uid-1', sessionVersion: 1, status: 'active', activeShiftId: 'shift-1' },
  [`tenants/${tenantId}/shifts/shift-1`]: { id: 'shift-1', status: 'open', totalShiftSales: 500 },
  [`tenants/${tenantId}/accounts/master-cash`]: { balance: 500 },
  [`tenants/${tenantId}/products/p1`]: { currentStock: 4 },
  [`tenants/${tenantId}/sales/sale-1`]: { totalAmount: 500 }
};

async function main() {
  console.log('STAFF LOGOUT HANDLER UNIT TESTS');
  const state = memory(seed); const protectedBefore = JSON.stringify({ shift: state.store[`tenants/${tenantId}/shifts/shift-1`], account: state.store[`tenants/${tenantId}/accounts/master-cash`], product: state.store[`tenants/${tenantId}/products/p1`], sale: state.store[`tenants/${tenantId}/sales/sale-1`] });
  assert((await revokeStaffSession('old', { adminAuth: auth, adminFirestore: state.db, now: () => admin.firestore.Timestamp.fromMillis(1_700_000_000_000) })).success, 'valid Cashier logout succeeds');
  const staff = state.store[`tenants/${tenantId}/staff_accounts/${staffId}`];
  assert(staff.sessionVersion === 2 && staff.activeShiftId === 'shift-1', 'logout rotates session exactly once and preserves activeShiftId');
  assert(JSON.stringify({ shift: state.store[`tenants/${tenantId}/shifts/shift-1`], account: state.store[`tenants/${tenantId}/accounts/master-cash`], product: state.store[`tenants/${tenantId}/products/p1`], sale: state.store[`tenants/${tenantId}/sales/sale-1`] }) === protectedBefore, 'logout mutates no shift, financial, stock, or receipt record');
  await rejects(() => revokeStaffSession('old', { adminAuth: auth, adminFirestore: state.db }), CheckoutErrorCode.SESSION_INVALID, 'old token is rejected after rotation');
  assert((await revokeStaffSession('fresh', { adminAuth: auth, adminFirestore: state.db })).success && state.store[`tenants/${tenantId}/staff_accounts/${staffId}`].sessionVersion === 3, 'newly authenticated current-session token can revoke a later session');

  const corrupt = memory({ ...seed, [`tenants/${tenantId}/staff_accounts/${staffId}`]: { ...seed[`tenants/${tenantId}/staff_accounts/${staffId}`], activeShiftId: 'bad/value' } });
  await revokeStaffSession('old', { adminAuth: auth, adminFirestore: corrupt.db });
  assert(corrupt.store[`tenants/${tenantId}/staff_accounts/${staffId}`].activeShiftId === 'bad/value', 'corrupt shift pointer does not block revocation and is not repaired');
  const disabled = memory({ ...seed, [`tenants/${tenantId}/staff_accounts/${staffId}`]: { ...seed[`tenants/${tenantId}/staff_accounts/${staffId}`], status: 'disabled' } });
  await rejects(() => revokeStaffSession('old', { adminAuth: auth, adminFirestore: disabled.db }), CheckoutErrorCode.SESSION_INVALID, 'disabled Cashier fails safely');
  await rejects(() => revokeStaffSession('stale', { adminAuth: auth, adminFirestore: memory(seed).db }), CheckoutErrorCode.SESSION_INVALID, 'stale identity fails safely');
  await rejects(() => revokeStaffSession('invalid-token', { adminAuth: auth, adminFirestore: memory(seed).db }), CheckoutErrorCode.AUTHENTICATION_REQUIRED, 'invalid token error is sanitized');
  const storage = memory(seed, true); await rejects(() => revokeStaffSession('old', { adminAuth: auth, adminFirestore: storage.db }), CheckoutErrorCode.SERVICE_UNAVAILABLE, 'transaction failure is sanitized');
  assert(storage.store[`tenants/${tenantId}/staff_accounts/${staffId}`].sessionVersion === 1, 'failed transaction creates no partial revocation');
  console.log(`RESULT ${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
