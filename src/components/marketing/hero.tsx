'use client';

import React from 'react';
import Image from 'next/image';
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/30 pointer-events-none" />

        {/* Top nav */}
        <div className="relative z-30 w-full px-4 sm:px-6 md:px-12 flex justify-between items-center pt-3 sm:pt-4 md:pt-8 pb-2 sm:pb-4">
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
        <div className="relative z-10 w-full max-w-xl mx-auto px-4 sm:px-6 pb-4 sm:pb-8 space-y-3 sm:space-y-4 mt-auto">

          {/* Eyebrow, Headline & Supporting Copy */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both space-y-1.5 sm:space-y-2">
            <span className="inline-block px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-primary/20 border border-primary/30 text-emerald-300 font-bold text-[10px] sm:text-[11px] uppercase tracking-wider">
              Business software para sa Filipino entrepreneurs
            </span>
            <h1 className="text-xl sm:text-3xl md:text-4xl font-black text-white leading-tight tracking-tight">
              Mas organisadong negosyo, isang module sa bawat pangangailangan.
            </h1>
            <p className="text-white/80 text-xs sm:text-sm leading-relaxed max-w-lg">
              Pumili ng praktikal na module para sa benta, inventory, orders, payroll, gastos, at iba pang araw-araw na trabaho.
            </p>
          </div>

          {/* Pricing Presentation — Two compact, readable rows */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 ease-out fill-mode-both flex flex-col gap-1.5 sm:gap-2 bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-2.5 sm:p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-white">
              <span className="font-bold text-white/90">Business modules</span>
              <div className="flex items-center gap-1.5 text-right">
                <span className="text-emerald-300 font-extrabold text-[11px] sm:text-xs">Promo ₱99/mo bawat module</span>
                <span className="text-white/70 line-through text-[11px] sm:text-xs font-semibold">regular ₱199/mo</span>
              </div>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex items-center justify-between gap-2 text-xs text-white">
              <span className="font-bold text-white/90">Budget Mo</span>
              <div className="flex items-center gap-1.5 text-right">
                <span className="text-sky-300 font-extrabold text-[11px] sm:text-xs">Promo ₱50/mo</span>
                <span className="text-white/70 line-through text-[11px] sm:text-xs font-semibold">regular ₱100/mo</span>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-2.5">
            <a
              href="#business-finder"
              className="w-full sm:flex-1 h-11 sm:h-12 min-h-[44px] rounded-xl font-bold text-xs sm:text-sm bg-primary text-white border-none shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform motion-reduce:transition-none motion-reduce:transform-none flex items-center justify-center gap-2 px-4 text-center focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-black"
            >
              <span>Hanapin ang Module Ko</span>
              <ChevronRight className="h-4 w-4 opacity-90 shrink-0" />
            </a>

            <button
              data-testid="hero-register-cta"
              onClick={openSheet}
              className="w-full sm:flex-1 h-11 sm:h-12 min-h-[44px] rounded-xl font-bold text-xs sm:text-sm bg-white/10 backdrop-blur-md border border-white/20 text-white active:scale-[0.98] transition-transform motion-reduce:transition-none motion-reduce:transform-none flex items-center justify-center gap-2 px-4 hover:bg-white/15 text-center focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              <span>May napili na? Mag-register</span>
              <ChevronRight className="h-4 w-4 opacity-80 shrink-0" />
            </button>
          </div>

          {/* Scroll hint */}
          <p className="text-white/40 text-[9px] sm:text-[10px] text-center uppercase tracking-[0.2em] font-semibold pt-0.5">
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
