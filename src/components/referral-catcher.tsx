'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function ReferralCatcher() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const refCode = searchParams.get('ref');
    if (refCode && refCode.length === 4) {
      // Store the 4-character referral code in localStorage
      localStorage.setItem('katuwang_ref', refCode.toUpperCase());
    }
  }, [searchParams]);

  return null;
}
