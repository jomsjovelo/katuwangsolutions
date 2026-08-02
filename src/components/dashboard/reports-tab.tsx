"use client"

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useTenant } from '@/app/lib/tenant-context';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { TrendingUp, TrendingDown, Calendar, Building2, PieChart as PieChartIcon, Download, Gift, Trophy, Trash2, Edit3, ShoppingBag, ChevronDown, ChevronUp } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, Legend, BarChart, Bar, YAxis, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { useSales } from '@/hooks/use-sales';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { useInventory } from '@/hooks/use-inventory';
import { StaffShiftsReport } from './staff-shifts-report';
import { useUser } from '@/firebase/auth/use-user';
import { usePinApproval } from '@/hooks/use-pin-approval';
import { useToast } from '@/hooks/use-toast';
import { deleteSale } from '@/firebase/firestore/retail-actions';
import { EditTransactionModal } from './retail/edit-transaction-modal';

// Specialized Retail Metrics for benta-snap
function RetailMetrics({ selectedDate }: { selectedDate: Date | { start: Date, end: Date } }) {
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

// Specialized Lending Metrics for 5-6-tracker
function LendingMetrics({ expenseTxs, incomeTxs, borrowers }: { expenseTxs: any[], incomeTxs: any[], borrowers: any[] }) {
  const loansReleased = expenseTxs.filter(t => t.category === 'Lending').reduce((acc, t) => acc + (t.totalPesos || 0), 0);
  const collections = incomeTxs.filter(t => t.category === 'Lending').reduce((acc, t) => acc + (t.totalPesos || 0), 0);

  // Calculate efficiency
  const activeDebtors = borrowers.filter(b => b.status === 'active');
  let targetCollection = activeDebtors.reduce((acc, b) => acc + (b.dailyDue || 0), 0) / 100;
  // If target drops below collections because some debtors fully paid today, ensure target is at least the amount collected
  targetCollection = Math.max(targetCollection, collections);
  
  const efficiency = targetCollection > 0 ? Math.min((collections / targetCollection) * 100, 100) : 0;

  const topDelinquents = borrowers
    .filter(b => b.status === 'active' && (b.missedDays || 0) > 0)
    .sort((a, b) => (b.missedDays || 0) - (a.missedDays || 0))
    .slice(0, 3);

  const goodPayers = borrowers
    .filter(b => b.status === 'active' && (b.missedDays || 0) === 0)
    .sort((a, b) => (b.outstanding || 0) - (a.outstanding || 0))
    .slice(0, 3);

  return (
    <>
      <Card className="col-span-2 shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
        <CardHeader className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Collection Efficiency</span>
            <span className={cn("text-xs font-black", efficiency >= 80 ? "text-emerald-500" : "text-amber-500")}>
              {efficiency.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div 
              className={cn("h-1.5 rounded-full transition-all", efficiency >= 80 ? "bg-emerald-500" : "bg-amber-500")} 
              style={{ width: `${efficiency}%` }} 
            />
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-1.5 text-[8px] font-bold text-slate-400 uppercase border-t border-slate-50 bg-slate-50/40 mt-3 flex justify-between items-center">
          <span>Collected: ₱{collections.toLocaleString()} / Target: ₱{targetCollection.toLocaleString()}</span>
        </CardContent>
      </Card>

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

      {(topDelinquents.length > 0 || goodPayers.length > 0) && (
        <div className="col-span-2 grid grid-cols-2 gap-3">
          {topDelinquents.length > 0 && (
            <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
              <CardHeader className="p-3 pb-0">
                <span className="text-[8px] font-black uppercase tracking-widest text-red-500">Top Delinquent</span>
              </CardHeader>
              <CardContent className="p-3 pt-2">
                {topDelinquents.map(b => (
                  <div key={b.id} className="flex justify-between items-center mb-1 last:mb-0">
                    <span className="text-[10px] font-bold text-slate-700 truncate">{b.name}</span>
                    <span className="text-[9px] font-black text-red-500">{b.missedDays} missed</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {goodPayers.length > 0 && (
            <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
              <CardHeader className="p-3 pb-0">
                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500">Top Payers</span>
              </CardHeader>
              <CardContent className="p-3 pt-2">
                {goodPayers.map(b => (
                  <div key={b.id} className="flex justify-between items-center mb-1 last:mb-0">
                    <span className="text-[10px] font-bold text-slate-700 truncate">{b.name}</span>
                    <span className="text-[9px] font-black text-emerald-500">Good</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
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

// Specialized Hospitality Metrics for tsek-in
function TsekInMetrics({ incomeTxs }: { incomeTxs: any[] }) {
  const uniqueBookings = new Set(incomeTxs.filter(t => t.referenceId).map(t => t.referenceId));
  const bookingVolume = uniqueBookings.size;
  
  const totalRoomRev = incomeTxs.reduce((acc, t) => acc + (t.totalPesos || 0), 0);
  const arpb = bookingVolume > 0 ? totalRoomRev / bookingVolume : 0;

  return (
    <>
      <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
        <CardHeader className="p-4 pb-0">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Total Bookings</span>
          <h4 className="text-xl font-headline font-black text-slate-800 mt-1">
            {bookingVolume}
          </h4>
        </CardHeader>
        <CardContent className="p-4 pt-1.5 text-[8px] font-bold text-slate-400 uppercase border-t border-slate-50 bg-slate-50/40 mt-3 flex justify-between items-center">
          <span>Unique Stays</span>
        </CardContent>
      </Card>

      <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
        <CardHeader className="p-4 pb-0">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Avg Rev / Booking</span>
          <h4 className="text-xl font-headline font-black text-slate-800 mt-1">
            ₱{arpb.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </h4>
        </CardHeader>
        <CardContent className="p-4 pt-1.5 text-[8px] font-bold text-slate-400 uppercase border-t border-slate-50 bg-slate-50/40 mt-3 flex justify-between items-center">
          <span>ARPB</span>
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
  const { user } = useUser();
  const { requireApproval } = usePinApproval();
  const { toast } = useToast();

  const [dateRangeStr, setDateRangeStr] = useState<string>('today');
  const [mounted, setMounted] = useState(false);
  const [borrowers, setBorrowers] = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [yesterdayIncomePesos, setYesterdayIncomePesos] = useState<number | null>(null);
  const [topReferrers, setTopReferrers] = useState<any[]>([]);
  const [loadingReferrers, setLoadingReferrers] = useState(false);

  // Edit & Void state
  const [selectedSaleToEdit, setSelectedSaleToEdit] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [voidingSaleId, setVoidingSaleId] = useState<string | null>(null);

  const getRangeBounds = (range: string) => {
    const now = new Date();
    switch (range) {
      case 'yesterday': {
        const yest = subDays(now, 1);
        return { start: startOfDay(yest), end: endOfDay(yest) };
      }
      case '7days': {
        return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
      }
      case '30days': {
        return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
      }
      case 'today':
      default: {
        return { start: startOfDay(now), end: endOfDay(now) };
      }
    }
  };

  const { start: rangeStart, end: rangeEnd } = React.useMemo(() => getRangeBounds(dateRangeStr), [dateRangeStr]);
  
  // Load unified sales for gross sales vs discounts visualization
  const { sales } = useSales({ start: rangeStart, end: rangeEnd });
  const totalDiscountsGivenPesos = sales.reduce((acc, sale) => acc + ((sale.discountAmount || 0) / 100), 0);
  const grossSalesBeforeDiscountsPesos = sales.reduce((acc, sale) => acc + ((sale.subtotalAmount || sale.totalAmount || 0) / 100), 0);

  // Load unified master ledger transactions
  useEffect(() => {
    if (!currentTenant) return;

    setLoadingTx(true);
    const { db } = initializeFirebase();

    const yesterdayStart = startOfDay(subDays(rangeStart, 1));
    const yesterdayEnd = endOfDay(subDays(rangeStart, 1));

    const txRef = collection(db, 'tenants', currentTenant.id, 'transactions');
    const q = query(
      txRef,
      where('createdAt', '>=', Timestamp.fromDate(rangeStart)),
      where('createdAt', '<=', Timestamp.fromDate(rangeEnd)),
      orderBy('createdAt', 'desc')
    );

    const handleSnapshot = (snap: any) => {
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
    };

    let unsubscribe: any = null;
    if (dateRangeStr === 'today') {
      unsubscribe = onSnapshot(q, handleSnapshot);
    } else {
      getDocs(q).then(handleSnapshot).catch(err => {
        console.error("Error loading master ledger", err);
        setTransactions([]);
        setLoadingTx(false);
      });
    }

    const yQuery = query(
      txRef,
      where('createdAt', '>=', Timestamp.fromDate(yesterdayStart)),
      where('createdAt', '<=', Timestamp.fromDate(yesterdayEnd))
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

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentTenant?.id, dateRangeStr, rangeStart, rangeEnd]);

  // Load Top Referrers
  useEffect(() => {
    if (!currentTenant) return;
    setLoadingReferrers(true);
    const { db } = initializeFirebase();
    const q = query(
      collection(db, 'tenants', currentTenant.id, 'customers'),
      where('totalReferrals', '>', 0),
      orderBy('totalReferrals', 'desc')
    );
    getDocs(q).then(snap => {
      const refs = snap.docs.slice(0, 5).map(d => ({ id: d.id, ...d.data() }));
      setTopReferrers(refs);
      setLoadingReferrers(false);
    }).catch(() => setLoadingReferrers(false));

    if (currentTenant.moduleType === '5-6-tracker') {
      getDocs(collection(db, 'tenants', currentTenant.id, 'borrowers')).then(snap => {
        setBorrowers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    }
  }, [currentTenant?.id]);

  const handleVoidTransaction = async (sale: any) => {
    if (!currentTenant || !sale?.id) return;

    const approved = await requireApproval("I-authorize ang pag-void ng benta sa Report Tab");
    if (!approved) return;

    if (!window.confirm(`Sigurado ka bang gusto mong i-void ang sales transaction (${sale.id.slice(0, 8)})? Ang stock ng paninda ay ibabalik sa inventory.`)) {
      return;
    }

    try {
      setVoidingSaleId(sale.id);
      await deleteSale(
        currentTenant.id,
        sale.id,
        user?.uid || 'system',
        user?.displayName || user?.email || 'Manager'
      );

      toast({
        title: "Na-void na ang sale",
        description: `Na-void ang transaction at naibalik ang stock sa inventory.`,
      });
    } catch (err: any) {
      console.error("Error voiding transaction:", err);
      toast({
        variant: "destructive",
        title: "Nagka-error sa pag-void",
        description: err.message || "Hindi ma-void ang sales transaction.",
      });
    } finally {
      setVoidingSaleId(null);
    }
  };

  const handleOpenEditModal = async (sale: any) => {
    const approved = await requireApproval("I-authorize ang pag-edit ng benta sa Report Tab");
    if (!approved) return;

    setSelectedSaleToEdit(sale);
    setIsEditModalOpen(true);
  };

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

  const pieChartData = Object.entries(revenueByCategory).map(([name, value]) => ({ name, value }));
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  // Dynamic Chart Scale Mapping
  const isMultiDay = dateRangeStr === '7days' || dateRangeStr === '30days';
  
  let dualChartData: any[] = [];
  
  if (!isMultiDay) {
    // Hourly Activity Data (8 AM to 10 PM)
    dualChartData = Array.from({ length: 15 }, (_, i) => {
      const hourNum = i + 8;
      const hourLabel = hourNum > 12 ? `${hourNum - 12}pm` : hourNum === 12 ? `12pm` : `${hourNum}am`;
      return { name: hourLabel, income: 0, expense: 0 };
    });

    transactions.forEach(t => {
      if (t.timestamp) {
        const dateObj = t.timestamp.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        const hour = dateObj.getHours();
        if (hour >= 8 && hour <= 22) {
          if (t.type === 'income') {
            dualChartData[hour - 8].income += t.totalPesos || 0;
          } else if (t.type === 'expense') {
            dualChartData[hour - 8].expense += t.totalPesos || 0;
          }
        }
      }
    });
  } else {
    // Daily Activity Data
    const daysMap: Record<string, { name: string, income: number, expense: number }> = {};
    const numDays = dateRangeStr === '7days' ? 7 : 30;
    
    // Pre-fill days array to keep order
    for (let i = numDays; i >= 0; i--) {
      const targetDate = subDays(rangeEnd, i);
      const dateKey = format(targetDate, 'yyyy-MM-dd');
      const label = format(targetDate, numDays === 7 ? 'EEE' : 'MMM d');
      daysMap[dateKey] = { name: label, income: 0, expense: 0 };
    }

    transactions.forEach(t => {
      if (t.timestamp) {
        const dateObj = t.timestamp.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        const dateKey = format(dateObj, 'yyyy-MM-dd');
        if (daysMap[dateKey]) {
          if (t.type === 'income') {
            daysMap[dateKey].income += t.totalPesos || 0;
          } else if (t.type === 'expense') {
            daysMap[dateKey].expense += t.totalPesos || 0;
          }
        }
      }
    });

    dualChartData = Object.values(daysMap);
  }

  // Top 5 Best-Selling Products Aggregation
  const productSales: Record<string, { name: string, revenue: number }> = {};
  
  incomeTxs.forEach(tx => {
    if (tx.items && Array.isArray(tx.items)) {
      tx.items.forEach((item: any) => {
        const id = item.productId || item.id || item.name;
        if (!id) return;
        
        if (!productSales[id]) {
          productSales[id] = { name: item.name || 'Unknown Item', revenue: 0 };
        }
        
        const price = (item.sellingPrice || item.price || 0) / (item.sellingPrice ? 100 : 1);
        const qty = item.quantity || 1;
        const totalRev = item.total ? (item.total / 100) : (price * qty);
        
        productSales[id].revenue += totalRev;
      });
    }
  });

  const topProductsData = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map(p => ({
      name: p.name.length > 12 ? p.name.substring(0, 12) + '...' : p.name,
      revenue: p.revenue
    }));

  const isRetail = currentTenant?.moduleType === 'benta-snap' || currentTenant?.moduleType === 'build-stack';
  const isLending = currentTenant?.moduleType === '5-6-tracker';
  const isService = currentTenant?.moduleType === 'wellness-pro' || currentTenant?.moduleType === 'auto-boss' || currentTenant?.moduleType === 'spin-snap';
  const isTsekIn = currentTenant?.moduleType === 'tsek-in' || currentTenant?.moduleType === 'hospitality';

  const handleExportCSV = () => {
    if (transactions.length === 0) {
      alert("No data to export for this date.");
      return;
    }

    const headers = ["Date", "Type", "Amount", "Payment Method", "Category"];
    const rows = transactions.map(t => {
      const dateStr = t.timestamp ? (t.timestamp.toDate ? t.timestamp.toDate() : new Date(t.timestamp)).toLocaleString() : "";
      return [
        `"${dateStr}"`,
        t.type,
        t.totalPesos,
        t.paymentMethod || "cash",
        t.category || ""
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `katuwang_ledger_${format(rangeStart, 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

        {/* Date Selector & CSV Export */}
        <div className="bg-white border border-slate-200/60 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-sm gap-3">
          <div className="flex items-center gap-2 text-slate-500 font-bold text-xs w-full sm:w-auto">
            <Calendar className="h-4.5 w-4.5 text-slate-400" />
            <span className="whitespace-nowrap">Petsa:</span>
            <span className="font-extrabold text-slate-800 line-clamp-1">
              {mounted ? (
                dateRangeStr === 'today' || dateRangeStr === 'yesterday' 
                  ? format(rangeStart, 'MMM d, yyyy')
                  : `${format(rangeStart, 'MMM d')} - ${format(rangeEnd, 'MMM d, yyyy')}`
              ) : (
                '...'
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select 
              value={dateRangeStr}
              onChange={(e) => setDateRangeStr(e.target.value)}
              className="flex-1 sm:flex-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-700 cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
            </select>
            <Button 
              onClick={handleExportCSV}
              variant="outline"
              size="icon"
              className="bg-white border-slate-200 text-slate-700 shrink-0"
              title="Export to CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Universal Top-Level Metric Card */}
        <Card className="shadow-sm border-transparent rounded-[28px] overflow-hidden text-white relative" style={{ backgroundColor: theme.primary }}>
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <PieChartIcon className="h-24 w-24" />
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
            {yesterdayIncomePesos !== null && dateRangeStr === 'today' && (
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
        {mounted && pieChartData.length > 0 && (
          <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white mt-1">
             <CardHeader className="p-5 pb-0">
               <div>
                 <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Revenue Stream Breakdown</span>
                 <CardTitle className="text-sm font-headline font-black text-slate-800 mt-1">
                   Category Distribution
                 </CardTitle>
               </div>
             </CardHeader>
             <CardContent className="p-5 pt-0">
                <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [`₱${value.toLocaleString('en-PH', {minimumFractionDigits: 2})}`, 'Revenue']}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontWeight: 'bold' }}
                      itemStyle={{ color: '#0f172a' }}
                    />
                    <Legend 
                      layout="horizontal" 
                      verticalAlign="bottom" 
                      align="center"
                      iconType="circle"
                      wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '15px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
             </CardContent>
          </Card>
        )}

        {/* Dynamic Module-Specific Metrics Row */}
        <div className="grid grid-cols-2 gap-3">
          {isRetail && <RetailMetrics selectedDate={{ start: rangeStart, end: rangeEnd }} />}
          {isLending && <LendingMetrics expenseTxs={expenseTxs} incomeTxs={incomeTxs} borrowers={borrowers} />}
          {isService && <ServiceMetrics incomeTxs={incomeTxs} />}
          {isTsekIn && <TsekInMetrics incomeTxs={incomeTxs} />}
          
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

        {/* Profit & Loss Statement */}
        <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white mt-1">
          <CardHeader className="p-5 pb-0">
             <div className="flex justify-between items-center">
               <div>
                 <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Executive Summary</span>
                 <CardTitle className="text-sm font-headline font-black text-slate-800 mt-1">
                   Profit & Loss Statement
                 </CardTitle>
               </div>
               <Badge variant="outline" className="text-[8px] font-black uppercase bg-slate-50 border-slate-200 text-slate-400 px-2 py-0.5 rounded-full">
                 {dateRangeStr === 'today' ? 'Today' : dateRangeStr === 'yesterday' ? 'Yesterday' : dateRangeStr === '7days' ? 'Last 7 Days' : 'Last 30 Days'}
               </Badge>
             </div>
          </CardHeader>
          <CardContent className="p-5 pt-4 space-y-4">
             {/* Gross Sales vs Discounts Visualization */}
             {grossSalesBeforeDiscountsPesos > 0 && (
               <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-4 space-y-3">
                 <div className="flex justify-between items-center">
                   <span className="text-xs font-black uppercase tracking-widest text-slate-500">Gross Sales (Pre-Discount)</span>
                   <span className="text-sm font-black text-slate-800">₱{grossSalesBeforeDiscountsPesos.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
                 </div>
                 
                 <div className="flex items-center gap-3">
                   <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden flex">
                     <div 
                       className="bg-emerald-500 h-full"
                       style={{ width: `${Math.max(0, 100 - (totalDiscountsGivenPesos / grossSalesBeforeDiscountsPesos) * 100)}%` }}
                     />
                     <div 
                       className="bg-rose-400 h-full"
                       style={{ width: `${(totalDiscountsGivenPesos / grossSalesBeforeDiscountsPesos) * 100}%` }}
                     />
                   </div>
                 </div>
                 
                 <div className="flex justify-between items-center text-xs font-bold">
                   <span className="text-emerald-600 flex items-center gap-1">
                     <div className="w-2 h-2 rounded-full bg-emerald-500" />
                     Net: ₱{(grossSalesBeforeDiscountsPesos - totalDiscountsGivenPesos).toLocaleString('en-PH', {minimumFractionDigits: 2})}
                   </span>
                   <span className="text-rose-500 flex items-center gap-1">
                     Total Discounts Given: ₱{totalDiscountsGivenPesos.toLocaleString('en-PH', {minimumFractionDigits: 2})}
                     <div className="w-2 h-2 rounded-full bg-rose-400" />
                   </span>
                 </div>
               </div>
             )}

             <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-slate-500">Gross Revenue</span>
               <span className="text-sm font-black text-slate-800">₱{grossIncomePesos.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
             </div>
             <div className="flex justify-between items-center border-b border-slate-100 pb-3">
               <span className="text-xs font-bold text-slate-500">Total Expenses</span>
               <span className="text-sm font-black text-rose-600">- ₱{totalExpensesPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
             </div>
             <div className="flex justify-between items-center pt-1">
               <span className="text-xs font-black uppercase tracking-widest text-slate-800">Net Profit</span>
               <span className={cn("text-lg font-headline font-black", (grossIncomePesos - totalExpensesPesos) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                 {((grossIncomePesos - totalExpensesPesos) >= 0 ? "+" : "")} ₱{(grossIncomePesos - totalExpensesPesos).toLocaleString('en-PH', {minimumFractionDigits: 2})}
               </span>
             </div>
          </CardContent>
        </Card>

        {/* Sales Transactions History Log (Edit & Delete/Void Sales) */}
        <section className="space-y-3.5 mt-2">
          <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
            <CardHeader className="p-5 pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Mga Benta at Transaksyon</span>
                  <CardTitle className="text-sm font-headline font-black text-slate-800 mt-1 flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-emerald-600" />
                    Sales Transactions History
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[8px] font-black uppercase bg-emerald-50 border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full">
                  {sales.length} Records
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-3">
              {sales.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-2xl">
                  <ShoppingBag className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                  <p className="text-xs text-slate-400 font-medium">Walang nahanap na sales transaction sa napiling petsa.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sales.map((sale: any) => {
                    const isExpanded = expandedSaleId === sale.id;
                    const items = sale.items || [];
                    const isVoiding = voidingSaleId === sale.id;
                    const formattedDate = sale.createdAt?.toDate
                      ? format(sale.createdAt.toDate(), 'h:mm a • MMM d')
                      : sale.createdAt
                      ? format(new Date(sale.createdAt), 'h:mm a • MMM d')
                      : 'Unknown time';

                    return (
                      <div 
                        key={sale.id} 
                        className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 transition-all hover:bg-slate-100/50 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 font-headline font-black text-xs shrink-0 shadow-sm">
                              ₱
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-800">
                                  ₱{((sale.totalAmount || 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                </span>
                                <Badge className={cn(
                                  "text-[8px] font-black uppercase px-2 py-0.5 rounded-full border-none",
                                  sale.paymentMethod === 'palista' 
                                    ? "bg-amber-100 text-amber-800" 
                                    : sale.paymentMethod === 'gcash' 
                                    ? "bg-blue-100 text-blue-800" 
                                    : "bg-emerald-100 text-emerald-800"
                                )}>
                                  {sale.paymentMethod || 'cash'}
                                </Badge>
                              </div>
                              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                {formattedDate} • {items.length} item{items.length !== 1 ? 's' : ''}
                                {sale.palistaName ? ` • ${sale.palistaName}` : ''}
                              </p>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                              className="h-8 w-8 p-0 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-white"
                              title="Tignan ang Items"
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenEditModal(sale)}
                              className="h-8 px-2.5 rounded-xl border-slate-200 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 text-xs font-bold gap-1"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-indigo-500" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isVoiding}
                              onClick={() => handleVoidTransaction(sale)}
                              className="h-8 px-2.5 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold gap-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {isVoiding ? 'Voiding...' : 'Void'}
                            </Button>
                          </div>
                        </div>

                        {/* Expanded Item Details */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-slate-200/60 text-xs space-y-1.5 bg-white p-3 rounded-xl">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                              Mga Binili (Items Breakdown):
                            </span>
                            {items.length === 0 ? (
                              <p className="text-[10px] text-slate-400 italic">Walang detalye ng items.</p>
                            ) : (
                              items.map((it: any, i: number) => (
                                <div key={i} className="flex justify-between items-center text-slate-700 text-[11px] font-medium">
                                  <span>
                                    {it.name || 'Product Item'} <span className="text-slate-400 font-bold">x{it.quantity}</span>
                                  </span>
                                  <span className="font-bold">
                                    ₱{((it.price * it.quantity) / (it.price > 1000 ? 100 : 1)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))
                            )}
                            {sale.discountAmount > 0 && (
                              <div className="flex justify-between items-center text-rose-600 text-[11px] font-bold pt-1 border-t border-dashed border-slate-100">
                                <span>Discount ({sale.discountType || 'applied'})</span>
                                <span>- ₱{(sale.discountAmount / 100).toFixed(2)}</span>
                              </div>
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

        {/* 3-Tier Accounting Breakdown: Assets vs OPEX vs Spoilage */}
        <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
          <CardHeader className="p-5 pb-0">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Financial Structure</span>
            <CardTitle className="text-sm font-headline font-black text-slate-800 mt-1">
              Asset, OPEX & Waste Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-3 space-y-3">
            <div className="p-3 bg-slate-900 text-white rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-cyan-400 block">1. Inventory Asset (Stock Capital)</span>
                <p className="text-[10px] text-slate-300">Puhunan sa mga paninda sa inventory (Stock Valuation)</p>
              </div>
              <span className="text-sm font-black text-white">
                ₱{inventory.reduce((acc: number, p: any) => acc + ((p.currentStock || 0) * (p.costPrice || 0) / 100), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-rose-700 block">2. Operating Expenses (OPEX)</span>
                <p className="text-[10px] text-rose-500">Kuryente, renta, packaging, fuel (Logged via Gastos)</p>
              </div>
              <span className="text-sm font-black text-rose-700">
                ₱{totalExpensesPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-800 block">3. Spoilage & Waste Write-Offs</span>
                <p className="text-[10px] text-amber-600">Sira o na-spoil na paninda (Logged via Waste/Tapon)</p>
              </div>
              <span className="text-sm font-black text-amber-800">
                ₱{expenseTxs.filter((t: any) => t.category?.toLowerCase().includes('tapon') || t.category?.toLowerCase().includes('spoilage') || t.category?.toLowerCase().includes('waste')).reduce((acc: number, t: any) => acc + (t.totalPesos || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Dynamic Area Graphic Chart (SVG area chart gradient) */}
        <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
          <CardHeader className="p-5 pb-0">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                  {isMultiDay ? "Daloy ng Kita Kada Araw" : "Daloy ng Kita Kada Oras"}
                </span>
                <CardTitle className="text-sm font-headline font-black text-slate-800 mt-1">
                  {isMultiDay ? "Daily Trends" : "8:00 AM - 10:00 PM Activity"}
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[8px] font-black uppercase bg-slate-50 border-slate-200 text-slate-400 px-2 py-0.5 rounded-full">
                {isMultiDay ? "Daily Scale" : "Hourly Peak"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-4">
            <ResponsiveContainer width="100%" height={160} minWidth={0} minHeight={0}>
                <AreaChart data={dualChartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={theme.primary} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={theme.primary} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 'bold' }}
                    minTickGap={20}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontWeight: 'bold' }}
                    labelStyle={{ color: '#64748b', fontSize: '10px', letterSpacing: '0.1em' }}
                    formatter={(value: number, name: string) => {
                      const formatted = `₱${value.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
                      return [formatted, name === 'income' ? 'Kita (Income)' : 'Gastos (Expense)'];
                    }}
                  />
                  <Legend 
                    iconType="circle"
                    wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }}
                    formatter={(value) => value === 'income' ? 'Kabuuang Kita' : 'Gastos'}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="income" 
                    stroke={theme.primary} 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorIncome)" 
                    animationDuration={1500}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="expense" 
                    stroke="#f43f5e" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorExpense)" 
                    animationDuration={1500}
                  />
                </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top 5 Best-Selling Products Bar Chart */}
        {mounted && topProductsData.length > 0 && (
          <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
            <CardHeader className="p-5 pb-0">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Top 5 Best-Sellers</span>
                  <CardTitle className="text-sm font-headline font-black text-slate-800 mt-1">
                    Revenue Leaders
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[8px] font-black uppercase bg-slate-50 border-slate-200 text-slate-400 px-2 py-0.5 rounded-full">
                  By Revenue
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-4">
              <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                  <BarChart data={topProductsData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis 
                      type="number" 
                      hide={true} 
                    />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} 
                      width={80}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontWeight: 'bold' }}
                      labelStyle={{ color: '#64748b', fontSize: '10px', letterSpacing: '0.1em' }}
                      formatter={(value: number) => {
                        return [`₱${value.toLocaleString('en-PH', {minimumFractionDigits: 2})}`, 'Revenue'];
                      }}
                    />
                    <Bar 
                      dataKey="revenue" 
                      fill={theme.primary} 
                      radius={[0, 8, 8, 0]}
                      barSize={20}
                      animationDuration={1500}
                    />
                  </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Loyalty & Referrals Leaderboard */}
        <section className="space-y-3.5">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-pink-400" />
            <h3 className="text-base font-headline font-black text-slate-800">Loyalty & Referrals</h3>
          </div>

          <Card className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden bg-white">
            <CardHeader className="p-5 pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Top 5 Nagpadala ng Kliyente</span>
                  <CardTitle className="text-sm font-headline font-black text-slate-800 mt-1">
                    Referral Leaderboard
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[8px] font-black uppercase bg-pink-50 border-pink-100 text-pink-500 px-2 py-0.5 rounded-full">
                  ₱10 per Referral
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-2">
              {loadingReferrers ? (
                <p className="text-xs text-slate-400 text-center py-4">Loading referrers...</p>
              ) : topReferrers.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-slate-100 rounded-2xl">
                  <Gift className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                  <p className="text-xs text-slate-400 font-medium">No referrals yet. Share referral codes!</p>
                </div>
              ) : (
                topReferrers.map((ref, idx) => (
                  <div key={ref.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded-xl flex items-center justify-center font-black text-sm text-white shrink-0"
                        style={{ backgroundColor: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : '#e2e8f0' }}
                      >
                        {idx === 0 ? <Trophy className="h-4 w-4" /> : `#${idx + 1}`}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800 font-mono tracking-widest">{ref.referralCode}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{ref.phoneNumber}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black" style={{ color: theme.primary }}>{ref.totalReferrals}</p>
                      <p className="text-[9px] text-slate-400 uppercase font-bold">referrals</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        {/* Staff Shifts Report */}
        <StaffShiftsReport />

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

        {/* Edit Transaction Modal */}
        {selectedSaleToEdit && (
          <EditTransactionModal
            open={isEditModalOpen}
            onOpenChange={setIsEditModalOpen}
            sale={selectedSaleToEdit}
            tenantId={currentTenant?.id || ''}
            userId={user?.uid || ''}
            userName={user?.displayName || user?.email || 'Manager'}
            products={(inventory || []) as any}
            onSuccess={() => {
              toast({
                title: "Na-update na ang Sale",
                description: "Na-save ang pagbabago sa sales transaction at na-adjust ang inventory/ledger.",
              });
            }}
          />
        )}

      </main>
    </div>
  );
}
