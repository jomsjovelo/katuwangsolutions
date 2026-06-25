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

  const currentTenant = React.useMemo(() => {
    if (!activeTenant) return null;
    
    const isDemo = activeTenant.id === 'demo' || activeTenant.name?.toLowerCase().includes('demo');
    const moduleType = activeModuleOverride || activeTenant.moduleType;
    
    // For demo accounts, route database queries to a module-specific demo tenant ID
    const effectiveTenantId = isDemo && activeModuleOverride 
      ? `demo_${activeModuleOverride}` 
      : activeTenant.id;
      
    return {
      ...activeTenant,
      id: effectiveTenantId,
      moduleType
    };
  }, [activeTenant, activeModuleOverride]);

  React.useEffect(() => {
    if (currentTenant?.id.startsWith('demo_')) {
      import('@/firebase/firestore/demo-seeder').then(({ seedDemoAccountIfNeeded }) => {
        seedDemoAccountIfNeeded(
          currentTenant.id, 
          currentTenant.moduleType, 
          currentTenant.ownerUid || 'demo'
        );
      });
    }
  }, [currentTenant?.id, currentTenant?.moduleType, currentTenant?.ownerUid]);

  return {
    currentTenant,
    setCurrentTenant: setActiveTenant,
    allTenants,
    updateTenantStatus,
    updateTenantPricing,
    isLoading
  };
}

