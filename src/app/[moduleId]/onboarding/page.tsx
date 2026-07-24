'use client';

import React, { Suspense, use } from 'react';
import { notFound } from 'next/navigation';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { isValidActiveModuleId, activeModules } from '@/lib/app-data';

type Props = {
  params: Promise<{ moduleId: string }>;
};

function OnboardingContent({ moduleId }: { moduleId: string }) {
  if (!isValidActiveModuleId(moduleId)) {
    notFound();
  }

  return (
    <div className="min-h-screen w-full relative">
      <OnboardingWizard initialAppId={moduleId} />
    </div>
  );
}

export default function DedicatedModuleOnboardingPage({ params }: Props) {
  const resolvedParams = use(params);
  const moduleId = resolvedParams.moduleId;

  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-slate-100 border-t-cyan-500 animate-spin" />
      </div>
    }>
      <OnboardingContent moduleId={moduleId} />
    </Suspense>
  );
}
