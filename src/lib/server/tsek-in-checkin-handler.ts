/**
 * Tsek-In Server Check-in Handler
 */

import {
  CheckinError,
  CheckinErrorCode,
  sanitizedCheckinResponse,
  type CheckinReceipt,
  tsekInCheckIn,
} from './tsek-in-checkin-service';

const MAX_PAYLOAD_BYTES = 64 * 1024;

export interface TsekInCheckInHandlerOptions {
  service?: typeof tsekInCheckIn;
}

export function createTsekInCheckInRouteHandler(
  options: TsekInCheckInHandlerOptions = {}
) {
  const service = options.service ?? tsekInCheckIn;

  return async function handleTsekInCheckIn(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
      return sanitizedCheckinResponse(
        new CheckinError(CheckinErrorCode.INVALID_REQUEST, 'Method Not Allowed')
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return sanitizedCheckinResponse(
        new CheckinError(CheckinErrorCode.INVALID_REQUEST)
      );
    }

    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return sanitizedCheckinResponse(
        new CheckinError(CheckinErrorCode.INVALID_REQUEST, 'Payload size exceeds 64KB limit')
      );
    }

    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return sanitizedCheckinResponse(
        new CheckinError(CheckinErrorCode.UNAUTHENTICATED)
      );
    }
    const idToken = authHeader.substring(7).trim();
    if (!idToken) {
      return sanitizedCheckinResponse(
        new CheckinError(CheckinErrorCode.UNAUTHENTICATED)
      );
    }

    const rawText = await req.text();
    if (rawText.length > MAX_PAYLOAD_BYTES) {
      return sanitizedCheckinResponse(
        new CheckinError(CheckinErrorCode.INVALID_REQUEST, 'Payload size exceeds 64KB limit')
      );
    }

    const utf8Bytes = new TextEncoder().encode(rawText).length;
    if (utf8Bytes > MAX_PAYLOAD_BYTES) {
      return sanitizedCheckinResponse(
        new CheckinError(CheckinErrorCode.INVALID_REQUEST, 'Payload size exceeds 64KB limit')
      );
    }

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      return sanitizedCheckinResponse(
        new CheckinError(CheckinErrorCode.INVALID_REQUEST)
      );
    }

    try {
      const receipt = await service(idToken, rawBody);

      // Successful check-in returns HTTP 201
      return Response.json(receipt, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (err: any) {
      if (err instanceof CheckinError) {
        return sanitizedCheckinResponse(err);
      }
      return sanitizedCheckinResponse(
        new CheckinError(CheckinErrorCode.SERVICE_UNAVAILABLE, 'Internal server error')
      );
    }
  };
}