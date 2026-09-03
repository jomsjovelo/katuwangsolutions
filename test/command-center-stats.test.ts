import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AdminAuthorizationErrorCode,
  authorizeAdminToken,
} from '../src/lib/server/admin-server-authorization';
import {
  createCommandCenterStatsRoute,
  fetchCommandCenterStats,
} from '../src/lib/server/command-center-stats';

type Filter = [field: string, value: unknown];

class MockQuery {
  constructor(
    private readonly counts: Record<string, number>,
    private readonly filters: Filter[] = [],
    private readonly failCounts = false,
  ) {}

  where(field: string, _operator: string, value: unknown) {
    return new MockQuery(this.counts, [...this.filters, [field, value]], this.failCounts);
  }

  count() {
    const key = this.filters.map(([field, value]) => `${field}=${String(value)}`).join('|');
    return {
      get: async () => {
        if (this.failCounts) throw new Error('internal datastore path must remain private');
        return { data: () => ({ count: this.counts[key] ?? 0 }) };
      },
    };
  }
}

function buildDependencies(options: {
  decoded?: Record<string, unknown>;
  adminDocument?: Record<string, unknown> | null;
  failToken?: boolean;
  failCounts?: boolean;
} = {}) {
  const counts = {
    '': 7,
    'subscriptionStatus=active': 5,
    'subscriptionStatus=suspended': 1,
    'subscriptionStatus=pending': 1,
    'subscriptionStatus=active|pricingTier=promo_99': 2,
    'subscriptionStatus=active|pricingTier=promo_50': 1,
    'subscriptionStatus=active|pricingTier=standard_199': 1,
    'subscriptionStatus=active|pricingTier=standard_100': 0,
    'subscriptionStatus=active|pricingTier=enterprise': 1,
    'subscriptionStatus=active|pricingTier=foc': 0,
  };
  const decoded = options.decoded ?? {
    uid: 'admin-1',
    email: 'admin@example.test',
    admin: true,
    role: 'admin',
  };

  return {
    adminAuth: {
      verifyIdToken: async () => {
        if (options.failToken) throw new Error('raw token failure');
        return decoded;
      },
    } as any,
    adminFirestore: {
      collection: (name: string) => {
        assert.equal(name, 'tenants');
        return new MockQuery(counts, [], options.failCounts);
      },
      doc: (path: string) => ({
        get: async () => {
          if (path === 'system/config') {
            return {
              exists: true,
              data: () => ({
                promoPrice: 120,
                standardPrice: 210,
                enterprisePrice: 600,
              }),
            };
          }
          if (path === `admins/${String(decoded.uid)}`) {
            const data = options.adminDocument;
            return {
              exists: data !== undefined && data !== null,
              data: () => data ?? undefined,
            };
          }
          throw new Error(`Unexpected document path: ${path}`);
        },
      }),
    } as any,
  };
}

test('Command Center server-authorized statistics', async (t) => {
  await t.test('claim-only administrator receives authoritative aggregate totals', async () => {
    const stats = await fetchCommandCenterStats('valid', buildDependencies());
    assert.deepEqual(stats, {
      totalTenants: 7,
      activeTenants: 5,
      suspendedTenants: 1,
      pendingTenants: 1,
      mrr: 1100,
      promoCount: 3,
      standardCount: 1,
      enterpriseCount: 1,
      focCount: 0,
    });
  });

  await t.test('present administrator document overrides and rejects stale claims', async () => {
    await assert.rejects(
      () => authorizeAdminToken('valid', undefined, buildDependencies({ adminDocument: { role: 'owner' } })),
      (error: any) => error?.code === AdminAuthorizationErrorCode.OPERATION_NOT_PERMITTED,
    );
  });

  await t.test('missing and invalid credentials return stable sanitized errors', async () => {
    const route = createCommandCenterStatsRoute(buildDependencies({ failToken: true }));
    const missing = await route(new Request('https://example.test/api/admin/stats'));
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), {
      error: 'Administrator authentication is required.',
      category: AdminAuthorizationErrorCode.AUTHENTICATION_REQUIRED,
    });

    const invalid = await route(new Request('https://example.test/api/admin/stats', {
      headers: { Authorization: 'Bearer invalid-secret-token' },
    }));
    assert.equal(invalid.status, 401);
    assert.equal((await invalid.json()).category, AdminAuthorizationErrorCode.AUTHENTICATION_REQUIRED);
  });

  await t.test('ordinary owners cannot access cross-tenant statistics', async () => {
    const route = createCommandCenterStatsRoute(buildDependencies({
      decoded: { uid: 'owner-1', email: 'owner@example.test', role: 'owner' },
    }));
    const response = await route(new Request('https://example.test/api/admin/stats', {
      headers: { Authorization: 'Bearer owner-token' },
    }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).category, AdminAuthorizationErrorCode.OPERATION_NOT_PERMITTED);
  });

  await t.test('datastore failures do not expose internal details', async () => {
    const route = createCommandCenterStatsRoute(buildDependencies({ failCounts: true }));
    const response = await route(new Request('https://example.test/api/admin/stats', {
      headers: { Authorization: 'Bearer valid' },
    }));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.category, AdminAuthorizationErrorCode.SERVICE_UNAVAILABLE);
    assert.equal(JSON.stringify(body).includes('datastore'), false);
    assert.equal(JSON.stringify(body).includes('internal'), false);
  });
});
