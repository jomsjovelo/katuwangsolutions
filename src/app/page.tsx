"use client"

import React, { useState, useEffect } from 'react';
import TenantDashboard from './dashboard/page';
import AdminKillSwitch from './admin/page';
import {
  Handshake, ShoppingCart, Leaf, Hammer, Sprout,
  Utensils, Coffee, UtensilsCrossed, RotateCcw, Droplets,
  Sparkles, Sun, Wrench, Banknote, BookText, Truck
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

// Marketing components
import { Hero } from '@/components/marketing/hero';
import { SocialProofBar } from '@/components/marketing/social-proof-bar';
import { AppSuiteCarousel } from '@/components/marketing/app-suite-carousel';
import { Features } from '@/components/marketing/features';
import { Testimonials } from '@/components/marketing/testimonials';
import { PricingCta } from '@/components/marketing/pricing-cta';
import { FloatingCta } from '@/components/marketing/floating-cta';

// App shell components
import { BottomNav } from '@/components/shell/bottom-nav';
import { AppHeader } from '@/components/shell/app-header';

// ─── App data ────────────────────────────────────────────────────────────────

interface AppModule {
  name: string;
  icon: LucideIcon;
  tagline: string;
  imageSrc: string;
}

interface AppGroup {
  id: string;
  label: string;
  accentColor: string;
  apps: AppModule[];
}

const appGroups: AppGroup[] = [
  {
    id: 'retail',
    label: 'Retail',
    accentColor: '#06B6D4',
    apps: [
      { name: 'Benta Snap',  icon: ShoppingCart, tagline: 'I-snap ang benta, real-time.',          imageSrc: '/apps/benta-snap.png' },
      { name: 'Fresh Tally', icon: Leaf,          tagline: 'Alamin ang stock mo agad.',             imageSrc: '/apps/fresh-tally.png' },
      { name: 'Build Stack', icon: Hammer,        tagline: 'I-track ang materyales, walang sayang.',imageSrc: '/apps/build-stack.png' },
      { name: 'Ani Grow',    icon: Sprout,        tagline: 'Mula sa bukid hanggang bodega.',        imageSrc: '/apps/ani-grow.png' },
    ],
  },
  {
    id: 'food',
    label: 'Food',
    accentColor: '#F97316',
    apps: [
      { name: 'Bite Snap',    icon: Utensils,        tagline: 'Order, bayad, at resibo — in seconds.', imageSrc: '/apps/bite-snap.png' },
      { name: 'Timpla Track', icon: Coffee,           tagline: 'Cafe operations, simplified.',          imageSrc: '/apps/timpla-track.png' },
      { name: 'Handa Flow',   icon: UtensilsCrossed, tagline: 'I-manage ang event, walang stress.',     imageSrc: '/apps/handa-flow.png' },
    ],
  },
  {
    id: 'service',
    label: 'Serbisyo',
    accentColor: '#8B5CF6',
    apps: [
      { name: 'Spin Snap',  icon: RotateCcw, tagline: 'Track laundry orders ng wala kang effort.', imageSrc: '/apps/spin-snap.png' },
      { name: 'Hydro Sync', icon: Droplets,  tagline: 'I-manage ang deliveries mo, auto.',         imageSrc: '/apps/hydro-sync.png' },
      { name: 'Shine Sync', icon: Sparkles,  tagline: 'Track slots. Track bayad. Maliwanag.',      imageSrc: '/apps/shine-sync.png' },
      { name: 'Glow Sync',  icon: Sun,       tagline: 'Booking at bayad, sa isang lugar.',         imageSrc: '/apps/glow-sync.png' },
      { name: 'Rep Sync',   icon: Wrench,    tagline: 'Membership. Attendance. Payments.',         imageSrc: '/apps/rep-sync.png' },
    ],
  },
  {
    id: 'business',
    label: 'Negosyo',
    accentColor: '#10B981',
    apps: [
      { name: 'Sahod Flow',   icon: Banknote,  tagline: 'Tama ang sahod, on time palagi.',  imageSrc: '/apps/sahod-flow.png' },
      { name: 'Ledger Flow',  icon: BookText,  tagline: 'Panoorin ang pera mo lumago.',      imageSrc: '/apps/ledger-flow.png' },
      { name: 'Biyahe Sync',  icon: Truck,     tagline: 'Track biyahe, real-time.',          imageSrc: '/apps/biyahe-sync.png' },
    ],
  },
];

// ─── Main page ────────────────────────────────────────────────────────────────

type View = 'landing' | 'admin' | 'tenant';
type TabId = 'home' | 'benta' | 'stock' | 'ulat' | 'profile';

export default function Home() {
  const [view, setView]     = useState<View>('landing');
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Handshake className="h-12 w-12 text-primary opacity-20" />
          <div className="h-2 w-32 bg-secondary/20 rounded-full" />
        </div>
      </div>
    );
  }

  // ── LANDING PAGE ──────────────────────────────────────────────────────────
  if (view === 'landing') {
    return (
      <div className="flex flex-col bg-white">
        {/* Full-screen hero */}
        <Hero onEnterPortal={() => setView('tenant')} />

        {/* Content sections — padded at bottom for floating CTA bar */}
        <div className="pb-nav">
          <SocialProofBar />

          <AppSuiteCarousel
            groups={appGroups}
            onSelect={() => setView('tenant')}
          />

          <Features />

          <Testimonials />

          <PricingCta onEnterPortal={() => setView('tenant')} />

          <footer className="py-10 bg-slate-950">
            <div className="text-center flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 opacity-40">
                <Handshake className="h-5 w-5 text-white" strokeWidth={1.5} />
                <span className="text-xs font-black tracking-[0.1em] text-white uppercase">Katuwang</span>
              </div>
              <p className="text-slate-500 text-[9px] font-bold uppercase tracking-[0.35em] leading-loose">
                Katuwang Solutions · Framework v1.2<br />&copy; {new Date().getFullYear()} All Rights Reserved.
              </p>
            </div>
          </footer>
        </div>

        {/* Floating bottom CTA — always visible */}
        <FloatingCta onEnterPortal={() => setView('tenant')} />
      </div>
    );
  }

  // ── APP SHELL (Dashboard / Admin) ─────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Minimal app header */}
      <AppHeader
        title="Katuwang"
        subtitle={view === 'admin' ? 'Admin Control' : 'Dashboard'}
        onBack={() => setView('landing')}
      />

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto pb-nav">
        {view === 'admin' ? <AdminKillSwitch /> : <TenantDashboard />}
      </div>

      {/* Native bottom nav — only in app, not on landing */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
      />
    </div>
  );
}
