'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { captureFirstTouchAcquisition } from '@/lib/conversion-attribution';

export function AcquisitionCatcher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname) {
      captureFirstTouchAcquisition(searchParams, pathname);
    }
  }, [pathname, searchParams]);

  return null;
}
