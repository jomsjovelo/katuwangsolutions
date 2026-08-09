'use client';

import React from 'react';
import { Share2, PhilippinePeso, Heart, ChevronRight } from 'lucide-react';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';

const STEPS = [
  {
    icon: Share2,
    title: 'I-share ang iyong Code / Link',
    desc: 'Kumuha ng inyong personal na referral code o link sa loob ng app at ibahagi sa kapwa negosyante.',
    color: '#06B6D4',
    bg: 'bg-cyan-100',
  },
  {
    icon: PhilippinePeso,
    title: 'I-connect ang Referral',
    desc: 'Kapag ginamit ang inyong code o link sa pagpaparehistro, maio-onboard ang inyong referral.',
    color: '#10B981',
    bg: 'bg-emerald-100',
  },
  {
    icon: Heart,
    title: 'Tumulong sa Kapwa Negosyante',
    desc: 'Tulungan silang simulan ang mas maayos na pag-record ng benta, utang, at inventory.',
    color: '#F97316',
    bg: 'bg-orange-100',
  },
];

export function ReferralSection() {
  const { open, openSheet, closeSheet } = useRegisterSheet();

  return (
    <>
      <section className="py-14 md:py-24 px-5 bg-slate-900 border-t border-slate-800">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Referral Program</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
              Mag-refer at <span className="text-secondary">tumulong sa kapwa.</span>
            </h2>
            <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
              I-refer ang Katuwang sa iyong mga kakilalang negosyante para matulungan silang mag-onboard.
            </p>

          </div>

          {/* 3 Step Process */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-6 text-center space-y-4 flex flex-col items-center"
                >
                  <div
                    className="h-14 w-14 rounded-2xl flex items-center justify-center shadow-md"
                    style={{ backgroundColor: `${step.color}20`, color: step.color }}
                  >
                    <Icon className="h-7 w-7" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-base font-black text-white">{step.title}</h3>
                    <p className="text-slate-400 text-xs leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action CTA */}
          <div className="text-center">
            <button
              onClick={openSheet}
              className="inline-flex items-center gap-2 bg-secondary text-slate-900 font-black text-sm px-8 py-4 rounded-2xl active:scale-95 transition-transform shadow-xl hover:bg-secondary/90"
            >
              <span>Mag-register para Simulan</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <RegisterSheet open={open} onClose={closeSheet} ctaSource="referral_section" />
    </>
  );
}
