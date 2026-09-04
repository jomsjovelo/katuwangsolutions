/**
 * Tsek-In Server Extend Handler
 */

import {
  ExtensionError,
  ExtensionErrorCode,
  sanitizedExtensionResponse,
  type ExtensionReceipt,
  tsekInExtend,
} from './tsek-in-extension-service';

const MAX_PAYLOAD_BYTES = 64 * 1024;

export interface TsekInExtendHandlerOptions {
  service?: typeof tsekInExtend;
}

export function createTsekInExtendRouteHandler(
  options: TsekInExtendHandlerOptions = {}
) {
  const service = options.service ?? tsekInExtend;

  return async function handleTsekInExtend(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
      return sanitizedExtensionResponse(
        new ExtensionError(ExtensionErrorCode.INVALID_REQUEST, 'Method Not Allowed')
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return sanitizedExtensionResponse(
        new ExtensionError(ExtensionErrorCode.INVALID_REQUEST)
      );
    }

    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return sanitizedExtensionResponse(
        new ExtensionError(ExtensionErrorCode.INVALID_REQUEST, 'Payload size exceeds 64KB limit')
      );
    }

    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return sanitizedExtensionResponse(
        new ExtensionError(ExtensionErrorCode.UNAUTHENTICATED)
      );
    }
    const idToken = authHeader.substring(7).trim();
    if (!idToken) {
      return sanitizedExtensionResponse(
        new ExtensionError(ExtensionErrorCode.UNAUTHENTICATED)
      );
    }

    const rawText = await req.text();
    if (rawText.length > MAX_PAYLOAD_BYTES) {
      return sanitizedExtensionResponse(
        new ExtensionError(ExtensionErrorCode.INVALID_REQUEST, 'Payload size exceeds 64KB limit')
      );
    }

    const utf8Bytes = new TextEncoder().encode(rawText).length;
    if (utf8Bytes > MAX_PAYLOAD_BYTES) {
      return sanitizedExtensionResponse(
        new ExtensionError(ExtensionErrorCode.INVALID_REQUEST, 'Payload size exceeds 64KB limit')
      );
    }

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      return sanitizedExtensionResponse(
        new ExtensionError(ExtensionErrorCode.INVALID_REQUEST)
      );
    }

    try {
      const receipt = await service(idToken, rawBody);

      // Successful extend returns HTTP 200
      return Response.json(receipt, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch (err: any) {
      if (err instanceof ExtensionError) {
        return sanitizedExtensionResponse(err);
      }
      return sanitizedExtensionResponse(
        new ExtensionError(ExtensionErrorCode.SERVICE_UNAVAILABLE, 'Internal server error')
      );
    }
  };
}