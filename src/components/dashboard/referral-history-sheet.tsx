import React, { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase/provider';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot 
} from 'firebase/firestore';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Users, Loader2 } from 'lucide-react';
import { getModuleTheme } from '@/lib/theme-utils';

interface ReferralHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uid: string;
  moduleType?: string;
}

export function ReferralHistorySheet({ open, onOpenChange, uid, moduleType }: ReferralHistorySheetProps) {
  const db = useFirestore();
  const theme = getModuleTheme(moduleType);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!open || !uid) return;

    setIsLoading(true);
    const historyRef = collection(db, 'users', uid, 'referral_history');
    // Fetch up to 100 recent transactions to keep it fast but comprehensive
    const q = query(historyRef, orderBy('creditedAt', 'desc'), limit(100));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setIsLoading(false);
    }, (err) => {
      console.error("Failed to load referral history:", err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [open, uid, db]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl sm:max-w-md sm:h-[100vh] sm:rounded-none sm:side-right flex flex-col p-0 overflow-hidden">
        <div className="h-2 bg-gradient-to-r shrink-0" style={{ backgroundImage: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }} />
        
        <SheetHeader className="p-6 pb-4 shrink-0 border-b border-slate-100 bg-white">
          <SheetTitle className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Users className="h-5 w-5" style={{ color: theme.primary }} />
            Full Referral History
          </SheetTitle>
          <SheetDescription className="text-xs font-medium text-slate-500">
            A comprehensive list of your recent referral earnings. Displaying up to the last 100 transactions.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-xs font-bold uppercase tracking-widest">Loading History...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 opacity-50">
              <Users className="h-10 w-10 mb-2" />
              <p className="text-sm font-bold">No referrals yet</p>
              <p className="text-[10px]">Share your link to start earning!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((ref) => (
                <div key={ref.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{ref.referredTenantName || 'Unknown Store'}</p>
                    <p className="text-[11px] text-slate-500 font-medium capitalize mt-0.5">
                      {ref.type} &bull; {ref.creditedAt?.seconds ? new Date(ref.creditedAt.seconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Just now'}
                    </p>
                  </div>
                  <div className="text-lg font-black text-emerald-600">
                    +₱{ref.amountEarned?.toFixed(2) || '0.00'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
