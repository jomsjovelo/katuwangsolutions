'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { logAttendance } from '@/firebase/firestore/staff-actions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, LogIn, LogOut, Clock, Loader2, Users } from 'lucide-react';

interface TimeInOutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TimeInOutModal({ isOpen, onClose }: TimeInOutModalProps) {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();

  const [employees, setEmployees] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingEmps, setLoadingEmps] = useState(true);

  useEffect(() => {
    if (!isOpen || !currentTenant) return;

    const empQ = query(
      collection(db, 'tenants', currentTenant.id, 'employees'),
      orderBy('createdAt', 'desc')
    );
    const unsubEmps = onSnapshot(empQ, (snap) => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((e: any) => e.isActive !== false));
      setLoadingEmps(false);
    });

    const logsQ = query(
      collection(db, 'tenants', currentTenant.id, 'attendance'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsubLogs = onSnapshot(logsQ, (snap) => {
      setRecentLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubEmps();
      unsubLogs();
    };
  }, [isOpen, currentTenant, db]);

  const handleLog = async (type: 'time_in' | 'time_out') => {
    if (!selectedEmp || !currentTenant) return;
    setIsProcessing(true);
    try {
      await logAttendance(currentTenant.id, selectedEmp.id, selectedEmp.name, type);
      toast({
        title: type === 'time_in' ? `✅ Time-In Logged` : `👋 Time-Out Logged`,
        description: `${selectedEmp.name} ${type === 'time_in' ? 'started their shift' : 'ended their shift'}. ${type === 'time_out' ? '+1 day added to payroll.' : ''}`
      });
      setSelectedEmp(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const formatTime = (ts: any) => {
    if (!ts?.seconds) return '—';
    return new Date(ts.seconds * 1000).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center p-0 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-t-[32px] flex flex-col max-h-[80vh] animate-in slide-in-from-bottom duration-300 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-headline font-black text-slate-900 text-sm">Staff Time-In / Time-Out</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Select staff to log</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer border-none">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4 pb-safe">
          {/* Employee Selector */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Select Staff Member</p>
            {loadingEmps ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : employees.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-2xl">
                <Users className="h-6 w-6 mx-auto text-slate-300 mb-1" />
                <p className="text-xs text-slate-400 font-bold">No employees added yet.</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Add staff in Sahod Flow first.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {employees.map((emp: any) => (
                  <button
                    key={emp.id}
                    onClick={() => setSelectedEmp(selectedEmp?.id === emp.id ? null : emp)}
                    className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                      selectedEmp?.id === emp.id
                        ? 'border-primary bg-primary/5'
                        : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center font-black text-sm text-slate-600 mb-1.5">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="text-xs font-black text-slate-800 truncate">{emp.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{emp.position || 'Staff'}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {selectedEmp && (
            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <Button
                onClick={() => handleLog('time_in')}
                disabled={isProcessing}
                className="h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold flex items-center gap-2"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Time-In
              </Button>
              <Button
                onClick={() => handleLog('time_out')}
                disabled={isProcessing}
                variant="outline"
                className="h-12 rounded-xl border-slate-200 text-slate-700 font-bold flex items-center gap-2"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Time-Out
              </Button>
            </div>
          )}

          {/* Recent Logs */}
          {recentLogs.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Today's Log</p>
              <div className="space-y-1.5">
                {recentLogs.map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${log.type === 'time_in' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <p className="text-xs font-bold text-slate-700">{log.employeeName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black uppercase ${log.type === 'time_in' ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {log.type === 'time_in' ? 'IN' : 'OUT'}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatTime(log.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
