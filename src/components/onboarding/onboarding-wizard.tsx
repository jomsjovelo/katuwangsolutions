"use client"

import React, { useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { ChevronLeft } from 'lucide-react';
import { AppPickerStep } from './steps/app-picker';
import { BusinessInfoStep } from './steps/business-info';
import { AccountStep } from './steps/account';
import { SuccessStep } from './steps/success';
import { PaymentStep } from './steps/payment';
import { PendingStep } from './steps/pending';

import { registerNewTenant } from '@/firebase/firestore/onboarding-actions';
import { AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'apps' | 'business' | 'account' | 'success' | 'payment' | 'pending';

const FORM_STEPS: Step[] = ['apps', 'business', 'account'];

interface OnboardingWizardProps {
  initialAppId?: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function OnboardingWizard({ initialAppId, onComplete, onCancel }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>(initialAppId ? 'business' : 'apps');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState({
    // Business
    appId: initialAppId || '',
    businessName: '',
    businessPhone: '',
    // Personal
    fullName: '',
    personalPhone: '',
    address: '',
    // Credentials
    email: '',
    confirmEmail: '',
    password: '',
    confirmPassword: '',
  });

  const update = (patch: Partial<typeof data>) => setData((d) => ({ ...d, ...patch }));

  const next = async () => {
    setError(null);
    const all: Step[] = ['apps', 'business', 'account', 'success', 'payment', 'pending'];
    const currentIndex = all.indexOf(step);
    const nextStep = all[currentIndex + 1];

    if (step === 'account') {
      setIsLoading(true);
      try {
        await registerNewTenant(data);
        setStep('success');
      } catch (err: any) {
        setError(err.message || 'Failed to create account. Please try again.');
        return;
      } finally {
        setIsLoading(false);
      }
    } else if (step === 'success') {
      onComplete(); // Skip payment and drop user into the app
    } else if (nextStep) {
      setStep(nextStep);
    }
  };

  const back = () => {
    if (isLoading) return;
    if (step === 'apps') { onCancel(); return; }
    if (step === 'business' && initialAppId) { onCancel(); return; }
    if (step === 'success' || step === 'payment' || step === 'pending') return; // no back on post-registration
    const all: Step[] = ['apps', 'business', 'account'];
    const idx = all.indexOf(step);
    if (idx > 0) setStep(all[idx - 1]);
  };

  const isFormStep = FORM_STEPS.includes(step);
  const formStepIndex = FORM_STEPS.indexOf(step); // 0, 1, 2 or -1

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* ── Header ── */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-slate-100 bg-white shrink-0">
        {isFormStep
          ? (
            <button 
              onClick={back} 
              disabled={isLoading}
              className="h-10 w-10 flex items-center justify-center -ml-2 text-slate-400 active:scale-90 transition-transform disabled:opacity-30"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )
          : <div className="w-10" />
        }

        <div className="flex flex-col items-center">
          <Logo className="h-5 w-5 mb-0.5" />
          {isFormStep && (
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              STEP {formStepIndex + 1} OF 3
            </span>
          )}
        </div>

        <div className="w-10" />
      </header>

      {/* ── Progress Bar (form steps only) ── */}
      {isFormStep && (
        <div className="h-1 bg-slate-100 w-full overflow-hidden shrink-0">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${((formStepIndex + 1) / 3) * 100}%` }}
          />
        </div>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div className="bg-destructive/10 border-b border-destructive/20 p-3 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-xs font-bold text-destructive leading-tight">{error}</p>
        </div>
      )}

      {/* ── Loading Overlay ── */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-[60] flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-slate-100 border-t-primary animate-spin" />
            <Loader2 className="h-6 w-6 text-primary absolute inset-0 m-auto animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-sm font-black uppercase tracking-widest text-slate-900">Setting up your shop</p>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Please do not close this window</p>
          </div>
        </div>
      )}

      {/* ── Step Content ── */}
      <div className={cn("flex-1 overflow-y-auto bg-slate-50/30", isLoading && "pointer-events-none opacity-50")}>
        {step === 'apps' && (
          <AppPickerStep
            selectedId={data.appId}
            onSelect={(id) => { update({ appId: id }); next(); }}
          />
        )}
        {step === 'business' && (
          <BusinessInfoStep
            data={data}
            onUpdate={update}
            onNext={next}
          />
        )}
        {step === 'account' && (
          <AccountStep
            data={data}
            onUpdate={update}
            onNext={next}
          />
        )}
        {step === 'success' && (
          <SuccessStep
            data={data}
            onProceed={next}
          />
        )}
        {step === 'payment' && (
          <PaymentStep
            data={data}
            onPaymentSent={next}
          />
        )}
        {step === 'pending' && (
          <PendingStep data={data} />
        )}
      </div>
    </div>
  );
}
