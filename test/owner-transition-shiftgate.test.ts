import test from 'node:test';
import assert from 'node:assert/strict';
import { useSecureCashierStore } from '../src/store/use-secure-cashier-store';
import { selectAuthoritativeTenantId, validateAuthoritativeTenant } from '../src/lib/auth/owner-tenant-authorization';

/**
 * Pure evaluation function replicating ShiftGate's exact decision logic:
 * isOwner = !isCashier && (currentTenant?.ownerUid === user?.uid || profile?.role === 'owner')
 * requireShift = !!user && !isOwner && !loading && (isCashier ? !cashierShift : !activeShift) && activeTab !== 'profile'
 */
function evaluateShiftRequirement(params: {
  user: { uid: string } | null;
  isCashier: boolean;
  cashierShift: any | null;
  activeShift: any | null;
  currentTenant: { id: string; ownerUid?: string } | null;
  profile: { role?: string } | null;
  loading: boolean;
  activeTab?: string;
}): { isOwner: boolean; requireShift: boolean } {
  const { user, isCashier, cashierShift, activeShift, currentTenant, profile, loading, activeTab } = params;
  const isOwner = !isCashier && (currentTenant?.ownerUid === user?.uid || profile?.role === 'owner');
  const requireShift = !!user && !isOwner && !loading && (isCashier ? !cashierShift : !activeShift) && activeTab !== 'profile';
  return { isOwner, requireShift };
}

test('Owner Account Transition & ShiftGate Authorization Suite', async (t) => {

  await t.test('1. ShiftGate hides Open Register gate completely for Tenant Owner', () => {
    const ownerUid = 'owner_alice_123';
    const tenantId = 'tenant_store_1';

    const result = evaluateShiftRequirement({
      user: { uid: ownerUid },
      isCashier: false,
      cashierShift: null,
      activeShift: null,
      currentTenant: { id: tenantId, ownerUid },
      profile: { role: 'owner' },
      loading: false,
      activeTab: 'benta'
    });

    assert.strictEqual(result.isOwner, true, 'User must be classified as Owner');
    assert.strictEqual(result.requireShift, false, 'Owner must NEVER be required to open a shift');
  });

  await t.test('2. ShiftGate requires shift for Cashier without an active shift', () => {
    const cashierUid = 'cashier_bob_456';
    const tenantId = 'tenant_store_1';

    const result = evaluateShiftRequirement({
      user: { uid: cashierUid },
      isCashier: true,
      cashierShift: null, // No open shift
      activeShift: null,
      currentTenant: { id: tenantId, ownerUid: 'owner_alice_123' },
      profile: null,
      loading: false,
      activeTab: 'benta'
    });

    assert.strictEqual(result.isOwner, false, 'Cashier must not be classified as Owner');
    assert.strictEqual(result.requireShift, true, 'Cashier without shift MUST be required to open a shift');
  });

  await t.test('3. ShiftGate allows Cashier with an active shift to proceed', () => {
    const cashierUid = 'cashier_bob_456';
    const tenantId = 'tenant_store_1';

    const result = evaluateShiftRequirement({
      user: { uid: cashierUid },
      isCashier: true,
      cashierShift: { id: 'shift_open_1', status: 'open' },
      activeShift: null,
      currentTenant: { id: tenantId, ownerUid: 'owner_alice_123' },
      profile: null,
      loading: false,
      activeTab: 'benta'
    });

    assert.strictEqual(result.isOwner, false);
    assert.strictEqual(result.requireShift, false, 'Cashier with active shift does not need another shift');
  });

  await t.test('4. Cross-role transition: Switching from Cashier to Owner cleanly clears Cashier state', () => {
    // Step 1: Set up Cashier session in Zustand store
    useSecureCashierStore.getState().setOnlineBootstrap({
      tenantId: 'tenant_store_1',
      tenantDisplayName: 'Store 1',
      moduleId: 'benta-snap',
      staffAccountId: 'staff_1',
      staffDisplayName: 'Bob Cashier',
      currentShift: {
        id: 'shift_1',
        moduleId: 'benta-snap',
        status: 'open',
        startingCashCentavos: 100000,
        openedAt: new Date().toISOString()
      },
      products: [],
      categories: []
    });

    assert.strictEqual(useSecureCashierStore.getState().isCashierAuthenticated, true);
    assert.ok(useSecureCashierStore.getState().activeShift);

    // Step 2: Simulate Owner login / AuthGuard resolution -> clearCashierSession()
    useSecureCashierStore.getState().clearCashierSession();

    assert.strictEqual(useSecureCashierStore.getState().isCashierAuthenticated, false, 'isCashierAuthenticated must be false');
    assert.strictEqual(useSecureCashierStore.getState().activeShift, null, 'activeShift must be null');
    assert.strictEqual(useSecureCashierStore.getState().bootstrap, null, 'bootstrap must be null');

    // Step 3: ShiftGate evaluates the new Owner session
    const ownerUid = 'demo_owner_uid';
    const result = evaluateShiftRequirement({
      user: { uid: ownerUid },
      isCashier: useSecureCashierStore.getState().isCashierAuthenticated,
      cashierShift: useSecureCashierStore.getState().activeShift,
      activeShift: null,
      currentTenant: { id: 'demo-benta-store', ownerUid },
      profile: { role: 'owner' },
      loading: false,
      activeTab: 'benta'
    });

    assert.strictEqual(result.isOwner, true, 'Transitioned user must be recognized as Owner');
    assert.strictEqual(result.requireShift, false, 'Owner must NOT see shift gate after transition');
  });

  await t.test('5. Tenant authorization helpers validate Owner and reject cross-tenant access', () => {
    const ownerUid = 'demo_owner_uid';
    const tenantId = 'demo-benta-store';
    const otherTenantId = 'other-store';

    // 1. Authoritative tenant selection
    const profile = { tenantId, tenantIds: [tenantId], role: 'owner' };
    const res = selectAuthoritativeTenantId(profile, tenantId);
    assert.strictEqual(res.selectedTenantId, tenantId);

    // 2. Authoritative tenant validation
    const valid = validateAuthoritativeTenant(ownerUid, {
      id: tenantId,
      name: 'Demo Store',
      ownerUid,
      staffUids: [],
      moduleType: 'benta-snap',
      pricingTier: 'standard_100',
      subscriptionStatus: 'active',
      createdAt: new Date().toISOString()
    });
    assert.strictEqual(valid.isAuthorized, true);

    // 3. Rejection of un-owned tenant
    const invalid = validateAuthoritativeTenant(ownerUid, {
      id: otherTenantId,
      name: 'Other Store',
      ownerUid: 'someone_else_uid',
      staffUids: [],
      moduleType: 'benta-snap',
      pricingTier: 'standard_100',
      subscriptionStatus: 'active',
      createdAt: new Date().toISOString()
    });
    assert.strictEqual(invalid.isAuthorized, false);
  });
});
