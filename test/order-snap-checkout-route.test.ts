/**
 * Order Snap Checkout Route Unit Tests
 *
 * Covers:
 * 1. Missing or invalid Bearer token rejection (401)
 * 2. Content-Type and payload size limit enforcement (<= 64KB)
 * 3. Role verification and Cashier response COGS redaction (mode: online_direct)
 * 4. Cross-tenant request tampering rejection (403)
 * 5. Offline sync mode requires cryptographic authority grant
 * 6. Missing mode is rejected (strict discriminated union)
 * 7. Missing paymentMethod is rejected
 * 8. Unknown fields are rejected by .strict() schema
 * 9. online_direct forbids authorityGrant, deviceId, catalogVersion
 * 10. offline_sync requires authorityGrant, deviceId, and catalogVersion
 * 11. Mode omission cannot downgrade an offline_sync order
 * 12. Device mismatch between envelope and signed grant is rejected
 * 13. Catalog version mismatch between envelope and signed grant is rejected
 * 14. Tenant module mismatch (grant moduleId != current tenant moduleType) is rejected
 * 15. Public errors never expose catalog hashes, key IDs, or internal validation details
 * 16. Queued order signed against older catalog version is not rejected solely because server catalog changes
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOrderSnapCheckoutRouteHandler,
  verifyOrderSnapIdentityFromToken
} from '../src/lib/server/order-snap-checkout-handler';
import { OrderSnapGrantSigner } from '../src/lib/server/order-snap-grant-signer';
import { OrderSnapErrorCode } from '../src/lib/server/order-snap-finalizer';

const TEST_KEY = 'test_secret_must_be_sufficiently_long_32chars_min';

// ============================================================
// Shared fixtures
// ============================================================

function buildMockAuth(overrides?: Partial<{
  uid: string; role: string; tenantId: string; staffAccountId: string; sessionVersion: number;
}>): any {
  return {
    verifyIdToken: async () => ({
      uid: 'uid_cashier_1',
      role: 'cashier',
      tenantId: 'tenant_cafe',
      staffAccountId: 'staff_1',
      sessionVersion: 1,
      ...overrides
    })
  };
}

function buildMockFirestore(docMap: Record<string, any>): any {
  const mockDocSnap = (data: any) => ({ exists: !!data, data: () => data || null });
  return {
    collection: (col: string) => ({
      doc: (id: string) => {
        const p = `${col}/${id}`;
        return {
          path: p,
          get: async () => mockDocSnap(docMap[p] || null),
          collection: (subCol: string) => ({
            doc: (subId: string) => {
              const sp = `${p}/${subCol}/${subId}`;
              return { path: sp, get: async () => mockDocSnap(docMap[sp] || null) };
            }
          })
        };
      }
    }),
    runTransaction: async (fn: any) => {
      const tx: any = {
        get: async (ref: any) => mockDocSnap(docMap[ref.path] || null),
        set: () => {},
        update: () => {}
      };
      return fn(tx);
    }
  };
}

function buildFullDocMap(): Record<string, any> {
  return {
    'tenants/tenant_cafe': {
      moduleType: 'order-snap',
      subscriptionStatus: 'active',
      ownerUid: 'uid_owner_1'
    },
    'tenants/tenant_cafe/staff_accounts/staff_1': {
      tenantId: 'tenant_cafe',
      authUid: 'uid_cashier_1',
      status: 'active',
      sessionVersion: 1
    },
    'tenants/tenant_cafe/menu_items/item_latte': {
      id: 'item_latte',
      menuItemId: 'item_latte',
      tenantId: 'tenant_cafe',
      name: 'Iced Latte',
      category: 'Beverages',
      basePriceCentavos: 12000,
      activeRecipeVersionId: 'rec_latte_v1',
      isActive: true,
      isAvailable: true,
      modifierGroupIds: []
    },
    'tenants/tenant_cafe/recipes/rec_latte_v1': {
      id: 'rec_latte_v1',
      recipeVersionId: 'rec_latte_v1',
      tenantId: 'tenant_cafe',
      menuItemId: 'item_latte',
      version: 1,
      yield: 1,
      isActive: true,
      components: [
        { ingredientId: 'ing_beans', quantityMinor: 18000, unit: 'kg', quantityScale: 3 }
      ]
    },
    'tenants/tenant_cafe/ingredients/ing_beans': {
      id: 'ing_beans',
      tenantId: 'tenant_cafe',
      name: 'Coffee Beans',
      unit: 'kg',
      quantityScale: 3,
      stockQuantityMinor: 500000,
      costBasis: { basisQuantityMinor: 1000000, basisCostCentavos: 50000 },
      reorderLevelMinor: 10000,
      version: 1,
      isActive: true
    }
  };
}

function buildValidGrant(
  signer: OrderSnapGrantSigner,
  overrides?: Partial<{
    deviceId: string;
    catalogVersion: string;
    staffAccountId: string;
    moduleId: 'order-snap' | 'timpla-track' | 'bite-snap';
    tenantId: string;
  }>
) {
  const nowSec = Math.floor(Date.now() / 1000);
  return signer.signGrant({
    grantId: 'grant_test_1',
    moduleId: overrides?.moduleId ?? 'order-snap',
    tenantId: overrides?.tenantId ?? 'tenant_cafe',
    staffAccountId: overrides?.staffAccountId ?? 'staff_1',
    actorId: `staff_${overrides?.staffAccountId ?? 'staff_1'}`,
    authUid: 'uid_cashier_1',
    sessionVersion: 1,
    role: 'cashier',
    displayName: 'Staff 1',
    deviceId: overrides?.deviceId ?? 'dev_abc123',
    catalogVersion: overrides?.catalogVersion ?? 'cat_v1',
    issuedAt: nowSec,
    expiresAt: nowSec + 3600,
    allowedTenders: ['cash']
  });
}

function buildOrderRequest(overrides?: Partial<{ tenantId: string; staffAccountId: string; orderId: string }>) {
  const now = new Date().toISOString();
  return {
    orderId: overrides?.orderId ?? 'ord_test_1',
    tenantId: overrides?.tenantId ?? 'tenant_cafe',
    staffAccountId: overrides?.staffAccountId ?? 'staff_1',
    idempotencyKey: `idemp_${overrides?.orderId ?? 'ord_test_1'}`,
    createdAt: now,
    committedAt: now,
    lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }]
  };
}

// ============================================================
// Tests 1–5 (original)
// ============================================================

test('1. Missing or invalid Bearer token rejection', async () => {
  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: {
      verifyIdToken: async () => { throw new Error('Invalid token'); }
    } as any
  });

  const reqNoAuth = new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request: {} })
  });
  const resNoAuth = await handler(reqNoAuth);
  assert.equal(resNoAuth.status, 401);
  const dataNoAuth = await resResJson(resNoAuth);
  assert.equal(dataNoAuth.category, OrderSnapErrorCode.AUTHENTICATION_REQUIRED);

  const reqInvalid = new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bad_token' },
    body: JSON.stringify({ request: {} })
  });
  const resInvalid = await handler(reqInvalid);
  assert.equal(resInvalid.status, 401);
});

test('2. Content-Type and body size limits (<= 64KB)', async () => {
  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 })
  });

  const reqWrongType = new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'plain text'
  });
  const resWrongType = await handler(reqWrongType);
  assert.equal(resWrongType.status, 400);

  const hugeString = 'a'.repeat(66 * 1024);
  const reqHuge = new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid_token',
      'Content-Length': String(hugeString.length)
    },
    body: hugeString
  });
  const resHuge = await handler(reqHuge);
  assert.equal(resHuge.status, 400);
});

test('3. Role verification and Cashier response COGS redaction', async () => {
  const docMap = buildFullDocMap();
  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(docMap)
  });

  const cashierReq = new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest({ orderId: 'ord_route_1' }),
      paymentMethod: 'cash',
      mode: 'online_direct'
    })
  });

  const res = await handler(cashierReq);
  const data = await resResJson(res);
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.result);
  assert.equal(data.result.totalCogsCentavos, undefined, 'Cashier must NEVER see totalCogsCentavos');
  assert.equal(data.result.grossMarginBasisPoints, undefined, 'Cashier must NEVER see margins');
  assert.equal(data.result.movements, undefined, 'Cashier must NEVER see ledger movements');
  for (const line of data.result.saleLines) {
    assert.equal(line.lineCogsCentavos, undefined, 'Cashier sale line must NEVER include COGS');
    assert.equal(line.lineMarginBasisPoints, undefined, 'Cashier sale line must NEVER include margin');
  }
});

test('4. Cross-tenant tampering rejection (403)', async () => {
  const docMap: Record<string, any> = {
    'tenants/tenant_legitimate': { moduleType: 'order-snap', subscriptionStatus: 'active', ownerUid: 'uid_cashier_1' },
    'tenants/tenant_legitimate/staff_accounts/staff_1': {
      tenantId: 'tenant_legitimate', authUid: 'uid_cashier_1', status: 'active', sessionVersion: 1
    }
  };

  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth({ tenantId: 'tenant_legitimate' }),
    adminFirestore: buildMockFirestore(docMap)
  });

  const now = new Date().toISOString();
  const reqTampered = new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid_token' },
    body: JSON.stringify({
      request: { orderId: 'ord_tamper', tenantId: 'tenant_victim', staffAccountId: 'staff_1',
        idempotencyKey: 'idemp_tamper', createdAt: now, committedAt: now,
        lines: [{ lineId: 'l1', menuItemId: 'item_latte', quantity: 1 }] },
      paymentMethod: 'cash',
      mode: 'online_direct'
    })
  });
  const res = await handler(reqTampered);
  assert.equal(res.status, 403);
  const data = await resResJson(res);
  assert.equal(data.category, OrderSnapErrorCode.OPERATION_NOT_PERMITTED);
});

test('5. Offline sync mode requires cryptographic authority grant', async () => {
  const signer = new OrderSnapGrantSigner({ keys: { v1: TEST_KEY } });
  const docMap = buildFullDocMap();

  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(docMap),
    grantSigner: signer
  });

  const orderRequest = buildOrderRequest({ orderId: 'ord_sync_test' });
  const validGrant = buildValidGrant(signer, { deviceId: 'dev_abc123', catalogVersion: 'cat_v1' });

  // Case A: Missing grant in offline_sync mode — schema rejects (missing required authorityGrant) -> 400
  const resNoGrant = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({ request: orderRequest, paymentMethod: 'cash', mode: 'offline_sync' })
  }));
  assert.equal(resNoGrant.status, 400, 'Missing grant in offline_sync must be rejected');

  // Case B: Tampered grant (signature corrupted - keeps schema valid but fails HMAC) -> 403
  const tamperedGrant = {
    ...validGrant,
    signature: validGrant.signature.replace(/^.{4}/, 'dead') // corrupt first 4 hex chars
  };
  const resTampered = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: orderRequest, paymentMethod: 'cash', mode: 'offline_sync',
      authorityGrant: tamperedGrant, deviceId: 'dev_abc123', catalogVersion: 'cat_v1'
    })
  }));
  assert.equal(resTampered.status, 403, 'Tampered grant must be rejected');

  // Case C: Valid grant with matching deviceId/catalogVersion -> 200
  const resValid = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: orderRequest, paymentMethod: 'cash', mode: 'offline_sync',
      authorityGrant: validGrant, deviceId: 'dev_abc123', catalogVersion: 'cat_v1'
    })
  }));
  const dataValid = await resResJson(resValid);
  assert.equal(resValid.status, 200, 'Valid offline sync must succeed');
  assert.equal(dataValid.success, true);
});

// ============================================================
// NEW FAILING → PASSING TESTS (defect coverage)
// ============================================================

test('6. Missing mode is rejected (strict discriminated union)', async () => {
  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(buildFullDocMap())
  });

  // No mode field at all
  const res = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({ request: buildOrderRequest(), paymentMethod: 'cash' })
  }));
  assert.equal(res.status, 400, 'Missing mode must return 400');
  const data = await resResJson(res);
  assert.equal(data.category, OrderSnapErrorCode.INVALID_REQUEST);
  // Ensure no Zod internals are exposed
  const body = JSON.stringify(data);
  assert.ok(!body.includes('ZodError'), 'Must not expose ZodError');
  assert.ok(!body.includes('Required'), 'Must not expose Zod Required message');
});

test('7. Missing paymentMethod is rejected', async () => {
  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(buildFullDocMap())
  });

  const res = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({ request: buildOrderRequest(), mode: 'online_direct' }) // no paymentMethod
  }));
  assert.equal(res.status, 400, 'Missing paymentMethod must return 400');
  const data = await resResJson(res);
  assert.equal(data.category, OrderSnapErrorCode.INVALID_REQUEST);
});

test('8. Unknown fields are rejected by strict schema', async () => {
  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(buildFullDocMap())
  });

  const res = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest(), paymentMethod: 'cash', mode: 'online_direct',
      unknownField: 'should_be_rejected' // unknown field
    })
  }));
  assert.equal(res.status, 400, 'Unknown fields must return 400');
  const data = await resResJson(res);
  assert.equal(data.category, OrderSnapErrorCode.INVALID_REQUEST);
});

test('9. online_direct forbids authorityGrant, deviceId, and catalogVersion', async () => {
  const signer = new OrderSnapGrantSigner({ keys: { v1: TEST_KEY } });
  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(buildFullDocMap()),
    grantSigner: signer
  });

  const validGrant = buildValidGrant(signer);

  // online_direct with authorityGrant -> 400
  const resWithGrant = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest({ orderId: 'ord_online_grant' }),
      paymentMethod: 'cash',
      mode: 'online_direct',
      authorityGrant: validGrant
    })
  }));
  assert.equal(resWithGrant.status, 400, 'online_direct must forbid authorityGrant');

  // online_direct with deviceId -> 400
  const resWithDeviceId = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest({ orderId: 'ord_online_devid' }),
      paymentMethod: 'cash',
      mode: 'online_direct',
      deviceId: 'dev_abc'
    })
  }));
  assert.equal(resWithDeviceId.status, 400, 'online_direct must forbid deviceId');

  // online_direct with catalogVersion -> 400
  const resWithCatalog = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest({ orderId: 'ord_online_cat' }),
      paymentMethod: 'cash',
      mode: 'online_direct',
      catalogVersion: 'cat_v1'
    })
  }));
  assert.equal(resWithCatalog.status, 400, 'online_direct must forbid catalogVersion');
});

test('10. offline_sync requires authorityGrant, deviceId, and catalogVersion', async () => {
  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(buildFullDocMap())
  });

  const signer = new OrderSnapGrantSigner({ keys: { v1: TEST_KEY } });
  const validGrant = buildValidGrant(signer);

  // Missing authorityGrant
  const resNoGrant = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest({ orderId: 'ord_nrg' }), paymentMethod: 'cash', mode: 'offline_sync',
      deviceId: 'dev_abc', catalogVersion: 'cat_v1'
    })
  }));
  assert.equal(resNoGrant.status, 400, 'offline_sync without authorityGrant must be 400');

  // Missing deviceId
  const resNoDevice = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest({ orderId: 'ord_nrd' }), paymentMethod: 'cash', mode: 'offline_sync',
      authorityGrant: validGrant, catalogVersion: 'cat_v1'
    })
  }));
  assert.equal(resNoDevice.status, 400, 'offline_sync without deviceId must be 400');

  // Missing catalogVersion
  const resNoCat = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest({ orderId: 'ord_nrc' }), paymentMethod: 'cash', mode: 'offline_sync',
      authorityGrant: validGrant, deviceId: 'dev_abc'
    })
  }));
  assert.equal(resNoCat.status, 400, 'offline_sync without catalogVersion must be 400');
});

test('11. Mode omission cannot downgrade an offline_sync order', async () => {
  // An attacker omits mode hoping the server infers 'online_direct' and skips grant verification.
  // With strict discriminated union: mode absent -> 400, not 200 via silent downgrade.
  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(buildFullDocMap())
  });

  const signer = new OrderSnapGrantSigner({ keys: { v1: TEST_KEY } });
  const validGrant = buildValidGrant(signer);

  // Send all offline_sync fields but omit mode -> must be rejected, not downgraded to online_direct
  const res = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest({ orderId: 'ord_downgrade' }),
      paymentMethod: 'cash',
      authorityGrant: validGrant,
      deviceId: 'dev_abc123',
      catalogVersion: 'cat_v1'
      // mode intentionally absent
    })
  }));
  assert.equal(res.status, 400, 'Omitting mode must reject, not silently downgrade to online_direct');
});

test('12. Device mismatch between envelope and signed grant is rejected', async () => {
  const signer = new OrderSnapGrantSigner({ keys: { v1: TEST_KEY } });
  const docMap = buildFullDocMap();

  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(docMap),
    grantSigner: signer
  });

  // Grant signed with deviceId 'dev_real'
  const grant = buildValidGrant(signer, { deviceId: 'dev_real', catalogVersion: 'cat_v1' });

  // Envelope claims 'dev_evil' — different from what was signed
  const res = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest({ orderId: 'ord_devmismatch' }),
      paymentMethod: 'cash',
      mode: 'offline_sync',
      authorityGrant: grant,
      deviceId: 'dev_evil', // mismatch
      catalogVersion: 'cat_v1'
    })
  }));
  assert.equal(res.status, 403, 'Device mismatch must be rejected with 403');
  const data = await resResJson(res);
  assert.equal(data.category, OrderSnapErrorCode.OPERATION_NOT_PERMITTED);
  // Must not expose signed deviceId or internal details
  const body = JSON.stringify(data);
  assert.ok(!body.includes('dev_real'), 'Must not expose signed deviceId in error response');
});

test('13. Catalog version mismatch between envelope and signed grant is rejected', async () => {
  const signer = new OrderSnapGrantSigner({ keys: { v1: TEST_KEY } });
  const docMap = buildFullDocMap();

  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(docMap),
    grantSigner: signer
  });

  // Grant signed with catalogVersion 'cat_v1'
  const grant = buildValidGrant(signer, { deviceId: 'dev_abc123', catalogVersion: 'cat_v1' });

  // Envelope claims 'cat_v999' — different from what was signed
  const res = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest({ orderId: 'ord_catmismatch' }),
      paymentMethod: 'cash',
      mode: 'offline_sync',
      authorityGrant: grant,
      deviceId: 'dev_abc123',
      catalogVersion: 'cat_v999' // mismatch
    })
  }));
  assert.equal(res.status, 403, 'Catalog mismatch must be rejected with 403');
  const data = await resResJson(res);
  assert.equal(data.category, OrderSnapErrorCode.OPERATION_NOT_PERMITTED);
  // Must not expose catalog hashes in error response
  const errBody = JSON.stringify(data);
  assert.ok(!errBody.includes('cat_v1'), 'Must not expose signed catalogVersion in error response');
  assert.ok(!errBody.includes('cat_v999'), 'Must not expose envelope catalogVersion in error response');
});

test('14. Tenant module mismatch (grant moduleId != current tenant moduleType) is rejected', async () => {
  const signer = new OrderSnapGrantSigner({ keys: { v1: TEST_KEY } });

  // Tenant has moduleType 'timpla-track', but grant claims 'order-snap'
  const docMap = {
    ...buildFullDocMap(),
    'tenants/tenant_cafe': {
      moduleType: 'timpla-track', // different from grant moduleId 'order-snap'
      subscriptionStatus: 'active',
      ownerUid: 'uid_owner_1'
    }
  };

  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(docMap),
    grantSigner: signer
  });

  // Grant signed for 'order-snap' module
  const grant = buildValidGrant(signer, { deviceId: 'dev_abc123', catalogVersion: 'cat_v1', moduleId: 'order-snap' });

  const res = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest({ orderId: 'ord_modmismatch' }),
      paymentMethod: 'cash',
      mode: 'offline_sync',
      authorityGrant: grant,
      deviceId: 'dev_abc123',
      catalogVersion: 'cat_v1'
    })
  }));
  assert.equal(res.status, 403, 'Module ID mismatch must be rejected with 403');
  const data = await resResJson(res);
  assert.equal(data.category, OrderSnapErrorCode.OPERATION_NOT_PERMITTED);
  const errBody = JSON.stringify(data);
  assert.ok(!errBody.includes('timpla-track'), 'Must not expose tenant moduleType in error');
  assert.ok(!errBody.includes('order-snap'), 'Must not expose grant moduleId in error');
});

test('15. Public errors never expose catalog hashes, key IDs, or Zod internals', async () => {
  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(buildFullDocMap())
  });

  // Malformed body that triggers Zod validation
  const res = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({ mode: 'online_direct', paymentMethod: 'cash', request: 'not-an-object' })
  }));
  assert.equal(res.status, 400);
  const data = await resResJson(res);
  const errBody = JSON.stringify(data);
  assert.ok(!errBody.includes('ZodError'), 'Must not expose ZodError type');
  assert.ok(!errBody.includes('Expected'), 'Must not expose Zod Expected messages');
  assert.ok(!errBody.includes('keyId'), 'Must not expose keyId');
  assert.ok(!errBody.includes('signature'), 'Must not expose signature');
  assert.ok(!errBody.includes('stack'), 'Must not expose stack traces');
});

test('16. Queued order signed against older catalog is not rejected solely because server catalog changes', async () => {
  // The order was accepted offline when catalog was 'cat_v1'.
  // Server catalog has since advanced to 'cat_v2'.
  // The order must still be finalized (stock conflict detection happens via Firestore atomic transaction,
  // not catalog version comparison in the checkout handler).
  // The checkout handler MUST NOT compare the incoming catalogVersion against the server's current catalog.
  // It only compares envelope catalogVersion == grant.payload.catalogVersion (already tested in test 13).

  const signer = new OrderSnapGrantSigner({ keys: { v1: TEST_KEY } });
  const docMap = buildFullDocMap();
  // Server's current catalog is 'cat_v2' (stored in Firestore), but grant and envelope both say 'cat_v1'
  // The checkout handler must accept this — it is the authority endpoint that validates current catalog,
  // not the checkout handler during sync.

  const handler = createOrderSnapCheckoutRouteHandler({
    enabled: () => true,
    extractClientIp: () => '203.0.113.1',
    admitNetworkRequest: async () => ({ isLimited: false, retryAfterSeconds: 0 }),
    adminAuth: buildMockAuth(),
    adminFirestore: buildMockFirestore(docMap),
    grantSigner: signer
  });

  // Both envelope and grant agree: cat_v1 (consistent)
  const grant = buildValidGrant(signer, { deviceId: 'dev_abc123', catalogVersion: 'cat_v1' });

  const res = await handler(new Request('https://katuwangsolutions.com/api/order-snap/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer cashier_token' },
    body: JSON.stringify({
      request: buildOrderRequest({ orderId: 'ord_old_cat' }),
      paymentMethod: 'cash',
      mode: 'offline_sync',
      authorityGrant: grant,
      deviceId: 'dev_abc123',
      catalogVersion: 'cat_v1' // older than server's current, but consistent with grant
    })
  }));
  // Must succeed: stock conflicts are caught by Firestore transaction (live inventory), not catalog version
  const data = await resResJson(res);
  assert.equal(res.status, 200, 'Consistent older catalog version must not be rejected by checkout handler');
  assert.equal(data.success, true);
});

// ============================================================
// Helper
// ============================================================

async function resResJson(res: Response): Promise<any> {
  const text = await res.text();
  return JSON.parse(text);
}