import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ChevronRight, Zap } from 'lucide-react';

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

      {/* Top-left logo mark — small and non-intrusive */}
      <div className="absolute top-0 left-0 right-0 pt-safe px-5 pt-5 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center">
            <span className="text-white font-black text-sm tracking-tight">K</span>
          </div>
          <span className="text-white/90 text-xs font-bold tracking-[0.15em] uppercase">Katuwang</span>
        </div>
        <button
          onClick={onEnterPortal}
          className="h-8 px-4 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white text-[11px] font-bold tracking-widest uppercase active:scale-95 transition-transform"
        >
          Login
        </button>
      </div>

      {/* Bottom content — headline + badge + scroll hint */}
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-8 z-10">
        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 bg-secondary/90 text-yellow-900 px-4 py-1.5 rounded-full mb-4">
          <Zap className="h-3 w-3" />
          <span className="text-[10px] font-black uppercase tracking-[0.15em]">Mura. Mabilis. Maaasahan.</span>
        </div>

        {/* Headline */}
        <h1 className="text-[2.2rem] font-black text-white leading-[1.08] tracking-tight mb-3">
          Ang <span className="text-primary">Katuwang</span>{'\n'}ng Negosyo Mo.
        </h1>

        {/* Sub text */}
        <p className="text-white/70 text-sm leading-relaxed mb-6 max-w-xs">
          Walang kahirap-hirap. Sales, stock, at utang — lahat nasa iisang app.
        </p>

        {/* Primary CTA — full width, native-feeling */}
        <Button
          className="w-full h-14 rounded-2xl font-bold text-base bg-primary text-white border-none shadow-2xl shadow-primary/40 active:scale-[0.97] transition-transform flex items-center justify-between px-5"
          onClick={onEnterPortal}
        >
          <span>Magsimula Ngayon</span>
          <div className="flex items-center gap-2">
            <div className="flex items-baseline gap-1">
              <span className="text-xs line-through text-white/50">₱199</span>
              <span className="text-sm font-black text-secondary">₱99/mo</span>
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
