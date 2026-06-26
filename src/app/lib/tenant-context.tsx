"use client"

import React, { ReactNode, useMemo } from 'react';
import { useTenantStore, Tenant, SubscriptionStatus, PricingTier } from '@/store/use-tenant-store';

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
    if (effectiveTenantId.startsWith('demo_') && !seededTenants.includes(effectiveTenantId)) {
      return null;
    }
      
    return {
      ...activeTenant,
      id: effectiveTenantId,
      moduleType
    };
  }, [activeTenant, activeModuleOverride, seededTenants]);

  React.useEffect(() => {
    if (!activeTenant) return;
    const isDemo = activeTenant.id === 'demo' || activeTenant.name?.toLowerCase().includes('demo');
    const effectiveTenantId = isDemo && activeModuleOverride ? `demo_${activeModuleOverride}` : activeTenant.id;

    if (effectiveTenantId.startsWith('demo_') && !seededTenants.includes(effectiveTenantId)) {
      // Force UI into seeding state while we securely seed the tenant document
      useTenantStore.getState().setSeeding(true);
      
      import('@/firebase/firestore/demo-seeder').then(({ seedDemoAccountIfNeeded }) => {
        seedDemoAccountIfNeeded(
          effectiveTenantId, 
          activeModuleOverride || activeTenant.moduleType, 
          activeTenant.ownerUid || 'demo'
        ).finally(() => {
          useTenantStore.getState().markAsSeeded(effectiveTenantId);
          useTenantStore.getState().setSeeding(false);
        });
      });
    }
  }, [activeTenant, activeModuleOverride, seededTenants]);

  return useMemo(() => ({
    currentTenant,
    setCurrentTenant: setActiveTenant,
    allTenants,
    updateTenantStatus,
    updateTenantPricing,
    isLoading
  }), [currentTenant, setActiveTenant, allTenants, updateTenantStatus, updateTenantPricing, isLoading]);
}

