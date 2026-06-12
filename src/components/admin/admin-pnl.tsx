"use client";

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, DollarSign,
  ArrowUpRight, ArrowDownRight, Minus, Calculator,
  AlertCircle, Loader2, Plus, Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BillingLog {
  id: string;
  tenantId: string;
  tenantName: string;
  pricingTier: string;
  amount: number;
  type: string;
  timestamp: any;
}

interface Expense {
  id: string;
  label: string;
  amountMonthly: number;
  category: string;
}

interface TenantSummary {
  id: string;
  subscriptionStatus: string;
  pricingTier: string;
  moduleType: string;
  createdAt: any;
}

const TIER_COLORS: Record<string, string> = {
  promo_99: '#F97316',
  standard_199: '#06B6D4',
  enterprise: '#8B5CF6',
};

const TIER_LABELS: Record<string, string> = {
  promo_99: 'Promo ₱99',
  standard_199: 'Standard ₱199',
  enterprise: 'Enterprise ₱499',
};

const TIER_PRICES: Record<string, number> = {
  promo_99: 99,
  standard_199: 199,
  enterprise: 499,
};

export function AdminPnL() {
  const [logs, setLogs] = useState<BillingLog[]>([]);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expense entry form
  const [newExpenseLabel, setNewExpenseLabel] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  useEffect(() => {
    const { db } = initializeFirebase();

    // 1. Subscribe to billing logs
    const logsUnsub = onSnapshot(
      query(collection(db, 'billing_logs'), orderBy('timestamp', 'desc')),
      (snap) => {
        setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as BillingLog)));
        setLoading(false);
      },
      (err) => {
        console.error("PnL billing logs error:", err);
        setError("Failed to load billing data.");
        setLoading(false);
      }
    );

    // 2. Subscribe to tenants
    const tenantsUnsub = onSnapshot(
      collection(db, 'tenants'),
      (snap) => {
        setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() } as TenantSummary)));
      },
      (err) => console.error("PnL tenants error:", err)
    );

    // 3. Subscribe to system expenses config
    const expensesUnsub = onSnapshot(
      collection(db, 'system_expenses'),
      (snap) => {
        setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
      },
      (err) => console.error("PnL expenses error:", err)
    );

    return () => {
      logsUnsub();
      tenantsUnsub();
      expensesUnsub();
    };
  }, []);

  // ── Calculated KPIs ─────────────────────────────────────────────────────────

  const activeTenants = tenants.filter(t => t.subscriptionStatus === 'active');
  const suspendedTenants = tenants.filter(t => t.subscriptionStatus === 'suspended');
  const totalTenants = tenants.length;

  // MRR from active tenants by tier
  const mrr = activeTenants.reduce((acc, t) => acc + (TIER_PRICES[t.pricingTier] || 0), 0);
  const arr = mrr * 12;
  const arpu = activeTenants.length > 0 ? Math.round(mrr / activeTenants.length) : 0;
  const churnRate = totalTenants > 0 ? Math.round((suspendedTenants.length / totalTenants) * 100) : 0;

  // New activations this calendar month
  const now = new Date();
  const newThisMonth = logs.filter(l => {
    if (!l.timestamp) return false;
    const d = new Date(l.timestamp.seconds * 1000);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && l.type === 'activation';
  }).length;

  // Monthly total expenses
  const totalMonthlyExpenses = expenses.reduce((acc, e) => acc + e.amountMonthly, 0);
  const grossProfit = mrr - totalMonthlyExpenses;

  // ── Chart Data ───────────────────────────────────────────────────────────────

  // Monthly revenue bar chart (from billing logs)
  const monthlyRevenue = logs.reduce((acc, log) => {
    if (!log.timestamp) return acc;
    const d = new Date(log.timestamp.seconds * 1000);
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    acc[key] = (acc[key] || 0) + log.amount;
    return acc;
  }, {} as Record<string, number>);

  const barChartData = Object.entries(monthlyRevenue)
    .map(([month, revenue]) => ({ month, revenue }))
    .slice(-6); // Last 6 months

  // Tier distribution
  const tierDistribution = activeTenants.reduce((acc, t) => {
    const key = t.pricingTier || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(tierDistribution).map(([tier, count]) => ({
    name: TIER_LABELS[tier] || tier,
    value: count,
    color: TIER_COLORS[tier] || '#94a3b8',
  }));

  // ── Expense Management ───────────────────────────────────────────────────────

  const handleAddExpense = async () => {
    if (!newExpenseLabel || !newExpenseAmount) return;
    setIsSavingExpense(true);
    try {
      const { db } = initializeFirebase();
      const { addDoc, serverTimestamp } = await import('firebase/firestore');
      await addDoc(collection(db, 'system_expenses'), {
        label: newExpenseLabel,
        amountMonthly: Number(newExpenseAmount),
        category: 'Operations',
        createdAt: serverTimestamp(),
      });
      setNewExpenseLabel('');
      setNewExpenseAmount('');
      setShowExpenseForm(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      const { db } = initializeFirebase();
      const { deleteDoc, doc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'system_expenses', id));
    } catch (e) {
      console.error(e);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm font-medium text-destructive">{error}</p>
      </div>
    );
  }

  const KPICard = ({ label, value, sub, trend, trendValue, colorClass }: any) => (
    <Card className="shadow-md border-slate-200/80">
      <CardHeader className="pb-1 pt-4">
        <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</CardDescription>
        <CardTitle className={cn("text-3xl font-black font-headline", colorClass)}>{value}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {trend === 'up' && <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
          {trend === 'down' && <ArrowDownRight className="h-3 w-3 text-red-500" />}
          {trend === 'neutral' && <Minus className="h-3 w-3 text-slate-400" />}
          <span className="text-slate-500">{sub}</span>
          {trendValue && <span className={cn("font-bold ml-1", trend === 'up' ? 'text-emerald-600' : 'text-red-600')}>{trendValue}</span>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-headline font-black uppercase tracking-tight">Profit & Loss</h2>
          <p className="text-sm text-muted-foreground">Live financial overview for the Katuwang Platform</p>
        </div>
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-bold px-4 py-2 text-sm">
          {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Badge>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="MRR" value={`₱${mrr.toLocaleString()}`} sub="Active subscriptions" trend="up" colorClass="text-indigo-600" />
        <KPICard label="ARR" value={`₱${arr.toLocaleString()}`} sub="Annualized" trend="neutral" colorClass="text-slate-800" />
        <KPICard label="ARPU" value={`₱${arpu}`} sub="Per active tenant" trend="neutral" colorClass="text-slate-800" />
        <KPICard label="Active Tenants" value={activeTenants.length} sub="Paying subscribers" trend="up" colorClass="text-emerald-600" />
        <KPICard label="Churn Rate" value={`${churnRate}%`} sub={`${suspendedTenants.length} suspended`} trend={churnRate > 10 ? 'down' : 'neutral'} colorClass={churnRate > 10 ? 'text-red-600' : 'text-slate-800'} />
        <KPICard label="New (This Month)" value={newThisMonth} sub="New activations" trend={newThisMonth > 0 ? 'up' : 'neutral'} colorClass="text-primary" />
      </div>

      {/* P&L Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white border-none shadow-xl">
          <CardHeader className="pb-1">
            <CardDescription className="text-white/70 text-[10px] font-black uppercase tracking-widest">Monthly Revenue</CardDescription>
            <CardTitle className="text-4xl font-black">₱{mrr.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-white/60 text-xs font-medium">{activeTenants.length} active tenants × avg ₱{arpu}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-rose-500 to-orange-500 text-white border-none shadow-xl">
          <CardHeader className="pb-1">
            <CardDescription className="text-white/70 text-[10px] font-black uppercase tracking-widest">Monthly Expenses</CardDescription>
            <CardTitle className="text-4xl font-black">₱{totalMonthlyExpenses.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-white/60 text-xs font-medium">{expenses.length} cost line{expenses.length !== 1 ? 's' : ''} tracked</p>
          </CardContent>
        </Card>
        <Card className={cn("border-none shadow-xl text-white", grossProfit >= 0 ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-red-500 to-rose-700")}>
          <CardHeader className="pb-1">
            <CardDescription className="text-white/70 text-[10px] font-black uppercase tracking-widest">Gross Profit</CardDescription>
            <CardTitle className="text-4xl font-black">₱{grossProfit.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1.5 text-white/80 text-xs font-medium">
              {grossProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>{grossProfit >= 0 ? 'Revenue exceeds costs' : 'Expenses exceed revenue'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Revenue Bar Chart */}
        <Card className="md:col-span-8 shadow-lg border-slate-200/80">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500">Revenue by Month (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent className="h-[220px] p-0 px-4 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 700 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₱${v}`} />
                <Tooltip formatter={(v: number) => [`₱${v.toLocaleString()}`, 'Revenue']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="revenue" fill="url(#barGradient)" radius={[6, 6, 0, 0]} />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Tier Pie Chart */}
        <Card className="md:col-span-4 shadow-lg border-slate-200/80">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500">Tier Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[220px] p-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [v + ' tenants', 'Count']} />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px', fontWeight: 700 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Expenses Manager */}
      <Card className="shadow-lg border-slate-200/80">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Calculator className="h-4 w-4" /> Monthly Cost Tracker
            </CardTitle>
            <CardDescription>Add recurring expenses to calculate gross profit accurately.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowExpenseForm(v => !v)} className="font-bold shrink-0">
            <Plus className="h-4 w-4 mr-1" /> Add Cost
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showExpenseForm && (
            <div className="flex gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 animate-in slide-in-from-top-2">
              <Input
                placeholder="e.g. Firebase Blaze Plan"
                value={newExpenseLabel}
                onChange={e => setNewExpenseLabel(e.target.value)}
                className="flex-1 font-medium text-sm"
              />
              <div className="relative w-36">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">₱</span>
                <Input
                  type="number"
                  placeholder="0"
                  value={newExpenseAmount}
                  onChange={e => setNewExpenseAmount(e.target.value)}
                  className="pl-7 font-bold"
                />
              </div>
              <Button onClick={handleAddExpense} disabled={isSavingExpense || !newExpenseLabel || !newExpenseAmount} className="font-bold px-4">
                Save
              </Button>
            </div>
          )}

          {expenses.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              No expenses tracked yet. Add your first cost line to see gross profit.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {expenses.map(exp => (
                <div key={exp.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-bold text-sm text-slate-800">{exp.label}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{exp.category}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-slate-700">₱{exp.amountMonthly.toLocaleString()}<span className="text-slate-400 font-medium text-[10px]">/mo</span></span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteExpense(exp.id)}
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 font-black">
                <span className="text-sm text-slate-700 uppercase tracking-widest">Total Monthly Costs</span>
                <span className="text-rose-600">₱{totalMonthlyExpenses.toLocaleString()}/mo</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
