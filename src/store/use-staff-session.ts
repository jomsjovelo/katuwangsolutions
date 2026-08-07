import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export const useStaffSession = create<StaffSessionState>()(
  persist(
    (set, get) => ({
      staffSession: null,
      setStaffSession: (session) => {
        set({
          staffSession: {
            ...session,
            loginTimestamp: Date.now()
          }
        });
      },
      clearStaffSession: () => set({ staffSession: null }),
      isSessionValid: () => {
        const session = get().staffSession;
        if (!session) return false;
        const elapsed = Date.now() - session.loginTimestamp;
        if (elapsed > TWELVE_HOURS_MS) {
          get().clearStaffSession();
          return false;
        }
        return true;
      }
    }),
    {
      name: 'katuwang-staff-session-storage'
    }
  )
);
