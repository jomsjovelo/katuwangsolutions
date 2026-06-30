import { create } from 'zustand';

interface PinApprovalState {
  isOpen: boolean;
  actionDescription: string;
  resolvePromise: ((approved: boolean) => void) | null;
  
  // Actions
  requestApproval: (description: string) => Promise<boolean>;
  resolveApproval: (approved: boolean) => void;
  close: () => void;
}

export const usePinApprovalStore = create<PinApprovalState>((set, get) => ({
  isOpen: false,
  actionDescription: '',
  resolvePromise: null,

  requestApproval: (description: string) => {
    return new Promise<boolean>((resolve) => {
      // Auto-resolve to true in development or if no PIN is set?
      // No, we'll let the UI component handle the PIN check logic.
      set({
        isOpen: true,
        actionDescription: description,
        resolvePromise: resolve
      });
    });
  },

  resolveApproval: (approved: boolean) => {
    const { resolvePromise } = get();
    if (resolvePromise) {
      resolvePromise(approved);
    }
    set({ isOpen: false, resolvePromise: null, actionDescription: '' });
  },

  close: () => {
    const { resolvePromise } = get();
    if (resolvePromise) {
      resolvePromise(false);
    }
    set({ isOpen: false, resolvePromise: null, actionDescription: '' });
  }
}));
