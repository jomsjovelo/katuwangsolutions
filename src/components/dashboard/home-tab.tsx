"use client"

import React, { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { useSales } from '@/hooks/use-sales';
import { useInventory } from '@/hooks/use-inventory';
import { usePWAInstall } from '@/hooks/use-pwa-install';
import { getModuleTheme } from '@/lib/theme-utils';
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
  Smartphone
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function HomeTab({ setTab }: { setTab?: (tab: string) => void }) {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const theme = getModuleTheme(currentTenant?.moduleType);
  
  const [selectedDate] = useState<Date>(new Date());
  const { dailyTotalPesos, loading: salesLoading } = useSales(selectedDate);
  const { products, lowStockItems, outOfStockItems, loading: inventoryLoading } = useInventory();
  const { deferredPrompt, isInstalled, triggerInstall } = usePWAInstall();

  // Dynamic greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Magandang Umaga';
    if (hour < 18) return 'Magandang Hapon';
    return 'Magandang Gabi';
  };

  // Mock data for Recent Activity until hooked up to real Firestore transactions
  const recentActivity = [
    { id: 1, type: 'sale', title: 'New Sale Completed', amount: 1250, time: '10 mins ago', icon: ShoppingCart, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 2, type: 'stock', title: 'Restocked Kopiko', amount: null, time: '1 hour ago', icon: Package, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 3, type: 'sale', title: 'New Sale Completed', amount: 450, time: '2 hours ago', icon: ShoppingCart, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 4, type: 'alert', title: 'Low Stock: Safeguard', amount: null, time: '3 hours ago', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
  ];

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pb-24 lg:pb-6">
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
                <p className="text-xs font-bold text-slate-500 mb-1">Today's Revenue</p>
                <h3 className="text-2xl font-black tracking-tighter text-slate-900">
                  {salesLoading ? "..." : `₱${dailyTotalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                </h3>
              </div>
            </CardContent>
          </Card>

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
        </section>

        {/* Phase 2: Aggressive PWA Install Prompt */}
        {!isInstalled && deferredPrompt && (
          <section className="animate-in fade-in slide-in-from-top-4 duration-500 delay-300">
            <Card className="rounded-[24px] overflow-hidden border-2 border-emerald-500 shadow-xl shadow-emerald-500/10">
              <CardContent className="p-0">
                <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 p-6 text-white flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
                      <Smartphone className="h-8 w-8 text-white animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black font-headline tracking-tighter">I-Install ang Katuwang App sa iyong Phone!</h3>
                      <p className="text-xs text-emerald-50 font-medium">Mas mabilis at pwede gamitin kahit walang internet (Offline Mode).</p>
                    </div>
                  </div>
                  <Button 
                    onClick={triggerInstall}
                    className="w-full md:w-auto h-12 bg-white text-emerald-600 hover:bg-emerald-50 font-black tracking-widest uppercase text-xs rounded-xl shadow-lg active:scale-95 transition-transform"
                  >
                    I-INSTALL NGAYON
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Phase 3: Restock Watchlist (Low Stock Widget) */}
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

        {/* Quick Actions */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button 
              onClick={() => setTab?.('benta')}
              className={cn(
                "h-14 rounded-2xl font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2",
                theme.primaryBg, "text-white hover:opacity-90 border-none"
              )}
            >
              <ShoppingCart className="h-4 w-4" /> New Sale
            </Button>
            <Button 
              onClick={() => setTab?.('stock')}
              className="h-14 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Recent Activity</h3>
            <button 
              onClick={() => setTab?.('ulat')}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
            >
              View Reports <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          
          <Card className="rounded-[24px] border-slate-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-100">
              {recentActivity.map((activity) => (
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
              ))}
            </div>
          </Card>
        </section>

      </main>
    </div>
  );
}
