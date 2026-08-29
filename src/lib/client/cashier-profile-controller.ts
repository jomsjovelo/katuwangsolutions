import { executeCashierLogoutCoordinator } from './secure-benta-cashier-client';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';
import { useTenantStore } from '@/store/use-tenant-store';

export interface CashierProfileLogoutDeps {
  user: { getIdToken: (forceRefresh?: boolean) => Promise<string> } | null | undefined;
  hasActiveShift: boolean;
  shiftId?: string;
  isLoggingOutRef: { current: boolean };
  setIsLoggingOut: (val: boolean) => void;
  setShowShiftConfirmDialog: (val: boolean) => void;
  setLogoutError: (err: string | null) => void;
  logoutCoordinatorFn?: typeof executeCashierLogoutCoordinator;
  clearCashierSession?: () => void;
  resetTenantStore?: () => void;
  removeLocalStorageItem?: (key: string) => void;
  onRedirect?: () => void;
}

export function handleCashierLogoutClick(
  deps: Pick<CashierProfileLogoutDeps, 'isLoggingOutRef' | 'hasActiveShift' | 'setShowShiftConfirmDialog' | 'setLogoutError'> & {
    performLogout: () => Promise<void>;
  }
): void {
  if (deps.isLoggingOutRef.current) return;
  deps.setLogoutError(null);

  if (deps.hasActiveShift) {
    deps.setShowShiftConfirmDialog(true);
  } else {
    deps.performLogout();
  }
}

export async function performCashierLogoutAction(deps: CashierProfileLogoutDeps): Promise<void> {
  // Synchronous guard before any async operation
  if (deps.isLoggingOutRef.current) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[CASHIER_LOGOUT] performLogout blocked by synchronous in-flight guard.');
    }
    return;
  }
  deps.isLoggingOutRef.current = true;

  deps.setLogoutError(null);
  deps.setIsLoggingOut(true);
  deps.setShowShiftConfirmDialog(false);

  if (process.env.NODE_ENV !== 'production') {
    console.info('[CASHIER_LOGOUT] Initiating cashier logout sequence...', {
      hasActiveShift: deps.hasActiveShift,
      shiftId: deps.shiftId
    });
  }

  const coordinator = deps.logoutCoordinatorFn || executeCashierLogoutCoordinator;

  try {
    await coordinator({
      getIdToken: async () => {
        if (!deps.user) throw new Error('No active user session found.');
        return deps.user.getIdToken();
      },
      onLocalStateCleanup: () => {
        if (process.env.NODE_ENV !== 'production') {
          console.info('[CASHIER_LOGOUT] Server revocation confirmed. Cleaning up local cashier state...');
        }
        if (deps.clearCashierSession) {
          deps.clearCashierSession();
        } else {
          useSecureCashierStore.getState().clearCashierSession();
        }

        if (deps.resetTenantStore) {
          deps.resetTenantStore();
        } else {
          useTenantStore.getState().reset();
        }

        try {
          if (deps.removeLocalStorageItem) {
            deps.removeLocalStorageItem('katuwang-staff-session-storage');
          } else {
            localStorage.removeItem('katuwang-staff-session-storage');
          }
        } catch {}
      },
      onRedirect: () => {
        if (process.env.NODE_ENV !== 'production') {
          console.info('[CASHIER_LOGOUT] Redirecting to /login...');
        }
        if (deps.onRedirect) {
          deps.onRedirect();
        } else {
          window.location.href = '/login';
        }
      }
    });
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[CASHIER_LOGOUT] Server revocation failed (fail-closed):', {
        error: err?.message,
        status: err?.status,
        category: err?.category,
        code: err?.code
      });
    }
    // Synchronous guard and UI state reset on failure
    deps.isLoggingOutRef.current = false;
    deps.setIsLoggingOut(false);
    deps.setLogoutError(err?.message || 'Hindi natapos ang logout sa server. Paki-check ang koneksyon at subukan muli.');
  }
}
