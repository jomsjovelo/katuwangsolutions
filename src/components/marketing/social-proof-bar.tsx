import React from 'react';
import { Store, Star, PhilippinePeso } from 'lucide-react';

export function SocialProofBar() {
  return (
    <section className="w-full bg-slate-900 py-10 md:py-14 border-y border-slate-800">
      <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-800">
        
        <div className="flex flex-col items-center justify-center text-center space-y-2 pt-6 md:pt-0 first:pt-0">
          <div className="p-3 bg-slate-800 rounded-full mb-2">
            <Store className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-2xl font-black text-white tracking-tight">500+ Tindahan</h3>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Ang gumagamit na</p>
        </div>

        <div className="flex flex-col items-center justify-center text-center space-y-2 pt-8 md:pt-0">
          <div className="p-3 bg-slate-800 rounded-full mb-2">
            <Star className="h-6 w-6 text-secondary fill-secondary" />
          </div>
          <h3 className="text-2xl font-black text-white tracking-tight">4.9/5 Rating</h3>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Average User Score</p>
        </div>

        <div className="flex flex-col items-center justify-center text-center space-y-2 pt-8 md:pt-0">
          <div className="p-3 bg-slate-800 rounded-full mb-2">
            <PhilippinePeso className="h-6 w-6 text-green-400" />
          </div>
          <h3 className="text-2xl font-black text-white tracking-tight">₱10M+ Benta</h3>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Na-track sa platform</p>
        </div>

      </div>
    </section>
  );
}
