import { finalizeCashierSaleIntent } from '@/lib/server/benta-cashier-intent-finalizer';
import { CheckoutError, sanitizedErrorResponse } from '@/lib/server/cashier-server-authorization';
import { isSecureCashierSystemEnabled, isBentaHybridCashierEnabled } from '@/lib/server/secure-cashier-config';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
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
    const result = await finalizeCashierSaleIntent(idToken, body);
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return sanitizedErrorResponse(error);
    }
    console.error('[FINALIZE_INTENT_ERROR]', error);
    return Response.json({ error: 'Failed to finalize intent.' }, { status: 500 });
  }
}
