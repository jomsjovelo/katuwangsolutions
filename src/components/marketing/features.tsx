import React from 'react';
import { ShieldCheck, Smartphone, Zap } from 'lucide-react';

export function Features() {
  return (
    <section id="features" className="py-12 md:py-24 px-4 sm:px-6 bg-white border-b border-border/5">
      <div className="max-w-6xl mx-auto space-y-10 md:space-y-16">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
            Bakit <span className="text-primary">Katuwang?</span>
          </h2>
          <p className="text-slate-500 text-sm md:text-lg">
            Ginawa namin ito para sa masa. Simpleng gamitin, walang paligoy-ligoy.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:gap-12">
          <div className="bg-slate-50 p-6 md:p-8 rounded-2xl md:rounded-3xl space-y-3 border border-slate-100 hover:shadow-xl transition-shadow duration-300">
            <div className="h-12 w-12 bg-green-100 rounded-2xl flex items-center justify-center mb-3">
              <ShieldCheck className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Ligtas ang Data Mo</h3>
            <p className="text-slate-500 leading-relaxed text-sm">
              Protektado ng enterprise-grade security. Hindi mawawala ang records mo kahit masira ang device.
            </p>
          </div>

          <div className="bg-slate-50 p-6 md:p-8 rounded-2xl md:rounded-3xl space-y-3 border border-slate-100 hover:shadow-xl transition-shadow duration-300">
            <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-3">
              <Smartphone className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Mobile-First</h3>
            <p className="text-slate-500 leading-relaxed text-sm">
              Dinisenyo para sa isang kamay. Kaya nang mag-punch ng order o mag-check ng inventory habang abala.
            </p>
          </div>

          <div className="bg-slate-50 p-6 md:p-8 rounded-2xl md:rounded-3xl space-y-3 border border-slate-100 hover:shadow-xl transition-shadow duration-300">
            <div className="h-12 w-12 bg-yellow-100 rounded-2xl flex items-center justify-center mb-3">
              <Zap className="h-6 w-6 text-yellow-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Instant na Update</h3>
            <p className="text-slate-500 leading-relaxed text-sm">
              Real-time sync kahit nasa palengke ka. Makita agad ang pumasok na pera at bawas sa stock.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
