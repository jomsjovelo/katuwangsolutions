"use client"

import React, { ReactNode } from 'react';
import { useTenantStore, Tenant, SubscriptionStatus, PricingTier } from '@/store/use-tenant-store';

export function TenantProvider({ children }: { children: ReactNode }) {
  // Legacy pass-through provider since we are migrating to pure Zustand
  return <>{children}</>;
}

export function useTenant() {
  const { 
    activeTenant, 
    setActiveTenant, 
    allTenants, 
    updateTenantStatus, 
    updateTenantPricing,
    isLoading,
    activeModuleOverride
  } = useTenantStore();

  const [seedingIds, setSeedingIds] = React.useState<Set<string>>(new Set());

  const currentTenant = React.useMemo(() => {
    if (!activeTenant) return null;
    
    const isDemo = activeTenant.id === 'demo' || activeTenant.name?.toLowerCase().includes('demo');
    const moduleType = activeModuleOverride || activeTenant.moduleType;
    
    // For demo accounts, route database queries to a module-specific demo tenant ID
    const effectiveTenantId = isDemo && activeModuleOverride 
      ? `demo_${activeModuleOverride}` 
      : activeTenant.id;
      
    // If it's a demo tenant and it's currently being seeded (or about to be seeded),
    // we return null to prevent Firestore snapshot listeners from mounting prematurely
    if (effectiveTenantId.startsWith('demo_') && !seedingIds.has(effectiveTenantId)) {
      return null;
    }
      
    return {
      ...activeTenant,
      id: effectiveTenantId,
      moduleType
    };
  }, [activeTenant, activeModuleOverride, seedingIds]);

  React.useEffect(() => {
    if (!activeTenant) return;
    const isDemo = activeTenant.id === 'demo' || activeTenant.name?.toLowerCase().includes('demo');
    const effectiveTenantId = isDemo && activeModuleOverride ? `demo_${activeModuleOverride}` : activeTenant.id;

    if (effectiveTenantId.startsWith('demo_') && !seedingIds.has(effectiveTenantId)) {
      // Force UI into seeding state while we securely seed the tenant document
      useTenantStore.getState().setSeeding(true);
      
      import('@/firebase/firestore/demo-seeder').then(({ seedDemoAccountIfNeeded }) => {
        seedDemoAccountIfNeeded(
          effectiveTenantId, 
          activeModuleOverride || activeTenant.moduleType, 
          activeTenant.ownerUid || 'demo'
        ).finally(() => {
          setSeedingIds(prev => new Set(prev).add(effectiveTenantId));
          useTenantStore.getState().setSeeding(false);
        });
      });
    }
  }, [activeTenant, activeModuleOverride, seedingIds]);

  return {
    currentTenant,
    setCurrentTenant: setActiveTenant,
    allTenants,
    updateTenantStatus,
    updateTenantPricing,
    isLoading
  };
}

