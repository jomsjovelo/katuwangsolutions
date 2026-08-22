import assert from 'node:assert/strict';
import {
  claimServiceWorkerControllerRefresh,
  clearLegacyCashierAuthority,
  LEGACY_CASHIER_STORAGE_KEYS
} from '../src/lib/client/secure-pwa-compatibility';

const values = new Map<string, string>([
  ['katuwang-staff-session-storage', 'legacy-browser-authority'],
  ['owner-offline-preference', 'preserve']
]);
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); }
};

clearLegacyCashierAuthority(storage);
assert.equal(values.has(LEGACY_CASHIER_STORAGE_KEYS[0]), false, 'legacy Cashier browser authority is cleared');
assert.equal(values.get('owner-offline-preference'), 'preserve', 'unrelated Owner offline state is preserved');
assert.equal(claimServiceWorkerControllerRefresh(storage, 100_000), true, 'new controller claims one refresh');
assert.equal(claimServiceWorkerControllerRefresh(storage, 100_001), false, 'same transition cannot loop reloads');
assert.equal(claimServiceWorkerControllerRefresh(storage, 160_000), true, 'a later controller transition may refresh once');
console.log('SECURE PWA COMPATIBILITY: 5/5 PASS');

