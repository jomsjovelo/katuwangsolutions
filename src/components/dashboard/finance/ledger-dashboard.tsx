"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { addTransaction } from '@/firebase/firestore/finance-actions';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, limit, getFirestore } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase/index';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp,
  Loader2,
  AlertCircle
} from "lucide-react";

export function LedgerDashboard() {
  const { currentTenant } = useTenant();
  const db = getFirestore(initializeFirebase().app, 'katuwang');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamically resolve Katuwang industry theme based on active tenant's moduleType
  const theme = getModuleTheme(currentTenant?.moduleType);
  
  // Immersive dynamic status bar viewport tracking for PWA Android/iOS notch
  useDynamicThemeColor(theme);

  // Live stream of recent transactions
  const txQuery = currentTenant 
    ? query(
        collection(db, 'tenants', currentTenant.id, 'transactions'),
        orderBy('createdAt', 'desc'),
        limit(20)
      )
    : null;

  const [txSnapshot, loading, hookError] = useCollection(txQuery as any);
  
  // Real-time calculated balances
  let totalIncome = 0;
  let totalExpense = 0;
  
  const transactions = txSnapshot?.docs.map((doc: any) => {
    const data = doc.data();
    if (data.type === 'income') totalIncome += data.amount;
    if (data.type === 'expense') totalExpense += data.amount;
    return {
      id: doc.id,
      ...data
    };
  }) || [];

  const netProfit = totalIncome - totalExpense;

  const handleQuickAdd = async (type: 'income' | 'expense') => {
    if (!currentTenant) return;
    try {
      setIsProcessing(true);
      setError(null);
      const amount = type === 'income' ? 500000 : 150000; // Mock: 5k income or 1.5k expense
      const desc = type === 'income' ? 'Store Sales' : 'Electric Bill';
      await addTransaction(currentTenant.id, amount, type, desc);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50">
      <main className="p-4 space-y-6 pb-20">
        
        {/* Header Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-headline font-bold">Ledger Flow</h3>
              <p className="text-xs text-muted-foreground font-medium">{theme.name} • {currentTenant?.name || 'Business Accounting'}</p>
            </div>
            <Badge 
              className="border-transparent text-[9px] font-black uppercase"
              style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
            >
              Live DB
            </Badge>
          </div>
        </section>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Master Balance Card Styled Dynamically with Active Module Gradient & Glow */}
        <Card 
          className={cn(
            "text-white border-none shadow-xl relative overflow-hidden bg-gradient-to-br transition-all duration-500",
            theme.primaryBg,
            theme.glowClass
          )}
        >
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
          <div className="absolute -left-6 -bottom-6 h-32 w-32 rounded-full bg-white/5" />
          
          <CardHeader className="p-4 pb-2 relative z-10">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-white/70">Net Profit</CardDescription>
            <CardTitle className="text-4xl font-black font-headline tracking-tighter">
              ₱{(netProfit / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 relative z-10">
            <div className="flex items-center gap-1 text-[10px] font-bold text-white uppercase tracking-widest mt-2">
              <TrendingUp className="h-3 w-3" /> Double-Entry Ledger Engine
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-white border-emerald-100 shadow-sm">
            <CardHeader className="p-3 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Total Income</CardDescription>
              <CardTitle className="text-lg font-black text-slate-800">₱{(totalIncome / 100).toLocaleString('en-PH')}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="h-1 w-full bg-emerald-100 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-emerald-500 w-full" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-red-100 shadow-sm">
            <CardHeader className="p-3 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-red-500">Total Expense</CardDescription>
              <CardTitle className="text-lg font-black text-slate-800">₱{(totalExpense / 100).toLocaleString('en-PH')}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="h-1 w-full bg-red-100 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-red-500" style={{ width: `${(totalExpense / (totalIncome || 1)) * 100}%` }} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Fast Action Buttons */}
        <div className="flex gap-3">
          <Button 
            onClick={() => handleQuickAdd('income')} 
            disabled={isProcessing}
            className="flex-1 rounded-xl h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all border-none"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownRight className="mr-2 h-4 w-4" />} 
            Add ₱5k Income
          </Button>
          <Button 
            onClick={() => handleQuickAdd('expense')}
            disabled={isProcessing}
            variant="outline" 
            className="flex-1 rounded-xl h-12 font-bold border-red-200 text-red-600 hover:bg-red-50 active:scale-95 transition-all"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="mr-2 h-4 w-4" />} 
            Add ₱1.5k Expense
          </Button>
        </div>

        {/* Transaction History */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Live DB Transactions</h3>
            <Button 
              variant="link" 
              className="font-bold text-xs p-0"
              style={{ color: theme.primary }}
            >
              View All
            </Button>
          </div>
          
          <div className="grid gap-2">
            {loading && <div className="text-center py-4 text-xs text-slate-400">Loading stream...</div>}
            {!loading && transactions.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-400 border-2 border-dashed rounded-xl">No transactions found.</div>
            )}
            
            {transactions.map((t: any) => (
              <div key={t.id} className="bg-white border border-slate-100 shadow-sm rounded-xl p-3 flex items-center justify-between active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg", 
                    t.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                  )}>
                    {t.type === 'income' ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{t.description}</h4>
                    <p className="text-[10px] text-slate-400 font-medium">Just now</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn(
                    "text-sm font-black font-headline", 
                    t.type === 'income' ? "text-emerald-600" : "text-slate-800"
                  )}>
                    {t.type === 'income' ? '+' : '-'}₱{(t.amount / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
