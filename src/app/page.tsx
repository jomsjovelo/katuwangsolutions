"use client"

import { TenantProvider } from './lib/tenant-context';
import TenantDashboard from './dashboard/page';
import AdminKillSwitch from './admin/page';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Handshake, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function Home() {
  const [view, setView] = useState<'landing' | 'admin' | 'tenant'>('landing');

  if (view === 'landing') {
    return (
      <TenantProvider>
        <div className="flex-1 bg-white flex flex-col overflow-x-hidden font-body">
          {/* Header Nav */}
          <header className="flex justify-between items-center p-6 border-b border-border/5">
            <div className="flex items-center gap-2">
              <Handshake className="h-6 w-6 text-[#06B6D4]" strokeWidth={1} />
              <div className="flex flex-col">
                <span className="text-xs font-bold tracking-[0.1em] text-[#06B6D4] uppercase leading-none">
                  Katuwang
                </span>
                <span className="text-[8px] font-light uppercase tracking-[0.3em] text-[#94A3B8] mt-1">
                  Solutions
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-[10px] font-bold h-8 px-3 rounded-md text-[#1E293B] hover:bg-slate-50 uppercase tracking-widest"
                onClick={() => setView('tenant')}
              >
                Portal
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-[10px] font-bold h-8 px-3 rounded-md text-[#1E293B] hover:bg-slate-50 uppercase tracking-widest"
                onClick={() => setView('admin')}
              >
                Admin
              </Button>
            </div>
          </header>

          {/* Hero Marketing Section */}
          <main className="flex-1 flex flex-col items-center justify-center p-8 text-center py-16">
            <div className="space-y-8 max-w-[340px]">
              <Badge variant="outline" className="rounded-full border-transparent bg-[#FEF9C3] px-6 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#713F12]">
                Mura. Mabilis. Maaasahan.
              </Badge>
              
              <div className="flex flex-col gap-6">
                <h1 className="text-4xl font-bold text-[#1E293B] leading-[1.15] tracking-tight">
                  Ang Katuwang ng Negosyo Mo.
                </h1>
                <p className="text-[#475569] text-[15px] leading-[1.6] opacity-90">
                  Upgrade your daily operations. Walang kahirap-hirap na sales, inventory, at utang tracking para sa mga tindahan, palengke, at services.
                </p>
              </div>
            </div>

            {/* Primary CTA with Price Anchoring */}
            <div className="w-full mt-12 space-y-6 px-4">
              <Button 
                className={cn(
                  "w-full h-16 rounded-[12px] text-lg font-bold bg-gradient-to-r from-[#06B6D4] to-[#0891B2] text-white hover:opacity-95 transition-all active:scale-[0.98] joy-glow flex items-center justify-between px-6 border-none"
                )}
                onClick={() => setView('tenant')}
              >
                <span className="tracking-tight">Magsimula Ngayon</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium line-through text-white/50">₱199</span>
                    <span className="text-sm font-bold text-[#FACC15] tracking-tight">₱99/month</span>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-80" />
                </div>
              </Button>
              <p className="text-[10px] text-[#94A3B8] uppercase tracking-[0.2em] font-semibold">
                Walang setup fee. Cancel anytime.
              </p>
            </div>
          </main>

          {/* Footer Branding */}
          <footer className="p-8 mt-auto">
            <p className="text-[#94A3B8] text-[8px] font-bold uppercase tracking-[0.4em] opacity-40 text-center leading-loose">
              Katuwang Solutions<br/>Enterprise Grade Framework v1.2
            </p>
          </footer>
        </div>
      </TenantProvider>
    );
  }

  return (
    <TenantProvider>
      <div className="flex-1 relative font-body">
        {view === 'admin' ? <AdminKillSwitch /> : <TenantDashboard />}
        <div className="absolute top-4 right-4 z-[9999]">
           <Button variant="secondary" size="sm" onClick={() => setView('landing')} className="rounded-full font-bold shadow-md h-8 text-[10px] bg-white hover:bg-slate-50 text-[#06B6D4] border border-[#06B6D4]/10">
              EXIT
           </Button>
        </div>
      </div>
    </TenantProvider>
  );
}