"use client"

import React, { useEffect, useState } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';

export function IosInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if dismissed in this session
    if (sessionStorage.getItem('hideIosPrompt') === 'true') {
      return;
    }

    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    
    // Check if it's Safari (Chrome on iOS has 'CriOS', Firefox has 'FxiOS', etc.)
    const isSafari = isIOS && ua.includes('Safari') && !ua.includes('CriOS') && !ua.includes('FxiOS');
    
    // Check if already in standalone mode (installed PWA)
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true;

    // We only show this instruction if they are in standard iOS Safari 
    // and haven't installed it yet.
    if (isIOS && isSafari && !isStandalone) {
      // Small delay so it doesn't jarringly pop up the exact millisecond the page loads
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setShowPrompt(false);
    sessionStorage.setItem('hideIosPrompt', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[99999] p-4 pointer-events-none pb-8 sm:pb-4">
      {/* Visual pointer downwards to the Safari toolbar */}
      <div className="w-full flex justify-center mb-2 animate-bounce">
         <div className="w-0 h-0 border-l-[8px] border-l-transparent border-t-[12px] border-t-white border-r-[8px] border-r-transparent drop-shadow"></div>
      </div>
      
      <div className="bg-white/95 backdrop-blur-md border border-slate-200/50 p-5 rounded-3xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] pointer-events-auto mx-auto max-w-sm relative">
        <button 
          onClick={dismiss}
          className="absolute top-3 right-3 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors active:scale-95"
          aria-label="Dismiss"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-[17px] font-black text-slate-900 mb-1 tracking-tight pr-6">
          Install Katuwang App
        </h3>
        <p className="text-[13px] text-slate-500 font-medium mb-5 leading-relaxed">
          Install this web app on your iPhone for full-screen access and a better experience.
        </p>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0 border border-blue-100/50 shadow-sm">
              <Share className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-slate-800">1. Tap the Share icon</p>
              <p className="text-[12px] text-slate-500 mt-0.5 font-medium">Located at the bottom of your screen</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200/50 shadow-sm">
              <PlusSquare className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-slate-800">2. Add to Home Screen</p>
              <p className="text-[12px] text-slate-500 mt-0.5 font-medium">Scroll down the menu to find this option</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
