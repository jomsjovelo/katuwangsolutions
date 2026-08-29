import { create } from 'zustand';
import {
  BentaCashierBootstrapResponse,
  SanitizedBootstrapProduct,
  SanitizedBootstrapShift,
  CheckoutReceipt,
  ShiftReconciliationSummary
} from '@/lib/client/secure-benta-cashier-client';

export type CheckoutIntentItem =
  | { productId: string; quantityMode?: 'discrete'; quantity: number }
  | { productId: string; quantityMode: 'measured'; quantityMinor: number; quantityScale: number; sellingUnit: string };

export interface PendingCheckoutIntent {
  idempotencyKey: string;
  shiftId: string;
  items: CheckoutIntentItem[];
  paymentMethod: 'cash' | 'gcash' | 'maya';
  paymentReference?: string;
}

export interface SecureCashierState {
  bootstrap: BentaCashierBootstrapResponse | null;
  activeShift: SanitizedBootstrapShift | null;
  products: SanitizedBootstrapProduct[];
  isCashierAuthenticated: boolean;
  isLocalLocked: boolean;
  lastBackgroundedAt: number | null;
  shiftRecoveryRequired: boolean;
  lastReceipt: CheckoutReceipt | null;
  reconciliationSummary: ShiftReconciliationSummary | null;
  
  // Pending unresolved checkout intent (locks cart mutations and preserves idempotency across retries)
  pendingCheckoutIntent: PendingCheckoutIntent | null;
  
  // Idempotency keys (in-memory only, stable across retries, reset on intent change)
  shiftOpenKey: string | null;
  checkoutKey: string | null;
  
  // Actions
  setOnlineBootstrap: (bootstrap: BentaCashierBootstrapResponse) => void;
  setRestoredOfflineBootstrap: (bootstrap: BentaCashierBootstrapResponse) => void;
  setBootstrap: (bootstrap: BentaCashierBootstrapResponse) => void;
  setActiveShift: (shift: SanitizedBootstrapShift | null) => void;
  unlockViaOnlineAuth: () => void;
  unlockViaWebAuthn: (assertionResponse: any, challengeBytes: Uint8Array, installationId: string) => Promise<{ success: boolean; error?: string }>;
  lockCashierSession: () => void;
  setBackgroundedAt: (timestamp: number | null) => void;
  checkInactivityLock: () => boolean;
  setShiftRecoveryRequired: (required: boolean) => void;
  setLastReceipt: (receipt: CheckoutReceipt | null) => void;
  setReconciliationSummary: (summary: ShiftReconciliationSummary | null) => void;
  setPendingCheckoutIntent: (intent: PendingCheckoutIntent | null) => void;
  clearPendingCheckoutIntent: () => void;
  getOrCreateShiftOpenKey: () => string;
  resetShiftOpenKey: () => void;
  getOrCreateCheckoutKey: () => string;
  resetCheckoutKey: () => void;
  clearCashierSession: () => void;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const useSecureCashierStore = create<SecureCashierState>((set, get) => ({
  bootstrap: null,
  activeShift: null,
  products: [],
  isCashierAuthenticated: false,
  isLocalLocked: true,
  lastBackgroundedAt: null,
  shiftRecoveryRequired: false,
  lastReceipt: null,
  reconciliationSummary: null,
  pendingCheckoutIntent: null,
  shiftOpenKey: null,
  checkoutKey: null,

  setOnlineBootstrap: (bootstrap) => {
    set({
      bootstrap,
      activeShift: bootstrap.currentShift || null,
      products: bootstrap.products || [],
      isCashierAuthenticated: true,
      isLocalLocked: false, // Live online authentication enters unlocked state
      shiftRecoveryRequired: false
    });
  },

  setRestoredOfflineBootstrap: (bootstrap) => {
    set({
      bootstrap,
      activeShift: bootstrap.currentShift || null,
      products: bootstrap.products || [],
      isCashierAuthenticated: true,
      isLocalLocked: true, // Restored offline session starts locked
      shiftRecoveryRequired: false
    });
  },

  setBootstrap: (bootstrap) => {
    // Default setBootstrap treats live fetched bootstrap as online (unlocked)
    get().setOnlineBootstrap(bootstrap);
  },

  unlockViaOnlineAuth: () => {
    set({ isCashierAuthenticated: true, isLocalLocked: false });
  },

  lockCashierSession: () => {
    set({ isLocalLocked: true });
  },

  setBackgroundedAt: (timestamp) => {
    set({ lastBackgroundedAt: timestamp });
  },

  checkInactivityLock: () => {
    const lastBg = get().lastBackgroundedAt;
    if (lastBg && Date.now() - lastBg >= 15 * 60 * 1000) {
      set({ isLocalLocked: true });
      return true;
    }
    return false;
  },

  unlockViaWebAuthn: async (assertionResponse, challengeBytes, installationId) => {
    const bootstrap = get().bootstrap;
    if (!bootstrap) {
      return { success: false, error: 'No bootstrap session found.' };
    }

    const { getCashierOfflineManager } = await import('@/lib/client/cashier-offline-manager');
    const result = await getCashierOfflineManager().unlockViaWebAuthn({
      assertionResponse,
      challengeBytes,
      tenantId: bootstrap.tenantId,
      staffAccountId: bootstrap.staffAccountId,
      installationId
    });

    if (result.success) {
      set({ isLocalLocked: false, lastBackgroundedAt: null });
    }
    return result;
  },

  setActiveShift: (shift) => {
    set((state) => ({
      activeShift: shift,
      bootstrap: state.bootstrap ? { ...state.bootstrap, currentShift: shift } : null
    }));
  },

  setShiftRecoveryRequired: (required) => {
    set({ shiftRecoveryRequired: required });
  },

  setLastReceipt: (receipt) => {
    set({ lastReceipt: receipt });
  },

  setReconciliationSummary: (summary) => {
    set({ reconciliationSummary: summary });
  },

  setPendingCheckoutIntent: (intent) => {
    set({
      pendingCheckoutIntent: intent,
      checkoutKey: intent ? intent.idempotencyKey : null
    });
  },

  clearPendingCheckoutIntent: () => {
    set({ pendingCheckoutIntent: null, checkoutKey: null });
  },

  getOrCreateShiftOpenKey: () => {
    const current = get().shiftOpenKey;
    if (current) return current;
    const newKey = generateUuid();
    set({ shiftOpenKey: newKey });
    return newKey;
  },

  resetShiftOpenKey: () => {
    set({ shiftOpenKey: null });
  },

  getOrCreateCheckoutKey: () => {
    const pending = get().pendingCheckoutIntent;
    if (pending) return pending.idempotencyKey;
    const current = get().checkoutKey;
    if (current) return current;
    const newKey = generateUuid();
    set({ checkoutKey: newKey });
    return newKey;
  },

  resetCheckoutKey: () => {
    // If there is an active pending intent from an ambiguous result, do NOT reset the key
    if (get().pendingCheckoutIntent) return;
    set({ checkoutKey: null });
  },

  clearCashierSession: () => {
    set({
      bootstrap: null,
      activeShift: null,
      products: [],
      isCashierAuthenticated: false,
      shiftRecoveryRequired: false,
      lastReceipt: null,
      reconciliationSummary: null,
      pendingCheckoutIntent: null,
      shiftOpenKey: null,
      checkoutKey: null
    });
  }
}));

export function shouldBlockCheckoutForCashierLock(
  isCashier: boolean,
  isLocalLocked: boolean
): boolean {
  return isCashier && isLocalLocked;
}
