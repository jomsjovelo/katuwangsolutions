"use client"

import React, { useState, useEffect } from 'react';
import TenantDashboard from './dashboard/page';
import AdminKillSwitch from './admin/page';
import { Button } from '@/components/ui/button';
import { Handshake, ShoppingCart, Leaf, Hammer, Sprout, Utensils, Coffee, UtensilsCrossed, RotateCcw, Droplets, Sparkles, Sun, Wrench, Banknote, BookText, Truck } from 'lucide-react';
import { Hero } from '@/components/marketing/hero';
import { SocialProofBar } from '@/components/marketing/social-proof-bar';
import { Features } from '@/components/marketing/features';
import { Testimonials } from '@/components/marketing/testimonials';
import { PricingCta } from '@/components/marketing/pricing-cta';
import { AppCard } from '@/components/marketing/app-card';

const appModules = [
  { name: 'Benta Snap', icon: ShoppingCart, category: 'Retail', tagline: 'I-snap ang benta, real-time.', imageSrc: '/apps/benta-snap.png' },
  { name: 'Fresh Tally', icon: Leaf, category: 'Retail', tagline: 'Alamin ang stock mo agad.', imageSrc: '/apps/fresh-tally.png' },
  { name: 'Build Stack', icon: Hammer, category: 'Retail', tagline: 'I-track ang materyales, walang sayang.', imageSrc: '/apps/build-stack.png' },
  { name: 'Ani Grow', icon: Sprout, category: 'Retail', tagline: 'Mula sa bukid hanggang bodega.', imageSrc: '/apps/ani-grow.png' },
  { name: 'Bite Snap', icon: Utensils, category: 'Food', tagline: 'Order, bayad, at resibo — in seconds.', imageSrc: '/apps/bite-snap.png' },
  { name: 'Timpla Track', icon: Coffee, category: 'Food', tagline: 'Cafe operations, simplified.', imageSrc: '/apps/timpla-track.png' },
  { name: 'Handa Flow', icon: UtensilsCrossed, category: 'Food', tagline: 'I-manage ang event, walang stress.', imageSrc: '/apps/handa-flow.png' },
  { name: 'Spin Snap', icon: RotateCcw, category: 'Service', tagline: 'Track laundry orders ng wala kang effort.', imageSrc: '/apps/spin-snap.png' },
  { name: 'Hydro Sync', icon: Droplets, category: 'Service', tagline: 'I-manage ang deliveries mo, auto.', imageSrc: '/apps/hydro-sync.png' },
  { name: 'Shine Sync', icon: Sparkles, category: 'Service', tagline: 'Track slots. Track bayad. Maliwanag.', imageSrc: '/apps/shine-sync.png' },
  { name: 'Glow Sync', icon: Sun, category: 'Service', tagline: 'Booking at bayad, sa isang lugar.', imageSrc: '/apps/glow-sync.png' },
  { name: 'Rep Sync', icon: Wrench, category: 'Service', tagline: 'Membership. Attendance. Payments.', imageSrc: '/apps/rep-sync.png' },
  { name: 'Sahod Flow', icon: Banknote, category: 'Business', tagline: 'Tama ang sahod, on time palagi.', imageSrc: '/apps/sahod-flow.png' },
  { name: 'Ledger Flow', icon: BookText, category: 'Business', tagline: 'Panoorin ang pera mo lumago.', imageSrc: '/apps/ledger-flow.png' },
  { name: 'Biyahe Sync', icon: Truck, category: 'Business', tagline: 'Track biyahe, real-time.', imageSrc: '/apps/biyahe-sync.png' },
];

export default function Home() {
  const [view, setView] = useState<'landing' | 'admin' | 'tenant'>('landing');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex-1 bg-white min-h-screen flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Handshake className="h-12 w-12 text-primary opacity-20" />
          <div className="h-2 w-32 bg-secondary/20 rounded" />
        </div>
      </div>
    );
  }

  if (view === 'landing') {
    return (
      <div className="flex-1 bg-white flex flex-col overflow-x-hidden font-body selection:bg-primary/20 selection:text-primary">
        
        <Hero 
          onEnterPortal={() => setView('tenant')} 
          onAdminLogin={() => setView('admin')} 
        />
        
        <SocialProofBar />

        <section id="products" className="py-24 md:py-32 px-6 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16 md:mb-24 space-y-4">
              <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Katuwang App Suite</h2>
              <p className="text-sm md:text-base text-slate-500 font-bold uppercase tracking-[0.2em]">15 Industry Specific Modules</p>
            </div>
            
            <div className="flex flex-col gap-8 md:gap-16">
              {appModules.map((app, index) => (
                <AppCard 
                  key={app.name}
                  {...app}
                  onSelect={() => setView('tenant')}
                  reverse={index % 2 !== 0}
                />
              ))}
            </div>
          </div>
        </section>

        <Features />
        
        <Testimonials />

        <PricingCta onEnterPortal={() => setView('tenant')} />

        <footer className="py-12 md:py-16 bg-slate-950 border-t border-slate-900">
          <div className="max-w-6xl mx-auto px-6 text-center flex flex-col items-center gap-6">
            <div className="flex items-center gap-2 grayscale opacity-50">
              <Handshake className="h-6 w-6 text-white" strokeWidth={1.5} />
              <span className="text-sm font-black tracking-[0.1em] text-white uppercase">Katuwang</span>
            </div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.4em] leading-loose max-w-sm">
              Katuwang Solutions<br/>Enterprise Grade Framework v1.2<br/>&copy; {new Date().getFullYear()} All Rights Reserved.
            </p>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex-1 relative font-body">
      {view === 'admin' ? <AdminKillSwitch /> : <TenantDashboard />}
      <div className="absolute top-4 right-4 z-[9999]">
         <Button variant="secondary" size="sm" onClick={() => setView('landing')} className="rounded-full font-bold shadow-md h-8 text-[10px] bg-white hover:bg-slate-50 text-primary border border-primary/10">
            EXIT
         </Button>
      </div>
    </div>
  );
}
