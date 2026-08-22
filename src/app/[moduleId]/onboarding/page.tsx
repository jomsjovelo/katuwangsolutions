import React, { Suspense } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { isValidActiveModuleId, activeModules, getActiveAppById, normalizeModuleId } from '@/lib/app-data';
import { OnboardingStartTracker } from '@/components/analytics/meta-events';

import { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

type Props = {
  params: Promise<{ moduleId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateStaticParams() {
  return activeModules.map((module) => ({
    moduleId: module.id,
  }));
}

export default async function DedicatedModuleOnboardingPage({ params, searchParams }: Props) {
  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) || {};
  const rawId = resolvedParams.moduleId;
  const canonicalId = normalizeModuleId(rawId);

  if (rawId !== canonicalId && isValidActiveModuleId(canonicalId)) {
    const urlParams = new URLSearchParams();
    if (resolvedSearchParams && typeof resolvedSearchParams === 'object') {
      Object.entries(resolvedSearchParams).forEach(([key, val]) => {
        if (typeof val === 'string') urlParams.set(key, val);
        else if (Array.isArray(val)) val.forEach(v => urlParams.append(key, v));
      });
    }
    if (rawId === 'fresh-tally' && !urlParams.has('profile')) {
      urlParams.set('profile', 'fresh-goods');
    } else if (rawId === 'build-stack' && !urlParams.has('profile')) {
      urlParams.set('profile', 'hardware-supplies');
    }
    const queryString = urlParams.toString();
    permanentRedirect(`/${canonicalId}/onboarding${queryString ? `?${queryString}` : ''}`);
  }

  if (!isValidActiveModuleId(rawId)) {
    notFound();
  }

  const selectedModule = getActiveAppById(rawId);

  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-slate-100 border-t-cyan-500 animate-spin" />
      </div>
    }>
      <div className="min-h-screen w-full relative">
        <OnboardingStartTracker
          moduleId={rawId}
          moduleName={selectedModule?.name}
        />
        <OnboardingWizard initialAppId={rawId} />
      </div>
    </Suspense>
  );
}
