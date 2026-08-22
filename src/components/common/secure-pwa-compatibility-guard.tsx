'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  claimServiceWorkerControllerRefresh,
  clearLegacyCashierAuthority
} from '@/lib/client/secure-pwa-compatibility';

/** Minimal cutover guard; Rules and trusted APIs remain the authority boundary. */
export function SecurePwaCompatibilityGuard() {
  const pathname = usePathname();

  useEffect(() => {
    try { clearLegacyCashierAuthority(window.localStorage); } catch { /* fail closed elsewhere */ }
    if (!pathname.startsWith('/dashboard') || !('serviceWorker' in navigator)) return;

    void navigator.serviceWorker.ready.then((registration) => registration.update()).catch(() => undefined);
    const onControllerChange = () => {
      try {
        if (claimServiceWorkerControllerRefresh(window.sessionStorage, Date.now())) window.location.reload();
      } catch {
        // Storage denial must not create an unbounded refresh loop.
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, [pathname]);

  return null;
}

