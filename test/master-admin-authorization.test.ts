import { test } from 'node:test';
import assert from 'node:assert';
import { isAdminRole, isMasterAdminClaim, isMasterAdminDocData, isSuperAdminClaim, resolveAdminStatus } from '../src/lib/auth/admin-claim-resolver';

test('Master Admin Authorization & Fallback Resolution Suite', async (t) => {
  const adminUid = 'admin_uid_live_123';
  const ownerUid = 'owner_uid_456';
  const cashierUid = 'cashier_uid_789';

  await t.test('1. Recognized signed Admin claim grants Admin access (Fast Path)', async () => {
    assert.strictEqual(isMasterAdminClaim({ admin: true }), true);
    assert.strictEqual(isMasterAdminClaim({ role: 'admin' }), true);
    assert.strictEqual(isMasterAdminClaim({ role: 'superadmin' }), true);
    assert.strictEqual(isMasterAdminClaim({ isMasterAdmin: true }), true);
    assert.strictEqual(isMasterAdminClaim({ adminRole: 'superadmin' }), true);

    const resolved = await resolveAdminStatus({ admin: true }, adminUid);
    assert.strictEqual(resolved, true);
  });

  await t.test('2. No claim plus existing own Admin document grants Admin access (Authoritative Fallback)', async () => {
    // Unrecognized / empty claims
    const claims = { email: 'jomsjovelo@gmail.com' };

    let fetchedUid: string | null = null;
    const fetchAdminDoc = async (uid: string) => {
      fetchedUid = uid;
      if (uid === adminUid) {
        return {
          exists: true,
          data: () => ({ email: 'jomsjovelo@gmail.com', role: 'superadmin', name: 'Master Admin' })
        };
      }
      return { exists: false };
    };

    const resolved = await resolveAdminStatus(claims, adminUid, fetchAdminDoc);
    assert.strictEqual(resolved, true, 'Must grant access when /admins/{uid} exists with role superadmin');
    assert.strictEqual(fetchedUid, adminUid, 'Must read only the authenticated UID own document');
  });

  await t.test('3. No claim plus missing Admin document denies Admin access', async () => {
    const claims = {};
    const fetchAdminDoc = async (uid: string) => {
      return { exists: false };
    };

    const resolved = await resolveAdminStatus(claims, 'unknown_user_999', fetchAdminDoc);
    assert.strictEqual(resolved, false, 'Must deny when /admins/{uid} does not exist');
  });

  await t.test('4. Owner with tenant profile cannot access Admin', async () => {
    const ownerClaims = { tenantId: 'tenant_abc', role: 'owner' };
    const fetchAdminDoc = async (uid: string) => {
      return { exists: false };
    };

    assert.strictEqual(isMasterAdminClaim(ownerClaims), false);
    const resolved = await resolveAdminStatus(ownerClaims, ownerUid, fetchAdminDoc);
    assert.strictEqual(resolved, false, 'Owner without admin claim or admin doc must be denied');
  });

  await t.test('5. Cashier cannot access Admin', async () => {
    const cashierClaims = { role: 'cashier', tenantId: 'tenant_abc', staffAccountId: 'staff_1' };
    const fetchAdminDoc = async (uid: string) => {
      return { exists: false };
    };

    assert.strictEqual(isMasterAdminClaim(cashierClaims), false);
    const resolved = await resolveAdminStatus(cashierClaims, cashierUid, fetchAdminDoc);
    assert.strictEqual(resolved, false, 'Cashier must be denied admin access');
  });

  await t.test('6. Email match alone grants nothing (Strict Cryptographic/Document Authorization)', async () => {
    const spoofClaims = { email: 'jomsjovelo@gmail.com' };
    const fetchAdminDoc = async (uid: string) => {
      // Document does not exist in /admins/{uid} for this spoofed UID
      return { exists: false };
    };

    assert.strictEqual(isMasterAdminClaim(spoofClaims), false, 'Email string in claim must never grant admin claim');
    const resolved = await resolveAdminStatus(spoofClaims, 'spoof_uid', fetchAdminDoc);
    assert.strictEqual(resolved, false, 'Email match alone without admin doc or token claim must be strictly rejected');
  });

  await t.test('7. Admin document data validator accepts valid admin roles and rejects invalid roles', async () => {
    assert.strictEqual(isMasterAdminDocData({ role: 'superadmin' }), true);
    assert.strictEqual(isMasterAdminDocData({ role: 'admin' }), true);
    assert.strictEqual(isMasterAdminDocData({ role: 'billing' }), true);
    assert.strictEqual(isMasterAdminDocData({ role: 'support' }), true);
    assert.strictEqual(isMasterAdminDocData({ role: 'auditor' }), true);
    assert.strictEqual(isMasterAdminDocData({}), true, 'Omitted role defaults to master admin on existing doc');
    assert.strictEqual(isMasterAdminDocData({ role: 'cashier' }), false);
    assert.strictEqual(isMasterAdminDocData({ role: 'member' }), false);
    assert.strictEqual(isMasterAdminDocData({ role: 'owner' }), false);
    assert.strictEqual(isMasterAdminDocData(null), false);
  });

  await t.test('8. Canonical roles and explicit superadmin claims remain distinguishable', async () => {
    assert.strictEqual(isAdminRole('support'), true);
    assert.strictEqual(isAdminRole('billing'), true);
    assert.strictEqual(isAdminRole('auditor'), true);
    assert.strictEqual(isAdminRole('owner'), false);
    assert.strictEqual(isSuperAdminClaim({ role: 'superadmin' }), true);
    assert.strictEqual(isSuperAdminClaim({ adminRole: 'superadmin' }), true);
    assert.strictEqual(isSuperAdminClaim({ admin: true }), false);
    assert.strictEqual(isSuperAdminClaim({ role: 'admin' }), false);
    assert.strictEqual(isSuperAdminClaim({ role: 'support' }), false);
  });
});
