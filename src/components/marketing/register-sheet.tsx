'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X, ChevronRight, CheckCircle2 } from 'lucide-react';
import {
  ShoppingCart, Leaf, Hammer,
  Utensils, Coffee, CalendarHeart, RotateCcw, Droplets,
  Sparkles, Sun, Banknote, BookText, Truck, Scissors, Dumbbell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const APP_GROUPS = [
  {
    category: 'Retail & Tindahan',
    items: [
      { id: 'benta-snap', name: 'Benta Snap', icon: ShoppingCart, desc: 'Lightning-fast retail checkout.' },
      { id: 'fresh-tally', name: 'Fresh Tally', icon: Leaf, desc: 'Smart fresh produce inventory.' },
      { id: 'build-stack', name: 'Build Stack', icon: Hammer, desc: 'Construction supply tracking.' },
    ]
  },
  {
    category: 'Pagkain & Inumin',
    items: [
      { id: 'bite-snap', name: 'Bite Snap', icon: Utensils, desc: 'Rapid order-to-kitchen flow.' },
      { id: 'timpla-track', name: 'Timpla Track', icon: Coffee, desc: 'Cafe & milk tea operations.' },
      { id: 'ganap-master', name: 'Ganap Master', icon: CalendarHeart, desc: 'Event & catering planning.' },
    ]
  },
  {
    category: 'Serbisyo',
    items: [
      { id: 'spin-snap', name: 'Spin Snap', icon: RotateCcw, desc: 'Automated laundry tracking.' },
      { id: 'hydro-sync', name: 'Hydro Sync', icon: Droplets, desc: 'Water delivery logistics.' },
      { id: 'auto-boss', name: 'Auto Boss', icon: Sparkles, desc: 'Auto shop management.' },
      { id: 'wellness-pro', name: 'Wellness', icon: Sun, desc: 'Spa & clinic booking.' },
      { id: 'trim-track', name: 'Trim Track', icon: Scissors, desc: 'Barber & salon queue.' },
      { id: 'rep-sync', name: 'Rep Sync', icon: Dumbbell, desc: 'Gym membership & attendance.' },
      { id: 'rental', name: 'Rental', icon: CalendarHeart, desc: 'Equipment & booking tracker.' },
    ]
  },
  {
    category: 'Pananatili ng Negosyo',
    items: [
      { id: 'sahod-flow', name: 'Sahod Flow', icon: Banknote, desc: 'Payroll automation.' },
      { id: 'ledger-flow', name: 'Ledger Flow', icon: BookText, desc: 'Financial insights & P&L.' },
      { id: 'biyahe-sync', name: 'Biyahe Sync', icon: Truck, desc: 'Trucking service dispatching & tracking.' },
    ]
  },
  {
    category: 'Pinansyal & Pagpapautang',
    items: [
      { id: '5-6-tracker', name: '5-6 Tracker', icon: BookText, desc: 'Micro-lending list manager.' },
    ]
  }
];

interface RegisterSheetProps {
  open: boolean;
  onClose: () => void;
  initialAppId?: string;
}

export function RegisterSheet({ open, onClose, initialAppId = '' }: RegisterSheetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingCode = searchParams?.get('ref') || searchParams?.get('code') || '';
  
  const [selectedId, setSelectedId] = useState(initialAppId);
  const [step, setStep] = useState<'role' | 'app'>('role');
  const [role, setRole] = useState<'owner' | 'staff' | null>(null);

  // Sync pre-selected app whenever the sheet is opened with a different app
  useEffect(() => {
    if (open) {
      setSelectedId(initialAppId);
      setStep('role');
      setRole(null);
    }
  }, [open, initialAppId]);

  const handleContinue = () => {
    if (step === 'role') {
      if (role === 'owner') {
        setStep('app');
      } else if (role === 'staff') {
        onClose();
        setTimeout(() => {
          router.push(`/?code=${existingCode}`);
        }, 150);
      }
    } else {
      if (!selectedId) return;
      onClose();
      router.push(`/onboarding?app=${selectedId}`);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-[28px] shadow-2xl animate-in slide-in-from-bottom-full duration-300 ease-out max-h-[90dvh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              {step === 'role' ? 'Ano ang role mo?' : 'Anong uri ng negosyo mo?'}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              {step === 'role' ? 'Piliin kung ikaw ang may-ari o staff.' : 'Pumili sa 16 apps — ₱99/buwan.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
          {step === 'role' ? (
            <div className="grid gap-3">
              <button
                onClick={() => setRole('owner')}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-2xl border text-left transition-all active:scale-[0.98]',
                  role === 'owner' ? 'bg-primary/8 border-primary shadow-sm' : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                )}
              >
                <div className={cn(
                  'h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                  role === 'owner' ? 'bg-primary text-white' : 'bg-white text-slate-400 border border-slate-200'
                )}>
                  <Banknote className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base text-slate-900">Business Owner</div>
                  <div className="text-xs text-slate-500">May-ari / Tagapamahala ng negosyo.</div>
                </div>
                {role === 'owner' && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
              </button>

              <button
                onClick={() => setRole('staff')}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-2xl border text-left transition-all active:scale-[0.98]',
                  role === 'staff' ? 'bg-primary/8 border-primary shadow-sm' : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                )}
              >
                <div className={cn(
                  'h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                  role === 'staff' ? 'bg-primary text-white' : 'bg-white text-slate-400 border border-slate-200'
                )}>
                  <BookText className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base text-slate-900">Team Member</div>
                  <div className="text-xs text-slate-500">Katuwang / Staff na sasali sa negosyo.</div>
                </div>
                {role === 'staff' && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
              </button>
            </div>
          ) : (
            APP_GROUPS.map((group) => (
              <div key={group.category} className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pl-1">
                  {group.category}
                </h4>
                <div className="grid gap-2">
                  {group.items.map((app) => {
                    const Icon = app.icon;
                    const isSelected = selectedId === app.id;
                    return (
                      <button
                        key={app.id}
                        onClick={() => setSelectedId(app.id)}
                        className={cn(
                          'flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all active:scale-[0.98]',
                          isSelected
                            ? 'bg-primary/8 border-primary shadow-sm'
                            : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                        )}
                      >
                        <div className={cn(
                          'h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                          isSelected ? 'bg-primary text-white' : 'bg-white text-slate-400 border border-slate-200'
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-slate-900">{app.name}</div>
                          <div className="text-xs text-slate-500 truncate">{app.desc}</div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          <div className="h-4" />
        </div>

        {/* Sticky Continue Button */}
        <div className="px-5 py-4 border-t border-slate-100 bg-white flex-shrink-0">
          <Button
            id="continue-to-onboarding-btn"
            disabled={step === 'role' ? !role : !selectedId}
            onClick={handleContinue}
            className="w-full h-14 rounded-2xl text-base font-bold bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
          >
            {step === 'role' ? 'Magpatuloy' : (selectedId ? 'Ituloy ang Pagpaparehistro' : 'Pumili ng App')}
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to open the register sheet from any client component.
 */
export function useRegisterSheet() {
  const [open, setOpen] = useState(false);
  return {
    open,
    openSheet: () => setOpen(true),
    closeSheet: () => setOpen(false),
  };
}
