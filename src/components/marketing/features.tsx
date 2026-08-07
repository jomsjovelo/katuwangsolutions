import React from 'react';
import { ShieldCheck, Smartphone, Zap, LayoutGrid, PhilippinePeso, Banknote } from 'lucide-react';

const FEATURES = [
  {
    icon: LayoutGrid,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    title: '20 Specialized Modules',
    desc: '19 business modules plus Budget Mo personal helper na mapagpipilian para sa uri ng iyong negosyo.',
    highlight: false,
  },
  {
    icon: PhilippinePeso,
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    title: 'Module-Based Subscription',
    desc: 'Promo ₱99/mo (regular ₱199/mo) bawat business module, at Promo ₱50/mo (regular ₱100/mo) para sa Budget Mo.',
    highlight: true,
    badge: 'Mabilis na Flow',
  },
  {
    icon: Banknote,
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    title: 'Manual GCash & Maya Payment',
    desc: 'Magbayad sa pamamagitan ng manual GCash o Maya transfer na ika-verify bago i-activate ang module.',
    highlight: false,
  },
  {
    icon: Smartphone,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    title: 'Mobile-First Interface',
    desc: 'Simple at malinaw na interface na madaling gamitin sa cellphone o tablet para sa araw-araw na operasyon.',
    highlight: false,
  },
  {
    icon: ShieldCheck,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    title: 'Built for Filipinos',
    desc: 'Dinisenyo para sa negosyong Pinoy — madaling intindihin, naka-Taglish, at swak sa budget ng bawat Pilipino.',
    highlight: false,
  },
  {
    icon: Zap,
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    title: 'Organisadong Tracking',
    desc: 'Module-specific workflows para sa mas maayos na pag-record ng benta, utang, at operational activity.',
    highlight: false,
  },
];

export function Features() {
  return (
    <section id="features" className="py-14 md:py-24 px-5 bg-slate-50 border-t border-slate-100">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Mga Tampok na Kakayahan</p>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
            Bakit <span className="text-primary">Katuwang Solutions</span>?
          </h2>
          <p className="text-slate-500 text-sm md:text-lg">
            Eksaktong mga tool para sa mas organisadong pamamahala ng negosyo.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <div
                key={idx}
                className={`p-6 rounded-3xl border transition-all duration-300 relative flex flex-col justify-between ${
                  feat.highlight
                    ? 'bg-white border-primary/30 shadow-xl ring-2 ring-primary/20'
                    : 'bg-white border-slate-200/80 shadow-sm hover:shadow-md'
                }`}
              >
                {feat.badge && (
                  <span className="absolute -top-3 right-6 bg-primary text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm">
                    {feat.badge}
                  </span>
                )}
                <div className="space-y-4">
                  <div className={`h-12 w-12 rounded-2xl ${feat.iconBg} ${feat.iconColor} flex items-center justify-center`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900">{feat.title}</h3>
                  <p className="text-slate-500 text-xs md:text-sm leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
