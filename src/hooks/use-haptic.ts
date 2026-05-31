'use client';

import { useCallback } from 'react';

export function useHaptic() {
  const triggerHaptic = useCallback((pattern: number | number[] = 10) => {
    if (typeof window !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Ignore, some browsers might block it
      }
    }
  }, []);

  return triggerHaptic;
}
