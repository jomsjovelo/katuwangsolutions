import assert from 'node:assert/strict';
import {
  analyzeSecureCashierCompatibility,
  assertProductionPreflightAuthorized,
  BentaTenantPreflightScope,
  collectBentaPreflightScopes,
  PRODUCTION_PREFLIGHT_ACKNOWLEDGEMENT
} from '../src/lib/server/secure-cashier-production-preflight';

const sensitive = {
  businessCode: 'PRIVATE-BUSINESS-CODE', username: 'private-cashier', pinHash: 'scrypt:v2:V1:private-salt:private-hash'
};
const product = (tenantId: string) => ({ id: 'product-1', data: {
  tenantId, name: 'Rice', unit: 'bag', salePrice: 100, costPrice: 50, currentStock: 2, isActive: true
} });
const scope = (id: string, changes: Partial<BentaTenantPreflightScope> = {}, tenantChanges: Record<string, unknown> = {}): BentaTenantPreflightScope => ({
  tenant: { id, data: { moduleType: 'benta-snap', subscriptionStatus: 'active', businessCode: sensitive.businessCode, ...tenantChanges } },
  businessCodeRelationship: { id: sensitive.businessCode, data: { tenantId: id } },
  staff: [{ id: 'cashier-1', data: {
    tenantId: id, authUid: 'cashier-auth-1', usernameLower: sensitive.username, sessionVersion: 1,
    status: 'active', pinHash: sensitive.pinHash, companyControlledSmokeTest: true
  } }],
  usernameRelationships: [{ id: sensitive.username, data: { tenantId: id, staffAccountId: 'cashier-1' } }],
  shifts: [], products: [product(id)], ...changes
});

assert.throws(() => assertProductionPreflightAuthorized([], {}), /SECURITY_FAIL_CLOSED/, 'tool refuses production by default');
assert.throws(() => assertProductionPreflightAuthorized([
  '--project-id=real-project', `--authorization=${PRODUCTION_PREFLIGHT_ACKNOWLEDGEMENT}`
], {}), /SECURITY_FAIL_CLOSED/, 'command acknowledgement alone is insufficient');
assert.equal(assertProductionPreflightAuthorized([
  '--project-id=real-project', `--authorization=${PRODUCTION_PREFLIGHT_ACKNOWLEDGEMENT}`
], { SECURE_CASHIER_PREFLIGHT_AUTHORIZED: 'true' }), 'real-project');

const unrelated = scope('fresh', {
  staff: [{ id: 'bad', data: { pinHash: 'legacy' } }],
  products: [{ id: 'bad', data: {} }]
}, { moduleType: 'fresh-tally' });
const build = scope('build', { staff: [{ id: 'bad-build', data: {} }] }, { moduleType: 'build-stack' });
const valid = analyzeSecureCashierCompatibility({ tenants: [scope('benta'), unrelated, build] });
assert.equal(valid.authoritativeBentaTenants, 1, 'Fresh, Build, and other modules are excluded from authoritative Benta tenant totals');
assert.equal(valid.cashierRecords, 1, 'non-Benta Cashiers do not contaminate Benta totals');
assert.equal(valid.incompatibleProducts, 0, 'non-Benta incompatible products do not contaminate Benta totals');
assert.equal(valid.usableCompanyControlledSmokeTestIdentities, 1, 'complete company-controlled relationship is smoke-ready');
assert.equal(valid.smokeTestReady, true, 'aggregate smoke readiness is true only for a complete usable identity');

const inactive = analyzeSecureCashierCompatibility({ tenants: [scope('inactive', {}, { subscriptionStatus: 'suspended' })] });
assert.equal(inactive.bentaTenantsWithoutActiveEntitlement, 1, 'Benta tenant without active entitlement is reported separately');
assert.equal(inactive.cashierRecords, 0, 'inactive Benta child records are excluded from compatibility totals');
assert.equal(inactive.smokeTestReady, false, 'inactive Benta entitlement is never smoke-ready');

assert.equal(analyzeSecureCashierCompatibility({ tenants: [scope('no-code', { businessCodeRelationship: undefined })] }).smokeTestReady, false,
  'Cashier without a valid Business Code relationship is not smoke-ready');
assert.equal(analyzeSecureCashierCompatibility({ tenants: [scope('disabled', { staff: [{ id: 'cashier-1', data: {
  tenantId: 'disabled', authUid: 'uid', usernameLower: sensitive.username, sessionVersion: 1, status: 'disabled',
  pinHash: sensitive.pinHash, companyControlledSmokeTest: true
} }] })] }).smokeTestReady, false, 'disabled Cashier is not smoke-ready');
assert.equal(analyzeSecureCashierCompatibility({ tenants: [scope('bad-credential', { staff: [{ id: 'cashier-1', data: {
  tenantId: 'bad-credential', authUid: 'uid', usernameLower: sensitive.username, sessionVersion: 1, status: 'active',
  pinHash: 'legacy-format', companyControlledSmokeTest: true
} }] })] }).smokeTestReady, false, 'incompatible credential state is not smoke-ready');
assert.equal(analyzeSecureCashierCompatibility({ tenants: [scope('bad-username', { usernameRelationships: [] })] }).smokeTestReady, false,
  'missing username relationship is not smoke-ready');
assert.equal(analyzeSecureCashierCompatibility({ tenants: [scope('open-shift', {
  staff: [{ id: 'cashier-1', data: { tenantId: 'open-shift', authUid: 'uid', usernameLower: sensitive.username, sessionVersion: 1,
    status: 'active', pinHash: sensitive.pinHash, companyControlledSmokeTest: true, activeShiftId: 'shift-1' } }],
  shifts: [{ id: 'shift-1', data: { tenantId: 'open-shift', moduleId: 'benta-snap', status: 'open', reconciliationVersion: 1,
    staffAccountId: 'cashier-1', staffId: 'staff_cashier-1' } }]
})] }).smokeTestReady, false, 'identity with an open shift is not ready for the clean smoke procedure');

const serialized = JSON.stringify(valid);
for (const value of Object.values(sensitive)) assert.equal(serialized.includes(value), false, 'aggregate report contains no sensitive value');

async function verifyScopedCollection() {
  const calls: string[] = [];
  const childSnapshot = { docs: [] };
  const tenantDocument = {
    id: 'benta-active', data: () => ({ moduleType: 'benta-snap', subscriptionStatus: 'active' }),
    ref: { path: 'tenants/benta-active', collection: (name: string) => ({ get: async () => { calls.push(`tenant:${name}`); return childSnapshot; } }) }
  };
  const db = {
    collectionGroup: () => { throw new Error('collectionGroup must never be used'); },
    collection: (name: string) => {
      calls.push(`root:${name}`);
      if (name !== 'tenants') throw new Error('unexpected global collection enumeration');
      return { where: (field: string, operator: string, value: string) => ({
        get: async () => { calls.push(`where:${field}:${operator}:${value}`); return { docs: [tenantDocument] }; }
      }) };
    }
  };
  const collected = await collectBentaPreflightScopes(db);
  assert.equal(collected.length, 1);
  assert.deepEqual(calls, ['root:tenants', 'where:moduleType:==:benta-snap', 'tenant:staff_accounts', 'tenant:shifts', 'tenant:products'],
    'collector discovers Benta tenants first and then uses tenant-scoped child reads only');
}

verifyScopedCollection().then(() => console.log('SECURE CASHIER BENTA PREFLIGHT: 21/21 PASS')).catch((error) => {
  console.error(error); process.exit(1);
});
