
"use client"

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type ModuleType = 
  | 'Benta Snap' | 'Fresh Tally' | 'Build Stack' | 'Ani Grow' 
  | 'Bite Snap' | 'Timpla Track' | 'Handa Flow' 
  | 'Spin Snap' | 'Hydro Sync' | 'Shine Sync' | 'Glow Sync' | 'Rep Sync'
  | 'Sahod Flow' | 'Ledger Flow' | 'Biyahe Sync' | 'Admin';

export type SubscriptionStatus = 'active' | 'suspended' | 'trial';
export type PricingTier = 'promo_99' | 'standard_199';

export interface Tenant {
  id: string;
  name: string;
  moduleType: ModuleType;
  subscriptionStatus: SubscriptionStatus;
  pricingTier: PricingTier;
  ownerUid: string;
}

interface TenantContextType {
  currentTenant: Tenant | null;
  setCurrentTenant: (tenant: Tenant | null) => void;
  allTenants: Tenant[];
  updateTenantStatus: (id: string, status: SubscriptionStatus) => void;
  updateTenantPricing: (id: string, tier: PricingTier) => void;
}

const INITIAL_TENANTS: Tenant[] = [
  { id: 't1', name: 'Aling Maria Store', moduleType: 'Benta Snap', subscriptionStatus: 'active', pricingTier: 'promo_99', ownerUid: 'user1' },
  { id: 't2', name: 'Fresh Greens Farm', moduleType: 'Fresh Tally', subscriptionStatus: 'active', pricingTier: 'standard_199', ownerUid: 'user2' },
  { id: 't3', name: 'Concrete Builders', moduleType: 'Build Stack', subscriptionStatus: 'suspended', pricingTier: 'standard_199', ownerUid: 'user3' },
  { id: 't4', name: 'Quick Spin Laundry', moduleType: 'Spin Snap', subscriptionStatus: 'active', pricingTier: 'promo_99', ownerUid: 'user4' },
];

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [allTenants, setAllTenants] = useState<Tenant[]>(INITIAL_TENANTS);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);

  const updateTenantStatus = (id: string, status: SubscriptionStatus) => {
    setAllTenants(prev => prev.map(t => t.id === id ? { ...t, subscriptionStatus: status } : t));
    if (currentTenant?.id === id) {
      setCurrentTenant(prev => prev ? { ...prev, subscriptionStatus: status } : null);
    }
  };

  const updateTenantPricing = (id: string, tier: PricingTier) => {
    setAllTenants(prev => prev.map(t => t.id === id ? { ...t, pricingTier: tier } : t));
    if (currentTenant?.id === id) {
      setCurrentTenant(prev => prev ? { ...prev, pricingTier: tier } : null);
    }
  };

  return (
    <TenantContext.Provider value={{ currentTenant, setCurrentTenant, allTenants, updateTenantStatus, updateTenantPricing }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) throw new Error('useTenant must be used within TenantProvider');
  return context;
}
