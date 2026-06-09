'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';

export function FloatingCta() {
  const { open, openSheet, closeSheet } = useRegisterSheet();

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
        {/* Frosted glass bar */}
        <div className="pointer-events-auto bg-white/80 backdrop-blur-xl border-t border-slate-200/60 px-4 pt-3 pb-safe" style={{ paddingBottom: `calc(12px + env(safe-area-inset-bottom, 0px))` }}>
          <button
            onClick={openSheet}
            className="w-full h-14 rounded-2xl bg-primary text-white font-bold text-base flex items-center justify-between px-5 active:scale-[0.97] transition-transform shadow-xl shadow-primary/30"
          >
            <div className="flex flex-col items-start">
              <span className="leading-tight tracking-tight">Register Now</span>
              <span className="text-[10px] text-white/70 font-medium tracking-wide">No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-[10px] line-through text-white/50 leading-none">₱199</div>
                <div className="text-sm font-black text-secondary leading-none">₱99/mo</div>
              </div>
              <div className="h-8 w-8 rounded-xl bg-white/20 flex items-center justify-center">
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </button>
        </div>
      </div>

      <RegisterSheet open={open} onClose={closeSheet} />
    </>
  );
}
