import React from 'react';
import { LayoutGrid, Layers, CreditCard, ShieldCheck } from 'lucide-react';

const CONFIDENCE_FACTS = [
  { icon: LayoutGrid, label: '17 practical modules', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  { icon: Layers, label: 'Hiwalay na subscription bawat module', color: 'text-sky-400', bg: 'bg-sky-400/10 border-sky-400/20' },
  { icon: CreditCard, label: 'Manual GCash/Maya payment', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20' },
  { icon: ShieldCheck, label: 'Activation pagkatapos ng payment verification', color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
];

export function SocialProofBar() {
  return (
    <section className="w-full bg-slate-900 py-6 sm:py-8 border-y border-slate-800">
      <div className="max-w-5xl mx-auto px-5">
        <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3">
          {CONFIDENCE_FACTS.map(({ icon: Icon, label, color, bg }) => (
            <div
              key={label}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-full border ${bg} backdrop-blur-sm`}
            >
              <Icon className={`h-3.5 w-3.5 ${color} shrink-0`} />
              <span className={`text-xs font-bold ${color}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
