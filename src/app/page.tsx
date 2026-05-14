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
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 space-y-12">
          <div className="text-center space-y-4">
            <div className="flex justify-center mb-6">
              <div className="bg-primary p-4 rounded-3xl shadow-2xl shadow-primary/20">
                <Shield className="h-16 w-16 text-white" />
              </div>
            </div>
            <h1 className="text-6xl font-headline font-black tracking-tighter uppercase leading-none italic">Katuwang</h1>
            <h2 className="text-2xl font-headline font-bold text-muted-foreground uppercase tracking-widest">Solutions</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
            <Button 
              className="h-32 rounded-3xl text-xl font-bold flex flex-col gap-2 group border-2 border-transparent hover:border-primary transition-all"
              onClick={() => setView('tenant')}
            >
              <LayoutDashboard className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
              Tenant Portal
            </Button>
            <Button 
              variant="outline"
              className="h-32 rounded-3xl text-xl font-bold flex flex-col gap-2 group bg-secondary/20"
              onClick={() => setView('admin')}
            >
              <Database className="h-8 w-8 text-chart-2 group-hover:scale-110 transition-transform" />
              Admin Control
            </Button>
          </div>

          <p className="text-muted-foreground text-sm font-medium opacity-50">
            Powered by Isolation Shield Architecture & SnapDate UI
          </p>
        </div>
      </TenantProvider>
    );
  }

  return (
    <TenantProvider>
      {view === 'admin' ? <AdminKillSwitch /> : <TenantDashboard />}
      <div className="fixed top-4 right-4 z-[9999]">
         <Button variant="secondary" size="sm" onClick={() => setView('landing')} className="rounded-full font-bold">
            Exit Session
         </Button>
      </div>
    </TenantProvider>
  );
}