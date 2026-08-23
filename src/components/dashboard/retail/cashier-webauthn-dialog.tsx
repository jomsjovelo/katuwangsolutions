'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2, Key } from 'lucide-react';
import { startWebAuthnRegistration } from '@/lib/client/webauthn-client-verifier';
import {
  fetchWebAuthnRegistrationOptions,
  submitWebAuthnRegistrationVerify
} from '@/lib/client/secure-benta-cashier-client';
import { getJournalDB } from '@/lib/offline/journal-db';

interface CashierWebAuthnDialogProps {
  isOpen: boolean;
  onClose: () => void;
  idToken: string;
  installationId: string;
  tenantId: string;
  staffAccountId: string;
  authUid: string;
  onSuccess?: () => void;
}

export function CashierWebAuthnDialog({
  isOpen,
  onClose,
  idToken,
  installationId,
  tenantId,
  staffAccountId,
  authUid,
  onSuccess
}: CashierWebAuthnDialogProps) {
  const [deviceName, setDeviceName] = useState('Cashier Terminal');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleRegister = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch registration options from server
      const { options, deviceNameSuggested } = await fetchWebAuthnRegistrationOptions(
        idToken,
        installationId
      );

      // 2. Perform native WebAuthn ceremony
      const registrationResponse = await startWebAuthnRegistration(options);

      // 3. Verify registration on server
      const effectiveName = deviceName.trim() || deviceNameSuggested || 'Cashier Terminal';
      const verifyResult = await submitWebAuthnRegistrationVerify(
        idToken,
        installationId,
        registrationResponse,
        effectiveName
      );

      if (verifyResult.success && verifyResult.trustedDevice) {
        // 4. Durably persist local trusted device record in IndexedDB
        const journalDB = getJournalDB();
        await journalDB.saveTrustedDevice({
          credentialId: verifyResult.trustedDevice.credentialId,
          credentialIdHash: verifyResult.trustedDevice.credentialIdHash,
          credentialPublicKeyHash: verifyResult.trustedDevice.credentialPublicKeyHash,
          tenantId,
          staffAccountId,
          authUid,
          installationId,
          deviceName: effectiveName,
          publicKeySpki: verifyResult.trustedDevice.publicKeySpki,
          algorithm: verifyResult.trustedDevice.algorithm,
          counter: verifyResult.trustedDevice.counter || 0,
          rpId: verifyResult.trustedDevice.rpId,
          registeredAt: Date.now()
        });

        setIsSuccess(true);
        onSuccess?.();
      }
    } catch (err: any) {
      console.error('WebAuthn registration error:', err);
      setError(
        err.message || 'Hindi matagumpay ang registration. Siguraduhing may suportadong device security.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
            <DialogTitle>Secure Offline Device Setup</DialogTitle>
          </div>
          <DialogDescription>
            I-enable ang offline access sa POS terminal na ito gamit ang device security (PIN, fingerprint, face authentication, o security key).
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto animate-bounce" />
            <h3 className="text-lg font-semibold text-foreground">Nakarehistro na ang Device!</h3>
            <p className="text-sm text-muted-foreground">
              Maaari mo nang i-unlock ang POS terminal na ito kahit walang internet connection.
            </p>
            <Button className="w-full mt-4" onClick={onClose}>
              Tapos Na
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="deviceName">Pangalan ng Device / Terminal</Label>
              <Input
                id="deviceName"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Hal. Counter 1 Tablet"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Gagamitin itong pagkakakilanlan sa audit trail at device management.
              </p>
            </div>

            <div className="bg-muted/40 p-3 rounded-lg border text-xs text-muted-foreground space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Key className="h-3.5 w-3.5" />
                <span>Seguridad at Privacy</span>
              </div>
              <p>
                Hindi naitatala ang iyong biometric data sa server. Ang public cryptographic key lamang ang gagamitin upang beripikahin ang iyong mga offline transactions.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={onClose} disabled={isLoading}>
                Kanselahin
              </Button>
              <Button onClick={handleRegister} disabled={isLoading} className="gap-2">
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                I-rehistro ang Device
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
