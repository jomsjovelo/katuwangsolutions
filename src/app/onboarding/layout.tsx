import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
