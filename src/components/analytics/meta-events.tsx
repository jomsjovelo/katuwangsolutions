'use client';

import { useEffect, useRef } from 'react';
import { trackMetaEvent } from '@/lib/meta-pixel';

type ModuleEventProps = {
  moduleId: string;
  moduleName?: string;
  moduleCategory?: string;
};

export function ModuleViewTracker({
  moduleId,
  moduleName,
  moduleCategory,
}: ModuleEventProps) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    trackMetaEvent('ViewContent', {
      content_ids: [moduleId],
      content_name: moduleName || moduleId,
      content_category: moduleCategory,
      content_type: 'product',
    });
  }, [moduleCategory, moduleId, moduleName]);

  return null;
}

export function OnboardingStartTracker({
  moduleId,
  moduleName,
}: Omit<ModuleEventProps, 'moduleCategory'>) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    trackMetaEvent('InitiateCheckout', {
      content_ids: [moduleId],
      content_name: moduleName || moduleId,
      content_type: 'product',
    });
  }, [moduleId, moduleName]);

  return null;
}
