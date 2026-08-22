import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Facebook, MessageCircle, Globe, Mail, FileText, HelpCircle, Info } from 'lucide-react';

import { activeModulesCount } from '@/lib/app-data';

import { Hero } from '@/components/marketing/hero';
import { SocialProofBar } from '@/components/marketing/social-proof-bar';
import { BusinessFinder } from '@/components/marketing/business-finder';
import { ProblemFirst } from '@/components/marketing/problem-first';
import { AppSuiteCarousel } from '@/components/marketing/app-suite-carousel';
import { Features } from '@/components/marketing/features';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { Testimonials } from '@/components/marketing/testimonials';
import { ReferralSection } from '@/components/marketing/referral-section';
import { PricingCta } from '@/components/marketing/pricing-cta';
import { FloatingCta } from '@/components/marketing/floating-cta';
import { InvitationGuard } from '@/components/auth/invitation-guard';
import { MessengerWidget } from '@/components/marketing/messenger-widget';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Katuwang Solutions | Ang Katuwang mo sa Negosyo',
  description: 'Sales, inventory, at utang tracking para sa mga tindahan, palengke, at services. Mura. Mabilis. Maaasahan.',
  alternates: {
    canonical: 'https://katuwangsolutions.com/',
  },
};

export default function Home() {
  return (
    <InvitationGuard>
      <div className="flex flex-col bg-white">

        {/* 1. Hero — Full-screen cinematic opener */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <Hero />
        </div>

        {/* 2. Social Proof — Trust pills + stats */}
        <SocialProofBar />

        {/* Content sections with bottom padding for FloatingCta */}
        <div className="pb-24">

          {/* 3. Business Finder — "Anong negosyo ang meron ka?" */}
          <BusinessFinder />

          {/* 4. Problem-First — "Alin dito ang challenge?" */}
          <ProblemFirst />

          {/* 5. Featured Modules — 5 flagship apps */}
          <AppSuiteCarousel />

          {/* 6. Why Katuwang — 6 feature cards */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200 fill-mode-both">
            <Features />
          </div>

          {/* 7. How It Works — 4-step process */}
          <HowItWorks />

          {/* 8. Testimonials */}
          <Testimonials />

          {/* 9. Referral Program */}
          <ReferralSection />

          {/* 10. Pricing CTA */}
          <PricingCta />

          {/* 11. Footer */}
          <footer className="bg-slate-950 pt-12 pb-8">
            <div className="max-w-5xl mx-auto px-5">

              {/* Top footer — logo + nav columns */}
              <div className="flex flex-col sm:flex-row gap-10 sm:gap-16 mb-10">

                {/* Brand column */}
                <div className="flex-1 space-y-3">
                  <div className="opacity-80 hover:opacity-100 transition-opacity inline-block">
                    <BrandLogo theme="dark" />
                  </div>
                  <p className="text-slate-500 text-xs leading-relaxed max-w-[220px]">
                    Ang all-in-one platform para sa Pilipinong negosyante. 18 modules (17 business modules + Budget Mo) · Promo ₱50–₱99/mo bawat module (regular ₱100–₱199/mo).
                  </p>
                  {/* Social links */}
                  <div className="flex items-center gap-3 pt-1">
                    <a
                      href="https://www.facebook.com/katuwangsolutions"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-primary/80 transition-all"
                      aria-label="Facebook"
                    >
                      <Facebook className="h-4 w-4" />
                    </a>
                    <a
                      href="https://m.me/katuwangsolutions"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-primary/80 transition-all"
                      aria-label="Messenger"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                    <a
                      href="https://katuwangsolutions.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-primary/80 transition-all"
                      aria-label="Website"
                    >
                      <Globe className="h-4 w-4" />
                    </a>
                  </div>
                </div>

                {/* Nav links */}
                <div className="grid grid-cols-2 gap-6 sm:gap-10 text-sm">
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Kumpanya</h4>
                    <div className="space-y-2.5">
                      <FooterLink icon={Info} href="/about" label="Tungkol sa Amin" />
                      <FooterLink icon={Globe} href="/modules" label="Lahat ng Modules" />
                      <FooterLink icon={Mail} href="mailto:support@katuwangsolutions.com" label="Makipag-ugnayan" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Suporta</h4>
                    <div className="space-y-2.5">
                      <FooterLink icon={HelpCircle} href="/faq" label="FAQ" />
                      <FooterLink icon={FileText} href="/terms" label="Terms & Conditions" />
                      <FooterLink icon={FileText} href="/privacy" label="Privacy Policy" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom bar */}
              <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em]">
                  <span translate="no" className="notranslate">Katuwang Solutions</span>
                </p>
                <p className="text-slate-600 text-[10px] font-semibold">
                  © {new Date().getFullYear()} All Rights Reserved.
                </p>
              </div>

            </div>
          </footer>

        </div>

        {/* Global Floating Elements for Landing Page */}
        <FloatingCta />
        <MessengerWidget />
      </div>
    </InvitationGuard>
  );
}

function FooterLink({ icon: Icon, href, label }: { icon: React.ElementType; href: string; label: string }) {
  const isExternal = href.startsWith('http') || href.startsWith('mailto');
  if (isExternal) {
    return (
      <a
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-xs"
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-xs">
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      {label}
    </Link>
  );
}
