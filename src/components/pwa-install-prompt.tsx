"use client";

import React, { useState, useEffect } from "react";
import { X, Download, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if user already dismissed or installed
    const hasDismissed = localStorage.getItem("katuwang_pwa_dismissed");
    
    // Check if running in standalone mode (already installed)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches 
      || (window.navigator as any).standalone 
      || document.referrer.includes("android-app://");

    if (hasDismissed === "true" || isStandalone) {
      return;
    }

    // Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = userAgent.includes("safari") && !userAgent.includes("chrome");
    
    if (isIosDevice && isSafari) {
      setIsIOS(true);
      // Wait a few seconds before showing iOS prompt so it isn't too aggressive
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // Handle Android/Chrome beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Wait a bit before showing to not interrupt immediate user flow
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("katuwang_pwa_dismissed", "true");
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[100] animate-in slide-in-from-bottom-8 fade-in duration-500 max-w-md mx-auto">
      <div className="bg-white rounded-3xl p-5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] border border-slate-100 relative overflow-hidden">
        
        <div className="absolute -top-10 -right-10 opacity-5 pointer-events-none">
          <Download className="h-32 w-32 text-cyan-500" />
        </div>

        <button 
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1 rounded-full bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center flex-shrink-0 shadow-inner">
            <img src="/icons/icon-192.png" alt="Katuwang Logo" className="h-8 w-8 object-contain drop-shadow-md" onError={(e) => e.currentTarget.style.display = 'none'} />
            <Download className="h-6 w-6 text-white absolute mix-blend-overlay" />
          </div>
          
          <div className="flex-1 pr-6">
            <h3 className="font-headline font-black text-slate-800 text-sm leading-tight">
              I-install ang Katuwang App
            </h3>
            <p className="text-[11px] font-medium text-slate-500 mt-1 leading-snug">
              Gamitin kahit walang internet! Mag-benta at mag-check ng stock nang mas mabilis.
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-50">
          {!isIOS ? (
            <Button 
              onClick={handleInstallClick}
              className="w-full h-11 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-sm shadow-md shadow-cyan-500/20 active:scale-95 transition-all gap-2"
            >
              <Download className="h-4 w-4" /> I-install Ngayon
            </Button>
          ) : (
            <div className="bg-slate-50 rounded-xl p-3 flex flex-col items-center justify-center text-center gap-2">
              <p className="text-[10px] font-bold text-slate-600 flex items-center justify-center gap-1.5 flex-wrap">
                Para i-install sa iPhone, i-tap ang <Share className="h-4 w-4 text-blue-500 inline" /> sa ibaba at piliin ang:
              </p>
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-sm">
                <PlusSquare className="h-4 w-4 text-slate-700" />
                <span className="text-xs font-bold text-slate-700">Add to Home Screen</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
