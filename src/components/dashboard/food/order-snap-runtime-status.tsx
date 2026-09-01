"use client"

import type { UseOrderSnapResult } from '@/lib/order-snap/use-order-snap';
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WifiOff, Wifi, Lock, Unlock, Package, Clock, RefreshCw, Loader2, ShieldCheck } from 'lucide-react';

interface OrderSnapRuntimeStatusProps {
  readonly orderSnap: UseOrderSnapResult;
}

export function OrderSnapRuntimeStatus({ orderSnap }: OrderSnapRuntimeStatusProps) {
  const { state, status, controller } = orderSnap;

  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState(false);

  const hasCatalog = !!(state?.catalog && state?.catalogVersion);
  const canCheckout = state?.canCheckoutOffline ?? false;
  const pendingCount = state?.pendingCount ?? 0;
  const syncMessage = state?.syncMessage ?? 'Initializing Order Snap...';

  const showUnlockButton = status === 'locked' && !!controller;

  const handleUnlock = async () => {
    setUnlockError(false);
    setIsUnlocking(true);
    try {
      const c = controller;
      if (!c) {
        return;
      }
      const result = await c.attemptWebAuthnUnlock();
      if (!result.success) {
        setUnlockError(true);
      }
    } catch {
      setUnlockError(true);
    } finally {
      setIsUnlocking(false);
    }
  };

  useEffect(() => {
    if (status === 'unlocked' || status === 'ready') {
      setUnlockError(false);
    }
  }, [status]);

  return (
    <div data-testid="order-snap-runtime" aria-live="polite">
      <Card className="shadow-sm border-slate-200 bg-slate-50/50">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Badge
              data-testid="order-snap-status"
              variant="outline"
              className="font-bold uppercase tracking-wider text-[10px] border-slate-300 bg-white"
            >
              {status}
            </Badge>

            <Badge
              data-testid="order-snap-offline-indicator"
              variant="secondary"
              className="font-bold uppercase tracking-wider text-[10px] bg-slate-200 text-slate-600 border-slate-300"
            >
              {state === null ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 inline" />
                  Checking connection
                </>
              ) : state?.isOnline === true ? (
                <>
                  <Wifi className="h-3 w-3 mr-1 inline" />
                  Online
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 mr-1 inline" />
                  Offline
                </>
              )}
            </Badge>

            <Badge
              data-testid="order-snap-catalog-status"
              variant={hasCatalog ? "default" : "destructive"}
              className={`font-bold uppercase tracking-wider text-[10px] ${
                hasCatalog
                  ? 'bg-blue-100 text-blue-700 border-blue-200'
                  : 'bg-red-100 text-red-700 border-red-200'
              }`}
            >
              <Package className="h-3 w-3 mr-1 inline" />
              {hasCatalog ? 'Catalog available' : 'Catalog unavailable'}
            </Badge>

            <Badge
              data-testid="order-snap-checkout-lock"
              variant="outline"
              className={`font-bold uppercase tracking-wider text-[10px] border ${
                canCheckout
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-amber-300 bg-amber-50 text-amber-700'
              }`}
            >
              {canCheckout ? (
                <>
                  <Unlock className="h-3 w-3 mr-1 inline" />
                  Offline checkout unlocked
                </>
              ) : (
                <>
                  <Lock className="h-3 w-3 mr-1 inline" />
                  Offline checkout locked
                </>
              )}
            </Badge>

            {showUnlockButton && (
              <Button
                data-testid="order-snap-webauthn-trigger"
                size="sm"
                variant="outline"
                disabled={isUnlocking}
                className="h-7 px-2 text-[10px] font-bold rounded-md border-slate-300 hover:bg-slate-100"
                aria-label="Verify device to unlock offline checkout"
                onClick={handleUnlock}
              >
                {isUnlocking ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Unlock offline checkout
                  </>
                )}
              </Button>
            )}

            <Badge
              data-testid="order-snap-pending-count"
              variant="secondary"
              className="font-bold uppercase tracking-wider text-[10px] bg-amber-100 text-amber-700 border-amber-200"
            >
              <Clock className="h-3 w-3 mr-1 inline" />
              {pendingCount} pending
            </Badge>

            <div
              data-testid="order-snap-sync-message"
              className="flex items-center gap-1 text-[10px] text-slate-500 font-medium"
            >
              {state?.isSyncing && <RefreshCw className="h-3 w-3 animate-spin" />}
              <span>{syncMessage}</span>
            </div>
          </div>

          {unlockError && (
            <div
              data-testid="order-snap-unlock-error"
              role="alert"
              className="mt-2 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2"
            >
              Unable to verify. Try again.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}