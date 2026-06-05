import React from 'react';
import dynamic from 'next/dynamic';

const OnboardingWizard = dynamic(() => import('@/components/onboarding/onboarding-wizard').then(mod => mod.OnboardingWizard));

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <OnboardingWizard />
    </div>
  );
}
