"use client"

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

import {
  Handshake, ShoppingCart, Leaf, Hammer, Sprout,
  Utensils, Coffee, CalendarHeart, RotateCcw, Droplets,
  Sparkles, Sun, Wrench, Banknote, BookText, Truck, Wallet
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { useTenant } from '@/app/lib/tenant-context';

// FIX S3-5: Use next/dynamic to lazy load large component trees and reduce main bundle size
const TenantDashboard = dynamic(() => import('@/components/dashboard/tenant-dashboard').then(mod => mod.TenantDashboard));
const AdminKillSwitch = dynamic(() => import('./admin/page'));

// Marketing components (lazy)
const Hero = dynamic(() => import('@/components/marketing/hero').then(mod => mod.Hero));
const SocialProofBar = dynamic(() => import('@/components/marketing/social-proof-bar').then(mod => mod.SocialProofBar));
const AppSuiteCarousel = dynamic(() => import('@/components/marketing/app-suite-carousel').then(mod => mod.AppSuiteCarousel));
const Features = dynamic(() => import('@/components/marketing/features').then(mod => mod.Features));
const Testimonials = dynamic(() => import('@/components/marketing/testimonials').then(mod => mod.Testimonials));
const PricingCta = dynamic(() => import('@/components/marketing/pricing-cta').then(mod => mod.PricingCta));
const FloatingCta = dynamic(() => import('@/components/marketing/floating-cta').then(mod => mod.FloatingCta));
const OnboardingWizard = dynamic(() => import('@/components/onboarding/onboarding-wizard').then(mod => mod.OnboardingWizard));
const InvitationGuard = dynamic(() => import('@/components/auth/invitation-guard').then(mod => mod.InvitationGuard));

// App shell components (eagerly loaded as they are part of the core shell)
import { BottomNav } from '@/components/shell/bottom-nav';
import { AppHeader } from '@/components/shell/app-header';
import { CoPilotButton } from '@/components/ai/co-pilot-button';

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
      { name: 'Benta Snap',  icon: ShoppingCart, tagline: 'I-snap ang benta, iwas lugi.',          imageSrc: '/apps/benta-snap.png' },
      { name: 'Fresh Tally', icon: Leaf,          tagline: 'Walang napanis. Alam ang stock agad.',             imageSrc: '/apps/fresh-tally.png' },
      { name: 'Build Stack', icon: Hammer,        tagline: 'Tugma ang materyales, walang sayang.',imageSrc: '/apps/build-stack.png' },
    ],
  },
  {
    id: 'food',
    label: 'Food',
    accentColor: '#F97316',
    apps: [
      { name: 'Bite Snap',    icon: Utensils,        tagline: 'Order, bayad, at resibo — in seconds.', imageSrc: '/apps/bite-snap.png' },
      { name: 'Timpla Track', icon: Coffee,           tagline: 'Cafe operations, simplified.',          imageSrc: '/apps/timpla-track.png' },
      { name: 'Ganap Master',   icon: CalendarHeart, tagline: 'Plan the details. Master the event.',     imageSrc: '/apps/ganap-master.png' },
    ],
  },
  {
    id: 'service',
    label: 'Serbisyo',
    accentColor: '#8B5CF6',
    apps: [
      { name: 'Spin Snap',  icon: RotateCcw, tagline: 'Track laundry orders ng wala kang effort.', imageSrc: '/apps/spin-snap.png' },
      { name: 'Hydro Sync', icon: Droplets,  tagline: 'I-manage ang deliveries mo, auto.',         imageSrc: '/apps/hydro-sync.png' },
      { name: 'Auto Boss', icon: Sparkles,  tagline: 'Track slots. Track bayad. Maliwanag.',      imageSrc: '/apps/auto-boss.png' },
      { name: 'Wellness Pro',  icon: Sun,       tagline: 'Booking at bayad, sa isang lugar.',         imageSrc: '/apps/wellness-pro.png' },
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
  {
    id: 'financial',
    label: 'Pinansyal',
    accentColor: '#3B82F6',
    apps: [
      { name: '5-6 Tracker', icon: BookText, tagline: 'Awtomatikong listahan. Mabilisang singilan.', imageSrc: '/apps/5-6-tracker.png' },
    ],
  },
];

// ─── Main page ────────────────────────────────────────────────────────────────

type View = 'landing' | 'admin' | 'tenant' | 'onboarding';
type TabId = 'home' | 'benta' | 'stock' | 'ulat' | 'profile';

export default function Home() {
  const { currentTenant, setCurrentTenant } = useTenant();
  const [view, setView]     = useState<View>('landing');
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Sync view state with tenant selection
  useEffect(() => {
    if (currentTenant && view !== 'admin') {
      setView('tenant');
    }
  }, [currentTenant, view]);

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
      <InvitationGuard>
        <div className="flex flex-col bg-white">
          {/* Full-screen hero */}
          <Hero onEnterPortal={() => setView('onboarding')} />

          {/* Content sections — padded at bottom for floating CTA bar */}
          <div className="pb-nav">
            <SocialProofBar />

            <AppSuiteCarousel
              groups={appGroups}
              onSelect={() => setView('onboarding')}
            />

            <Features />

            <Testimonials />

            <PricingCta onEnterPortal={() => setView('onboarding')} />

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
          <FloatingCta onEnterPortal={() => setView('onboarding')} />
        </div>
      </InvitationGuard>
    );
  }

  // ── ONBOARDING WIZARD ──────────────────────────────────────────────────
  if (view === 'onboarding') {
    return (
      <InvitationGuard>
        <OnboardingWizard 
          onComplete={() => setView('tenant')}
          onCancel={() => setView('landing')}
        />
      </InvitationGuard>
    );
  }

  // ── APP SHELL (Dashboard / Admin) ─────────────────────────────────────────
  return (
    <InvitationGuard>
      <div className="min-h-screen flex flex-col bg-slate-50">
        {/* Minimal app header */}
        <AppHeader
          title={view === 'admin' ? 'Katuwang Admin' : (currentTenant?.name || 'Katuwang')}
          subtitle={view === 'admin' ? 'Control Switch' : (currentTenant?.moduleType || 'Dashboard')}
          onBack={() => {
            if (currentTenant) {
              setCurrentTenant(null);
            } else {
              setView('landing');
            }
          }}
        />

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto pb-nav">
          {view === 'admin' ? <AdminKillSwitch /> : <TenantDashboard activeTab={activeTab} />}
        </div>

        {/* Native bottom nav — only in app, not on landing */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
        />

        {/* Floating Katuwang AI Co-Pilot Button */}
        {view === 'tenant' && <CoPilotButton />}
      </div>
    </InvitationGuard>
  );
}
