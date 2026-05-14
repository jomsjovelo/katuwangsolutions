
"use client"

import { TenantProvider } from './lib/tenant-context';
import TenantDashboard from './dashboard/page';
import AdminKillSwitch from './admin/page';
import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { 
  Handshake, 
  ChevronRight, 
  ShoppingCart, 
  Leaf, 
  Hammer, 
  Sprout, 
  Utensils, 
  Coffee, 
  UtensilsCrossed, 
  RotateCcw, 
  Droplets, 
  Sparkles, 
  Sun, 
  Wrench, 
  Banknote, 
  BookText, 
  Truck,
  Layers,
  BarChart3,
  Globe
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PlaceHolderImages } from '@/lib/placeholder-images';

export default function Home() {
  const [view, setView] = useState<'landing' | 'admin' | 'tenant'>('landing');

  const handshakeImg = PlaceHolderImages.find(img => img.id === 'handshake');

  const appGrid = [
    { name: 'Benta Snap', icon: ShoppingCart, category: 'Retail' },
    { name: 'Fresh Tally', icon: Leaf, category: 'Retail' },
    { name: 'Build Stack', icon: Hammer, category: 'Retail' },
    { name: 'Ani Grow', icon: Sprout, category: 'Retail' },
    { name: 'Bite Snap', icon: Utensils, category: 'Food' },
    { name: 'Timpla Track', icon: Coffee, category: 'Food' },
    { name: 'Handa Flow', icon: UtensilsCrossed, category: 'Food' },
    { name: 'Spin Snap', icon: RotateCcw, category: 'Service' },
    { name: 'Hydro Sync', icon: Droplets, category: 'Service' },
    { name: 'Shine Sync', icon: Sparkles, category: 'Service' },
    { name: 'Glow Sync', icon: Sun, category: 'Service' },
    { name: 'Rep Sync', icon: Wrench, category: 'Service' },
    { name: 'Sahod Flow', icon: Banknote, category: 'Business' },
    { name: 'Ledger Flow', icon: BookText, category: 'Business' },
    { name: 'Biyahe Sync', icon: Truck, category: 'Business' },
  ];

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
          <main className="flex-1 flex flex-col">
            <section className="p-8 text-center py-12 flex flex-col items-center">
              <div className="space-y-6 max-w-[340px] mb-8">
                <Badge variant="outline" className="rounded-full border-transparent bg-[#FEF9C3] px-6 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#713F12]">
                  Mura. Mabilis. Maaasahan.
                </Badge>
                
                <h1 className="text-4xl font-bold text-[#1E293B] leading-[1.15] tracking-tight">
                  Ang Katuwang ng Negosyo Mo.
                </h1>
                <p className="text-[#475569] text-[15px] leading-[1.6] opacity-90">
                  Upgrade your daily operations. Walang kahirap-hirap na sales, inventory, at utang tracking para sa mga tindahan, palengke, at services.
                </p>
              </div>

              {/* Primary CTA Above the Fold */}
              <div className="w-full space-y-4 px-4 mb-10">
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

              {/* Hero Image Container (Product Mockup / Culturally Relevant) */}
              <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl mb-10 relative aspect-[4/3] bg-slate-50">
                <Image 
                  src={handshakeImg?.imageUrl || ''} 
                  alt="Katuwang Mobile Interface"
                  fill
                  className="object-cover"
                  data-ai-hint="market vendor"
                />
              </div>
            </section>

            {/* App Suite Showcase Grid */}
            <section className="px-6 py-16 bg-slate-50/50">
              <div className="text-center mb-10 space-y-2">
                <h2 className="text-2xl font-bold text-[#1E293B] tracking-tight">Katuwang App Suite</h2>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">15 Industry Specific Modules</p>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {appGrid.map((app) => (
                  <div 
                    key={app.name} 
                    className="bg-white border border-border/50 p-4 rounded-xl flex flex-col items-center justify-center text-center space-y-3 hover:scale-105 transition-transform cursor-default group"
                  >
                    <div className="p-3 bg-slate-50 rounded-full group-hover:bg-[#06B6D4]/10 transition-colors">
                      <app.icon className="h-5 w-5 text-[#06B6D4]" strokeWidth={1.5} />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-[#06B6D4] uppercase tracking-tighter">{app.name}</div>
                      <div className="text-[8px] text-muted-foreground font-black uppercase tracking-widest opacity-60">{app.category}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Integrated Advantage Section */}
            <section className="px-8 py-20 space-y-16">
              <div className="grid gap-12">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-4 bg-[#06B6D4]/5 rounded-2xl">
                    <Globe className="h-8 w-8 text-[#06B6D4]" />
                  </div>
                  <h3 className="text-xl font-bold uppercase tracking-tighter">Unified Ecosystem</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">One login for all your business apps. Seamlessly switch between retail, payroll, and logistics without missing a beat.</p>
                </div>

                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-4 bg-[#06B6D4]/5 rounded-2xl">
                    <BarChart3 className="h-8 w-8 text-[#06B6D4]" />
                  </div>
                  <h3 className="text-xl font-bold uppercase tracking-tighter">Advanced Analytics</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">Real-time sales and inventory tracking. Get deep insights into your business performance with automated reporting.</p>
                </div>

                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-4 bg-[#06B6D4]/5 rounded-2xl">
                    <Layers className="h-8 w-8 text-[#06B6D4]" />
                  </div>
                  <h3 className="text-xl font-bold uppercase tracking-tighter">Deep Industry Solutions</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">Bespoke tools designed specifically for the Filipino market. From wet markets to hardware stores, we have you covered.</p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <Button className="h-14 rounded-xl font-bold bg-[#1E293B] text-white" onClick={() => setView('tenant')}>
                  Enter Portal
                </Button>
              </div>
            </section>
          </main>

          {/* Footer Branding */}
          <footer className="p-8 mt-auto border-t border-border/10 bg-slate-50/30">
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
