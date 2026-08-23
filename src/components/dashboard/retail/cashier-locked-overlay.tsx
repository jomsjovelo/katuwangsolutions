'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Shield, Lock, Fingerprint, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';
import { getWebAuthnClientVerifier } from '@/lib/client/webauthn-client-verifier';
import { getJournalDB } from '@/lib/offline/journal-db';

interface CashierLockedOverlayProps {
  onOnlineLoginRedirect?: () => void;
}

export function CashierLockedOverlay({ onOnlineLoginRedirect }: CashierLockedOverlayProps) {
  const isLocked = useSecureCashierStore((state) => state.isLocalLocked);
  const bootstrap = useSecureCashierStore((state) => state.bootstrap);
  const unlockViaWebAuthn = useSecureCashierStore((state) => state.unlockViaWebAuthn);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLocked) return null;

  const handleUnlock = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!bootstrap) {
        throw new Error('Walang aktibong bootstrap session. Mag-login muli online.');
      }

      const journalDB = getJournalDB();
      const installationIdMeta = await journalDB.getMetaState<string>('pos_installation_id');
      const installationId = installationIdMeta?.value || '';

      const trustedDevice = await journalDB.getTrustedDevice(
        bootstrap.tenantId,
        bootstrap.staffAccountId,
        installationId
      );

      if (!trustedDevice) {
        throw new Error('Walang nakarehistrong device security sa terminal na ito. Paki-login online gamit ang iyong PIN.');
      }

      const verifier = getWebAuthnClientVerifier();
      const challengeBytes = verifier.generateLocalChallenge();

      const assertionResponse = await verifier.performAssertionCeremony(
        trustedDevice,
        challengeBytes
      );

      const unlockResult = await unlockViaWebAuthn(assertionResponse, challengeBytes, installationId);

      if (!unlockResult.success) {
        setError(unlockResult.error || 'Hindi matagumpay ang unlock verification.');
      }
    } catch (err: any) {
      console.error('WebAuthn unlock error:', err);
      setError(
        err.message || 'Hindi nakumpleto ang verification. Siguraduhing tama ang biometric o device PIN.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border shadow-2xl rounded-2xl p-6 sm:p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="relative mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Lock className="w-8 h-8" />
          <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white rounded-full p-1 shadow">
            <Shield className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Naka-lock ang Cashier POS
          </h2>
          <p className="text-sm text-muted-foreground">
            {bootstrap?.tenantDisplayName || 'Store'} &bull; {bootstrap?.cashierDisplayName || 'Cashier'}
          </p>
          {bootstrap?.currentShift && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-medium mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Aktibong Shift: {bootstrap.currentShift.id.slice(-6).toUpperCase()}
            </div>
          )}
        </div>

        {error && (
          <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex items-start gap-2.5 text-left">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-muted/40 p-4 rounded-xl border text-xs text-muted-foreground text-left space-y-1">
          <p className="font-semibold text-foreground">Unlock using device security</p>
          <p>
            Device PIN, fingerprint, face authentication, or security key—depending on this device.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <Button
            size="lg"
            className="w-full gap-2 text-base font-semibold shadow-md"
            onClick={handleUnlock}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Fingerprint className="w-5 h-5" />
            )}
            I-unlock gamit ang Device Security
          </Button>

          {onOnlineLoginRedirect && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-foreground gap-1.5"
              onClick={onOnlineLoginRedirect}
              disabled={isLoading}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Mag-login Online gamit ang PIN
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
