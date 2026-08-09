'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { LoginDialog } from '@/components/auth/login-dialog';
import { StaffRegisterDialog } from '@/components/auth/staff-register-dialog';
import { BrandLogo } from '@/components/ui/brand-logo';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';

export function Hero() {
  const { open, openSheet, closeSheet } = useRegisterSheet();

  return (
    <>
      <section id="homepage-hero" className="relative w-full min-h-[100svh] overflow-hidden flex flex-col justify-between">
        {/* Full-bleed background image */}
        <Image
          src="/katuwang-partnership.png"
          alt="Katuwang — Kasama mo sa bawat hakbang"
          fill
          className="object-cover object-center"
          priority
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/20 pointer-events-none" />

        {/* Top nav */}
        <div className="relative z-30 w-full px-6 md:px-12 flex justify-between items-center pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-8 pb-4">
          <BrandLogo theme="dark" />
          <React.Suspense fallback={
            <button className="h-11 min-h-[44px] px-5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white text-[11px] font-bold tracking-widest uppercase active:scale-95 transition-transform motion-reduce:transition-none motion-reduce:transform-none flex items-center justify-center">
              Login
            </button>
          }>
            <LoginDialog>
              <button className="h-11 min-h-[44px] px-5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white text-[11px] font-bold tracking-widest uppercase active:scale-95 transition-transform motion-reduce:transition-none motion-reduce:transform-none flex items-center justify-center">
                Login
              </button>
            </LoginDialog>
          </React.Suspense>
        </div>

        {/* Bottom content */}
        <div className="relative z-10 w-full px-6 pb-8 space-y-4 mt-auto">

          {/* Main Headline */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both">
            <h1 className="text-[2.4rem] font-black text-white leading-[1.06] tracking-tight mb-2">
              Mas madaling<br />patakbuhin ang{' '}
              <span className="text-primary">negosyo.</span>
            </h1>
            <p className="text-white/70 text-sm leading-relaxed max-w-xs">
              Isang sistema para sa benta, inventory, gastos, utang, trucking, payroll, at marami pang iba.
            </p>
          </div>

          {/* Pricing row */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 ease-out fill-mode-both flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider">Promo</span>
                <span className="text-white/40 text-sm font-semibold line-through">₱199</span>
                <span className="text-white text-2xl font-black">₱99</span>
                <span className="text-white/60 text-xs font-medium">/mo bawat module</span>
              </div>
              <div className="h-4 w-px bg-white/20" />
              <div className="flex gap-2">
                <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-2.5 py-1">
                  <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wide">19 Business Modules</span>
                </div>
                <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-2.5 py-1">
                  <span className="text-[9px] font-bold text-sky-300 uppercase tracking-wide">Budget Mo Personal</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-white/60 font-medium tracking-wide">
              19 Business Modules (Promo ₱99/mo bawat module · regular ₱199/mo). <span className="text-white/80">Budget Mo promo: ₱50/mo · regular ₱100/mo</span>
            </p>
          </div>

          {/* CTAs */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 ease-out fill-mode-both flex flex-col gap-2.5">
            <button
              data-testid="hero-register-cta"
              onClick={openSheet}
              className="w-full h-14 min-h-[44px] rounded-2xl font-bold text-base bg-primary text-white border-none shadow-2xl shadow-primary/40 active:scale-[0.97] transition-transform motion-reduce:transition-none motion-reduce:transform-none flex items-center justify-between px-6"
            >
              <span>Mag-register</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/75">Walang credit card na kailangan</span>
                <ChevronRight className="h-4 w-4 opacity-80" />
              </div>
            </button>

            <Link
              href="#products"
              className="w-full h-11 min-h-[44px] rounded-2xl font-bold text-sm bg-white/10 backdrop-blur-md border border-white/20 text-white active:scale-[0.97] transition-transform motion-reduce:transition-none motion-reduce:transform-none flex items-center justify-center gap-2 hover:bg-white/15"
            >
              <span>Tingnan ang Modules</span>
              <ChevronRight className="h-4 w-4 opacity-80" />
            </Link>

          </div>

          {/* Scroll hint */}
          <p className="text-white/35 text-[10px] text-center uppercase tracking-[0.25em] font-bold pt-1">
            Scroll pababa para malaman pa ↓
          </p>
        </div>
      </section>

      <RegisterSheet open={open} onClose={closeSheet} ctaSource="hero" />

      {/* Staff invite URL handler */}
      <React.Suspense fallback={null}>
        <StaffRegisterDialog />
      </React.Suspense>
    </>
  );
}
