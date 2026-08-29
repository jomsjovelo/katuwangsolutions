import { finalizeCashierSaleIntent } from '@/lib/server/benta-cashier-intent-finalizer';
import { CheckoutError, sanitizedErrorResponse } from '@/lib/server/cashier-server-authorization';
import { isSecureCashierSystemEnabled, isBentaHybridCashierEnabled } from '@/lib/server/secure-cashier-config';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    if (!isSecureCashierSystemEnabled() || !isBentaHybridCashierEnabled()) {
      return Response.json({ error: 'Hybrid cashier system is disabled.' }, { status: 503 });
    }

    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    if (!idToken) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const tFinalizeStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const result = await finalizeCashierSaleIntent(idToken, body);
    const tFinalizeEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const tTotal = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
    if (process.env.NODE_ENV !== 'production') {
      console.info('[SERVER_PERF_FINALIZE_INTENT]', {
        intentId: body?.intentId,
        finalizationMs: Number((tFinalizeEnd - tFinalizeStart).toFixed(2)),
        totalDurationMs: Number(tTotal.toFixed(2))
      });
    }

    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return sanitizedErrorResponse(error);
    }
    console.error('[FINALIZE_INTENT_ERROR]', error);
    return Response.json({ error: 'Failed to finalize intent.' }, { status: 500 });
  }
}
