'use client';

import React, { useState } from 'react';
import { ChevronLeft, WifiOff, BookOpen } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useTenant } from '@/app/lib/tenant-context';
import { getModuleTheme } from '@/lib/theme-utils';
import { ModuleGuide } from '@/components/common/module-guide';
import { AppMarketplace } from '@/components/dashboard/app-marketplace';
import { Grid } from 'lucide-react';
import { useHaptic } from '@/hooks/use-haptic';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export function AppHeader({ title, subtitle, onBack, rightAction }: AppHeaderProps) {
  const isOnline = useOnlineStatus();
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  const [showGuide, setShowGuide] = useState(false);
  const [showApps, setShowApps] = useState(false);
  const haptic = useHaptic();

  return (
    <header
      className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-xl border-b border-slate-100 transition-colors duration-300"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center h-12 px-6 gap-3">
        {/* Back button */}
        {onBack && (
          <button
            onClick={() => {
              haptic(15);
              onBack();
            }}
            className="h-11 w-11 rounded-xl flex items-center justify-center -ml-2 active:bg-slate-100 transition-colors active:scale-95 border-none cursor-pointer"
          >
            <ChevronLeft className="h-6 w-6 text-slate-700" strokeWidth={2.5} />
          </button>
        )}

        <BrandLogo className="flex-shrink-0 animate-in fade-in" showText={false} />

        {/* Title block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-black text-slate-900 tracking-tight truncate">{title}</h1>
            
            {/* Real-time Network Connection Pill */}
            {isOnline ? (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            ) : (
              <span className="flex items-center gap-0.5 bg-amber-500 text-white font-black text-[7px] px-1.5 py-0.5 rounded-full tracking-widest uppercase animate-pulse shadow-sm shadow-amber-500/20 select-none">
                <WifiOff className="h-2 w-2" /> Offline
              </span>
            )}

            {/* Quick Gabay / Guide Help Capsule Button */}
            {currentTenant && (
              <>
                <button
                  onClick={() => setShowApps(true)}
                  className="h-5 px-2 rounded-full flex items-center justify-center gap-0.5 text-[8px] font-black uppercase tracking-wider transition-all duration-300 hover:scale-105 active:scale-95 border-none cursor-pointer select-none"
                  style={{ 
                    backgroundColor: `${theme.primary}12`, 
                    color: theme.primary 
                  }}
                >
                  <Grid className="h-2.5 w-2.5" /> + App
                </button>
                <button
                  onClick={() => setShowGuide(true)}
                  className="h-5 px-2 rounded-full flex items-center justify-center gap-0.5 text-[8px] font-black uppercase tracking-wider transition-all duration-300 hover:scale-105 active:scale-95 border-none cursor-pointer select-none"
                  style={{ 
                    backgroundColor: `${theme.primary}12`, 
                    color: theme.primary 
                  }}
                >
                  <BookOpen className="h-2.5 w-2.5" /> Gabay
                </button>
              </>
            )}
          </div>
          {subtitle && (
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest -mt-0.5 truncate">{subtitle}</p>
          )}
        </div>

        {/* Right action slot */}
        {rightAction && <div className="flex-shrink-0">{rightAction}</div>}
      </div>

      {/* Slide-down Premium Help Overlay Sheet */}
      <ModuleGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />
      
      {/* App Marketplace Overlay */}
      <AppMarketplace isOpen={showApps} onClose={() => setShowApps(false)} />
    </header>
  );
}
