import React from 'react';
import { Store, Star, PhilippinePeso, WifiOff, RefreshCw, CloudUpload, Users, Smartphone, Zap, LayoutGrid, CheckCircle2 } from 'lucide-react';

const TRUST_PILLS = [
  { icon: WifiOff, label: 'Works Offline', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  { icon: RefreshCw, label: 'Auto Sync', color: 'text-sky-400', bg: 'bg-sky-400/10 border-sky-400/20' },
  { icon: CloudUpload, label: 'Cloud Backup', color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/20' },
  { icon: Users, label: 'Made for Filipinos', color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20' },
  { icon: Smartphone, label: 'Easy to Use', color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
  { icon: Zap, label: 'Fast Setup', color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
];

export function SocialProofBar() {
  return (
    <section className="w-full bg-slate-900 py-10 md:py-16 border-y border-slate-800">
      <div className="max-w-5xl mx-auto px-5">
        {/* Trust label */}
        <p className="text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-[0.2em] text-center mb-8">
          Isang sistema para sa benta, badyet, at operational tracking
        </p>

        {/* Trust pills */}
        <div className="flex flex-wrap justify-center gap-2.5 mb-10">
          {TRUST_PILLS.map(({ icon: Icon, label, color, bg }) => (
            <div
              key={label}
              className={`flex items-center gap-2 px-4 py-2 rounded-full border ${bg} backdrop-blur-sm`}
            >
              <Icon className={`h-3.5 w-3.5 ${color} flex-shrink-0`} />
              <span className={`text-[11px] font-bold ${color}`}>{label}</span>
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 border-t border-slate-800 pt-8">
          <div className="flex flex-col items-center text-center space-y-1">
            <div className="p-2 bg-slate-800 rounded-full mb-1">
              <LayoutGrid className="h-4 w-4 md:h-5 md:w-5 text-primary" />
            </div>
            <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">20</h3>
            <p className="text-[9px] text-white font-bold uppercase tracking-widest">Modules Available</p>
          </div>

          <div className="flex flex-col items-center text-center space-y-1 border-x border-slate-700">
            <div className="p-2 bg-slate-800 rounded-full mb-1">
              <Star className="h-4 w-4 md:h-5 md:w-5 text-secondary fill-secondary" />
            </div>
            <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">4.9/5</h3>
            <p className="text-[9px] text-white font-bold uppercase tracking-widest">Rating</p>
          </div>

          <div className="flex flex-col items-center text-center space-y-1">
            <div className="p-2 bg-slate-800 rounded-full mb-1">
              <WifiOff className="h-4 w-4 md:h-5 md:w-5 text-emerald-400" />
            </div>
            <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">100%</h3>
            <p className="text-[9px] text-white font-bold uppercase tracking-widest">Works Offline</p>
          </div>
        </div>
      </div>
    </section>
  );
}
