import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useShift } from '@/hooks/use-shift';
import { openShift } from '@/firebase/firestore/shift-actions';
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestoreDocument } from '@/hooks/use-firestore-subscription';
import { doc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { Loader2, Coins, ArrowRight, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';
import { openBentaShift } from '@/lib/client/secure-benta-cashier-client';

interface ShiftGateProps {
  children: React.ReactNode;
  activeTab?: string;
  onGoToProfile?: () => void;
}

export function ShiftGate({ children, activeTab, onGoToProfile }: ShiftGateProps) {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const isCashier = useSecureCashierStore(state => state.isCashierAuthenticated);
  const cashierShift = useSecureCashierStore(state => state.activeShift);
  const shiftRecoveryRequired = useSecureCashierStore(state => state.shiftRecoveryRequired);

  const { db } = initializeFirebase();
  const { data: profile } = useFirestoreDocument(user && !isCashier ? doc(db, 'users', user.uid) : null);
  const { activeShift, loading } = useShift();
  const { toast } = useToast();

  const [startingCash, setStartingCash] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Owners do not need to open shifts
  const isOwner = !isCashier && (currentTenant?.ownerUid === user?.uid || profile?.role === 'owner');

  // Require shift if they are Cashier or staff, and not already on the profile tab
  const requireShift = !!user && !isOwner && !loading && (isCashier ? !cashierShift : !activeShift) && activeTab !== 'profile';

  const handleOpenShift = async () => {
    if (!currentTenant) return;
    const amount = parseFloat(startingCash);
    if (isNaN(amount) || amount < 0) {
      toast({ title: 'Maling Halaga', description: 'Pakilagay ang wastong halaga ng starting cash.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      if (isCashier && user) {
        // Secure Cashier shift opening flow via trusted server endpoint
        const startingCashCentavos = Math.round(amount * 100);
        const idempotencyKey = useSecureCashierStore.getState().getOrCreateShiftOpenKey();
        const idToken = await user.getIdToken();
        const result = await openBentaShift(idToken, idempotencyKey, startingCashCentavos);

        const shiftId = result.shiftId || (result as any).id;
        useSecureCashierStore.getState().setActiveShift({
          id: shiftId,
          moduleId: 'benta-snap',
          status: 'open',
          startingCashCentavos: result.startingCashCentavos,
          openedAt: result.openedAt
        });
        useSecureCashierStore.getState().resetShiftOpenKey();

        toast({
          title: 'Shift Nagsimula na',
          description: `Starting cash: ₱${(result.startingCashCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
        });
      } else if (user) {
        // Owner/legacy staff flow
        const effectiveStaffId = user.uid;
        const effectiveStaffName = profile?.fullName || user.displayName || user.email || 'Staff';
        await openShift(currentTenant.id, effectiveStaffId, effectiveStaffName, amount);
        toast({ title: 'Shift Started', description: `Starting cash: ₱${amount.toLocaleString()}`, variant: 'default' });
      }
    } catch (err: any) {
      if (err?.category === 'shift_recovery_required' || err?.message?.toLowerCase().includes('recovery')) {
        useSecureCashierStore.getState().setShiftRecoveryRequired(true);
      }
      toast({ title: 'Error sa Pagbukas ng Shift', description: err.message || 'Hindi masimulan ang shift', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {children}

      {/* Recovery Required Alert Modal */}
      <Dialog open={isCashier && shiftRecoveryRequired && activeTab !== 'profile'} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md rounded-[24px] [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="mx-auto w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-2">
              <AlertTriangle className="h-8 w-8 text-rose-600" />
            </div>
            <DialogTitle className="text-xl font-black text-center text-slate-800">Kailangan ng Tulong sa Shift</DialogTitle>
            <DialogDescription className="text-center text-slate-500 font-medium">
              May hindi natapos o nagkasabay na shift ang inyong account. Makipag-ugnayan sa Store Owner upang ma-check at maayos ang inyong shift record.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {onGoToProfile && (
              <Button
                onClick={onGoToProfile}
                className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold"
              >
                Pumunta sa Profile
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Normal Shift Opening Modal */}
      <Dialog open={requireShift && !shiftRecoveryRequired} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md rounded-[24px] [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-2">
              <Coins className="h-8 w-8 text-amber-600" />
            </div>
            <DialogTitle className="text-xl font-black text-center text-slate-800">Buksan ang Kaha (Open Register)</DialogTitle>
            <DialogDescription className="text-center text-slate-500 font-medium">
              Bago ka magsimula ng shift, pakilagay ang cash na nasa kaha natin ngayon.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Starting Cash (₱)</label>
              <Input
                type="number"
                placeholder="e.g. 500"
                value={startingCash}
                onChange={(e) => setStartingCash(e.target.value)}
                className="h-14 text-center text-2xl font-black rounded-2xl border-slate-200"
              />
            </div>

            <Button
              onClick={handleOpenShift}
              disabled={submitting || !startingCash}
              className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Simulan ang Shift'}
            </Button>

            {onGoToProfile && (
              <button
                onClick={onGoToProfile}
                className="w-full text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest flex items-center justify-center gap-1 mt-2"
              >
                Pumunta sa Profile <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
