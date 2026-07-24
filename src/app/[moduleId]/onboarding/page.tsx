import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { isValidActiveModuleId, activeModules, getActiveAppById } from '@/lib/app-data';
import { OnboardingStartTracker } from '@/components/analytics/meta-events';

type Props = {
  params: Promise<{ moduleId: string }>;
};

export async function generateStaticParams() {
  return activeModules.map((module) => ({
    moduleId: module.id,
  }));
}

export default async function DedicatedModuleOnboardingPage({ params }: Props) {
  const resolvedParams = await params;
  const moduleId = resolvedParams.moduleId;

  if (!isValidActiveModuleId(moduleId)) {
    notFound();
  }

  const selectedModule = getActiveAppById(moduleId);

  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-slate-100 border-t-cyan-500 animate-spin" />
      </div>
    }>
      <div className="min-h-screen w-full relative">
        <OnboardingStartTracker
          moduleId={moduleId}
          moduleName={selectedModule?.name}
        />
        <OnboardingWizard initialAppId={moduleId} />
      </div>
    </Suspense>
  );
}
