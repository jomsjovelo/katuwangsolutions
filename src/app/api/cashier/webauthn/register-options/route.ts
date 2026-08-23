import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/firebase/admin';
import { isSecureCashierSystemEnabled } from '@/lib/server/secure-cashier-config';
import {
  verifyBentaCashierIdentity,
  sanitizedErrorResponse,
  CheckoutError,
  CheckoutErrorCode,
  SERVER_IDENTIFIER
} from '@/lib/server/cashier-server-authorization';
import { generateCashierRegistrationOptions } from '@/lib/server/webauthn-server-service';

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

  try {
    const auth = getAdminAuth();
    const identity = await verifyBentaCashierIdentity(tokenMatch[1], auth);

    const { options, cookieHeader, suggestedName } = await generateCashierRegistrationOptions(
      identity,
      installationId
    );

    const response = NextResponse.json(
      {
        options,
        deviceNameSuggested: suggestedName
      },
      { status: 200 }
    );

    response.headers.set('Set-Cookie', cookieHeader);
    return response;
  } catch (error) {
    return sanitizedErrorResponse(
      error instanceof CheckoutError ? error : new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE)
    );
  }
}
