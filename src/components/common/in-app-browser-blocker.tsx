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
    <div className="fixed inset-0 z-[99999] bg-slate-50 flex flex-col items-center justify-center p-6 overflow-hidden">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col items-center text-center space-y-6">
        <BrandLogo />
        
        <div className="space-y-2">
          <h1 className="text-lg font-black text-slate-800 tracking-tight">
            Unsupported Browser
          </h1>
          <p className="text-slate-500 font-medium text-sm leading-relaxed">
            Please copy the link below and open it in {isIOS ? 'Safari' : 'Google Chrome'} to continue.
          </p>
        </div>

        <div className="w-full space-y-3">
          {/* URL display */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 overflow-hidden text-left">
            <p className="text-xs font-mono text-slate-500 truncate">{currentUrl}</p>
          </div>

          {/* Copy button */}
          <button
            onClick={copyUrl}
            className={`w-full flex items-center justify-center gap-2 text-sm font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] ${
              copied
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-slate-900 text-white'
            }`}
          >
            {copied
              ? <><Check className="h-4 w-4" /> Copied!</>
              : <><Copy className="h-4 w-4" /> Copy Link</>}
          </button>
        </div>
      </div>
    </div>
  );
}
