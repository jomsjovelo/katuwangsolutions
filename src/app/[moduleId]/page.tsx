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
  RefreshCw, Scan, Bell, FileText, Calendar, Package, ArrowRight, Check, Sparkles, ChevronRight
} from 'lucide-react';
import { Metadata } from 'next';

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
    ? `${foundApp.name} Personal Budgeting Assistant | Katuwang Solutions`
    : `${foundApp.name} POS & Management System | Katuwang Solutions`;

  return {
    title: pageTitle,
    description: foundApp.tagline,
    keywords: `${foundApp.name}, Katuwang Solutions, Philippines, ${foundApp.tagline.split(' ').slice(0, 4).join(', ')}`,
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
    // Prefer apps from different categories for variety
    const groupOfApp = appGroups.find(g => g.apps.some(x => x.id === a.id));
    return groupOfApp?.id !== foundGroup?.id;
  });

  // Pick 3 diverse cross-sell apps
  const crossSellApps = otherGroupApps.slice(0, 3);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
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
      <div className="relative w-full h-72 sm:h-80 md:h-96 overflow-hidden">
        <Image
          src={foundApp.imageSrc}
          alt={foundApp.name}
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, ${accent}99 0%, ${accent}ee 100%)`,
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3 pt-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-white text-[10px] font-black uppercase tracking-widest border border-white/20">
            <Sparkles className="h-3 w-3" />
            <span>{isBudgetMo ? 'Personal Budgeting Assistant' : `${foundGroup?.label || 'Business'} Module`}</span>
          </div>

          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center shadow-2xl mb-1"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
          >
            <Icon className="h-9 w-9 text-white" />
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-md">
            {foundApp.name}
          </h1>

          <p className="text-sm sm:text-base font-semibold text-white/90 max-w-xl leading-snug drop-shadow">
            "{foundApp.tagline}"
          </p>

          {foundApp.targetUsers && foundApp.targetUsers.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <span className="text-xs font-bold text-white/90 uppercase tracking-widest mr-1">Para sa:</span>
              {foundApp.targetUsers.map((user: string, idx: number) => (
                <span key={idx} className="text-[10px] sm:text-xs font-bold px-3 py-1 rounded-full bg-white/20 text-white backdrop-blur-md border border-white/20 shadow-sm">
                  {user}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Impact Stats */}
      {foundApp.stats && foundApp.stats.length > 0 && (
        <div className="bg-white border-b border-slate-100 shadow-sm relative z-10">
          <div className="max-w-4xl mx-auto px-6 py-6 grid grid-cols-3 divide-x divide-slate-100">
            {foundApp.stats.map((stat: { value: string; label: string }, i: number) => (
              <div key={i} className="flex flex-col items-center text-center px-2">
                <span className="text-2xl sm:text-3xl font-black" style={{ color: accent }}>
                  {stat.value}
                </span>
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1 leading-tight">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 md:px-12 py-12 space-y-16">
        {/* Description */}
        {foundApp.description && (
          <section className="max-w-3xl mx-auto text-center space-y-4">
            <p className="text-lg md:text-xl text-slate-700 leading-relaxed font-medium">
              {foundApp.description}
            </p>
          </section>
        )}

        {/* How it works */}
        {foundApp.howItWorks && foundApp.howItWorks.length > 0 && (
          <section className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Paano Ito Gamitin</h2>
              <p className="text-2xl font-black text-slate-900">Mabilis at simpleng proseso</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {foundApp.howItWorks.map((hw: { step: string; detail: string }, idx: number) => (
                <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-2 relative overflow-hidden">
                  <div className="text-2xl font-black text-slate-200">0{idx + 1}</div>
                  <h3 className="font-bold text-slate-900 text-base">{hw.step}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{hw.detail}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Key Benefits */}
        {foundApp.benefits && foundApp.benefits.length > 0 && (
          <section className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Bakit Ito Magugustuhan</h2>
              <p className="text-2xl font-black text-slate-900">Mga Benepisyo</p>
            </div>
            <div className="grid gap-3">
              {foundApp.benefits.map((benefit: string, idx: number) => (
                <div key={idx} className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                  <span className="text-slate-700 text-sm font-semibold">{benefit}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA Card */}
        <section className="text-center pt-4">
          <div className="max-w-2xl mx-auto bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-slate-200 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 opacity-10 blur-3xl pointer-events-none" style={{ backgroundColor: accent }} />
            
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-3 relative z-10">
              {isBudgetMo ? 'Handa ka na bang mag-ipon at magbadyet?' : `Handa ka na bang palaguin ang iyong negosyo?`}
            </h2>
            <p className="text-slate-500 text-sm mb-8 relative z-10">
              {isBudgetMo ? 'Subukan ang Budget Mo ngayon — ₱50/buwan lang sa ating special promo.' : `Simulan ang paggamit ng ${foundApp.name} sa loob ng 1 minuto.`}
            </p>
            
            <div className="flex flex-col items-center gap-4 relative z-10">
              <Link href={`/${foundApp.id}/onboarding`} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-14 px-10 text-base font-black text-white shadow-lg hover:scale-[1.02] active:scale-95 transition-all rounded-2xl"
                  style={{ backgroundColor: accent }}
                >
                  <span>Subukan ang {foundApp.name} Now</span>
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>

              <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-4 py-2 rounded-full border border-slate-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>{formatPeso(pricing.promotionalMonthlyPrice)}/buwan</span>
                <span className="text-slate-300">•</span>
                <span>₱0 setup fee</span>
                <span className="text-slate-300">•</span>
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
              Pumili sa 19 na business modules para sa tindahan, kainan, at serbisyo — plus ang Budget Mo para sa personal mong badyet.
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
    </div>
  );
}
