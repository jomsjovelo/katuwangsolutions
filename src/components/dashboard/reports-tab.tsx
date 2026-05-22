"use client"

// FIX S2-3: Static ES imports replace dynamic require() calls inside useEffect
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useTenant } from '@/app/lib/tenant-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Download, 
  BarChart3, 
  ShoppingBag,
  FileSpreadsheet,
  Building2,
  Users,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  LineChart,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useSales } from '@/hooks/use-sales';

export function ReportsTab() {
  const { currentTenant, allTenants } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { dailyTotalPesos, loading: salesLoading } = useSales(selectedDate);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [yesterdaySalesPesos, setYesterdaySalesPesos] = useState<number | null>(null);

  // Pagination states
  const [txLimit, setTxLimit] = useState(25);
  const [hasMore, setHasMore] = useState(false);

  // Reset limit when date shifts to avoid memory leak
  useEffect(() => {
    setTxLimit(25);
  }, [selectedDate]);

  // Local React ref to cache loaded transactions per calendar date key
  const queryCacheRef = React.useRef<{ [dateKey: string]: any[] }>({});

  // Load raw transaction log for selected date
  useEffect(() => {
    if (!currentTenant) return;

    const dateKey = `${selectedDate.toISOString().slice(0, 10)}_limit_${txLimit}`;
    const todayKey = new Date().toISOString().slice(0, 10);
    const isToday = selectedDate.toISOString().slice(0, 10) === todayKey;

    // Served instantly from our memoization cache if it's a past date with the same limit size
    if (!isToday && queryCacheRef.current[dateKey]) {
      console.log(`[Cache Hit] Serving report transactions for ${dateKey} instantly.`);
      setTransactions(queryCacheRef.current[dateKey]);
      setHasMore(queryCacheRef.current[dateKey].length === txLimit);
      setLoadingTx(false);
      return;
    }

    setLoadingTx(true);

    // FIX S2-3: Use initializeFirebase() instead of dynamic require()
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

    // FIX S1-2: Query 'sales' collection
    const txRef = collection(db, 'tenants', currentTenant.id, 'sales');
    const q = query(
      txRef,
      where('createdAt', '>=', startOfDay),
      where('createdAt', '<=', endOfDay),
      orderBy('createdAt', 'desc'),
      limit(txLimit)
    );

    const unsubscribe = onSnapshot(q, (snap: any) => {
      const records: any[] = [];
      snap.forEach((doc: any) => {
        const data = doc.data();
        records.push({
          id: doc.id,
          ...data,
          // FIX S1-2 field alignment: sales store totalAmount in centavos, reports need pesos
          totalPesos: (data.totalAmount || 0) / 100,
          // Normalize timestamp field: sales use 'createdAt', not 'timestamp'
          timestamp: data.createdAt,
        });
      });
      
      // Update cache
      queryCacheRef.current[dateKey] = records;
      
      setTransactions(records);
      setHasMore(records.length === txLimit);
      setLoadingTx(false);
    }, (err: any) => {
      console.error("Error loading transaction records for BIR", err);
      // Fallback to empty if index is still deploying
      setTransactions([]);
      setHasMore(false);
      setLoadingTx(false);
    });

    // Fetch yesterday's aggregate for trend calculation (S4-4)
    import('firebase/firestore').then(({ getDocs, query, where }) => {
      const yQuery = query(
        txRef,
        where('createdAt', '>=', yesterdayStart),
        where('createdAt', '<=', yesterdayEnd)
      );
      getDocs(yQuery).then(ySnap => {
        let yTotal = 0;
        ySnap.forEach(d => {
          yTotal += (d.data().totalAmount || 0) / 100;
        });
        setYesterdaySalesPesos(yTotal);
      }).catch(e => console.error("Error fetching yesterday sales", e));
    });

    return () => unsubscribe();
  }, [currentTenant, selectedDate, txLimit]);

  // Aggregate Metrics
  const grossSalesPesos = transactions.reduce((acc, curr) => acc + (curr.totalPesos || 0), 0);
  const totalVolume = transactions.length;
  const avgBasketPesos = totalVolume > 0 ? (grossSalesPesos / totalVolume) : 0;

  // FIX S2-5: Compute actual gross margin from costPrice/salePrice per item.
  // REMOVED hardcoded 65% COGS estimate that was causing tax compliance violations.
  // Margin is calculated from real Firestore product cost data stored on each sale item.
  const actualCostPesos = transactions.reduce((acc, tx) => {
    if (!tx.items || !Array.isArray(tx.items)) return acc;
    const txCost = tx.items.reduce((itemAcc: number, item: any) => {
      // Only use cost data if it was persisted on the sale item
      const itemCost = item.costPrice ? (item.costPrice / 100) * item.quantity : 0;
      return itemAcc + itemCost;
    }, 0);
    return acc + txCost;
  }, 0);

  // Only compute margin if we have real cost data; otherwise show N/A
  const hasCostData = actualCostPesos > 0;
  const grossMarginPesos = hasCostData ? grossSalesPesos - actualCostPesos : null;

  // Hourly Sales Data (Synthesize from transactions)
  const hourlyBuckets = Array(15).fill(0); // 8 AM to 10 PM
  transactions.forEach(t => {
    if (t.timestamp) {
      const dateObj = t.timestamp.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
      const hour = dateObj.getHours();
      if (hour >= 8 && hour <= 22) {
        hourlyBuckets[hour - 8] += t.totalPesos || 0;
      }
    }
  });

  const maxHourlyVal = Math.max(...hourlyBuckets, 100);

  // Generate BIR CSV compliant simplify daily sales journal
  const handleExportBirCsv = () => {
    if (transactions.length === 0) return;

    // BIR Simplified Bookkeeping Headers
    const headers = [
      "Date (Petsa)",
      "Invoice/Receipt Number (Numero ng Resibo)",
      "Registered Customer ID (Customer Name)",
      "Payment Mode (Paraan ng Bayad)",
      "Gross Sales (Kabuuang Benta - PHP)",
      "VAT Exempt Sales (Exempted sa VAT - PHP)",
      "Zero-Rated Sales (PHP)",
      "VATable Sales (Benta na may VAT - PHP)",
      "VAT Amount (Output VAT 12% - PHP)",
      "Net Sales (Netong Kita - PHP)"
    ];

    const rows = transactions.map((t, idx) => {
      const tDate = t.timestamp?.toDate ? t.timestamp.toDate() : new Date();
      const dateStr = tDate.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
      
      const invoiceRef = `KAT-${t.id.slice(0, 8).toUpperCase()}`;
      const customer = t.customerId ? `Cust-${t.customerId.slice(0, 6)}` : "Walk-in";
      const mode = t.paymentMethod ? t.paymentMethod.toUpperCase() : "CASH";
      const gross = t.totalPesos || 0;
      
      // Compute BIR taxes: Sari-Sari micro-enterprises under BMBE are VAT exempt
      // We categorize 100% of sales as VAT Exempt for standard simplified micro ledger compliance
      const vatExempt = gross; 
      const zeroRated = 0;
      const vatable = 0;
      const outputVat = 0;
      const net = gross;

      return [
        dateStr,
        invoiceRef,
        customer,
        mode,
        gross.toFixed(2),
        vatExempt.toFixed(2),
        zeroRated.toFixed(2),
        vatable.toFixed(2),
        outputVat.toFixed(2),
        net.toFixed(2)
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    
    const filename = `BIR_Sales_Ledger_${currentTenant?.name.replace(/\s+/g, '_')}_${selectedDate.toISOString().slice(0, 10)}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      
      {/* Toast Alert Success */}
      {downloadSuccess && (
        <div className="fixed top-4 inset-x-4 z-50 bg-slate-900/95 text-white py-3 px-4 rounded-2xl border border-slate-700/50 text-xs font-bold flex items-center gap-2 shadow-2xl animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 flex-shrink-0 animate-bounce" />
          <span>BIR simplified sales book exported successfully!</span>
        </div>
      )}

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
            <Badge 
              className="text-[9px] font-black uppercase border-transparent px-3 py-1 rounded-full shadow-sm bg-indigo-50 text-indigo-600"
            >
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

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
            <CardHeader className="p-4 pb-0">
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Kabuuang Benta</span>
              <h4 className="text-xl font-headline font-black text-slate-800 mt-1 flex items-baseline gap-1">
                ₱{grossSalesPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </h4>
            </CardHeader>
            <CardContent className="p-4 pt-1.5 text-[8px] font-bold text-slate-400 uppercase border-t border-slate-50 bg-slate-50/40 mt-3 flex justify-between items-center">
              <span>{totalVolume} checkout transactions</span>
              {yesterdaySalesPesos !== null && (
                grossSalesPesos >= yesterdaySalesPesos ? 
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : 
                  <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
            <CardHeader className="p-4 pb-0">
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Kita (Gross Margin)</span>
              <h4 className="text-xl font-headline font-black text-slate-800 mt-1">
                {grossMarginPesos !== null ? `₱${grossMarginPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : "N/A"}
              </h4>
            </CardHeader>
            <CardContent className="p-4 pt-1.5 text-[8px] font-bold text-slate-400 uppercase border-t border-slate-50 bg-slate-50/40 mt-3 flex justify-between items-center">
              <span>{hasCostData ? "Based on actual item costs" : "Cost data unavailable"}</span>
              {yesterdaySalesPesos !== null && (
                grossSalesPesos >= yesterdaySalesPesos ? 
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : 
                  <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Dynamic Area Graphic Chart (SVG area chart gradient) */}
        <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
          <CardHeader className="p-5 pb-0">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Daloy ng Benta Kada Oras</span>
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
              
              {/* Dynamic SVG Gradient Line Area Chart */}
              <svg className="w-full h-full" viewBox="0 0 300 120" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="sales-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.primary} stopOpacity="0.4" />
                    <stop offset="100%" stopColor={theme.primary} stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Draw dynamic polygon points area */}
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

                {/* Line stroke path overlay */}
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

              {/* Chart Grid labels */}
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

        {/* BIR Ledger Exporter Panel */}
        <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
          <CardHeader className="p-5 pb-0 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Compliance & Bookkeeping</span>
              <ShieldCheck className="h-4.5 w-4.5 text-emerald-500" />
            </div>
            <CardTitle className="text-sm font-headline font-black text-slate-800">
              BIR-Ready Daily Sales Journal
            </CardTitle>
            <p className="text-[10px] text-slate-400 font-bold leading-normal">
              Awtomatikong inililista ang iyong benta sa standard BIR simplified general sales book template. I-export bilang CSV para sa iyong tax reporting.
            </p>
          </CardHeader>
          <CardContent className="p-5 pt-4 space-y-4">
            
            {/* Action buttons */}
            <Button 
              onClick={handleExportBirCsv}
              disabled={transactions.length === 0}
              className="w-full h-11 text-white font-black rounded-xl flex items-center justify-center gap-1.5 text-xs border-none cursor-pointer"
              style={{ 
                backgroundColor: theme.primary,
                boxShadow: `0 6px 12px -3px ${theme.primary}30` 
              }}
            >
              <FileSpreadsheet className="h-4.5 w-4.5" /> 
              Export BIR simplified Sales Book (.CSV)
            </Button>

            {/* List mini table preview */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 space-y-2">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Preview (Benta Rows)</span>
              
              {loadingTx ? (
                <div className="flex items-center justify-center py-6 text-[10px] text-slate-400 font-bold">
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Loading ledger...
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-6 text-[10px] text-slate-400 font-bold uppercase">
                  Walang nakatalang benta sa petsang ito
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {transactions.map((t, idx) => (
                    <div key={t.id} className="bg-white border border-slate-200/40 p-2 rounded-lg flex justify-between items-center text-[10px]">
                      <div className="font-mono text-slate-400">
                        Ref: <span className="font-extrabold text-slate-600">{t.id.slice(0, 8).toUpperCase()}</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider text-[8px]">
                          {t.paymentMethod || "CASH"}
                        </span>
                        <span className="font-black text-slate-800">
                          ₱{t.totalPesos.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {hasMore && (
                    <button
                      onClick={() => setTxLimit(prev => prev + 25)}
                      className="w-full mt-2 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-[9px] font-black text-slate-500 uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-sm active:scale-[0.98] duration-150"
                    >
                      Pakita ang iba pa (Show More)
                    </button>
                  )}
                </div>
              )}
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

                  {/* Multi-store status badges */}
                  <div className="text-right flex flex-col gap-1">
                    <Badge variant="outline" className="text-[8px] font-black uppercase text-slate-500 bg-slate-50 border-slate-200 rounded-full px-2 py-0.5">
                      Sub: Active
                    </Badge>
                    <div className="flex items-center justify-end gap-1 text-[8px] text-slate-400 font-extrabold uppercase">
                      <Users className="h-3 w-3" /> 2 Tindera
                    </div>
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
