"use client"

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, getDocs } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useTenant } from '@/app/lib/tenant-context';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { TrendingUp, TrendingDown, Calendar, Building2, PieChart } from "lucide-react";
import { useSales } from '@/hooks/use-sales';
import { useInventory } from '@/hooks/use-inventory';
import { AiAdvisorCard } from './ai-advisor-card';

// Specialized Retail Metrics for benta-snap
function RetailMetrics({ selectedDate }: { selectedDate: Date }) {
  const { sales, loading } = useSales(selectedDate);
  const totalVolume = sales.length;
  
  const actualCostPesos = sales.reduce((acc, tx: any) => {
    if (!tx.items || !Array.isArray(tx.items)) return acc;
    const txCost = tx.items.reduce((itemAcc: number, item: any) => {
      const itemCost = item.costPrice ? (item.costPrice / 100) * item.quantity : 0;
      return itemAcc + itemCost;
    }, 0);
    return acc + txCost;
  }, 0);

  const grossSalesPesos = sales.reduce((acc, tx) => acc + ((tx.totalAmount || 0) / 100), 0);
  const hasCostData = actualCostPesos > 0;
  const grossMarginPesos = hasCostData ? grossSalesPesos - actualCostPesos : null;

  return (
    <>
      <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
        <CardHeader className="p-4 pb-0">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Checkout Volume</span>
          <h4 className="text-xl font-headline font-black text-slate-800 mt-1">
            {totalVolume}
          </h4>
        </CardHeader>
        <CardContent className="p-4 pt-1.5 text-[8px] font-bold text-slate-400 uppercase border-t border-slate-50 bg-slate-50/40 mt-3 flex justify-between items-center">
          <span>Retail Module</span>
        </CardContent>
      </Card>

      <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
        <CardHeader className="p-4 pb-0">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Kita (Gross Margin)</span>
          <h4 className="text-xl font-headline font-black text-slate-800 mt-1">
            {loading ? "..." : grossMarginPesos !== null ? `₱${grossMarginPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : "N/A"}
          </h4>
        </CardHeader>
        <CardContent className="p-4 pt-1.5 text-[8px] font-bold text-slate-400 uppercase border-t border-slate-50 bg-slate-50/40 mt-3 flex justify-between items-center">
          <span>{hasCostData ? "Based on actual item costs" : "Cost data unavailable"}</span>
        </CardContent>
      </Card>
    </>
  );
}

// Specialized Lending Metrics for hiram-snap
function LendingMetrics({ expenseTxs, incomeTxs }: { expenseTxs: any[], incomeTxs: any[] }) {
  const loansReleased = expenseTxs.filter(t => t.category === 'Lending').reduce((acc, t) => acc + (t.totalPesos || 0), 0);
  const collections = incomeTxs.filter(t => t.category === 'Lending').reduce((acc, t) => acc + (t.totalPesos || 0), 0);

  return (
    <>
      <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
        <CardHeader className="p-4 pb-0">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Total Disbursed</span>
          <h4 className="text-xl font-headline font-black text-slate-800 mt-1">
            ₱{loansReleased.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </h4>
        </CardHeader>
        <CardContent className="p-4 pt-1.5 text-[8px] font-bold text-slate-400 uppercase border-t border-slate-50 bg-slate-50/40 mt-3 flex justify-between items-center">
          <span>Loans Released</span>
        </CardContent>
      </Card>

      <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
        <CardHeader className="p-4 pb-0">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Collections</span>
          <h4 className="text-xl font-headline font-black text-emerald-600 mt-1">
            ₱{collections.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </h4>
        </CardHeader>
        <CardContent className="p-4 pt-1.5 text-[8px] font-bold text-slate-400 uppercase border-t border-slate-50 bg-slate-50/40 mt-3 flex justify-between items-center">
          <span>Principal + Interest</span>
        </CardContent>
      </Card>
    </>
  );
}

// Specialized Service Metrics for wellness-pro, auto-boss, spin-snap
function ServiceMetrics({ incomeTxs }: { incomeTxs: any[] }) {
  const serviceTxs = incomeTxs.filter(t => t.category === 'Services');
  const jobsCompleted = serviceTxs.length;
  const avgTicketSize = jobsCompleted > 0 ? serviceTxs.reduce((acc, t) => acc + (t.totalPesos || 0), 0) / jobsCompleted : 0;

  return (
    <>
      <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
        <CardHeader className="p-4 pb-0">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Jobs Completed</span>
          <h4 className="text-xl font-headline font-black text-slate-800 mt-1">
            {jobsCompleted}
          </h4>
        </CardHeader>
        <CardContent className="p-4 pt-1.5 text-[8px] font-bold text-slate-400 uppercase border-t border-slate-50 bg-slate-50/40 mt-3 flex justify-between items-center">
          <span>Total Appointments</span>
        </CardContent>
      </Card>

      <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
        <CardHeader className="p-4 pb-0">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Avg Ticket Size</span>
          <h4 className="text-xl font-headline font-black text-slate-800 mt-1">
            ₱{avgTicketSize.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </h4>
        </CardHeader>
        <CardContent className="p-4 pt-1.5 text-[8px] font-bold text-slate-400 uppercase border-t border-slate-50 bg-slate-50/40 mt-3 flex justify-between items-center">
          <span>Per Job</span>
        </CardContent>
      </Card>
    </>
  );
}

export function ReportsTab() {
  const { currentTenant, allTenants } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);
  const { products: inventory } = useInventory();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [yesterdayIncomePesos, setYesterdayIncomePesos] = useState<number | null>(null);

  // Load unified master ledger transactions
  useEffect(() => {
    if (!currentTenant) return;

    setLoadingTx(true);
    const { db } = initializeFirebase();

    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const yesterdayStart = new Date(selectedDate);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(selectedDate);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const txRef = collection(db, 'tenants', currentTenant.id, 'transactions');
    const q = query(
      txRef,
      where('createdAt', '>=', startOfDay),
      where('createdAt', '<=', endOfDay),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap: any) => {
      const records: any[] = [];
      snap.forEach((doc: any) => {
        const data = doc.data();
        records.push({
          id: doc.id,
          ...data,
          // Amount is in centavos in the master ledger
          totalPesos: (data.amount || 0) / 100,
          timestamp: data.createdAt || data.date,
        });
      });
      setTransactions(records);
      setLoadingTx(false);
    }, (err: any) => {
      console.error("Error loading master ledger", err);
      setTransactions([]);
      setLoadingTx(false);
    });

    const yQuery = query(
      txRef,
      where('createdAt', '>=', yesterdayStart),
      where('createdAt', '<=', yesterdayEnd)
    );
    
    getDocs(yQuery).then(ySnap => {
      let yTotal = 0;
      ySnap.forEach(d => {
        const data = d.data();
        if (data.type === 'income') {
          yTotal += (data.amount || 0) / 100;
        }
      });
      setYesterdayIncomePesos(yTotal);
    }).catch(e => console.error("Error fetching yesterday transactions", e));

    return () => unsubscribe();
  }, [currentTenant, selectedDate]);

  // Aggregate unified metrics
  const incomeTxs = transactions.filter(t => t.type === 'income');
  const expenseTxs = transactions.filter(t => t.type === 'expense');

  const grossIncomePesos = incomeTxs.reduce((acc, curr) => acc + (curr.totalPesos || 0), 0);
  const totalExpensesPesos = expenseTxs.reduce((acc, curr) => acc + (curr.totalPesos || 0), 0);

  // Group revenue by category
  const revenueByCategory = incomeTxs.reduce((acc, tx) => {
    const cat = tx.category || 'General';
    acc[cat] = (acc[cat] || 0) + (tx.totalPesos || 0);
    return acc;
  }, {} as Record<string, number>);

  // Hourly Activity Data for Area Chart
  const hourlyBuckets = Array(15).fill(0); // 8 AM to 10 PM
  incomeTxs.forEach(t => {
    if (t.timestamp) {
      const dateObj = t.timestamp.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
      const hour = dateObj.getHours();
      if (hour >= 8 && hour <= 22) {
        hourlyBuckets[hour - 8] += t.totalPesos || 0;
      }
    }
  });

  const maxHourlyVal = Math.max(...hourlyBuckets, 100);

  const isRetail = currentTenant?.moduleType === 'benta-snap' || currentTenant?.moduleType === 'build-stack';
  const isLending = currentTenant?.moduleType === 'hiram-snap';
  const isService = currentTenant?.moduleType === 'wellness-pro' || currentTenant?.moduleType === 'auto-boss' || currentTenant?.moduleType === 'spin-snap';

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      <main className="p-4 space-y-5 pb-24">
        
        {/* Title */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-headline font-black tracking-tight text-slate-800">Ulat ng Negosyo</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                {theme.name} • Executive Dashboard
              </p>
            </div>
            <Badge className="text-[9px] font-black uppercase border-transparent px-3 py-1 rounded-full shadow-sm bg-indigo-50 text-indigo-600">
              Owner Mode
            </Badge>
          </div>
        </section>

        {/* Date Selector */}
        <div className="bg-white border border-slate-200/60 p-4 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 font-bold text-xs">
            <Calendar className="h-4.5 w-4.5 text-slate-400" />
            <span>Petsa ng Ulat:</span>
            <span className="font-extrabold text-slate-800">
              {selectedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <input 
            type="date"
            value={selectedDate.toISOString().slice(0, 10)}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(new Date(e.target.value));
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-700 cursor-pointer"
          />
        </div>

        {/* AI Advisor Co-Pilot */}
        <AiAdvisorCard 
          tenantName={currentTenant?.name || ''}
          moduleType={currentTenant?.moduleType || ''}
          products={inventory}
          sales={transactions.filter(t => t.type === 'income')}
          dailyTotalPesos={grossIncomePesos}
        />

        {/* Universal Top-Level Metric Card */}
        <Card className="shadow-sm border-transparent rounded-[28px] overflow-hidden text-white relative" style={{ backgroundColor: theme.primary }}>
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <PieChart className="h-24 w-24" />
          </div>
          <CardHeader className="p-5 pb-0 relative z-10">
            <span className="text-[9px] font-black uppercase tracking-widest opacity-80 text-white">Kabuuang Kita (Gross Revenue)</span>
            <h4 className="text-3xl font-headline font-black mt-1 flex items-baseline gap-1">
              ₱{grossIncomePesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </h4>
          </CardHeader>
          <CardContent className="p-5 pt-2 relative z-10 flex justify-between items-center mt-2">
            <span className="text-[9px] font-bold uppercase tracking-widest opacity-80">
              Across all {theme.name} operations
            </span>
            {yesterdayIncomePesos !== null && (
              <Badge className="bg-white/20 hover:bg-white/20 border-none text-white text-[9px] font-black px-2 py-0.5">
                {grossIncomePesos >= yesterdayIncomePesos ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                vs Yesterday
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Revenue Breakdown */}
        {Object.keys(revenueByCategory).length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 pl-1">Revenue Stream Breakdown</h3>
            <div className="bg-white border border-slate-200/60 rounded-[28px] p-2 space-y-1">
              {Object.entries(revenueByCategory).map(([cat, amount]) => (
                <div key={cat} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-2xl transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: theme.primary }}>
                      {cat.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-slate-700">{cat}</span>
                  </div>
                  <span className="text-sm font-black text-slate-800">
                    ₱{(amount as number).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dynamic Module-Specific Metrics Row */}
        <div className="grid grid-cols-2 gap-3">
          {isRetail && <RetailMetrics selectedDate={selectedDate} />}
          {isLending && <LendingMetrics expenseTxs={expenseTxs} incomeTxs={incomeTxs} />}
          {isService && <ServiceMetrics incomeTxs={incomeTxs} />}
          
          {totalExpensesPesos > 0 && (
            <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
              <CardHeader className="p-4 pb-0">
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Total Expenses</span>
                <h4 className="text-xl font-headline font-black text-rose-500 mt-1">
                  ₱{totalExpensesPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </h4>
              </CardHeader>
              <CardContent className="p-4 pt-1.5 text-[8px] font-bold text-slate-400 uppercase border-t border-slate-50 bg-slate-50/40 mt-3 flex justify-between items-center">
                <span>{expenseTxs.length} records</span>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Dynamic Area Graphic Chart (SVG area chart gradient) */}
        <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
          <CardHeader className="p-5 pb-0">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Daloy ng Kita Kada Oras</span>
                <CardTitle className="text-sm font-headline font-black text-slate-800 mt-1">
                  8:00 AM - 10:00 PM Activity
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[8px] font-black uppercase bg-slate-50 border-slate-200 text-slate-400 px-2 py-0.5 rounded-full">
                Hourly Peak
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-4">
            <div className="h-[140px] w-full relative">
              
              <svg className="w-full h-full" viewBox="0 0 300 120" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="sales-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.primary} stopOpacity="0.4" />
                    <stop offset="100%" stopColor={theme.primary} stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                <path 
                  d={`
                    M 0 120
                    ${hourlyBuckets.map((v, i) => {
                      const x = (i / (hourlyBuckets.length - 1)) * 300;
                      const y = 120 - ((v / maxHourlyVal) * 90);
                      return `L ${x.toFixed(1)} ${y.toFixed(1)}`;
                    }).join(' ')}
                    L 300 120
                    Z
                  `}
                  fill="url(#sales-gradient)"
                />

                <path 
                  d={hourlyBuckets.map((v, i) => {
                    const x = (i / (hourlyBuckets.length - 1)) * 300;
                    const y = 120 - ((v / maxHourlyVal) * 90);
                    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                  }).join(' ')}
                  fill="none"
                  stroke={theme.primary}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              <div className="flex justify-between items-center text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-2 px-1">
                <span>8am</span>
                <span>12pm</span>
                <span>4pm</span>
                <span>8pm</span>
                <span>10pm</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cooperative Franchise Dashboard (Multi-store aggregate statistics) */}
        <section className="space-y-3.5">
          <div className="flex items-center gap-1">
            <Building2 className="h-4.5 w-4.5 text-slate-400" />
            <h3 className="text-base font-headline font-black text-slate-800">Cooperative Franchise Network</h3>
          </div>

          <div className="grid gap-2.5">
            {allTenants.map(t => {
              const isActiveStore = t.id === currentTenant?.id;
              const storeTheme = getModuleTheme(t.moduleType);

              return (
                <div 
                  key={t.id}
                  className={cn(
                    "bg-white border rounded-2xl p-4 flex justify-between items-center transition-all",
                    isActiveStore ? "border-slate-300 ring-1 ring-slate-200" : "border-slate-200/60 opacity-80"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="h-10 w-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 font-headline font-black"
                      style={{ backgroundColor: storeTheme.primary }}
                    >
                      {t.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                        {t.name}
                        {isActiveStore && (
                          <Badge className="text-[6.5px] font-black uppercase bg-indigo-50 text-indigo-600 border-none px-1 py-0.5 rounded">Active</Badge>
                        )}
                      </h4>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        {storeTheme.name} • Micro SaaS
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex flex-col gap-1">
                    <Badge variant="outline" className="text-[8px] font-black uppercase text-slate-500 bg-slate-50 border-slate-200 rounded-full px-2 py-0.5">
                      Sub: Active
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </main>
    </div>
  );
}
