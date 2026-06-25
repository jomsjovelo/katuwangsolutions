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
    return activeTenant ? {
      ...activeTenant,
      moduleType: activeModuleOverride || activeTenant.moduleType
    } : null;
  }, [activeTenant, activeModuleOverride]);

  return {
    currentTenant,
    setCurrentTenant: setActiveTenant,
    allTenants,
    updateTenantStatus,
    updateTenantPricing,
    isLoading
  };
}

