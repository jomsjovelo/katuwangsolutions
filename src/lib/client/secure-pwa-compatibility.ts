export const LEGACY_CASHIER_STORAGE_KEYS = [
  'katuwang-staff-session-storage'
] as const;

const CONTROLLER_REFRESH_KEY = 'katuwang-secure-sw-controller-refresh-at';
const CONTROLLER_REFRESH_COOLDOWN_MS = 60_000;

interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function clearLegacyCashierAuthority(storage: MinimalStorage): void {
  for (const key of LEGACY_CASHIER_STORAGE_KEYS) storage.removeItem(key);
}

/** Allows one refresh per controller transition window and prevents reload loops. */
export function claimServiceWorkerControllerRefresh(storage: MinimalStorage, now: number): boolean {
  const previous = Number(storage.getItem(CONTROLLER_REFRESH_KEY));
  if (Number.isFinite(previous) && now - previous < CONTROLLER_REFRESH_COOLDOWN_MS) return false;
  storage.setItem(CONTROLLER_REFRESH_KEY, String(now));
  return true;
}

