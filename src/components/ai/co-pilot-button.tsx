'use client';

import React, { useState, useEffect } from 'react';
import { useAIAdvisor } from '@/hooks/use-ai-advisor';
import { useTenant } from '@/app/lib/tenant-context';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetDescription 
} from "@/components/ui/sheet";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getModuleTheme } from '@/lib/theme-utils';
import { 
  Sparkles, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Lightbulb, 
  TrendingUp, 
  HelpCircle,
  Network
} from 'lucide-react';

export function CoPilotButton() {
  const { currentTenant } = useTenant();
  const { 
    advice, 
    keyAlerts, 
    actionSteps, 
    isLoading, 
    error, 
    askAdvisor, 
    clearCache 
  } = useAIAdvisor();

  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !currentTenant) return null;

  const theme = getModuleTheme(currentTenant.moduleType);

  const handleOpenSheet = () => {
    setIsOpen(true);
    // Request advisor analysis automatically on open if not already loaded in cache
    askAdvisor(false);
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    askAdvisor(true);
  };

  return (
    <>
      {/* Immersive Floating Co-Pilot Action Button */}
      <button
        onClick={handleOpenSheet}
        className={cn(
          "fixed bottom-24 right-4 z-40 lg:bottom-6 lg:right-6",
          "h-14 w-14 rounded-full flex items-center justify-center shadow-2xl",
          "border border-white/25 backdrop-blur-md transition-all duration-300 active:scale-90 select-none",
          "animate-pulse"
        )}
        style={{
          backgroundColor: '#1A4645', // Deep Teal base
          boxShadow: `0 12px 24px -4px ${theme.primary}50, inset 0 1px 0 0 rgba(255,255,255,0.25)`,
          border: `2px solid ${theme.secondary}`, // Vibrant Orange border glow
        }}
      >
        <Sparkles className="h-6 w-6" style={{ color: theme.secondary }} />
      </button>

      {/* Slide-Up Advisor Drawer Sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent 
          side="bottom" 
          className="rounded-t-[32px] p-6 max-h-[85vh] overflow-y-auto border-t-2 border-slate-200"
          style={{ backgroundColor: '#051821', color: '#ffffff' }} // Theme Navy Base
        >
          <SheetHeader className="flex flex-row justify-between items-start border-b border-white/10 pb-4 mb-4">
            <div className="flex items-center gap-3">
              {/* Glowing Pulse Avatar for Katuwang AI */}
              <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: theme.primary }}>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-2xl opacity-35" style={{ backgroundColor: theme.primary }}></span>
                <Sparkles className="h-5 w-5 text-slate-900" />
              </div>
              <div>
                <SheetTitle className="font-headline font-black text-lg text-white flex items-center gap-2">
                  Katuwang AI
                </SheetTitle>
                <SheetDescription className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Ang iyong AI Business Co-Pilot
                </SheetDescription>
              </div>
            </div>

            {advice && !isLoading && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="text-xs font-bold gap-1 text-slate-400 hover:text-white hover:bg-white/10 px-3 h-8 mr-6 rounded-xl"
              >
                <RefreshCw className="h-3 w-3" /> Pindutin para i-sync
              </Button>
            )}
          </SheetHeader>

          {/* Assistant Viewport Content */}
          <div className="space-y-5 py-2">
            
            {isLoading ? (
              /* High-Energy Premium Loading Skeleton */
              <div className="space-y-4 py-6 animate-pulse">
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                  <RefreshCw className="h-4 w-4 animate-spin" style={{ color: theme.secondary }} />
                  Kinakalkula ang advice...
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-white/10 rounded-full w-full"></div>
                  <div className="h-3 bg-white/10 rounded-full w-5/6"></div>
                  <div className="h-3 bg-white/10 rounded-full w-4/5"></div>
                </div>
                <div className="border border-white/5 rounded-2xl p-4 bg-white/5 space-y-3">
                  <div className="h-2 w-16 bg-white/10 rounded-full"></div>
                  <div className="h-6 bg-white/10 rounded-xl w-full"></div>
                  <div className="h-6 bg-white/10 rounded-xl w-3/4"></div>
                </div>
              </div>
            ) : error ? (
              /* Connection Error Alerts */
              <div className="border border-red-500/30 bg-red-950/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                  <AlertTriangle className="h-4 w-4" />
                  Paalala mula sa Katuwang
                </div>
                <p className="text-xs text-red-200/90 leading-relaxed font-semibold">
                  {error}
                </p>
                {error.includes("offline") && (
                  <div className="flex justify-end pt-1">
                    <Button 
                      onClick={() => setIsOpen(false)}
                      size="sm"
                      className="bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider"
                    >
                      Saraduhan
                    </Button>
                  </div>
                )}
              </div>
            ) : advice ? (
              /* Beautiful Structured Advice Content */
              <div className="space-y-5 animate-in fade-in duration-300">
                
                {/* 1. Main Tagalog Insight Paragraph */}
                <div 
                  className="rounded-2xl p-4 border border-white/10 text-xs leading-relaxed font-medium text-slate-100 shadow-inner relative overflow-hidden"
                  style={{ backgroundColor: 'rgba(26,70,69,0.15)' }} // Subtle teal tint
                >
                  <div className="absolute right-0 top-0 opacity-[0.03] transform translate-x-2 -translate-y-2">
                    <Lightbulb className="h-32 w-32" />
                  </div>
                  <p>{advice}</p>
                </div>

                {/* 2. Critical Inventory Warnings */}
                {keyAlerts.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mga Babala sa Stock</span>
                    <div className="grid gap-2">
                      {keyAlerts.map((alert, idx) => (
                        <div key={idx} className="flex gap-2.5 items-start bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-200">
                          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          <span className="font-semibold leading-relaxed">{alert}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Operational Action Steps Checklist */}
                {actionSteps.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mga Hakbang na Dapat Gawin</span>
                    <div className="grid gap-2">
                      {actionSteps.map((step, idx) => (
                        <div 
                          key={idx} 
                          className="flex gap-3 items-center bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] transition-all hover:bg-white/10 active:scale-[0.99] cursor-pointer"
                        >
                          <div 
                            className="h-5 w-5 rounded-lg flex items-center justify-center font-headline font-black text-[10px]"
                            style={{ backgroundColor: theme.primary, color: '#051821' }}
                          >
                            {idx + 1}
                          </div>
                          <span className="font-semibold text-slate-200 leading-normal">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              /* Fallback view when advisor sheet first triggers before cache gets synced */
              <div className="text-center py-10 space-y-4">
                <Sparkles className="h-10 w-10 mx-auto opacity-20 text-white animate-bounce" />
                <h4 className="font-headline font-black text-sm text-slate-200">Handa nang mag-analisa ang Katuwang</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  I-tap ang button sa ibaba para iproseso ang inyong kasalukuyang bentahan at stock.
                </p>
                <Button 
                  onClick={handleRefresh}
                  className="rounded-xl font-bold shadow-lg mt-2 border-none"
                  style={{ backgroundColor: theme.primary, color: '#051821' }}
                >
                  Simulan ang Pagsusuri
                </Button>
              </div>
            )}

            {/* Bottom Safe Area Footer */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest pb-safe">
              <span>Tenant: {currentTenant.name}</span>
              <span>Katuwang AI · v1.2</span>
            </div>

          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
