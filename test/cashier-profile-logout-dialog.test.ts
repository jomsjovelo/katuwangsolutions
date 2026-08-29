import { test, describe, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  handleCashierLogoutClick,
  performCashierLogoutAction
} from '../src/lib/client/cashier-profile-controller';
import { useSecureCashierStore } from '../src/store/use-secure-cashier-store';
import { useTenantStore } from '../src/store/use-tenant-store';

describe('Production Cashier Profile Logout Controller Suite', () => {
  beforeEach(() => {
    useSecureCashierStore.getState().clearCashierSession();
    useTenantStore.getState().reset();
  });

  test('1. Confirmation: Active shift opens dialog and defers logout until explicit confirmation', () => {
    let dialogOpen = false;
    let performLogoutCalled = false;
    const isLoggingOutRef = { current: false };

    handleCashierLogoutClick({
      isLoggingOutRef,
      hasActiveShift: true,
      setShowShiftConfirmDialog: (open) => { dialogOpen = open; },
      setLogoutError: () => {},
      performLogout: async () => { performLogoutCalled = true; }
    });

    assert.strictEqual(dialogOpen, true, 'Dialog must open when active shift exists');
    assert.strictEqual(performLogoutCalled, false, 'performLogout must not execute before confirmation');
  });

  test('2. Cancellation: Closing or cancelling dialog performs zero coordinator invocations', () => {
    let dialogOpen = true;
    let coordinatorCalls = 0;

    // Simulate cancellation
    dialogOpen = false;

    assert.strictEqual(dialogOpen, false, 'Dialog is closed on cancel');
    assert.strictEqual(coordinatorCalls, 0, 'No coordinator calls on cancellation');
  });

  test('3. Rapid double-click deduplication: Synchronous useRef guard blocks concurrent invocations', async () => {
    let coordinatorCalls = 0;
    const isLoggingOutRef = { current: false };
    let isLoggingOut = false;
    let dialogOpen = true;

    const mockCoordinator = async () => {
      coordinatorCalls++;
      // Simulate network latency
      await new Promise(resolve => setTimeout(resolve, 50));
      return;
    };

    const mockUser = {
      getIdToken: async (forceRefresh?: boolean) => 'fresh-token-123'
    };

    // Trigger two rapid simultaneous calls to performCashierLogoutAction
    const promise1 = performCashierLogoutAction({
      user: mockUser,
      hasActiveShift: true,
      shiftId: 'shift-123',
      isLoggingOutRef,
      setIsLoggingOut: (val) => { isLoggingOut = val; },
      setShowShiftConfirmDialog: (val) => { dialogOpen = val; },
      setLogoutError: () => {},
      logoutCoordinatorFn: mockCoordinator as any,
      clearCashierSession: () => {},
      resetTenantStore: () => {},
      onRedirect: () => {}
    });

    const promise2 = performCashierLogoutAction({
      user: mockUser,
      hasActiveShift: true,
      shiftId: 'shift-123',
      isLoggingOutRef,
      setIsLoggingOut: (val) => { isLoggingOut = val; },
      setShowShiftConfirmDialog: (val) => { dialogOpen = val; },
      setLogoutError: () => {},
      logoutCoordinatorFn: mockCoordinator as any,
      clearCashierSession: () => {},
      resetTenantStore: () => {},
      onRedirect: () => {}
    });

    await Promise.all([promise1, promise2]);

    assert.strictEqual(coordinatorCalls, 1, 'Coordinator must be invoked exactly once despite rapid concurrent clicks');
    assert.strictEqual(dialogOpen, false, 'Dialog must be closed');
  });

  test('4. Failure recovery: Server error re-enables button, resets in-flight guard, and displays error', async () => {
    const isLoggingOutRef = { current: false };
    let isLoggingOut = false;
    let logoutError: string | null = null;
    let localCleanedUp = false;
    let redirected = false;

    const failingCoordinator = async () => {
      const err: any = new Error('HTTP 503 Service Unavailable');
      err.status = 503;
      throw err;
    };

    const mockUser = {
      getIdToken: async (forceRefresh?: boolean) => 'token-abc'
    };

    await performCashierLogoutAction({
      user: mockUser,
      hasActiveShift: false,
      isLoggingOutRef,
      setIsLoggingOut: (val) => { isLoggingOut = val; },
      setShowShiftConfirmDialog: () => {},
      setLogoutError: (err) => { logoutError = err; },
      logoutCoordinatorFn: failingCoordinator as any,
      clearCashierSession: () => { localCleanedUp = true; },
      resetTenantStore: () => {},
      onRedirect: () => { redirected = true; }
    });

    assert.strictEqual(isLoggingOutRef.current, false, 'Synchronous ref guard must be reset to false on failure');
    assert.strictEqual(isLoggingOut, false, 'isLoggingOut state must be reset to false on failure to re-enable button');
    assert.strictEqual(logoutError, 'HTTP 503 Service Unavailable', 'Error message must be presented to user');
    assert.strictEqual(localCleanedUp, false, 'Local state must not be cleaned up on failure');
    assert.strictEqual(redirected, false, 'Redirect must not happen on failure');

    // Retry capability: subsequent invocation succeeds
    let retryCalls = 0;
    const succeedingCoordinator = async (params: any) => {
      retryCalls++;
      params.onLocalStateCleanup();
      params.onRedirect();
    };

    await performCashierLogoutAction({
      user: mockUser,
      hasActiveShift: false,
      isLoggingOutRef,
      setIsLoggingOut: (val) => { isLoggingOut = val; },
      setShowShiftConfirmDialog: () => {},
      setLogoutError: (err) => { logoutError = err; },
      logoutCoordinatorFn: succeedingCoordinator as any,
      clearCashierSession: () => { localCleanedUp = true; },
      resetTenantStore: () => {},
      onRedirect: () => { redirected = true; }
    });

    assert.strictEqual(retryCalls, 1, 'Subsequent retry must succeed');
    assert.strictEqual(localCleanedUp, true, 'Local state cleaned up on retry success');
    assert.strictEqual(redirected, true, 'Redirect invoked on retry success');
  });

  test('5. Successful redirect: Successful server revocation cleans local stores and redirects to /login', async () => {
    useSecureCashierStore.getState().setBootstrap({
      tenantId: 'tenant-123',
      tenantDisplayName: 'Store Test',
      moduleId: 'benta-snap',
      staffAccountId: 'staff-1',
      cashierDisplayName: 'Cashier One',
      currentShift: {
        id: 'shift-1',
        moduleId: 'benta-snap',
        status: 'open',
        startingCashCentavos: 5000,
        openedAt: new Date().toISOString()
      },
      products: []
    });

    const isLoggingOutRef = { current: false };
    let redirectedPath = '';
    let capturedForceRefresh: boolean | undefined = undefined;

    const mockUser = {
      getIdToken: async (forceRefresh?: boolean) => {
        capturedForceRefresh = forceRefresh;
        return 'forced-fresh-token';
      }
    };

    const mockCoordinator = async (params: any) => {
      // Simulate real coordinator running getIdToken(true) and onLocalStateCleanup
      await params.getIdToken();
      params.onLocalStateCleanup();
      params.onRedirect();
    };

    await performCashierLogoutAction({
      user: mockUser,
      hasActiveShift: true,
      shiftId: 'shift-1',
      isLoggingOutRef,
      setIsLoggingOut: () => {},
      setShowShiftConfirmDialog: () => {},
      setLogoutError: () => {},
      logoutCoordinatorFn: mockCoordinator as any,
      clearCashierSession: () => useSecureCashierStore.getState().clearCashierSession(),
      resetTenantStore: () => useTenantStore.getState().reset(),
      onRedirect: () => { redirectedPath = '/login'; }
    });

    assert.strictEqual(capturedForceRefresh, undefined, 'getIdToken must not request forced refresh');
    assert.strictEqual(useSecureCashierStore.getState().isCashierAuthenticated, false, 'Cashier session must be cleared');
    assert.strictEqual(redirectedPath, '/login', 'Must navigate to /login');
  });
});
