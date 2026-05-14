import { create } from 'zustand';

export type PricingTier = 'basic' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'suspended' | 'trialing';

export interface Tenant {
  id: string;
  name: string;
  ownerUid: string;
  staffUids: string[];
  moduleType: string;
  pricingTier: PricingTier;
  subscriptionStatus: SubscriptionStatus;
  createdAt: any;
}

interface TenantState {
  activeTenant: Tenant | null;
  userProfile: any | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setActiveTenant: (tenant: Tenant | null) => void;
  setUserProfile: (profile: any | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useTenantStore = create<TenantState>((set) => ({
  activeTenant: null,
  userProfile: null,
  isLoading: true,
  error: null,

  setActiveTenant: (tenant) => set({ activeTenant: tenant }),
  setUserProfile: (profile) => set({ userProfile: profile }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error: error }),
  reset: () => set({ activeTenant: null, userProfile: null, isLoading: false, error: null }),
}));
