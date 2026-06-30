import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/app/lib/tenant-context';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { ShiftRecord } from '@/firebase/firestore/shift-actions';
import { Clock, ShieldAlert, CheckCircle, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getModuleTheme } from '@/lib/theme-utils';

export function StaffShiftsReport() {
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTenant) return;

    const fetchShifts = async () => {
      try {
        const { db } = initializeFirebase();
        const shiftsRef = collection(db, 'tenants', currentTenant.id, 'shifts');
        // Fetch last 10 shifts
        const q = query(shiftsRef, orderBy('openedAt', 'desc'), limit(10));
        const snap = await getDocs(q);
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftRecord));
        setShifts(fetched);
      } catch (err) {
        console.error("Failed to fetch shifts:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchShifts();
  }, [currentTenant]);

  if (loading) {
    return <div className="py-8 text-center text-xs text-slate-400">Loading shift data...</div>;
  }

  return (
    <section className="space-y-3.5">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-slate-400" style={{ color: theme.primary }} />
        <h3 className="text-base font-headline font-black text-slate-800">Staff Shifts & Cash</h3>
      </div>

      <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
        <CardHeader className="p-5 pb-3">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Cash Reconciliation</span>
              <CardTitle className="text-sm font-headline font-black text-slate-800 mt-1">
                Recent Shifts
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-2">
          {shifts.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed border-slate-100 rounded-2xl">
              <Clock className="h-8 w-8 mx-auto mb-2 text-slate-200" />
              <p className="text-xs text-slate-400 font-medium">No shifts recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {shifts.map((shift) => {
                const isClosed = shift.status === 'closed';
                const discrepancy = shift.discrepancy || 0;
                const isShort = discrepancy < 0;
                const isOver = discrepancy > 0;
                const isPerfect = discrepancy === 0;

                return (
                  <div key={shift.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">{shift.staffName}</h4>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium mt-0.5">
                          <Clock className="h-3 w-3" />
                          <span>
                            {shift.openedAt?.toDate?.().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                          {isClosed && (
                            <>
                              <span>→</span>
                              <span>
                                {shift.closedAt?.toDate?.().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className={cn(
                        "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border-none",
                        isClosed ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700"
                      )}>
                        {isClosed ? 'Closed' : 'Active'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                      <div>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Start Cash</span>
                        <p className="text-xs font-black text-slate-700">₱{(shift.startingCash / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                      
                      {isClosed && (
                        <div>
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">End Cash</span>
                          <p className="text-xs font-black text-slate-700">₱{((shift.endingCash || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                      )}
                    </div>

                    {isClosed && (
                      <div className={cn(
                        "p-2 rounded-xl flex items-center justify-between",
                        isPerfect ? "bg-emerald-50 border border-emerald-100" :
                        isShort ? "bg-red-50 border border-red-100" :
                        "bg-amber-50 border border-amber-100"
                      )}>
                        <div className="flex items-center gap-1.5">
                          {isPerfect ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <ShieldAlert className={cn("h-4 w-4", isShort ? "text-red-500" : "text-amber-500")} />}
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest",
                            isPerfect ? "text-emerald-700" : isShort ? "text-red-700" : "text-amber-700"
                          )}>
                            {isPerfect ? 'Balanced' : isShort ? 'Short (Kulang)' : 'Over (Sobra)'}
                          </span>
                        </div>
                        {!isPerfect && (
                          <span className={cn(
                            "text-sm font-black",
                            isShort ? "text-red-600" : "text-amber-600"
                          )}>
                            {isShort ? '-' : '+'}₱{Math.abs(discrepancy / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
