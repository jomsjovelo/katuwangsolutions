import { create } from 'zustand';

/**
 * Legacy Staff Session Store (DORMANT / PURGED)
 *
 * Replaced by Secure Firebase Custom Token Authentication and
 * In-Memory Authoritative Bootstrap Store (useSecureCashierStore).
 *
 * LocalStorage persistence is permanently purged and disabled.
 * Local-only sessions cannot authorize dashboard access.
 */

// Purge any stale legacy localStorage on module evaluation
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    window.localStorage.removeItem('katuwang-staff-session-storage');
  } catch {
    // Ignore storage access errors
  }
}

export interface StaffSessionData {
  tenantId: string;
  staffAccountId: string;
  username: string;
  tenantName: string;
  moduleType: string;
  loginTimestamp: number;
}

interface StaffSessionState {
  staffSession: StaffSessionData | null;
  setStaffSession: (session: Omit<StaffSessionData, 'loginTimestamp'>) => void;
  clearStaffSession: () => void;
  isSessionValid: () => boolean;
}

export const useStaffSession = create<StaffSessionState>((set) => ({
  staffSession: null,
  setStaffSession: () => {
    // Dormant: direct client session creation is unauthorized
    set({ staffSession: null });
  },
  clearStaffSession: () => set({ staffSession: null }),
  isSessionValid: () => {
    // Always fail closed: local-only session cannot authorize access
    return false;
  }
}));
