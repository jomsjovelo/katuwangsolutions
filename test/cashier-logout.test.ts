import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  executeCashierLogoutCoordinator,
  staffLogout
} from '../src/lib/client/secure-benta-cashier-client';

describe('Cashier Logout Coordinator Tests', () => {
  it('successful logout proceeds to local cleanup and redirect', async () => {
    let localCleanupCalled = false;
    let redirectCalled = false;

    await executeCashierLogoutCoordinator({
      getIdToken: async () => 'fake-id-token',
      serverLogoutFn: async () => ({ success: true }),
      firebaseSignOutFn: async () => {},
      onLocalStateCleanup: () => { localCleanupCalled = true; },
      onRedirect: () => { redirectCalled = true; },
      serverTimeoutMs: 5000
    });

    assert.strictEqual(localCleanupCalled, true, 'Local cleanup must run after server revocation');
    assert.strictEqual(redirectCalled, true, 'Redirect must run after cleanup');
  });

  it('server failure prevents local cleanup and throws', async () => {
    let localCleanupCalled = false;
    let redirectCalled = false;

    await assert.rejects(
      async () =>
        executeCashierLogoutCoordinator({
          getIdToken: async () => 'fake-id-token',
          serverLogoutFn: async () => { throw new Error('HTTP 500'); },
          firebaseSignOutFn: async () => {},
          onLocalStateCleanup: () => { localCleanupCalled = true; },
          onRedirect: () => { redirectCalled = true; },
          serverTimeoutMs: 5000
        }),
      /HTTP 500/,
      'Server failure must prevent cleanup and propagate'
    );

    assert.strictEqual(localCleanupCalled, false, 'Local cleanup must NOT run after server failure');
    assert.strictEqual(redirectCalled, false, 'Redirect must NOT run after server failure');
  });

  it('never-resolving server logout times out and throws', async () => {
    let localCleanupCalled = false;
    let redirectCalled = false;

    const start = Date.now();
    try {
      await assert.rejects(
        async () =>
          executeCashierLogoutCoordinator({
            getIdToken: async () => 'fake-id-token',
            serverLogoutFn: async () => new Promise(() => {}), // never resolves
            firebaseSignOutFn: async () => {},
            onLocalStateCleanup: () => { localCleanupCalled = true; },
            onRedirect: () => { redirectCalled = true; },
            serverTimeoutMs: 500
          }),
        /Logout failed/,
        'Never-resolving logout must throw timeout'
      );
    } catch {}
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 2000, `Logout should time out within ~500ms, took ${elapsed}ms`);
    assert.strictEqual(localCleanupCalled, false, 'Local cleanup must NOT run after timeout');
    assert.strictEqual(redirectCalled, false, 'Redirect must NOT run after timeout');
  });

  it('logout timeout exposes stable error.code for UI recovery', async () => {
    let localCleanupCalled = false;
    let redirectCalled = false;

    try {
      await executeCashierLogoutCoordinator({
        getIdToken: async () => 'fake-id-token',
        serverLogoutFn: async () => new Promise(() => {}), // never resolves
        firebaseSignOutFn: async () => {},
        onLocalStateCleanup: () => { localCleanupCalled = true; },
        onRedirect: () => { redirectCalled = true; },
        serverTimeoutMs: 300
      });
      assert.fail('Expected logout to time out');
    } catch (err: any) {
      assert.strictEqual(err.code, 'logout_timeout', 'Must expose stable classification code');
      assert.strictEqual(localCleanupCalled, false, 'Local cleanup must NOT run after timeout');
      assert.strictEqual(redirectCalled, false, 'Redirect must NOT run after timeout');
    }
  });

  it('UI can catch timeout and re-enable logout button', async () => {
    let uiError: Error | null = null;
    let localCleanupCalled = false;
    let redirectCalled = false;
    let buttonDisabled = true;

    const uiHandler = async () => {
      buttonDisabled = true;
      try {
        await executeCashierLogoutCoordinator({
          getIdToken: async () => 'fake-id-token',
          serverLogoutFn: async () => new Promise(() => {}),
          firebaseSignOutFn: async () => {},
          onLocalStateCleanup: () => { localCleanupCalled = true; },
          onRedirect: () => { redirectCalled = true; },
          serverTimeoutMs: 300
        });
      } catch (err: any) {
        uiError = err;
      } finally {
        buttonDisabled = false;
      }
    };

    await uiHandler();

    assert.ok(uiError, 'UI must receive the timeout error');
    assert.strictEqual((uiError as any).code, 'logout_timeout', 'UI must get stable timeout classification');
    assert.strictEqual(buttonDisabled, false, 'Button must be re-enabled after UI catches timeout');
    assert.strictEqual(redirectCalled, false, 'Redirect must NOT fire on timeout');
  });

  it('getIdToken failure prevents logout and throws', async () => {
    let localCleanupCalled = false;
    let redirectCalled = false;

    await assert.rejects(
      async () =>
        executeCashierLogoutCoordinator({
          getIdToken: async () => { throw new Error('Auth error'); },
          serverLogoutFn: async () => ({ success: true }),
          firebaseSignOutFn: async () => {},
          onLocalStateCleanup: () => { localCleanupCalled = true; },
          onRedirect: () => { redirectCalled = true; },
          serverTimeoutMs: 5000
        }),
      /Auth error/,
      'Token acquisition failure must prevent logout'
    );

    assert.strictEqual(localCleanupCalled, false, 'Local cleanup must NOT run after token failure');
    assert.strictEqual(redirectCalled, false, 'Redirect must NOT run after token failure');
  });

  it('firebase signOut failure after verified revocation does not prevent cleanup', async () => {
    let localCleanupCalled = false;
    let redirectCalled = false;

    await executeCashierLogoutCoordinator({
      getIdToken: async () => 'fake-id-token',
      serverLogoutFn: async () => ({ success: true }),
      firebaseSignOutFn: async () => { throw new Error('Firebase signOut failed'); },
      onLocalStateCleanup: () => { localCleanupCalled = true; },
      onRedirect: () => { redirectCalled = true; },
      serverTimeoutMs: 5000
    });

    assert.strictEqual(localCleanupCalled, true, 'Local cleanup must run despite Firebase signOut failure');
    assert.strictEqual(redirectCalled, true, 'Redirect must run despite Firebase signOut failure');
  });

  it('exact status 401 and category SESSION_INVALID permits local cleanup and redirect', async () => {
    let injectedSignOutCalled = false;
    let localCleanupCalled = false;
    let redirectCalled = false;

    await executeCashierLogoutCoordinator({
      getIdToken: async () => 'fake-id-token',
      serverLogoutFn: async () => {
        const err: any = new Error('Session invalid');
        err.status = 401;
        err.category = 'SESSION_INVALID';
        throw err;
      },
      firebaseSignOutFn: async () => { injectedSignOutCalled = true; },
      onLocalStateCleanup: () => { localCleanupCalled = true; },
      onRedirect: () => { redirectCalled = true; },
      serverTimeoutMs: 5000
    });

    assert.strictEqual(injectedSignOutCalled, true, 'Firebase signOut must execute on SESSION_INVALID');
    assert.strictEqual(localCleanupCalled, true, 'Local cleanup must execute on SESSION_INVALID');
    assert.strictEqual(redirectCalled, true, 'Redirect must execute on SESSION_INVALID');
  });

  it('status 401 with missing category remains fail-closed', async () => {
    let injectedSignOutCalled = false;
    let localCleanupCalled = false;
    let redirectCalled = false;

    await assert.rejects(
      async () =>
        executeCashierLogoutCoordinator({
          getIdToken: async () => 'fake-id-token',
          serverLogoutFn: async () => {
            const err: any = new Error('Unauthorized');
            err.status = 401;
            throw err;
          },
          firebaseSignOutFn: async () => { injectedSignOutCalled = true; },
          onLocalStateCleanup: () => { localCleanupCalled = true; },
          onRedirect: () => { redirectCalled = true; },
          serverTimeoutMs: 5000
        }),
      (err: any) => err.status === 401
    );

    assert.strictEqual(injectedSignOutCalled, false, 'Client signout must NOT execute on 401 without SESSION_INVALID');
    assert.strictEqual(localCleanupCalled, false, 'Local cleanup must NOT execute on 401 without SESSION_INVALID');
    assert.strictEqual(redirectCalled, false, 'Redirect must NOT execute on 401 without SESSION_INVALID');
  });

  it('status 401 with non-SESSION_INVALID category remains fail-closed', async () => {
    let injectedSignOutCalled = false;
    let localCleanupCalled = false;
    let redirectCalled = false;

    await assert.rejects(
      async () =>
        executeCashierLogoutCoordinator({
          getIdToken: async () => 'fake-id-token',
          serverLogoutFn: async () => {
            const err: any = new Error('Authentication required');
            err.status = 401;
            err.category = 'AUTHENTICATION_REQUIRED';
            throw err;
          },
          firebaseSignOutFn: async () => { injectedSignOutCalled = true; },
          onLocalStateCleanup: () => { localCleanupCalled = true; },
          onRedirect: () => { redirectCalled = true; },
          serverTimeoutMs: 5000
        }),
      (err: any) => err.status === 401 && err.category === 'AUTHENTICATION_REQUIRED'
    );

    assert.strictEqual(injectedSignOutCalled, false, 'Client signout must NOT execute on 401 AUTHENTICATION_REQUIRED');
    assert.strictEqual(localCleanupCalled, false, 'Local cleanup must NOT execute on 401 AUTHENTICATION_REQUIRED');
    assert.strictEqual(redirectCalled, false, 'Redirect must NOT execute on 401 AUTHENTICATION_REQUIRED');
  });

  it('network failure performs zero sign-out, cleanup, and redirect', async () => {
    let injectedSignOutCalled = false;
    let localCleanupCalled = false;
    let redirectCalled = false;

    await assert.rejects(
      async () =>
        executeCashierLogoutCoordinator({
          getIdToken: async () => 'fake-id-token',
          serverLogoutFn: async () => {
            throw new TypeError('Failed to fetch');
          },
          firebaseSignOutFn: async () => { injectedSignOutCalled = true; },
          onLocalStateCleanup: () => { localCleanupCalled = true; },
          onRedirect: () => { redirectCalled = true; },
          serverTimeoutMs: 5000
        }),
      /Failed to fetch/
    );

    assert.strictEqual(injectedSignOutCalled, false, 'Client signout must NOT execute on network failure');
    assert.strictEqual(localCleanupCalled, false, 'Local cleanup must NOT execute on network failure');
    assert.strictEqual(redirectCalled, false, 'Redirect must NOT execute on network failure');
  });

  it('status 429 rate limited response performs zero sign-out, cleanup, and redirect', async () => {
    let injectedSignOutCalled = false;
    let localCleanupCalled = false;
    let redirectCalled = false;

    await assert.rejects(
      async () =>
        executeCashierLogoutCoordinator({
          getIdToken: async () => 'fake-id-token',
          serverLogoutFn: async () => {
            const err: any = new Error('Too Many Requests');
            err.status = 429;
            err.category = 'RATE_LIMITED';
            throw err;
          },
          firebaseSignOutFn: async () => { injectedSignOutCalled = true; },
          onLocalStateCleanup: () => { localCleanupCalled = true; },
          onRedirect: () => { redirectCalled = true; },
          serverTimeoutMs: 5000
        }),
      (err: any) => err.status === 429
    );

    assert.strictEqual(injectedSignOutCalled, false, 'Client signout must NOT execute on 429');
    assert.strictEqual(localCleanupCalled, false, 'Local cleanup must NOT execute on 429');
    assert.strictEqual(redirectCalled, false, 'Redirect must NOT execute on 429');
  });

  it('status 503 service unavailable performs zero sign-out, cleanup, and redirect', async () => {
    let injectedSignOutCalled = false;
    let localCleanupCalled = false;
    let redirectCalled = false;

    await assert.rejects(
      async () =>
        executeCashierLogoutCoordinator({
          getIdToken: async () => 'fake-id-token',
          serverLogoutFn: async () => {
            const err: any = new Error('Service Unavailable');
            err.status = 503;
            err.category = 'SERVICE_UNAVAILABLE';
            throw err;
          },
          firebaseSignOutFn: async () => { injectedSignOutCalled = true; },
          onLocalStateCleanup: () => { localCleanupCalled = true; },
          onRedirect: () => { redirectCalled = true; },
          serverTimeoutMs: 5000
        }),
      (err: any) => err.status === 503
    );

    assert.strictEqual(injectedSignOutCalled, false, 'Client signout must NOT execute on 503');
    assert.strictEqual(localCleanupCalled, false, 'Local cleanup must NOT execute on 503');
    assert.strictEqual(redirectCalled, false, 'Redirect must NOT execute on 503');
  });

  it('staffLogout throws on HTTP failure', async () => {
    const mockFetch = (input: string, init?: RequestInit): Promise<Response> => {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' })
      } as Response);
    };
    try {
      await staffLogout('bad-token', mockFetch as any);
      assert.fail('Expected staffLogout to throw');
    } catch (err: any) {
      assert.strictEqual(err.message, 'Server error', 'Error message must be server-provided');
      assert.strictEqual(err.status, 500, 'Error must preserve HTTP status');
    }
  });
});