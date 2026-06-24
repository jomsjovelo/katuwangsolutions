"use client"

import React, { useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';

export function InAppBrowserBlocker() {
  const [isIab, setIsIab] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);
    
    // Facebook and Messenger identifiers
    const isFacebook = (userAgent.indexOf("FBAN") > -1) || (userAgent.indexOf("FBAV") > -1);
    const isMessenger = userAgent.indexOf("MessengerForiOS") > -1 || userAgent.indexOf("MESSENGER") > -1;
    const isInstagram = userAgent.indexOf("Instagram") > -1;
    const isLine = userAgent.indexOf("Line") > -1;
    const isTikTok = userAgent.indexOf("ByteLocale") > -1 || userAgent.indexOf("aweme") > -1 || userAgent.indexOf("TikTok") > -1;
    
    if (isFacebook || isMessenger || isInstagram || isLine || isTikTok) {
      setIsIab(true);
    }
  }, []);

  if (!isIab) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-50 flex flex-col p-6 overflow-y-auto">
      {/* Visual pointer to the top right 3 dots (Android) */}
      {!isIOS && (
        <div className="w-full flex justify-end mb-8 animate-bounce">
          <div className="bg-white px-4 py-3 rounded-full flex items-center gap-3 border border-slate-200 shadow-lg relative">
             {/* Arrow pointing up-right */}
             <div className="absolute -top-3 right-4 w-0 h-0 border-l-[8px] border-l-transparent border-b-[12px] border-b-white border-r-[8px] border-r-transparent drop-shadow"></div>
            <span className="text-sm font-black text-slate-700 tracking-tight">Tap here first</span>
            <div className="flex gap-1.5">
              <div className="w-2 h-2 bg-slate-800 rounded-full"></div>
              <div className="w-2 h-2 bg-slate-800 rounded-full"></div>
              <div className="w-2 h-2 bg-slate-800 rounded-full"></div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center text-center mt-4">
        <BrandLogo className="mb-8" />
        
        <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-sm w-full space-y-6 shadow-sm">
          <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto rotate-12 shadow-inner">
            <Compass className="w-8 h-8" />
          </div>
          
          <div>
            <h1 className="text-2xl font-black text-slate-800 mb-2 font-headline tracking-tight">Please Open in Browser</h1>
            <p className="text-slate-500 font-medium leading-relaxed text-sm">
              You are currently using an in-app browser. To use Katuwang and access all features, you must open this link in your main browser.
            </p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 text-left space-y-5">
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 bg-white shadow-sm text-slate-800 rounded-full flex items-center justify-center font-black flex-shrink-0">1</div>
              <div>
                <p className="font-bold text-slate-800 text-sm">
                  {isIOS ? 'Tap the Safari or Share icon' : 'Tap the 3 dots'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isIOS ? 'Look at the bottom right corner of your screen' : 'Look at the top right corner of your screen'}
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 bg-white shadow-sm text-slate-800 rounded-full flex items-center justify-center font-black flex-shrink-0">2</div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Select "Open in Browser"</p>
                <p className="text-xs text-slate-500 mt-0.5">Or "Open in Safari / Chrome"</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Visual pointer to the bottom right (iOS) */}
      {isIOS && (
        <div className="fixed bottom-12 right-6 animate-bounce z-50">
          <div className="bg-white px-4 py-3 rounded-full flex items-center gap-3 border border-slate-200 shadow-lg relative">
            <span className="text-sm font-black text-slate-700 tracking-tight">Tap here to open</span>
            {/* Arrow pointing down-right */}
            <div className="absolute -bottom-3 right-6 w-0 h-0 border-l-[8px] border-l-transparent border-t-[12px] border-t-white border-r-[8px] border-r-transparent drop-shadow"></div>
          </div>
        </div>
      )}
    </div>
  );
}
