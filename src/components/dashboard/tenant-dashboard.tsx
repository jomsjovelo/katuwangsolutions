"use client"

import React, { useState, useEffect } from 'react';
// FIX S2-3: Static ES imports replace dynamic require() calls that were inside useEffect
import { doc, onSnapshot } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

import { useTenant } from '@/app/lib/tenant-context';
import dynamic from 'next/dynamic';
import { useFirestoreDocument } from '@/hooks/use-firestore-subscription';

// Phase 2: Lazy Load heavy module components to drastically shrink initial JS bundle
const BentaDashboard = dynamic(() => import('@/components/dashboard/retail/benta-dashboard').then(m => m.BentaDashboard));
const BuildStackDashboard = dynamic(() => import('@/components/dashboard/retail/build-stack-dashboard').then(m => m.BuildStackDashboard));
const HiramDashboard = dynamic(() => import('@/components/dashboard/hiram-dashboard').then(m => m.HiramDashboard));
const ReportsTab = dynamic(() => import('@/components/dashboard/reports-tab').then(m => m.ReportsTab));
const ServiceDashboard = dynamic(() => import('@/components/dashboard/service/service-dashboard').then(m => m.ServiceDashboard));
const LedgerDashboard = dynamic(() => import('@/components/dashboard/finance/ledger-dashboard').then(m => m.LedgerDashboard));
const PayrollDashboard = dynamic(() => import('@/components/dashboard/finance/payroll-dashboard').then(m => m.PayrollDashboard));
const FoodDashboard = dynamic(() => import('@/components/dashboard/food/food-dashboard').then(m => m.FoodDashboard));
const TimplaDashboard = dynamic(() => import('@/components/dashboard/food/timpla-dashboard').then(m => m.TimplaDashboard));
const GanapDashboard = dynamic(() => import('@/components/dashboard/events/ganap-dashboard').then(m => m.GanapDashboard));
const SpinDashboard = dynamic(() => import('@/components/dashboard/service/spin-dashboard').then(m => m.SpinDashboard));
const HydroDashboard = dynamic(() => import('@/components/dashboard/service/hydro-dashboard').then(m => m.HydroDashboard));
const AutoBossDashboard = dynamic(() => import('@/components/dashboard/service/auto-boss-dashboard').then(m => m.AutoBossDashboard));
const WellnessDashboard = dynamic(() => import('@/components/dashboard/service/wellness-dashboard').then(m => m.WellnessDashboard));
const TrimTrackDashboard = dynamic(() => import('@/components/dashboard/service/trim-track-dashboard').then(m => m.TrimTrackDashboard));
const RepSyncDashboard = dynamic(() => import('@/components/dashboard/service/rep-sync-dashboard').then(m => m.RepSyncDashboard));
const FleetDashboard = dynamic(() => import('@/components/dashboard/logistics/fleet-dashboard').then(m => m.FleetDashboard));

const ProfileTab = dynamic(() => import('@/components/dashboard/profile-tab').then(m => m.ProfileTab));
const StockTab = dynamic(() => import('@/components/dashboard/stock-tab').then(m => m.StockTab));

import { KatuwangErrorBoundary } from '@/components/common/error-boundary';
import { SnapDate } from '@/components/snap-date';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Box, 
  TrendingUp, 
  AlertTriangle, 
  Package, 
  UserPlus,
  ShoppingCart,
  Menu,
  ChevronRight,
  LogOut,
  CreditCard
} from "lucide-react";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useUserTenants } from '@/hooks/use-user-tenants';
import { useInventory } from '@/hooks/use-inventory';
import { useSales } from '@/hooks/use-sales';
import { useUser } from '@/firebase/auth/use-user';

import { useTenantStore } from '@/store/use-tenant-store';

export function TenantDashboard({ activeTab }: { activeTab?: string }) {
  const { user } = useUser();
  const db = initializeFirebase().db;
  
  // Phase 1: Safely subscribe to profile without raw onSnapshot
  const { data: profile } = useFirestoreDocument(user ? doc(db, 'users', user.uid) : null);
  
  const { currentTenant, setCurrentTenant, allTenants, isLoading: storeLoading } = useTenant();
  const { activeModuleOverride } = useTenantStore();
  const { loading: tenantsLoading } = useUserTenants();
  const { products, loading: inventoryLoading } = useInventory();
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { dailyTotalPesos, loading: salesLoading } = useSales(selectedDate);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch or show loading while fetching real data
  if (!mounted || tenantsLoading || storeLoading || inventoryLoading || salesLoading) {
    return (
      <div className="flex-1 bg-background min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary"></div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 animate-pulse">Syncing Environment</p>
        </div>
      </div>
    );
  }

  if (!currentTenant) {
    return (
      <div className="flex-1 flex flex-col p-6 bg-background">
        <div className="my-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="h-10 w-10 mx-auto mb-4 bg-primary rounded-xl flex items-center justify-center text-white font-black">K</div>
            <h1 className="text-4xl font-headline font-black uppercase tracking-tighter">Choose Module</h1>
            <p className="text-muted-foreground text-sm">Select a business profile to enter the Katuwang Environment.</p>
          </div>
          <div className="grid gap-4">
            {allTenants.map((t, index) => (
              <Button 
                key={t.id} 
                variant="outline" 
                className={cn(
                  "h-20 flex justify-between items-center group hover:border-primary px-6 rounded-2xl w-full transition-all active:scale-95",
                  index % 2 === 0 ? "antigravity-float" : "antigravity-float-slow"
                )}
                style={{ animationDelay: `${index * 0.2}s` }}
                onClick={() => setCurrentTenant(t)}
              >
                <div className="text-left">
                  <div className="font-bold text-lg">{t.name}</div>
                  <div className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">{t.moduleType}</div>
                </div>
                <div className="flex items-center gap-2">
                  {t.subscriptionStatus === 'pending' && <Badge variant="secondary" className="text-[8px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 border-none">Pending</Badge>}
                  <ChevronRight className="h-6 w-6 group-hover:text-primary transition-colors" />
                </div>
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Helper block for the active industry module
  const renderIndustryDashboard = () => {
    const activeModule = activeModuleOverride || currentTenant.moduleType;

    if (activeModule === 'hiram-snap') return <HiramDashboard />;
    if (activeModule === 'spin-snap') return <SpinDashboard />;
    if (activeModule === 'hydro-sync') return <HydroDashboard />;
    if (activeModule === 'auto-boss') return <AutoBossDashboard />;
    if (activeModule === 'wellness-pro') return <WellnessDashboard />;
    if (activeModule === 'trim-track') return <TrimTrackDashboard />;
    if (activeModule === 'rep-sync') return <RepSyncDashboard />;
    
    const serviceModules = ['unknown'];
    if (serviceModules.includes(activeModule || '')) return <ServiceDashboard />;
    
    if (activeModule === 'ledger-flow') return <LedgerDashboard />;
    if (activeModule === 'sahod-flow') return <PayrollDashboard />;
    if (activeModule === 'timpla-track') return <TimplaDashboard />;
    if (activeModule === 'ganap-master') return <GanapDashboard />;
    
    const foodModules = ['bite-snap'];
    if (foodModules.includes(activeModule || '')) return <FoodDashboard />;
    
    const fleetModules = ['biyahe-sync', 'ani-grow'];
    if (fleetModules.includes(activeModule || '')) return <FleetDashboard />;
    
    if (activeModule === 'build-stack') return <BuildStackDashboard />;
    
    return <BentaDashboard />;
  };

  const isIndustryTab = !['profile', 'stock', 'ulat'].includes(activeTab || 'home');

  return (
    <KatuwangErrorBoundary>
      <div className={activeTab === 'profile' ? 'block' : 'hidden'}>
        <ProfileTab />
      </div>
      
      <div className={activeTab === 'stock' ? 'block' : 'hidden'}>
        <StockTab />
      </div>

      <div className={activeTab === 'ulat' ? 'block' : 'hidden'}>
        {profile?.role === 'staff' ? (
          <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 min-h-screen">
            <div className="text-center space-y-4 max-w-xs bg-white rounded-3xl p-6 border border-slate-200 shadow-sm animate-in fade-in">
              <div className="h-12 w-12 rounded-full bg-amber-50 mx-auto flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <h4 className="font-headline font-black text-sm text-slate-800">Akses Limitado</h4>
                <p className="text-xs text-slate-400 leading-relaxed mt-1">
                  Pasensya na po, Ate/Kuya. Ang mga ulat at profit reports ay maaari lamang makita ng Store Owner.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <ReportsTab />
        )}
      </div>

      <div className={isIndustryTab ? 'block' : 'hidden'}>
        {renderIndustryDashboard()}
      </div>
    </KatuwangErrorBoundary>
  );
}
