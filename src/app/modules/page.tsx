import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { appGroups, activeModulesCount, standardModulesCount } from '@/lib/app-data';
import { getModulePricing, formatPeso } from '@/lib/pricing';
import { TrackedOnboardingLink } from '@/components/analytics/tracked-onboarding-link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lahat ng Modules | Katuwang Solutions',
  description: 'Tingnan ang 20 modules (19 business modules + Budget Mo) ng Katuwang Solutions.',
  alternates: {
    canonical: 'https://katuwangsolutions.com/modules',
  },
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
            Pumili mula sa {activeModulesCount} iba't-ibang Katuwang modules na eksaktong naka-disenyo para sa uri ng iyong negosyo. 19 business modules (Promo ₱99/mo, regular ₱199/mo) at Budget Mo (Promo ₱50/mo, regular ₱100/mo) bawat module.
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
                        <Link href={`/${app.id}`}>
                          <h3 className="font-bold text-lg text-slate-900 group-hover:text-primary transition-colors hover:underline">{app.name}</h3>
                        </Link>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">{app.tagline}</p>
                      </div>
                    </div>
                    
                    <div className="mt-auto pt-6">
                      <div className="flex items-baseline justify-between gap-2 mb-4">
                        <div>
                          <span className="text-xl font-black text-slate-900">Promo {formatPeso(pricing.promotionalMonthlyPrice)}</span>
                          <span className="text-xs text-slate-500 font-medium">/buwan</span>
                          <span className="text-[10px] text-slate-500 font-medium block">
                            (regular {formatPeso(pricing.regularMonthlyPrice)}/mo) bawat module
                          </span>
                        </div>
                        <span className="text-[10px] text-amber-900 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider shrink-0">Promo Rate</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-6">
                        {app.features.slice(0, 2).map((feature, idx) => (
                          <span key={idx} className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border border-slate-100">
                            {feature}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/${app.id}`} className="flex-1 text-center text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors py-3 px-3 rounded-xl min-h-[44px] flex items-center justify-center">
                          Detalye
                        </Link>
                        <TrackedOnboardingLink href={`/${app.id}/onboarding`} ctaSource="module_catalogue_card" moduleId={app.id} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-white bg-primary hover:bg-primary/90 transition-colors py-3 px-3 rounded-xl shadow-sm min-h-[44px]">
                          <span>Mag-register</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </TrackedOnboardingLink>
                      </div>
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
            <h2 className="text-3xl md:text-4xl font-black">Handa nang pumili ng module?</h2>
            <p className="text-slate-400 text-lg">
              Libre ang paggawa ng account. Kailangan ang manual GCash o Maya payment at payment verification bago ma-activate ang napiling module. Hindi ito free trial.
            </p>
            <TrackedOnboardingLink href="/onboarding" ctaSource="module_catalogue_footer" className="inline-block bg-primary text-white font-bold text-lg px-10 py-4 rounded-full hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20">
              Pumili at Mag-register
            </TrackedOnboardingLink>
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
