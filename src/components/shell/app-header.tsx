'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, WifiOff, BookOpen, Clock } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { useTenant } from '@/app/lib/tenant-context';
import { getModuleTheme } from '@/lib/theme-utils';
import { ModuleGuide } from '@/components/common/module-guide';
import { AppMarketplace } from '@/components/dashboard/app-marketplace';
import { Grid } from 'lucide-react';
import { useHaptic } from '@/hooks/use-haptic';
import { TimeInOutModal } from '@/components/shell/time-in-out-modal';
import { useAnnouncements } from '@/hooks/use-announcements';
import { AlertTriangle, Info, CheckCircle2, XCircle, Megaphone } from 'lucide-react';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export function AppHeader({ title, subtitle, onBack, rightAction }: AppHeaderProps) {
  const { currentTenant, allTenants, setCurrentTenant } = useTenant();
  const { isOnline, isSyncing, pendingCount, syncMessage } = useSyncStatus(currentTenant?.id);
  const theme = getModuleTheme(currentTenant?.moduleType);
  const [showGuide, setShowGuide] = useState(false);
  const [showApps, setShowApps] = useState(false);
  const [showTimeLog, setShowTimeLog] = useState(false);
  const haptic = useHaptic();
  const { announcements } = useAnnouncements(true); // only fetch active

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingCount > 0) {
        e.preventDefault();
        e.returnValue = ''; // Standard required for Chrome/modern browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pendingCount]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
      case 'error': return <XCircle className="h-4 w-4 shrink-0 text-white" />;
      case 'success': return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
      default: return <Info className="h-4 w-4 shrink-0 text-primary" />;
    }
  };

  return (
    <>
    {announcements.length > 0 && (
      <div className="w-full flex flex-col">
        {announcements.map((ann, i) => (
          <div key={i} className={`px-4 py-2 flex items-start gap-2 text-xs sm:text-sm shadow-sm ${
            ann.type === 'error' ? 'bg-destructive text-white font-medium' :
            ann.type === 'warning' ? 'bg-amber-100 text-amber-900 border-b border-amber-200' :
            ann.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' :
            'bg-slate-100 text-slate-700 border-b border-slate-200'
          }`}>
            <div className="mt-0.5">{getIcon(ann.type)}</div>
            <div className="flex-1">
              <span className="font-bold uppercase tracking-wider text-[10px] sm:text-xs block mb-0.5 opacity-80">{ann.title}</span>
              <span className="leading-tight">{ann.message}</span>
            </div>
          </div>
        ))}
      </div>
    )}
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
            {!isOnline || isSyncing ? (
              <div 
                className="flex items-center gap-1.5 bg-amber-500/10 text-amber-600 font-bold text-[9px] px-2 py-0.5 rounded-full tracking-wide select-none"
                title={syncMessage}
              >
                {!isOnline ? (
                  <WifiOff className="h-2.5 w-2.5" />
                ) : (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                )}
                {isSyncing ? `Syncing (${pendingCount})` : `Offline (${pendingCount})`}
              </div>
            ) : (
              <span className="flex h-2 w-2 relative" title={syncMessage}>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              </span>
            )}

            {/* Branch Switcher Native Select (Enterprise Feature) */}
            {currentTenant && allTenants && (
              (() => {
                const groupId = currentTenant.parentTenantId || currentTenant.id;
                const branches = allTenants.filter(t => (t.parentTenantId || t.id) === groupId);
                if (branches.length > 1) {
                  return (
                    <div className="relative inline-flex">
                      <select 
                        value={currentTenant.id}
                        onChange={(e) => {
                          const target = branches.find(b => b.id === e.target.value);
                          if (target) setCurrentTenant(target);
                        }}
                        className="appearance-none bg-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-700 py-1 pl-2.5 pr-6 rounded-full border-none outline-none focus:ring-2 focus:ring-slate-300"
                        title="Switch Branch"
                      >
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.branchName || b.name}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  );
                }
                return null;
              })()
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
                  <Grid className="h-2.5 w-2.5" /> APP MARKET PLACE
                </button>
                <button
                  onClick={() => setShowGuide(true)}
                  className="h-5 px-2 rounded-full flex items-center justify-center gap-0.5 text-[8px] font-black uppercase tracking-wider transition-all duration-300 hover:scale-105 active:scale-95 border-none cursor-pointer select-none"
                  style={{ 
                    backgroundColor: `${theme.primary}12`, 
                    color: theme.primary 
                  }}
                >
                  <BookOpen className="h-2.5 w-2.5" /> HELP
                </button>
                <button
                  onClick={() => { haptic(10); setShowTimeLog(true); }}
                  className="h-5 px-2 rounded-full flex items-center justify-center gap-0.5 text-[8px] font-black uppercase tracking-wider transition-all duration-300 hover:scale-105 active:scale-95 border-none cursor-pointer select-none bg-slate-100 text-slate-600"
                >
                  <Clock className="h-2.5 w-2.5" /> TIME LOG
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
    </header>

    {/* Slide-down Premium Help Overlay Sheet */}
    <ModuleGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />
    
    {/* App Marketplace Overlay */}
    <AppMarketplace isOpen={showApps} onClose={() => setShowApps(false)} />

    {/* Staff Time-In/Out Modal */}
    <TimeInOutModal isOpen={showTimeLog} onClose={() => setShowTimeLog(false)} />
    </>
  );
}
