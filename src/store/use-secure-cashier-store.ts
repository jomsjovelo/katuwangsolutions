import { create } from 'zustand';
import {
  BentaCashierBootstrapResponse,
  SanitizedBootstrapProduct,
  SanitizedBootstrapShift,
  CheckoutReceipt,
  ShiftReconciliationSummary
} from '@/lib/client/secure-benta-cashier-client';

export interface PendingCheckoutIntent {
  idempotencyKey: string;
  shiftId: string;
  items: Array<{ productId: string; quantity: number }>;
  paymentMethod: 'cash' | 'gcash' | 'maya';
  paymentReference?: string;
}

export interface SecureCashierState {
  bootstrap: BentaCashierBootstrapResponse | null;
  activeShift: SanitizedBootstrapShift | null;
  products: SanitizedBootstrapProduct[];
  isCashierAuthenticated: boolean;
  shiftRecoveryRequired: boolean;
  lastReceipt: CheckoutReceipt | null;
  reconciliationSummary: ShiftReconciliationSummary | null;
  
  // Pending unresolved checkout intent (locks cart mutations and preserves idempotency across retries)
  pendingCheckoutIntent: PendingCheckoutIntent | null;
  
  // Idempotency keys (in-memory only, stable across retries, reset on intent change)
  shiftOpenKey: string | null;
  checkoutKey: string | null;
  
  // Actions
  setBootstrap: (bootstrap: BentaCashierBootstrapResponse) => void;
  setActiveShift: (shift: SanitizedBootstrapShift | null) => void;
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
  shiftRecoveryRequired: false,
  lastReceipt: null,
  reconciliationSummary: null,
  pendingCheckoutIntent: null,
  shiftOpenKey: null,
  checkoutKey: null,

  setBootstrap: (bootstrap) => {
    set({
      bootstrap,
      activeShift: bootstrap.currentShift || null,
      products: bootstrap.products || [],
      isCashierAuthenticated: true,
      shiftRecoveryRequired: false
    });
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
