import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check if there is any indication of auth (e.g. session cookie).
  // Note: Firebase client-side auth tokens aren't natively available in middleware 
  // unless passed to cookies. For this strict SaaS app, we assume `firebaseToken` cookie.
  // If we don't have server-side session cookies yet, we can at least enforce 
  // that a user MUST have some cookie to access /app and /admin.
  
  // As a fallback, if the frontend handles Firebase Auth via client-side only (AuthGuard),
  // then we might not be able to do strict edge verification without Firebase Admin.
  // We will leave this middleware basic, allowing AuthGuard to do the heavy lifting,
  // but it's set up here for future expansion (e.g., checking custom session cookies).

  const { pathname } = request.nextUrl;

  if (pathname === '/__/auth/action') {
    const canonicalUrl = new URL('/auth/action', request.url);
    const permittedActionParams = ['mode', 'oobCode', 'apiKey', 'continueUrl', 'lang'];

    canonicalUrl.search = '';
    for (const param of permittedActionParams) {
      for (const value of request.nextUrl.searchParams.getAll(param)) {
        canonicalUrl.searchParams.append(param, value);
      }
    }

    return NextResponse.redirect(canonicalUrl);
  }

  // Example Edge Protection (assuming we start using next-firebase-auth or similar):
  // const session = request.cookies.get('session');
  // if (!session && (pathname.startsWith('/app') || pathname.startsWith('/admin'))) {
  //   return NextResponse.redirect(new URL('/', request.url));
  // }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/app/:path*',
    '/admin/:path*',
    '/__/auth/action',
  ],
};
