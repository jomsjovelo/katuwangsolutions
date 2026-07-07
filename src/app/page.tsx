import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Facebook, MessageCircle, Globe, Mail, FileText, HelpCircle, Info } from 'lucide-react';

// Marketing components — all lazily loaded for performance
const Hero = dynamic(() => import('@/components/marketing/hero').then(mod => mod.Hero));
const SocialProofBar = dynamic(() => import('@/components/marketing/social-proof-bar').then(mod => mod.SocialProofBar));
const BusinessFinder = dynamic(() => import('@/components/marketing/business-finder').then(mod => mod.BusinessFinder));
const ProblemFirst = dynamic(() => import('@/components/marketing/problem-first').then(mod => mod.ProblemFirst));
const AppSuiteCarousel = dynamic(() => import('@/components/marketing/app-suite-carousel').then(mod => mod.AppSuiteCarousel));
const Features = dynamic(() => import('@/components/marketing/features').then(mod => mod.Features));
const HowItWorks = dynamic(() => import('@/components/marketing/how-it-works').then(mod => mod.HowItWorks));
const Testimonials = dynamic(() => import('@/components/marketing/testimonials').then(mod => mod.Testimonials));
const ReferralSection = dynamic(() => import('@/components/marketing/referral-section').then(mod => mod.ReferralSection));
const PricingCta = dynamic(() => import('@/components/marketing/pricing-cta').then(mod => mod.PricingCta));
const FloatingCta = dynamic(() => import('@/components/marketing/floating-cta').then(mod => mod.FloatingCta));
const InvitationGuard = dynamic(() => import('@/components/auth/invitation-guard').then(mod => mod.InvitationGuard));

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
                    Ang all-in-one business management system para sa Pilipinong negosyante. ₱99 / buwan.
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
                  <span translate="no" className="notranslate">Katuwang Solutions</span> · Framework v1.2
                </p>
                <p className="text-slate-600 text-[10px] font-semibold">
                  © {new Date().getFullYear()} All Rights Reserved.
                </p>
              </div>

            </div>
          </footer>

        </div>

        {/* Fixed floating CTA — always visible */}
        <FloatingCta />
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
