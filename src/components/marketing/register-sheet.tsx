'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X, ChevronRight, CheckCircle2, Banknote, BookText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { appGroups, activeModulesCount, activeModules } from '@/lib/app-data';
import { getModulePricing, formatPeso } from '@/lib/pricing';

interface RegisterSheetProps {
  open: boolean;
  onClose: () => void;
  initialAppId?: string;
}

function RegisterSheetContent({ open, onClose, initialAppId = '' }: RegisterSheetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingCode = searchParams?.get('ref') || searchParams?.get('code') || '';
  
  const [selectedId, setSelectedId] = useState(initialAppId);
  const [step, setStep] = useState<'role' | 'app'>('role');
  const [role, setRole] = useState<'owner' | 'staff' | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);
  const radioRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Capture invoker element and restore focus on close
  useEffect(() => {
    if (open) {
      invokerRef.current = document.activeElement as HTMLElement;
      setSelectedId(initialAppId);
      if (initialAppId === 'budget-mo') {
        onClose();
        router.push('/budget-mo/onboarding');
      } else {
        setStep('role');
        setRole(null);
      }
      setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 50);
    } else {
      if (invokerRef.current && typeof invokerRef.current.focus === 'function') {
        invokerRef.current.focus();
      }
    }
  }, [open, initialAppId, onClose, router]);

  // Escape key & Focus Trapping
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const preSelectedApp = activeModules.find(m => m.id === selectedId);
  const allAppsList = appGroups.flatMap(g => g.apps);

  const handleContinue = () => {
    if (step === 'role') {
      if (role === 'owner') {
        if (selectedId) {
          onClose();
          router.push(`/${selectedId}/onboarding`);
        } else {
          setStep('app');
        }
      } else if (role === 'staff') {
        onClose();
        setTimeout(() => {
          router.push(`/login${existingCode ? `?code=${existingCode}` : ''}`);
        }, 150);
      }
    } else {
      if (!selectedId) return;
      onClose();
      router.push(`/${selectedId}/onboarding`);
    }
  };

  const handleRoleKeyDown = (e: React.KeyboardEvent, currentRole: 'owner' | 'staff') => {
    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      const nextRole = currentRole === 'owner' ? 'staff' : 'owner';
      setRole(nextRole);
      setTimeout(() => {
        radioRefs.current.get(nextRole)?.focus();
      }, 0);
    }
  };

  const handleModuleKeyDown = (e: React.KeyboardEvent, currentId: string) => {
    if (['ArrowDown', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const idx = allAppsList.findIndex(i => i.id === currentId);
      const next = allAppsList[(idx + 1) % allAppsList.length];
      if (next) {
        setSelectedId(next.id);
        setTimeout(() => {
          radioRefs.current.get(next.id)?.focus();
        }, 0);
      }
    } else if (['ArrowUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      const idx = allAppsList.findIndex(i => i.id === currentId);
      const prev = allAppsList[(idx - 1 + allAppsList.length) % allAppsList.length];
      if (prev) {
        setSelectedId(prev.id);
        setTimeout(() => {
          radioRefs.current.get(prev.id)?.focus();
        }, 0);
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-sheet-title"
        aria-describedby="register-sheet-desc"
        className="relative bg-white rounded-t-[28px] shadow-2xl animate-in slide-in-from-bottom-full duration-300 ease-out max-h-[90dvh] flex flex-col min-h-[500px]"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 id="register-sheet-title" className="text-lg font-black text-slate-900 tracking-tight">
              {step === 'role' ? 'Ano ang role mo?' : 'Anong uri ng negosyo mo?'}
            </h3>
            <p id="register-sheet-desc" className="text-xs text-slate-500 font-medium">
              {step === 'role' 
                ? (preSelectedApp ? `Nagpaparehistro para sa ${preSelectedApp.name}.` : 'Piliin kung ikaw ang may-ari o staff.')
                : `Pumili sa ${activeModulesCount} apps.`}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Isara ang registration sheet"
            className="h-11 w-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
          {step === 'role' ? (
            <div role="radiogroup" aria-label="Pumili ng role" className="grid gap-3">
              {preSelectedApp && (
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3.5 flex items-center gap-3 mb-1">
                  <div className="h-10 w-10 bg-primary text-white rounded-xl flex items-center justify-center font-bold text-sm">
                    <preSelectedApp.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-primary">Selected Module</p>
                    <p className="font-bold text-sm text-slate-900">{preSelectedApp.name}</p>
                  </div>
                </div>
              )}

              <button
                ref={el => { if (el) radioRefs.current.set('owner', el); }}
                role="radio"
                aria-checked={role === 'owner'}
                tabIndex={role === 'owner' || role === null ? 0 : -1}
                aria-label="Business Owner - May-ari o Tagapamahala ng negosyo"
                onClick={() => setRole('owner')}
                onKeyDown={(e) => handleRoleKeyDown(e, 'owner')}
                className={cn(
                  'flex items-center gap-4 p-4 min-h-[56px] rounded-2xl border text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
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
                  <div className="text-xs text-slate-500 font-medium">May-ari / Tagapamahala ng negosyo.</div>
                </div>
                {role === 'owner' && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
              </button>

              <button
                ref={el => { if (el) radioRefs.current.set('staff', el); }}
                role="radio"
                aria-checked={role === 'staff'}
                tabIndex={role === 'staff' ? 0 : -1}
                aria-label="Team Member - Katuwang o Staff na sasali sa negosyo"
                onClick={() => setRole('staff')}
                onKeyDown={(e) => handleRoleKeyDown(e, 'staff')}
                className={cn(
                  'flex items-center gap-4 p-4 min-h-[56px] rounded-2xl border text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
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
                  <div className="text-xs text-slate-500 font-medium">Katuwang / Staff na sasali sa negosyo.</div>
                </div>
                {role === 'staff' && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
              </button>
            </div>
          ) : (
            <div role="radiogroup" aria-label="Pumili ng module" className="space-y-6">
              {appGroups.map((group) => (
                <div key={group.id} className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 pl-1">
                    {group.label}
                  </h4>
                  <div className="grid gap-2">
                    {group.apps.map((app) => {
                      const Icon = app.icon;
                      const isSelected = selectedId === app.id;
                      const pricing = getModulePricing(app.id);
                      const promoPriceStr = formatPeso(pricing.promotionalMonthlyPrice);
                      const regularPriceStr = formatPeso(pricing.regularMonthlyPrice);
                      const isFirst = allAppsList[0]?.id === app.id;
                      const tabIndexVal = isSelected || (!selectedId && isFirst) ? 0 : -1;

                      return (
                        <button
                          key={app.id}
                          ref={el => { if (el) radioRefs.current.set(app.id, el); }}
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={tabIndexVal}
                          aria-label={`${app.name} module, Promo ${promoPriceStr} per month, regular ${regularPriceStr} per month bawat module`}
                          onClick={() => setSelectedId(app.id)}
                          onKeyDown={(e) => handleModuleKeyDown(e, app.id)}
                          className={cn(
                            'flex items-start gap-3 p-3.5 min-h-[56px] rounded-2xl border text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            isSelected
                              ? 'bg-primary/8 border-primary shadow-sm'
                              : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                          )}
                        >
                          <div className={cn(
                            'h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors mt-0.5',
                            isSelected ? 'bg-primary text-white' : 'bg-white text-slate-400 border border-slate-200'
                          )}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2 flex-wrap sm:flex-nowrap">
                              <span className="font-bold text-sm text-slate-900">{app.name}</span>
                              <div className="text-right shrink-0">
                                <span className="text-xs font-black text-primary block leading-tight">
                                  Promo {promoPriceStr}/mo
                                </span>
                                <span className="text-xs text-slate-500 font-medium block leading-tight">
                                  (regular {regularPriceStr}/mo) bawat module
                                </span>
                              </div>
                            </div>
                            <div className="text-xs text-slate-600 font-medium leading-normal mt-1">{app.tagline}</div>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="h-4" />
        </div>

        {/* Sticky Continue Button */}
        <div className="px-5 py-4 border-t border-slate-100 bg-white flex-shrink-0">
          <Button
            id="continue-to-onboarding-btn"
            disabled={step === 'role' ? !role : !selectedId}
            onClick={handleContinue}
            className="w-full h-14 min-h-[48px] rounded-2xl text-base font-bold bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
          >
            {step === 'role' ? 'Magpatuloy' : (selectedId ? 'Ituloy ang Pagpaparehistro' : 'Pumili ng App')}
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RegisterSheet(props: RegisterSheetProps) {
  return (
    <React.Suspense fallback={null}>
      <RegisterSheetContent {...props} />
    </React.Suspense>
  );
}

export function useRegisterSheet() {
  const [open, setOpen] = useState(false);
  const [initialAppId, setInitialAppId] = useState<string>('');

  return {
    open,
    initialAppId,
    openSheet: (appId?: string | React.MouseEvent) => {
      if (typeof appId === 'string') setInitialAppId(appId);
      else setInitialAppId('');
      setOpen(true);
    },
    closeSheet: () => {
      setOpen(false);
      setInitialAppId('');
    },
  };
}
