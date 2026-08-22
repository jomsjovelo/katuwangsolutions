"use client"

import React, { ReactNode, useMemo } from 'react';
import { useTenantStore, Tenant, SubscriptionStatus, PricingTier } from '@/store/use-tenant-store';

export interface ResolveTenantParams {
  activeTenant: Tenant | null;
  activeModuleOverride?: string | null;
  seededTenants: string[];
  allTenants?: Tenant[];
}

export interface ResolvedTenantState {
  currentTenant: Tenant | null;
  effectiveTenantId: string | null;
  isDemo: boolean;
  needsSeeding: boolean;
}

export function resolveEffectiveTenant(params: ResolveTenantParams): ResolvedTenantState {
  const { activeTenant, activeModuleOverride, seededTenants, allTenants = [] } = params;
  if (!activeTenant) {
    return {
      currentTenant: null,
      effectiveTenantId: null,
      isDemo: false,
      needsSeeding: false
    };
  }

  const isDemo = activeTenant.id === 'demo';
  const moduleType = activeModuleOverride || activeTenant.moduleType;

  // For demo accounts, route database queries to a module-specific demo tenant ID
  const effectiveTenantId = isDemo && activeModuleOverride
    ? `demo_${activeModuleOverride}`
    : activeTenant.id;

  // If it's a demo tenant and it's currently being seeded (or about to be seeded),
  // we return null to prevent Firestore snapshot listeners from mounting prematurely
  const needsSeeding = isDemo && !seededTenants.includes(effectiveTenantId);
  if (needsSeeding) {
    return {
      currentTenant: null,
      effectiveTenantId,
      isDemo,
      needsSeeding: true
    };
  }

  // Try to find the live data from the Firestore sync
  const liveTenantData = allTenants.find(t => t.id === effectiveTenantId);

  const currentTenant: Tenant = {
    ...activeTenant,
    ...liveTenantData,
    id: effectiveTenantId,
    primaryModuleType: activeTenant.moduleType,
    moduleType
  };

  return {
    currentTenant,
    effectiveTenantId,
    isDemo,
    needsSeeding: false
  };
}

export function TenantProvider({ children }: { children: ReactNode }) {
  // Legacy pass-through provider since we are migrating to pure Zustand
  return <>{children}</>;
}

export function useTenant() {
  const activeTenant = useTenantStore(state => state.activeTenant);
  const setActiveTenant = useTenantStore(state => state.setActiveTenant);
  const allTenants = useTenantStore(state => state.allTenants);
  const updateTenantStatus = useTenantStore(state => state.updateTenantStatus);
  const updateTenantPricing = useTenantStore(state => state.updateTenantPricing);
  const isLoading = useTenantStore(state => state.isLoading);
  const activeModuleOverride = useTenantStore(state => state.activeModuleOverride);
  const seededTenants = useTenantStore(state => state.seededTenants);

  const resolution = React.useMemo(() => {
    return resolveEffectiveTenant({
      activeTenant,
      activeModuleOverride,
      seededTenants,
      allTenants
    });
  }, [activeTenant, activeModuleOverride, seededTenants, allTenants]);

  const currentTenant = resolution.currentTenant;

  React.useEffect(() => {
    if (!resolution.needsSeeding || !resolution.effectiveTenantId || !activeTenant) return;

    // Force UI into seeding state while we securely seed the tenant document
    useTenantStore.getState().setSeeding(true);

    const targetTenantId = resolution.effectiveTenantId;
    import('@/firebase/firestore/demo-seeder').then(({ seedDemoAccountIfNeeded }) => {
      seedDemoAccountIfNeeded(
        targetTenantId,
        activeModuleOverride || activeTenant.moduleType,
        activeTenant.ownerUid || 'demo'
      ).finally(() => {
        useTenantStore.getState().markAsSeeded(targetTenantId);
        useTenantStore.getState().setSeeding(false);
      });
    });
  }, [resolution.needsSeeding, resolution.effectiveTenantId, activeTenant, activeModuleOverride]);

  return useMemo(() => ({
    currentTenant,
    setCurrentTenant: setActiveTenant,
    allTenants,
    updateTenantStatus,
    updateTenantPricing,
    isLoading
  }), [currentTenant, setActiveTenant, allTenants, updateTenantStatus, updateTenantPricing, isLoading]);
}

