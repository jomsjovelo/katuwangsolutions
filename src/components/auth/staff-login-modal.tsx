'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { staffPinLogin, fetchBentaBootstrap } from '@/lib/client/secure-benta-cashier-client';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';
import { useTenantStore } from '@/store/use-tenant-store';
import { useRouter } from 'next/navigation';
import { UserCheck, KeyRound, Building2, Loader2, Store } from 'lucide-react';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { app } from '@/firebase/config';

interface StaffLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBusinessCode?: string;
  onLoginSuccess?: () => void;
}

export function StaffLoginModal({ isOpen, onClose, initialBusinessCode = '', onLoginSuccess }: StaffLoginModalProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [businessCode, setBusinessCode] = useState(initialBusinessCode);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessCode || !username || !pin) return;

    try {
      setIsSubmitting(true);

      // 1. Submit Business Code + Username + 4-digit PIN to trusted server PIN endpoint
      const result = await staffPinLogin(businessCode, username, pin);

      // 2. Authenticate Firebase client using the minted custom token
      const auth = getAuth(app);
      const userCredential = await signInWithCustomToken(auth, result.customToken);

      // 3. Obtain the authenticated Firebase ID token
      const idToken = await userCredential.user.getIdToken(true);

      // 4. Fetch authoritative Cashier bootstrap
      const bootstrap = await fetchBentaBootstrap(idToken);

      // 5. Establish Cashier session in secure in-memory store
      useSecureCashierStore.getState().setBootstrap(bootstrap);

      // 6. Synchronize active tenant display state in tenant store
      useTenantStore.getState().setActiveTenant({
        id: bootstrap.tenantId,
        name: bootstrap.tenantDisplayName,
        moduleType: bootstrap.moduleId,
        ownerUid: 'staff_authenticated',
        staffUids: [bootstrap.staffAccountId],
        pricingTier: 'standard_100',
        subscriptionStatus: 'active',
        createdAt: new Date().toISOString()
      });

      toast({
        title: 'Maligayang Pagdating!',
        description: `Naka-login bilang Cashier (${bootstrap.cashierDisplayName}) sa ${bootstrap.tenantDisplayName}.`
      });

      onClose();
      if (onLoginSuccess) {
        onLoginSuccess();
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      try {
        const auth = getAuth(app);
        if (auth.currentUser) {
          await signOut(auth);
        }
      } catch {
        // Ignore signout cleanup errors
      }
      useSecureCashierStore.getState().clearCashierSession();
      useTenantStore.getState().reset();

      // Sanitized error message — never leak raw Firebase, server, or transaction errors
      const sanitizedMessage = (err?.status === 401 || err?.status === 403 || err?.status === 404 || err?.status === 429)
        ? (err.message || 'Maling Business Code, Username, o PIN. Paki-check at subukan muli.')
        : 'Hindi makapasok. Paki-check ang koneksyon at subukan muli.';

      toast({
        title: 'Hindi Nakapasok',
        description: sanitizedMessage,
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[400px] rounded-[24px] p-6 bg-white shadow-2xl">
        <DialogHeader className="text-center space-y-2 pb-2">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
            <UserCheck className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-black text-slate-900">Cashier / Staff Login</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 font-medium">
            Ilagay ang Business Code ng tindahan, inyong username, at 4-digit PIN.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleLogin} className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label htmlFor="staff-biz-code" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-500" /> Business Code
            </Label>
            <Input
              id="staff-biz-code"
              placeholder="e.g. DEMO123"
              value={businessCode}
              onChange={(e) => setBusinessCode(e.target.value.toUpperCase())}
              className="h-11 rounded-xl text-sm font-black uppercase tracking-widest bg-slate-50 border-slate-200"
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="staff-username" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-blue-500" /> Username
            </Label>
            <Input
              id="staff-username"
              placeholder="e.g. maria"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-11 rounded-xl text-sm font-medium bg-slate-50 border-slate-200"
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="staff-pin" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-blue-500" /> 4-Digit PIN
            </Label>
            <Input
              id="staff-pin"
              type="password"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="h-11 rounded-xl text-center text-lg font-black tracking-[0.3em] bg-slate-50 border-slate-200"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || !businessCode || !username || pin.length !== 4}
            className="w-full h-12 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all active:scale-[0.98] mt-2"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
              </span>
            ) : (
              'Pumasok sa POS'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
