import {
  CheckinError,
  CheckinErrorCode,
  sanitizedCheckinResponse,
} from './tsek-in-checkin-service';
import { tsekInAdminMutate } from './tsek-in-admin-service';

const MAX_PAYLOAD_BYTES = 64 * 1024;

export function createTsekInAdminRouteHandler(options: { service?: typeof tsekInAdminMutate } = {}) {
  const service = options.service ?? tsekInAdminMutate;
  return async function handleTsekInAdmin(request: Request): Promise<Response> {
    const contentType = request.headers.get('content-type') ?? '';
    const authHeader = request.headers.get('authorization') ?? '';
    if (request.method !== 'POST' || !contentType.toLowerCase().includes('application/json')) {
      return sanitizedCheckinResponse(new CheckinError(CheckinErrorCode.INVALID_REQUEST));
    }
    if (!authHeader.startsWith('Bearer ') || !authHeader.slice(7).trim()) {
      return sanitizedCheckinResponse(new CheckinError(CheckinErrorCode.UNAUTHENTICATED));
    }
    const declaredLength = Number.parseInt(request.headers.get('content-length') ?? '0', 10);
    if (declaredLength > MAX_PAYLOAD_BYTES) {
      return sanitizedCheckinResponse(new CheckinError(CheckinErrorCode.INVALID_REQUEST));
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_PAYLOAD_BYTES) {
      return sanitizedCheckinResponse(new CheckinError(CheckinErrorCode.INVALID_REQUEST));
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return sanitizedCheckinResponse(new CheckinError(CheckinErrorCode.INVALID_REQUEST));
    }
    try {
      const receipt = await service(authHeader.slice(7).trim(), body);
      return Response.json(receipt, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return sanitizedCheckinResponse(
        error instanceof CheckinError
          ? error
          : new CheckinError(CheckinErrorCode.SERVICE_UNAVAILABLE),
      );
    }
  };
}
