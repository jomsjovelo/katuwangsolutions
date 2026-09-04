import {
  bootstrapOfficialDemoModule,
  DemoModuleBootstrapError,
} from './demo-module-bootstrap';

const MAX_PAYLOAD_BYTES = 1024;

export function createDemoModuleBootstrapHandler(
  options: { service?: typeof bootstrapOfficialDemoModule } = {},
) {
  const service = options.service ?? bootstrapOfficialDemoModule;
  return async function handleDemoModuleBootstrap(request: Request): Promise<Response> {
    const authHeader = request.headers.get('authorization') ?? '';
    const contentType = request.headers.get('content-type') ?? '';
    if (request.method !== 'POST' || !contentType.toLowerCase().includes('application/json')) {
      return Response.json({ code: 'INVALID_REQUEST', message: 'Invalid request.' }, { status: 400 });
    }
    if (!authHeader.startsWith('Bearer ') || !authHeader.slice(7).trim()) {
      return Response.json({ code: 'UNAUTHENTICATED', message: 'Authentication required.' }, { status: 401 });
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_PAYLOAD_BYTES) {
      return Response.json({ code: 'INVALID_REQUEST', message: 'Invalid request.' }, { status: 400 });
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ code: 'INVALID_REQUEST', message: 'Invalid request.' }, { status: 400 });
    }
    try {
      const receipt = await service(authHeader.slice(7).trim(), body);
      return Response.json(receipt, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      const safe = error instanceof DemoModuleBootstrapError
        ? error
        : new DemoModuleBootstrapError('SERVICE_UNAVAILABLE', 503);
      const message = safe.code === 'UNAUTHENTICATED'
        ? 'Authentication required.'
        : safe.code === 'FORBIDDEN'
          ? 'Demo access is not available for this account.'
          : safe.code === 'INVALID_REQUEST'
            ? 'Invalid request.'
            : 'Service temporarily unavailable.';
      return Response.json({ code: safe.code, message }, {
        status: safe.httpStatus,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}
