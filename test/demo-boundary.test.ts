import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectiveTenant } from '../src/app/lib/tenant-context';
import type { Tenant } from '../src/store/use-tenant-store';

describe('Exact-ID Demo Authority & Seeding Boundary Suite (Production Coupled)', () => {
  const createMockTenant = (id: string, name: string, moduleType: any = 'benta-snap'): Tenant => ({
    id,
    name,
    moduleType,
    ownerUid: 'owner-123',
    staffUids: [],
    pricingTier: 'standard_100',
    subscriptionStatus: 'active',
    createdAt: new Date().toISOString()
  });

  it('1. exact demo: activeTenant.id === "demo" -> isDemo is true, derives demo_${moduleOverride}, and needsSeeding is true for unseeded demo', () => {
    const activeTenant = createMockTenant('demo', 'Demo Store', 'benta-snap');
    const result = resolveEffectiveTenant({
      activeTenant,
      activeModuleOverride: 'benta-snap',
      seededTenants: []
    });

    assert.equal(result.isDemo, true);
    assert.equal(result.needsSeeding, true);
    assert.equal(result.effectiveTenantId, 'demo_benta-snap');
    assert.equal(result.currentTenant, null); // waits for seeding

    // Once seeded:
    const seededResult = resolveEffectiveTenant({
      activeTenant,
      activeModuleOverride: 'benta-snap',
      seededTenants: ['demo_benta-snap']
    });

    assert.equal(seededResult.isDemo, true);
    assert.equal(seededResult.needsSeeding, false);
    assert.equal(seededResult.effectiveTenantId, 'demo_benta-snap');
    assert.equal(seededResult.currentTenant?.id, 'demo_benta-snap');
    assert.equal(seededResult.currentTenant?.moduleType, 'benta-snap');
  });

  it('2. demo_*: activeTenant.id === "demo_benta-snap" -> isDemo is false, retains real ID, never triggers seeding', () => {
    const activeTenant = createMockTenant('demo_benta-snap', 'Real Store', 'benta-snap');
    const result = resolveEffectiveTenant({
      activeTenant,
      activeModuleOverride: 'benta-snap',
      seededTenants: []
    });

    assert.equal(result.isDemo, false);
    assert.equal(result.needsSeeding, false);
    assert.equal(result.effectiveTenantId, 'demo_benta-snap');
    assert.equal(result.currentTenant?.id, 'demo_benta-snap');
  });

  it('3. demo_*: activeTenant.id === "demo_company" -> isDemo is false, retains real ID, never triggers seeding', () => {
    const activeTenant = createMockTenant('demo_company', 'Demo Company Ltd', 'benta-snap');
    const result = resolveEffectiveTenant({
      activeTenant,
      activeModuleOverride: null,
      seededTenants: []
    });

    assert.equal(result.isDemo, false);
    assert.equal(result.needsSeeding, false);
    assert.equal(result.effectiveTenantId, 'demo_company');
    assert.equal(result.currentTenant?.id, 'demo_company');
  });

  it('4. demo-*: activeTenant.id === "demo-benta-snap-8p9AU" -> isDemo is false, retains real ID, never triggers seeding', () => {
    const activeTenant = createMockTenant('demo-benta-snap-8p9AU', 'Smoke Test Store', 'benta-snap');
    const result = resolveEffectiveTenant({
      activeTenant,
      activeModuleOverride: 'benta-snap',
      seededTenants: []
    });

    assert.equal(result.isDemo, false);
    assert.equal(result.needsSeeding, false);
    assert.equal(result.effectiveTenantId, 'demo-benta-snap-8p9AU');
    assert.equal(result.currentTenant?.id, 'demo-benta-snap-8p9AU');
  });

  it('5. demo-named real tenant: normal tenant ID with display name containing "demo" -> isDemo is false, retains real ID', () => {
    const activeTenant = createMockTenant('tenant_12345', 'My Super Demo Store', 'benta-snap');
    const result = resolveEffectiveTenant({
      activeTenant,
      activeModuleOverride: null,
      seededTenants: []
    });

    assert.equal(result.isDemo, false);
    assert.equal(result.needsSeeding, false);
    assert.equal(result.effectiveTenantId, 'tenant_12345');
    assert.equal(result.currentTenant?.id, 'tenant_12345');
  });

  it('6. normal tenant + module override -> retains authoritative real tenant ID and does NOT trigger demo seeding', () => {
    const activeTenant = createMockTenant('prod-store-99', 'Aling Nena Sari-Sari', 'benta-snap');
    const result = resolveEffectiveTenant({
      activeTenant,
      activeModuleOverride: 'fresh-tally',
      seededTenants: []
    });

    assert.equal(result.isDemo, false);
    assert.equal(result.needsSeeding, false);
    assert.equal(result.effectiveTenantId, 'prod-store-99');
    assert.equal(result.currentTenant?.id, 'prod-store-99');
    assert.equal(result.currentTenant?.moduleType, 'fresh-tally');
    assert.equal(result.currentTenant?.primaryModuleType, 'benta-snap');
  });

  it('7. genuine demo + module override -> existing demo module switching and seeding work as expected', () => {
    const activeTenant = createMockTenant('demo', 'Public Playground Demo', 'benta-snap');
    const result = resolveEffectiveTenant({
      activeTenant,
      activeModuleOverride: 'service-tap',
      seededTenants: []
    });

    assert.equal(result.isDemo, true);
    assert.equal(result.needsSeeding, true);
    assert.equal(result.effectiveTenantId, 'demo_service-tap');
  });
});
