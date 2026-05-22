import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';

export interface PricingCtaProps {
  onEnterPortal: () => void;
}

export function PricingCta({ onEnterPortal }: PricingCtaProps) {
  return (
    <section className="py-16 md:py-28 px-5 bg-primary relative overflow-hidden">
      <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10">

        <div className="space-y-3">
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">
            Handa na bang palaguin ang negosyo?
          </h2>
          <p className="text-white/80 text-sm md:text-xl font-medium max-w-xl mx-auto">
            Sumali sa libo-libong Pilipinong negosyante na gumagamit na ng Katuwang. Mas mura pa sa kape mo araw-araw!
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-6 md:p-12 rounded-[28px] md:rounded-[32px] max-w-sm mx-auto space-y-6 shadow-2xl">
          <div className="space-y-2">
            <div className="inline-block px-4 py-1.5 bg-secondary text-yellow-900 text-[10px] font-black uppercase tracking-widest rounded-full mb-3 shadow-md">
              Limited Time Offer
            </div>
            <div className="flex justify-center items-baseline gap-2">
              <span className="text-xl font-bold text-white/50 line-through">₱199</span>
              <span className="text-5xl md:text-7xl font-black text-white tracking-tighter">₱99</span>
              <span className="text-lg font-medium text-white/80">/buwan</span>
            </div>
            <p className="text-white/70 text-xs mt-1 font-medium">Lahat ng 15 modules. Isang presyo.</p>
          </div>

          <Button
            className="w-full h-14 rounded-2xl text-base font-bold bg-secondary text-secondary-foreground hover:bg-secondary/90 transition-all active:scale-[0.98] shadow-xl flex items-center justify-center gap-2"
            onClick={onEnterPortal}
          >
            Libre Subukan
            <ChevronRight className="h-5 w-5" />
          </Button>

          <p className="text-[10px] text-white/50 uppercase tracking-[0.2em] font-bold">
            No credit card required. Cancel anytime.
          </p>
        </div>
      </div>
    </section>
  );
}
