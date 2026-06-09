'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

function OnboardingContent() {
  const searchParams = useSearchParams();
  const appId = searchParams.get('app') ?? '';
  return <OnboardingWizard initialAppId={appId} />;
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-slate-100 border-t-cyan-500 animate-spin" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}
