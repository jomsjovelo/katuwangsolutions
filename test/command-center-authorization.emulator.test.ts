import test from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getCountFromServer,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-katuwang-offline-test';
let testEnv: RulesTestEnvironment;

test.before(async () => {
  const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

test.after(async () => {
  await testEnv?.cleanup();
});

test('Command Center authorization contract', async (t) => {
  const suffix = Date.now().toString();
  const supportUid = `support_${suffix}`;
  const invalidUid = `invalid_${suffix}`;
  const ownerUid = `owner_${suffix}`;

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'admins', supportUid), { role: 'support' }),
      setDoc(doc(db, 'admins', invalidUid), { role: 'owner' }),
      setDoc(doc(db, 'tenants', `active_${suffix}`), {
        ownerUid,
        subscriptionStatus: 'active',
        pricingTier: 'promo_99',
      }),
      setDoc(doc(db, 'tenants', `pending_${suffix}`), {
        ownerUid: `other_${suffix}`,
        subscriptionStatus: 'pending',
        pricingTier: 'standard_199',
      }),
    ]);
  });

  await t.test('signed claim-only administrator can execute dashboard counts', async () => {
    const db = testEnv.authenticatedContext(`claim_admin_${suffix}`, {
      admin: true,
      role: 'admin',
    }).firestore();

    await assertSucceeds(getCountFromServer(collection(db, 'tenants')));
    await assertSucceeds(getCountFromServer(query(
      collection(db, 'tenants'),
      where('subscriptionStatus', '==', 'active'),
    )));
  });

  await t.test('canonical support document can read Command Center counts', async () => {
    const db = testEnv.authenticatedContext(supportUid).firestore();
    await assertSucceeds(getCountFromServer(collection(db, 'tenants')));
  });

  await t.test('invalid administrator document role is denied', async () => {
    const db = testEnv.authenticatedContext(invalidUid).firestore();
    await assertFails(getCountFromServer(collection(db, 'tenants')));
  });

  await t.test('ordinary owner cannot execute a global tenant count', async () => {
    const db = testEnv.authenticatedContext(ownerUid, { role: 'owner' }).firestore();
    await assertFails(getCountFromServer(collection(db, 'tenants')));
  });

  await t.test('only an explicit superadmin can mutate system configuration', async () => {
    const superDb = testEnv.authenticatedContext(`super_${suffix}`, {
      role: 'superadmin',
    }).firestore();
    const generalAdminDb = testEnv.authenticatedContext(`general_admin_${suffix}`, {
      admin: true,
      role: 'admin',
    }).firestore();
    const supportDb = testEnv.authenticatedContext(supportUid).firestore();

    await assertSucceeds(setDoc(doc(superDb, 'system', `command_center_test_${suffix}`), {
      enabled: true,
    }));
    await assertFails(setDoc(doc(supportDb, 'system', `command_center_denied_${suffix}`), {
      enabled: true,
    }));
    await assertFails(setDoc(doc(generalAdminDb, 'system', `command_center_admin_denied_${suffix}`), {
      enabled: true,
    }));
  });
});
