import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Coins, Loader2, Clock, CheckCircle, Receipt, ArrowRight } from 'lucide-react';
import { useShift } from '@/hooks/use-shift';
import { closeShift } from '@/firebase/firestore/shift-actions';
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestoreDocument } from '@/hooks/use-firestore-subscription';
import { doc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';
import { reconcileAndCloseShift, ShiftReconciliationSummary } from '@/lib/client/secure-benta-cashier-client';

export function StaffShiftCard() {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const isCashier = useSecureCashierStore(state => state.isCashierAuthenticated);
  const cashierShift = useSecureCashierStore(state => state.activeShift);

  const { db } = initializeFirebase();
  const { data: profile } = useFirestoreDocument(user && !isCashier ? doc(db, 'users', user.uid) : null);
  const { activeShift, loading } = useShift();
  const { toast } = useToast();
  
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [reconciliation, setReconciliation] = useState<ShiftReconciliationSummary | null>(null);
  const [endingCash, setEndingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isOwner = !isCashier && (currentTenant?.ownerUid === user?.uid || profile?.role === 'owner');
  
  // Only show this to staff / cashiers
  if (isOwner || loading) return null;

  const currentActiveShift = isCashier ? cashierShift : activeShift;

  const handleCloseShift = async () => {
    const activeCashierShift = useSecureCashierStore.getState().activeShift;
    const effectiveShift = isCashier ? (activeCashierShift || cashierShift) : activeShift;
    if (!currentTenant || !user || !effectiveShift) return;
    
    const amount = parseFloat(endingCash);
    if (isNaN(amount) || amount < 0) {
      toast({ title: 'Maling Halaga', description: 'Pakilagay ang wastong bilang ng ending cash.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      if (isCashier) {
        // Secure Cashier shift reconciliation via trusted server endpoint
        const endingCashCentavos = Math.round(amount * 100);
        const idToken = await user.getIdToken();
        const summary = await reconcileAndCloseShift(idToken, effectiveShift.id, endingCashCentavos, notes);

        useSecureCashierStore.getState().setActiveShift(null);
        useSecureCashierStore.getState().setReconciliationSummary(summary);
        setReconciliation(summary);
        setCloseModalOpen(false);
        setSummaryModalOpen(true);
        setEndingCash('');
        setNotes('');

        toast({
          title: 'Shift Naisara',
          description: `Naitala ang ending cash na ₱${(summary.endingCashCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`
        });
      } else {
        // Owner/legacy flow
        await closeShift(
          currentTenant.id,
          effectiveShift.id,
          user.uid,
          profile?.fullName || user.email || 'Staff',
          amount
        );
        toast({ title: 'Shift Closed', description: `Ending cash logged: ₱${amount.toLocaleString()}` });
        setCloseModalOpen(false);
        setEndingCash('');
      }
    } catch (err: any) {
      toast({ title: 'Error sa Pagsasara ng Shift', description: err.message || 'Hindi maisara ang shift', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const startingCashDisplay = isCashier
    ? ((cashierShift?.startingCashCentavos || 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })
    : ((activeShift?.startingCash || 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 });

  return (
    <>
      <Card className="bg-white border-slate-200 shadow-sm rounded-[24px] overflow-hidden">
        <CardHeader className="p-4 pb-2 border-b border-slate-50">
          <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Shift Management
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {currentActiveShift ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="h-10 w-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-800">Shift Active</h4>
                  <p className="text-[10px] text-emerald-600 font-semibold">
                    {isCashier && cashierShift?.openedAt
                      ? `Bukas simula ${new Date(cashierShift.openedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                      : activeShift?.openedAt?.toDate?.()
                        ? `Started at ${activeShift.openedAt.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                        : 'Shift is open'}
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center px-2">
                <span className="text-xs font-bold text-slate-500 uppercase">Starting Cash</span>
                <span className="text-sm font-black text-slate-800">₱{startingCashDisplay}</span>
              </div>

              <Button
                onClick={() => setCloseModalOpen(true)}
                className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold"
              >
                Isara ang Shift (Close Register)
              </Button>
            </div>
          ) : (
            <div className="text-center py-4 space-y-2">
              <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                <Clock className="h-6 w-6 text-slate-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">Walang Bukas na Shift</h4>
              <p className="text-xs text-slate-500">Pumunta sa POS tab upang magbukas ng shift.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Close Shift Dialog */}
      <Dialog open={closeModalOpen} onOpenChange={setCloseModalOpen}>
        <DialogContent className="sm:max-w-md rounded-[24px]">
          <DialogHeader>
            <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-2">
              <Coins className="h-8 w-8 text-blue-500" />
            </div>
            <DialogTitle className="text-xl font-black text-center text-slate-800">Isara ang Kaha (Close Register)</DialogTitle>
            <DialogDescription className="text-center text-slate-500 font-medium">
              Bago isara ang shift, bilangin ang aktwal na physical cash na hawak sa kaha.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Ending Physical Cash (₱)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={endingCash}
                onChange={(e) => setEndingCash(e.target.value)}
                className="h-14 text-center text-2xl font-black rounded-2xl border-slate-200"
              />
            </div>

            {isCashier && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Notes (Opsiyonal)</label>
                <Input
                  placeholder="e.g. Sobra ang barya / Palit barya"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-11 rounded-xl text-sm border-slate-200"
                />
              </div>
            )}

            <Button
              onClick={handleCloseShift}
              disabled={submitting || !endingCash}
              className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Kumpirmahin at Isara'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shift Reconciliation Summary Dialog */}
      {reconciliation && (
        <Dialog open={summaryModalOpen} onOpenChange={setSummaryModalOpen}>
          <DialogContent className="sm:max-w-md rounded-[24px] p-6 bg-white shadow-2xl">
            <DialogHeader className="text-center space-y-1 pb-2">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-1">
                <Receipt className="w-6 h-6" />
              </div>
              <DialogTitle className="text-xl font-black text-slate-900">Ulat ng Pagsasara (Reconciliation)</DialogTitle>
              <DialogDescription className="text-xs text-slate-500 font-medium">
                Buod ng benta at kaha para sa natapos na shift.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-sm">
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2 border border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold text-xs">Starting Cash</span>
                  <span className="font-bold text-slate-800">₱{(reconciliation.startingCashCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold text-xs">Cash Sales</span>
                  <span className="font-bold text-slate-800">₱{(reconciliation.cashSales / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold text-xs">GCash Sales</span>
                  <span className="font-bold text-slate-800">₱{(reconciliation.gcashSales / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold text-xs">Maya Sales</span>
                  <span className="font-bold text-slate-800">₱{(reconciliation.mayaSales / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between">
                  <span className="font-black text-slate-900 text-xs uppercase">Kabuuan ng Benta ({reconciliation.saleCount} sales)</span>
                  <span className="font-black text-emerald-600">₱{(reconciliation.totalShiftSales / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="bg-blue-50 rounded-2xl p-4 space-y-2 border border-blue-100">
                <div className="flex justify-between">
                  <span className="text-blue-900 font-bold text-xs">Inaasahang Cash sa Kaha</span>
                  <span className="font-bold text-blue-900">₱{(reconciliation.expectedPhysicalCashCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-900 font-bold text-xs">Aktwal na Cash na Binilang</span>
                  <span className="font-bold text-blue-900">₱{(reconciliation.endingCashCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="border-t border-blue-200 pt-2 flex justify-between items-center">
                  <span className="font-black text-blue-950 text-xs uppercase">Discrepancy (Sobra/Kulang)</span>
                  <span className={`font-black px-2 py-0.5 rounded-lg text-xs ${
                    reconciliation.discrepancyCentavos === 0
                      ? 'bg-emerald-100 text-emerald-700'
                      : reconciliation.discrepancyCentavos > 0
                        ? 'bg-blue-200 text-blue-800'
                        : 'bg-rose-100 text-rose-700'
                  }`}>
                    {reconciliation.discrepancyCentavos === 0
                      ? 'Sakto (₱0.00)'
                      : `${reconciliation.discrepancyCentavos > 0 ? '+' : ''}₱${(reconciliation.discrepancyCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                  </span>
                </div>
              </div>

              <Button
                onClick={() => setSummaryModalOpen(false)}
                className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold mt-2"
              >
                Tapusin
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
