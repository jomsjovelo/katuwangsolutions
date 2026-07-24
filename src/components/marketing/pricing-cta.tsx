'use client';

import React from 'react';
import { ChevronRight, Check } from 'lucide-react';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';

import { standardModulesCount } from '@/lib/app-data';

export function PricingCta() {
  const { open, openSheet, closeSheet } = useRegisterSheet();

  const inclusions = [
    `19 na business modules + Budget Mo personal finance`,
    'Works Offline — kahit walang internet',
    'Auto Sync kapag bumalik ang koneksyon',
    'Secure Cloud Backup — walang nawawala',
    'No auto-renew — ikaw ang may kontrol',
    'No setup fee — magsimula agad',
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
                Sumali sa libo-libong Pilipinong negosyante na gumagamit na ng Katuwang. Mas mura pa sa kape mo araw-araw!
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
                    Limited Time Offer
                  </div>
                  <div className="flex justify-center items-baseline gap-2 mb-1">
                    <span className="text-xl font-bold text-white/40 line-through">₱199</span>
                    <span className="text-6xl font-black text-white tracking-tighter">₱99</span>
                  </div>
                  <p className="text-slate-400 text-xs font-semibold">/buwan · bawat module</p>
                </div>

                <button
                  onClick={openSheet}
                  className="w-full h-14 rounded-2xl text-base font-bold bg-secondary text-slate-900 hover:bg-secondary/90 transition-all active:scale-[0.98] shadow-xl flex items-center justify-center gap-2"
                >
                  Register Now
                  <ChevronRight className="h-5 w-5" />
                </button>

                <p className="text-[10px] text-white/40 font-bold">
                  Para sa 19 standard modules · bawat module<br />
                  <span className="text-white/30 text-[9px] uppercase tracking-[0.1em] mt-1 inline-block">Budget Mo: ₱50/buwan promo · regular ₱100</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <RegisterSheet open={open} onClose={closeSheet} />
    </>
  );
}
