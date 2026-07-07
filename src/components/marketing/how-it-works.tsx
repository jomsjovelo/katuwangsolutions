import React from 'react';
import { UserPlus, Store, AppWindow, TrendingUp } from 'lucide-react';

const STEPS = [
  {
    number: '01',
    icon: UserPlus,
    title: 'Mag-Register',
    desc: 'Gumawa ng account sa loob ng 2 minuto. Walang credit card, walang komplikasyon.',
    color: '#06B6D4',
    bg: 'bg-cyan-50',
  },
  {
    number: '02',
    icon: Store,
    title: 'Piliin ang Negosyo Mo',
    desc: 'Sabihin mo sa amin kung ano ang uri ng negosyo mo — sari-sari, restaurant, laundry, at iba pa.',
    color: '#F97316',
    bg: 'bg-orange-50',
  },
  {
    number: '03',
    icon: AppWindow,
    title: 'Piliin ang Module',
    desc: 'Pumili sa 19 na industry-specific na apps na espesyal na dinisenyo para sa iyong negosyo.',
    color: '#8B5CF6',
    bg: 'bg-violet-50',
  },
  {
    number: '04',
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
        <div className="text-center mb-10 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Paano Ito Gamitin</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
            Magsimula sa{' '}
            <span className="text-primary">4 na hakbang</span>
          </h2>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            Simple lang. Hindi mo kailangan ng IT background para gamitin ang Katuwang.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-10 left-[12.5%] right-[12.5%] h-px bg-slate-200 z-0" />

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
