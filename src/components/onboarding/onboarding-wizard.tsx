"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '@/components/ui/logo';
import { ChevronLeft } from 'lucide-react';
import { ModeSelectionStep } from './steps/mode-selection';
import { AppPickerStep } from './steps/app-picker';
import { BusinessInfoStep } from './steps/business-info';
import { AccountStep } from './steps/account';
import { SuccessStep } from './steps/success';
import { PaymentStep } from './steps/payment';
import { PendingStep } from './steps/pending';

import { registerNewTenant } from '@/firebase/firestore/onboarding-actions';
import { AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

import { normalizeModuleId, isValidActiveModuleId, normalizeBentaBusinessProfile } from '@/lib/app-data';
import { trackMetaEvent, type MetaEventParameters } from '@/lib/meta-pixel';

import { trackOnboardingStageView } from '@/lib/conversion-events';
import { getStoredAcquisitionSnapshot } from '@/lib/conversion-attribution';

export type OnboardingStep = 'mode' | 'apps' | 'business' | 'account' | 'success' | 'payment' | 'pending';

const FORM_STEPS: OnboardingStep[] = ['apps', 'business', 'account'];
const JOURNEY_STEPS: OnboardingStep[] = ['mode', 'apps', 'business', 'account', 'payment', 'pending', 'success'];

interface OnboardingWizardProps {
  initialAppId?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

interface RegistrationCompletionInput {
  data: any;
  referredBy: string | null;
  acquisition: ReturnType<typeof getStoredAcquisitionSnapshot>;
  moveToPayment: (emailDeliveryFailed?: boolean) => void;
}

interface RegistrationCompletionDependencies {
  registerTenant?: typeof registerNewTenant;
  trackCompleteRegistration?: (payload: MetaEventParameters) => void;
}

export function getNextOnboardingStep(step: OnboardingStep): OnboardingStep | undefined {
  return JOURNEY_STEPS[JOURNEY_STEPS.indexOf(step) + 1];
}

export function getVerificationStepAfterPayment(): OnboardingStep {
  return getNextOnboardingStep('payment') ?? 'pending';
}

export async function completeRegistrationAndAdvance(
  input: RegistrationCompletionInput,
  dependencies: RegistrationCompletionDependencies = {}
) {
  const registerTenant = dependencies.registerTenant ?? registerNewTenant;
  const trackCompleteRegistration = dependencies.trackCompleteRegistration ?? ((payload) => {
    trackMetaEvent('CompleteRegistration', payload);
  });

  const res = await registerTenant({ ...input.data, referredBy: input.referredBy, acquisition: input.acquisition });
  trackCompleteRegistration({
    content_ids: [input.data.appId],
    content_name: input.data.appId === 'budget-mo' ? 'Budget Mo' : input.data.appId,
    content_type: 'product',
  });
  input.moveToPayment(res?.emailDeliveryFailed);
}

export function OnboardingWizard({ initialAppId: initialAppIdProp, onComplete, onCancel }: OnboardingWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trackerSetRef = useRef<Set<string>>(new Set());

  const rawAppId = initialAppIdProp ?? searchParams.get('app') ?? '';
  const normalizedAppId = normalizeModuleId(rawAppId);

  const rawProfileParam = searchParams.get('profile') || searchParams.get('businessProfile') || '';
  const initialProfile = rawProfileParam
    ? normalizeBentaBusinessProfile(rawProfileParam)
    : (rawAppId === 'fresh-tally' ? 'fresh_goods' : (rawAppId === 'build-stack' ? 'hardware_supply' : 'general_retail'));

  let resolvedAppId = '';
  let initialStep: OnboardingStep = 'mode';
  let initialError: string | null = null;

  if (rawAppId) {
    if (isValidActiveModuleId(normalizedAppId)) {
      resolvedAppId = normalizedAppId;
      initialStep = 'business';
    } else {
      initialStep = 'apps';
      if (normalizedAppId === 'farm-master') {
        initialError = 'Ang napiling module ay kasalukuyang hindi magagamit. Mangyaring pumili ng ibang module.';
      }
    }
  }

  const handleComplete = onComplete ?? (() => router.push('/dashboard'));
  const handleCancel = onCancel ?? (() => router.push('/'));
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [data, setData] = useState({
    // Business / Personal Ledger Name
    appId: resolvedAppId,
    businessProfile: resolvedAppId === 'benta-snap' ? initialProfile : undefined,
    businessName: resolvedAppId === 'budget-mo' ? 'Aking Personal Budget' : '',
    businessPhone: '',
    // Personal
    fullName: '',
    birthday: '',
    gender: 'Prefer not to say',
    address: '',
    personalPhone: '',
    // Credentials
    email: '',
    confirmEmail: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
  });

  const update = (patch: Partial<typeof data>) => setData((d) => ({ ...d, ...patch }));
  const [isRecovered, setIsRecovered] = useState(false);
  const [emailDeliveryFailed, setEmailDeliveryFailed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('katuwang_onboarding_draft');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.step && parsed.data) {
          const updatedData = { ...parsed.data };
          let updatedStep = parsed.step;
          let draftError: string | null = null;
          const rawSavedAppId = (parsed.data.appId || '').toLowerCase();
          const draftAppId = normalizeModuleId(rawSavedAppId);

          if (draftAppId === 'farm-master') {
            updatedData.appId = '';
            updatedStep = 'apps';
            draftError = 'Ang napiling module ay kasalukuyang hindi magagamit. Mangyaring pumili ng ibang module.';
          } else if (draftAppId && !isValidActiveModuleId(draftAppId)) {
            updatedData.appId = '';
            updatedStep = 'apps';
          } else {
            updatedData.appId = draftAppId;
            if (rawSavedAppId === 'fresh-tally' && !updatedData.businessProfile) {
              updatedData.businessProfile = 'fresh_goods';
            } else if (rawSavedAppId === 'build-stack' && !updatedData.businessProfile) {
              updatedData.businessProfile = 'hardware_supply';
            } else if (updatedData.businessProfile) {
              updatedData.businessProfile = normalizeBentaBusinessProfile(updatedData.businessProfile);
            }
          }

          if (['payment', 'pending', 'success'].includes(updatedStep)) {
            setIsRecovered(true);
            setStep(updatedStep);
            setData((current) => ({ ...current, ...updatedData }));
            return;
          }

          if (resolvedAppId) {
            updatedData.appId = resolvedAppId;
            if (resolvedAppId === 'benta-snap') {
              if (rawProfileParam) {
                updatedData.businessProfile = normalizeBentaBusinessProfile(rawProfileParam);
              } else if (!updatedData.businessProfile) {
                updatedData.businessProfile = initialProfile;
              }
            }
            if (updatedStep === 'apps' || updatedStep === 'mode' || !updatedData.appId) {
              updatedStep = 'business';
            }
          }

          setStep(updatedStep);
          setData((current) => ({ ...current, ...updatedData }));
          if (draftError) setError(draftError);
        }
      } catch {
        // Ignore malformed legacy drafts safely.
      }
    } else if (resolvedAppId) {
      setStep('business');
      setData((current) => ({ ...current, appId: resolvedAppId }));
    }
    setIsRecovered(true);
  }, [resolvedAppId]);

  useEffect(() => {
    if (!isRecovered) return;
    if (['payment', 'pending', 'success'].includes(step)) {
      localStorage.removeItem('katuwang_onboarding_draft');
    } else {
      localStorage.setItem('katuwang_onboarding_draft', JSON.stringify({ step, data }));
    }
  }, [step, data, isRecovered]);

  useEffect(() => {
    if (!isRecovered) return;
    if (data.appId) {
      if (step === 'business' || step === 'account') {
        trackOnboardingStageView(data.appId, 'account_setup', trackerSetRef.current);
      } else if (step === 'payment') {
        trackOnboardingStageView(data.appId, 'payment', trackerSetRef.current);
      } else if (step === 'pending') {
        trackOnboardingStageView(data.appId, 'verification', trackerSetRef.current);
      }
    }
  }, [step, data.appId, isRecovered]);

  const next = async () => {
    setError(null);
    const nextStep = getNextOnboardingStep(step);

    if (step === 'account') {
      setIsLoading(true);
      try {
        const referredBy = typeof window !== 'undefined' ? localStorage.getItem('katuwang_ref') : null;
        const acquisition = getStoredAcquisitionSnapshot();
        await completeRegistrationAndAdvance({
          data,
          referredBy,
          acquisition,
          moveToPayment: (failed) => {
            if (failed) setEmailDeliveryFailed(true);
            setStep('payment');
          },
        });
      } catch (cause) {
        const err = cause as Error & { code?: string };
        setError(err.message || 'Failed to create account. Please try again.');
        return;
      } finally {
        setIsLoading(false);
      }
    } else if (step === 'success') {
      handleComplete();
    } else if (nextStep) {
      setStep(nextStep);
    }
  };

  const back = () => {
    if (isLoading) return;
    if (step === 'mode') { handleCancel(); return; }
    if (step === 'apps') { setStep('mode'); return; }
    if (step === 'business' && resolvedAppId) { handleCancel(); return; }
    if (step === 'success' || step === 'payment' || step === 'pending') return;
    const all: OnboardingStep[] = ['apps', 'business', 'account'];
    const index = all.indexOf(step);
    if (index > 0) setStep(all[index - 1]);
  };

  const isFormStep = FORM_STEPS.includes(step);
  const showsJourneyProgress = isFormStep || step === 'payment' || step === 'pending';

  const getJourneyLabel = () => {
    if (step === 'business' || step === 'account' || step === 'apps') {
      return 'ACCOUNT SETUP · HAKBANG 1 SA 4';
    }
    if (step === 'payment') {
      return 'PAYMENT · HAKBANG 2 SA 4';
    }
    if (step === 'pending') {
      return 'PAYMENT VERIFICATION · HAKBANG 3 SA 4';
    }
    return '';
  };

  const getProgressPercentage = () => {
    if (step === 'apps' || step === 'business' || step === 'account') return 25;
    if (step === 'payment') return 50;
    if (step === 'pending') return 75;
    return 0;
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* ── Header ── */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-slate-100 bg-white shrink-0">
        {FORM_STEPS.includes(step) ? (
          <button
            onClick={back}
            disabled={isLoading}
            aria-label="Bumalik sa nakaraang hakbang"
            className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2 text-slate-400 active:scale-90 transition-transform disabled:opacity-30"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : (
          <div className="w-11" />
        )}

        <div className="flex flex-col items-center">
          <Logo className="h-5 w-5 mb-0.5" />
          {showsJourneyProgress && (
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              {getJourneyLabel()}
            </span>
          )}
        </div>

        <div className="w-11" />
      </header>

      {/* ── Progress Bar ── */}
      {showsJourneyProgress && (
        <div className="h-1 bg-slate-100 w-full overflow-hidden shrink-0">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${getProgressPercentage()}%` }}
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

      {/* ── Content ── */}
      <div className={cn("flex-1 overflow-y-auto bg-slate-50/30", isLoading && "pointer-events-none opacity-50")}>
        {step === 'mode' && (
          <ModeSelectionStep
            onSelectStartBusiness={() => setStep('apps')}
          />
        )}

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
            isLoading={isLoading}
          />
        )}

        {step === 'account' && (
          <AccountStep
            data={data}
            onUpdate={update}
            onNext={next}
            isLoading={isLoading}
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
            emailDeliveryFailed={emailDeliveryFailed}
            onPaymentSent={() => setStep(getVerificationStepAfterPayment())}
            trackerSet={trackerSetRef.current}
          />
        )}

        {step === 'pending' && (
          <PendingStep data={data} />
        )}
      </div>
    </div>
  );
}

export default OnboardingWizard;
