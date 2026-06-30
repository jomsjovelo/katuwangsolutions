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
import { Loader2, Coins, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ShiftGateProps {
  children: React.ReactNode;
  activeTab?: string;
  onGoToProfile?: () => void;
}

export function ShiftGate({ children, activeTab, onGoToProfile }: ShiftGateProps) {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const { db } = initializeFirebase();
  const { data: profile } = useFirestoreDocument(user ? doc(db, 'users', user.uid) : null);
  const { activeShift, loading } = useShift();
  const { toast } = useToast();
  
  const [startingCash, setStartingCash] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Owners do not need to open shifts (for now)
  const isOwner = currentTenant?.ownerUid === user?.uid || profile?.role === 'owner';
  
  // Only require shift if they are staff, and not already on the profile tab
  const isStaff = !isOwner && profile?.role === 'staff';
  const requireShift = isStaff && !loading && !activeShift && activeTab !== 'profile';

  const handleOpenShift = async () => {
    if (!currentTenant || !user || !profile) return;
    const amount = parseFloat(startingCash);
    if (isNaN(amount) || amount < 0) {
      toast({ title: 'Invalid amount', description: 'Please enter a valid starting cash amount.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      await openShift(currentTenant.id, user.uid, profile.fullName || user.email || 'Staff', amount);
      toast({ title: 'Shift Started', description: `Starting cash: ₱${amount.toLocaleString()}`, variant: 'default' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to open shift', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {children}
      
      <Dialog open={requireShift} onOpenChange={() => {}}>
        {/* Empty onOpenChange prevents clicking outside to close */}
        <DialogContent className="sm:max-w-md rounded-[24px] [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-2">
              <Coins className="h-8 w-8 text-amber-600" />
            </div>
            <DialogTitle className="text-xl font-black text-center text-slate-800">Open Register</DialogTitle>
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
                Back to Profile <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
