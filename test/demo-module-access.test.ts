import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { activeModules } from '@/lib/app-data';
import {
  demoTenantIdForModule,
  isOfficialDemoIdentity,
} from '@/lib/demo-access';
import {
  bootstrapOfficialDemoModule,
  DemoModuleBootstrapError,
} from '@/lib/server/demo-module-bootstrap';
import { verifyTsekInIdentity } from '@/lib/server/tsek-in-checkin-service';

const demoToken = {
  uid: 'official-demo-uid',
  email: 'demo@katuwangsolutions.com',
  tenantId: 'demo',
  role: 'owner',
};

function fakeFirestore() {
  const writes: Array<{ path: string; value: Record<string, unknown> }> = [];
  const ref = (path: string): any => ({
    path,
    id: path.split('/').at(-1),
    get: async () => {
      if (path === 'tenants/demo') return { exists: true, data: () => ({ ownerUid: 'official-demo-uid' }) };
      if (path === 'tenants/demo_tsek-in') return {
        exists: true,
        data: () => ({
          ownerUid: 'official-demo-uid',
          moduleType: 'tsek-in',
          subscriptionStatus: 'active',
        }),
      };
      return { exists: false, data: () => undefined };
    },
    collection: (name: string) => ({
      doc: (id?: string) => ref(`${path}/${name}/${id ?? 'generated'}`),
    }),
  });
  return {
    writes,
    db: {
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      batch: () => ({
        set: (target: any, value: Record<string, unknown>) => writes.push({ path: target.path, value }),
        commit: async () => undefined,
      }),
    } as any,
  };
}

test('official demo identity requires exact email, root tenant, uid and owner match', () => {
  assert.equal(isOfficialDemoIdentity({ email: demoToken.email, authUid: demoToken.uid, tenantId: 'demo', ownerUid: demoToken.uid }), true);
  assert.equal(isOfficialDemoIdentity({ email: 'customer@example.com', authUid: demoToken.uid, tenantId: 'demo', ownerUid: demoToken.uid }), false);
  assert.equal(isOfficialDemoIdentity({ email: demoToken.email, authUid: demoToken.uid, tenantId: 'demo_fake', ownerUid: demoToken.uid }), false);
  assert.equal(isOfficialDemoIdentity({ email: demoToken.email, authUid: demoToken.uid, tenantId: 'demo', ownerUid: 'another-uid' }), false);
});

test('demo module ids are deterministic and scoped beneath the demo root', () => {
  assert.equal(demoTenantIdForModule('tsek-in'), 'demo_tsek-in');
  assert.equal(demoTenantIdForModule('order-snap'), 'demo_order-snap');
});

test('server bootstrap rejects non-canonical and non-demo requests', async () => {
  const memory = fakeFirestore();
  const auth = { verifyIdToken: async () => demoToken } as any;
  await assert.rejects(
    () => bootstrapOfficialDemoModule('token', { moduleId: 'farm-track' }, { adminAuth: auth, adminFirestore: memory.db }),
    (error: unknown) => error instanceof DemoModuleBootstrapError && error.code === 'INVALID_REQUEST',
  );
  const customerAuth = { verifyIdToken: async () => ({ ...demoToken, email: 'customer@example.com' }) } as any;
  await assert.rejects(
    () => bootstrapOfficialDemoModule('token', { moduleId: 'tsek-in' }, { adminAuth: customerAuth, adminFirestore: memory.db }),
    (error: unknown) => error instanceof DemoModuleBootstrapError && error.code === 'FORBIDDEN',
  );
});

test('official demo bootstrap activates canonical Tsek-In and seeds authoritative rooms', async () => {
  const memory = fakeFirestore();
  const auth = { verifyIdToken: async () => demoToken } as any;
  const timestamp = { toDate: () => new Date('2026-09-04T00:00:00.000Z') } as any;
  const receipt = await bootstrapOfficialDemoModule('token', { moduleId: 'tsek-in' }, {
    adminAuth: auth,
    adminFirestore: memory.db,
    now: () => timestamp,
  });
  assert.deepEqual(receipt, { moduleId: 'tsek-in', tenantId: 'demo_tsek-in', status: 'ready' });
  const target = memory.writes.find((write) => write.path === 'tenants/demo_tsek-in');
  assert.equal(target?.value.subscriptionStatus, 'active');
  assert.equal(target?.value.pricingTier, 'foc');
  assert.deepEqual(target?.value.unlockedModules, activeModules.map((module) => module.id));
  assert.equal(memory.writes.filter((write) => write.path.includes('/rooms/')).length, 7);
});

test('Tsek-In server identity routes only the official demo to its isolated tenant', async () => {
  const memory = fakeFirestore();
  const identity = await verifyTsekInIdentity('token', { verifyIdToken: async () => demoToken } as any, memory.db);
  assert.equal(identity.tenantId, 'demo_tsek-in');
  assert.equal(identity.uid, demoToken.uid);
});

test('marketplace and profile use the guarded demo access path and canonical catalog', () => {
  const marketplace = readFileSync('src/components/dashboard/app-marketplace.tsx', 'utf8');
  const profile = readFileSync('src/components/dashboard/profile-tab.tsx', 'utf8');
  const seeder = readFileSync('src/firebase/firestore/demo-seeder.ts', 'utf8');
  assert.match(marketplace, /if \(isOfficialDemo\) return true/);
  assert.match(marketplace, /Official Demo Access/);
  assert.match(profile, /marketplaceApps\.filter/);
  assert.match(profile, /isOfficialDemoIdentity/);
  assert.match(seeder, /\/api\/demo\/module-bootstrap/);
  assert.doesNotMatch(marketplace, /farm-track|Farm Track/);
});

test('Firestore rules prevent customer self-activation and self-unlocking', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  assert.match(rules, /request\.resource\.data\.subscriptionStatus == 'pending'/);
  assert.match(rules, /'unlockedModules'/);
  assert.match(rules, /affectedKeys\(\)\.hasAny/);
});
