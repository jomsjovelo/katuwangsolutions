'use client';

import React from 'react';
import { ChevronRight, Check } from 'lucide-react';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';

export function PricingCta() {
  const { open, openSheet, closeSheet } = useRegisterSheet();

  const inclusions = [
    '20 modules (19 business modules + Budget Mo)',
    'Module-based, per-selected-module subscription',
    'Manual GCash/Maya payment (subject to verification)',
    'Mobile-first design na madaling gamitin sa cellphone',
    'No auto-renew — ikaw ang may kontrol',
    'Pumili ng module at simulan ang onboarding',
  ];

  return (
    <>
      <section className="py-16 md:py-28 px-5 bg-slate-900 relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="max-w-4xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row gap-10 md:gap-16 items-center">

            {/* Left — copy */}
            <div className="flex-1 text-center md:text-left space-y-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Presyo</p>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
                Handa na bang<br />
                <span className="text-primary">palaguin ang negosyo?</span>
              </h2>
              <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-sm mx-auto md:mx-0">
                Ang matapat na Katuwang ng Pilipinong negosyante sa presyong swak sa budget!
              </p>

              {/* Inclusions */}
              <ul className="space-y-2.5 text-left">
                {inclusions.map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                    </div>
                    <span className="text-sm text-slate-300">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — pricing card */}
            <div className="w-full max-w-[300px] flex-shrink-0">
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-7 rounded-[28px] space-y-6 shadow-2xl text-center">
                <div>
                  <div className="inline-block px-4 py-1.5 bg-secondary text-yellow-900 text-[10px] font-black uppercase tracking-widest rounded-full mb-4 shadow-md">
                    Special Promo Rate
                  </div>
                  <div className="flex justify-center items-baseline gap-2 mb-1">
                    <span className="text-xl font-bold text-white/40 line-through">₱199</span>
                    <span className="text-6xl font-black text-white tracking-tighter">₱99</span>
                  </div>
                  <p className="text-slate-300 text-xs font-semibold">Promo ₱99/mo bawat module (regular ₱199/mo)</p>
                </div>

                <button
                  onClick={openSheet}
                  className="w-full h-14 rounded-2xl text-base font-bold bg-secondary text-slate-900 hover:bg-secondary/90 transition-all active:scale-[0.98] shadow-xl flex items-center justify-center gap-2"
                >
                  Mag-register
                  <ChevronRight className="h-5 w-5" />
                </button>

                <p className="text-[11px] text-white/60 font-bold leading-relaxed">
                  Para sa 19 standard business modules (regular ₱199/mo).<br />
                  <span className="text-white/80 font-medium">Budget Mo promo: ₱50/mo bawat module (regular ₱100/mo)</span>
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      <RegisterSheet open={open} onClose={closeSheet} ctaSource="pricing_section" />
    </>
  );
}
