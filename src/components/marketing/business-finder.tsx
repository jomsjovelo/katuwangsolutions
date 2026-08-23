'use client';

import React, { useState } from 'react';
import {
  ShoppingCart, Leaf, Utensils, Coffee, RotateCcw,
  Scissors, Truck, Hammer, Droplets, ChevronRight, Bed, Banknote
} from 'lucide-react';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';
import { trackModuleDiscovery } from '@/lib/conversion-events';

const INDUSTRIES = [
  { id: 'retail', label: 'Retail / Sari-Sari', icon: ShoppingCart, module: 'Benta Snap', moduleId: 'benta-snap', profile: 'general_retail', color: '#06B6D4' },
  { id: 'fresh', label: 'Fresh Goods & Produce', icon: Leaf, module: 'Benta Snap (Fresh Goods POS)', moduleId: 'benta-snap', profile: 'fresh_goods', color: '#10B981' },
  { id: 'restaurant', label: 'Kainan / Restaurant', icon: Utensils, module: 'Bite Snap', moduleId: 'bite-snap', color: '#F97316' },
  { id: 'cafe', label: 'Coffee Shop', icon: Coffee, module: 'Timpla Track', moduleId: 'timpla-track', color: '#EF4444' },
  { id: 'laundry', label: 'Laundry Shop', icon: RotateCcw, module: 'Spin Snap', moduleId: 'spin-snap', color: '#22D3EE' },
  { id: 'salon', label: 'Salon / Barbershop', icon: Scissors, module: 'Trim Track', moduleId: 'trim-track', color: '#E11D48' },
  { id: 'trucking', label: 'Trucking', icon: Truck, module: 'Biyahe Sync', moduleId: 'biyahe-sync', color: '#3B82F6' },
  { id: 'hardware', label: 'Hardware & Supplies', icon: Hammer, module: 'Benta Snap (Hardware POS)', moduleId: 'benta-snap', profile: 'hardware_supply', color: '#475569' },
  { id: 'water', label: 'Water Refilling', icon: Droplets, module: 'Hydro Sync', moduleId: 'hydro-sync', color: '#0284C7' },
  { id: 'hospitality', label: 'Resort / Motel', icon: Bed, module: 'Tsek-In', moduleId: 'tsek-in', color: '#D97706' },
  { id: 'finance', label: 'Personal / Business Finance', icon: Banknote, module: 'Budget Mo', moduleId: 'budget-mo', color: '#8B5CF6' },
];

export function BusinessFinder() {
  const [selected, setSelected] = useState<string | null>(null);
  const { open, openSheet, closeSheet, initialAppId, initialProfile } = useRegisterSheet();

  const selectedIndustry = INDUSTRIES.find(i => i.id === selected);

  const handleSelect = (id: string) => {
    if (selected === id) {
      setSelected(null);
    } else {
      setSelected(id);
      const ind = INDUSTRIES.find(i => i.id === id);
      if (ind) {
        trackModuleDiscovery(ind.moduleId, 'business_finder');
      }
    }
  };

  return (
    <>
      <section id="business-finder" className="py-14 px-5 bg-slate-50 border-t border-slate-100 scroll-mt-16">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Find Your Module</p>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
              Anong negosyo<br />
              <span className="text-primary">ang meron ka?</span>
            </h2>
            <p className="text-slate-500 text-sm">I-tap ang uri ng iyong negosyo at ipapakita namin ang module na nakatalaga sa napiling uri ng negosyo.</p>
          </div>

          {/* Industry grid */}
          <div className="grid grid-cols-3 gap-2.5 mb-6">
            {INDUSTRIES.map(({ id, label, icon: Icon, color }) => {
              const isSelected = selected === id;
              return (
                <button
                  key={id}
                  onClick={() => handleSelect(id)}
                  className="flex flex-col items-center gap-2 p-3.5 rounded-2xl border text-center transition-all active:scale-95 duration-150"
                  style={isSelected
                    ? { backgroundColor: `${color}15`, borderColor: color }
                    : { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }
                  }
                >
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center transition-all"
                    style={isSelected
                      ? { backgroundColor: color }
                      : { backgroundColor: '#f1f5f9' }
                    }
                  >
                    <Icon
                      className="h-5 w-5"
                      style={{ color: isSelected ? '#fff' : '#64748b' }}
                      strokeWidth={2}
                    />
                  </div>
                  <span
                    className="text-[10px] font-bold leading-tight"
                    style={{ color: isSelected ? color : '#475569' }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Recommendation banner */}
          {selectedIndustry && (
            <div
              className="rounded-2xl p-4 flex items-center gap-4 animate-in slide-in-from-bottom-2 duration-300"
              style={{ backgroundColor: `${selectedIndustry.color}12`, borderWidth: 1, borderColor: `${selectedIndustry.color}30` }}
            >
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: selectedIndustry.color }}
              >
                <selectedIndustry.icon className="h-6 w-6 text-white" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">Para sa iyo</p>
                <p className="font-black text-slate-900 text-base leading-tight">{selectedIndustry.module}</p>
                <p className="text-xs text-slate-600 mt-0.5 font-medium">
                  {selectedIndustry.moduleId === 'budget-mo' ? (
                    <span>Promo <strong className="text-primary">₱50/mo</strong> (regular ₱100/mo) bawat module</span>
                  ) : (
                    <span>Promo <strong className="text-primary">₱99/mo</strong> (regular ₱199/mo) bawat module</span>
                  )}
                </p>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                <button
                  onClick={() => openSheet(selectedIndustry.moduleId, selectedIndustry.profile)}
                  className="h-11 min-h-[44px] px-4 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1 active:scale-95 transition-transform"
                  style={{ backgroundColor: selectedIndustry.color }}
                >
                  Mag-register
                  <ChevronRight className="h-3 w-3" />
                </button>
                <a
                  href={`/${selectedIndustry.moduleId}${selectedIndustry.profile ? `?profile=${selectedIndustry.profile}` : ''}`}
                  className="h-11 min-h-[44px] px-3.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all text-center"
                  style={{ color: selectedIndustry.color, backgroundColor: `${selectedIndustry.color}15` }}
                >
                  Tingnan ang Detalye
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      <RegisterSheet
        open={open}
        onClose={closeSheet}
        initialAppId={initialAppId || selectedIndustry?.moduleId}
        initialProfile={initialProfile || selectedIndustry?.profile}
        ctaSource="business_finder"
      />
    </>
  );
}
