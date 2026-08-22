import { 
  listCashierAccounts, 
  createCashierAccount, 
  resetCashierPin, 
  disableCashierAccount, 
  removeCashierAccount,
  LifecycleError,
  LifecycleErrorCode
} from '../src/lib/server/staff-lifecycle';

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

async function runOwnerLifecycleSuite() {
  console.log('================================================================');
  console.log('  OWNER CASHIER LIFECYCLE & RECOVERY — CONSOLIDATED SECURITY SUITE');
  console.log('================================================================\n');

  const TENANT_A = 'tenant_store_alpha';
  const TENANT_B = 'tenant_store_beta';
  const OWNER_A_UID = 'owner_uid_alpha_123';
  const OWNER_B_UID = 'owner_uid_beta_456';
  const NON_OWNER_UID = 'regular_user_789';

  const mockStore: Record<string, any> = {
    [`tenants/${TENANT_A}`]: { ownerUid: OWNER_A_UID, name: 'Alpha Store', businessCode: 'ALPHA123' },
    [`tenants/${TENANT_B}`]: { ownerUid: OWNER_B_UID, name: 'Beta Store', businessCode: 'BETA123' }
  };

  let deleteUserCalled = false;
  const mockAuth = {
    verifyIdToken: async (token: string) => {
      if (token === 'token_owner_a') return { uid: OWNER_A_UID };
      if (token === 'token_owner_b') return { uid: OWNER_B_UID };
      if (token === 'token_non_owner') return { uid: NON_OWNER_UID };
      throw new Error('Firebase ID token has expired or is invalid.');
    },
    deleteUser: async () => {
      deleteUserCalled = true;
    }
  } as any;

  const createMockCollection = (colPath: string) => ({
    doc: (docId?: string) => {
      const docKey = docId || `generated_doc_${Math.random().toString(36).slice(2, 9)}`;
      const fullPath = `${colPath}/${docKey}`;
      return {
        id: docKey,
        path: fullPath,
        get: async () => ({
          exists: !!mockStore[fullPath],
          data: () => mockStore[fullPath]
        }),
        set: async (data: any) => { mockStore[fullPath] = data; },
        update: async (updates: any) => { mockStore[fullPath] = { ...mockStore[fullPath], ...updates }; },
        delete: async () => { delete mockStore[fullPath]; },
        collection: (subName: string) => createMockCollection(`${fullPath}/${subName}`)
      };
    },
    get: async () => ({
      docs: Object.keys(mockStore)
        .filter(k => k.startsWith(`${colPath}/`))
        .map(k => ({ id: k.split('/').pop(), data: () => mockStore[k] }))
    })
  });

  const mockFirestore = {
    collection: (colPath: string) => createMockCollection(colPath),
    runTransaction: async (updateFunction: (txn: any) => Promise<any>) => {
      const txn = {
        get: async (ref: any) => {
          if (ref.path && mockStore[ref.path] !== undefined) {
            return {
              exists: true,
              data: () => mockStore[ref.path]
            };
          }
          if (typeof ref.get === 'function') {
            return ref.get();
          }
          const p = ref.path;
          return {
            exists: !!mockStore[p],
            data: () => mockStore[p]
          };
        },
        set: (ref: any, data: any) => { mockStore[ref.path] = data; },
        update: (ref: any, data: any) => { mockStore[ref.path] = { ...mockStore[ref.path], ...data }; },
        delete: (ref: any) => { delete mockStore[ref.path]; }
      };
      return updateFunction(txn);
    }
  } as any;

  let hashFnCallCount = 0;
  const spyHashFn = async (pin: string) => {
    hashFnCallCount++;
    return `scrypt:v2:v1:mock_salt:mock_key_${pin}`;
  };

  const testOptions = {
    adminAuth: mockAuth,
    adminFirestore: mockFirestore,
    pepperConfig: TEST_PEPPER_CONFIG,
    hashPinFn: spyHashFn
  };

  // --- SECTION 1: TOKEN VERIFICATION & SANITIZED ERROR CLASSIFICATION ---
  console.log('1. Token Verification & Sanitized Error Classification');
  {
    // 1a. Missing token
    let missingTokenErr: any;
    try {
      await listCashierAccounts({ ownerToken: '', tenantId: TENANT_A }, testOptions);
    } catch (err) {
      missingTokenErr = err;
    }
    assert(missingTokenErr instanceof LifecycleError, 'Missing token throws typed LifecycleError');
    assert(missingTokenErr?.code === LifecycleErrorCode.UNAUTHORIZED, 'Error code is UNAUTHORIZED');
    assert(missingTokenErr?.httpStatus === 401, 'HTTP status is 401');
    assert(!missingTokenErr?.userMessage.includes('token') && !missingTokenErr?.userMessage.includes('auth'), 'User message is sanitized');

    // 1b. Invalid token
    let invalidTokenErr: any;
    try {
      await listCashierAccounts({ ownerToken: 'bad_token', tenantId: TENANT_A }, testOptions);
    } catch (err) {
      invalidTokenErr = err;
    }
    assert(invalidTokenErr instanceof LifecycleError && invalidTokenErr.httpStatus === 401, 'Invalid token maps to 401 LifecycleError');

    // 1c. Authenticated non-owner
    let nonOwnerErr: any;
    try {
      await listCashierAccounts({ ownerToken: 'token_non_owner', tenantId: TENANT_A }, testOptions);
    } catch (err) {
      nonOwnerErr = err;
    }
    assert(nonOwnerErr instanceof LifecycleError && nonOwnerErr.httpStatus === 403, 'Non-owner maps to 403 FORBIDDEN');

    // 1d. Cross-tenant request
    let crossTenantErr: any;
    try {
      await listCashierAccounts({ ownerToken: 'token_owner_a', tenantId: TENANT_B }, testOptions);
    } catch (err) {
      crossTenantErr = err;
    }
    assert(crossTenantErr instanceof LifecycleError && crossTenantErr.httpStatus === 403, 'Cross-tenant request maps to 403 FORBIDDEN');

    // 1e. Malformed payload
    let malformedErr: any;
    try {
      await createCashierAccount({ ownerToken: 'token_owner_a', tenantId: TENANT_A, username: 'a', pin: '12' }, testOptions);
    } catch (err) {
      malformedErr = err;
    }
    assert(malformedErr instanceof LifecycleError && malformedErr.httpStatus === 400, 'Malformed payload maps to 400 INVALID_PAYLOAD');
  }

  // --- SECTION 2: OWNERSHIP BEFORE EXPENSIVE KDF ---
  console.log('\n2. Preliminary Ownership Check Before Expensive KDF');
  {
    hashFnCallCount = 0;

    // Non-owner attempting create
    let nonOwnerCreateBlocked = false;
    try {
      await createCashierAccount({
        ownerToken: 'token_non_owner',
        tenantId: TENANT_A,
        username: 'juan',
        pin: '1234'
      }, testOptions);
    } catch (err) {
      nonOwnerCreateBlocked = true;
    }
    assert(nonOwnerCreateBlocked, 'Non-owner create is rejected');
    assert(hashFnCallCount === 0, 'Expensive PIN hashing was NOT invoked for non-owner create attempt');

    // Cross-tenant owner attempting create
    let crossTenantCreateBlocked = false;
    try {
      await createCashierAccount({
        ownerToken: 'token_owner_b',
        tenantId: TENANT_A,
        username: 'juan',
        pin: '1234'
      }, testOptions);
    } catch (err) {
      crossTenantCreateBlocked = true;
    }
    assert(crossTenantCreateBlocked, 'Cross-tenant create is rejected');
    assert(hashFnCallCount === 0, 'Expensive PIN hashing was NOT invoked for cross-tenant create attempt');

    // Non-owner attempting reset
    let nonOwnerResetBlocked = false;
    try {
      await resetCashierPin({
        ownerToken: 'token_non_owner',
        tenantId: TENANT_A,
        staffAccountId: 'staff_xyz',
        newPin: '9999'
      }, testOptions);
    } catch (err) {
      nonOwnerResetBlocked = true;
    }
    assert(nonOwnerResetBlocked, 'Non-owner PIN reset is rejected');
    assert(hashFnCallCount === 0, 'Expensive PIN hashing was NOT invoked for non-owner reset attempt');
  }

  // --- SECTION 3: DETERMINISTIC ATOMIC CASHIER SLOT GUARD & CREATION ---
  console.log('\n3. Deterministic Atomic Cashier Slot Guard & Creation');
  {
    // Valid owner A creates Cashier
    const created = await createCashierAccount({
      ownerToken: 'token_owner_a',
      tenantId: TENANT_A,
      username: 'maria',
      pin: '1234'
    }, testOptions);

    assert(created.username === 'maria', 'Owner creates Cashier account successfully');
    assert(hashFnCallCount === 1, 'Expensive PIN hashing was invoked exactly once for authorized create');
    assert(mockStore[`tenants/${TENANT_A}/staff_slots/cashier_primary`] !== undefined, 'Deterministic slot cashier_primary is registered');
    assert(mockStore[`tenants/${TENANT_A}/staff_slots/cashier_primary`].staffAccountId === created.id, 'Slot references the created staffAccountId');

    // Concurrent duplicate username creation attempt
    let duplicateUserBlocked = false;
    try {
      await createCashierAccount({
        ownerToken: 'token_owner_b',
        tenantId: TENANT_B,
        username: 'maria', // same username
        pin: '5678'
      }, testOptions);
    } catch (err: any) {
      duplicateUserBlocked = err instanceof LifecycleError && err.code === LifecycleErrorCode.USERNAME_UNAVAILABLE;
    }
    assert(duplicateUserBlocked, 'Same username across tenants is rejected with USERNAME_UNAVAILABLE');

    // Concurrent different username against occupied Tenant A
    let differentUserSlotBlocked = false;
    try {
      await createCashierAccount({
        ownerToken: 'token_owner_a',
        tenantId: TENANT_A,
        username: 'pedro', // different username
        pin: '9999'
      }, testOptions);
    } catch (err: any) {
      differentUserSlotBlocked = err instanceof LifecycleError && err.code === LifecycleErrorCode.SLOT_LIMIT_REACHED;
    }
    assert(differentUserSlotBlocked, 'Different username on occupied slot is rejected with SLOT_LIMIT_REACHED');
  }

  // --- SECTION 4: SAFE LISTING (ZERO LEAKAGE & ALLOWLIST PROJECTION) ---
  console.log('\n4. Safe Listing & Field Allowlist Enforcement');
  {
    const list = await listCashierAccounts({ ownerToken: 'token_owner_a', tenantId: TENANT_A }, testOptions);
    assert(list.length === 1, 'Owner A lists 1 Cashier account');

    const item = list[0];
    assert(item.id !== undefined, 'id is present');
    assert(item.username === 'maria', 'username is present');
    assert(item.status === 'active', 'status is active');
    assert(item.actionsAvailable.resetPin === true, 'resetPin is available for active cashier');
    assert(item.actionsAvailable.disable === true, 'disable is available for active cashier');
    assert(item.actionsAvailable.remove === true, 'remove is available');

    // Strict absence of unallowed fields
    assert((item as any).tenantId === undefined, 'tenantId is strictly omitted from list items');
    assert((item as any).pin === undefined, 'pin is NOT present');
    assert((item as any).pinHash === undefined, 'pinHash is NOT present');
    assert((item as any).salt === undefined, 'salt is NOT present');
    assert((item as any).pepper === undefined, 'pepper is NOT present');
    assert((item as any).authUid === undefined, 'authUid is NOT present');
    assert((item as any).sessionVersion === undefined, 'sessionVersion is NOT present');
  }

  // --- SECTION 5: PIN RESET, RECOVERY & SESSION ROTATION ---
  console.log('\n5. PIN Reset, Recovery & Session Rotation');
  {
    const staffDocKey = Object.keys(mockStore).find(k => k.startsWith(`tenants/${TENANT_A}/staff_accounts/`))!;
    const staffId = staffDocKey.split('/').pop()!;
    mockStore[staffDocKey].activeShiftId = 'secure_shift_active';

    const resetResult = await resetCashierPin({
      ownerToken: 'token_owner_a',
      tenantId: TENANT_A,
      staffAccountId: staffId,
      newPin: '4321'
    }, testOptions);

    assert(resetResult.success === true, 'PIN reset succeeded');
    assert(resetResult.sessionVersion === 2, 'Session version incremented to 2');
    assert(mockStore[staffDocKey].sessionVersion === 2, 'Stored staff document sessionVersion is 2');
  }

  // --- SECTION 6: DISABLE CASHIER & UI CLARITY ---
  console.log('\n6. Disable Cashier & Actions Availability Projection');
  {
    const staffDocKey = Object.keys(mockStore).find(k => k.startsWith(`tenants/${TENANT_A}/staff_accounts/`))!;
    const staffId = staffDocKey.split('/').pop()!;

    const disableResult = await disableCashierAccount({
      ownerToken: 'token_owner_a',
      tenantId: TENANT_A,
      staffAccountId: staffId
    }, testOptions);

    assert(disableResult.success === true, 'Disable cashier succeeded');
    assert(disableResult.sessionVersion === 3, 'Session version incremented to 3');
    assert(mockStore[staffDocKey].status === 'disabled', 'Stored status is disabled');
    assert(mockStore[staffDocKey].activeShiftId === 'secure_shift_active', 'Disable revokes session without deleting active-shift accounting identity');

    // Check list projection for disabled cashier
    const listAfterDisable = await listCashierAccounts({ ownerToken: 'token_owner_a', tenantId: TENANT_A }, testOptions);
    const disabledItem = listAfterDisable[0];
    assert(disabledItem.status === 'disabled', 'List item status reflects disabled');
    assert(disabledItem.actionsAvailable.resetPin === false, 'resetPin is DISABLED for inactive/disabled cashier');
    assert(disabledItem.actionsAvailable.disable === false, 'disable is false when already disabled');
    assert(disabledItem.actionsAvailable.remove === true, 'remove remains available');
  }

  // --- SECTION 7: REMOVE CASHIER, SLOT RELEASE & MISMATCH PROTECTION ---
  console.log('\n7. Remove Cashier, Slot Release & Mismatch Protection');
  {
    const staffDocKey = Object.keys(mockStore).find(k => k.startsWith(`tenants/${TENANT_A}/staff_accounts/`))!;
    const staffId = staffDocKey.split('/').pop()!;

    deleteUserCalled = false;
    try {
      await removeCashierAccount({ ownerToken: 'token_owner_a', tenantId: TENANT_A, staffAccountId: staffId }, testOptions);
      assert(false, 'Removal while activeShiftId exists is denied');
    } catch (error) {
      assert(error instanceof LifecycleError && error.code === LifecycleErrorCode.ACTIVE_SHIFT_EXISTS, 'Removal while activeShiftId exists is denied');
    }
    assert(mockStore[staffDocKey] !== undefined, 'Denied removal preserves Cashier accounting identity');
    delete mockStore[staffDocKey].activeShiftId;
    await removeCashierAccount({
      ownerToken: 'token_owner_a',
      tenantId: TENANT_A,
      staffAccountId: staffId
    }, testOptions);

    assert(mockStore[staffDocKey] === undefined, 'Staff account document was deleted');
    assert(mockStore[`tenants/${TENANT_A}/staff_slots/cashier_primary`] === undefined, 'Slot guard was released');
    assert(mockStore['staff_usernames/maria'] === undefined, 'Username reservation was released');
    assert(deleteUserCalled === false, 'Firebase Auth user deletion was NEVER invoked');

    // Slot is now free in Tenant A: new cashier can be created
    const createdNew = await createCashierAccount({
      ownerToken: 'token_owner_a',
      tenantId: TENANT_A,
      username: 'maria', // Re-claiming released username
      pin: '9876'
    }, testOptions);
    assert(createdNew.username === 'maria', 'Released slot and username can be claimed again');

    // Tamper slot and reservation to test mismatch preservation
    mockStore[`tenants/${TENANT_A}/staff_slots/cashier_primary`] = {
      slotId: 'cashier_primary',
      tenantId: 'other_tenant',
      staffAccountId: 'other_staff'
    };
    mockStore['staff_usernames/maria'] = {
      tenantId: 'other_tenant',
      staffAccountId: 'other_staff'
    };

    // Remove Cashier New
    await removeCashierAccount({
      ownerToken: 'token_owner_a',
      tenantId: TENANT_A,
      staffAccountId: createdNew.id
    }, testOptions);

    assert(mockStore[`tenants/${TENANT_A}/staff_slots/cashier_primary`] !== undefined, 'Mismatched slot was NOT deleted');
    assert(mockStore['staff_usernames/maria'] !== undefined, 'Mismatched username reservation was NOT deleted');
  }

  console.log('\n================================================================');
  console.log(`  CONSOLIDATED OWNER LIFECYCLE SUITE: TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runOwnerLifecycleSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
