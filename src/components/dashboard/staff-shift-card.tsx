import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Coins, Loader2, Clock, CheckCircle } from 'lucide-react';
import { useShift } from '@/hooks/use-shift';
import { closeShift } from '@/firebase/firestore/shift-actions';
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestoreDocument } from '@/hooks/use-firestore-subscription';
import { doc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

export function StaffShiftCard() {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const { db } = initializeFirebase();
  const { data: profile } = useFirestoreDocument(user ? doc(db, 'users', user.uid) : null);
  const { activeShift, loading } = useShift();
  const { toast } = useToast();
  
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [endingCash, setEndingCash] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isOwner = currentTenant?.ownerUid === user?.uid || profile?.role === 'owner';
  
  // Only show this to staff
  if (isOwner || loading) return null;

  const handleCloseShift = async () => {
    if (!currentTenant || !user || !profile || !activeShift) return;
    
    const amount = parseFloat(endingCash);
    if (isNaN(amount) || amount < 0) {
      toast({ title: 'Invalid amount', description: 'Please enter a valid ending cash amount.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      await closeShift(
        currentTenant.id,
        activeShift.id,
        user.uid,
        profile.fullName || user.email || 'Staff',
        amount
      );
      toast({ title: 'Shift Closed', description: `Ending cash logged: ₱${amount.toLocaleString()}` });
      setCloseModalOpen(false);
      setEndingCash('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to close shift', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className="bg-white border-slate-200 shadow-sm rounded-[24px] overflow-hidden">
        <CardHeader className="p-4 pb-2 border-b border-slate-50">
          <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Shift Management
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {activeShift ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="h-10 w-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-800">Shift Active</h4>
                  <p className="text-[10px] text-emerald-600 font-semibold">
                    Started at {activeShift.openedAt?.toDate?.().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              
              <div className="flex justify-between items-center px-2">
                <span className="text-xs font-bold text-slate-500 uppercase">Starting Cash</span>
                <span className="text-sm font-black text-slate-800">₱{(activeShift.startingCash / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              
              <Button 
                onClick={() => setCloseModalOpen(true)}
                className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold"
              >
                Close Shift (Log Out)
              </Button>
            </div>
          ) : (
            <div className="text-center py-4 space-y-2">
              <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                <Clock className="h-6 w-6 text-slate-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">No Active Shift</h4>
              <p className="text-xs text-slate-500">Go to any dashboard tab to open a shift.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={closeModalOpen} onOpenChange={setCloseModalOpen}>
        <DialogContent className="sm:max-w-md rounded-[24px]">
          <DialogHeader>
            <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-2">
              <Coins className="h-8 w-8 text-blue-500" />
            </div>
            <DialogTitle className="text-xl font-black text-center text-slate-800">Close Register</DialogTitle>
            <DialogDescription className="text-center text-slate-500 font-medium">
              Bago mag-logout, bilangin ang physical cash sa kaha.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Ending Cash (₱)</label>
              <Input 
                type="number" 
                placeholder="Total Cash on Hand" 
                value={endingCash}
                onChange={(e) => setEndingCash(e.target.value)}
                className="h-14 text-center text-2xl font-black rounded-2xl border-slate-200"
              />
            </div>
            
            <Button 
              onClick={handleCloseShift} 
              disabled={submitting || !endingCash}
              className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Isara ang Shift'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
