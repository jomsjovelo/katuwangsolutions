import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/brand-logo';

// Marketing components
const Hero = dynamic(() => import('@/components/marketing/hero').then(mod => mod.Hero));
const SocialProofBar = dynamic(() => import('@/components/marketing/social-proof-bar').then(mod => mod.SocialProofBar));
const AppSuiteCarousel = dynamic(() => import('@/components/marketing/app-suite-carousel').then(mod => mod.AppSuiteCarousel));
const Features = dynamic(() => import('@/components/marketing/features').then(mod => mod.Features));
const Testimonials = dynamic(() => import('@/components/marketing/testimonials').then(mod => mod.Testimonials));
const PricingCta = dynamic(() => import('@/components/marketing/pricing-cta').then(mod => mod.PricingCta));
const FloatingCta = dynamic(() => import('@/components/marketing/floating-cta').then(mod => mod.FloatingCta));
const InvitationGuard = dynamic(() => import('@/components/auth/invitation-guard').then(mod => mod.InvitationGuard));

import { appGroups } from '@/lib/app-data';

export default function Home() {
  return (
    <InvitationGuard>
      <div className="flex flex-col bg-white">
        {/* Full-screen hero */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <Hero />
        </div>

        {/* Content sections */}
        <div className="pb-24">
          <SocialProofBar />

          <div className="flex flex-col items-center">
            <AppSuiteCarousel groups={appGroups} />
            <Link 
              href="/onboarding"
              className="mb-8 mt-2 rounded-xl border border-slate-300 text-slate-600 font-bold px-8 py-3 hover:bg-slate-100 active:scale-95 transition-all shadow-sm"
            >
              View all Products
            </Link>
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200 fill-mode-both">
            <Features />
          </div>

          <Testimonials />

          <PricingCta />

          <footer className="py-10 bg-slate-950">
            <div className="text-center flex flex-col items-center gap-4">
              <div className="opacity-40 hover:opacity-100 transition-opacity">
                <BrandLogo theme="dark" />
              </div>
              <div className="text-slate-500 text-[9px] font-bold uppercase tracking-[0.35em] leading-loose flex flex-col items-center gap-1">
                <div>
                  <span translate="no" className="notranslate">Katuwang Solutions</span> · Framework v1.2
                </div>
                <Link href="/terms" className="text-slate-400 hover:text-white transition-colors">
                  Terms & Conditions
                </Link>
                <div>&copy; {new Date().getFullYear()} All Rights Reserved.</div>
              </div>
            </div>
          </footer>
        </div>

        {/* Floating bottom CTA — always visible */}
        <FloatingCta />
      </div>
    </InvitationGuard>
  );
}
