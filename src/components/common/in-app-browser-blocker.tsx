"use client"

import React, { useEffect, useState } from 'react';
import { Compass, Copy, Check } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';

export function InAppBrowserBlocker() {
  const [isIab, setIsIab] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Capture the exact URL including any query parameters
    const url = window.location.href;
    setCurrentUrl(url);

    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // ── Android in-app browser detection ──────────────────────────────
    const isFacebook  = ua.includes('FBAN') || ua.includes('FBAV') || ua.includes('FBIOS');
    const isMessenger = ua.includes('MessengerForiOS') || ua.includes('MESSENGER') || ua.includes('[FB_IAB]') || ua.includes('FB_IAB');
    const isInstagram = ua.includes('Instagram');
    const isLine      = ua.includes('Line/');
    const isTikTok    = ua.includes('ByteLocale') || ua.includes('aweme') || ua.includes('TikTok');
    const isTwitter   = ua.includes('TwitterAndroid') || ua.includes('TwitteriPhone');

    if (isFacebook || isMessenger || isInstagram || isLine || isTikTok || isTwitter) {
      setIsIab(true);
      return;
    }

    // ── iOS-specific detection ─────────────────────────────────────────
    // On iOS, Messenger and Facebook use WKWebView or SFSafariViewController.
    // SFSafariViewController leaves NO ua trace. We detect it via:
    // 1. Referrer coming from facebook.com / messenger.com / l.facebook.com
    // 2. URL query param injected by Facebook (?fbclid=...)
    if (isIOSDevice) {
      const referrer = document.referrer || '';
      const isFbReferrer =
        referrer.includes('facebook.com') ||
        referrer.includes('messenger.com') ||
        referrer.includes('l.facebook.com') ||
        referrer.includes('fb.me');

      // Facebook always appends ?fbclid= to links shared in Messenger/FB on iOS
      const hasFbclid = url.includes('fbclid=');

      if (isFbReferrer || hasFbclid) {
        setIsIab(true);
      }
    }
  }, []);

  const copyUrl = () => {
    navigator.clipboard.writeText(currentUrl).catch(() => {
      // Fallback for browsers that block clipboard API in WebViews
      const el = document.createElement('textarea');
      el.value = currentUrl;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!isIab) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-50 flex flex-col overflow-hidden">

      {/* ── TOP: Arrow pointing to 3-dots menu (Android only) ── */}
      {!isIOS && (
        <div className="w-full flex justify-end px-6 pt-5 animate-bounce shrink-0">
          <div className="bg-white px-4 py-3 rounded-full flex items-center gap-3 border border-slate-200 shadow-lg relative">
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

      {/* ── MIDDLE: Main scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center text-center p-6 pb-2">
          <BrandLogo className="mb-6 mt-2" />

          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-sm text-left">
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center rotate-12 shadow-inner mb-4">
                <Compass className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-black text-slate-800 font-headline tracking-tight">
                {isIOS ? 'Open in Safari' : 'Open in Chrome'}
              </h1>
              <p className="text-slate-500 font-medium text-xs mt-1 leading-relaxed">
                {isIOS
                  ? 'This link was opened inside Messenger. To use Katuwang, open it in Safari.'
                  : 'This link was opened inside Messenger. To use Katuwang, open it in Chrome.'}
              </p>
            </div>

            {/* Steps */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-4">
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 bg-white shadow-sm text-slate-800 rounded-full flex items-center justify-center font-black flex-shrink-0 text-sm">1</div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">
                    {isIOS ? 'Tap the Share icon (box with arrow)' : 'Tap the 3-dot menu (⋮)'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isIOS ? 'Look at the bottom of your screen' : 'Look at the top-right corner of your screen'}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 bg-white shadow-sm text-slate-800 rounded-full flex items-center justify-center font-black flex-shrink-0 text-sm">2</div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">
                    {isIOS ? 'Tap "Open in Safari"' : 'Tap "Open in Chrome"'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isIOS ? 'Or "Open in Browser"' : 'Or "Open in Browser"'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM: Sticky "Copy Link" bar — ALWAYS VISIBLE ── */}
      <div className="shrink-0 bg-white border-t border-slate-200 p-4 space-y-3" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center gap-3 py-1">
          <div className="h-px bg-slate-100 flex-1"></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Or copy link manually</span>
          <div className="h-px bg-slate-100 flex-1"></div>
        </div>

        {/* URL display */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 overflow-hidden">
          <p className="text-xs font-mono text-slate-500 truncate">{currentUrl}</p>
        </div>

        {/* Copy button */}
        <button
          onClick={copyUrl}
          className={`w-full flex items-center justify-center gap-2 text-sm font-bold py-3 rounded-xl transition-all active:scale-[0.98] ${
            copied
              ? 'bg-green-100 text-green-700 border border-green-200'
              : 'bg-slate-900 text-white'
          }`}
        >
          {copied
            ? <><Check className="h-4 w-4" /> Copied!</>
            : <><Copy className="h-4 w-4" /> Copy Link</>}
        </button>

        <p className="text-[11px] font-medium text-slate-400 text-center">
          Paste this link in {isIOS ? 'Safari' : 'Google Chrome'} to continue.
        </p>
      </div>

    </div>
  );
}
