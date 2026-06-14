'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function ReferralCatcher() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const refCode = searchParams.get('ref');
    if (refCode && refCode.length >= 4 && refCode.length <= 7) {
      // Store the referral code in localStorage (case-insensitive conversion)
      localStorage.setItem('katuwang_ref', refCode.toUpperCase());
    }
  }, [searchParams]);

  return null;
}
