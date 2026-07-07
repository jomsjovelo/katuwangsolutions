'use client';

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import {
  ShoppingCart, Leaf, Truck, HandCoins, Utensils
} from 'lucide-react';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';
import Image from 'next/image';

const FLAGSHIP_APPS = [
  {
    id: 'benta-snap',
    name: 'Benta Snap',
    icon: ShoppingCart,
    tagline: 'Lightning-fast retail checkout para sa sari-sari store at tindahan.',
    imageSrc: '/apps/benta-snap.png',
    color: '#06B6D4',
    badge: 'Pinaka-Popular',
  },
  {
    id: 'fresh-tally',
    name: 'Fresh Tally',
    icon: Leaf,
    tagline: 'Smart tracking ng prutas, gulay, at karne para sa palengke.',
    imageSrc: '/apps/fresh-tally.png',
    color: '#10B981',
    badge: null,
  },
  {
    id: 'fleet-sync',
    name: 'Biyahe Sync',
    icon: Truck,
    tagline: 'Subaybayan ang bawat biyahe, gastos, at kita ng iyong trucking.',
    imageSrc: '/apps/biyahe-sync.png',
    color: '#3B82F6',
    badge: 'Bagong Module',
  },
  {
    id: '5-6-tracker',
    name: '5-6 Tracker',
    icon: HandCoins,
    tagline: 'I-digitize ang listahan ng utang at koleksyon. Walang nawawala.',
    imageSrc: '/apps/5-6-tracker.png',
    color: '#10B981',
    badge: 'Bagong Module',
  },
  {
    id: 'bite-snap',
    name: 'Bite Snap',
    icon: Utensils,
    tagline: 'Mabilis na order at payment system para sa iyong kainan o restaurant.',
    imageSrc: '/apps/bite-snap.png',
    color: '#F97316',
    badge: 'Bagong Module',
  },
];

export function AppSuiteCarousel() {
  const { open, openSheet, closeSheet } = useRegisterSheet();
  const [activeId, setActiveId] = useState(FLAGSHIP_APPS[0].id);

  const activeApp = FLAGSHIP_APPS.find(a => a.id === activeId) ?? FLAGSHIP_APPS[0];

  return (
    <>
      <section id="products" className="py-12 bg-white w-full">
        {/* Section header */}
        <div className="px-5 mb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1">Featured Modules</p>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
            Kahit anong negosyo,<br />
            <span className="text-primary">may module para sa iyo.</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1.5">19 modules available · ₱99/buwan bawat isa</p>
        </div>

        {/* Module selector pills */}
        <div className="flex gap-2 px-5 overflow-x-auto no-scrollbar pb-1 mb-6">
          {FLAGSHIP_APPS.map((app) => (
            <button
              key={app.id}
              onClick={() => setActiveId(app.id)}
              className="flex-shrink-0 h-9 px-4 rounded-full text-xs font-bold tracking-wide uppercase transition-all active:scale-95"
              style={
                activeId === app.id
                  ? { backgroundColor: app.color, color: '#fff' }
                  : { backgroundColor: '#F1F5F9', color: '#64748B' }
              }
            >
              {app.name}
            </button>
          ))}
        </div>

        {/* Active module card — full width */}
        <div className="mx-5 bg-white rounded-2xl overflow-hidden shadow-lg border border-slate-100">
          {/* Image */}
          <div className="relative w-full aspect-[16/9] overflow-hidden bg-slate-100">
            <Image
              src={activeApp.imageSrc}
              alt={activeApp.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 600px"
            />
            {/* Badges overlaid on image */}
            <div className="absolute bottom-3 left-3 flex gap-1.5">
              <div className="flex items-center gap-1 bg-slate-900/80 backdrop-blur-md rounded-full px-2.5 py-1">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wide">Works Offline</span>
              </div>
              <div className="flex items-center gap-1 bg-slate-900/80 backdrop-blur-md rounded-full px-2.5 py-1">
                <div className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                <span className="text-[9px] font-bold text-sky-300 uppercase tracking-wide">Auto Sync</span>
              </div>
            </div>
            {activeApp.badge && (
              <div
                className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white"
                style={{ backgroundColor: activeApp.color }}
              >
                {activeApp.badge}
              </div>
            )}
          </div>

          {/* Card body */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${activeApp.color}18` }}
              >
                <activeApp.icon className="h-5 w-5" style={{ color: activeApp.color }} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 leading-tight">{activeApp.name}</h3>
                <p className="text-xs text-slate-400 font-medium">₱99 / buwan</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">"{activeApp.tagline}"</p>

            <div className="flex gap-2 pt-1">
              <button
                onClick={openSheet}
                className="flex-1 h-11 rounded-xl font-bold text-xs text-white active:scale-95 transition-transform"
                style={{ backgroundColor: activeApp.color }}
              >
                Register Now
              </button>
              <Link href={`/product/${activeApp.id}`} className="flex-1">
                <button className="w-full h-11 rounded-xl font-bold text-xs text-slate-700 border border-slate-200 bg-slate-50 active:scale-95 transition-transform flex items-center justify-center gap-1 hover:bg-slate-100">
                  Learn More
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-1.5 mt-5 px-5">
          {FLAGSHIP_APPS.map((app) => (
            <button
              key={app.id}
              onClick={() => setActiveId(app.id)}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: activeId === app.id ? '20px' : '6px',
                backgroundColor: activeId === app.id ? activeApp.color : '#CBD5E1'
              }}
            />
          ))}
        </div>

        {/* View All button */}
        <div className="flex justify-center mt-6 px-5">
          <Link
            href="/onboarding"
            className="flex items-center gap-2 rounded-xl border border-slate-300 text-slate-600 font-bold px-8 py-3 hover:bg-slate-50 active:scale-95 transition-all shadow-sm text-sm"
          >
            Tingnan ang Lahat ng 19 Modules
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <RegisterSheet open={open} onClose={closeSheet} />
    </>
  );
}
