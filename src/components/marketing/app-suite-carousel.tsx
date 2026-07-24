'use client';

import React, { useState } from 'react';
import { ChevronRight, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';
import { appGroups, activeModules, activeModulesCount, AppModule } from '@/lib/app-data';
import { getModulePricing, formatPeso } from '@/lib/pricing';
import Image from 'next/image';

const CATEGORY_TABS = [
  { id: 'all', label: '✨ Lahat ng Modules (20)' },
  { id: 'retail', label: '🛒 Retail (3)' },
  { id: 'food', label: '🍽️ Food & Events (3)' },
  { id: 'service', label: '🛠️ Serbisyo (7)' },
  { id: 'logistics', label: '🚚 Logistics & Rental (2)' },
  { id: 'financial', label: '💼 Pinansyal & HR (4)' },
  { id: 'hospitality', label: '🏨 Hospitality (1)' },
];

const MODULE_COLORS: Record<string, string> = {
  'benta-snap': '#06B6D4',
  'fresh-tally': '#10B981',
  'build-stack': '#6366F1',
  'bite-snap': '#F97316',
  'timpla-track': '#D97706',
  'ganap-master': '#EC4899',
  'spin-snap': '#8B5CF6',
  'hydro-sync': '#0284C7',
  'auto-boss': '#F59E0B',
  'wellness-pro': '#10B981',
  'trim-track': '#6366F1',
  'rep-sync': '#EF4444',
  'service-master': '#8B5CF6',
  'biyahe-sync': '#3B82F6',
  'rental': '#14B8A6',
  'sahod-flow': '#2563EB',
  'ledger-flow': '#4F46E5',
  '5-6-tracker': '#10B981',
  'budget-mo': '#8B5CF6',
  'tsek-in': '#D97706',
};

export function AppSuiteCarousel() {
  const { open, openSheet, closeSheet, initialAppId } = useRegisterSheet();
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeModuleId, setActiveModuleId] = useState('benta-snap');

  // Filter modules based on category tab
  const filteredModules = activeModules.filter((module) => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'financial') {
      return module.id === 'sahod-flow' || module.id === 'ledger-flow' || module.id === '5-6-tracker' || module.id === 'budget-mo';
    }
    const group = appGroups.find(g => g.apps.some(a => a.id === module.id));
    return group?.id === activeCategory;
  });

  const activeApp = activeModules.find(m => m.id === activeModuleId) || activeModules[0];
  const activeAppColor = MODULE_COLORS[activeApp.id] || '#06B6D4';
  const pricing = getModulePricing(activeApp.id);

  return (
    <>
      <section id="products" className="py-12 bg-white w-full">
        {/* Section Header */}
        <div className="px-5 mb-6">
          <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full mb-2">
            <Sparkles className="h-3 w-3" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Kumpletong 20 Business Modules</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
            Kahit anong negosyo,<br />
            <span className="text-primary">may module para sa iyo.</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-2">
            Lahat ng 20 business modules ay pwedeng gamitin agad · ₱50–₱99/buwan bawat module
          </p>
        </div>

        {/* Category Filter Pills */}
        <div className="flex gap-2 px-5 overflow-x-auto no-scrollbar pb-2 mb-6">
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveCategory(tab.id);
                  // Auto pick first module in category
                  if (tab.id === 'all') setActiveModuleId('benta-snap');
                  else if (tab.id === 'financial') setActiveModuleId('sahod-flow');
                  else {
                    const firstInGroup = appGroups.find(g => g.id === tab.id)?.apps[0];
                    if (firstInGroup) setActiveModuleId(firstInGroup.id);
                  }
                }}
                className={`flex-shrink-0 h-9 px-4 rounded-full text-xs font-black tracking-wide uppercase transition-all active:scale-95 shadow-sm border ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Active Module Showcase Card */}
        <div className="mx-5 bg-white rounded-3xl overflow-hidden shadow-xl border border-slate-200 mb-8 transition-all duration-300">
          <div className="relative w-full aspect-[16/9] overflow-hidden bg-slate-100">
            <Image
              src={activeApp.imageSrc}
              alt={activeApp.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 800px"
              priority
            />
            {/* Works Offline Badges */}
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

            {/* Price Badge */}
            <div
              className="absolute top-3 right-3 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white shadow-md"
              style={{ backgroundColor: activeAppColor }}
            >
              {activeApp.id === 'budget-mo' ? '₱50 / mo Promo' : '₱99 / mo'}
            </div>
          </div>

          {/* Module Information & Details */}
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
                style={{ backgroundColor: `${activeAppColor}18` }}
              >
                <activeApp.icon className="h-6 w-6" style={{ color: activeAppColor }} strokeWidth={2.2} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 leading-tight">{activeApp.name}</h3>
                <p className="text-xs font-bold text-slate-500">
                  {formatPeso(pricing.promotionalMonthlyPrice)} / buwan · bawat module
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
              "{activeApp.tagline}"
            </p>

            {/* Key Features Pill Badges */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {activeApp.features.slice(0, 4).map((feat, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-200">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  {feat}
                </span>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => openSheet(activeApp.id)}
                className="flex-1 h-12 rounded-2xl font-bold text-xs text-white active:scale-95 transition-transform shadow-md flex items-center justify-center gap-1.5"
                style={{ backgroundColor: activeAppColor }}
              >
                <span>Register Now</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link href={`/product/${activeApp.id}`} className="flex-1">
                <button className="w-full h-12 rounded-2xl font-bold text-xs text-slate-700 border border-slate-200 bg-slate-50 active:scale-95 transition-transform flex items-center justify-center gap-1 hover:bg-slate-100">
                  Learn More
                  <ChevronRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Responsive Grid of All Filtered Modules (Showing All 20) */}
        <div className="px-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">
              Pumili sa {filteredModules.length} Modules ({activeCategory === 'all' ? 'Lahat ng 20' : activeCategory})
            </h4>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {filteredModules.map((app) => {
              const isSelected = activeModuleId === app.id;
              const color = MODULE_COLORS[app.id] || '#06B6D4';
              const appPrice = getModulePricing(app.id);

              return (
                <button
                  key={app.id}
                  onClick={() => setActiveModuleId(app.id)}
                  className={`p-3 rounded-2xl text-left border transition-all flex flex-col justify-between h-28 relative overflow-hidden ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900 ring-offset-1'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between w-full">
                    <div
                      className="h-8 w-8 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.15)' : `${color}18` }}
                    >
                      <app.icon className="h-4 w-4" style={{ color: isSelected ? '#ffffff' : color }} />
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {formatPeso(appPrice.promotionalMonthlyPrice)}
                    </span>
                  </div>

                  <div>
                    <p className={`font-bold text-xs truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {app.name}
                    </p>
                    <p className={`text-[10px] truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                      {app.tagline}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* View All Modules Link */}
        <div className="flex justify-center mt-8 px-5">
          <Link
            href="/modules"
            className="flex items-center gap-2 rounded-2xl border border-slate-300 text-slate-700 font-bold px-8 py-3.5 hover:bg-slate-50 active:scale-95 transition-all shadow-sm text-xs sm:text-sm"
          >
            Tingnan ang Detalyadong Listahan ng Lahat ng {activeModulesCount} Modules
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <RegisterSheet open={open} onClose={closeSheet} initialAppId={initialAppId} />
    </>
  );
}
