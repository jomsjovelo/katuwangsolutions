import React from 'react';
import { getActiveAppById, appGroups } from '@/lib/app-data';
import { notFound, permanentRedirect } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';
import { 
  ArrowLeft, CheckCircle2, Zap, Star, Users, 
  RefreshCw, Scan, Bell, FileText, Calendar, Package, ArrowRight, Check
} from 'lucide-react';
import { Metadata } from 'next';

type Props = {
  params: Promise<{ id: string }>,
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const foundApp = getActiveAppById(resolvedParams.id);

  if (!foundApp) return { title: 'Product Not Found | Katuwang Solutions' };

  return {
    title: `${foundApp.name} POS & Management System | Katuwang Solutions`,
    description: foundApp.tagline,
    keywords: `${foundApp.name}, POS, Philippines MSME, ${foundApp.tagline.split(' ').slice(0,3).join(',')}`,
    openGraph: {
      title: `${foundApp.name} by Katuwang Solutions`,
      description: foundApp.tagline,
      type: 'website',
    }
  };
}

// Icon matcher helper
const getFeatureIcon = (feature: string) => {
  if (/sync|auto|update/i.test(feature)) return RefreshCw;
  if (/scan|barcode|qr/i.test(feature)) return Scan;
  if (/alert|notification|reminder/i.test(feature)) return Bell;
  if (/report|statement|ledger|history|invoice/i.test(feature)) return FileText;
  if (/schedule|calendar|date|time/i.test(feature)) return Calendar;
  if (/inventory|stock|part/i.test(feature)) return Package;
  if (/user|staff|employee|member|supplier/i.test(feature)) return Users;
  return Check;
};

export default async function ProductPage({ params, searchParams }: Props) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const id = resolvedParams.id;

  // Handle redirects for obsolete alias IDs
  if (id === 'fleet-sync' || id === 'rental-track') {
    const canonicalId = id === 'fleet-sync' ? 'biyahe-sync' : 'rental';
    const urlParams = new URLSearchParams();
    Object.entries(resolvedSearchParams).forEach(([key, val]) => {
      if (typeof val === 'string') {
        urlParams.set(key, val);
      } else if (Array.isArray(val)) {
        val.forEach(v => urlParams.append(key, v));
      }
    });
    const queryString = urlParams.toString();
    const dest = `/product/${canonicalId}${queryString ? `?${queryString}` : ''}`;
    permanentRedirect(dest);
  }

  const foundApp = getActiveAppById(id);
  if (!foundApp) {
    notFound();
  }

  let foundGroup: any = null;
  appGroups.forEach(g => {
    if (g.apps.some(a => a.id === foundApp.id)) {
      foundGroup = g;
    }
  });

  const Icon = foundApp.icon;
  const accent = foundGroup.accentColor;
  
  // Find related apps (same group, excluding current)
  const relatedApps = foundGroup.apps.filter((a: any) => a.id !== foundApp.id);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">

      {/* ── Sticky header ───────────────────────────────────────────────────── */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="h-5 w-5" />
          <span className="font-bold text-sm">Back</span>
        </Link>
        <BrandLogo showText={true} />
        <div className="w-10" />
      </header>

      {/* ── Hero image banner ───────────────────────────────────────────────── */}
      <div className="relative w-full h-72 sm:h-80 md:h-96 overflow-hidden">
        <Image
          src={foundApp.imageSrc}
          alt={foundApp.name}
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, ${accent}88 0%, ${accent}dd 100%)`,
          }}
        />
        {/* Hero text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3 pt-6">
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
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              <span className="text-xs font-bold text-white/90 uppercase tracking-widest mr-1">For:</span>
              {foundApp.targetUsers.map((user: string, idx: number) => (
                <span key={idx} className="text-[10px] sm:text-xs font-bold px-3 py-1 rounded-full bg-white/20 text-white backdrop-blur-md border border-white/20 shadow-sm">
                  {user}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Impact stats bar ────────────────────────────────────────────────── */}
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

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 md:px-12 py-12 space-y-16">

        {/* Description & How It Works */}
        <section className="space-y-12">
          {foundApp.description && (
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-lg md:text-xl text-slate-700 leading-relaxed font-medium">
                {foundApp.description}
              </p>
            </div>
          )}
          
          {foundApp.howItWorks && foundApp.howItWorks.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-center gap-2 mb-10">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight text-center">How It Works</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
                {/* Connector line for desktop */}
                <div className="hidden md:block absolute top-6 left-[16%] right-[16%] h-0.5 bg-slate-200 z-0" />
                
                {foundApp.howItWorks.map((hw: any, idx: number) => (
                  <div key={idx} className="relative z-10 flex flex-col items-center text-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <div 
                      className="h-12 w-12 rounded-full flex items-center justify-center text-white font-black text-lg mb-5 border-4 border-white shadow-sm"
                      style={{ backgroundColor: accent }}
                    >
                      {idx + 1}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mb-2">{hw.step}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{hw.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Key Features Grid */}
        {foundApp.features && foundApp.features.length > 0 && (
          <section className="pt-4">
            <div className="flex items-center gap-3 mb-8">
              <Zap className="h-6 w-6" style={{ color: accent }} />
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Key Features</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {foundApp.features.map((feature: string, idx: number) => {
                const FeatureIcon = getFeatureIcon(feature);
                return (
                  <div key={idx} className="flex items-start gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:border-slate-200 transition-colors group">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-50 group-hover:scale-110 transition-transform" style={{ color: accent }}>
                      <FeatureIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 mb-1">{feature}</h4>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Benefits */}
        {foundApp.benefits && foundApp.benefits.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-8">
              <Star className="h-6 w-6" style={{ color: accent }} />
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Why Choose {foundApp.name}?
              </h2>
            </div>
            <div className="grid gap-4">
              {foundApp.benefits.map((benefit: string, idx: number) => (
                <div
                  key={idx}
                  className="flex items-start gap-4 bg-white rounded-2xl px-6 py-5 border border-slate-100 shadow-sm relative overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: accent }} />
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 text-sm font-black text-white shadow-sm"
                    style={{ backgroundColor: accent }}
                  >
                    {idx + 1}
                  </div>
                  <p className="text-slate-700 font-medium text-base leading-snug mt-1">{benefit}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related Apps */}
        {relatedApps.length > 0 && (
          <section className="pt-10 border-t border-slate-200 mt-10">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Also in the {foundGroup.label} Suite</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {relatedApps.map((rel: any) => {
                const RelIcon = rel.icon;
                return (
                  <Link href={`/product/${rel.id}`} key={rel.id} className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-50" style={{ color: foundGroup.accentColor }}>
                      <RelIcon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-cyan-600 transition-colors">{rel.name}</h4>
                      <p className="text-xs text-slate-500 line-clamp-1">{rel.tagline}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-cyan-500 group-hover:translate-x-1 transition-all" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="text-center pt-8 pb-16">
          <div className="max-w-2xl mx-auto bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-slate-100 relative overflow-hidden">
            {/* Background accent glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 opacity-10 blur-3xl pointer-events-none" style={{ backgroundColor: accent }} />
            
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-4 relative z-10">
              Ready to upgrade your {foundGroup.label.toLowerCase()} business?
            </h2>
            <p className="text-slate-500 text-sm sm:text-base mb-8 relative z-10">
              Join thousands of MSMEs using {foundApp.name} to operate faster and smarter.
            </p>
            
            <div className="flex flex-col items-center gap-5 relative z-10">
              <Link href={`/onboarding?app=${foundApp.id}`}>
                <Button
                  size="lg"
                  className="h-14 px-12 text-lg font-black text-white shadow-lg hover:scale-105 hover:shadow-2xl transition-all active:scale-95 rounded-2xl"
                  style={{ backgroundColor: accent }}
                >
                  Get Started Now
                </Button>
              </Link>
              
              {/* Pricing Teaser */}
              <div className="flex items-center gap-2 mt-2 text-xs font-bold text-slate-500 bg-slate-50 px-5 py-2.5 rounded-full border border-slate-100">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>₱99/buwan bawat module</span>
                <span className="text-slate-300 px-1">•</span>
                <span>₱0 setup</span>
                <span className="text-slate-300 px-1">•</span>
                <span>No auto-renew</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
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
