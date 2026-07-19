import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { appGroups, activeModulesCount, standardModulesCount } from '@/lib/app-data';
import { getModulePricing, formatPeso } from '@/lib/pricing';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lahat ng Modules | Katuwang Solutions',
  description: 'Tingnan ang lahat ng 18 business management modules ng Katuwang Solutions.',
};

export default function ModulesPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="h-5 w-5" />
          <span className="font-bold text-sm">Back</span>
        </Link>
        <BrandLogo showText={true} />
        <div className="w-10" />
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-5 py-12 md:py-20 space-y-16">
        
        <div className="space-y-4 text-center max-w-2xl mx-auto">
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
            Lahat ng Modules
          </h1>
          <p className="text-lg text-slate-500 font-medium leading-relaxed">
            Pumili mula sa {activeModulesCount} iba't-ibang Katuwang modules na eksaktong naka-disenyo para sa uri ng iyong negosyo. {standardModulesCount} standard modules (₱99/mo) at Budget Mo (₱50/mo).
          </p>
        </div>

        {/* ── Jump Controls (Mobile) ─────────────────────────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar md:hidden pb-2 -mx-5 px-5 snap-x">
          {appGroups.map((group) => (
            <a key={`nav-${group.id}`} href={`#group-${group.id}`} className="snap-start flex-shrink-0 h-11 px-4 flex items-center justify-center bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-600 active:scale-95 transition-transform shadow-sm">
              {group.label}
            </a>
          ))}
        </div>

        {/* ── Module Grid ─────────────────────────────────────────────────────────── */}
        <div className="space-y-16">
          {appGroups.map((group) => (
            <div key={group.id} id={`group-${group.id}`} className="space-y-6 scroll-mt-24">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-black text-slate-900 capitalize">{group.label}</h2>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {group.apps.map((app) => {
                  const pricing = getModulePricing(app.id);
                  return (
                  <div key={app.id} data-module-id={app.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 group flex flex-col h-full">
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${group.accentColor}`}>
                        <app.icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-slate-900 group-hover:text-primary transition-colors">{app.name}</h3>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">{app.tagline}</p>
                      </div>
                    </div>
                    
                    <div className="mt-auto pt-6">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xl font-black text-slate-900">{formatPeso(pricing.promotionalMonthlyPrice)}</span>
                        <span className="text-xs text-slate-500 font-medium">/buwan</span>
                        {pricing.pricingTier === 'promo_50' && (
                          <span className="text-[10px] text-white bg-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ml-auto">Promo</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mb-6">
                        {app.features.slice(0, 2).map((feature, idx) => (
                          <span key={idx} className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border border-slate-100">
                            {feature}
                          </span>
                        ))}
                      </div>
                      <Link href={`/onboarding?app=${app.id}`} className="flex items-center justify-between text-sm font-bold text-primary hover:text-primary/80 transition-colors w-full bg-primary/5 hover:bg-primary/10 p-3 rounded-xl">
                        <span>Gamitin na</span>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          ))}
        </div>

        {/* ── Bottom CTA ─────────────────────────────────────────────────────────── */}
        <div className="bg-slate-950 rounded-[2rem] p-10 md:p-16 text-center text-white mt-20 relative overflow-hidden">
          <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-black">Handa nang mag-upgrade?</h2>
            <p className="text-slate-400 text-lg">
              Isang account lang ang kailangan. Mag-register nang libre para masubukan.
            </p>
            <Link href="/onboarding" className="inline-block bg-primary text-white font-bold text-lg px-10 py-4 rounded-full hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20">
              Magsimula Ngayon
            </Link>
          </div>
          {/* Subtle bg decoration */}
          <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="py-8 bg-slate-950 mt-auto">
        <div className="text-center flex flex-col items-center gap-3">
          <div className="opacity-40">
            <BrandLogo theme="dark" />
          </div>
          <p className="text-slate-500 text-[9px] font-bold uppercase tracking-[0.35em] leading-loose">
            <span translate="no" className="notranslate">Katuwang Solutions</span><br />
            &copy; {new Date().getFullYear()} All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
