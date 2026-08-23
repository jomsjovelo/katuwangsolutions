/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from 'serwist';
import { Serwist, CacheFirst, NetworkFirst, StaleWhileRevalidate, ExpirationPlugin } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const isExternalTracking = (url: URL) =>
  url.hostname.includes('facebook.com') ||
  url.hostname.includes('facebook.net') ||
  url.hostname.includes('google-analytics.com') ||
  url.hostname.includes('googletagmanager.com') ||
  url.hostname.includes('connect.facebook.net') ||
  url.hostname.includes('identitytoolkit.googleapis.com') ||
  url.hostname.includes('securetoken.googleapis.com');

const filteredDefaultCache: RuntimeCaching[] = defaultCache.map((entry) => ({
  ...entry,
  matcher: (options: any) => {
    const { url } = options;
    if (isExternalTracking(url)) {
      return false;
    }
    if (typeof entry.matcher === 'function') {
      return entry.matcher(options);
    }
    if (entry.matcher instanceof RegExp) {
      return entry.matcher.test(url.href);
    }
    return false;
  },
}));

const customCaching: RuntimeCaching[] = [
  {
    matcher: ({ request, url }) => !isExternalTracking(url) && (request.destination === 'image' || url.hostname.includes('placehold') || url.hostname.includes('unsplash')),
    handler: new CacheFirst({
      cacheName: 'katuwang-images',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        }),
      ],
    }),
  },
  {
    matcher: ({ request, url }) => !isExternalTracking(url) && (request.destination === 'font' || url.hostname.includes('fonts.googleapis.com')),
    handler: new CacheFirst({
      cacheName: 'katuwang-fonts',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        }),
      ],
    }),
  },
  {
    matcher: ({ url }) => !isExternalTracking(url) && url.pathname.startsWith('/dashboard'),
    handler: new NetworkFirst({
      cacheName: 'katuwang-authenticated-dashboard',
      networkTimeoutSeconds: 5,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 20,
          maxAgeSeconds: 60 * 60, // never retain an authenticated app shell for a week
        }),
      ],
    }),
  },
  {
    matcher: ({ url }) => !isExternalTracking(url) && (url.pathname.startsWith('/admin') || url.pathname.startsWith('/onboarding')),
    handler: new StaleWhileRevalidate({
      cacheName: 'katuwang-ui',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
        }),
      ],
    }),
  },
  ...filteredDefaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: customCaching,
});

serwist.addEventListeners();
