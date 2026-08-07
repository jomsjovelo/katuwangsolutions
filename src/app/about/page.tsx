import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Facebook, MessageCircle, Mail, Building2, Calendar, Target, Globe } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { activeModulesCount } from '@/lib/app-data';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tungkol sa Amin | Katuwang Solutions',
  description: 'Ang aming kwento at misyon para sa mga Pilipinong negosyante.',
  alternates: {
    canonical: 'https://katuwangsolutions.com/about',
  },
};

export default function AboutPage() {
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
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 py-12 md:py-20 space-y-12">
        <div className="space-y-4 text-center max-w-2xl mx-auto">
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Tungkol sa Amin</h1>
          <p className="text-lg text-slate-500 font-medium leading-relaxed">
            Ang Katuwang Solutions ay ginawa para mapadali ang buhay ng bawat Pilipinong negosyante.
          </p>
        </div>

        {/* ── Mission ─────────────────────────────────────────────────────────── */}
        <div className="bg-primary/5 border border-primary/20 rounded-3xl p-8 md:p-12 text-center">
          <Target className="h-12 w-12 text-primary mx-auto mb-6" />
          <h2 className="text-2xl font-black text-slate-900 mb-4">Ang Aming Misyon</h2>
          <p className="text-slate-600 text-lg leading-relaxed max-w-2xl mx-auto">
            "Ang Katuwang Solutions ay naniniwala na ang bawat Pilipinong negosyante ay may karapatang magkaroon ng propesyonal na sistema ng negosyo nang hindi nangangailangan ng malaking puhunan. Ginawa namin itong abot-kaya at napakadaling gamitin."
          </p>
        </div>

        {/* ── Story ─────────────────────────────────────────────────────────── */}
        <div className="space-y-6">
          <h2 className="text-2xl font-black text-slate-900">Ang Aming Kwento</h2>
          <div className="prose prose-slate max-w-none">
            <p className="text-slate-600 leading-relaxed text-lg">
              Nagsimula ang Katuwang Solutions dahil nakita namin ang hirap ng mga maliliit na negosyante (MSMEs) sa Pilipinas. Marami ang nagbabase pa rin sa papel at ballpen para sa kanilang imbentaryo, o kaya naman ay nagbabayad ng napakamahal sa mga kumplikadong POS systems na hindi tugma sa kanilang aktwal na pangangailangan.
            </p>
            <p className="text-slate-600 leading-relaxed text-lg mt-4">
              Kaya naman, binuo namin ang isang all-in-one platform na may {activeModulesCount} na iba't-ibang modules na mapagpipilian — mula Sari-Sari Store, Bigasan, Hardware, hanggang Salon at Car Wash. Anuman ang iyong negosyo, may Katuwang na naka-disenyo para sayo.
            </p>
          </div>
        </div>

        {/* ── Quick Facts ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center">
            <Calendar className="h-6 w-6 text-slate-400 mx-auto mb-3" />
            <div className="font-black text-2xl text-slate-900">2024</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Founded</div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center">
            <Building2 className="h-6 w-6 text-slate-400 mx-auto mb-3" />
            <div className="font-black text-2xl text-slate-900">{activeModulesCount}</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Modules</div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center">
            <Globe className="h-6 w-6 text-slate-400 mx-auto mb-3" />
            <div className="font-black text-2xl text-slate-900">Pinoy</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Made in PH</div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center">
            <div className="text-primary font-black text-lg mx-auto mb-1 mt-1">Promo Rates</div>
            <div className="text-xs font-bold text-slate-700">Promo ₱50–₱99/mo</div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">(regular ₱100–₱199/mo) bawat module</div>
          </div>
        </div>

        {/* ── Contact ─────────────────────────────────────────────────────────── */}
        <div className="border-t border-slate-200 pt-12 space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-black text-slate-900 mb-2">Makipag-ugnayan sa Amin</h2>
            <p className="text-slate-500">Laging handang tumulong ang aming suporta.</p>
          </div>
          
          <div className="grid sm:grid-cols-3 gap-4">
            <a href="https://www.facebook.com/katuwangsolutions" target="_blank" rel="noopener noreferrer" className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col items-center hover:border-blue-500 hover:shadow-md transition-all group">
              <Facebook className="h-8 w-8 text-blue-600 mb-3 group-hover:scale-110 transition-transform" />
              <span className="font-bold text-slate-900">Facebook Page</span>
            </a>
            <a href="https://m.me/katuwangsolutions" target="_blank" rel="noopener noreferrer" className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col items-center hover:border-blue-400 hover:shadow-md transition-all group">
              <MessageCircle className="h-8 w-8 text-blue-500 mb-3 group-hover:scale-110 transition-transform" />
              <span className="font-bold text-slate-900">Messenger</span>
            </a>
            <a href="mailto:support@katuwangsolutions.com" className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col items-center hover:border-teal-500 hover:shadow-md transition-all group">
              <Mail className="h-8 w-8 text-teal-600 mb-3 group-hover:scale-110 transition-transform" />
              <span className="font-bold text-slate-900">Email Support</span>
            </a>
          </div>
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
