
"use client"

import { TenantProvider } from './lib/tenant-context';
import TenantDashboard from './dashboard/page';
import AdminKillSwitch from './admin/page';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Handshake, LayoutDashboard, Database } from 'lucide-react';

export default function Home() {
  const [view, setView] = useState<'landing' | 'admin' | 'tenant'>('landing');

  if (view === 'landing') {
    return (
      <TenantProvider>
        <div className="flex-1 bg-background flex flex-col items-center justify-center p-8 space-y-20">
          <div className="text-center space-y-8">
            <div className="flex justify-center">
              <Handshake 
                className="h-20 w-20 text-primary" 
                strokeWidth={1.5} 
              />
            </div>
            <div className="space-y-2">
              <h1 className="text-5xl font-headline font-bold tracking-[0.2em] text-foreground uppercase">
                Katuwang
              </h1>
              <h2 className="text-sm font-headline font-normal uppercase tracking-[0.4em] text-[#266867]">
                Solutions
              </h2>
            </div>
          </div>

          <div className="flex flex-col gap-6 w-full px-4">
            <Button 
              className="w-full h-16 rounded-[12px] text-lg font-bold flex items-center justify-center gap-3 bg-primary text-white hover:bg-primary/90 transition-all active:scale-[0.98] shadow-xl shadow-primary/10"
              onClick={() => setView('tenant')}
            >
              <LayoutDashboard className="h-5 w-5" />
              Tenant Portal
            </Button>
            <Button 
              variant="outline"
              className="w-full h-16 rounded-[12px] text-lg font-bold flex items-center justify-center gap-3 bg-transparent border-[#266867] text-white hover:bg-[#266867]/10 transition-all active:scale-[0.98]"
              onClick={() => setView('admin')}
            >
              <Database className="h-5 w-5 text-[#266867]" />
              Admin Control
            </Button>
          </div>

          <div className="pt-12">
            <p className="text-muted-foreground text-[9px] font-bold uppercase tracking-[0.3em] opacity-40 text-center">
              Isolation Shield Architecture<br/>Enterprise Grade v1.0
            </p>
          </div>
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
