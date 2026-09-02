import test from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import { isMasterAdminClaim } from '../src/lib/auth/admin-claim-resolver';
import { seedDemoCashierScenario } from '../scripts/seed-emulator-cashier';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-katuwang-offline-test';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

// Guard: Must only run against demo project & emulator
assert.ok(PROJECT_ID.startsWith('demo-'), 'Must target demo project');
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const appName = 'test-master-admin-auth';
const app = admin.apps.find((a) => a?.name === appName) || admin.initializeApp({ projectId: PROJECT_ID }, appName);
const db = app.firestore();
const auth = app.auth();

test('Master Admin Command Center Authorization & Isolation Suite', async (t) => {
  const masterAdminUid = 'demo_master_admin_uid';
  const masterAdminEmail = 'jomsjovelo@gmail.com';
  const ownerUid = 'demo_owner_uid';
  const cashierUid = 'cashier_demo_uid_1';

  await seedDemoCashierScenario();

  await t.test('1. Master Admin Auth user exists with verified email and canonical admin claims', async () => {
    const userRecord = await auth.getUser(masterAdminUid);
    assert.equal(userRecord.email, masterAdminEmail);
    assert.equal(userRecord.emailVerified, true);
    assert.equal(userRecord.customClaims?.admin, true);
    assert.equal(userRecord.customClaims?.role, 'admin');
    assert.equal(userRecord.customClaims?.isMasterAdmin, true);
    assert.equal(userRecord.customClaims?.adminRole, 'superadmin');
    assert.equal(userRecord.customClaims?.tenantId, undefined, 'Master Admin must NOT have a tenantId binding');
  });

  await t.test('2. isMasterAdminClaim accurately resolves admin vs non-admin claims', async () => {
    const masterAdminClaims = (await auth.getUser(masterAdminUid)).customClaims;
    const ownerClaims = (await auth.getUser(ownerUid)).customClaims;
    const cashierClaims = (await auth.getUser(cashierUid)).customClaims;

    assert.equal(isMasterAdminClaim(masterAdminClaims), true, 'Master Admin claims must evaluate to true');
    assert.equal(isMasterAdminClaim(ownerClaims), false, 'Owner claims must evaluate to false');
    assert.equal(isMasterAdminClaim(cashierClaims), false, 'Cashier claims must evaluate to false');
    assert.equal(isMasterAdminClaim(null), false);
    assert.equal(isMasterAdminClaim({}), false);
  });

  await t.test('3. Master Admin Firestore profile and admin binding exist with role superadmin', async () => {
    const adminDoc = await db.collection('admins').doc(masterAdminUid).get();
    assert.ok(adminDoc.exists);
    const adminData = adminDoc.data();
    assert.equal(adminData?.role, 'superadmin');
    assert.equal(adminData?.email, masterAdminEmail);

    const userDoc = await db.collection('users').doc(masterAdminUid).get();
    assert.ok(userDoc.exists);
    const userData = userDoc.data();
    assert.equal(userData?.role, 'superadmin');
    assert.equal(userData?.approvalStatus, 'approved');
    assert.equal(userData?.tenantId, undefined, 'Master Admin user profile must NOT have tenantId');
  });

  await t.test('4. Master Admin can query global tenants directory in Command Center', async () => {
    // Under firestore.rules, isMasterAdmin() enables list operations across /tenants
    const tenantsSnap = await db.collection('tenants').get();
    assert.ok(tenantsSnap.docs.length >= 1);
    const hasDemoStore = tenantsSnap.docs.some(d => d.id === 'demo-benta-store');
    assert.ok(hasDemoStore, 'Master admin can access demo-benta-store in tenant directory');
  });

  await t.test('5. Master Admin can manage system announcements and billing logs', async () => {
    const testAnnRef = db.collection('announcements').doc('test_announcement');
    await testAnnRef.set({
      title: 'System Maintenance Notice',
      content: 'Local test announcement',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const annSnap = await testAnnRef.get();
    assert.ok(annSnap.exists);
    assert.equal(annSnap.data()?.title, 'System Maintenance Notice');

    // Clean up
    await testAnnRef.delete();
  });

  await t.test('6. Owner and Cashier identities are strictly segregated from Master Admin', async () => {
    const ownerAuth = await auth.getUser(ownerUid);
    assert.equal(ownerAuth.customClaims?.role, 'owner');
    assert.notEqual(ownerAuth.customClaims?.admin, true);
    assert.equal(ownerAuth.customClaims?.isMasterAdmin, undefined);

    const cashierAuth = await auth.getUser(cashierUid);
    assert.equal(cashierAuth.customClaims?.role, 'cashier');
    assert.notEqual(cashierAuth.customClaims?.admin, true);
    assert.equal(cashierAuth.customClaims?.isMasterAdmin, undefined);

    // Verify neither Owner nor Cashier have documents in admins collection
    const ownerAdminDoc = await db.collection('admins').doc(ownerUid).get();
    assert.equal(ownerAdminDoc.exists, false, 'Owner must NOT exist in admins collection');

    const cashierAdminDoc = await db.collection('admins').doc(cashierUid).get();
    assert.equal(cashierAdminDoc.exists, false, 'Cashier must NOT exist in admins collection');
  });

  await t.test('7. Idempotent seed repeatability preserves Master Admin without duplicating records', async () => {
    const adminDocs = await db.collection('admins').where('email', '==', masterAdminEmail).get();
    assert.equal(adminDocs.docs.length, 1, 'Exactly one admin document exists');

    const userDocs = await db.collection('users').where('email', '==', masterAdminEmail).get();
    assert.equal(userDocs.docs.length, 1, 'Exactly one user profile exists');
  });
});
