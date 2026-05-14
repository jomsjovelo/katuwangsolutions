import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Handshake, ChevronRight, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface HeroProps {
  onEnterPortal: () => void;
  onAdminLogin: () => void;
}

export function Hero({ onEnterPortal, onAdminLogin }: HeroProps) {
  return (
    <>
      {/* ── STICKY NAV ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-border/10 flex justify-between items-center px-4 py-3 md:px-8 shadow-sm">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Handshake className="h-6 w-6 text-primary" strokeWidth={1.5} />
          <div className="flex flex-col">
            <span className="text-sm font-black tracking-[0.1em] text-primary uppercase leading-none">Katuwang</span>
            <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-slate-400 mt-0.5">Solutions</span>
          </div>
        </div>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-8">
          <a href="#products" className="text-[11px] font-bold text-slate-500 hover:text-primary uppercase tracking-[0.15em] transition-colors">Produkto</a>
          <a href="#about"    className="text-[11px] font-bold text-slate-500 hover:text-primary uppercase tracking-[0.15em] transition-colors">Tungkol Sa Amin</a>
          <a href="#features" className="text-[11px] font-bold text-slate-500 hover:text-primary uppercase tracking-[0.15em] transition-colors">Benepisyo</a>
        </nav>

        {/* CTA buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:flex text-[10px] font-bold h-8 px-3 rounded-xl text-slate-500 hover:bg-slate-100 uppercase tracking-widest"
            onClick={onAdminLogin}
          >
            Admin
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-[10px] font-bold h-8 px-4 rounded-xl text-slate-800 border-slate-200 hover:bg-slate-50 uppercase tracking-widest"
            onClick={onEnterPortal}
          >
            Mag-Login
          </Button>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="px-5 pb-10 pt-10 md:pt-20 md:pb-16 text-center flex flex-col items-center bg-gradient-to-b from-white to-slate-50/50">

        {/* Badge */}
        <Badge
          variant="outline"
          className="rounded-full border-transparent bg-secondary/15 px-5 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-yellow-800 mb-5 inline-flex items-center gap-2"
        >
          <Zap className="h-3 w-3 text-secondary" />
          Mura. Mabilis. Maaasahan.
        </Badge>

        {/* Headline — smaller on mobile, bigger on desktop */}
        <h1 className="text-3xl sm:text-4xl md:text-6xl font-black text-slate-900 leading-[1.1] tracking-tight max-w-[320px] sm:max-w-[480px] md:max-w-[700px] mb-4">
          Ang <span className="text-primary">Katuwang</span> ng Negosyo Mo.
        </h1>

        {/* Subheadline */}
        <p className="text-slate-600 text-sm sm:text-base md:text-xl leading-relaxed max-w-[300px] sm:max-w-[420px] md:max-w-[550px] mb-8 font-medium">
          Upgrade your daily operations. Walang kahirap-hirap na sales, inventory, at utang tracking para sa mga tindahan, palengke, at services.
        </p>

        {/* CTA Button — full width on mobile, constrained on desktop */}
        <div className="w-full max-w-[340px] md:max-w-sm space-y-3 mb-10">
          <Button
            className={cn(
              "w-full h-14 md:h-16 rounded-2xl text-base md:text-lg font-bold bg-primary text-white",
              "hover:bg-primary/95 active:scale-[0.98] transition-all shadow-xl shadow-primary/25",
              "flex items-center justify-between px-5 md:px-6 border-none"
            )}
            onClick={onEnterPortal}
          >
            <span className="tracking-tight">Magsimula Ngayon</span>
            <div className="flex items-center gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-semibold line-through text-white/50">₱199</span>
                <span className="text-sm font-black text-secondary">₱99/mo</span>
              </div>
              <ChevronRight className="h-4 w-4 opacity-90" />
            </div>
          </Button>
          <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold text-center">
            Walang setup fee. Cancel anytime.
          </p>
        </div>

        {/* Hero Image — 4/3 on mobile for taller, 16/10 on desktop */}
        <div className="w-full max-w-sm sm:max-w-lg md:max-w-2xl rounded-[24px] md:rounded-[32px] overflow-hidden shadow-2xl relative aspect-[4/3] md:aspect-[16/10] bg-slate-100 border-4 md:border-8 border-white">
          <Image
            src="/katuwang-partnership.png"
            alt="Katuwang Partnership"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none flex flex-col justify-end p-5 md:p-10">
            <p className="text-white text-[10px] md:text-sm font-bold tracking-[0.25em] uppercase drop-shadow-md">
              Kasama mo sa bawat hakbang.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
