'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Zap, WifiOff, RefreshCw } from 'lucide-react';
import { LoginDialog } from '@/components/auth/login-dialog';
import { StaffRegisterDialog } from '@/components/auth/staff-register-dialog';
import { BrandLogo } from '@/components/ui/brand-logo';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';

export function Hero() {
  const { open, openSheet, closeSheet } = useRegisterSheet();

  return (
    <>
      <section className="relative w-full overflow-hidden" style={{ height: '100svh', minHeight: '600px' }}>
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
        <div className="absolute top-0 left-0 right-0 px-6 md:px-12 flex justify-between items-center z-10 pt-12">
          <BrandLogo theme="dark" />
          <React.Suspense fallback={
            <button className="h-8 px-4 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white text-[11px] font-bold tracking-widest uppercase active:scale-95 transition-transform">
              Login
            </button>
          }>
            <LoginDialog>
              <button className="h-8 px-4 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white text-[11px] font-bold tracking-widest uppercase active:scale-95 transition-transform">
                Login
              </button>
            </LoginDialog>
          </React.Suspense>
        </div>

        {/* Bottom content */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-8 z-10 space-y-4">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 bg-secondary/90 text-yellow-900 px-4 py-1.5 rounded-full">
            <Zap className="h-3 w-3" />
            <span className="text-[10px] font-black uppercase tracking-[0.15em]">Mura. Mabilis. Maaasahan.</span>
          </div>

          {/* Main Headline */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both">
            <h1 className="text-[2.4rem] font-black text-white leading-[1.06] tracking-tight mb-2">
              Mas madaling<br />patakbuhin ang{' '}
              <span className="text-primary">negosyo.</span>
            </h1>
            <p className="text-white/70 text-sm leading-relaxed max-w-xs">
              Isang sistema para sa benta, inventory, gastos, utang, trucking, at marami pang iba.
            </p>
          </div>

          {/* Pricing row */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 ease-out fill-mode-both flex items-center gap-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-white/40 text-sm font-semibold line-through">₱199</span>
              <span className="text-white text-2xl font-black">₱99</span>
              <span className="text-white/60 text-sm">/buwan</span>
            </div>
            <div className="h-4 w-px bg-white/20" />
            <div className="flex gap-2">
              <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-2.5 py-1">
                <WifiOff className="h-2.5 w-2.5 text-emerald-400" />
                <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wide">Works Offline</span>
              </div>
              <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-2.5 py-1">
                <RefreshCw className="h-2.5 w-2.5 text-sky-400" />
                <span className="text-[9px] font-bold text-sky-300 uppercase tracking-wide">Auto Sync</span>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 ease-out fill-mode-both flex flex-col gap-2.5">
            <button
              onClick={openSheet}
              className="w-full h-14 rounded-2xl font-bold text-base bg-primary text-white border-none shadow-2xl shadow-primary/40 active:scale-[0.97] transition-transform flex items-center justify-between px-6"
            >
              <span>Register Now</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/75">No credit card required</span>
                <ChevronRight className="h-4 w-4 opacity-80" />
              </div>
            </button>

            <Link
              href="#products"
              className="w-full h-11 rounded-2xl font-bold text-sm bg-white/10 backdrop-blur-md border border-white/20 text-white active:scale-[0.97] transition-transform flex items-center justify-center gap-2 hover:bg-white/15"
            >
              Tingnan ang Modules
              <ChevronRight className="h-3.5 w-3.5 opacity-70" />
            </Link>
          </div>

          {/* Scroll hint */}
          <p className="text-white/35 text-[10px] text-center uppercase tracking-[0.25em] font-bold pt-1">
            Scroll pababa para malaman pa ↓
          </p>
        </div>
      </section>

      <RegisterSheet open={open} onClose={closeSheet} />

      {/* Staff invite URL handler */}
      <React.Suspense fallback={null}>
        <StaffRegisterDialog />
      </React.Suspense>
    </>
  );
}
