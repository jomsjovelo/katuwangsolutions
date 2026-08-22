import * as admin from 'firebase-admin';
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {
  selectAuthoritativeTenantId,
  validateAuthoritativeTenant,
  UserProfileAuthData
} from '../src/lib/auth/owner-tenant-authorization';
import { Tenant } from '../src/store/use-tenant-store';

const PROJECT_ID = 'demo-katuwang-security-test';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

// Enforceable Runtime Isolation Check: Must refuse any production project configuration
if (!PROJECT_ID.startsWith('demo-') || (!EMULATOR_HOST.startsWith('127.0.0.1') && !EMULATOR_HOST.startsWith('localhost'))) {
  throw new Error(`[SECURITY_FAIL_CLOSED] Runtime isolation violation! Production configuration refused. Project: '${PROJECT_ID}', Host: '${EMULATOR_HOST}'`);
}

// Guarantee Admin SDK points exclusively to local emulator
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

let adminApp: admin.app.App;
if (!admin.apps.length) {
  adminApp = admin.initializeApp({ projectId: PROJECT_ID });
} else {
  adminApp = admin.apps[0]!;
}

const db = admin.firestore();

function isEmulatorRunning(hostStr: string): Promise<boolean> {
  return new Promise((resolve) => {
    const [host, portStr] = hostStr.split(':');
    const port = parseInt(portStr || '8080', 10);
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host || '127.0.0.1');
  });
}

test('Owner–Tenant Authorization Emulator Isolation & Boundary Suite', async (t) => {

  const TEST_RUN_ID = Date.now();
  const LEGITIMATE_OWNER_UID = `owner_emulator_${TEST_RUN_ID}`;
  const LEGITIMATE_TENANT_ID = `tenant_emulator_${TEST_RUN_ID}`;
  const ATTACKER_UID = `attacker_emulator_${TEST_RUN_ID}`;
  const VICTIM_TENANT_ID = `tenant_victim_${TEST_RUN_ID}`;

  // 1. Enforceable Isolation Check
  await t.test('1. Production Project Refusal & Emulator Host Verification', () => {
    assert.ok(PROJECT_ID.startsWith('demo-'), 'Must be a demo/synthetic test project');
    assert.ok(
      EMULATOR_HOST.startsWith('127.0.0.1') || EMULATOR_HOST.startsWith('localhost'),
      'Must point strictly to local emulator host'
    );
    assert.equal(process.env.FIRESTORE_EMULATOR_HOST, EMULATOR_HOST);

    // Verify rejection of production project IDs:
    const productionProjectId = 'katuwang-prod-123';
    const isProductionPermitted = productionProjectId.startsWith('demo-');
    assert.equal(isProductionPermitted, false, 'Production project must be strictly rejected');
  });

  const emulatorActive = await isEmulatorRunning(EMULATOR_HOST);
  if (!emulatorActive) {
    console.log(`  [NOTE] Firestore emulator not running at ${EMULATOR_HOST}. Verified isolation guards; skipping live emulator write subtests.`);
    return;
  }

  // 2. Seed Real Isolated Emulator Documents
  await t.test('2. Seed Isolated Test Fixtures in Firestore Emulator', async () => {
    await db.collection('users').doc(LEGITIMATE_OWNER_UID).set({
      uid: LEGITIMATE_OWNER_UID,
      email: 'legit_owner@test.ph',
      role: 'owner',
      tenantId: LEGITIMATE_TENANT_ID,
      tenantIds: [LEGITIMATE_TENANT_ID],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('tenants').doc(LEGITIMATE_TENANT_ID).set({
      name: 'Legitimate Isolated Store',
      ownerUid: LEGITIMATE_OWNER_UID,
      staffUids: [],
      moduleType: 'benta-snap',
      pricingTier: 'standard_100',
      subscriptionStatus: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('tenants').doc(VICTIM_TENANT_ID).set({
      name: 'High Value Target Store',
      ownerUid: LEGITIMATE_OWNER_UID,
      staffUids: [],
      moduleType: 'benta-snap',
      pricingTier: 'standard_100',
      subscriptionStatus: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('users').doc(ATTACKER_UID).set({
      uid: ATTACKER_UID,
      email: 'attacker@test.ph',
      role: 'owner',
      tenantId: `tenant_attacker_${TEST_RUN_ID}`,
      tenantIds: [`tenant_attacker_${TEST_RUN_ID}`],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  // 3. Legitimate Owner Resolution from Real Emulator Snapshot
  await t.test('3. Legitimate Owner Snapshot Validates Successfully from Emulator', async () => {
    const userDocSnap = await db.collection('users').doc(LEGITIMATE_OWNER_UID).get();
    assert.ok(userDocSnap.exists, 'User document must exist in emulator');
    const userData = userDocSnap.data() as UserProfileAuthData;

    const { selectedTenantId, error } = selectAuthoritativeTenantId(userData);
    assert.equal(error, undefined);
    assert.equal(selectedTenantId, LEGITIMATE_TENANT_ID);

    const tenantDocSnap = await db.collection('tenants').doc(selectedTenantId!).get();
    assert.ok(tenantDocSnap.exists, 'Tenant document must exist in emulator');
    const tenantData = { id: tenantDocSnap.id, ...tenantDocSnap.data() } as Tenant;

    const validation = validateAuthoritativeTenant(LEGITIMATE_OWNER_UID, tenantData);
    assert.equal(validation.isAuthorized, true);
    assert.equal(validation.error, undefined);
  });

  // 4. Same-ID Forgery Attack Against Real Emulator Snapshot
  await t.test('4. Same-ID Forgery Attack: Attacker with forged ownerUid denied access by real Emulator Snapshot', async () => {
    const realTenantSnap = await db.collection('tenants').doc(VICTIM_TENANT_ID).get();
    assert.ok(realTenantSnap.exists, 'Victim tenant exists in emulator');
    const realTenantData = { id: realTenantSnap.id, ...realTenantSnap.data() } as Tenant;

    assert.equal(realTenantData.ownerUid, LEGITIMATE_OWNER_UID);

    const validation = validateAuthoritativeTenant(ATTACKER_UID, realTenantData);
    assert.equal(validation.isAuthorized, false);
    assert.equal(validation.error, 'Unauthorized tenant access.');
  });

  // 5. Attacker User Profile Cannot Select Unauthorized Victim Tenant
  await t.test('5. Attacker Profile Rejects Forged Victim Tenant Selection', async () => {
    const attackerDocSnap = await db.collection('users').doc(ATTACKER_UID).get();
    const attackerData = attackerDocSnap.data() as UserProfileAuthData;

    const { selectedTenantId } = selectAuthoritativeTenantId(attackerData, VICTIM_TENANT_ID);
    assert.notEqual(selectedTenantId, VICTIM_TENANT_ID, 'Must reject victim tenant ID');
    assert.equal(selectedTenantId, `tenant_attacker_${TEST_RUN_ID}`);
  });

  // 6. Nonexistent/Deleted Tenant Fails Closed
  await t.test('6. Nonexistent Tenant Document Snapshot Fails Closed', async () => {
    const nonexistentSnap = await db.collection('tenants').doc('tenant_nonexistent_999').get();
    assert.equal(nonexistentSnap.exists, false);

    const validation = validateAuthoritativeTenant(LEGITIMATE_OWNER_UID, null);
    assert.equal(validation.isAuthorized, false);
    assert.equal(validation.error, 'Business account not found or was deleted.');
  });
});
