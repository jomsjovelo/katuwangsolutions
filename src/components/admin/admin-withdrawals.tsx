"use client"

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy,
  where
} from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { markWithdrawalPaid } from '@/firebase/firestore/referral-withdrawal-actions';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, CheckCircle2, Clock, Check, Loader2 } from "lucide-react";

export function AdminWithdrawals() {
  const db = useFirestore();
  const { user } = useUser();
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [filter, setFilter] = useState<'pending' | 'paid'>('pending');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'referral_withdrawals'),
      where('status', '==', filter),
      orderBy('requestedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWithdrawals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubscribe();
  }, [db, filter]);

  const handleMarkPaid = async (id: string) => {
    if (!user?.email) return;
    setLoadingId(id);
    try {
      await markWithdrawalPaid(id, user.email);
    } catch (err) {
      console.error("Failed to mark paid", err);
      alert("Failed to mark as paid");
    } finally {
      setLoadingId(null);
    }
  };

  const totalPendingPesos = withdrawals.reduce((sum, w) => sum + (w.amountPesos || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-headline font-black text-slate-800 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-emerald-500" />
            Referral Withdrawals
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Process requested payouts for owners and staff
          </p>
        </div>
        {filter === 'pending' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">Total Pending</p>
            <p className="text-xl font-black text-amber-600">₱{totalPendingPesos.toFixed(2)}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${
            filter === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          Pending ({filter === 'pending' ? withdrawals.length : '...'})
        </button>
        <button
          onClick={() => setFilter('paid')}
          className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${
            filter === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          Paid
        </button>
      </div>

      {withdrawals.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <CheckCircle2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-600">No {filter} requests</h3>
          <p className="text-sm text-slate-500">You're all caught up!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {withdrawals.map(w => (
            <Card key={w.id} className="bg-white shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-800">{w.ownerName}</h3>
                    <p className="text-xs text-slate-500">{w.ownerEmail}</p>
                    <Badge variant="secondary" className="mt-1 bg-slate-100 text-slate-600 text-[10px] uppercase">
                      {w.role} @ {w.tenantName}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-emerald-600">₱{w.amountPesos?.toFixed(2)}</p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Send via {w.paymentMethod}</p>
                  <p className="font-mono text-lg font-bold text-slate-800">{w.accountNumber}</p>
                  <p className="text-xs font-medium text-slate-600">{w.accountName}</p>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> 
                    {w.requestedAt?.seconds ? new Date(w.requestedAt.seconds * 1000).toLocaleString() : 'Recent'}
                  </span>
                </div>

                {filter === 'pending' && (
                  <Button 
                    onClick={() => handleMarkPaid(w.id)}
                    disabled={loadingId === w.id}
                    className="w-full font-bold bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    {loadingId === w.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                    Mark as Paid
                  </Button>
                )}

                {filter === 'paid' && w.processedBy && (
                  <div className="bg-emerald-50 text-emerald-700 text-xs font-bold p-2 rounded-lg text-center flex flex-col gap-1">
                    <span className="flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" /> Paid</span>
                    <span className="text-[10px] font-medium text-emerald-600">by {w.processedBy}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
