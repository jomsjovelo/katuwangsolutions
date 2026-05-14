"use client"

import { TenantProvider } from './lib/tenant-context';
import TenantDashboard from './dashboard/page';
import AdminKillSwitch from './admin/page';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Shield, LayoutDashboard, Database } from 'lucide-react';

export default function Home() {
  const [view, setView] = useState<'landing' | 'admin' | 'tenant'>('landing');

  if (view === 'landing') {
    return (
      <TenantProvider>
        <div className="flex-1 bg-background flex flex-col items-center justify-center p-6 space-y-12">
          <div className="text-center space-y-4">
            <div className="flex justify-center mb-6">
              <div className="bg-primary p-4 rounded-3xl shadow-2xl shadow-primary/20">
                <Shield className="h-16 w-16 text-white" />
              </div>
            </div>
            <h1 className="text-6xl font-headline font-black tracking-tighter uppercase leading-none italic">Katuwang</h1>
            <h2 className="text-2xl font-headline font-bold text-muted-foreground uppercase tracking-widest">Solutions</h2>
          </div>

          <div className="flex flex-col gap-4 w-full px-2">
            <Button 
              className="w-full h-32 rounded-3xl text-xl font-bold flex flex-col gap-2 group border-2 border-transparent hover:border-primary transition-all shadow-lg active:scale-95"
              onClick={() => setView('tenant')}
            >
              <LayoutDashboard className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
              Tenant Portal
            </Button>
            <Button 
              variant="outline"
              className="w-full h-32 rounded-3xl text-xl font-bold flex flex-col gap-2 group bg-secondary/20 border-border hover:border-chart-2 transition-all shadow-lg active:scale-95"
              onClick={() => setView('admin')}
            >
              <Database className="h-8 w-8 text-chart-2 group-hover:scale-110 transition-transform" />
              Admin Control
            </Button>
          </div>

          <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em] opacity-50 text-center">
            Isolation Shield Architecture<br/>SnapDate UI v1.0
          </p>
        </div>
      </TenantProvider>
    );
  }

  return (
    <TenantProvider>
      <div className="flex-1 relative">
        {view === 'admin' ? <AdminKillSwitch /> : <TenantDashboard />}
        <div className="absolute top-4 right-4 z-[9999]">
           <Button variant="secondary" size="sm" onClick={() => setView('landing')} className="rounded-full font-bold shadow-md">
              Exit
           </Button>
        </div>
      </div>
    </TenantProvider>
  );
}
