import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import deepEqual from 'fast-deep-equal';

export type PricingTier = 'promo_99' | 'standard_199' | 'enterprise' | 'foc';
export type SubscriptionStatus = 'active' | 'suspended' | 'trial' | 'pending';

export interface Tenant {
  id: string;
  name: string;
  ownerUid: string;
  staffUids: string[];
  moduleType: string;
  unlockedModules?: string[]; // Array of additional purchased apps
  pricingTier: PricingTier;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string | number | Date | null;
  ownerEmail?: string; // Appended for admin dashboards
  nextBillingDate?: string | number | Date | null;
  trialEndsAt?: string | number | Date | null;
  businessCode?: string; // 4-digit code for team member registration
  // Custom Payment
  gcashQrImageBase64?: string;
  // Multi-Branch Enterprise Support
  parentTenantId?: string; 
  branchName?: string;
  therapistCommissionRate?: number;
  mechanicCommissionRate?: number;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  tenantId?: string | null;
  role?: string;
  [key: string]: unknown;
}

interface TenantState {
  activeTenant: Tenant | null;
  allTenants: Tenant[];
  userProfile: UserProfile | null;
  activeModuleOverride: string | null; // Locally override the current app view
  isLoading: boolean;
  isSeeding: boolean;
  error: string | null;
  
  // Actions
  setActiveTenant: (tenant: Tenant | null) => void;
  setAllTenants: (tenants: Tenant[]) => void;
  updateTenantStatus: (id: string, status: SubscriptionStatus) => void;
  updateTenantPricing: (id: string, tier: PricingTier) => void;
  unlockModule: (tenantId: string, moduleId: string) => void;
  switchActiveModule: (moduleId: string | null) => void;
  setUserProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setSeeding: (seeding: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      activeTenant: null,
      allTenants: [],
      userProfile: null,
      activeModuleOverride: null,
      isLoading: true,
      isSeeding: false,
      error: null,

  setActiveTenant: (tenant) => set((state) => {
    if (state.activeTenant?.id !== tenant?.id) {
      return { activeTenant: tenant, activeModuleOverride: null };
    }
    return { activeTenant: tenant };
  }),

  setAllTenants: (tenants) => set((state) => {
    // Deep compare to prevent infinite render loops if the array reference changes but data is identical
    if (deepEqual(state.allTenants, tenants)) {
      return state;
    }
    return { allTenants: tenants };
  }),
  
  updateTenantStatus: (id, status) => set((state) => {
    const allTenants = state.allTenants.map(t => t.id === id ? { ...t, subscriptionStatus: status } : t);
    const activeTenant = state.activeTenant?.id === id ? { ...state.activeTenant, subscriptionStatus: status } : state.activeTenant;
    return { allTenants, activeTenant };
  }),

  updateTenantPricing: (id, tier) => set((state) => {
    const allTenants = state.allTenants.map(t => t.id === id ? { ...t, pricingTier: tier } : t);
    const activeTenant = state.activeTenant?.id === id ? { ...state.activeTenant, pricingTier: tier } : state.activeTenant;
    return { allTenants, activeTenant };
  }),

  unlockModule: (tenantId, moduleId) => set((state) => {
    const allTenants = state.allTenants.map(t => {
      if (t.id === tenantId) {
        const currentModules = t.unlockedModules || [];
        if (!currentModules.includes(moduleId)) {
          return { ...t, unlockedModules: [...currentModules, moduleId] };
        }
      }
      return t;
    });
    
    const activeTenant = state.activeTenant?.id === tenantId 
      ? { 
          ...state.activeTenant, 
          unlockedModules: [...(state.activeTenant.unlockedModules || []), moduleId] 
        } 
      : state.activeTenant;

    return { allTenants, activeTenant };
  }),

  switchActiveModule: (moduleId) => {
    set({ activeModuleOverride: moduleId });
  },

  setUserProfile: (profile) => {
    set({ userProfile: profile });
  },

  setLoading: (loading) => set((state) => {
    if (state.isLoading === loading) return state;
    return { isLoading: loading };
  }),
  setSeeding: (seeding) => set((state) => {
    if (state.isSeeding === seeding) return state;
    return { isSeeding: seeding };
  }),
  setError: (error) => set({ error: error }),
  
  reset: () => {
    set({ activeTenant: null, allTenants: [], userProfile: null, activeModuleOverride: null, isLoading: false, isSeeding: false, error: null });
  }
    }),
    {
      name: 'katuwang-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ 
        activeTenant: state.activeTenant,
        activeModuleOverride: state.activeModuleOverride
      }),
    }
  )
);
