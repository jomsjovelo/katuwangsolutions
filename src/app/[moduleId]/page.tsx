import React from 'react';
import { getActiveAppById, appGroups, activeModules, isValidActiveModuleId, normalizeModuleId } from '@/lib/app-data';
import { getModulePricing, formatPeso } from '@/lib/pricing';
import { notFound, permanentRedirect } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';
import { 
  ArrowLeft, CheckCircle2, Zap, Star, Users, 
  RefreshCw, Scan, Bell, FileText, Calendar, Package, ArrowRight, Check, Sparkles, ChevronRight, ShieldCheck, Wallet, PieChart, TrendingUp, HelpCircle
} from 'lucide-react';
import { Metadata } from 'next';
import { ModuleViewTracker } from '@/components/analytics/meta-events';
import ModuleStickyBar from '@/components/landing/module-sticky-bar';

type Props = {
  params: Promise<{ moduleId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const dynamicParams = true;

// Generate static routes for all 20 active modules at build time
export async function generateStaticParams() {
  return activeModules.map((module) => ({
    moduleId: module.id,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const foundApp = getActiveAppById(resolvedParams.moduleId);

  if (!foundApp) return { title: 'Module Not Found | Katuwang Solutions' };

  const isBudgetMo = foundApp.id === 'budget-mo';
  const pageTitle = isBudgetMo 
    ? `Budget Mo - Personal Cash Flow & Savings Tracker | Katuwang Solutions`
    : `${foundApp.name} POS & Management System | Katuwang Solutions`;

  return {
    title: pageTitle,
    description: isBudgetMo 
      ? 'Huwag nang manghula kung saan napunta ang sweldo mo. I-track ang daily expenses, ipon, at cash flow sa iisang simpleng Budget app sa ₱50/buwan lang!'
      : foundApp.tagline,
    keywords: `${foundApp.name}, Katuwang Solutions, Philippines, budgeting app, gcash, maya, ipon tracker, sweldo tracker`,
    openGraph: {
      title: `${foundApp.name} by Katuwang Solutions`,
      description: foundApp.tagline,
      type: 'website',
    },
  };
}

export default async function ModuleDedicatedPage({ params, searchParams }: Props) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const rawId = resolvedParams.moduleId;

  // Handle alias redirects (e.g. fleet-sync -> biyahe-sync)
  const canonicalId = normalizeModuleId(rawId);
  if (rawId !== canonicalId && isValidActiveModuleId(canonicalId)) {
    const urlParams = new URLSearchParams();
    Object.entries(resolvedSearchParams).forEach(([key, val]) => {
      if (typeof val === 'string') urlParams.set(key, val);
      else if (Array.isArray(val)) val.forEach(v => urlParams.append(key, v));
    });
    const queryString = urlParams.toString();
    permanentRedirect(`/${canonicalId}${queryString ? `?${queryString}` : ''}`);
  }

  const foundApp = getActiveAppById(rawId);
  if (!foundApp) {
    notFound();
  }

  const pricing = getModulePricing(foundApp.id);
  const isBudgetMo = foundApp.id === 'budget-mo';

  let foundGroup: any = null;
  appGroups.forEach(g => {
    if (g.apps.some(a => a.id === foundApp.id)) {
      foundGroup = g;
    }
  });

  const Icon = foundApp.icon;
  const accent = foundGroup?.accentColor || '#06B6D4';

  // Get cross-sell recommendations from OTHER categories
  const otherGroupApps = activeModules.filter(a => {
    if (a.id === foundApp.id) return false;
    const groupOfApp = appGroups.find(g => g.apps.some(x => x.id === a.id));
    return groupOfApp?.id !== foundGroup?.id;
  });

  // Pick 3 diverse cross-sell apps
  const crossSellApps = otherGroupApps.slice(0, 3);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-16">
      <ModuleViewTracker
        moduleId={foundApp.id}
        moduleName={foundApp.name}
        moduleCategory={foundGroup?.label}
      />
      {/* Top Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="h-5 w-5" />
          <span className="font-bold text-sm">Back</span>
        </Link>
        <BrandLogo showText={true} />
        <div className="w-10" />
      </header>

      {/* Hero Banner */}
      <div className="relative w-full overflow-hidden bg-slate-900 text-white">
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#06B6D4_1px,transparent_1px)] [background-size:16px_16px]" />
        
        <div className="max-w-4xl mx-auto px-6 pt-10 pb-12 flex flex-col items-center text-center relative z-10 space-y-5">
          
          {/* Promo Badge */}
          <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-400/40 px-4 py-1.5 rounded-full text-amber-300 text-xs font-black uppercase tracking-widest animate-pulse">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span>🔥 SPECIAL PROMO RATE: {formatPeso(pricing.promotionalMonthlyPrice)}/MONTH ONLY</span>
            <span className="line-through opacity-60 font-medium text-[10px]">{formatPeso(pricing.regularMonthlyPrice)}/mo</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight leading-tight max-w-3xl">
            {isBudgetMo ? (
              <>Huwag nang manghula kung saan napunta ang <span className="text-cyan-400 underline decoration-cyan-500/50 decoration-wavy">sweldo mo.</span></>
            ) : (
              foundApp.name
            )}
          </h1>

          <p className="text-base sm:text-xl text-slate-300 font-medium max-w-2xl leading-relaxed">
            {isBudgetMo 
              ? 'I-track ang iyong daily expenses, ipon, at cash flow sa iisang simpleng app. Walang kumplikadong spreadsheet — 1 minuto lang ang setup!'
              : `"${foundApp.tagline}"`}
          </p>

          {/* Micro Trust Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs font-bold text-slate-300 pt-1">
            <span className="bg-white/10 border border-white/10 px-3 py-1 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> 1-Minute Setup
            </span>
            <span className="bg-white/10 border border-white/10 px-3 py-1 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> GCash & Maya Ready
            </span>
            <span className="bg-white/10 border border-white/10 px-3 py-1 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> No Credit Card Needed
            </span>
          </div>

          {/* Main Hero CTA Button */}
          <div className="pt-4 w-full sm:w-auto">
            <Link href={`/${foundApp.id}/onboarding`} className="w-full sm:w-auto inline-block">
              <Button
                size="lg"
                className="w-full sm:w-auto h-16 px-10 text-lg font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 shadow-2xl hover:scale-105 active:scale-95 transition-all rounded-2xl border border-cyan-300"
              >
                <span>Simulan ang {foundApp.name} ({formatPeso(pricing.promotionalMonthlyPrice)}/mo)</span>
                <ArrowRight className="h-6 w-6 ml-2" />
              </Button>
            </Link>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-2">
              Instant Access · Cancel anytime · ₱0 setup fee
            </p>
          </div>

        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 md:px-12 py-12 space-y-16">
        
        {/* ── Interactive UI Preview Mockup (Budget Mo Special) ────────────────────────── */}
        {isBudgetMo && (
          <section className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xs font-black uppercase tracking-widest text-cyan-600">Actual App Preview</h2>
              <p className="text-2xl sm:text-3xl font-black text-slate-900">Simple, Malinis, at Mabilis Gamitin</p>
              <p className="text-slate-500 text-xs sm:text-sm">Ito ang makikita mo sa loob ng Budget Mo dashboard:</p>
            </div>

            {/* Render High Fidelity Interactive Mockup Box */}
            <div className="bg-gradient-to-br from-cyan-600 to-blue-700 p-6 sm:p-8 rounded-3xl text-white shadow-2xl space-y-6 border border-cyan-400/30 relative overflow-hidden">
              <div className="flex justify-between items-center border-b border-white/20 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-cyan-200">AVAILABLE CASH BALANCE</span>
                  <p className="text-3xl sm:text-4xl font-black tracking-tight mt-0.5">₱14,250.00</p>
                </div>
                <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  <span>Balanced</span>
                </div>
              </div>

              {/* 1-Tap Quick Presets */}
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-cyan-200">⚡ 1-TAP QUICK EXPENSE PRESETS</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-white/15 backdrop-blur-md p-3 rounded-xl border border-white/10">
                    <p className="text-xs font-bold">🚌 Pamasahi</p>
                    <p className="text-sm font-black text-cyan-200 mt-1">₱20.00</p>
                  </div>
                  <div className="bg-white/15 backdrop-blur-md p-3 rounded-xl border border-white/10">
                    <p className="text-xs font-bold">🍱 Lunch</p>
                    <p className="text-sm font-black text-cyan-200 mt-1">₱80.00</p>
                  </div>
                  <div className="bg-white/15 backdrop-blur-md p-3 rounded-xl border border-white/10">
                    <p className="text-xs font-bold">☕ Kape</p>
                    <p className="text-sm font-black text-cyan-200 mt-1">₱120.00</p>
                  </div>
                  <div className="bg-white/15 backdrop-blur-md p-3 rounded-xl border border-white/10">
                    <p className="text-xs font-bold">🛒 Groceries</p>
                    <p className="text-sm font-black text-cyan-200 mt-1">₱500.00</p>
                  </div>
                </div>
              </div>

              {/* Financial Health Score & Savings Target */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/10 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-cyan-200">FINANCIAL HEALTH</span>
                    <p className="text-xl font-black text-emerald-400 mt-0.5">750 / 1000</p>
                    <p className="text-[10px] text-slate-300 font-bold">Excellent Spending Habits</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 font-black text-xs">
                    75%
                  </div>
                </div>

                <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/10 flex flex-col justify-between">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-cyan-200">MONTHLY SAVINGS TARGET</span>
                    <span className="text-xs font-bold text-emerald-300">₱4,000 / ₱5,000</span>
                  </div>
                  <div className="w-full bg-white/20 h-2.5 rounded-full overflow-hidden mt-3">
                    <div className="bg-emerald-400 h-full w-[80%] rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Before vs After Comparison (Budget Mo Special) ────────────────────────── */}
        {isBudgetMo && (
          <section className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Bakit Kailangan Mo Ito</h2>
              <p className="text-2xl font-black text-slate-900">Dati vs. Sa Budget Mo</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dati (Manual / Mental) */}
              <div className="bg-rose-50 border border-rose-200 p-6 rounded-3xl space-y-4">
                <div className="flex items-center gap-2 text-rose-700 font-black text-base uppercase tracking-wider">
                  <span className="text-lg">❌</span> DATI (Manual / Mental Budget)
                </div>
                <ul className="space-y-3 text-xs text-rose-950 font-semibold">
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>Nagugulat ka na lang kapag ubos na ang pera bago mag-katapusan.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>Walang malinaw na listahan kung saan napupunta ang maliliit na gastos araw-araw.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>Mahirap mag-ipon dahil laging sumosobra sa pamimili at luho.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>Matagal at nakakatamad mag-tala sa notebook o Excel spreadsheet.</span>
                  </li>
                </ul>
              </div>

              {/* Sa Budget Mo */}
              <div className="bg-emerald-50 border-2 border-emerald-300 p-6 rounded-3xl space-y-4 shadow-sm">
                <div className="flex items-center gap-2 text-emerald-800 font-black text-base uppercase tracking-wider">
                  <span className="text-lg">✅</span> SA BUDGET MO
                </div>
                <ul className="space-y-3 text-xs text-emerald-950 font-bold">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Kita agad ang eksaktong **Available Cash Balance** sa bawat segundo.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>**1-Tap Quick Presets** para sa mabilisang bawas ng pamasahi, kape, at kain.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>May nakabukod na **Savings Target** at Financial Health Score.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Magagamit agad sa phone o laptop kahit saan — ₱50/buwan lang!</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* How it works */}
        {foundApp.howItWorks && foundApp.howItWorks.length > 0 && (
          <section className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Paano Ito Gamitin</h2>
              <p className="text-2xl font-black text-slate-900">3 Mabilis na Hakbang</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {foundApp.howItWorks.map((hw: { step: string; detail: string }, idx: number) => (
                <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-2 relative overflow-hidden">
                  <div className="text-2xl font-black text-cyan-500">0{idx + 1}</div>
                  <h3 className="font-bold text-slate-900 text-base">{hw.step}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{hw.detail}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pain-Point FAQ (Budget Mo Special) */}
        {isBudgetMo && (
          <section className="space-y-6 pt-4">
            <div className="text-center space-y-2">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Mga Madalas Itanong</h2>
              <p className="text-2xl font-black text-slate-900">Frequently Asked Questions (FAQ)</p>
            </div>

            <div className="grid gap-3">
              {[
                { q: "Kailangan ba ng Credit Card para mag-subscribe?", a: "Hindi! Pwedeng-pwede magbayad sa pamamagitan ng GCash o Maya." },
                { q: "Magkano ang subscription fee?", a: "Nasa promo rate tayo ngayon na ₱50/buwan lamang. Walang setup fee o anumang hidden charges." },
                { q: "Pwede ko ba itong gamitin sa aking phone?", a: "Oo! Gumagana ang Budget Mo sa kahit anong smartphone (Android & iPhone) pati na rin sa laptop o PC." },
                { q: "Gaano katagal bago ko magamit ang app?", a: "Agad-agad! Pagkatapos mag-register at i-send ang payment screenshot sa Messenger, mai-unlock na ang iyong account." },
              ].map((faq, i) => (
                <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                  <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-cyan-600 shrink-0" />
                    {faq.q}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed pl-6">{faq.a}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA Card */}
        <section className="text-center pt-4">
          <div className="max-w-2xl mx-auto bg-slate-900 text-white rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 opacity-20 blur-3xl pointer-events-none" style={{ backgroundColor: accent }} />
            
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight mb-3 relative z-10">
              {isBudgetMo ? 'Simulan ang pag-ipon at pag-Budget ngayon!' : `Handa ka na bang palaguin ang iyong negosyo?`}
            </h2>
            <p className="text-slate-300 text-sm mb-8 relative z-10">
              {isBudgetMo ? 'Subukan ang Budget Mo — ₱50/buwan lang sa ating special promo.' : `Simulan ang paggamit ng ${foundApp.name} sa loob ng 1 minuto.`}
            </p>
            
            <div className="flex flex-col items-center gap-4 relative z-10">
              <Link href={`/${foundApp.id}/onboarding`} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-16 px-10 text-base font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 shadow-xl hover:scale-105 active:scale-95 transition-all rounded-2xl"
                >
                  <span>Subukan ang {foundApp.name} Now</span>
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>

              <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-slate-300 bg-white/10 px-4 py-2 rounded-full border border-white/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>{formatPeso(pricing.promotionalMonthlyPrice)}/buwan</span>
                <span className="text-slate-500">•</span>
                <span>₱0 setup fee</span>
                <span className="text-slate-500">•</span>
                <span>No credit card required</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Natural Taglish Cross-Sell Section ───────────────────────────── */}
        <section className="pt-10 border-t border-slate-200">
          <div className="text-center space-y-2 mb-8">
            <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-[10px] font-black uppercase tracking-wider">Katuwang Ecosystem</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Tingnan ang iba pang modules ng Katuwang
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
              Pumili sa 19 na business modules para sa tindahan, kainan, at serbisyo — plus ang Budget Mo para sa personal mong Budget.
            </p>
          </div>

          {/* Recommended Modules Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {crossSellApps.map((app) => {
              const AppIcon = app.icon;
              const appPrice = getModulePricing(app.id);
              return (
                <Link
                  key={app.id}
                  href={`/${app.id}`}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 group-hover:bg-primary group-hover:text-white transition-colors">
                        <AppIcon className="h-5 w-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                        {formatPeso(appPrice.promotionalMonthlyPrice)}/mo
                      </span>
                    </div>

                    <div>
                      <h4 className="font-black text-sm text-slate-900 group-hover:text-primary transition-colors flex items-center gap-1">
                        {app.name}
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h4>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                        {app.tagline}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* View All Modules Link */}
          <div className="text-center">
            <Link
              href="/#products"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white text-slate-800 font-bold px-6 py-3 text-xs sm:text-sm hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
            >
              <span>Tingnan ang Lahat ng Modules</span>
              <ArrowRight className="h-4 w-4 text-primary" />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 bg-slate-950">
        <div className="text-center flex flex-col items-center gap-3">
          <div className="opacity-40 hover:opacity-100 transition-opacity">
            <BrandLogo theme="dark" />
          </div>
          <p className="text-slate-500 text-[9px] font-bold uppercase tracking-[0.35em] leading-loose">
            <span translate="no" className="notranslate">Katuwang Solutions</span> · Framework v1.2<br />
            &copy; {new Date().getFullYear()} All Rights Reserved.
          </p>
        </div>
      </footer>

      {/* Mobile Sticky Conversion Bar */}
      <ModuleStickyBar
        moduleId={foundApp.id}
        moduleName={foundApp.name}
        priceText={`${formatPeso(pricing.promotionalMonthlyPrice)}/buwan`}
        accentColor={accent}
      />
    </div>
  );
}
