import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';

const PROJECT_ID = 'demo-katuwang-offline-test';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

let testEnv: RulesTestEnvironment;

test.before(async () => {
  const rulesPath = path.resolve(__dirname, '../firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT
    }
  });
});

test.after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

test('Firestore Security Rules Client Authorization Suite', async (t) => {
  const tenantId = `tenant_rules_client_${Date.now()}`;
  const otherTenantId = `tenant_other_${Date.now()}`;
  const ownerUid = `owner_rules_uid_${Date.now()}`;
  const otherOwnerUid = `other_owner_uid_${Date.now()}`;
  const staffMemberUid = `staff_member_uid_${Date.now()}`;
  const cashier1Uid = `cashier_1_uid_${Date.now()}`;
  const cashier2Uid = `cashier_2_uid_${Date.now()}`;
  const staffAccount1Id = 'staff_account_1';
  const staffAccount2Id = 'staff_account_2';

  // Seed fixture data via Admin Context
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();

    // Tenant 1 (Owned by ownerUid, staff includes staffMemberUid)
    await setDoc(doc(adminDb, 'tenants', tenantId), {
      id: tenantId,
      name: 'Rules Test Store',
      ownerUid,
      staffUids: [staffMemberUid],
      moduleType: 'benta-snap',
      subscriptionStatus: 'active'
    });

    // Tenant 2 (Owned by otherOwnerUid)
    await setDoc(doc(adminDb, 'tenants', otherTenantId), {
      id: otherTenantId,
      name: 'Other Store',
      ownerUid: otherOwnerUid,
      staffUids: [],
      moduleType: 'benta-snap',
      subscriptionStatus: 'active'
    });

    // Product in Tenant 1
    await setDoc(doc(adminDb, 'tenants', tenantId, 'products', 'prod_1'), {
      id: 'prod_1',
      name: 'Item 1',
      salePrice: 5000
    });

    // Product in Tenant 2
    await setDoc(doc(adminDb, 'tenants', otherTenantId, 'products', 'prod_2'), {
      id: 'prod_2',
      name: 'Item 2',
      salePrice: 8000
    });

    // Staff Account 1 (Active)
    await setDoc(doc(adminDb, 'tenants', tenantId, 'staff_accounts', staffAccount1Id), {
      id: staffAccount1Id,
      tenantId,
      username: 'cashier1',
      displayName: 'Cashier One',
      role: 'cashier',
      status: 'active',
      sessionVersion: 1,
      authUid: cashier1Uid
    });

    // Staff Account 2 (Active)
    await setDoc(doc(adminDb, 'tenants', tenantId, 'staff_accounts', staffAccount2Id), {
      id: staffAccount2Id,
      tenantId,
      username: 'cashier2',
      displayName: 'Cashier Two',
      role: 'cashier',
      status: 'active',
      sessionVersion: 1,
      authUid: cashier2Uid
    });

    // Server-only Collections
    await setDoc(doc(adminDb, 'webauthn_credentials', 'cred_test_1'), {
      credentialId: 'cred_test_1',
      tenantId
    });
    await setDoc(doc(adminDb, 'tenants', tenantId, 'offline_grants', 'grant_1'), {
      grantId: 'grant_1',
      tenantId
    });
    await setDoc(doc(adminDb, 'tenants', tenantId, 'offline_claims', 'claim_1'), {
      claimId: 'claim_1',
      tenantId
    });
    await setDoc(doc(adminDb, 'tenants', tenantId, 'catalog_snapshots', 'snap_1'), {
      snapshotId: 'snap_1',
      tenantId
    });
  });

  const cashier1Context = testEnv.authenticatedContext(cashier1Uid, {
    role: 'cashier',
    tenantId,
    staffAccountId: staffAccount1Id,
    sessionVersion: 1
  });

  const cashier2Context = testEnv.authenticatedContext(cashier2Uid, {
    role: 'cashier',
    tenantId,
    staffAccountId: staffAccount2Id,
    sessionVersion: 1
  });

  const ownerContext = testEnv.authenticatedContext(ownerUid, {});
  const staffMemberContext = testEnv.authenticatedContext(staffMemberUid, {});
  const unauthContext = testEnv.unauthenticatedContext();

  const cashier1Db = cashier1Context.firestore();
  const cashier2Db = cashier2Context.firestore();
  const ownerDb = ownerContext.firestore();
  const staffMemberDb = staffMemberContext.firestore();
  const unauthDb = unauthContext.firestore();

  const validIntentId1 = `intent_${Date.now()}_c1`;
  const validIntentData = {
    schemaVersion: 1,
    intentId: validIntentId1,
    tenantId,
    authUid: cashier1Uid,
    staffAccountId: staffAccount1Id,
    shiftId: 'shift_1',
    tender: 'cash',
    items: [{ productId: 'prod_rice', quantity: 2, observedUnitPriceCentavos: 5000, observedSubtotalCentavos: 10000 }],
    itemCount: 2,
    observedTotalCentavos: 10000,
    cashTenderedCentavos: 10000,
    changeRequiredCentavos: 0,
    clientCreatedAt: new Date().toISOString(),
    status: 'pending'
  };

  await t.test('1. Valid Cashier can create own pending cash sale intent', async () => {
    const intentRef = doc(cashier1Db, 'tenants', tenantId, 'cashier_sale_intents', validIntentId1);
    await assertSucceeds(setDoc(intentRef, validIntentData));
  });

  await t.test('2. Cashier cannot create intent with forged non-pending status', async () => {
    const intentId = `intent_forged_status_${Date.now()}`;
    const intentRef = doc(cashier1Db, 'tenants', tenantId, 'cashier_sale_intents', intentId);
    await assertFails(setDoc(intentRef, {
      ...validIntentData,
      intentId,
      status: 'accepted'
    }));
  });

  await t.test('3. Cashier cannot create intent with non-cash tender', async () => {
    const intentId = `intent_non_cash_${Date.now()}`;
    const intentRef = doc(cashier1Db, 'tenants', tenantId, 'cashier_sale_intents', intentId);
    await assertFails(setDoc(intentRef, {
      ...validIntentData,
      intentId,
      tender: 'gcash'
    }));
  });

  await t.test('4. Cashier cannot inject server-only finalization fields on create', async () => {
    const intentId = `intent_injected_finalization_${Date.now()}`;
    const intentRef = doc(cashier1Db, 'tenants', tenantId, 'cashier_sale_intents', intentId);
    await assertFails(setDoc(intentRef, {
      ...validIntentData,
      intentId,
      finalization: { saleId: 'fake_sale_id' }
    }));
  });

  await t.test('4b. Cashier can create valid schema v2 intent with measured items', async () => {
    const intentId = `intent_v2_valid_${Date.now()}`;
    const intentRef = doc(cashier1Db, 'tenants', tenantId, 'cashier_sale_intents', intentId);
    await assertSucceeds(setDoc(intentRef, {
      schemaVersion: 2,
      intentId,
      tenantId,
      authUid: cashier1Uid,
      staffAccountId: staffAccount1Id,
      shiftId: 'shift_1',
      tender: 'cash',
      items: [
        {
          productId: 'prod_pork',
          quantityMode: 'measured',
          quantityMinor: 1250,
          quantityScale: 3,
          sellingUnit: 'kg',
          observedUnitPriceCentavos: 28000,
          observedSubtotalCentavos: 35000
        }
      ],
      itemCount: 1,
      observedTotalCentavos: 35000,
      cashTenderedCentavos: 40000,
      changeRequiredCentavos: 5000,
      clientCreatedAt: new Date().toISOString(),
      status: 'pending'
    }));
  });

  await t.test('4c. Cashier cannot create intent with unsupported schemaVersion 3', async () => {
    const intentId = `intent_v3_invalid_${Date.now()}`;
    const intentRef = doc(cashier1Db, 'tenants', tenantId, 'cashier_sale_intents', intentId);
    await assertFails(setDoc(intentRef, {
      ...validIntentData,
      intentId,
      schemaVersion: 3
    }));
  });

  await t.test('4d. Cashier cannot create intent with unauthorized extra top-level field', async () => {
    const intentId = `intent_extra_field_${Date.now()}`;
    const intentRef = doc(cashier1Db, 'tenants', tenantId, 'cashier_sale_intents', intentId);
    await assertFails(setDoc(intentRef, {
      ...validIntentData,
      intentId,
      authoritativeSaleId: 'sale_hacked'
    }));
  });

  await t.test('5. Cashier cannot create intent for another tenant or another staff account', async () => {
    const intentId = `intent_spoofed_${Date.now()}`;
    const intentRef = doc(cashier1Db, 'tenants', tenantId, 'cashier_sale_intents', intentId);
    await assertFails(setDoc(intentRef, {
      ...validIntentData,
      intentId,
      staffAccountId: staffAccount2Id // Spoofing cashier2's staff account
    }));
  });

  await t.test('6. Client update and delete on intents are strictly denied (Server-only mutations)', async () => {
    const intentRef = doc(cashier1Db, 'tenants', tenantId, 'cashier_sale_intents', validIntentId1);
    await assertFails(updateDoc(intentRef, { status: 'accepted' }));
    await assertFails(deleteDoc(intentRef));
  });

  await t.test('7. Cashier can read own intent, but cannot read another Cashier intent', async () => {
    const ownIntentRef = doc(cashier1Db, 'tenants', tenantId, 'cashier_sale_intents', validIntentId1);
    await assertSucceeds(getDoc(ownIntentRef));

    const otherIntentRef = doc(cashier2Db, 'tenants', tenantId, 'cashier_sale_intents', validIntentId1);
    await assertFails(getDoc(otherIntentRef));
  });

  await t.test('8. Cashier is strictly denied from protected server and Owner collections', async () => {
    // webauthn_credentials
    await assertFails(getDoc(doc(cashier1Db, 'webauthn_credentials', 'cred_test_1')));
    // offline_grants
    await assertFails(getDoc(doc(cashier1Db, 'tenants', tenantId, 'offline_grants', 'grant_1')));
    // offline_claims
    await assertFails(getDoc(doc(cashier1Db, 'tenants', tenantId, 'offline_claims', 'claim_1')));
    // catalog_snapshots
    await assertFails(getDoc(doc(cashier1Db, 'tenants', tenantId, 'catalog_snapshots', 'snap_1')));
    // Catch-all tenant collections (Cashier denied from direct sales/transactions/accounts)
    await assertFails(getDoc(doc(cashier1Db, 'tenants', tenantId, 'accounts', 'master-cash')));
    await assertFails(getDoc(doc(cashier1Db, 'tenants', tenantId, 'transactions', 'tx_1')));
  });

  await t.test('9. Unauthenticated callers are denied from reading or writing cashier intents', async () => {
    const intentRef = doc(unauthDb, 'tenants', tenantId, 'cashier_sale_intents', validIntentId1);
    await assertFails(getDoc(intentRef));
    await assertFails(setDoc(doc(unauthDb, 'tenants', tenantId, 'cashier_sale_intents', 'unauth_intent'), validIntentData));
  });

  await t.test('10. Owner can read tenant subcollections', async () => {
    const ownIntentRef = doc(ownerDb, 'tenants', tenantId, 'cashier_sale_intents', validIntentId1);
    await assertSucceeds(getDoc(ownIntentRef));
  });

  await t.test('11. Owner can list only their own tenant through constrained query', async () => {
    const ownerQuery = query(collection(ownerDb, 'tenants'), where('ownerUid', '==', ownerUid));
    const snap = await assertSucceeds(getDocs(ownerQuery));
    assert.strictEqual(snap.docs.length, 1);
    assert.strictEqual(snap.docs[0].id, tenantId);
  });

  await t.test('12. Owner cannot list another Owner\'s tenant', async () => {
    const spoofQuery = query(collection(ownerDb, 'tenants'), where('ownerUid', '==', otherOwnerUid));
    await assertFails(getDocs(spoofQuery));
  });

  await t.test('13. Staff can list tenant containing their UID in staffUids', async () => {
    const staffQuery = query(collection(staffMemberDb, 'tenants'), where('staffUids', 'array-contains', staffMemberUid));
    const snap = await assertSucceeds(getDocs(staffQuery));
    assert.strictEqual(snap.docs.length, 1);
    assert.strictEqual(snap.docs[0].id, tenantId);
  });

  await t.test('14. Cashier is strictly denied from listing tenants', async () => {
    const cashierQuery = query(collection(cashier1Db, 'tenants'), where('ownerUid', '==', ownerUid));
    await assertFails(getDocs(cashierQuery));
  });

  await t.test('15. Owner can access permitted collections inside their own tenant', async () => {
    const productRef = doc(ownerDb, 'tenants', tenantId, 'products', 'prod_1');
    await assertSucceeds(getDoc(productRef));
  });

  await t.test('16. Owner cannot access another tenant or its collections', async () => {
    const otherProductRef = doc(ownerDb, 'tenants', otherTenantId, 'products', 'prod_2');
    await assertFails(getDoc(otherProductRef));
  });
});
