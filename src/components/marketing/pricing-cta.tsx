import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';

export interface PricingCtaProps {
  onEnterPortal: () => void;
}

export function PricingCta({ onEnterPortal }: PricingCtaProps) {
  return (
    <section className="py-24 md:py-32 px-6 bg-primary relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
      
      <div className="max-w-4xl mx-auto text-center space-y-10 relative z-10">
        <div className="space-y-4">
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight">
            Handa na bang palaguin ang negosyo?
          </h2>
          <p className="text-primary-foreground/80 text-lg md:text-xl font-medium max-w-2xl mx-auto">
            Sumali sa libo-libong Pilipinong negosyante na gumagamit na ng Katuwang Solutions.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 md:p-12 rounded-[32px] max-w-xl mx-auto space-y-8 shadow-2xl">
          <div className="space-y-2">
             <div className="inline-block px-4 py-1.5 bg-secondary text-yellow-900 text-[10px] font-black uppercase tracking-widest rounded-full mb-4 shadow-md">
                Limited Time Offer
             </div>
            <div className="flex justify-center items-baseline gap-3">
              <span className="text-2xl font-bold text-white/50 line-through">₱199</span>
              <span className="text-6xl md:text-7xl font-black text-white tracking-tighter">₱99</span>
              <span className="text-xl font-medium text-white/80">/buwan</span>
            </div>
            <p className="text-white/70 text-sm mt-2 font-medium">Lahat ng 15 modules. Isang presyo.</p>
          </div>

          <Button 
            className="w-full h-16 rounded-2xl text-lg font-bold bg-secondary text-secondary-foreground hover:bg-secondary/90 transition-all active:scale-[0.98] shadow-xl flex items-center justify-center gap-2"
            onClick={onEnterPortal}
          >
            Magsimula Ngayon
            <ChevronRight className="h-5 w-5" />
          </Button>

          <p className="text-xs text-white/50 uppercase tracking-[0.2em] font-bold">
            Walang setup fee. Cancel anytime. 7-day free trial.
          </p>
        </div>
      </div>
    </section>
  );
}
