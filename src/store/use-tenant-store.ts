import { create } from 'zustand';

export type PricingTier = 'promo_99' | 'standard_199';
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
  createdAt: any;
}

interface TenantState {
  activeTenant: Tenant | null;
  allTenants: Tenant[];
  userProfile: any | null;
  activeModuleOverride: string | null; // Locally override the current app view
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setActiveTenant: (tenant: Tenant | null) => void;
  setAllTenants: (tenants: Tenant[]) => void;
  updateTenantStatus: (id: string, status: SubscriptionStatus) => void;
  updateTenantPricing: (id: string, tier: PricingTier) => void;
  unlockModule: (tenantId: string, moduleId: string) => void;
  switchActiveModule: (moduleId: string | null) => void;
  setUserProfile: (profile: any | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// Resilient helper to read from local storage safely during Next.js SSR phase
const readLocalStorage = (key: string) => {
  if (typeof window === 'undefined') return null;
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn("Zustand cache read failed:", err);
    return null;
  }
};

export const useTenantStore = create<TenantState>((set) => ({
  activeTenant: readLocalStorage('katuwang-active-tenant'),
  allTenants: [],
  userProfile: readLocalStorage('katuwang-user-profile'),
  activeModuleOverride: readLocalStorage('katuwang-active-module'),
  isLoading: true,
  error: null,

  setActiveTenant: (tenant) => {
    if (typeof window !== 'undefined') {
      try {
        if (tenant) {
          localStorage.setItem('katuwang-active-tenant', JSON.stringify(tenant));
        } else {
          localStorage.removeItem('katuwang-active-tenant');
        }
        // 2E: Always reset the active module override when switching tenants
        // to prevent a previous override from bleeding across different accounts.
        localStorage.removeItem('katuwang-active-module');
      } catch (err) {
        console.warn("Zustand activeTenant write failed:", err);
      }
    }
    set({ activeTenant: tenant, activeModuleOverride: null });
  },

  setAllTenants: (tenants) => set({ allTenants: tenants }),
  
  updateTenantStatus: (id, status) => set((state) => {
    const allTenants = state.allTenants.map(t => t.id === id ? { ...t, subscriptionStatus: status } : t);
    const activeTenant = state.activeTenant?.id === id ? { ...state.activeTenant, subscriptionStatus: status } : state.activeTenant;
    if (activeTenant && typeof window !== 'undefined') {
      localStorage.setItem('katuwang-active-tenant', JSON.stringify(activeTenant));
    }
    return { allTenants, activeTenant };
  }),

  updateTenantPricing: (id, tier) => set((state) => {
    const allTenants = state.allTenants.map(t => t.id === id ? { ...t, pricingTier: tier } : t);
    const activeTenant = state.activeTenant?.id === id ? { ...state.activeTenant, pricingTier: tier } : state.activeTenant;
    if (activeTenant && typeof window !== 'undefined') {
      localStorage.setItem('katuwang-active-tenant', JSON.stringify(activeTenant));
    }
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

    if (activeTenant && typeof window !== 'undefined') {
      localStorage.setItem('katuwang-active-tenant', JSON.stringify(activeTenant));
    }
    return { allTenants, activeTenant };
  }),

  switchActiveModule: (moduleId) => {
    if (typeof window !== 'undefined') {
      if (moduleId) {
        localStorage.setItem('katuwang-active-module', JSON.stringify(moduleId));
      } else {
        localStorage.removeItem('katuwang-active-module');
      }
    }
    set({ activeModuleOverride: moduleId });
  },

  setUserProfile: (profile) => {
    if (typeof window !== 'undefined') {
      try {
        if (profile) {
          localStorage.setItem('katuwang-user-profile', JSON.stringify(profile));
        } else {
          localStorage.removeItem('katuwang-user-profile');
        }
      } catch (err) {
        console.warn("Zustand userProfile write failed:", err);
      }
    }
    set({ userProfile: profile });
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error: error }),
  
  reset: () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('katuwang-active-tenant');
        localStorage.removeItem('katuwang-user-profile');
        localStorage.removeItem('katuwang-active-module');
      } catch (err) {
        console.warn("Zustand cache reset failed:", err);
      }
    }
    set({ activeTenant: null, userProfile: null, activeModuleOverride: null, isLoading: false, error: null });
  },
}));
