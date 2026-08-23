import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { isSecureCashierSystemEnabled } from '@/lib/server/secure-cashier-config';
import {
  verifyBentaCashierIdentity,
  sanitizedErrorResponse,
  CheckoutError,
  CheckoutErrorCode,
  SERVER_IDENTIFIER
} from '@/lib/server/cashier-server-authorization';
import {
  WEBAUTHN_COOKIE_NAME,
  verifyChallengeCookie,
  verifyAndRegisterCashierDevice
} from '@/lib/server/webauthn-server-service';
import { getWebAuthnChallengeSecret, getWebAuthnConfig } from '@/lib/server/webauthn-env-config';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSecureCashierSystemEnabled()) {
    return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.CHECKOUT_UNAVAILABLE));
  }

  const authHeader = request.headers.get('authorization') || '';
  const tokenMatch = /^Bearer ([^\s]+)$/.exec(authHeader);
  if (!tokenMatch) {
    return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.AUTHENTICATION_REQUIRED));
  }

  const installationId = request.headers.get('x-installation-id')?.trim();
  if (!installationId || !SERVER_IDENTIFIER.test(installationId)) {
    return sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.INVALID_REQUEST));
  }

  // Retrieve challenge cookie
  const cookieHeader = request.cookies.get(WEBAUTHN_COOKIE_NAME)?.value || '';
  const secret = getWebAuthnChallengeSecret();
  const challengeCheck = verifyChallengeCookie(cookieHeader, secret);

  const clearCookieHeader = `${WEBAUTHN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

  if (!challengeCheck.isValid || !challengeCheck.payload) {
    const res = sanitizedErrorResponse(
      new CheckoutError(CheckoutErrorCode.AUTHENTICATION_REQUIRED)
    );
    res.headers.set('Set-Cookie', clearCookieHeader);
    return res;
  }

  try {
    const auth = getAdminAuth();
    const db = getAdminFirestore();
    const identity = await verifyBentaCashierIdentity(tokenMatch[1], auth);

    const body = await request.json().catch(() => null);
    if (!body || !body.response) {
      const res = sanitizedErrorResponse(new CheckoutError(CheckoutErrorCode.INVALID_REQUEST));
      res.headers.set('Set-Cookie', clearCookieHeader);
      return res;
    }

    const deviceName = typeof body.deviceName === 'string' && body.deviceName.trim() ? body.deviceName.trim() : 'Cashier Terminal';

    const result = await verifyAndRegisterCashierDevice(
      identity,
      installationId,
      body.response,
      deviceName,
      challengeCheck.payload,
      db
    );

    const response = NextResponse.json(result, { status: 200 });
    response.headers.set('Set-Cookie', clearCookieHeader);
    return response;
  } catch (error) {
    const res = sanitizedErrorResponse(
      error instanceof CheckoutError ? error : new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE)
    );
    res.headers.set('Set-Cookie', clearCookieHeader);
    return res;
  }
}
