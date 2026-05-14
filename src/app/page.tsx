"use client"

import { TenantProvider } from './lib/tenant-context';
import TenantDashboard from './dashboard/page';
import AdminKillSwitch from './admin/page';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Handshake, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function Home() {
  const [view, setView] = useState<'landing' | 'admin' | 'tenant'>('landing');

  if (view === 'landing') {
    return (
      <TenantProvider>
        <div className="flex-1 bg-background flex flex-col overflow-x-hidden">
          {/* Minimalist Header Navigation */}
          <header className="flex justify-between items-center p-4 border-b border-border/10">
            <div className="flex items-center gap-2">
              <Handshake className="h-5 w-5 text-[#FF6B00]" strokeWidth={1} />
              <div className="flex flex-col">
                <span className="text-xs font-headline font-bold tracking-widest text-[#FF6B00] uppercase leading-none">
                  Katuwang
                </span>
                <span className="text-[7px] font-headline font-normal uppercase tracking-[0.2em] text-[#00B4D8]">
                  Solutions
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-[10px] font-bold h-8 px-3 rounded-md text-[#1E293B] hover:bg-slate-100"
                onClick={() => setView('tenant')}
              >
                PORTAL
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-[10px] font-bold h-8 px-3 rounded-md text-[#1E293B] hover:bg-slate-100"
                onClick={() => setView('admin')}
              >
                ADMIN
              </Button>
            </div>
          </header>

          {/* Hero Marketing Section */}
          <main className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-10">
            <div className="space-y-6">
              <Badge variant="outline" className="rounded-full border-transparent bg-[#E0F2FE] px-4 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-[#0369A1]">
                Mura. Mabilis. Maaasahan.
              </Badge>
              
              <div className="space-y-4">
                <h1 className="text-5xl font-headline font-bold text-[#1E293B] leading-tight tracking-tighter">
                  Ang Katuwang ng Negosyo Mo.
                </h1>
                <p className="text-[#475569] text-sm max-w-[320px] mx-auto leading-relaxed">
                  Upgrade your daily operations. Walang kahirap-hirap na sales, inventory, at utang tracking para sa mga tindahan, palengke, at services.
                </p>
              </div>
            </div>

            {/* Primary High-Visibility CTA with Price Anchoring */}
            <div className="w-full space-y-4">
              <Button 
                className="w-full h-16 rounded-[12px] text-lg font-bold bg-[#FF6B00] text-white hover:bg-[#FF6B00]/90 transition-all active:scale-[0.98] shadow-2xl shadow-orange-500/20 flex items-center justify-between px-6"
                onClick={() => setView('tenant')}
              >
                <span>Magsimula Ngayon</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-normal line-through text-[#FFC300] opacity-90">₱199</span>
                    <span className="text-xs font-bold">₱99/month</span>
                  </div>
                  <ChevronRight className="h-5 w-5" />
                </div>
              </Button>
              <p className="text-[10px] text-[#475569] uppercase tracking-widest font-medium">
                Walang setup fee. Cancel anytime.
              </p>
            </div>
          </main>

          {/* Footer Branding */}
          <footer className="p-8 border-t border-border/5">
            <p className="text-[#475569] text-[8px] font-bold uppercase tracking-[0.3em] opacity-30 text-center">
              Katuwang Isolation Shield<br/>Enterprise Grade Framework v1.0
            </p>
          </footer>
        </div>
      </TenantProvider>
    );
  }

  return (
    <TenantProvider>
      <div className="flex-1 relative">
        {view === 'admin' ? <AdminKillSwitch /> : <TenantDashboard />}
        <div className="absolute top-4 right-4 z-[9999]">
           <Button variant="secondary" size="sm" onClick={() => setView('landing')} className="rounded-full font-bold shadow-md h-8 text-[10px]">
              EXIT
           </Button>
        </div>
      </div>
    </TenantProvider>
  );
}
