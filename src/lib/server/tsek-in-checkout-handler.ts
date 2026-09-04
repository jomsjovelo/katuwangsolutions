/**
 * Tsek-In Server Check-out Handler
 */

import {
  CheckoutError,
  CheckoutErrorCode,
  sanitizedCheckoutResponse,
  type CheckoutReceipt,
  tsekInCheckOut,
} from './tsek-in-checkout-service';

const MAX_PAYLOAD_BYTES = 64 * 1024;

export interface TsekInCheckOutHandlerOptions {
  service?: typeof tsekInCheckOut;
}

export function createTsekInCheckOutRouteHandler(
  options: TsekInCheckOutHandlerOptions = {}
) {
  const service = options.service ?? tsekInCheckOut;

  return async function handleTsekInCheckOut(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
      return sanitizedCheckoutResponse(
        new CheckoutError(CheckoutErrorCode.INVALID_REQUEST, 'Method Not Allowed')
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return sanitizedCheckoutResponse(
        new CheckoutError(CheckoutErrorCode.INVALID_REQUEST)
      );
    }

    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return sanitizedCheckoutResponse(
        new CheckoutError(CheckoutErrorCode.INVALID_REQUEST, 'Payload size exceeds 64KB limit')
      );
    }

    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return sanitizedCheckoutResponse(
        new CheckoutError(CheckoutErrorCode.UNAUTHENTICATED)
      );
    }
    const idToken = authHeader.substring(7).trim();
    if (!idToken) {
      return sanitizedCheckoutResponse(
        new CheckoutError(CheckoutErrorCode.UNAUTHENTICATED)
      );
    }

    const rawText = await req.text();
    if (rawText.length > MAX_PAYLOAD_BYTES) {
      return sanitizedCheckoutResponse(
        new CheckoutError(CheckoutErrorCode.INVALID_REQUEST, 'Payload size exceeds 64KB limit')
      );
    }

    const utf8Bytes = new TextEncoder().encode(rawText).length;
    if (utf8Bytes > MAX_PAYLOAD_BYTES) {
      return sanitizedCheckoutResponse(
        new CheckoutError(CheckoutErrorCode.INVALID_REQUEST, 'Payload size exceeds 64KB limit')
      );
    }

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      return sanitizedCheckoutResponse(
        new CheckoutError(CheckoutErrorCode.INVALID_REQUEST)
      );
    }

    try {
      const receipt = await service(idToken, rawBody);

      // Successful check-out returns HTTP 200
      return Response.json(receipt, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch (err: any) {
      if (err instanceof CheckoutError) {
        return sanitizedCheckoutResponse(err);
      }
      return sanitizedCheckoutResponse(
        new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE, 'Internal server error')
      );
    }
  };
}