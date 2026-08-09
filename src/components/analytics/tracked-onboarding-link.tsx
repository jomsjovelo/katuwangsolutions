'use client';

import React from 'react';
import Link, { LinkProps } from 'next/link';
import { CtaSource, trackRegistrationIntent } from '@/lib/conversion-events';
import { updateAcquisitionCtaSource } from '@/lib/conversion-attribution';

interface TrackedOnboardingLinkProps extends LinkProps {
  children: React.ReactNode;
  className?: string;
  ctaSource: CtaSource;
  moduleId?: string;
  id?: string;
  'aria-label'?: string;
}

export function TrackedOnboardingLink({
  children,
  ctaSource,
  moduleId,
  onClick,
  ...props
}: TrackedOnboardingLinkProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    trackRegistrationIntent(ctaSource, moduleId);
    updateAcquisitionCtaSource(ctaSource);
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <Link {...props} onClick={handleClick}>
      {children}
    </Link>
  );
}
