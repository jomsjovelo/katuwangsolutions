"use client"

import React, { useState, useEffect } from 'react';
// FIX S2-3: Static ES imports replace dynamic require() calls that were inside useEffect
import { doc, onSnapshot } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

import { useTenant } from '@/app/lib/tenant-context';
import dynamic from 'next/dynamic';
import { useFirestoreDocument } from '@/hooks/use-firestore-subscription';
import { getModuleTheme } from '@/lib/theme-utils';
import { ShiftGate } from './shift-gate';
import { PinApprovalModal } from '@/components/common/pin-approval-modal';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';
import { CashierProfileView } from './cashier-profile-view';

// Phase 2: Lazy Load heavy module components to drastically shrink initial JS bundle
const BentaDashboard = dynamic(() => import('@/components/dashboard/retail/benta-dashboard').then(m => m.BentaDashboard));
const FreshTallyDashboard = dynamic(() => import('@/components/dashboard/retail/fresh-tally-dashboard').then(m => m.FreshTallyDashboard));
const BuildStackDashboard = dynamic(() => import('@/components/dashboard/retail/build-stack-dashboard').then(m => m.BuildStackDashboard));
const FiveSixDashboard = dynamic(() => import('@/components/dashboard/five-six-dashboard').then(m => m.FiveSixDashboard));
const ReportsTab = dynamic(() => import('@/components/dashboard/reports-tab').then(m => m.ReportsTab));
const CashierShiftReport = dynamic(() => import('@/components/dashboard/retail/cashier-shift-report').then(m => m.CashierShiftReport));
const ServiceDashboard = dynamic(() => import('@/components/dashboard/service/service-dashboard').then(m => m.ServiceDashboard));
const LedgerDashboard = dynamic(() => import('@/components/dashboard/finance/ledger-dashboard').then(m => m.LedgerDashboard));
const PayrollDashboard = dynamic(() => import('@/components/dashboard/finance/payroll-dashboard').then(m => m.PayrollDashboard));
const BudgetMoDashboard = dynamic(() => import('@/components/dashboard/financial/budget-mo-dashboard').then(m => m.BudgetMoDashboard));
const FoodDashboard = dynamic(() => import('@/components/dashboard/food/food-dashboard').then(m => m.FoodDashboard));
const TimplaDashboard = dynamic(() => import('@/components/dashboard/food/timpla-dashboard').then(m => m.TimplaDashboard));
const GanapDashboard = dynamic(() => import('@/components/dashboard/events/ganap-dashboard').then(m => m.GanapDashboard));
const SpinDashboard = dynamic(() => import('@/components/dashboard/service/spin-dashboard').then(m => m.SpinDashboard));
const HydroDashboard = dynamic(() => import('@/components/dashboard/service/hydro-dashboard').then(m => m.HydroDashboard));
const AutoBossDashboard = dynamic(() => import('@/components/dashboard/service/auto-boss-dashboard').then(m => m.AutoBossDashboard));
const WellnessDashboard = dynamic(() => import('@/components/dashboard/service/wellness-dashboard').then(m => m.WellnessDashboard));
const TrimTrackDashboard = dynamic(() => import('@/components/dashboard/service/trim-track-dashboard').then(m => m.TrimTrackDashboard));
const RepSyncDashboard = dynamic(() => import('@/components/dashboard/service/rep-sync-dashboard').then(m => m.RepSyncDashboard));
const FleetDashboard = dynamic(() => import('@/components/dashboard/trucking/fleet-dashboard').then(m => m.FleetDashboard));
const RentalDashboard = dynamic(() => import('@/components/dashboard/rental/rental-dashboard').then(m => m.RentalDashboard));
const FarmDashboard = dynamic(() => import('@/components/dashboard/farm/farm-dashboard').then(m => m.FarmDashboard));
const TsekInRoomsDashboard = dynamic(() => import('@/components/dashboard/hospitality/tsek-in-dashboard').then(m => m.TsekInRoomsDashboard));

const ProfileTab = dynamic(() => import('@/components/dashboard/profile-tab').then(m => m.ProfileTab));
const StockTab = dynamic(() => import('@/components/dashboard/stock-tab').then(m => m.StockTab));
const HomeTab = dynamic(() => import('@/components/dashboard/home-tab').then(m => m.HomeTab));
const ReferralDashboard = dynamic(() => import('@/components/dashboard/referral-dashboard').then(m => m.ReferralDashboard));

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
  CreditCard,
  WifiOff,
  ShieldAlert,
  Copy,
  MessageSquare,
  Send,
  ExternalLink
} from "lucide-react";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useUserTenants } from '@/hooks/use-user-tenants';
import { useUser } from '@/firebase/auth/use-user';
import { useSyncStatus } from '@/hooks/use-sync-status';

import { useTenantStore } from '@/store/use-tenant-store';
import { HelpGuideDrawer } from '@/components/shell/help-guide-drawer';

export function TenantDashboard({ activeTab, onTabChange }: { activeTab?: string, onTabChange?: (tab: string) => void }) {
  const { user } = useUser();
  const db = initializeFirebase().db;
  const isCashier = useSecureCashierStore(state => state.isCashierAuthenticated);

  // Phase 1: Safely subscribe to profile without raw onSnapshot
  // Cashiers are denied access to users/{uid} by Firestore Rules; never subscribe for them
  const { data: profile } = useFirestoreDocument(user && !isCashier ? doc(db, 'users', user.uid) : null);

  const { currentTenant, setCurrentTenant, allTenants, isLoading: storeLoading } = useTenant();
  const activeModuleOverride = useTenantStore(state => state.activeModuleOverride);
  const { loading: tenantsLoading } = useUserTenants();
  const [mounted, setMounted] = useState(false);
  const { isOnline, pendingCount, syncMessage, isSyncing } = useSyncStatus(currentTenant?.id);

  useEffect(() => {
    setMounted(true);
  }, []);


  // Prevent hydration mismatch or show loading while fetching real data
  if (!mounted || tenantsLoading || storeLoading) {
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
          <div className="space-y-6">
            {Object.entries(
              allTenants.reduce((acc, t) => {
                const groupId = t.parentTenantId || t.id;
                if (!acc[groupId]) acc[groupId] = [];
                acc[groupId].push(t);
                return acc;
              }, {} as Record<string, typeof allTenants>)
            ).map(([groupId, groupTenants], groupIndex) => (
              <div key={groupId} className="space-y-3">
                {groupTenants.length > 1 && (
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 pl-2">
                    {groupTenants.find(t => t.id === groupId)?.name || "Enterprise Branches"}
                  </h3>
                )}
                <div className="grid gap-4">
                  {groupTenants.map((t, index) => (
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
                        <div className="font-bold text-lg">{t.branchName ? `${t.name} - ${t.branchName}` : t.name}</div>
                        <div className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">{getModuleTheme(t.moduleType).name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.subscriptionStatus === 'pending' && <Badge variant="secondary" className="text-[8px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 border-none">Pending</Badge>}
                        {t.branchName && <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest border-slate-200 text-slate-500">Branch</Badge>}
                        <ChevronRight className="h-6 w-6 group-hover:text-primary transition-colors" />
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Helper block for the active industry module
  const renderIndustryDashboard = () => {
    const activeModule = activeModuleOverride || currentTenant.moduleType;

    if (activeModule === '5-6-tracker') return <FiveSixDashboard />;
    if (activeModule === 'spin-snap') return <SpinDashboard />;
    if (activeModule === 'hydro-sync') return <HydroDashboard />;
    if (activeModule === 'auto-boss') return <AutoBossDashboard />;
    if (activeModule === 'wellness-pro') return <WellnessDashboard />;
    if (activeModule === 'trim-track') return <TrimTrackDashboard />;
    if (activeModule === 'rep-sync') return <RepSyncDashboard />;
    
    const serviceModules = ['unknown', 'service-master'];
    if (serviceModules.includes(activeModule || '')) return <ServiceDashboard />;
    
    if (activeModule === 'ledger-flow') return <LedgerDashboard />;
    if (activeModule === 'sahod-flow') return <PayrollDashboard />;
    if (activeModule === 'timpla-track') return <TimplaDashboard />;
    if (activeModule === 'ganap-master') return <GanapDashboard />;
    
    const foodModules = ['bite-snap'];
    if (foodModules.includes(activeModule || '')) return <FoodDashboard />;
    
    if (activeModule === 'farm-master') return <FarmDashboard />;
    
    const fleetModules = ['biyahe-sync'];
    if (fleetModules.includes(activeModule || '')) return <FleetDashboard />;
    
    if (activeModule === 'rental') return <RentalDashboard />;
    
    if (activeModule === 'build-stack') return <BuildStackDashboard />;
    if (activeModule === 'fresh-tally') return <FreshTallyDashboard />;
    if (activeModule === 'budget-mo') return <BudgetMoDashboard />;
    
    return <BentaDashboard />;
  };

  const isIndustryTab = !['profile', 'stock', 'ulat', 'home', 'kita', 'rooms'].includes(activeTab || 'home');

  const isExpired = (() => {
    if (!currentTenant) return false;
    if (profile?.role === 'admin') return false;
    if (currentTenant.subscriptionStatus === 'expired') return true;
    if (currentTenant.nextBillingDate && currentTenant.subscriptionStatus !== 'pending') {
      const billingDate = new Date(
        typeof currentTenant.nextBillingDate === 'object' && currentTenant.nextBillingDate !== null && 'seconds' in currentTenant.nextBillingDate 
          ? (currentTenant.nextBillingDate as any).seconds * 1000 
          : currentTenant.nextBillingDate as any
      );
      if (!isNaN(billingDate.getTime())) {
        const diffDays = (Date.now() - billingDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 1) return true;
      }
    }
    return false;
  })();

  if (isExpired && activeTab !== 'kita') {
    const theme = getModuleTheme(currentTenant?.moduleType);
    const renewalPrice = currentTenant?.moduleType === 'budget-mo' ? 50 : 99;

    const messengerMessage = [
      'Bayad ko na po (Renewal)!',
      '',
      `Email: ${profile?.email || user?.email || ''}`,
      `Negosyo: ${currentTenant?.name || ''}`,
      `Module: ${theme.name}`,
      `Halaga: ₱${renewalPrice}`,
      '',
      '(Screenshot attached below 👇)',
    ].join('\n');

    const messengerUrl = `https://m.me/katuwangsolutions?text=${encodeURIComponent(messengerMessage)}`;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-xl space-y-6 animate-in zoom-in-95">
          <div className="text-center space-y-3">
            <div className="h-16 w-16 rounded-2xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center shadow-inner">
              <ShieldAlert className="h-8 w-8 animate-pulse" />
            </div>
            <Badge className="bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest px-3 py-1">
              Subscription Expired
            </Badge>
            <h2 className="text-2xl font-black text-slate-800 font-headline uppercase tracking-tight">
              Mag-renew ng Subscription
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              Magandang araw! Ang inyong subscription sa <strong className="text-slate-800 uppercase font-black">{theme.name}</strong> ({currentTenant.name}) ay nag-expire na. Upang maipagpatuloy ang pag-access sa inyong tindahan at ulat, mangyaring mag-renew.
            </p>
          </div>

          <div className="bg-amber-500/10 border-2 border-amber-400 p-4 rounded-2xl space-y-3">
            <div className="flex justify-between items-center text-xs font-bold text-amber-900">
              <span>PROMO MONTHLY RENEWAL</span>
              <span className="text-sm font-black text-amber-900">₱{renewalPrice}/month</span>
            </div>
            <p className="text-[10px] text-amber-700 font-medium">
              Bayaran ang renewal via GCash o Maya at mag-send ng screenshot sa Messenger para agad ma-activate.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Send Payment To (GCash / Maya)</p>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-slate-800">GCash / Maya</p>
                  <p className="text-base font-black text-slate-900 tracking-widest leading-tight tabular-nums">0995 166 5423</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText('09951665423');
                    alert('Copied 09951665423 to clipboard!');
                  }}
                  className="h-8 text-[10px] font-bold border-slate-200"
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy Number
                </Button>
              </div>
            </div>
          </div>

          {/* Onboarding Style Messenger CTA Button */}
          <a
            href={messengerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-14 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-xl"
            style={{ background: '#0099FF' }}
          >
            <ExternalLink className="h-5 w-5" />
            Send Screenshot on Messenger
          </a>

          {/* Already Sent Button */}
          <button
            onClick={async () => {
              if (confirm("Nai-send mo na ba ang iyong bayad via GCash/Maya? Awtomatikong iche-check ng admin ang iyong resibo.")) {
                if (currentTenant?.id) {
                  const { getFirestore, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
                  const db = getFirestore();
                  await updateDoc(doc(db, 'tenants', currentTenant.id), {
                    subscriptionStatus: 'pending',
                    lastPaymentRequestedModule: currentTenant.moduleType,
                    updatedAt: serverTimestamp()
                  });
                  alert("Salamat! Naka-receive na kami ng notification. I-verify ito ng Admin para sa inyong activation.");
                }
              }
            }}
            className="w-full text-center text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors py-2"
          >
            I've already sent my payment →
          </button>
        </div>
      </div>
    );
  }

  // ISOLATED SECURE CASHIER VIEW
  // Only mounts BentaDashboard (POS), CashierShiftReport (Restricted Shift Report), or CashierProfileView (Shift/Logout)
  // Strictly avoids mounting Owner Home, Stock, Reports, Referrals, and Owner Profile
  if (isCashier) {
    return (
      <ShiftGate activeTab={activeTab} onGoToProfile={() => onTabChange?.('profile')}>
        <KatuwangErrorBoundary>
          {!isOnline && (
            <div className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 sticky top-0 z-50 bg-lime-700 text-lime-50 shadow-sm border-b border-lime-800">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>{syncMessage}</span>
            </div>
          )}
          {activeTab === 'profile' ? (
            <CashierProfileView />
          ) : activeTab === 'ulat' ? (
            <CashierShiftReport />
          ) : (
            <BentaDashboard />
          )}
        </KatuwangErrorBoundary>
      </ShiftGate>
    );
  }

  return (
    <ShiftGate activeTab={activeTab} onGoToProfile={() => onTabChange?.('profile')}>
      <KatuwangErrorBoundary>
        {(!isOnline || pendingCount > 0) && (
          <div className={cn(
            "px-4 py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 sticky top-0 z-50 animate-in slide-in-from-top",
            isOnline && pendingCount > 0 ? "bg-amber-500 text-white shadow-md" : "bg-amber-600 text-amber-50 shadow-sm border-b border-amber-700"
          )}>
            {isOnline ? <TrendingUp className="h-4 w-4 shrink-0 animate-bounce" /> : <WifiOff className="h-4 w-4 shrink-0" />}
            <span>{syncMessage}</span>
          </div>
        )}

        {/* 3-Day Expiry Warning Banner */}
        {(() => {
          if (!currentTenant?.nextBillingDate) return null;
          const billingDate = new Date(
            typeof currentTenant.nextBillingDate === 'object' && currentTenant.nextBillingDate !== null && 'seconds' in currentTenant.nextBillingDate 
              ? (currentTenant.nextBillingDate as any).seconds * 1000 
              : currentTenant.nextBillingDate as any
          );
          if (isNaN(billingDate.getTime())) return null;
          const diffTime = billingDate.getTime() - Date.now();
          const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (daysLeft > 3) return null;

          return (
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-4 py-3 text-xs font-bold flex flex-wrap items-center justify-between gap-2 shadow-md animate-in slide-in-from-top">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 animate-bounce text-amber-100 shrink-0" />
                <span>
                  ⚠️ <strong>Paalala:</strong> Ang inyong subscription ay mag-e-expire sa {daysLeft <= 0 ? 'ngayon' : `loob ng ${daysLeft} araw`} ({billingDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}). Mag-renew nang maaga para hindi ma-interrupt ang negosyo.
                </span>
              </div>
              <Button 
                size="sm" 
                onClick={() => onTabChange?.('profile')}
                className="bg-white text-orange-600 hover:bg-orange-50 font-black text-[10px] uppercase tracking-wider h-8 px-3 rounded-lg shadow-sm shrink-0"
              >
                Mag-renew Ngayon
              </Button>
            </div>
          );
        })()}
        
        <div className={activeTab === 'profile' ? 'block' : 'hidden'}>
          <ProfileTab />
        </div>

        <div className={activeTab === 'kita' ? 'block' : 'hidden'}>
          <ReferralDashboard />
        </div>

        {currentTenant.moduleType === 'budget-mo' && !['profile', 'kita'].includes(activeTab || 'home') ? (
          <div className="block">
            <BudgetMoDashboard activeTab={activeTab || 'home'} onTabChange={onTabChange} />
          </div>
        ) : (
          <>
            <div className={activeTab === 'home' || !activeTab ? 'block' : 'hidden'}>
              <HomeTab setTab={onTabChange} />
            </div>
            
            <div className={activeTab === 'stock' ? 'block' : 'hidden'}>
              <StockTab />
            </div>

            <div className={activeTab === 'rooms' ? 'block' : 'hidden'}>
              <TsekInRoomsDashboard />
            </div>

            <div className={activeTab === 'ulat' ? 'block' : 'hidden'}>
              {isCashier ? (
                <CashierShiftReport />
              ) : profile?.role === 'staff' ? (
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
          </>
        )}

        <div className={isIndustryTab && currentTenant.moduleType !== 'budget-mo' ? 'block' : 'hidden'}>
          {renderIndustryDashboard()}
        </div>
        
        {/* Global Context-Aware Help Manual */}
        <HelpGuideDrawer activeModule={activeModuleOverride || currentTenant.moduleType} />
      </KatuwangErrorBoundary>
      <PinApprovalModal />
    </ShiftGate>
  );
}
