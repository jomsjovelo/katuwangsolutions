import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Facebook, MessageCircle, Mail, Building2, Target, WalletCards, Layers3 } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { activeModulesCount, standardModulesCount } from '@/lib/app-data';
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
            Built for Filipino entrepreneurs.
          </p>
        </div>

        {/* ── Mission ─────────────────────────────────────────────────────────── */}
        <div className="bg-primary/5 border border-primary/20 rounded-3xl p-8 md:p-12 text-center">
          <Target className="h-12 w-12 text-primary mx-auto mb-6" />
          <h2 className="text-2xl font-black text-slate-900 mb-4">Ang Aming Misyon</h2>
          <p className="text-slate-600 text-lg leading-relaxed max-w-2xl mx-auto">
            Katuwang Solutions builds practical digital solutions that help Filipino entrepreneurs and individuals become more organized and productive.
          </p>
        </div>

        {/* ── Product ecosystem ─────────────────────────────────────────────── */}
        <div className="space-y-6">
          <h2 className="text-2xl font-black text-slate-900">Ano ang Katuwang Solutions?</h2>
          <div className="prose prose-slate max-w-none">
            <p className="text-slate-600 leading-relaxed text-lg">
              Ang Katuwang Solutions ay isang software ecosystem na may 18 modules: 17 business modules at Budget Mo para sa personal budgeting.
            </p>
            <p className="text-slate-600 leading-relaxed text-lg mt-4">
              Pumili at mag-subscribe sa module na kailangan mo. Bawat module ay may hiwalay na subscription.
            </p>
          </div>
        </div>

        {/* ── Quick Facts ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center">
            <Layers3 className="h-6 w-6 text-slate-400 mx-auto mb-3" />
            <div className="font-black text-2xl text-slate-900">{activeModulesCount}</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Modules</div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center">
            <Building2 className="h-6 w-6 text-slate-400 mx-auto mb-3" />
            <div className="font-black text-2xl text-slate-900">{standardModulesCount}</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Business Modules</div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center">
            <WalletCards className="h-6 w-6 text-slate-400 mx-auto mb-3" />
            <div className="font-black text-lg text-slate-900">Budget Mo</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Personal Budgeting</div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center">
            <div className="text-primary font-black text-lg mx-auto mb-1 mt-1">Per Module</div>
            <div className="text-xs font-bold text-slate-700">Hiwalay na Subscription</div>
          </div>
        </div>

        {/* ── Contact ─────────────────────────────────────────────────────────── */}
        <div className="border-t border-slate-200 pt-12 space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-black text-slate-900 mb-2">Makipag-ugnayan sa Amin</h2>
            <p className="text-slate-500">Makipag-ugnayan sa amin sa pamamagitan ng Facebook, Messenger, o email.</p>
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
