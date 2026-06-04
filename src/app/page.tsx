"use client"

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

import {
  ShoppingCart, Leaf, Hammer,
  Utensils, Coffee, CalendarHeart, RotateCcw, Droplets,
  Sparkles, Sun, Banknote, BookText, Truck, Scissors, Dumbbell
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
import { BrandLogo } from '@/components/ui/brand-logo';
import { AdminPricingManager } from '@/components/admin/admin-pricing-manager';

// ─── App data ────────────────────────────────────────────────────────────────

import { appGroups } from '@/lib/app-data';

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
    if (currentTenant) {
      setView(prev => prev !== 'admin' ? 'tenant' : prev);
    }
  }, [currentTenant]);

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
                  <span translate="no" className="notranslate">Katuwang Solutions</span> · Framework v1.2<br />&copy; {new Date().getFullYear()} All Rights Reserved.
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
          {view === 'admin' ? (
            <div className="p-4 space-y-6">
              <AdminKillSwitch />
              <AdminPricingManager />
            </div>
          ) : (
            <TenantDashboard activeTab={activeTab} />
          )}
        </div>

        {/* Native bottom nav — only in app, not on landing */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
        />
      </div>
    </InvitationGuard>
  );
}
