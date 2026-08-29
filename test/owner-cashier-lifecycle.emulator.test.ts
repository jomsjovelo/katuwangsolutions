import * as admin from 'firebase-admin';
import { 
  createCashierAccount, 
  removeCashierAccount, 
  listCashierAccounts,
  LifecycleError,
  LifecycleErrorCode
} from '../src/lib/server/staff-lifecycle';

const PROJECT_ID = 'demo-katuwang-security-test';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

// Enforceable Runtime Isolation Check
if (!PROJECT_ID.startsWith('demo-') || (!EMULATOR_HOST.startsWith('127.0.0.1') && !EMULATOR_HOST.startsWith('localhost'))) {
  throw new Error(`[SECURITY_FAIL_CLOSED] Runtime isolation violation! Project: '${PROJECT_ID}', Host: '${EMULATOR_HOST}'`);
}

// Ensure Admin SDK points to the local emulator
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

let adminApp: admin.app.App;
if (!admin.apps.length) {
  adminApp = admin.initializeApp({ projectId: PROJECT_ID });
} else {
  adminApp = admin.apps[0]!;
}

const db = admin.firestore();

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

const TEST_PEPPER_CONFIG = {
  activeVersion: 'v1',
  peppers: {
    v1: 'katuwang_isolated_test_pepper_secret_32bytes_v1!!',
    v2: 'katuwang_isolated_test_pepper_secret_32bytes_v2!!'
  }
};

async function runRealConcurrencyEmulatorSuite() {
  console.log('================================================================');
  console.log('  FIRESTORE EMULATOR REAL CONCURRENCY & TRANSACTION SUITE');
  console.log(`  Project: ${PROJECT_ID} | Host: ${EMULATOR_HOST}`);
  console.log('================================================================\n');

  const TENANT_ID = `tenant_concurrency_${Date.now()}`;
  const OWNER_UID = `owner_${Date.now()}`;

  const mockAuth = {
    verifyIdToken: async (token: string) => {
      if (token === 'token_valid_owner') return { uid: OWNER_UID };
      throw new Error('Invalid token');
    }
  } as any;

  const serviceOptions = {
    adminAuth: mockAuth,
    adminFirestore: db,
    pepperConfig: TEST_PEPPER_CONFIG
  };

  // Seed owner tenant document in emulator
  await db.collection('tenants').doc(TENANT_ID).set({
    ownerUid: OWNER_UID,
    name: 'Concurrent Test Store',
    businessCode: 'CONCUR123',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // --- SECTION 1: GENUINE CONCURRENT CREATION WITH DIFFERENT USERNAMES ---
  console.log('1. Genuine Concurrent Creation with Different Usernames (Promise.allSettled)');
  {
    const username1 = `cashier_alpha_${Date.now()}`;
    const username2 = `cashier_beta_${Date.now()}`;

    // Execute genuinely overlapping concurrent transactions against the emulator
    const [res1, res2] = await Promise.allSettled([
      createCashierAccount({
        ownerToken: 'token_valid_owner',
        tenantId: TENANT_ID,
        username: username1,
        pin: '1234'
      }, serviceOptions),
      createCashierAccount({
        ownerToken: 'token_valid_owner',
        tenantId: TENANT_ID,
        username: username2,
        pin: '5678'
      }, serviceOptions)
    ]);

    const successes = [res1, res2].filter(r => r.status === 'fulfilled');
    const rejections = [res1, res2].filter(r => r.status === 'rejected');

    assert(successes.length === 1, 'Exactly one concurrent request SUCCEEDS');
    assert(rejections.length === 1, 'Exactly one concurrent request is REJECTED');

    const winningSummary = (successes[0] as PromiseFulfilledResult<any>).value;
    const losingError = (rejections[0] as PromiseRejectedResult).reason;

    const losingIsSlotLimit =
      losingError instanceof LifecycleError && losingError.code === LifecycleErrorCode.SLOT_LIMIT_REACHED;

    if (!losingIsSlotLimit) {
      console.error('  [DIAG] Losing error details (type/code/sanitized message):', {
        name: losingError instanceof Error ? losingError.name : typeof losingError,
        code: (losingError as any)?.code ?? (losingError as any)?.status ?? '(none)',
        message: losingError instanceof Error ? losingError.message : String(losingError),
        isLifecycleError: losingError instanceof LifecycleError,
        stack: losingError instanceof Error ? losingError.stack : undefined
      });
    }

    assert(
      losingIsSlotLimit,
      'Losing request is rejected with SLOT_LIMIT_REACHED error'
    );

    // Verify emulator state integrity
    const staffCollectionSnap = await db.collection('tenants').doc(TENANT_ID).collection('staff_accounts').get();
    assert(staffCollectionSnap.docs.length === 1, 'Exactly one staff_accounts document exists in Firestore');
    assert(staffCollectionSnap.docs[0].id === winningSummary.id, 'Stored staff account matches winning request ID');

    const slotSnap = await db.collection('tenants').doc(TENANT_ID).collection('staff_slots').doc('cashier_primary').get();
    assert(slotSnap.exists, 'Deterministic staff_slots/cashier_primary document exists');
    assert(slotSnap.data()?.staffAccountId === winningSummary.id, 'Slot references the winning Cashier staffAccountId');

    const winningReservationSnap = await db.collection('staff_usernames').doc(winningSummary.username.toLowerCase()).get();
    assert(winningReservationSnap.exists, 'Global username reservation exists for winner');

    const losingUsername = winningSummary.username === username1 ? username2 : username1;
    const losingReservationSnap = await db.collection('staff_usernames').doc(losingUsername.toLowerCase()).get();
    assert(!losingReservationSnap.exists, 'No orphan global username reservation exists for loser');

    // Clean up winner to prepare for next test
    await removeCashierAccount({
      ownerToken: 'token_valid_owner',
      tenantId: TENANT_ID,
      staffAccountId: winningSummary.id
    }, serviceOptions);

    const postRemoveStaff = await db.collection('tenants').doc(TENANT_ID).collection('staff_accounts').get();
    assert(postRemoveStaff.docs.length === 0, 'Removal cleanly emptied staff_accounts in emulator');
  }

  // --- SECTION 2: GENUINE CONCURRENT CREATION WITH SAME USERNAME ---
  console.log('\n2. Genuine Concurrent Creation with Same Username (Promise.allSettled)');
  {
    const duplicateUsername = `cashier_shared_${Date.now()}`;

    // Execute overlapping concurrent creations for identical username
    const [resA, resB] = await Promise.allSettled([
      createCashierAccount({
        ownerToken: 'token_valid_owner',
        tenantId: TENANT_ID,
        username: duplicateUsername,
        pin: '1111'
      }, serviceOptions),
      createCashierAccount({
        ownerToken: 'token_valid_owner',
        tenantId: TENANT_ID,
        username: duplicateUsername,
        pin: '2222'
      }, serviceOptions)
    ]);

    const successes = [resA, resB].filter(r => r.status === 'fulfilled');
    const rejections = [resA, resB].filter(r => r.status === 'rejected');

    assert(successes.length === 1, 'Exactly one same-username creation SUCCEEDS');
    assert(rejections.length === 1, 'Exactly one same-username creation is REJECTED');

    const staffSnap = await db.collection('tenants').doc(TENANT_ID).collection('staff_accounts').get();
    assert(staffSnap.docs.length === 1, 'Exactly one staff_accounts document exists in Firestore');

    const userResSnap = await db.collection('staff_usernames').doc(duplicateUsername.toLowerCase()).get();
    assert(userResSnap.exists, 'Exactly one username reservation exists in Firestore');

    const list = await listCashierAccounts({ ownerToken: 'token_valid_owner', tenantId: TENANT_ID }, serviceOptions);
    assert(list.length === 1, 'List cashiers returns exactly 1 item');
    assert(list[0].username === duplicateUsername, 'Listed username matches');
  }

  console.log('\n================================================================');
  console.log(`  REAL EMULATOR CONCURRENCY SUITE: TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRealConcurrencyEmulatorSuite().catch((err) => {
  console.error('Real concurrency test error:', err);
  process.exit(1);
});
