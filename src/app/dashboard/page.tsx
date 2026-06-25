"use client"

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTenantStore } from '@/store/use-tenant-store';

const TenantDashboard = dynamic(() => import('@/components/dashboard/tenant-dashboard').then(mod => mod.TenantDashboard));
import { BottomNav } from '@/components/shell/bottom-nav';
import { AppHeader } from '@/components/shell/app-header';
import { BrandLogo } from '@/components/ui/brand-logo';

export default function TenantDashboardPage() {
  const [activeTab, setActiveTab] = useState<'home' | 'benta' | 'stock' | 'ulat' | 'kita' | 'profile'>('home');
  const { isLoading, isSeeding, activeTenant } = useTenantStore();

  // Listen for programmatic tab navigation from child components (e.g., Kita Ko shortcut in ProfileTab)
  React.useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (tab) setActiveTab(tab as any);
    };
    window.addEventListener('katuwang-nav', handler);
    return () => window.removeEventListener('katuwang-nav', handler);
  }, []);
  
  if (isLoading || isSeeding) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <BrandLogo showText={false} className="[&>div]:h-20 [&>div]:w-20 animate-pulse" />
          <div className="w-32 h-0.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-[loading_1.5s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {activeTenant && <AppHeader title="Katuwang Solutions" />}
      <div className="flex-1 pb-nav">
        <TenantDashboard activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as any)} />
      </div>
      {activeTenant && <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />}
    </div>
  );
}