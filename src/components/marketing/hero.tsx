import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ChevronRight, Zap } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { LoginDialog } from '@/components/auth/login-dialog';

interface HeroProps {
  onEnterPortal: () => void;
}

export function Hero({ onEnterPortal }: HeroProps) {
  return (
    <section className="relative w-full overflow-hidden" style={{ height: '100svh', minHeight: '600px' }}>
      {/* Full-bleed background image */}
      <Image
        src="/katuwang-partnership.png"
        alt="Katuwang — Kasama mo sa bawat hakbang"
        fill
        className="object-cover object-center"
        priority
      />

      {/* Gradient overlay — dark at bottom for readability, subtle at top */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10 pointer-events-none" />

      {/* Top-left logo mark */}
      <div className="absolute top-12 left-0 right-0 px-8 md:px-12 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8" />
          <div className="flex flex-col">
            <span className="text-white/90 text-xs font-bold tracking-[0.15em] uppercase leading-none">Katuwang</span>
            <span className="text-white/60 text-[8px] font-bold tracking-[0.2em] uppercase leading-tight mt-0.5">Solutions</span>
          </div>
        </div>
        <LoginDialog>
          <button
            className="h-8 px-4 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white text-[11px] font-bold tracking-widest uppercase active:scale-95 transition-transform"
          >
            Login
          </button>
        </LoginDialog>
      </div>

      {/* Bottom content — headline + badge + scroll hint */}
      <div className="absolute bottom-0 left-0 right-0 px-8 pb-8 z-10">
        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 bg-secondary/90 text-yellow-900 px-4 py-1.5 rounded-full mb-4">
          <Zap className="h-3 w-3" />
          <span className="text-[10px] font-black uppercase tracking-[0.15em]">Mura. Mabilis. Maaasahan.</span>
        </div>

        {/* Headline */}
        <h1 className="text-[2.2rem] font-black text-white leading-[1.08] tracking-tight mb-3 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both">
          Wala nang listahang nawawala.{'\n'}<span className="text-primary">Wala nang utang na nakakalimutan.</span>
        </h1>

        {/* Sub text */}
        <p className="text-white/70 text-sm leading-relaxed mb-6 max-w-xs animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 ease-out fill-mode-both">
          Iwanan na ang lumang kwaderno. I-track ang sales, stock, at pautang gamit ang phone mo—kahit walang internet.
        </p>

        {/* Primary CTA — full width, native-feeling */}
        <Button
          className="w-full h-14 rounded-2xl font-bold text-base bg-primary text-white border-none shadow-2xl shadow-primary/40 active:scale-[0.97] transition-transform flex items-center justify-between px-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 ease-out fill-mode-both"
          onClick={onEnterPortal}
        >
          <span>Libre Subukan</span>
          <div className="flex items-center gap-2">
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-semibold text-white/80">No credit card required</span>
            </div>
            <ChevronRight className="h-4 w-4 opacity-80" />
          </div>
        </Button>

        {/* Scroll hint */}
        <p className="text-white/40 text-[10px] text-center mt-4 uppercase tracking-[0.25em] font-bold">
          Scroll pababa para malaman pa ↓
        </p>
      </div>
    </section>
  );
}
