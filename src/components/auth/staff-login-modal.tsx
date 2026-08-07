'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { verifyStaffLogin } from '@/firebase/firestore/staff-pin-actions';
import { useStaffSession } from '@/store/use-staff-session';
import { useRouter } from 'next/navigation';
import { UserCheck, KeyRound, Building2, Loader2, Store } from 'lucide-react';

interface StaffLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBusinessCode?: string;
}

export function StaffLoginModal({ isOpen, onClose, initialBusinessCode = '' }: StaffLoginModalProps) {
  const { toast } = useToast();
  const router = useRouter();
  const setStaffSession = useStaffSession(state => state.setStaffSession);

  const [businessCode, setBusinessCode] = useState(initialBusinessCode);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessCode || !username || !pin) return;

    try {
      setIsSubmitting(true);
      const result = await verifyStaffLogin(businessCode, username, pin);

      setStaffSession({
        tenantId: result.tenantId,
        staffAccountId: result.staffAccount.id,
        username: result.staffAccount.username,
        tenantName: result.tenantName || 'Store',
        moduleType: result.moduleType || 'benta-snap'
      });

      toast({
        title: 'Maligayang Pagdating!',
        description: `Naka-login bilang Cashier (${result.staffAccount.username}) sa ${result.tenantName}.`
      });

      onClose();
      router.push('/dashboard');
    } catch (err: any) {
      toast({
        title: 'Hindi Nakapasok',
        description: err.message || 'Maling impormasyon. Subukan muli.',
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
