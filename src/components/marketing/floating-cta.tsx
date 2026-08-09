'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';
import { useHeroVisibility } from '@/hooks/use-hero-visibility';

export function FloatingCta() {
  const { open, openSheet, closeSheet } = useRegisterSheet();
  const [isOverlayActive, setIsOverlayActive] = React.useState(false);
  const isHeroVisible = useHeroVisibility('homepage-hero');

  React.useEffect(() => {
    const checkOverlay = () => {
      const isCustomOverlay = document.body.getAttribute('data-overlay-open') === 'true';
      const isRadixDialogOpen = document.querySelector('[role="dialog"]') !== null;
      setIsOverlayActive(isCustomOverlay || isRadixDialogOpen);
    };
    checkOverlay();
    const observer = new MutationObserver(checkOverlay);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (open || isOverlayActive || isHeroVisible) {
    return <RegisterSheet open={open} onClose={closeSheet} ctaSource="floating_bar" />;
  }

  return (
    <>
      <div id="floating-registration-bar" className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
        {/* Frosted glass bar */}
        <div className="pointer-events-auto bg-white/80 backdrop-blur-xl border-t border-slate-200/60 px-4 pt-3 pb-safe" style={{ paddingBottom: `calc(12px + env(safe-area-inset-bottom, 0px))` }}>
          <button
            data-testid="floating-register-cta"
            onClick={openSheet}
            className="w-full h-14 rounded-2xl bg-primary text-white font-bold text-base flex items-center justify-between px-5 active:scale-[0.97] transition-transform motion-reduce:transition-none motion-reduce:transform-none shadow-xl shadow-primary/30 min-h-[44px]"
          >
            <div className="flex flex-col items-start">
              <span className="leading-tight tracking-tight">Mag-register</span>
              <span className="text-xs text-white/80 font-medium tracking-wide">Walang credit card</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-xs font-black text-secondary leading-none">Promo ₱50–₱99/mo</div>
                <div className="text-xs text-white/80 leading-tight mt-0.5">(reg ₱100–₱199/mo) bawat module</div>
              </div>
              <div className="h-8 w-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </button>
        </div>
      </div>

      <RegisterSheet open={open} onClose={closeSheet} ctaSource="floating_bar" />
    </>
  );
}
