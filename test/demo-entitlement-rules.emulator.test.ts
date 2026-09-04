import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;
const projectId = 'demo-katuwang-entitlement-rules';

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'tenants', 'tenant-owner'), {
      ownerUid: 'owner-1',
      ownerEmail: 'owner@example.com',
      moduleType: 'benta-snap',
      subscriptionStatus: 'active',
      pricingTier: 'promo_99',
      staffUids: [],
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('ordinary owners cannot self-unlock modules or self-activate', async () => {
  const db = testEnv.authenticatedContext('owner-1', { role: 'owner' }).firestore();
  const tenant = doc(db, 'tenants', 'tenant-owner');
  await assertFails(updateDoc(tenant, { unlockedModules: ['tsek-in'] }));
  await assertSucceeds(updateDoc(tenant, { subscriptionStatus: 'pending' }));
  await assertFails(updateDoc(tenant, { subscriptionStatus: 'active' }));
});

test('ordinary owners can still submit a payment activation request', async () => {
  const db = testEnv.authenticatedContext('owner-1', { role: 'owner' }).firestore();
  await assertSucceeds(updateDoc(doc(db, 'tenants', 'tenant-owner'), {
    pendingModuleRequests: [{ moduleId: 'tsek-in', requestedAt: '2026-09-04T00:00:00.000Z' }],
    lastPaymentRequestedModule: 'tsek-in',
  }));
});

test('new customer tenants must start pending and cannot pre-seed entitlements', async () => {
  const db = testEnv.authenticatedContext('owner-2', { role: 'owner', email: 'owner2@example.com' }).firestore();
  const base = {
    ownerUid: 'owner-2',
    ownerEmail: 'owner2@example.com',
    moduleType: 'benta-snap',
    pricingTier: 'promo_99',
    staffUids: [],
  };
  await assertFails(setDoc(doc(db, 'tenants', 'forged-active'), { ...base, subscriptionStatus: 'active' }));
  await assertFails(setDoc(doc(db, 'tenants', 'forged-unlocked'), {
    ...base,
    subscriptionStatus: 'pending',
    unlockedModules: ['tsek-in'],
  }));
  await assertSucceeds(setDoc(doc(db, 'tenants', 'valid-pending'), { ...base, subscriptionStatus: 'pending' }));
});
