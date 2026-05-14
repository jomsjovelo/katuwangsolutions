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
        <div className="flex-1 bg-white flex flex-col overflow-x-hidden">
          {/* Minimalist Header Navigation */}
          <header className="flex justify-between items-center p-6 border-b border-border/5">
            <div className="flex items-center gap-2">
              <Handshake className="h-6 w-6 text-[#4F46E5]" strokeWidth={0.75} />
              <div className="flex flex-col">
                <span className="text-sm font-headline font-bold tracking-[0.15em] text-[#4F46E5] uppercase leading-none">
                  Katuwang
                </span>
                <span className="text-[8px] font-body font-light uppercase tracking-[0.3em] text-[#9CA3AF] mt-1">
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
          <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="space-y-8 max-w-[340px]">
              <Badge variant="outline" className="rounded-full border-transparent bg-[#FDF2F8] px-5 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-[#BE185D]">
                Mura. Mabilis. Maaasahan.
              </Badge>
              
              <div className="flex flex-col gap-[1.15em]">
                <h1 className="text-5xl font-headline font-bold text-[#1E293B] leading-[1.1] tracking-tighter">
                  Ang Katuwang ng Negosyo Mo.
                </h1>
                <p className="text-[#475569] text-[15px] font-body leading-relaxed opacity-90">
                  Upgrade your daily operations. Walang kahirap-hirap na sales, inventory, at utang tracking para sa mga tindahan, palengke, at services.
                </p>
              </div>
            </div>

            {/* Primary High-Visibility CTA with Price Anchoring */}
            <div className="w-full mt-12 space-y-5 px-4">
              <Button 
                className={cn(
                  "w-full h-16 rounded-[8px] text-lg font-bold bg-gradient-to-r from-[#4F46E5] to-[#6366F1] text-white hover:opacity-95 transition-all active:scale-[0.98] cta-shadow flex items-center justify-between px-6 border-none"
                )}
                onClick={() => setView('tenant')}
              >
                <span className="tracking-tight">Magsimula Ngayon</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium line-through text-[#94A3B8]/50">₱199</span>
                    <span className="text-sm font-bold glow-text tracking-tight">₱99/month</span>
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
              Katuwang Isolation Shield<br/>Enterprise Grade Framework v1.2
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
           <Button variant="secondary" size="sm" onClick={() => setView('landing')} className="rounded-full font-bold shadow-md h-8 text-[10px] bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-100">
              EXIT
           </Button>
        </div>
      </div>
    </TenantProvider>
  );
}
