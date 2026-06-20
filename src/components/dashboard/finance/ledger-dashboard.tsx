"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { addTransaction, deleteTransaction } from '@/firebase/firestore/finance-actions';
import { useUser } from '@/firebase/auth/use-user';
import { useCollection, useDocument } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, limit, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
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
  TrendingDown,
  Download,
  AlertTriangle,
  Trash2
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
  const db = useFirestore();
  const { toast } = useToast();
  
  const { user } = useUser();
  const isOwner = currentTenant?.ownerUid === user?.uid || (currentTenant as any)?.role === 'owner';

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Live stream of recent transactions
  const txQuery = React.useMemo(() => {
    return currentTenant 
    ? query(collection(db, 'tenants', currentTenant.id, 'transactions'),
        orderBy('createdAt', 'desc'),
        limit(50)) : null;
  }, [currentTenant?.id, db]);
  const [txSnapshot, loading, txError] = useCollection(txQuery as any);

  // Live stream of the True Master Cash Balance
  const masterAccountRef = React.useMemo(() => {
    return currentTenant && db
    ? doc(db, 'tenants', currentTenant.id, 'accounts', 'master-cash')
    : null;
  }, [currentTenant?.id, db]);
  
  const [masterSnap, masterLoading, masterError] = useDocument(masterAccountRef as any);
  const trueCashBalance = masterSnap?.exists() ? (masterSnap.data().balance || 0) : 0;

  React.useEffect(() => {
    if (txError || masterError) {
      console.error("Ledger listener error:", txError || masterError);
      toast({ title: 'Connection Error', description: 'Failed to sync live ledger data.', variant: 'destructive' });
    }
  }, [txError, masterError, toast]);

  let recentIncome = 0;
  let recentExpense = 0;
  const transactions = txSnapshot?.docs.map((doc: any) => {
    const data = doc.data();
    if (data.type === 'income') recentIncome += data.amount;
    if (data.type === 'expense') recentExpense += data.amount;
    return { id: doc.id, ...data };
  }) || [];

  // --- Add Entry Form ---
  const [showForm, setShowForm] = useState(false);
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [budgetLimit, setBudgetLimit] = useState(50000); // ₱50k default budget

  const categories = entryType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const budgetThreshold = budgetLimit * 100 * 0.8;
  const showBudgetWarning = recentExpense >= budgetThreshold;

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

  const handleDelete = async (txId: string) => {
    if (!currentTenant || !user) return;
    if (!window.confirm("Sigurado ka bang gusto mong i-delete o i-void ang transaction na ito? Ibabalik nito ang Master Cash balance.")) return;
    try {
      await deleteTransaction(currentTenant.id, txId, user.uid, user.displayName || user.email || 'Unknown User');
      toast({ title: 'Transaction Deleted', description: 'Transaction has been successfully reversed.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDownloadCSV = () => {
    const headers = ['Date', 'Type', 'Category', 'Description', 'Amount (PHP)'];
    const rows = transactions.map((t: any) => [
      t.createdAt?.toDate ? t.createdAt.toDate().toISOString() : new Date(t.createdAt).toISOString(),
      t.type,
      t.category || '',
      t.description || '',
      (t.amount / 100).toFixed(2)
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ledger_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData = React.useMemo(() => {
    const days: Record<string, { inc: number, exp: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days[d.toLocaleDateString('en-US', { weekday: 'short' })] = { inc: 0, exp: 0 };
    }
    
    transactions.forEach((t: any) => {
      if (!t.createdAt) return;
      const d = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      if (days[dayName]) {
        if (t.type === 'income') days[dayName].inc += t.amount;
        if (t.type === 'expense') days[dayName].exp += t.amount;
      }
    });
    
    let maxVal = 100;
    Object.values(days).forEach(v => {
      if (v.inc > maxVal) maxVal = v.inc;
      if (v.exp > maxVal) maxVal = v.exp;
    });
    
    return { days: Object.entries(days), maxVal };
  }, [transactions]);

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

        {/* Budget Alert */}
        {showBudgetWarning && (
          <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2">
            <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-rose-700">Budget Alert</h4>
              <p className="text-xs text-rose-600 mt-0.5">
                You have recently spent ₱{(recentExpense / 100).toLocaleString()} which is near or over your ₱{budgetLimit.toLocaleString()} warning limit.
              </p>
            </div>
          </div>
        )}

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
                <Label htmlFor="ledger-amount" className="text-xs">Amount (₱)</Label>
                <Input
                  id="ledger-amount"
                  name="ledgerAmount"
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
                <Label htmlFor="ledger-notes" className="text-xs">Notes (Optional)</Label>
                <Input
                  id="ledger-notes"
                  name="ledgerNotes"
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
            <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Master Cash Balance</p>
            <p className={cn(
              "text-4xl font-black font-headline tracking-tighter mt-1",
              trueCashBalance < 0 && "text-red-200"
            )}>
              ₱{(trueCashBalance / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
            <div className="flex gap-3 mt-3">
              <div className="bg-white/10 rounded-lg px-3 py-1.5 backdrop-blur-sm">
                <p className="text-[9px] text-white/60 uppercase tracking-wider font-bold">Recent Income</p>
                <p className="text-sm font-black text-emerald-300">+₱{(recentIncome / 100).toLocaleString('en-PH')}</p>
              </div>
              <div className="bg-white/10 rounded-lg px-3 py-1.5 backdrop-blur-sm">
                <p className="text-[9px] text-white/60 uppercase tracking-wider font-bold">Recent Expenses</p>
                <p className="text-sm font-black text-red-300">-₱{(recentExpense / 100).toLocaleString('en-PH')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Chart */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Last 7 Days (Income vs Expense)</h4>
            <div className="flex items-end justify-between h-32 gap-2">
              {chartData.days.map(([day, vals]) => {
                const incHeight = Math.max((vals.inc / chartData.maxVal) * 100, 4);
                const expHeight = Math.max((vals.exp / chartData.maxVal) * 100, 4);
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex justify-center gap-1 h-24 items-end">
                      <div className="w-2.5 bg-emerald-400 rounded-t-sm" style={{ height: `${incHeight}%` }} />
                      <div className="w-2.5 bg-rose-400 rounded-t-sm" style={{ height: `${expHeight}%` }} />
                    </div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">{day}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Transaction History
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-slate-400">Last 50 entries</span>
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 bg-white" onClick={handleDownloadCSV}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
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
                  "text-sm font-black font-headline shrink-0 flex items-center gap-2",
                  t.type === 'income' ? 'text-emerald-600' : 'text-red-500'
                )}>
                  <span>{t.type === 'income' ? '+' : '-'}₱{(t.amount / 100).toLocaleString('en-PH')}</span>
                  {isOwner && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-full shrink-0" onClick={() => handleDelete(t.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
