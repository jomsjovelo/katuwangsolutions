import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectAuthoritativeTenantId,
  validateAuthoritativeTenant,
  UserProfileAuthData
} from '../src/lib/auth/owner-tenant-authorization';
import { Tenant } from '../src/store/use-tenant-store';

test('Authoritative Owner–Tenant Authorization Boundary & Race Immunity Suite', async (t) => {

  await t.test('1. Authenticated Owner + authoritatively owned tenant → access succeeds after authoritative Firestore snapshot', () => {
    const ownerUid = 'owner_uid_123';
    const authoritativeUserProfile: UserProfileAuthData = {
      tenantId: 'tenant_valid_001',
      role: 'owner'
    };

    // Step A: Resolution selects authoritative tenant
    const { selectedTenantId, error: selectErr } = selectAuthoritativeTenantId(authoritativeUserProfile);
    assert.equal(selectErr, undefined);
    assert.equal(selectedTenantId, 'tenant_valid_001');

    // Step B: Firestore tenant document snapshot arrives and validates authentic ownership
    const authenticFirestoreTenantDoc: Tenant = {
      id: 'tenant_valid_001',
      name: 'Katuwang Store',
      ownerUid: 'owner_uid_123',
      staffUids: [],
      moduleType: 'benta-snap',
      pricingTier: 'standard_100',
      subscriptionStatus: 'active',
      createdAt: '2026-08-21T00:00:00Z'
    };

    const validation = validateAuthoritativeTenant(ownerUid, authenticFirestoreTenantDoc);
    assert.equal(validation.isAuthorized, true);
    assert.equal(validation.error, undefined);
  });

  await t.test('2. Same-ID Forgery: Persisted same-ID tenant with forged ownerUid = authenticated user cannot authorize when authoritative Firestore document specifies different owner', () => {
    const attackerUid = 'attacker_uid_456';
    const targetTenantId = 'tenant_high_value_store_001';

    // Client-side forged tenant state stored in localStorage (claims same ID and forged ownerUid):
    const forgedPersistedTenant: Tenant = {
      id: targetTenantId,
      name: 'High Value Store',
      ownerUid: attackerUid, // FORGED to match attacker
      staffUids: [attackerUid], // FORGED
      moduleType: 'benta-snap',
      pricingTier: 'enterprise', // FORGED
      subscriptionStatus: 'active',
      createdAt: '2026-08-21T00:00:00Z'
    };

    // Real Authoritative Firestore Document Snapshot returned by backend:
    const authoritativeFirestoreTenantDoc: Tenant = {
      id: targetTenantId,
      name: 'High Value Store',
      ownerUid: 'real_legitimate_owner_999', // REAL owner from backend
      staffUids: [],
      moduleType: 'benta-snap',
      pricingTier: 'standard_100',
      subscriptionStatus: 'active',
      createdAt: '2026-08-21T00:00:00Z'
    };

    // Invariant: Authorization is evaluated STRICTLY against authoritative Firestore document, NEVER the persisted object!
    const validation = validateAuthoritativeTenant(attackerUid, authoritativeFirestoreTenantDoc);
    assert.equal(validation.isAuthorized, false, 'Access must be denied despite persisted object claiming ownerUid');
    assert.equal(validation.error, 'Unauthorized tenant access.');
  });

  await t.test('3. Same-ID Forgery: Forged authority-bearing fields in persisted tenant (pricingTier, staffUids) cannot override authoritative Firestore record', () => {
    const userUid = 'staff_uid_777';
    const tenantId = 'tenant_store_002';

    // Attacker forged enterprise tier and staff list locally:
    const forgedPersistedTenant: Tenant = {
      id: tenantId,
      name: 'Store 002',
      ownerUid: 'owner_333',
      staffUids: [userUid], // Forged staff entry
      moduleType: 'benta-snap',
      pricingTier: 'enterprise',
      subscriptionStatus: 'active',
      createdAt: '2026-08-21T00:00:00Z'
    };

    // Real Firestore record where user is NOT staff:
    const authoritativeFirestoreDoc: Tenant = {
      id: tenantId,
      name: 'Store 002',
      ownerUid: 'owner_333',
      staffUids: ['other_staff_888'], // Real staff list
      moduleType: 'benta-snap',
      pricingTier: 'standard_100',
      subscriptionStatus: 'active',
      createdAt: '2026-08-21T00:00:00Z'
    };

    const validation = validateAuthoritativeTenant(userUid, authoritativeFirestoreDoc);
    assert.equal(validation.isAuthorized, false);
    assert.equal(validation.error, 'Unauthorized tenant access.');
  });

  await t.test('4. Persisted tenant with mismatching ownerUid → cannot authorize', () => {
    const attackerUid = 'attacker_uid_456';
    const targetTenantDoc: Tenant = {
      id: 'tenant_victim_002',
      name: 'Victim Business',
      ownerUid: 'legitimate_owner_789',
      staffUids: [],
      moduleType: 'benta-snap',
      pricingTier: 'standard_100',
      subscriptionStatus: 'active',
      createdAt: '2026-08-21T00:00:00Z'
    };

    const validation = validateAuthoritativeTenant(attackerUid, targetTenantDoc);
    assert.equal(validation.isAuthorized, false);
    assert.equal(validation.error, 'Unauthorized tenant access.');
  });

  await t.test('5. Persisted tenant forged with ownerUid = user.uid but NOT in authoritative tenant set → cannot authorize', () => {
    const attackerUid = 'attacker_uid_456';

    const attackerProfile: UserProfileAuthData = {
      tenantId: 'tenant_attacker_001',
      tenantIds: ['tenant_attacker_001'],
      role: 'owner'
    };

    const forgedPersistedTenantId = 'tenant_victim_stolen_999';

    // selectAuthoritativeTenantId rejects forged persisted ID and falls back to attacker's own tenant
    const { selectedTenantId } = selectAuthoritativeTenantId(attackerProfile, forgedPersistedTenantId);
    assert.equal(selectedTenantId, 'tenant_attacker_001', 'Must ignore forged persisted tenant and use authoritative tenant');

    const victimTenantDoc: Tenant = {
      id: 'tenant_victim_stolen_999',
      name: 'Victim High Value Store',
      ownerUid: 'victim_real_owner_888',
      staffUids: [],
      moduleType: 'benta-snap',
      pricingTier: 'standard_100',
      subscriptionStatus: 'active',
      createdAt: '2026-08-21T00:00:00Z'
    };

    const validation = validateAuthoritativeTenant(attackerUid, victimTenantDoc);
    assert.equal(validation.isAuthorized, false);
    assert.equal(validation.error, 'Unauthorized tenant access.');
  });

  await t.test('6. Token/session without any optional tenantId claim cannot use local state as authorization', () => {
    const userUid = 'owner_uid_no_claim';

    const userProfile: UserProfileAuthData = {
      tenantId: 'tenant_real_333',
      role: 'owner'
    };

    const forgedLocalTenantId = 'tenant_forged_444';
    const { selectedTenantId } = selectAuthoritativeTenantId(userProfile, forgedLocalTenantId);
    assert.equal(selectedTenantId, 'tenant_real_333');
  });

  await t.test('7. Persisted last-selected tenant that IS in the authoritative tenant set is restored as UI selection', () => {
    const ownerUid = 'multi_store_owner_1';

    const multiStoreProfile: UserProfileAuthData = {
      tenantId: 'tenant_branch_1',
      tenantIds: ['tenant_branch_1', 'tenant_branch_2'],
      role: 'owner'
    };

    const persistedBranch2Id = 'tenant_branch_2';
    const { selectedTenantId } = selectAuthoritativeTenantId(multiStoreProfile, persistedBranch2Id);
    assert.equal(selectedTenantId, 'tenant_branch_2', 'Legitimate multi-tenant selection is permitted');

    const branch2TenantDoc: Tenant = {
      id: 'tenant_branch_2',
      name: 'Branch 2 Store',
      ownerUid: 'multi_store_owner_1',
      staffUids: [],
      moduleType: 'benta-snap',
      pricingTier: 'standard_100',
      subscriptionStatus: 'active',
      createdAt: '2026-08-21T00:00:00Z'
    };

    const validation = validateAuthoritativeTenant(ownerUid, branch2TenantDoc);
    assert.equal(validation.isAuthorized, true);
  });

  await t.test('8. Missing/stale/forged persisted tenant falls back only to an authoritatively permitted tenant or fails closed', () => {
    const res1 = selectAuthoritativeTenantId(null);
    assert.equal(res1.selectedTenantId, null);
    assert.equal(res1.error, 'User profile not found.');

    const res2 = selectAuthoritativeTenantId({ role: 'owner' });
    assert.equal(res2.selectedTenantId, null);
    assert.equal(res2.error, 'User is not associated with any business.');

    const res3 = selectAuthoritativeTenantId({ tenantId: 'tenant_primary_1' }, 'tenant_deleted_old');
    assert.equal(res3.selectedTenantId, 'tenant_primary_1');
  });

  await t.test('9. Missing Firestore document snapshot fails closed', () => {
    const userUid = 'user_uid_555';
    const validation = validateAuthoritativeTenant(userUid, null);
    assert.equal(validation.isAuthorized, false);
    assert.equal(validation.error, 'Business account not found or was deleted.');
  });

  await t.test('10. Pre-Firestore snapshot loading race: Persisted same-ID tenant cannot authorize before authoritative document arrives', () => {
    const attackerUid = 'attacker_uid_999';
    const sameTenantId = 'tenant_victim_same_id';

    // Persisted client state has same ID and claims ownerUid:
    const forgedPersistedTenant: Tenant = {
      id: sameTenantId,
      name: 'Victim Store Under Attack',
      ownerUid: attackerUid,
      staffUids: [attackerUid],
      moduleType: 'benta-snap',
      pricingTier: 'enterprise',
      subscriptionStatus: 'active',
      createdAt: '2026-08-21T00:00:00Z'
    };

    // Prior to snapshot resolution (Firestore pending/null):
    const preSnapshotValidation = validateAuthoritativeTenant(attackerUid, null);
    assert.equal(preSnapshotValidation.isAuthorized, false, 'Must not authorize before snapshot arrives');
    assert.equal(preSnapshotValidation.error, 'Business account not found or was deleted.');

    // Once authoritative backend document snapshot arrives (real owner is legitimate_owner_111):
    const realBackendTenantDoc: Tenant = {
      id: sameTenantId,
      name: 'Victim Store Under Attack',
      ownerUid: 'legitimate_owner_111',
      staffUids: [],
      moduleType: 'benta-snap',
      pricingTier: 'standard_100',
      subscriptionStatus: 'active',
      createdAt: '2026-08-21T00:00:00Z'
    };

    const postSnapshotValidation = validateAuthoritativeTenant(attackerUid, realBackendTenantDoc);
    assert.equal(postSnapshotValidation.isAuthorized, false, 'Access must remain denied after authoritative resolution');
    assert.equal(postSnapshotValidation.error, 'Unauthorized tenant access.');
  });
});
