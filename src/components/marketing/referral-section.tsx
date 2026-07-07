'use client';

import React from 'react';
import { Share2, PhilippinePeso, Heart, ChevronRight, ShieldCheck } from 'lucide-react';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';

const STEPS = [
  {
    icon: Share2,
    title: 'I-share ang iyong Link',
    desc: 'Kumuha ng iyong personal na referral link sa loob ng app at ibahagi sa kaibigan at pamilya.',
    color: '#06B6D4',
    bg: 'bg-cyan-100',
  },
  {
    icon: PhilippinePeso,
    title: 'Kumita sa bawat Referral',
    desc: 'Kapag nag-subscribe ang iyong referral, kumikita ka agad. Direkta sa iyong account.',
    color: '#10B981',
    bg: 'bg-emerald-100',
  },
  {
    icon: Heart,
    title: 'Tuloy-tuloy na Kita',
    desc: 'Habang aktibo ang iyong mga referral, patuloy kang kumikita kasabay ng kanilang subscription.',
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
              Kumita habang<br />
              <span className="text-secondary">tumutulong ka.</span>
            </h2>
            <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
              I-refer ang Katuwang sa iyong mga kakilala at kumita sa bawat matagumpay na subscription.
            </p>

            {/* NOT MLM disclaimer */}
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 mx-auto mt-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
              <span className="text-[11px] font-bold text-slate-300">
                Hindi ito networking. Hindi ito MLM. Referral rewards lang ito.
              </span>
            </div>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            {STEPS.map(({ icon: Icon, title, desc, color, bg }) => (
              <div
                key={title}
                className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center space-y-3 hover:bg-white/8 transition-all duration-300"
              >
                <div className={`h-14 w-14 ${bg} rounded-2xl flex items-center justify-center mx-auto`}>
                  <Icon className="h-7 w-7" style={{ color }} strokeWidth={1.5} />
                </div>
                <h3 className="font-black text-white text-sm leading-tight">{title}</h3>
                <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="text-center">
            <button
              onClick={openSheet}
              className="inline-flex items-center gap-2 h-14 px-8 rounded-2xl font-bold text-sm bg-secondary text-slate-900 hover:bg-secondary/90 transition-all active:scale-[0.98] shadow-xl"
            >
              Simulan ang Pag-refer
              <ChevronRight className="h-4 w-4" />
            </button>
            <p className="text-slate-500 text-xs mt-3">
              Available sa lahat ng may aktibong Katuwang account.
            </p>
          </div>
        </div>
      </section>

      <RegisterSheet open={open} onClose={closeSheet} />
    </>
  );
}
