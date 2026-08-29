import * as admin from 'firebase-admin';
import { createStaffLogoutRouteHandler } from '../src/lib/server/staff-logout-handler';

const PROJECT_ID = 'demo-staff-logout-route';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!PROJECT_ID.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(EMULATOR_HOST)) throw new Error('SECURITY_FAIL_CLOSED: emulator isolation violation');
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const app = admin.apps.find((c): c is admin.app.App => c !== null && c.name === 'staff-logout-route-emulator') || admin.initializeApp({ projectId: PROJECT_ID }, 'staff-logout-route-emulator');
const db = app.firestore();

let passed = 0; let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }

async function main() {
  console.log(`STAFF LOGOUT ROUTE EMULATOR TEST ${PROJECT_ID} @ ${EMULATOR_HOST}`);

  const tenantId = `tenant_${Date.now().toString(36)}`;
  const staffRef = db.collection('tenants').doc(tenantId).collection('staff_accounts').doc('cashier-1');

  await db.collection('tenants').doc(tenantId).set({ moduleType: 'benta-snap', subscriptionStatus: 'active' });
  await staffRef.set({ tenantId, authUid: 'uid-1', sessionVersion: 1, status: 'active', activeShiftId: 'shift-1' });

  const auth = { verifyIdToken: async (token: string) => {
    if (token === 'valid') return { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: 'cashier-1', sessionVersion: 1 };
    throw new Error('invalid token');
  }} as any;

  const handler = createStaffLogoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '127.0.0.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 })
  }, { adminAuth: auth, adminFirestore: db });

  // 1. Send valid logout request
  const request = new Request('http://local/api/auth/staff-logout', {
    method: 'POST',
    headers: { 'authorization': 'Bearer valid' }
  });

  const response = await handler(request);
  assert(response.status === 200, 'Logout route returns 200 OK for valid token');

  const data = await response.json();
  assert(data.success === true, 'Response body indicates success');

  const staffDoc = await staffRef.get();
  assert(staffDoc.exists && staffDoc.data()?.sessionVersion === 2, 'Route execution definitively increments authoritative sessionVersion in Firestore (1 -> 2)');

  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
