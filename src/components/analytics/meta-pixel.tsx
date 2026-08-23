'use client';

import Script from 'next/script';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackMetaEvent, flushMetaEventQueue } from '@/lib/meta-pixel';

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

function RoutePageViewTracker() {
  const pathname = usePathname();
  const isInitialPage = useRef(true);

  useEffect(() => {
    if (isInitialPage.current) {
      isInitialPage.current = false;
      return;
    }

    trackMetaEvent('PageView');
  }, [pathname]);

  return null;
}

export function MetaPixel() {
  const isLocalOrEmulator =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.') ||
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true');

  useEffect(() => {
    if (PIXEL_ID && !isLocalOrEmulator) {
      flushMetaEventQueue();
    }
  }, [isLocalOrEmulator]);

  if (!PIXEL_ID || isLocalOrEmulator) {
    return null;
  }

  const pixelIdLiteral = JSON.stringify(PIXEL_ID);

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        onLoad={() => {
          flushMetaEventQueue();
        }}
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', ${pixelIdLiteral});
            fbq('track', 'PageView');
          `,
        }}
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
      <RoutePageViewTracker />
    </>
  );
}
