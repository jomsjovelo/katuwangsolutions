import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Pure predicate that mirrors the subscription logic in usePinApproval and TenantDashboard:
 * - Cashiers are denied access to users/{uid} by Firestore Rules
 * - The client must pass null to useFirestoreDocument for Cashiers
 * - No user → disabled
 */
function resolveProfileSubscriptionRef(isCashier: boolean, userUid: string | null): string | null {
  if (!userUid) return null;
  if (isCashier) return null;
  return `users/${userUid}`;
}

describe('Cashier Profile Subscription Predicate', () => {
  it('authenticated Owner/non-Cashier → profile subscription allowed', () => {
    const ref = resolveProfileSubscriptionRef(false, 'owner_alice_123');
    assert.strictEqual(ref, 'users/owner_alice_123', 'Owner profile reference must be constructed');
  });

  it('authenticated Cashier → profile subscription disabled', () => {
    const ref = resolveProfileSubscriptionRef(true, 'cashier_bob_456');
    assert.strictEqual(ref, null, 'Cashier must never subscribe to users/{uid}');
  });

  it('no user → disabled', () => {
    const ref = resolveProfileSubscriptionRef(false, null);
    assert.strictEqual(ref, null, 'No user must disable profile subscription');
  });

  it('Cashier with no user → disabled', () => {
    const ref = resolveProfileSubscriptionRef(true, null);
    assert.strictEqual(ref, null, 'Cashier without user must disable profile subscription');
  });

  it('non-Cashier with no user → disabled', () => {
    const ref = resolveProfileSubscriptionRef(false, null);
    assert.strictEqual(ref, null, 'Non-Cashier without user must disable profile subscription');
  });
});

describe('usePinApproval isOwner Decision (mirrors TenantDashboard logic)', () => {
  const evaluateIsOwner = (isCashier: boolean, currentTenantOwnerUid: string | undefined, userUid: string | undefined, profileRole: string | undefined): boolean => {
    // Replicates: const isOwner = !isCashier && (currentTenant?.ownerUid === user?.uid || profile?.role === 'owner');
    return !isCashier && (currentTenantOwnerUid === userUid || profileRole === 'owner');
  };

  it('Cashier is never Owner regardless of ownership match', () => {
    const result = evaluateIsOwner(true, 'owner_alice_123', 'owner_alice_123', 'owner');
    assert.strictEqual(result, false, 'Cashier must never be considered Owner');
  });

  it('Owner by tenant ownership match', () => {
    const result = evaluateIsOwner(false, 'owner_alice_123', 'owner_alice_123', undefined);
    assert.strictEqual(result, true, 'User matching tenant ownerUid must be Owner');
  });

  it('Owner by profile role', () => {
    const result = evaluateIsOwner(false, 'other_owner', 'owner_alice_123', 'owner');
    assert.strictEqual(result, true, 'Profile role owner must be Owner');
  });

  it('Staff without owner match is not Owner', () => {
    const result = evaluateIsOwner(false, 'owner_alice_123', 'staff_bob_456', 'staff');
    assert.strictEqual(result, false, 'Staff without owner match must not be Owner');
  });

  it('Cashier with owner tenant match is not Owner', () => {
    const result = evaluateIsOwner(true, 'owner_alice_123', 'owner_alice_123', 'owner');
    assert.strictEqual(result, false, 'Cashier ownership match must be ignored');
  });
});