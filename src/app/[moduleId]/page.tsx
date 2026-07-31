import React from 'react';
import { getActiveAppById, appGroups, activeModules, isValidActiveModuleId, normalizeModuleId } from '@/lib/app-data';
import { getModulePricing, formatPeso } from '@/lib/pricing';
import { getModuleTheme } from '@/lib/theme-utils';
import { getModulePartnerCopy } from '@/lib/module-partner-content';
import { notFound, permanentRedirect } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { 
  ArrowLeft, CheckCircle2, Zap, Star, Users, 
  RefreshCw, Scan, Bell, FileText, Calendar, Package, ArrowRight, Check, Sparkles, ChevronRight, ShieldCheck, Wallet, PieChart, TrendingUp, HelpCircle, X, ShoppingCart, CheckSquare
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
  const resolvedParams = (await params) || { moduleId: '' };
  const foundApp = getActiveAppById(resolvedParams.moduleId);

  if (!foundApp) return { title: 'Module Not Found | Katuwang Solutions' };

  const isBudgetMo = foundApp.id === 'budget-mo';
  const pageTitle = isBudgetMo 
    ? `Budget Mo - Personal Cash Flow & Savings Tracker | Katuwang Solutions`
    : `${foundApp.name} - Ang Katuwang mo sa Negosyo | Katuwang Solutions`;

  return {
    title: pageTitle,
    description: isBudgetMo 
      ? 'Hinto sa pagtataka kung saan napunta ang sweldo mo. I-track ang daily expenses, ipon, at cash flow sa iisang simpleng app sa ₱50/buwan lang!'
      : `${foundApp.description || foundApp.tagline} Subukan ang ${foundApp.name} — ang matapat mong Katuwang sa Negosyo sa special promo rate!`,
    keywords: `${foundApp.name}, Katuwang Solutions, Katuwang mo sa Negosyo, Philippines, ${foundApp.targetUsers?.join(', ')}, pos system, business software, gcash, maya`,
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
  const theme = getModuleTheme(foundApp.id);
  const partnerCopy = getModulePartnerCopy(foundApp.id);
  const isBudgetMo = foundApp.id === 'budget-mo';

  let foundGroup: any = null;
  appGroups.forEach(g => {
    if (g.apps.some(a => a.id === foundApp.id)) {
      foundGroup = g;
    }
  });

  const Icon = foundApp.icon;
  const primaryColor = theme.primary || foundGroup?.accentColor || '#06B6D4';
  const headlineParts = partnerCopy.heroHeadline.split(partnerCopy.highlightWord);

  // Get cross-sell recommendations from OTHER categories
  const otherGroupApps = activeModules.filter(a => {
    if (a.id === foundApp.id) return false;
    const groupOfApp = appGroups.find(g => g.apps.some(x => x.id === a.id));
    return groupOfApp?.id !== foundGroup?.id;
  });

  // Pick 3 diverse cross-sell apps
  const crossSellApps = otherGroupApps.slice(0, 3);

  // FAQs
  const defaultFaqs = [
    { 
      q: `Kailangan ba ng Credit Card para sa ${foundApp.name}?`, 
      a: "Hindi! Pwedeng-pwede magbayad at mag-subscribe gamit ang GCash o Maya. Walang hidden charges o credit card setup." 
    },
    { 
      q: `Magkano ang subscription fee ng ${foundApp.name}?`, 
      a: `Nasa Early Adopter Promo tayo ngayon na ${formatPeso(pricing.promotionalMonthlyPrice)}/buwan lamang (regular price ${formatPeso(pricing.regularMonthlyPrice)}/mo). Walang setup fee!` 
    },
    { 
      q: `Gumagana ba ang ${foundApp.name} kahit walang Internet (Offline)?`, 
      a: "Oo! May Industrial-Grade Offline Resiliency ang Katuwang. Magagamit mo pa rin ang app kahit mawalan ng signal o internet, at kusa itong magse-sync kapag bumalik na ang connection." 
    },
    { 
      q: `Anong mga device ang pwede kong gamitin?`, 
      a: "Gumagana ito sa kahit anong smartphone (Android & iPhone), Tablet, iPad, pati na sa Laptop o Desktop PC." 
    },
    { 
      q: `Gaano mabilis i-setup ang ${foundApp.name}?`, 
      a: "Sa loob ng 1 minuto lang! Pagkatapos mag-register, mai-unlock agad ang iyong module dashboard at maaari ka nang mag-benta o mag-monitor kasama ang Katuwang mo." 
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
          <span className="font-bold text-sm">Bumalik</span>
        </Link>
        <BrandLogo showText={true} />
        <Link 
          href="/login" 
          className="text-xs font-black uppercase tracking-wider px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 transition-all text-slate-700"
        >
          Login
        </Link>
      </header>

      {/* Dynamic Module Hero Section — Clean Professional SaaS Style */}
      <div 
        className="relative w-full overflow-hidden bg-white text-slate-900 border-b border-slate-100"
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
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border shadow-sm"
            style={{ 
              backgroundColor: '#FEF3C7', 
              borderColor: '#FDE68A',
              color: '#B45309'
            }}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            <span>EARLY ADOPTER PROMO: {formatPeso(pricing.promotionalMonthlyPrice)}/MONTH ONLY</span>
            <span className="line-through opacity-60 font-medium text-[10px] text-amber-800">{formatPeso(pricing.regularMonthlyPrice)}/mo</span>
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
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 1-Minute Setup
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
                <span>Simulan ang {foundApp.name} ({formatPeso(pricing.promotionalMonthlyPrice)}/mo)</span>
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">
              Instant Access · Cancel anytime · ₱0 setup fee
            </p>
          </div>

        </div>
      </div>

      {/* Main Content Body */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 md:px-12 py-12 space-y-16">
        
        {/* ── Interactive UI Preview Box ──────────────────────────────────── */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: primaryColor }}>
              Tingnan ang Iyong Katuwang sa Action
            </h2>
            <p className="text-2xl sm:text-3xl font-black text-slate-900">Simpleng Gamitin sa Kahit Anong Phone o Laptop</p>
            <p className="text-slate-500 text-xs sm:text-sm">Ito ang makikita mo sa loob ng {foundApp.name} dashboard:</p>
          </div>

          <div 
            className="p-6 sm:p-8 rounded-3xl text-white shadow-2xl space-y-6 border border-white/20 relative overflow-hidden"
            style={{ 
              background: `linear-gradient(135deg, ${primaryColor} 0%, #0f172a 100%)` 
            }}
          >
            <div className="flex justify-between items-center border-b border-white/20 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/80">
                  {isBudgetMo ? 'AVAILABLE CASH BALANCE' : `${foundApp.name.toUpperCase()} SYSTEM STATUS`}
                </span>
                <p className="text-3xl sm:text-4xl font-black tracking-tight mt-0.5">
                  {isBudgetMo ? '₱14,250.00' : 'ONLINE & READY'}
                </p>
              </div>
              <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                <span>Protected & Synced</span>
              </div>
            </div>

            {/* Quick Metrics / Features Showcase Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              {(foundApp.features || ['Mabilis na Checkout', 'Auto-Stock Deduction', 'Real-time Reports', 'GCash & Cash']).slice(0, 4).map((feat, idx) => (
                <div key={idx} className="bg-white/15 backdrop-blur-md p-3.5 rounded-xl border border-white/10 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/70">FEATURE 0{idx + 1}</span>
                  <p className="text-xs font-black text-white">{feat}</p>
                </div>
              ))}
            </div>

            {/* App Stats & Highlights */}
            {foundApp.stats && foundApp.stats.length > 0 && (
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/10">
                {foundApp.stats.map((st, i) => (
                  <div key={i} className="text-center bg-black/20 p-3 rounded-2xl">
                    <span className="text-lg sm:text-xl font-black text-amber-300 block">{st.value}</span>
                    <span className="text-[9px] font-bold uppercase text-slate-300">{st.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Problem & Pain Points vs Solution (Bago Dumating ang Katuwang Mo) ── */}
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
              <ul className="space-y-3 text-xs text-rose-950 font-semibold">
                {partnerCopy.soloStruggles.map((struggle, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <X className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                    <span>{struggle}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Sa Katuwang (May Kasama Ka Na) */}
            <div className="bg-emerald-50/80 border border-emerald-200 p-6 rounded-3xl space-y-4 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-800 font-black text-base uppercase tracking-wider">
                <span className="text-lg">🤝</span> MAY KATUWANG KA NA SA {foundApp.name.toUpperCase()}
              </div>
              <ul className="space-y-3 text-xs text-emerald-950 font-bold">
                {partnerCopy.partnerWins.map((win, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{win}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Features & Benefits Showcase ───────────────────────────────── */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: primaryColor }}>
              Paano Ka Tutulungan ng Katuwang Mo
            </h2>
            <p className="text-2xl sm:text-3xl font-black text-slate-900">Lahat ng Kailangan ng Negosyo Mo sa Iisang App</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {foundApp.features.map((feat, idx) => (
              <div 
                key={idx} 
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-2 flex items-start gap-3"
              >
                <div 
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm"
                  style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                >
                  0{idx + 1}
                </div>
                <div className="space-y-1">
                  <h3 className="font-black text-slate-900 text-base">{feat}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Designed para maging mabilis, malinis, at walang kalituhan sa araw-araw na pamamahala.
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Target Audience Badge Chips */}
          {foundApp.targetUsers && foundApp.targetUsers.length > 0 && (
            <div className="bg-slate-100/80 p-4 rounded-2xl text-center space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                PERFECT NA KATUWANG PARA SA:
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {foundApp.targetUsers.map((userType, i) => (
                  <span key={i} className="bg-white px-3 py-1 rounded-full text-xs font-bold text-slate-800 border border-slate-200">
                    {userType}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── 3-Step Walkthrough (How it works) ───────────────────────────── */}
        {foundApp.howItWorks && foundApp.howItWorks.length > 0 && (
          <section className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Paano Magsimula</h2>
              <p className="text-2xl sm:text-3xl font-black text-slate-900">3 Mabilis na Hakbang Kasama ang Katuwang Mo</p>
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

        {/* ── Comparison Table Matrix ─────────────────────────────────────── */}
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
                    { feature: 'Bilis ng Transaksyon', traditional: '❌ Mabagal sa papel (1-2 mins)', generic: '⚠️ Katamtaman', katuwang: '✅ Instant (5 seconds)' },
                    { feature: 'Automatic Inventory Deduction', traditional: '❌ Manual bilang sa gabi', generic: '⚠️ Formula setup', katuwang: '✅ Automatic sa bawat benta' },
                    { feature: 'Works Offline (Kahit walang signal)', traditional: '✅ Pwede sa papel', generic: '❌ Kailangan ng PC', katuwang: '✅ Tuloy-tuloy kahit offline' },
                    { feature: 'GCash & Maya Payment Tracking', traditional: '❌ Nawawala reference', generic: '❌ Manual typing', katuwang: '✅ Integrated QR & Ref Log' },
                    { feature: 'Shift & Cashier Auditing', traditional: '❌ Mahirap alamin kulang', generic: '❌ Walang audit log', katuwang: '✅ Strict Drawer & Shift Audit' },
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
                    <td className="p-4 text-slate-500">₱0 (Pero maraming nawawala)</td>
                    <td className="p-4 text-slate-500">Libre (Pero matagal gamitin)</td>
                    <td className="p-4 font-black text-emerald-700 bg-emerald-50/50">
                      ✅ {formatPeso(pricing.promotionalMonthlyPrice)}/buwan lang!
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── FAQ Section ─────────────────────────────────────────────────── */}
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

        {/* ── Final High-Converting Pricing CTA Card ──────────────────────── */}
        <section className="text-center pt-4">
          <div 
            className="max-w-2xl mx-auto bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-xl border border-slate-200 relative overflow-hidden"
            style={{
              background: `linear-gradient(180deg, #FFFFFF 0%, ${primaryColor}08 100%)`
            }}
          >
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 bg-amber-100 px-3 py-1 rounded-full border border-amber-200 inline-block mb-3">
              ⚡ EARLY ADOPTER PROMO
            </span>

            <h2 className="text-2xl sm:text-4xl font-black tracking-tight mb-3 text-slate-900">
              Simulan ang {foundApp.name} Ngayon!
            </h2>
            <p className="text-slate-600 text-xs sm:text-sm mb-6 max-w-lg mx-auto font-medium">
              Gamitin ang iyong Katuwang sa loob ng 1 minuto sa aming promo rate na <strong className="text-slate-900">{formatPeso(pricing.promotionalMonthlyPrice)}/buwan</strong>. Walang credit card required!
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
                  <span>Gamitin ang {foundApp.name} ({formatPeso(pricing.promotionalMonthlyPrice)}/mo)</span>
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>

              <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 px-4 py-2 rounded-full border border-slate-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{formatPeso(pricing.promotionalMonthlyPrice)}/buwan</span>
                <span className="text-slate-400">•</span>
                <span>₱0 setup fee</span>
                <span className="text-slate-400">•</span>
                <span>Instant Access</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Katuwang Ecosystem Cross-Sell Section ───────────────────────── */}
        <section className="pt-10 border-t border-slate-200">
          <div className="text-center space-y-2 mb-8">
            <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-800 px-3 py-1 rounded-full">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[10px] font-black uppercase tracking-wider">Katuwang Ecosystem</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
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
              return (
                <Link
                  key={app.id}
                  href={`/${app.id}`}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                        <AppIcon className="h-5 w-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                        {formatPeso(appPrice.promotionalMonthlyPrice)}/mo
                      </span>
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

      {/* Mobile & Desktop Sticky Conversion Bar */}
      <ModuleStickyBar
        moduleId={foundApp.id}
        moduleName={`Katuwang: ${foundApp.name}`}
        priceText={`${formatPeso(pricing.promotionalMonthlyPrice)}/buwan`}
        accentColor={primaryColor}
      />
    </div>
  );
}
