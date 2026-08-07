import React from 'react';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Metadata } from 'next';
import {
  CheckCircle2, ArrowRight, ArrowLeft, Sparkles, HelpCircle, ChevronRight
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  activeModules, appGroups, getActiveAppById, normalizeModuleId, isValidActiveModuleId
} from '@/lib/app-data';
import { getModulePricing, formatPeso } from '@/lib/pricing';
import { getModulePartnerCopy } from '@/lib/module-partner-content';
import { BrandLogo } from '@/components/ui/brand-logo';
import { ModuleViewTracker } from '@/components/analytics/meta-events';

interface Props {
  params: Promise<{ moduleId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const rawId = resolvedParams?.moduleId || '';
  const canonicalId = normalizeModuleId(rawId);
  const foundApp = getActiveAppById(canonicalId);

  if (!foundApp) {
    return {
      title: 'Module Not Found | Katuwang Solutions',
    };
  }

  const pricing = getModulePricing(foundApp.id);
  const promoStr = formatPeso(pricing.promotionalMonthlyPrice);
  const regularStr = formatPeso(pricing.regularMonthlyPrice);

  return {
    title: `${foundApp.name} — Promo ${promoStr}/mo (regular ${regularStr}/mo) bawat module | Katuwang Solutions`,
    description: `${foundApp.name}: ${foundApp.tagline}. Subukan sa inyong negosyo sa promo rate na Promo ${promoStr}/mo bawat module (regular ${regularStr}/mo).`,
    alternates: {
      canonical: `https://katuwangsolutions.com/${foundApp.id}`,
    },
    openGraph: {
      title: `${foundApp.name} by Katuwang Solutions`,
      description: foundApp.tagline,
      type: 'website',
    },
  };
}

export default async function ModuleDedicatedPage({ params, searchParams }: Props) {
  const resolvedParams = (await params) || { moduleId: '' };
  const resolvedSearchParams = (await searchParams) || {};
  const rawId = resolvedParams.moduleId;

  // Handle alias redirects (e.g. fleet-sync -> biyahe-sync)
  const canonicalId = normalizeModuleId(rawId);
  if (rawId !== canonicalId && isValidActiveModuleId(canonicalId)) {
    const urlParams = new URLSearchParams();
    if (resolvedSearchParams && typeof resolvedSearchParams === 'object') {
      Object.entries(resolvedSearchParams).forEach(([key, val]) => {
        if (typeof val === 'string') urlParams.set(key, val);
        else if (Array.isArray(val)) val.forEach(v => urlParams.append(key, v));
      });
    }
    const queryString = urlParams.toString();
    permanentRedirect(`/${canonicalId}${queryString ? `?${queryString}` : ''}`);
  }

  const foundApp = getActiveAppById(rawId);
  if (!foundApp) {
    notFound();
  }

  const pricing = getModulePricing(foundApp.id);
  const partnerCopy = getModulePartnerCopy(foundApp.id);

  let foundGroup: any = null;
  appGroups.forEach(g => {
    if (g.apps.some(a => a.id === foundApp.id)) {
      foundGroup = g;
    }
  });

  const Icon = foundApp.icon;
  const primaryColor = foundGroup?.accentColor || '#06B6D4';
  const headlineParts = partnerCopy.heroHeadline.split(partnerCopy.highlightWord);

  // Get cross-sell recommendations from OTHER categories
  const otherGroupApps = activeModules.filter(a => {
    if (a.id === foundApp.id) return false;
    const groupOfApp = appGroups.find(g => g.apps.some(x => x.id === a.id));
    return groupOfApp?.id !== foundGroup?.id;
  });

  const crossSellApps = otherGroupApps.slice(0, 3);

  // Clean FAQs without unverified/held claims
  const defaultFaqs = [
    { 
      q: `Kailangan ba ng Credit Card para sa ${foundApp.name}?`, 
      a: "Hindi! Pwedeng magbayad at mag-subscribe gamit ang GCash o Maya. Walang auto-debit o credit card setup." 
    },
    { 
      q: `Magkano ang subscription fee ng ${foundApp.name}?`, 
      a: `Ang promo rate ay Promo ${formatPeso(pricing.promotionalMonthlyPrice)}/buwan bawat module (regular price ${formatPeso(pricing.regularMonthlyPrice)}/buwan bawat module).` 
    },
    { 
      q: `Gumagana ba ang ${foundApp.name} sa POS mode?`, 
      a: "May offline mode ang POS/Benta module para sa pag-record ng benta kahit mawalan ng signal. Nag-a-update ito sa cloud servers kapag na-connect muli sa internet." 
    },
    { 
      q: `Anong mga device ang pwede kong gamitin?`, 
      a: "Maaari ninyong gamitin ang rehistradong account sa smartphone, tablet, o laptop." 
    },
    { 
      q: `Paano mag-register sa ${foundApp.name}?`, 
      a: "Pumili ng role at mag-onboard. Ang inyong activation request ay ima-verify ng Operations team matapos mag-submit ng payment." 
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-20">
      <ModuleViewTracker
        moduleId={foundApp.id}
        moduleName={foundApp.name}
        moduleCategory={foundGroup?.label}
      />

      {/* Top Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-4 py-3 flex items-center justify-between shadow-sm">
        <Link href="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-wider">Bumalik sa Home</span>
        </Link>
        <div className="flex items-center gap-2">
          <BrandLogo />
        </div>
      </header>

      {/* Top Hero Header Section */}
      <section 
        className="w-full border-b border-slate-200 relative overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${primaryColor}0A 0%, #FFFFFF 100%)`
        }}
      >
        <div className="max-w-4xl mx-auto px-6 pt-12 pb-16 flex flex-col items-center text-center relative z-10 space-y-6">
          
          {/* Module Icon + Partner Category Badge */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-1.5 rounded-full shadow-sm">
            <div className="h-5 w-5 rounded-full flex items-center justify-center" style={{ backgroundColor: `${primaryColor}20` }}>
              <Icon className="h-3.5 w-3.5" style={{ color: primaryColor }} />
            </div>
            <span className="text-xs font-extrabold uppercase tracking-widest text-slate-600">
              ANG KATUWANG MO SA <span className="font-black text-slate-900">{partnerCopy.partnerCategory.toUpperCase()}</span>
            </span>
          </div>

          {/* Promo Badge */}
          <div 
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border shadow-sm flex-wrap justify-center"
            style={{ 
              backgroundColor: '#FEF3C7', 
              borderColor: '#FDE68A',
              color: '#B45309'
            }}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            <span>PROMO RATE: Promo {formatPeso(pricing.promotionalMonthlyPrice)}/mo bawat module</span>
            <span className="opacity-80 font-medium text-xs text-amber-900">(regular {formatPeso(pricing.regularMonthlyPrice)}/mo)</span>
          </div>

          {/* Main Hero Headline */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.15] max-w-3xl text-slate-900">
            {headlineParts.length > 1 ? (
              <>
                {headlineParts[0]}
                <span style={{ color: primaryColor }}>
                  {partnerCopy.highlightWord}
                </span>
                {headlineParts[1]}
              </>
            ) : (
              partnerCopy.heroHeadline
            )}
          </h1>

          {/* Sub-headline */}
          <p className="text-base sm:text-lg text-slate-600 font-medium max-w-2xl leading-relaxed">
            {partnerCopy.heroSubtitle}
          </p>

          {/* Partner Trust Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-slate-600 pt-1">
            <span className="bg-slate-100 border border-slate-200 px-3.5 py-1.5 rounded-full flex items-center gap-1.5">
              🤝 Matapat na Katuwang
            </span>
            <span className="bg-slate-100 border border-slate-200 px-3.5 py-1.5 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Simple Onboarding
            </span>
            <span className="bg-slate-100 border border-slate-200 px-3.5 py-1.5 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> GCash & Maya Ready
            </span>
            <span className="bg-slate-100 border border-slate-200 px-3.5 py-1.5 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> No Credit Card Required
            </span>
          </div>

          {/* Primary Hero CTA Button */}
          <div className="pt-3 w-full sm:w-auto">
            <Link href={`/${foundApp.id}/onboarding`} className="w-full sm:w-auto inline-block">
              <Button
                size="lg"
                className="w-full sm:w-auto h-14 px-9 text-base font-black text-white shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.98] transition-all rounded-2xl border-none"
                style={{ 
                  backgroundColor: primaryColor,
                }}
              >
                <span>Simulan ang {foundApp.name} (Promo {formatPeso(pricing.promotionalMonthlyPrice)}/mo bawat module)</span>
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            <p className="text-xs text-slate-500 font-medium mt-2.5">
              Promo {formatPeso(pricing.promotionalMonthlyPrice)}/mo bawat module (regular {formatPeso(pricing.regularMonthlyPrice)}/mo) · Manual payment via GCash/Maya
            </p>
          </div>

        </div>
      </section>

      {/* Main Content Body */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 md:px-12 py-12 space-y-16">

        {/* ── Problem & Pain Points vs Solution ── */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Bakit Kailangan Mo ng Katuwang</h2>
            <p className="text-2xl sm:text-3xl font-black text-slate-900">Bago Dumating ang Katuwang Mo vs. May Katuwang Ka Na sa {foundApp.name}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Bago Dumating ang Katuwang Mo */}
            <div className="bg-rose-50/80 border border-rose-200 p-6 rounded-3xl space-y-4">
              <div className="flex items-center gap-2 text-rose-700 font-black text-base uppercase tracking-wider">
                <span className="text-lg">❌</span> BAGO DUMATING ANG KATUWANG MO
              </div>
              <ul className="space-y-3 text-xs sm:text-sm text-slate-700 font-medium">
                {((partnerCopy as any).beforePoints || [
                  'Mahirap i-track ang araw-araw na benta sa papel',
                  'Nalilimutan o nagkakabaligtad ang listahan ng utang',
                  'Walang malinaw na shift audit at cash audit sa drawer'
                ]).map((pt: string, i: number) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-rose-500 font-bold shrink-0">✕</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* May Katuwang Ka Na */}
            <div 
              className="bg-white border p-6 rounded-3xl space-y-4 shadow-md"
              style={{ borderColor: `${primaryColor}40` }}
            >
              <div className="flex items-center gap-2 font-black text-base uppercase tracking-wider" style={{ color: primaryColor }}>
                <span className="text-lg">✅</span> MAY KATUWANG KA NA SA {foundApp.name.toUpperCase()}
              </div>
              <ul className="space-y-3 text-xs sm:text-sm text-slate-800 font-semibold">
                {((partnerCopy as any).afterPoints || [
                  'Organisadong pag-record ng benta at transaksyon',
                  'Malinaw na talaan ng utang ng bawat suki o kontraktor',
                  'Strict shift tracking para maayos ang cashier drawer'
                ]).map((pt: string, i: number) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="font-bold shrink-0" style={{ color: primaryColor }}>✓</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── How It Works Step-by-Step ── */}
        {foundApp.howItWorks && foundApp.howItWorks.length > 0 && (
          <section className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Paano Magsimula</h2>
              <p className="text-2xl sm:text-3xl font-black text-slate-900">3 Hakbang Kasama ang Katuwang Mo</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {foundApp.howItWorks.map((hw: { step: string; detail: string }, idx: number) => (
                <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2 relative overflow-hidden">
                  <div className="text-3xl font-black" style={{ color: primaryColor }}>0{idx + 1}</div>
                  <h3 className="font-black text-slate-900 text-base">{hw.step}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{hw.detail}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Comparison Table Matrix ── */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Ikumpara Mo</h2>
            <p className="text-2xl sm:text-3xl font-black text-slate-900">Bakit Mas Maganda Kapag May Katuwang Ka</p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider">
                    <th className="p-4 font-black">Feature / Bentahe</th>
                    <th className="p-4 font-black opacity-60">Notebook / Papel</th>
                    <th className="p-4 font-black opacity-60">Generic Software</th>
                    <th className="p-4 font-black text-amber-300" style={{ backgroundColor: `${primaryColor}40` }}>
                      🤝 {foundApp.name}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                  {(partnerCopy.comparisonRows || [
                    { feature: 'Bilis ng Transaksyon', traditional: '❌ Mabagal sa papel', generic: '⚠️ Katamtaman', katuwang: '✅ Mabilis na Flow' },
                    { feature: 'Inventory Deduction', traditional: '❌ Manual bilang sa gabi', generic: '⚠️ Formula setup', katuwang: '✅ Na-ia-update sa bawat benta' },
                    { feature: 'POS Mode Support', traditional: '✅ Pwede sa papel', generic: '⚠️ Kailangan ng PC', katuwang: '✅ May offline mode ang POS/Benta' },
                    { feature: 'GCash & Maya Payment Tracking', traditional: '❌ Manual listahan', generic: '❌ Manual typing', katuwang: '✅ Integrated Ref Log' },
                    { feature: 'Shift & Cashier Auditing', traditional: '❌ Mahirap alamin kulang', generic: '❌ Walang audit log', katuwang: '✅ Drawer & Shift Audit' },
                  ]).map((row, idx) => (
                    <tr key={idx}>
                      <td className="p-4 text-slate-800 font-bold">{row.feature}</td>
                      <td className="p-4 text-rose-500">{row.traditional}</td>
                      <td className="p-4 text-amber-600">{row.generic}</td>
                      <td className="p-4 font-black text-emerald-700 bg-emerald-50/50">{row.katuwang}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="p-4 text-slate-800 font-bold">Mababang Presyo</td>
                    <td className="p-4 text-slate-500">₱0 (Pero manual ang pag-lista)</td>
                    <td className="p-4 text-slate-500">Libre (Pero matagal gamitin)</td>
                    <td className="p-4 font-black text-emerald-700 bg-emerald-50/50">
                      ✅ Promo {formatPeso(pricing.promotionalMonthlyPrice)}/buwan bawat module (regular {formatPeso(pricing.regularMonthlyPrice)}/mo)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── FAQ Section ── */}
        <section className="space-y-6 pt-4">
          <div className="text-center space-y-2">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Mga Madalas Itanong ng Negosyante</h2>
            <p className="text-2xl sm:text-3xl font-black text-slate-900">Frequently Asked Questions (FAQ)</p>
          </div>

          <div className="grid gap-3">
            {defaultFaqs.map((faq, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5">
                <h3 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <HelpCircle className="h-4.5 w-4.5 shrink-0" style={{ color: primaryColor }} />
                  {faq.q}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pl-6">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Final High-Converting Pricing CTA Card ── */}
        <section className="text-center pt-4">
          <div 
            className="max-w-2xl mx-auto bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-xl border border-slate-200 relative overflow-hidden"
            style={{
              background: `linear-gradient(180deg, #FFFFFF 0%, ${primaryColor}08 100%)`
            }}
          >
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 bg-amber-100 px-3 py-1 rounded-full border border-amber-200 inline-block mb-3">
              SPECIAL PROMO RATE
            </span>

            <h2 className="text-2xl sm:text-4xl font-black tracking-tight mb-3 text-slate-900">
              Simulan ang {foundApp.name} Ngayon!
            </h2>
            <p className="text-slate-600 text-xs sm:text-sm mb-6 max-w-lg mx-auto font-medium">
              I-onboard ang inyong negosyo sa {foundApp.name} sa promo rate na Promo {formatPeso(pricing.promotionalMonthlyPrice)}/buwan bawat module (regular {formatPeso(pricing.regularMonthlyPrice)}/buwan). Walang credit card required!
            </p>
            
            <div className="flex flex-col items-center gap-4">
              <Link href={`/${foundApp.id}/onboarding`} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-15 px-10 text-base font-black text-white shadow-xl hover:scale-105 active:scale-95 transition-all rounded-2xl border-none"
                  style={{ 
                    backgroundColor: primaryColor,
                  }}
                >
                  <span>Mag-register para sa {foundApp.name}</span>
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
              <p className="text-xs text-slate-500 font-medium">
                Promo {formatPeso(pricing.promotionalMonthlyPrice)}/mo bawat module (regular {formatPeso(pricing.regularMonthlyPrice)}/mo) · Manual payment via GCash/Maya
              </p>
            </div>
          </div>
        </section>

        {/* ── Cross-Sell Recommendations Section ── */}
        <section className="pt-8 border-t border-slate-200 space-y-6">
          <div className="text-center space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Higit Pang Kakayahan</p>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900">
              Tingnan ang iba pang Katuwang sa Negosyo
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
              const isBm = app.id === 'budget-mo';
              return (
                <Link
                  key={app.id}
                  href={`/${app.id}`}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between group text-left"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors shrink-0">
                        <AppIcon className="h-5 w-5" />
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-800 bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md block">
                          Promo {formatPeso(appPrice.promotionalMonthlyPrice)}/mo
                        </span>
                        <span className="text-[9px] text-slate-500 font-medium block mt-0.5">
                          (reg {formatPeso(appPrice.regularMonthlyPrice)}/mo) bawat module
                        </span>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-black text-sm text-slate-900 group-hover:text-cyan-600 transition-colors flex items-center gap-1">
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
              <span>Tingnan ang Lahat ng Katuwang Modules</span>
              <ArrowRight className="h-4 w-4 text-cyan-600" />
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
            <span translate="no" className="notranslate">Katuwang Solutions</span> · Ang Katuwang mo sa Negosyo<br />
            &copy; {new Date().getFullYear()} All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
