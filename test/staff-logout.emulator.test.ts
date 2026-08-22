import * as admin from 'firebase-admin';
import { getBentaCashierBootstrap } from '../src/lib/server/benta-cashier-bootstrap';
import { CheckoutError, CheckoutErrorCode } from '../src/lib/server/cashier-server-authorization';
import { revokeStaffSession } from '../src/lib/server/staff-logout-handler';

const PROJECT_ID = 'demo-katuwang-staff-logout';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!PROJECT_ID.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(EMULATOR_HOST)) throw new Error('SECURITY_FAIL_CLOSED: logout emulator isolation violation');
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST; process.env.GCLOUD_PROJECT = PROJECT_ID;
const app = admin.apps.find((candidate): candidate is admin.app.App => candidate !== null && candidate.name === 'staff-logout-emulator') || admin.initializeApp({ projectId: PROJECT_ID }, 'staff-logout-emulator');
const db = app.firestore();
let passed = 0; let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
async function rejects(fn: () => Promise<unknown>, code: CheckoutErrorCode, message: string) { try { await fn(); assert(false, message); } catch (error) { assert(error instanceof CheckoutError && error.code === code, message); } }

const suffix = Date.now().toString(36); const tenantId = `tenant_logout_${suffix}`; const tenantRef = db.collection('tenants').doc(tenantId); const staffRef = tenantRef.collection('staff_accounts').doc('cashier-1');
const claims: Record<string, any> = {
  old: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: 'cashier-1', sessionVersion: 1 },
  new: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: 'cashier-1', sessionVersion: 2 },
  latest: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: 'cashier-1', sessionVersion: 3 },
  stale: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: 'cashier-1', sessionVersion: 0 }
};
const auth = { verifyIdToken: async (token: string) => { if (!claims[token]) throw new Error('invalid'); return claims[token]; } } as any;
const service = { adminAuth: auth, adminFirestore: db };
const shift = { id: 'shift-1', tenantId, moduleId: 'benta-snap', staffAccountId: 'cashier-1', staffId: 'staff_cashier-1', openedBy: 'staff_cashier-1', status: 'open', reconciliationVersion: 1, startingCash: 100_000, cashSales: 500, gcashSales: 0, mayaSales: 0, totalShiftSales: 500, electronicReceipts: 0, physicalCashAdjustments: 0, saleCount: 1, openedAt: admin.firestore.Timestamp.now() };

async function protectedState() {
  const refs = [tenantRef.collection('shifts').doc('shift-1'), tenantRef.collection('accounts').doc('master-cash'), tenantRef.collection('products').doc('p1'), tenantRef.collection('sales').doc('sale-1')];
  const snapshots = await db.getAll(...refs); return JSON.stringify(snapshots.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() })));
}

async function seed() {
  await Promise.all([
    tenantRef.set({ name: 'Logout Store', moduleType: 'benta-snap', subscriptionStatus: 'active' }),
    staffRef.set({ tenantId, authUid: 'uid-1', sessionVersion: 1, status: 'active', username: 'Maria', activeShiftId: 'shift-1' }),
    tenantRef.collection('shifts').doc('shift-1').set(shift),
    tenantRef.collection('accounts').doc('master-cash').set({ id: 'master-cash', tenantId, balance: 500 }),
    tenantRef.collection('products').doc('p1').set({ tenantId, isActive: true, name: 'Rice', unit: 'bag', salePrice: 500, costPrice: 300, currentStock: 4 }),
    tenantRef.collection('sales').doc('sale-1').set({ tenantId, shiftId: 'shift-1', totalAmount: 500 })
  ]);
}

async function main() {
  console.log(`STAFF LOGOUT EMULATOR ${PROJECT_ID} @ ${EMULATOR_HOST}`); await seed();
  const before = await protectedState();
  const concurrent = await Promise.allSettled([revokeStaffSession('old', service), revokeStaffSession('old', service)]);
  assert(concurrent.filter((result) => result.status === 'fulfilled').length === 1 && concurrent.filter((result) => result.status === 'rejected').length === 1, 'concurrent old-token logout advances exactly one transaction');
  const staffAfter = (await staffRef.get()).data()!;
  assert(staffAfter.sessionVersion === 2 && staffAfter.activeShiftId === 'shift-1', 'session rotates once while authoritative activeShiftId remains recoverable');
  assert(await protectedState() === before, 'concurrent logout mutates no shift, financial, stock, or receipt record');
  await rejects(() => revokeStaffSession('old', service), CheckoutErrorCode.SESSION_INVALID, 'replayed old-token logout fails safely');
  await rejects(() => getBentaCashierBootstrap('old', service), CheckoutErrorCode.SESSION_INVALID, 'old token fails later authoritative Cashier validation');
  const recovered = await getBentaCashierBootstrap('new', service);
  assert(recovered.currentShift?.id === 'shift-1', 'new secure current-session authentication recovers the still-open shift');

  await staffRef.update({ activeShiftId: 'bad/value' });
  const corruptPointerProtected = await protectedState();
  assert((await revokeStaffSession('new', service)).success, 'logout prioritizes revocation despite a corrupt shift pointer');
  const corruptAfter = (await staffRef.get()).data()!;
  assert(corruptAfter.sessionVersion === 3 && corruptAfter.activeShiftId === 'bad/value', 'corrupt pointer remains unchanged while session is revoked');
  assert(await protectedState() === corruptPointerProtected, 'corrupt-pointer logout creates no accounting or financial mutation');
  await rejects(() => revokeStaffSession('new', service), CheckoutErrorCode.SESSION_INVALID, 'second use of the prior session token fails safely');
  await staffRef.update({ status: 'disabled' });
  await rejects(() => revokeStaffSession('latest', service), CheckoutErrorCode.SESSION_INVALID, 'disabled Cashier identity fails safely');
  await staffRef.update({ status: 'active' });
  await rejects(() => revokeStaffSession('stale', service), CheckoutErrorCode.SESSION_INVALID, 'stale Cashier identity fails safely');
  console.log(`RESULT ${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
