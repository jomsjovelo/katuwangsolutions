"use client"

import React, { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { useSales } from '@/hooks/use-sales';
import { useInventory } from '@/hooks/use-inventory';
import { usePWAInstall } from '@/hooks/use-pwa-install';
import { getModuleTheme } from '@/lib/theme-utils';
import { collection, onSnapshot, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useActivityLogs } from '@/hooks/use-activity-logs';
import { ActivityOrganizer } from './activity-organizer';
import { CreditTracker } from './credit-tracker';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  Package, 
  ShoppingCart, 
  Plus, 
  Calendar,
  Clock,
  ArrowRight,
  Activity,
  AlertTriangle,
  Smartphone,
  Scissors,
  Droplets,
  Utensils,
  Wrench,
  Sparkles,
  Car,
  Home,
  Truck,
  Users,
  Dumbbell,
  Leaf,
  Banknote,
  FileText,
  Calculator,
  Tractor,
  Sprout,
  PartyPopper
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function HomeTab({ setTab }: { setTab?: (tab: string) => void }) {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const theme = getModuleTheme(currentTenant?.moduleType);
  
  const [selectedDate] = useState<Date>(new Date());
  const { sales = [], dailyTotalPesos, loading: salesLoading } = useSales(selectedDate);
  const { products, lowStockItems, outOfStockItems, loading: inventoryLoading } = useInventory();

  // 5-6 Tracker custom state for transactions
  const [creditTransactions, setCreditTransactions] = useState<any[]>([]);
  const [creditTransactionsLoading, setCreditTransactionsLoading] = useState(false);
  const [showOrganizer, setShowOrganizer] = useState(false);
  const { logs: activityLogs, loading: activityLogsLoading } = useActivityLogs();

  useEffect(() => {
    if (currentTenant?.moduleType !== '5-6-tracker') return;
    
    setCreditTransactionsLoading(true);
    const { db } = initializeFirebase();
    const start = new Date();
    start.setHours(0,0,0,0);
    const end = new Date();
    end.setHours(23,59,59,999);

    const q = query(
      collection(db, 'tenants', currentTenant.id, 'transactions'),
      where('timestamp', '>=', Timestamp.fromDate(start)),
      where('timestamp', '<=', Timestamp.fromDate(end)),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs: any[] = [];
      snapshot.forEach(doc => txs.push({ id: doc.id, ...doc.data() }));
      setCreditTransactions(txs);
      setCreditTransactionsLoading(false);
    });

    return () => unsubscribe();
  }, [currentTenant]);

  const displayDailyTotalPesos = currentTenant?.moduleType === '5-6-tracker' 
    ? creditTransactions.filter(tx => tx.type === 'payment').reduce((acc, curr) => acc + curr.amount, 0) / 100
    : dailyTotalPesos;

  const displayLoading = currentTenant?.moduleType === '5-6-tracker' ? creditTransactionsLoading : salesLoading;

  // Dynamic greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Magandang Umaga';
    if (hour < 18) return 'Magandang Hapon';
    return 'Magandang Gabi';
  };

  const getMockActivity = (module: string = 'benta-snap') => {
    const data: Record<string, any[]> = {
      'benta-snap': [
        { id: 1, type: 'sale', title: 'New Sale Completed', amount: 1250, time: '10 mins ago', icon: ShoppingCart, color: 'text-cyan-500', bg: 'bg-cyan-50' },
        { id: 2, type: 'stock', title: 'Restocked Kopiko Brown', amount: null, time: '1 hour ago', icon: Package, color: 'text-blue-500', bg: 'bg-blue-50' },
        { id: 3, type: 'alert', title: 'Low Stock: Safeguard', amount: null, time: '3 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'fresh-tally': [
        { id: 1, type: 'sale', title: 'Sold: 5kg Mangoes', amount: 850, time: '15 mins ago', icon: ShoppingCart, color: 'text-emerald-500', bg: 'bg-emerald-50' },
        { id: 2, type: 'stock', title: 'New Delivery: Cabbage', amount: null, time: '2 hours ago', icon: Leaf, color: 'text-green-500', bg: 'bg-green-50' },
        { id: 3, type: 'alert', title: 'Low Stock: Ripe Bananas', amount: null, time: '5 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'build-stack': [
        { id: 1, type: 'sale', title: 'Sale: Cement (5 Sacks)', amount: 1250, time: '5 mins ago', icon: Wrench, color: 'text-slate-500', bg: 'bg-slate-100' },
        { id: 2, type: 'stock', title: 'Restocked Plywood (1/2)', amount: null, time: '2 hours ago', icon: Package, color: 'text-yellow-600', bg: 'bg-yellow-50' },
        { id: 3, type: 'alert', title: 'Low Stock: Common Nails', amount: null, time: '4 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      '5-6-tracker': [
        { id: 1, type: 'sale', title: 'Payment Received: Juan D.', amount: 500, time: '10 mins ago', icon: Banknote, color: 'text-emerald-500', bg: 'bg-emerald-50' },
        { id: 2, type: 'stock', title: 'New Loan Approved', amount: null, time: '1 hour ago', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
        { id: 3, type: 'alert', title: 'Overdue: Maria Cruz', amount: null, time: '3 hours ago', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
      ],
      'ledger-flow': [
        { id: 1, type: 'sale', title: 'Invoice Paid: Client A', amount: 4500, time: '30 mins ago', icon: Banknote, color: 'text-indigo-500', bg: 'bg-indigo-50' },
        { id: 2, type: 'stock', title: 'Logged Expense: Utilities', amount: null, time: '2 hours ago', icon: Calculator, color: 'text-rose-500', bg: 'bg-rose-50' },
        { id: 3, type: 'alert', title: 'Pending Approval: PR-102', amount: null, time: '5 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'sahod-flow': [
        { id: 1, type: 'sale', title: 'Salary Disbursed', amount: 25000, time: '10 mins ago', icon: Banknote, color: 'text-blue-500', bg: 'bg-blue-50' },
        { id: 2, type: 'stock', title: 'Added New Employee', amount: null, time: '1 hour ago', icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-50' },
        { id: 3, type: 'alert', title: 'Missing DTR: Pedro', amount: null, time: '3 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'biyahe-sync': [
        { id: 1, type: 'sale', title: 'Delivered: Parcel to QC', amount: 150, time: '20 mins ago', icon: Truck, color: 'text-blue-500', bg: 'bg-blue-50' },
        { id: 2, type: 'stock', title: 'Package Received at Hub', amount: null, time: '1 hour ago', icon: Package, color: 'text-orange-500', bg: 'bg-orange-50' },
        { id: 3, type: 'alert', title: 'Delayed: Route B', amount: null, time: '2 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'ani-grow': [
        { id: 1, type: 'sale', title: 'Sold: 10 Sacks Rice', amount: 12000, time: '1 hour ago', icon: Banknote, color: 'text-amber-600', bg: 'bg-amber-50' },
        { id: 2, type: 'stock', title: 'Harvest Logged: Corn', amount: null, time: '3 hours ago', icon: Tractor, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { id: 3, type: 'alert', title: 'Low Stock: Fertilizer', amount: null, time: '1 day ago', icon: Sprout, color: 'text-orange-500', bg: 'bg-orange-50' },
      ],
      'bite-snap': [
        { id: 1, type: 'sale', title: 'Order #102 Served', amount: 450, time: '5 mins ago', icon: Utensils, color: 'text-orange-500', bg: 'bg-orange-50' },
        { id: 2, type: 'stock', title: 'Restocked Coca-Cola', amount: null, time: '1 hour ago', icon: Package, color: 'text-blue-500', bg: 'bg-blue-50' },
        { id: 3, type: 'alert', title: 'Low Stock: Rice', amount: null, time: '2 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'timpla-track': [
        { id: 1, type: 'sale', title: 'Order: Iced Caramel Macchiato', amount: 180, time: '5 mins ago', icon: Utensils, color: 'text-amber-600', bg: 'bg-amber-50' },
        { id: 2, type: 'stock', title: 'Restocked Espresso Beans', amount: null, time: '2 hours ago', icon: Package, color: 'text-stone-600', bg: 'bg-stone-50' },
        { id: 3, type: 'alert', title: 'Low Stock: Almond Milk', amount: null, time: '3 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'ganap-master': [
        { id: 1, type: 'sale', title: 'Booking Confirmed: Wedding', amount: 15000, time: '1 hour ago', icon: PartyPopper, color: 'text-orange-500', bg: 'bg-orange-50' },
        { id: 2, type: 'stock', title: 'Menu Updated', amount: null, time: '3 hours ago', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
        { id: 3, type: 'alert', title: 'Missing Supplier: Flowers', amount: null, time: '5 hours ago', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
      ],
      'spin-snap': [
        { id: 1, type: 'sale', title: 'Laundry Finished: Wash & Fold', amount: 180, time: '15 mins ago', icon: Sparkles, color: 'text-cyan-500', bg: 'bg-cyan-50' },
        { id: 2, type: 'stock', title: 'Restocked Fabric Conditioner', amount: null, time: '2 hours ago', icon: Package, color: 'text-blue-500', bg: 'bg-blue-50' },
        { id: 3, type: 'alert', title: 'Low Stock: Detergent Powder', amount: null, time: '5 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'hydro-sync': [
        { id: 1, type: 'sale', title: 'Delivered: 5 Gallons (Round)', amount: 150, time: '8 mins ago', icon: Droplets, color: 'text-sky-500', bg: 'bg-sky-50' },
        { id: 2, type: 'stock', title: 'Restocked Bottle Caps', amount: null, time: '1 hour ago', icon: Package, color: 'text-teal-500', bg: 'bg-teal-50' },
        { id: 3, type: 'alert', title: 'Low Stock: Plastic Seals', amount: null, time: '3 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'auto-boss': [
        { id: 1, type: 'sale', title: 'Completed: Premium Carwash', amount: 350, time: '5 mins ago', icon: Car, color: 'text-emerald-500', bg: 'bg-emerald-50' },
        { id: 2, type: 'stock', title: 'Restocked Tire Wax', amount: null, time: '1 hour ago', icon: Package, color: 'text-teal-500', bg: 'bg-teal-50' },
        { id: 3, type: 'alert', title: 'Low Stock: Car Shampoo', amount: null, time: '4 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'wellness-pro': [
        { id: 1, type: 'sale', title: 'New Client: Swedish Massage', amount: 800, time: '15 mins ago', icon: Sparkles, color: 'text-purple-500', bg: 'bg-purple-50' },
        { id: 2, type: 'stock', title: 'Restocked Lavender Oil', amount: null, time: '2 hours ago', icon: Package, color: 'text-pink-500', bg: 'bg-pink-50' },
        { id: 3, type: 'alert', title: 'Low Stock: Towels', amount: null, time: '5 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'trim-track': [
        { id: 1, type: 'sale', title: 'Haircut: Fade + Beard Trim', amount: 250, time: '12 mins ago', icon: Scissors, color: 'text-rose-500', bg: 'bg-rose-50' },
        { id: 2, type: 'stock', title: 'Restocked Hair Pomade', amount: null, time: '3 hours ago', icon: Package, color: 'text-purple-500', bg: 'bg-purple-50' },
        { id: 3, type: 'alert', title: 'Low Stock: Neck Strips', amount: null, time: '1 day ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'rep-sync': [
        { id: 1, type: 'sale', title: 'New Member: 1 Month Plan', amount: 1500, time: '30 mins ago', icon: Dumbbell, color: 'text-slate-500', bg: 'bg-slate-100' },
        { id: 2, type: 'stock', title: 'Restocked Whey Protein', amount: null, time: '2 hours ago', icon: Package, color: 'text-blue-500', bg: 'bg-blue-50' },
        { id: 3, type: 'alert', title: 'Low Stock: Bottled Water', amount: null, time: '4 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
      ],
      'rental': [
        { id: 1, type: 'sale', title: 'Rented: Monoblock Chairs (50)', amount: 500, time: '10 mins ago', icon: Users, color: 'text-amber-500', bg: 'bg-amber-50' },
        { id: 2, type: 'stock', title: 'Returned: Videoke Machine', amount: null, time: '1 hour ago', icon: Home, color: 'text-emerald-500', bg: 'bg-emerald-50' },
        { id: 3, type: 'alert', title: 'Overdue: Folding Table', amount: null, time: '2 hours ago', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
      ],
    };
    
    // Default fallback
    return data[module] || data['benta-snap'];
  };

  const isDemo = currentTenant?.id === 'demo' || currentTenant?.name?.toLowerCase().includes('demo');

  let displayActivity: any[] = [];
  
  if (isDemo || !currentTenant) {
    displayActivity = getMockActivity(currentTenant?.moduleType || 'benta-snap');
  } else {
    displayActivity = activityLogs.slice(0, 5);
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pb-24 lg:pb-6 relative">
      {showOrganizer && <ActivityOrganizer onClose={() => setShowOrganizer(false)} />}
      <main className="p-4 space-y-6 max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Dynamic Header */}
        <section 
          className={cn(
            "rounded-[32px] p-6 text-white shadow-xl relative overflow-hidden transition-all duration-500 bg-gradient-to-br",
            theme.primaryBg,
            theme.glowClass
          )}
        >
          <div className="absolute -right-6 -top-6 opacity-10">
            <Activity className="h-48 w-48" />
          </div>
          
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="bg-white/20 text-white font-headline font-extrabold text-[10px] uppercase tracking-wider px-3 py-1 rounded-full backdrop-blur-sm">
                  {currentTenant?.name || "Business Dashboard"}
                </span>
              </div>
              <Clock className="h-5 w-5 text-white/80" />
            </div>
            
            <div>
              <h2 className="text-3xl font-black font-headline tracking-tighter mt-1">
                {getGreeting()}{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}!
              </h2>
              <p className="text-sm text-white/90 font-medium mt-1">
                Here's what's happening today.
              </p>
            </div>
          </div>
        </section>

        {/* Business Pulse Metrics */}
        <section className="grid grid-cols-2 gap-4">
          <Card className="rounded-[24px] border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
              <div className="flex items-center justify-between">
                <div className={cn("p-2 rounded-xl", "bg-emerald-50 text-emerald-600")}>
                  <TrendingUp className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-black uppercase text-slate-400">Today</span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">
                  {currentTenant?.moduleType === '5-6-tracker' ? "Today's Collection" : "Today's Revenue"}
                </p>
                <h3 className="text-2xl font-black tracking-tighter text-slate-900">
                  {displayLoading ? "..." : `₱${displayDailyTotalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                </h3>
              </div>
            </CardContent>
          </Card>

          {currentTenant?.moduleType === '5-6-tracker' ? (
            <Card className="rounded-[24px] border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                <div className="flex items-center justify-between">
                  <div className={cn("p-2 rounded-xl", theme.secondaryBg, theme.secondaryText)}>
                    <Users className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-black uppercase text-slate-400">Borrowers</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-1">Credit Ledger</p>
                  <div className="flex items-end gap-2">
                    <h3 className="text-xl font-black tracking-tighter text-slate-900 mt-1">
                      Pautang
                    </h3>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-[24px] border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                <div className="flex items-center justify-between">
                  <div className={cn("p-2 rounded-xl", theme.secondaryBg, theme.secondaryText)}>
                    <Package className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-black uppercase text-slate-400">Items</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-1">Active Products</p>
                  <div className="flex items-end gap-2">
                    <h3 className="text-2xl font-black tracking-tighter text-slate-900">
                      {inventoryLoading ? "..." : products?.length || 0}
                    </h3>
                    {(outOfStockItems?.length > 0 || lowStockItems?.length > 0) && (
                      <span className="text-xs font-bold text-amber-500 mb-1">
                        ({outOfStockItems?.length + lowStockItems?.length} low)
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </section>



        {/* Phase 3: Restock Watchlist (Low Stock Widget) */}
        {currentTenant?.moduleType !== '5-6-tracker' && (
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Restock Watchlist</h3>
            </div>
          
          <Card className="rounded-[24px] border-slate-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-100">
              {inventoryLoading ? (
                <div className="p-8 text-center text-slate-400 text-xs font-bold animate-pulse">Sumusuri ng inventory...</div>
              ) : outOfStockItems.length === 0 && lowStockItems.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center">
                  <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                    <Package className="h-6 w-6 text-emerald-500" />
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800">Inventory is Healthy</h4>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] leading-relaxed">Walang produkto na ubos o paubos na. Pwede ka mag-relax!</p>
                </div>
              ) : (
                <>
                  {outOfStockItems.map(item => (
                    <div key={item.id} className="p-4 flex items-center gap-4 bg-red-50/30 hover:bg-red-50/50 transition-colors">
                      <div className="p-3 rounded-full bg-red-100 text-red-600 flex-shrink-0">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-slate-900 truncate">{item.name}</p>
                        <p className="text-[10px] font-black uppercase text-red-500 mt-0.5 tracking-wider">UBOS NA</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                          0 {item.unit}
                        </span>
                      </div>
                    </div>
                  ))}
                  {lowStockItems.map(item => (
                    <div key={item.id} className="p-4 flex items-center gap-4 bg-amber-50/30 hover:bg-amber-50/50 transition-colors">
                      <div className="p-3 rounded-full bg-amber-100 text-amber-600 flex-shrink-0">
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-slate-900 truncate">{item.name}</p>
                        <p className="text-[10px] font-black uppercase text-amber-500 mt-0.5 tracking-wider">Paubos Na (Min: {item.minStock})</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-black text-amber-700 bg-amber-100 px-2 py-1 rounded-md border border-amber-200">
                          {item.currentStock} {item.unit} left
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Card>
        </section>
        )}

        {['benta-snap', 'fresh-tally', 'build-stack'].includes(currentTenant?.moduleType || '') && (
          <section className="mt-4">
            <CreditTracker />
          </section>
        )}

        {/* Quick Actions */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Quick Actions</h3>
          </div>
          <div className={cn("grid gap-3", currentTenant?.moduleType === '5-6-tracker' ? "grid-cols-1" : "grid-cols-2")}>
            <Button 
              onClick={() => setTab?.('benta')}
              className={cn(
                "h-14 rounded-2xl font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2",
                theme.primaryBg, "text-white hover:opacity-90 border-none"
              )}
            >
              {currentTenant?.moduleType === '5-6-tracker' ? <><Banknote className="h-4 w-4" /> Buksan ang Ledger</> : <><ShoppingCart className="h-4 w-4" /> New Sale</>}
            </Button>
            {currentTenant?.moduleType !== '5-6-tracker' && (
              <Button 
                onClick={() => setTab?.('stock')}
                className="h-14 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" /> Add Product
              </Button>
            )}
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Recent Activity</h3>
            <button 
              onClick={() => setShowOrganizer(true)}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
            >
              View All Activity <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          
          <Card className="rounded-[24px] border-slate-100 shadow-sm overflow-hidden min-h-[150px]">
            <div className="divide-y divide-slate-100">
              {displayActivity.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center justify-center">
                  <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center mb-2">
                    <Activity className="h-5 w-5 text-slate-400" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-500">Walang activity</h4>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">Simulan nang gamitin ang app para makita ang mga transaksyon dito.</p>
                </div>
              ) : (
                displayActivity.map((activity) => (
                  <div key={activity.id} className="p-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
                    <div className={cn("p-3 rounded-full flex-shrink-0", activity.bg, activity.color)}>
                      <activity.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold text-slate-900 truncate">{activity.title}</p>
                      <p className="text-[10px] font-black uppercase text-slate-400 mt-0.5">{activity.time}</p>
                    </div>
                    {activity.amount && (
                      <div className="text-right flex-shrink-0">
                        <span className="text-sm font-black text-emerald-600">
                          +₱{activity.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </section>

      </main>
    </div>
  );
}
