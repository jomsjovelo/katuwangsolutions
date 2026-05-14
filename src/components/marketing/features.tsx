import React from 'react';
import { ShieldCheck, Smartphone, Zap } from 'lucide-react';

export function Features() {
  return (
    <section id="features" className="py-20 md:py-32 px-6 bg-white border-b border-border/5">
      <div className="max-w-6xl mx-auto space-y-16">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
            Bakit <span className="text-primary">Katuwang?</span>
          </h2>
          <p className="text-slate-500 text-lg">
            Ginawa namin ito para sa masa. Simpleng gamitin, walang paligoy-ligoy, at direkta sa pangangailangan ng negosyo mo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          <div className="bg-slate-50 p-8 rounded-3xl space-y-4 border border-slate-100 hover:shadow-xl transition-shadow duration-300">
            <div className="h-14 w-14 bg-green-100 rounded-2xl flex items-center justify-center mb-6">
              <ShieldCheck className="h-7 w-7 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Ligtas ang Data Mo</h3>
            <p className="text-slate-500 leading-relaxed text-sm">
              Ang impormasyon ng negosyo mo ay protektado ng enterprise-grade security. Hindi mawawala ang records mo kahit masira ang device.
            </p>
          </div>

          <div className="bg-slate-50 p-8 rounded-3xl space-y-4 border border-slate-100 hover:shadow-xl transition-shadow duration-300 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-5">
               <Smartphone className="h-40 w-40" />
             </div>
            <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 relative z-10">
              <Smartphone className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 relative z-10">Mobile-First</h3>
            <p className="text-slate-500 leading-relaxed text-sm relative z-10">
              Dinisenyo para sa mabilis na kamay ng negosyante. Isang kamay lang, kaya nang mag-punch ng order o mag-check ng inventory.
            </p>
          </div>

          <div className="bg-slate-50 p-8 rounded-3xl space-y-4 border border-slate-100 hover:shadow-xl transition-shadow duration-300">
            <div className="h-14 w-14 bg-yellow-100 rounded-2xl flex items-center justify-center mb-6">
              <Zap className="h-7 w-7 text-yellow-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Instant na Update</h3>
            <p className="text-slate-500 leading-relaxed text-sm">
              Real-time sync kahit nasa palengke ka. Makita agad ang pumasok na pera at bawas sa stock in seconds.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
