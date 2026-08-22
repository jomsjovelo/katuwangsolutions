import assert from 'node:assert/strict';
import test from 'node:test';
import {
  staffPinLogin,
  fetchBentaBootstrap,
  openBentaShift,
  checkoutBenta,
  fetchBentaReceipt,
  reconcileAndCloseShift,
  staffLogout,
  executeCashierLogoutCoordinator
} from '../src/lib/client/secure-benta-cashier-client';
import { useSecureCashierStore } from '../src/store/use-secure-cashier-store';
import { useStaffSession } from '../src/store/use-staff-session';

test('Secure Cashier Client API Suite', async (t) => {

  await t.test('staffPinLogin posts credentials cleanly and returns customToken payload', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody: any = null;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method || '';
      capturedBody = JSON.parse(String(init?.body || '{}'));
      return new Response(JSON.stringify({
        success: true,
        customToken: 'mock.custom.token.123',
        tenantId: 'tenant_abc',
        authUid: 'cashier_user_xyz',
        sessionVersion: 1,
        tenantName: 'Katuwang Store',
        moduleType: 'benta-snap',
        staffAccount: { id: 'staff_123', username: 'maria', status: 'active' }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const res = await staffPinLogin('DEMO123', 'Maria', '1234', mockFetch as any);

    assert.equal(capturedUrl, '/api/auth/staff-pin-login');
    assert.equal(capturedMethod, 'POST');
    assert.equal(capturedBody.businessCode, 'DEMO123');
    assert.equal(capturedBody.username, 'maria');
    assert.equal(capturedBody.pin, '1234');
    assert.equal(res.customToken, 'mock.custom.token.123');
    assert.equal(res.tenantId, 'tenant_abc');
  });

  await t.test('staffPinLogin rejects invalid credentials with sanitized error', async () => {
    const mockFetch = async () => {
      return new Response(JSON.stringify({
        error: 'Maling Business Code, Username, o PIN. Paki-check at subukan muli.'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    };

    await assert.rejects(
      async () => staffPinLogin('DEMO123', 'wrong', '9999', mockFetch as any),
      (err: any) => {
        assert.match(err.message, /Maling Business Code/);
        assert.equal(err.status, 401);
        return true;
      }
    );
  });

  await t.test('fetchBentaBootstrap loads sanitized catalogue without costPrice or margins', async () => {
    let capturedHeaders: any = null;

    const mockFetch = async (_input: any, init?: RequestInit) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({
        tenantId: 'tenant_abc',
        tenantDisplayName: 'Katuwang Store',
        moduleId: 'benta-snap',
        staffAccountId: 'staff_123',
        cashierDisplayName: 'Maria Santos',
        currentShift: null,
        products: [
          { id: 'prod_1', name: 'Bigas', salePrice: 5000, currentStock: 20, unit: 'kg', isActive: true }
        ]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const res = await fetchBentaBootstrap('fake-id-token', mockFetch as any);

    assert.equal(capturedHeaders['Authorization'], 'Bearer fake-id-token');
    assert.equal(res.products.length, 1);
    assert.equal(res.products[0].salePrice, 5000);
    assert.equal((res.products[0] as any).costPrice, undefined);
  });

  await t.test('openBentaShift submits integer centavos and UUID idempotency key', async () => {
    let capturedBody: any = null;

    const mockFetch = async (_input: any, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body || '{}'));
      return new Response(JSON.stringify({
        shiftId: 'shift_999',
        openedAt: new Date().toISOString(),
        moduleId: 'benta-snap',
        status: 'open',
        startingCashCentavos: 50000
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    };

    const idempotencyKey = '11111111-1111-4111-8111-111111111111';
    const res = await openBentaShift('fake-id-token', idempotencyKey, 50000, mockFetch as any);

    assert.equal(capturedBody.idempotencyKey, idempotencyKey);
    assert.equal(capturedBody.startingCashCentavos, 50000);
    assert.equal(res.shiftId, 'shift_999');
    assert.equal(res.startingCashCentavos, 50000);
  });

  await t.test('checkoutBenta sends items and payment method without computed prices', async () => {
    let capturedBody: any = null;

    const mockFetch = async (_input: any, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body || '{}'));
      return new Response(JSON.stringify({
        saleId: 'sale_777',
        receiptNumber: 'RCP-001',
        committedAt: new Date().toISOString(),
        moduleId: 'benta-snap',
        paymentMethod: 'gcash',
        shiftId: 'shift_999',
        cashierDisplayName: 'Maria',
        items: [
          { productId: 'prod_1', name: 'Bigas', unit: 'kg', quantity: 2, unitPriceCentavos: 5000, lineTotalCentavos: 10000 }
        ],
        subtotalCentavos: 10000,
        totalCentavos: 10000
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    };

    const payload = {
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      shiftId: 'shift_999',
      items: [{ productId: 'prod_1', quantity: 2 }],
      paymentMethod: 'gcash' as const,
      paymentReference: 'GCASH-REF-001'
    };

    const res = await checkoutBenta('fake-id-token', payload, mockFetch as any);

    assert.equal(capturedBody.idempotencyKey, payload.idempotencyKey);
    assert.equal(capturedBody.shiftId, 'shift_999');
    assert.equal(capturedBody.items.length, 1);
    assert.equal((capturedBody.items[0] as any).price, undefined);
    assert.equal(capturedBody.paymentMethod, 'gcash');
    assert.equal(capturedBody.paymentReference, 'GCASH-REF-001');
    assert.equal(res.saleId, 'sale_777');
    assert.equal(res.totalCentavos, 10000);
  });

  await t.test('checkoutBenta error does not corrupt or wipe idempotency key in store', async () => {
    const store = useSecureCashierStore.getState();
    const key = store.getOrCreateCheckoutKey();

    const mockFailingFetch = async () => {
      return new Response(JSON.stringify({ error: 'Server timeout / connection lost' }), { status: 500 });
    };

    await assert.rejects(
      async () => checkoutBenta('fake-token', {
        idempotencyKey: key,
        shiftId: 'shift_999',
        items: [{ productId: 'p1', quantity: 1 }],
        paymentMethod: 'cash'
      }, mockFailingFetch as any),
      (err: any) => {
        assert.equal(err.status, 500);
        return true;
      }
    );

    // Retained for unchanged retry
    assert.equal(store.getOrCreateCheckoutKey(), key);
  });

  await t.test('reconcileAndCloseShift performs reconciliation and returns totals', async () => {
    let capturedBody: any = null;

    const mockFetch = async (_input: any, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body || '{}'));
      return new Response(JSON.stringify({
        reconciliationVersion: 1,
        shiftId: 'shift_999',
        startingCashCentavos: 50000,
        cashSales: 20000,
        gcashSales: 10000,
        mayaSales: 0,
        totalShiftSales: 30000,
        electronicReceipts: 1,
        physicalCashAdjustments: 0,
        saleCount: 3,
        expectedPhysicalCashCentavos: 70000,
        endingCashCentavos: 70000,
        discrepancyCentavos: 0,
        closedAt: new Date().toISOString()
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const res = await reconcileAndCloseShift('fake-id-token', 'shift_999', 70000, 'Shift sakto', mockFetch as any);

    assert.equal(capturedBody.shiftId, 'shift_999');
    assert.equal(capturedBody.endingCashCentavos, 70000);
    assert.equal(capturedBody.notes, 'Shift sakto');
    assert.equal(res.discrepancyCentavos, 0);
    assert.equal(res.totalShiftSales, 30000);
  });

  await t.test('staffLogout revokes session and signs out safely', async () => {
    let capturedMethod = '';

    const mockFetch = async (_input: any, init?: RequestInit) => {
      capturedMethod = init?.method || '';
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const res = await staffLogout('fake-id-token', mockFetch as any);
    assert.equal(capturedMethod, 'POST');
    assert.equal(res.success, true);
  });

  await t.test('staffLogout failure propagates cleanly to prevent premature client sign-out', async () => {
    const mockFailingFetch = async () => {
      return new Response(JSON.stringify({ error: 'Server unavailable' }), { status: 503 });
    };

    await assert.rejects(
      async () => staffLogout('fake-id-token', mockFailingFetch as any),
      (err: any) => {
        assert.equal(err.status, 503);
        return true;
      }
    );
  });

  await t.test('executeCashierLogoutCoordinator: server revocation succeeds -> injected Firebase signOut rejects -> cleanup and redirect succeed', async () => {
    let serverRevokeCalled = false;
    let injectedSignOutCalled = false;
    let cleanupCalled = false;
    let redirectCalled = false;

    const mockServerLogout = async (token: string) => {
      assert.equal(token, 'valid-token-123');
      serverRevokeCalled = true;
      return { success: true };
    };

    const mockFailingFirebaseSignOut = async () => {
      injectedSignOutCalled = true;
      throw new Error('Simulated Firebase Client Network SignOut Rejection');
    };

    await executeCashierLogoutCoordinator({
      getIdToken: async () => 'valid-token-123',
      serverLogoutFn: mockServerLogout,
      firebaseSignOutFn: mockFailingFirebaseSignOut,
      onLocalStateCleanup: () => {
        cleanupCalled = true;
      },
      onRedirect: () => {
        redirectCalled = true;
      }
    });

    assert.equal(serverRevokeCalled, true, 'Server session revocation must be invoked first');
    assert.equal(injectedSignOutCalled, true, 'Injected Firebase client sign-out must be invoked');
    assert.equal(cleanupCalled, true, 'Local state cleanup must execute despite Firebase signOut failure');
    assert.equal(redirectCalled, true, 'Redirect to login must execute despite Firebase signOut failure');
  });

  await t.test('executeCashierLogoutCoordinator: server revocation fails -> client signOut, cleanup, and redirect are NOT executed', async () => {
    let injectedSignOutCalled = false;
    let cleanupCalled = false;
    let redirectCalled = false;

    const mockFailingServerLogout = async (_token: string) => {
      const err: any = new Error('Server 500 session revocation failure');
      err.status = 500;
      throw err;
    };

    const mockFirebaseSignOut = async () => {
      injectedSignOutCalled = true;
    };

    await assert.rejects(
      async () => {
        await executeCashierLogoutCoordinator({
          getIdToken: async () => 'valid-token-123',
          serverLogoutFn: mockFailingServerLogout,
          firebaseSignOutFn: mockFirebaseSignOut,
          onLocalStateCleanup: () => {
            cleanupCalled = true;
          },
          onRedirect: () => {
            redirectCalled = true;
          }
        });
      },
      (err: any) => {
        assert.equal(err.status, 500);
        return true;
      }
    );

    assert.equal(injectedSignOutCalled, false, 'Client sign-out must not run when server revocation fails');
    assert.equal(cleanupCalled, false, 'Local state must not be cleared when server revocation fails');
    assert.equal(redirectCalled, false, 'Redirect must not run when server revocation fails');
  });

  await t.test('useSecureCashierStore manages in-memory state and idempotency keys', () => {
    const store = useSecureCashierStore.getState();
    store.clearCashierSession();

    assert.equal(store.isCashierAuthenticated, false);
    assert.equal(store.activeShift, null);

    store.setBootstrap({
      tenantId: 'tenant_abc',
      tenantDisplayName: 'Katuwang Store',
      moduleId: 'benta-snap',
      staffAccountId: 'staff_123',
      cashierDisplayName: 'Maria',
      currentShift: {
        id: 'shift_123',
        moduleId: 'benta-snap',
        status: 'open',
        startingCashCentavos: 50000,
        openedAt: '2026-08-17T00:00:00Z'
      },
      products: [
        { id: 'p1', name: 'Product 1', salePrice: 1000, currentStock: 10, unit: 'pcs', isActive: true }
      ]
    });

    const updated = useSecureCashierStore.getState();
    assert.equal(updated.isCashierAuthenticated, true);
    assert.equal(updated.activeShift?.id, 'shift_123');
    assert.equal(updated.products.length, 1);

    // Test idempotency key retention across retries
    const key1 = updated.getOrCreateCheckoutKey();
    const key2 = updated.getOrCreateCheckoutKey();
    assert.equal(key1, key2);

    updated.resetCheckoutKey();
    const key3 = updated.getOrCreateCheckoutKey();
    assert.notEqual(key1, key3);

    updated.clearCashierSession();
    assert.equal(useSecureCashierStore.getState().isCashierAuthenticated, false);
  });

  await t.test('pending checkout intent locks key across cart mutations and resets only upon explicit release', () => {
    const store = useSecureCashierStore.getState();
    store.clearCashierSession();

    const initialKey = store.getOrCreateCheckoutKey();
    store.setPendingCheckoutIntent({
      idempotencyKey: initialKey,
      shiftId: 'shift_test',
      items: [{ productId: 'p1', quantity: 2 }],
      paymentMethod: 'cash'
    });

    // Resetting checkout key must NOT change or erase the key while intent is pending
    store.resetCheckoutKey();
    assert.equal(store.getOrCreateCheckoutKey(), initialKey, 'Key must be preserved while intent is pending');

    // Clearing pending intent allows fresh key generation
    store.clearPendingCheckoutIntent();
    const freshKey = store.getOrCreateCheckoutKey();
    assert.notEqual(freshKey, initialKey, 'Fresh key generated after intent is cleared');
  });

  await t.test('legacy useStaffSession fails closed and cannot authorize access', () => {
    const legacy = useStaffSession.getState();
    assert.equal(legacy.isSessionValid(), false);
  });
});
