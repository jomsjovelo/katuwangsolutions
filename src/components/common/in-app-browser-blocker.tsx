"use client"

import React, { useEffect, useState } from 'react';
import { Copy, Check, X, Info } from 'lucide-react';

export function InAppBrowserBlocker() {
  const [isIab, setIsIab] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (sessionStorage.getItem('katuwang_iab_dismissed') === 'true') {
      return;
    }

    const url = window.location.href;
    setCurrentUrl(url);

    const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Rely strictly on social-browser User-Agent evidence
    const isFacebook  = /FBAN|FBAV|FBIOS/i.test(ua);
    const isMessenger = /MessengerForiOS|MESSENGER|FB_IAB|FB4A/i.test(ua);
    const isInstagram = /Instagram/i.test(ua);
    const isLine      = /Line\//i.test(ua);
    const isTikTok    = /ByteLocale|aweme|TikTok/i.test(ua);
    const isTwitter   = /TwitterAndroid|TwitteriPhone/i.test(ua);
    const isWeChat    = /MicroMessenger/i.test(ua);

    if (isFacebook || isMessenger || isInstagram || isLine || isTikTok || isTwitter || isWeChat) {
      setIsIab(true);
    }
  }, []);

  const copyUrl = async () => {
    setCopyFailed(false);
    let success = false;

    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(currentUrl);
        success = true;
      } catch {
        success = false;
      }
    }

    if (!success && typeof document !== 'undefined') {
      try {
        const el = document.createElement('textarea');
        el.value = currentUrl;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.focus();
        el.select();
        success = document.execCommand('copy');
        document.body.removeChild(el);
      } catch {
        success = false;
      }
    }

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 4000);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('katuwang_iab_dismissed', 'true');
    }
  };

  if (!isIab || dismissed) return null;

  return (
    <div className="w-full bg-slate-900 text-white px-4 py-2 text-xs font-medium relative z-50 border-b border-slate-800 animate-in fade-in slide-in-from-top-1">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Info className="h-4 w-4 text-cyan-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <p className="truncate">
              Naka-open sa social browser. Para sa pinakamabilis na performance, buksan sa <strong>{isIOS ? 'Safari' : 'Chrome'}</strong>.
            </p>
            {copyFailed && (
              <p className="text-[10px] text-amber-300 font-bold mt-0.5">
                💡 Paki-select at kopyahin ang URL sa address bar: <span className="underline select-all">{currentUrl}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={copyUrl}
            className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors min-h-[32px]"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                Copied!
              </>
            ) : copyFailed ? (
              <>
                <Copy className="h-3 w-3 text-amber-300" />
                Select URL
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy Link
              </>
            )}
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Isara"
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
