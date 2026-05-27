"use client"

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

import {
  Handshake, ShoppingCart, Leaf, Hammer, Sprout,
  Utensils, Coffee, CalendarHeart, RotateCcw, Droplets,
  Sparkles, Sun, Wrench, Banknote, BookText, Truck, Wallet, Scissors, Dumbbell
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { BrandLogo } from '@/components/ui/brand-logo';

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
      { name: 'Benta Snap',  icon: ShoppingCart, tagline: 'Lightning-fast retail checkout to maximize your daily sales.',          imageSrc: '/apps/benta-snap.png' },
      { name: 'Fresh Tally', icon: Leaf,          tagline: 'Smart inventory tracking to keep your fresh produce moving.',             imageSrc: '/apps/fresh-tally.png' },
      { name: 'Build Stack', icon: Hammer,        tagline: 'Precision material tracking for seamless construction supply.',imageSrc: '/apps/build-stack.png' },
    ],
  },
  {
    id: 'food',
    label: 'Food',
    accentColor: '#F97316',
    apps: [
      { name: 'Bite Snap',    icon: Utensils,        tagline: 'Rapid order-to-kitchen flow for hungry diners.', imageSrc: '/apps/bite-snap.png' },
      { name: 'Timpla Track', icon: Coffee,           tagline: 'Crafted cafe operations for the perfect brew every time.',          imageSrc: '/apps/timpla-track.png' },
      { name: 'Ganap Master',   icon: CalendarHeart, tagline: 'Orchestrate unforgettable events with flawless planning.',     imageSrc: '/apps/ganap-master.png' },
    ],
  },
  {
    id: 'service',
    label: 'Serbisyo',
    accentColor: '#8B5CF6',
    apps: [
      { name: 'Spin Snap',  icon: RotateCcw, tagline: 'Automated laundry tracking from drop-off to pickup.', imageSrc: '/apps/spin-snap.png' },
      { name: 'Hydro Sync', icon: Droplets,  tagline: 'Streamlined water delivery logistics for thirsty neighborhoods.',         imageSrc: '/apps/hydro-sync.png' },
      { name: 'Auto Boss', icon: Sparkles,  tagline: 'Rev up your shop with automated slot and payment tracking.',      imageSrc: '/apps/auto-boss.png' },
      { name: 'Wellness Pro',  icon: Sun,       tagline: 'Elevate your spa experience with seamless booking and billing.',         imageSrc: '/apps/wellness-pro.png' },
      { name: 'Trim Track',    icon: Scissors,  tagline: 'Keep your barber chairs full and your payments tracked.',    imageSrc: '/apps/trim-track.png' },
      { name: 'Rep Sync',   icon: Dumbbell,    tagline: 'Automate gym memberships, attendance, and renewals effortlessly.',         imageSrc: '/apps/rep-sync.png' },
    ],
  },
  {
    id: 'business',
    label: 'Negosyo',
    accentColor: '#10B981',
    apps: [
      { name: 'Sahod Flow',   icon: Banknote,  tagline: 'Effortless payroll management for a happy, on-time team.',  imageSrc: '/apps/sahod-flow.png' },
      { name: 'Ledger Flow',  icon: BookText,  tagline: 'Crystal-clear financial insights to watch your profits soar.',      imageSrc: '/apps/ledger-flow.png' },
      { name: 'Biyahe Sync',  icon: Truck,     tagline: 'Real-time fleet dispatching to keep your business moving.',          imageSrc: '/apps/biyahe-sync.png' },
    ],
  },
  {
    id: 'financial',
    label: 'Pinansyal',
    accentColor: '#3B82F6',
    apps: [
      { name: '5-6 Tracker', icon: BookText, tagline: 'Secure, automated lending lists for faster collections.', imageSrc: '/apps/5-6-tracker.png' },
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
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

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
        <div className="flex flex-col items-center gap-6">
          <BrandLogo showText={false} className="[&>div]:h-20 [&>div]:w-20 animate-pulse" />
          <div className="w-32 h-0.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#00BFFF] rounded-full"
              style={{ animation: 'loading 1.5s ease-in-out infinite' }} />
          </div>
          <style>{`
            @keyframes loading {
              0% { width: 0%; margin-left: 0%; }
              50% { width: 60%; margin-left: 20%; }
              100% { width: 0%; margin-left: 100%; }
            }
          `}</style>
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
          <Hero onEnterPortal={() => { setSelectedAppId(null); setView('onboarding'); }} />

          {/* Content sections — padded at bottom for floating CTA bar */}
          <div className="pb-nav">
            <SocialProofBar />

            <div className="flex flex-col items-center">
              <AppSuiteCarousel
                groups={appGroups}
                onSelect={(appName) => {
                  setSelectedAppId(appName);
                  setView('onboarding');
                }}
              />
              <Button 
                variant="outline" 
                className="mb-8 mt-2 rounded-xl border-slate-300 text-slate-600 font-bold px-8 hover:bg-slate-100 active:scale-95 transition-all shadow-sm"
                onClick={() => {
                  setSelectedAppId(null);
                  setView('onboarding');
                }}
              >
                View all Products
              </Button>
            </div>

            <Features />

            <Testimonials />

            <PricingCta onEnterPortal={() => { setSelectedAppId(null); setView('onboarding'); }} />

            <footer className="py-10 bg-slate-950">
              <div className="text-center flex flex-col items-center gap-4">
                <div className="opacity-40 hover:opacity-100 transition-opacity">
                  <BrandLogo theme="dark" />
                </div>
                <p className="text-slate-500 text-[9px] font-bold uppercase tracking-[0.35em] leading-loose">
                  Katuwang Solutions · Framework v1.2<br />&copy; {new Date().getFullYear()} All Rights Reserved.
                </p>
              </div>
            </footer>
          </div>

          {/* Floating bottom CTA — always visible */}
          <FloatingCta onEnterPortal={() => { setSelectedAppId(null); setView('onboarding'); }} />
        </div>
      </InvitationGuard>
    );
  }

  // ── ONBOARDING WIZARD ──────────────────────────────────────────────────
  if (view === 'onboarding') {
    return (
      <InvitationGuard>
        <OnboardingWizard 
          initialAppId={selectedAppId || undefined}
          onComplete={() => setView('tenant')}
          onCancel={() => {
            setSelectedAppId(null);
            setView('landing');
          }}
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
