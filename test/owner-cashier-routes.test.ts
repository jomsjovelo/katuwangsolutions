import { 
  createCashiersRouteHandlers,
  createResetPinRouteHandler,
  createDisableRouteHandler,
  createRemoveRouteHandler 
} from '../src/lib/server/owner-cashier-handlers';

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

async function runRouteHandlerTests() {
  console.log('================================================================');
  console.log('  OWNER CASHIER API ROUTES — GENUINE HTTP REQUEST/RESPONSE SUITE');
  console.log('================================================================\n');

  const TENANT_A = 'tenant_route_store_alpha';
  const OWNER_A_UID = 'owner_uid_alpha_123';
  const NON_OWNER_UID = 'regular_user_789';

  const mockStore: Record<string, any> = {
    [`tenants/${TENANT_A}`]: { ownerUid: OWNER_A_UID, name: 'Alpha Store', businessCode: 'ALPHA123' }
  };

  const mockAuth = {
    verifyIdToken: async (token: string) => {
      if (token === 'token_owner_a') return { uid: OWNER_A_UID };
      if (token === 'token_non_owner') return { uid: NON_OWNER_UID };
      throw new Error('Firebase ID token has expired or is invalid.');
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

  const serviceOptions = {
    adminAuth: mockAuth,
    adminFirestore: mockFirestore,
    pepperConfig: TEST_PEPPER_CONFIG
  };

  const cashiersRoutes = createCashiersRouteHandlers(serviceOptions);
  const resetPinRoute = createResetPinRouteHandler(serviceOptions);
  const disableRoute = createDisableRouteHandler(serviceOptions);
  const removeRoute = createRemoveRouteHandler(serviceOptions);

  // 1. Missing Token -> Sanitized 401
  console.log('1. Missing Token Handling');
  {
    const req = new Request('http://localhost:3000/api/owner/cashiers?tenantId=' + TENANT_A, {
      method: 'GET'
    });
    const res = await cashiersRoutes.GET(req);
    const body = await res.json();
    assert(res.status === 401, 'Missing token returns HTTP 401');
    assert(body.error === 'Kailangan munang mag-log in bilang may-ari ng tindahan.', 'Error message is sanitized');
    assert(!JSON.stringify(body).includes('Authorization'), 'No internal header names leaked');
  }

  // 2. Invalid Token -> Sanitized 401
  console.log('\n2. Invalid Token Handling');
  {
    const req = new Request('http://localhost:3000/api/owner/cashiers?tenantId=' + TENANT_A, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer garbage_token_123' }
    });
    const res = await cashiersRoutes.GET(req);
    const body = await res.json();
    assert(res.status === 401, 'Invalid token returns HTTP 401');
    assert(body.error === 'Kailangan munang mag-log in bilang may-ari ng tindahan.', 'Error message is sanitized');
  }

  // 3. Authenticated Non-Owner -> Sanitized 403
  console.log('\n3. Non-Owner Rejection');
  {
    const req = new Request('http://localhost:3000/api/owner/cashiers?tenantId=' + TENANT_A, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token_non_owner' }
    });
    const res = await cashiersRoutes.GET(req);
    const body = await res.json();
    assert(res.status === 403, 'Non-owner returns HTTP 403');
    assert(body.error === 'Wala kayong pahintulot na baguhin ang tindahang ito.', 'Error message is sanitized');
  }

  // 4. Malformed JSON -> Sanitized 400
  console.log('\n4. Malformed JSON Body');
  {
    const req = new Request('http://localhost:3000/api/owner/cashiers', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer token_owner_a',
        'Content-Type': 'application/json'
      },
      body: 'INVALID_JSON_BODY{{{'
    });
    const res = await cashiersRoutes.POST(req);
    const body = await res.json();
    assert(res.status === 400, 'Malformed JSON body returns HTTP 400');
    assert(body.error === 'Kailangan ang wastong impormasyon at 4-digit numeric PIN.', 'Sanitized error message');
  }

  // 5. Successful Create Cashier -> Safe Response Fields
  let createdStaffId = '';
  console.log('\n5. Successful Create Cashier (POST /api/owner/cashiers)');
  {
    const req = new Request('http://localhost:3000/api/owner/cashiers', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer token_owner_a',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenantId: TENANT_A,
        username: 'juandelacruz',
        pin: '1234'
      })
    });
    const res = await cashiersRoutes.POST(req);
    const body = await res.json();
    assert(res.status === 200, 'Create cashier returns HTTP 200');
    assert(body.success === true, 'Success flag is true');
    assert(body.cashier.username === 'juandelacruz', 'Username matches');
    assert(body.cashier.status === 'active', 'Status is active');
    createdStaffId = body.cashier.id;

    // Strict absence of sensitive fields
    const bodyStr = JSON.stringify(body);
    assert(!bodyStr.includes('pinHash'), 'pinHash is strictly absent from response');
    assert(!bodyStr.includes('salt'), 'salt is strictly absent from response');
    assert(!bodyStr.includes('pepper'), 'pepper is strictly absent from response');
    assert(!bodyStr.includes('authUid'), 'authUid is strictly absent from response');
  }

  // 6. Username Unavailable -> Sanitized 409
  console.log('\n6. Username Unavailable (Duplicate Username)');
  {
    const req = new Request('http://localhost:3000/api/owner/cashiers', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer token_owner_a',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenantId: TENANT_A,
        username: 'juandelacruz', // already taken
        pin: '5678'
      })
    });
    const res = await cashiersRoutes.POST(req);
    const body = await res.json();
    assert(res.status === 409, 'Duplicate username returns HTTP 409');
    assert(body.error === 'Ang username na ito ay hindi na available. Pumili ng ibang username.', 'Sanitized error message');
  }

  // 7. Slot Occupied -> Sanitized 409
  console.log('\n7. Cashier Slot Occupied');
  {
    const req = new Request('http://localhost:3000/api/owner/cashiers', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer token_owner_a',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenantId: TENANT_A,
        username: 'different_user',
        pin: '5678'
      })
    });
    const res = await cashiersRoutes.POST(req);
    const body = await res.json();
    assert(res.status === 409, 'Occupied slot returns HTTP 409');
    assert(body.error === 'Nagamit na ang 1 Libreng Cashier Account slot para sa tindahang ito.', 'Sanitized error message');
  }

  // 8. Safe List Cashiers (GET /api/owner/cashiers)
  console.log('\n8. Safe List Cashiers (GET /api/owner/cashiers)');
  {
    const req = new Request('http://localhost:3000/api/owner/cashiers?tenantId=' + TENANT_A, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token_owner_a' }
    });
    const res = await cashiersRoutes.GET(req);
    const body = await res.json();
    assert(res.status === 200, 'List cashiers returns HTTP 200');
    assert(Array.isArray(body.cashiers) && body.cashiers.length === 1, 'Returns array of cashiers');
    const item = body.cashiers[0];
    assert(item.id === createdStaffId, 'Item ID matches');
    assert(item.tenantId === undefined, 'tenantId is omitted from item');
    assert(item.pinHash === undefined, 'pinHash is omitted');
    assert(item.authUid === undefined, 'authUid is omitted');
  }

  // 9. Reset PIN (POST /api/owner/cashiers/reset-pin)
  console.log('\n9. Reset PIN Route');
  {
    const req = new Request('http://localhost:3000/api/owner/cashiers/reset-pin', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer token_owner_a',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenantId: TENANT_A,
        staffAccountId: createdStaffId,
        newPin: '9999'
      })
    });
    const res = await resetPinRoute(req);
    const body = await res.json();
    assert(res.status === 200, 'Reset PIN returns HTTP 200');
    assert(body.success === true, 'Success flag is true');
  }

  // 10. Disable Cashier (POST /api/owner/cashiers/disable)
  console.log('\n10. Disable Cashier Route');
  {
    const req = new Request('http://localhost:3000/api/owner/cashiers/disable', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer token_owner_a',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenantId: TENANT_A,
        staffAccountId: createdStaffId
      })
    });
    const res = await disableRoute(req);
    const body = await res.json();
    assert(res.status === 200, 'Disable cashier returns HTTP 200');
    assert(body.success === true, 'Success flag is true');
  }

  // 11. Remove Cashier (POST /api/owner/cashiers/remove)
  console.log('\n11. Remove Cashier Route');
  {
    const staffPath = `tenants/${TENANT_A}/staff_accounts/${createdStaffId}`;
    mockStore[staffPath].activeShiftId = 'secure_shift_active';
    const blockedReq = new Request('http://localhost:3000/api/owner/cashiers/remove', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token_owner_a', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: TENANT_A, staffAccountId: createdStaffId })
    });
    const blockedRes = await removeRoute(blockedReq);
    assert(blockedRes.status === 409, 'Remove cashier with active shift returns HTTP 409');
    assert(mockStore[staffPath] !== undefined, 'Blocked removal preserves Cashier record');
    delete mockStore[staffPath].activeShiftId;
    const req = new Request('http://localhost:3000/api/owner/cashiers/remove', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer token_owner_a',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenantId: TENANT_A,
        staffAccountId: createdStaffId
      })
    });
    const res = await removeRoute(req);
    const body = await res.json();
    assert(res.status === 200, 'Remove cashier returns HTTP 200');
    assert(body.success === true, 'Success flag is true');
  }

  // 12. Injected Internal/Firestore Failure -> Generic Sanitized 500
  console.log('\n12. Injected Raw Internal Failure Sanitization');
  {
    const failingDb = {
      collection: () => {
        throw new Error('SENSITIVE_INTERNAL_FIRESTORE_STACK_TRACE_LEAK_SECRET_KEY_12345');
      }
    } as any;

    const failingCashiersRoute = createCashiersRouteHandlers({
      adminAuth: mockAuth,
      adminFirestore: failingDb,
      pepperConfig: TEST_PEPPER_CONFIG
    });

    const req = new Request('http://localhost:3000/api/owner/cashiers?tenantId=' + TENANT_A, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token_owner_a' }
    });
    const res = await failingCashiersRoute.GET(req);
    const body = await res.json();
    assert(res.status === 500, 'Injected internal error returns HTTP 500');
    assert(body.error === 'Nagkaroon ng problema sa server. Paki-subukan muli mamaya.', 'Returns generic sanitized error');
    assert(!JSON.stringify(body).includes('SENSITIVE_INTERNAL'), 'Zero raw injected error text appears in response');
  }

  console.log('\n================================================================');
  console.log(`  ROUTE HANDLER SUITE: TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRouteHandlerTests().catch((err) => {
  console.error('Route handler test error:', err);
  process.exit(1);
});
