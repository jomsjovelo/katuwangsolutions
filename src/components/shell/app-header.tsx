'use client';

import React from 'react';
import { ChevronLeft } from 'lucide-react';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export function AppHeader({ title, subtitle, onBack, rightAction }: AppHeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-100"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center h-12 px-4 gap-3">
        {/* Back button */}
        {onBack && (
          <button
            onClick={onBack}
            className="h-9 w-9 rounded-xl flex items-center justify-center -ml-1 active:bg-slate-100 transition-colors active:scale-95"
          >
            <ChevronLeft className="h-5 w-5 text-slate-700" strokeWidth={2.5} />
          </button>
        )}

        {/* Title block */}
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-black text-slate-900 tracking-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest -mt-0.5 truncate">{subtitle}</p>
          )}
        </div>

        {/* Right action slot */}
        {rightAction && <div className="flex-shrink-0">{rightAction}</div>}
      </div>
    </header>
  );
}
