import React from 'react';
import { Store, Star, PhilippinePeso } from 'lucide-react';

export function SocialProofBar() {
  return (
    <section className="w-full bg-slate-900 py-8 md:py-14 border-y border-slate-800">
      <div className="max-w-5xl mx-auto px-4 grid grid-cols-3 gap-2 md:gap-4">

        <div className="flex flex-col items-center justify-center text-center space-y-1 md:space-y-2">
          <div className="p-2 md:p-3 bg-slate-800 rounded-full mb-1 md:mb-2">
            <Store className="h-4 w-4 md:h-6 md:w-6 text-primary" />
          </div>
          <h3 className="text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight">500+</h3>
          <p className="text-[9px] sm:text-[10px] text-white font-bold leading-tight">Tindahan</p>
          <p className="hidden sm:block text-[9px] text-slate-400 uppercase tracking-widest font-semibold">Ang gumagamit na</p>
        </div>

        <div className="flex flex-col items-center justify-center text-center space-y-1 md:space-y-2 border-x border-slate-700">
          <div className="p-2 md:p-3 bg-slate-800 rounded-full mb-1 md:mb-2">
            <Star className="h-4 w-4 md:h-6 md:w-6 text-secondary fill-secondary" />
          </div>
          <h3 className="text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight">4.9/5</h3>
          <p className="text-[9px] sm:text-[10px] text-white font-bold leading-tight">Rating</p>
          <p className="hidden sm:block text-[9px] text-slate-400 uppercase tracking-widest font-semibold">Average Score</p>
        </div>

        <div className="flex flex-col items-center justify-center text-center space-y-1 md:space-y-2">
          <div className="p-2 md:p-3 bg-slate-800 rounded-full mb-1 md:mb-2">
            <PhilippinePeso className="h-4 w-4 md:h-6 md:w-6 text-green-400" />
          </div>
          <h3 className="text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight">₱10M+</h3>
          <p className="text-[9px] sm:text-[10px] text-white font-bold leading-tight">Benta</p>
          <p className="hidden sm:block text-[9px] text-slate-400 uppercase tracking-widest font-semibold">Na-track na</p>
        </div>

      </div>
    </section>
  );
}
