import React from 'react';
import { ShieldCheck, Smartphone, Zap, WifiOff, RefreshCw, CloudUpload } from 'lucide-react';

const FEATURES = [
  {
    icon: WifiOff,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    title: 'Works Offline',
    desc: 'Gumagana kahit walang internet. Ituloy ang benta kahit naka-off ang data mo.',
    highlight: false,
  },
  {
    icon: RefreshCw,
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    title: 'Auto Sync',
    desc: 'Automatically nag-a-update ang lahat ng records kapag bumalik na ang internet.',
    highlight: true,
    badge: 'Pinaka-Popular',
  },
  {
    icon: Smartphone,
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    title: 'Simple to Use',
    desc: 'Walang komplikadong setup. Kahit sino, kahit anong phone, kaya gamitin.',
    highlight: false,
  },
  {
    icon: CloudUpload,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    title: 'Secure Cloud Backup',
    desc: 'Kahit masira o mawala ang phone, ligtas ang lahat ng record mo sa cloud.',
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
    title: 'Walang Nawawalang Benta',
    desc: 'Real-time tracking ng lahat ng transaksyon. Walang nawawalang pera o stock.',
    highlight: false,
  },
];

export function Features() {
  return (
    <section id="features" className="py-14 md:py-24 px-5 bg-slate-50 border-t border-slate-100">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Bakit Katuwang?</p>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
            Ginawa namin ito<br />
            <span className="text-primary">para sa bawat Pilipino.</span>
          </h2>
          <p className="text-slate-500 text-sm md:text-lg">
            Simpleng gamitin, walang paligoy-ligoy. Para sa tunay na Pilipinong negosyante.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {FEATURES.map(({ icon: Icon, iconBg, iconColor, title, desc, highlight, badge }) => (
            <div
              key={title}
              className={`p-6 rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl relative overflow-hidden ${
                highlight
                  ? 'bg-primary/5 border-primary/20 shadow-md'
                  : 'bg-white border-slate-100 shadow-sm'
              }`}
            >
              {badge && (
                <div className="absolute top-0 right-0 px-3 py-1 bg-primary text-white text-[9px] font-black uppercase tracking-widest rounded-bl-xl">
                  {badge}
                </div>
              )}
              <div className={`h-12 w-12 ${iconBg} rounded-2xl flex items-center justify-center mb-4`}>
                <Icon className={`h-6 w-6 ${iconColor}`} strokeWidth={2} />
              </div>
              <h3 className="text-base font-black text-slate-900 mb-2">{title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
