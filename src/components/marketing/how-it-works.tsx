import React from 'react';
import { UserPlus, AppWindow, TrendingUp } from 'lucide-react';
import { activeModulesCount } from '@/lib/app-data';

const STEPS = [
  {
    number: '01',
    icon: AppWindow,
    title: 'Pumili ng Module',
    desc: `Pumili sa ${activeModulesCount} specialized business apps tulad ng Benta Snap, Biyahe Sync, o Budget Mo.`,
    color: '#06B6D4',
    bg: 'bg-cyan-50',
  },
  {
    number: '02',
    icon: UserPlus,
    title: 'Mag-Register',
    desc: 'Ilagay ang pangalan at mobile number sa loob ng 1 minuto. Walang credit card, walang komplikasyon.',
    color: '#8B5CF6',
    bg: 'bg-violet-50',
  },
  {
    number: '03',
    icon: TrendingUp,
    title: 'Simulan ang Pamamahala',
    desc: 'I-track ang benta, stock, utang, at gastos — kahit offline. Ito na ang katuwang mo.',
    color: '#10B981',
    bg: 'bg-emerald-50',
  },
];

export function HowItWorks() {
  return (
    <section className="py-14 md:py-24 px-5 bg-slate-50 border-t border-slate-100">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Paano Ito Gamitin</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
            Magsimula sa{' '}
            <span className="text-primary">3 mabilis na hakbang</span>
          </h2>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            Simple lang. Hindi mo kailangan ng IT background para gamitin ang Katuwang.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8 relative max-w-3xl mx-auto">
          {/* Connector line (desktop) */}
          <div className="hidden sm:block absolute top-10 left-[16.6%] right-[16.6%] h-px bg-slate-200 z-0" />

          {STEPS.map(({ number, icon: Icon, title, desc, color, bg }, index) => (
            <div key={number} className="relative z-10 flex flex-col items-center text-center gap-3">
              {/* Icon bubble */}
              <div
                className={`h-20 w-20 ${bg} rounded-2xl flex items-center justify-center border-2 shadow-sm transition-all duration-300 hover:scale-105`}
                style={{ borderColor: `${color}30` }}
              >
                <Icon className="h-8 w-8" style={{ color }} strokeWidth={1.5} />
              </div>

              {/* Step number */}
              <div
                className="text-[10px] font-black uppercase tracking-widest"
                style={{ color }}
              >
                Step {number}
              </div>

              <div>
                <h3 className="font-black text-slate-900 text-sm mb-1 leading-tight">{title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
              </div>

              {/* Arrow (mobile — between steps) */}
              {index < STEPS.length - 1 && (
                <div className="text-slate-300 text-lg font-bold sm:hidden">↓</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
