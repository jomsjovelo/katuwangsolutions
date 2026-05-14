"use client"

import React, { useState, useEffect } from 'react';
import TenantDashboard from './dashboard/page';
import AdminKillSwitch from './admin/page';
import { Button } from '@/components/ui/button';
import {
  Handshake, ShoppingCart, Leaf, Hammer, Sprout,
  Utensils, Coffee, UtensilsCrossed, RotateCcw, Droplets,
  Sparkles, Sun, Wrench, Banknote, BookText, Truck,
  Store, Sandwich, Settings2, BriefcaseBusiness
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { Hero } from '@/components/marketing/hero';
import { SocialProofBar } from '@/components/marketing/social-proof-bar';
import { Features } from '@/components/marketing/features';
import { Testimonials } from '@/components/marketing/testimonials';
import { PricingCta } from '@/components/marketing/pricing-cta';
import { AppCard } from '@/components/marketing/app-card';

interface AppModule {
  name: string;
  icon: LucideIcon;
  tagline: string;
  imageSrc: string;
}

interface AppGroup {
  groupName: string;
  groupIcon: LucideIcon;
  tagline: string;
  accentColor: string;
  apps: AppModule[];
}

const appGroups: AppGroup[] = [
  {
    groupName: 'Retail Group',
    groupIcon: Store,
    tagline: 'Para sa mga tindahan, palengke, at pamilihan',
    accentColor: '#06B6D4',
    apps: [
      { name: 'Benta Snap', icon: ShoppingCart, tagline: 'I-snap ang benta, real-time.', imageSrc: '/apps/benta-snap.png' },
      { name: 'Fresh Tally', icon: Leaf, tagline: 'Alamin ang stock mo agad.', imageSrc: '/apps/fresh-tally.png' },
      { name: 'Build Stack', icon: Hammer, tagline: 'I-track ang materyales, walang sayang.', imageSrc: '/apps/build-stack.png' },
      { name: 'Ani Grow', icon: Sprout, tagline: 'Mula sa bukid hanggang bodega.', imageSrc: '/apps/ani-grow.png' },
    ],
  },
  {
    groupName: 'Food Group',
    groupIcon: Sandwich,
    tagline: 'Para sa mga kainan, cafe, at catering',
    accentColor: '#F97316',
    apps: [
      { name: 'Bite Snap', icon: Utensils, tagline: 'Order, bayad, at resibo — in seconds.', imageSrc: '/apps/bite-snap.png' },
      { name: 'Timpla Track', icon: Coffee, tagline: 'Cafe operations, simplified.', imageSrc: '/apps/timpla-track.png' },
      { name: 'Handa Flow', icon: UtensilsCrossed, tagline: 'I-manage ang event, walang stress.', imageSrc: '/apps/handa-flow.png' },
    ],
  },
  {
    groupName: 'Service Group',
    groupIcon: Settings2,
    tagline: 'Para sa mga serbisyo at appointment-based na negosyo',
    accentColor: '#8B5CF6',
    apps: [
      { name: 'Spin Snap', icon: RotateCcw, tagline: 'Track laundry orders ng wala kang effort.', imageSrc: '/apps/spin-snap.png' },
      { name: 'Hydro Sync', icon: Droplets, tagline: 'I-manage ang deliveries mo, auto.', imageSrc: '/apps/hydro-sync.png' },
      { name: 'Shine Sync', icon: Sparkles, tagline: 'Track slots. Track bayad. Maliwanag.', imageSrc: '/apps/shine-sync.png' },
      { name: 'Glow Sync', icon: Sun, tagline: 'Booking at bayad, sa isang lugar.', imageSrc: '/apps/glow-sync.png' },
      { name: 'Rep Sync', icon: Wrench, tagline: 'Membership. Attendance. Payments.', imageSrc: '/apps/rep-sync.png' },
    ],
  },
  {
    groupName: 'Business Group',
    groupIcon: BriefcaseBusiness,
    tagline: 'Para sa back-office, HR, at logistics',
    accentColor: '#10B981',
    apps: [
      { name: 'Sahod Flow', icon: Banknote, tagline: 'Tama ang sahod, on time palagi.', imageSrc: '/apps/sahod-flow.png' },
      { name: 'Ledger Flow', icon: BookText, tagline: 'Panoorin ang pera mo lumago.', imageSrc: '/apps/ledger-flow.png' },
      { name: 'Biyahe Sync', icon: Truck, tagline: 'Track biyahe, real-time.', imageSrc: '/apps/biyahe-sync.png' },
    ],
  },
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

        {/* App Suite — Grouped by Industry */}
        <section id="products" className="py-10 md:py-16 px-4 sm:px-5 bg-slate-50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8 md:mb-12 space-y-2">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Katuwang App Suite</h2>
              <p className="text-xs sm:text-sm text-slate-500 font-bold uppercase tracking-[0.2em]">15 Industry Specific Modules</p>
            </div>

            <div className="flex flex-col gap-16">
              {appGroups.map((group) => {
                const GroupIcon = group.groupIcon;
                return (
                  <div key={group.groupName}>
                    {/* Group Header */}
                    <div className="flex items-center gap-3 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b-2" style={{ borderColor: group.accentColor }}>
                      <div className="h-11 w-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${group.accentColor}18` }}>
                        <GroupIcon className="h-6 w-6" style={{ color: group.accentColor }} strokeWidth={2} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900">{group.groupName}</h3>
                        <p className="text-xs text-slate-500 font-medium">{group.tagline}</p>
                      </div>
                    </div>

                    {/* App Cards Grid — 1 col mobile, 2 col tablet, 3-4 col desktop */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                      {group.apps.map((app) => (
                        <AppCard
                          key={app.name}
                          name={app.name}
                          tagline={app.tagline}
                          category={group.groupName}
                          icon={app.icon}
                          imageSrc={app.imageSrc}
                          accentColor={group.accentColor}
                          onSelect={() => setView('tenant')}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <Features />

        <Testimonials />

        <PricingCta onEnterPortal={() => setView('tenant')} />

        <footer className="py-12 bg-slate-950 border-t border-slate-900">
          <div className="max-w-6xl mx-auto px-6 text-center flex flex-col items-center gap-6">
            <div className="flex items-center gap-2 grayscale opacity-50">
              <Handshake className="h-6 w-6 text-white" strokeWidth={1.5} />
              <span className="text-sm font-black tracking-[0.1em] text-white uppercase">Katuwang</span>
            </div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.4em] leading-loose max-w-sm">
              Katuwang Solutions<br />Enterprise Grade Framework v1.2<br />&copy; {new Date().getFullYear()} All Rights Reserved.
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
