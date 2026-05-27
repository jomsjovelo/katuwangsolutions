"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { addTransaction } from '@/firebase/firestore/finance-actions';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, limit, getFirestore } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase/index';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowDownLeft, 
  ArrowUpRight,
  BookText,
  Plus,
  Loader2,
  TrendingUp,
  TrendingDown
} from "lucide-react";

const INCOME_CATEGORIES = ['Sales', 'Service', 'Collection', 'Other Income'];
const EXPENSE_CATEGORIES = ['Supplies', 'Utilities', 'Rent', 'Salary', 'Food', 'Transport', 'Other Expense'];

function formatTimestamp(val: any): string {
  if (!val) return '';
  try {
    const date = val.toDate ? val.toDate() : new Date(val);
    return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) +
      ' · ' + date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function LedgerDashboard() {
  const { currentTenant } = useTenant();
  const db = getFirestore(initializeFirebase().app, 'katuwang');
  const { toast } = useToast();

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Live stream of recent transactions
  const txQuery = currentTenant 
    ? query(
        collection(db, 'tenants', currentTenant.id, 'transactions'),
        orderBy('createdAt', 'desc'),
        limit(50)
      )
    : null;
  const [txSnapshot, loading] = useCollection(txQuery as any);

  let totalIncome = 0;
  let totalExpense = 0;
  const transactions = txSnapshot?.docs.map((doc: any) => {
    const data = doc.data();
    if (data.type === 'income') totalIncome += data.amount;
    if (data.type === 'expense') totalExpense += data.amount;
    return { id: doc.id, ...data };
  }) || [];
  const cashBalance = totalIncome - totalExpense;

  // --- Add Entry Form ---
  const [showForm, setShowForm] = useState(false);
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const categories = entryType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // Reset category when toggling entry type
  const switchType = (type: 'income' | 'expense') => {
    setEntryType(type);
    setCategory('');
  };

  const handleSave = async () => {
    if (!currentTenant || !amount || Number(amount) <= 0) return;
    setIsSaving(true);
    try {
      await addTransaction(
        currentTenant.id,
        Math.round(Number(amount) * 100), // pesos to centavos safely
        entryType,
        description.trim() || category || (entryType === 'income' ? 'Income' : 'Expense'),
        category
      );
      setAmount('');
      setCategory('');
      setDescription('');
      setShowForm(false);
      toast({
        title: entryType === 'income' ? '💰 Kita na-record!' : '📝 Gastos na-record!',
        description: `₱${Number(amount).toLocaleString()} — ${category || description || 'Entry saved'}`
      });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      <main className="p-4 space-y-4 pb-24">

        {/* Header */}
        <section className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              <BookText className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Books'}</h3>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Ledger Flow</p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 w-8 rounded-full p-0 text-white"
            style={{ backgroundColor: theme.primary }}
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </section>

        {/* Add Entry Form */}
        {showForm && (
          <Card className="shadow-sm bg-white border-l-4 overflow-hidden" style={{ borderLeftColor: theme.primary }}>
            <CardContent className="p-4 space-y-3">

              {/* Income / Expense Toggle */}
              <div className="flex rounded-xl overflow-hidden border border-slate-200">
                <button
                  className={cn(
                    "flex-1 py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors",
                    entryType === 'income'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white text-slate-500 hover:bg-slate-50'
                  )}
                  onClick={() => switchType('income')}
                >
                  <ArrowDownLeft className="h-4 w-4" /> Kita (Income)
                </button>
                <button
                  className={cn(
                    "flex-1 py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors",
                    entryType === 'expense'
                      ? 'bg-rose-500 text-white'
                      : 'bg-white text-slate-500 hover:bg-slate-50'
                  )}
                  onClick={() => switchType('expense')}
                >
                  <ArrowUpRight className="h-4 w-4" /> Gastos (Expense)
                </button>
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <Label className="text-xs">Amount (₱)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 3500"
                  className="text-lg font-bold h-11"
                  value={amount}
                  onChange={e => setAmount(parseFloat(e.target.value) || '')}
                />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold border transition-colors",
                        category === cat
                          ? entryType === 'income'
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-rose-500 text-white border-rose-500'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description / Notes */}
              <div className="space-y-1">
                <Label className="text-xs">Notes (Optional)</Label>
                <Input
                  placeholder="e.g. Breakfast orders, Electric bill..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <Button
                className="w-full h-10 font-bold text-white"
                style={{
                  backgroundColor: entryType === 'income' ? '#10B981' : '#F43F5E',
                }}
                onClick={handleSave}
                disabled={isSaving || !amount || Number(amount) <= 0}
              >
                {isSaving
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                  : `Save ${entryType === 'income' ? 'Income' : 'Expense'} — ₱${Number(amount || 0).toLocaleString()}`
                }
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Cash Balance Hero Card */}
        <Card className={cn(
          "text-white border-none shadow-xl relative overflow-hidden bg-gradient-to-br transition-all duration-500",
          theme.primaryBg, theme.glowClass
        )}>
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
          <div className="absolute -left-6 -bottom-6 h-32 w-32 rounded-full bg-white/5" />
          <CardContent className="p-4 relative z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Cash Balance</p>
            <p className={cn(
              "text-4xl font-black font-headline tracking-tighter mt-1",
              cashBalance < 0 && "text-red-200"
            )}>
              ₱{(cashBalance / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
            <div className="flex gap-3 mt-3">
              <div className="bg-white/10 rounded-lg px-3 py-1.5 backdrop-blur-sm">
                <p className="text-[9px] text-white/60 uppercase tracking-wider font-bold">Income</p>
                <p className="text-sm font-black text-emerald-300">+₱{(totalIncome / 100).toLocaleString('en-PH')}</p>
              </div>
              <div className="bg-white/10 rounded-lg px-3 py-1.5 backdrop-blur-sm">
                <p className="text-[9px] text-white/60 uppercase tracking-wider font-bold">Expenses</p>
                <p className="text-sm font-black text-red-300">-₱{(totalExpense / 100).toLocaleString('en-PH')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Transaction History
            </h3>
            <span className="text-[10px] font-bold text-slate-400">Last 50 entries</span>
          </div>

          {loading && <div className="text-center py-8 text-xs text-slate-400">Loading transactions...</div>}

          {!loading && transactions.length === 0 && (
            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl">
              <BookText className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-400">No entries yet</p>
              <p className="text-xs text-slate-400 mt-1">Tap the + button to record your first transaction.</p>
            </div>
          )}

          <div className="space-y-2">
            {transactions.map((t: any) => (
              <div
                key={t.id}
                className="bg-white border border-slate-100 shadow-sm rounded-xl p-3 flex items-center gap-3"
              >
                <div className={cn(
                  "p-2 rounded-xl shrink-0",
                  t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                )}>
                  {t.type === 'income'
                    ? <TrendingUp className="h-4 w-4" />
                    : <TrendingDown className="h-4 w-4" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-800 truncate">
                    {t.description || t.category || (t.type === 'income' ? 'Income' : 'Expense')}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    {t.category && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-slate-100 text-slate-500">
                        {t.category}
                      </Badge>
                    )}
                    <p className="text-[10px] text-slate-400 font-medium">
                      {formatTimestamp(t.createdAt)}
                    </p>
                  </div>
                </div>
                <div className={cn(
                  "text-sm font-black font-headline shrink-0",
                  t.type === 'income' ? 'text-emerald-600' : 'text-red-500'
                )}>
                  {t.type === 'income' ? '+' : '-'}₱{(t.amount / 100).toLocaleString('en-PH')}
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
