'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X, ChevronRight, CheckCircle2, Banknote, BookText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { appGroups, activeModulesCount, activeModules } from '@/lib/app-data';
import { getModulePricing, formatPeso } from '@/lib/pricing';
import {
  CtaSource,
  trackRegistrationIntent,
  trackRegistrationRoleSelected,
  trackModuleSelectionConfirmed,
} from '@/lib/conversion-events';
import { updateAcquisitionCtaSource } from '@/lib/conversion-attribution';

interface RegisterSheetProps {
  open: boolean;
  onClose: () => void;
  initialAppId?: string;
  initialProfile?: string;
  ctaSource?: CtaSource;
}
function RegisterSheetContent({
  open,
  onClose,
  initialAppId = '',
  initialProfile = '',
  ctaSource = 'floating_bar',
}: RegisterSheetProps) {
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
  const confirmedEmittedRef = useRef(false);

  // Capture invoker element and restore focus on close
  useEffect(() => {
    if (!open) return;

    const invoker = document.activeElement as HTMLElement;
    invokerRef.current = invoker;
    setSelectedId(initialAppId);
    setStep('role');
    setRole(null);
    confirmedEmittedRef.current = false;

    trackRegistrationIntent(ctaSource, initialAppId || undefined);
    updateAcquisitionCtaSource(ctaSource);

    const focusTimer = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);

    return () => {
      window.clearTimeout(focusTimer);
      if (typeof invoker?.focus === 'function') {
        window.setTimeout(() => invoker.focus(), 50);
      }
    };
  }, [open, initialAppId, ctaSource]);

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

  const preSelectedApp = activeModules.find((m) => m.id === selectedId);
  const allAppsList = appGroups.flatMap((g) => g.apps);

  const handleSetRole = (newRole: 'owner' | 'staff') => {
    if (newRole !== role) {
      setRole(newRole);
      trackRegistrationRoleSelected(newRole, ctaSource, selectedId || undefined);
    }
  };

  const emitModuleConfirmedOnce = (id: string) => {
    if (!confirmedEmittedRef.current) {
      confirmedEmittedRef.current = true;
      trackModuleSelectionConfirmed(id, ctaSource);
    }
  };

  const handleContinue = () => {
    const buildOnboardingUrl = (appId: string) => {
      const urlParams = new URLSearchParams();
      if (existingCode) urlParams.set('ref', existingCode);
      if (appId === 'benta-snap' && initialProfile) {
        urlParams.set('profile', initialProfile);
      }
      const qs = urlParams.toString();
      return `/${appId}/onboarding${qs ? `?${qs}` : ''}`;
    };

    if (step === 'role') {
      if (role === 'owner') {
        if (selectedId) {
          emitModuleConfirmedOnce(selectedId);
          onClose();
          router.push(buildOnboardingUrl(selectedId));
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
      emitModuleConfirmedOnce(selectedId);
      onClose();
      router.push(buildOnboardingUrl(selectedId));
    }
  };

  const handleRoleKeyDown = (
    e: React.KeyboardEvent,
    currentRole: 'owner' | 'staff'
  ) => {
    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      const nextRole = currentRole === 'owner' ? 'staff' : 'owner';
      handleSetRole(nextRole);
      setTimeout(() => {
        radioRefs.current.get(nextRole)?.focus();
      }, 0);
    }
  };

  const handleModuleKeyDown = (
    e: React.KeyboardEvent,
    currentId: string
  ) => {
    if (['ArrowDown', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const idx = allAppsList.findIndex((i) => i.id === currentId);
      const next = allAppsList[(idx + 1) % allAppsList.length];
      if (next) {
        setSelectedId(next.id);
        setTimeout(() => {
          radioRefs.current.get(next.id)?.focus();
        }, 0);
      }
    } else if (['ArrowUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      const idx = allAppsList.findIndex((i) => i.id === currentId);
      const prev =
        allAppsList[(idx - 1 + allAppsList.length) % allAppsList.length];
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
            <h3
              id="register-sheet-title"
              className="text-lg font-black text-slate-900 tracking-tight"
            >
              {step === 'role'
                ? 'Ano ang role mo?'
                : 'Anong uri ng negosyo mo?'}
            </h3>
            <p
              id="register-sheet-desc"
              className="text-xs text-slate-500 font-medium"
            >
              {step === 'role'
                ? preSelectedApp
                  ? `Nagpaparehistro para sa ${preSelectedApp.name}.`
                  : 'Piliin kung ikaw ang may-ari o staff.'
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
            <div
              role="radiogroup"
              aria-label="Pumili ng role"
              className="grid gap-3"
            >
              {preSelectedApp && (
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3.5 flex items-center gap-3 mb-1">
                  <div className="h-10 w-10 bg-primary text-white rounded-xl flex items-center justify-center font-bold text-sm">
                    <preSelectedApp.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-primary">
                      Selected Module
                    </p>
                    <p className="font-bold text-sm text-slate-900">
                      {preSelectedApp.name}
                    </p>
                  </div>
                </div>
              )}

              <button
                ref={(el) => {
                  if (el) radioRefs.current.set('owner', el);
                }}
                role="radio"
                aria-checked={role === 'owner'}
                tabIndex={role === 'owner' || role === null ? 0 : -1}
                onClick={() => handleSetRole('owner')}
                onKeyDown={(e) => handleRoleKeyDown(e, 'owner')}
                className={cn(
                  'w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px]',
                  role === 'owner'
                    ? 'border-primary bg-primary/5 shadow-md'
                    : 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200'
                )}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={cn(
                      'h-12 w-12 rounded-xl flex items-center justify-center transition-colors',
                      role === 'owner'
                        ? 'bg-primary text-white'
                        : 'bg-white text-slate-600 border border-slate-200'
                    )}
                  >
                    <Banknote className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-extrabold text-sm text-slate-900">
                      Business Owner
                    </p>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Gagawa ng bagong account para sa negosyo.
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    'h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors',
                    role === 'owner'
                      ? 'border-primary bg-primary text-white'
                      : 'border-slate-300 bg-white'
                  )}
                >
                  {role === 'owner' && (
                    <div className="h-2 w-2 rounded-full bg-white" />
                  )}
                </div>
              </button>

              <button
                ref={(el) => {
                  if (el) radioRefs.current.set('staff', el);
                }}
                role="radio"
                aria-checked={role === 'staff'}
                tabIndex={role === 'staff' ? 0 : -1}
                onClick={() => handleSetRole('staff')}
                onKeyDown={(e) => handleRoleKeyDown(e, 'staff')}
                className={cn(
                  'w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px]',
                  role === 'staff'
                    ? 'border-primary bg-primary/5 shadow-md'
                    : 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200'
                )}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={cn(
                      'h-12 w-12 rounded-xl flex items-center justify-center transition-colors',
                      role === 'staff'
                        ? 'bg-primary text-white'
                        : 'bg-white text-slate-600 border border-slate-200'
                    )}
                  >
                    <BookText className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-extrabold text-sm text-slate-900">
                      Team Member / Staff
                    </p>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      May existing business code o invitation.
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    'h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors',
                    role === 'staff'
                      ? 'border-primary bg-primary text-white'
                      : 'border-slate-300 bg-white'
                  )}
                >
                  {role === 'staff' && (
                    <div className="h-2 w-2 rounded-full bg-white" />
                  )}
                </div>
              </button>
            </div>
          ) : (
            <div
              role="radiogroup"
              aria-label="Pumili ng negosyo"
              className="space-y-6"
            >
              {appGroups.map((group) => (
                <div key={group.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                      {group.label}
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {group.apps.map((app) => {
                      const isSelected = selectedId === app.id;
                      const pricing = getModulePricing(app.id);
                      return (
                        <button
                          key={app.id}
                          ref={(el) => {
                            if (el) radioRefs.current.set(app.id, el);
                          }}
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={
                            isSelected || (!selectedId && app.id === 'benta-snap')
                              ? 0
                              : -1
                          }
                          onClick={() => setSelectedId(app.id)}
                          onKeyDown={(e) => handleModuleKeyDown(e, app.id)}
                          className={cn(
                            'w-full p-3.5 rounded-2xl border-2 text-left transition-all flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px]',
                            isSelected
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                'h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0',
                                isSelected
                                  ? 'bg-primary text-white'
                                  : 'bg-white text-slate-700 border border-slate-200'
                              )}
                            >
                              <app.icon className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-extrabold text-sm text-slate-900">
                                  {app.name}
                                </p>
                                <span className="text-[10px] font-black text-secondary bg-secondary/10 px-2 py-0.5 rounded-full uppercase">
                                  Promo {formatPeso(pricing.promotionalMonthlyPrice)}/mo
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 font-medium mt-0.5 line-clamp-1">
                                {app.tagline}
                              </p>
                            </div>
                          </div>
                          <div
                            className={cn(
                              'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ml-2',
                              isSelected
                                ? 'border-primary bg-primary text-white'
                                : 'border-slate-300 bg-white'
                            )}
                          >
                            {isSelected && (
                              <div className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-100 flex-shrink-0 bg-white">
          <Button
            disabled={
              step === 'role'
                ? !role
                : !selectedId
            }
            onClick={handleContinue}
            className="w-full h-14 rounded-2xl text-base font-bold shadow-xl active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-40 disabled:active:scale-100 min-h-[44px]"
          >
            <span>
              {step === 'role'
                ? role === 'staff'
                  ? 'Magpatuloy sa Login'
                  : selectedId
                  ? 'Magpatuloy sa Registration'
                  : 'Magpatuloy: Pumili ng Module'
                : 'Ituloy ang Pagpaparehistro'}
            </span>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RegisterSheet(props: RegisterSheetProps) {
  if (!props.open) return null;
  return <RegisterSheetContent {...props} />;
}

export function useRegisterSheet(defaultAppId = '', defaultProfile = '') {
  const [open, setOpen] = useState(false);
  const [initialAppId, setInitialAppId] = useState(defaultAppId);
  const [initialProfile, setInitialProfile] = useState(defaultProfile);

  const openSheet = (appId?: any, profile?: string) => {
    if (typeof appId === 'string') {
      setInitialAppId(appId);
    }
    if (typeof profile === 'string') {
      setInitialProfile(profile);
    } else {
      setInitialProfile('');
    }
    setOpen(true);
  };

  const closeSheet = () => {
    setOpen(false);
  };

  return {
    open,
    initialAppId,
    initialProfile,
    openSheet,
    closeSheet,
  };
}
