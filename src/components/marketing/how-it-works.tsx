import React from 'react';
import { UserPlus, AppWindow, TrendingUp } from 'lucide-react';

const STEPS = [
  {
    number: '01',
    icon: AppWindow,
    title: 'Pumili ng Module',
    desc: 'Pumili sa 20 modules (19 business modules + Budget Mo) na katapat ng uri ng iyong negosyo.',
    color: '#06B6D4',
    bg: 'bg-cyan-50',
  },
  {
    number: '02',
    icon: UserPlus,
    title: 'Mag-Register',
    desc: 'Ilagay ang pangalan at detalye ng negosyo. Walang credit card na kailangan para simulan ang onboarding.',
    color: '#8B5CF6',
    bg: 'bg-violet-50',
  },
  {
    number: '03',
    icon: TrendingUp,
    title: 'Simulan ang Pamamahala',
    desc: 'I-track ang benta, stock, utang, at operational activities sa inyong napiling module.',
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
            Magsimula sa <span className="text-primary">3 simpleng hakbang</span>
          </h2>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            Simple lang. Hindi mo kailangan ng IT background para gamitin ang Katuwang.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8 relative max-w-3xl mx-auto">
          {/* Connector line (desktop) */}
          <div className="hidden sm:block absolute top-12 left-[15%] right-[15%] h-0.5 bg-slate-200 -z-0" />

          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm hover:shadow-md transition-all text-center space-y-4 relative z-10 flex flex-col items-center"
              >
                {/* Number pill */}
                <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                  Hakbang {step.number}
                </span>

                {/* Icon */}
                <div
                  className="h-14 w-14 rounded-2xl flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: `${step.color}15`, color: step.color }}
                >
                  <Icon className="h-7 w-7" />
                </div>

                {/* Content */}
                <div className="space-y-1.5">
                  <h3 className="text-base font-black text-slate-900">{step.title}</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
