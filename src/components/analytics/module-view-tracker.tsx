'use client';

import { useEffect } from 'react';
import { trackViewContent } from '@/lib/meta-pixel';

export function ModuleViewTracker({
  moduleId,
  moduleName,
  category,
  price,
}: {
  moduleId: string;
  moduleName: string;
  category?: string;
  price?: number;
}) {
  useEffect(() => {
    trackViewContent({
      moduleId,
      moduleName,
      category,
      price,
    });
  }, [moduleId, moduleName, category, price]);

  return null;
}
