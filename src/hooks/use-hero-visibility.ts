'use client';

import { useState, useEffect } from 'react';

export function useHeroVisibility(heroId: string = 'homepage-hero'): boolean {
  const [isHeroVisible, setIsHeroVisible] = useState<boolean>(true);

  useEffect(() => {
    const heroEl = document.getElementById(heroId);
    if (!heroEl) {
      setIsHeroVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsHeroVisible(entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0,
      }
    );

    observer.observe(heroEl);

    return () => {
      observer.disconnect();
    };
  }, [heroId]);

  return isHeroVisible;
}
