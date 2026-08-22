import { NextResponse } from 'next/server';
import { 
  listCashierAccounts, 
  createCashierAccount, 
  resetCashierPin,
  disableCashierAccount,
  removeCashierAccount,
  LifecycleError, 
  LifecycleServiceOptions 
} from '@/lib/server/staff-lifecycle';

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token || null;
}

export function createCashiersRouteHandlers(serviceOptions?: LifecycleServiceOptions) {
  return {
    GET: async (request: Request) => {
      try {
        const ownerToken = extractBearerToken(request);
        if (!ownerToken) {
          return NextResponse.json(
            { error: 'Kailangan munang mag-log in bilang may-ari ng tindahan.' },
            { status: 401 }
          );
        }

        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId')?.trim();

        if (!tenantId) {
          return NextResponse.json(
            { error: 'Kailangan ang wastong impormasyon at 4-digit numeric PIN.' },
            { status: 400 }
          );
        }

        const cashiers = await listCashierAccounts({ ownerToken, tenantId }, serviceOptions);
        return NextResponse.json({ success: true, cashiers });
      } catch (error: any) {
        if (error instanceof LifecycleError) {
          return NextResponse.json({ error: error.userMessage }, { status: error.httpStatus });
        }
        console.error('[OWNER_CASHIER_ERROR] list operation failed: internal_error');
        return NextResponse.json(
          { error: 'Nagkaroon ng problema sa server. Paki-subukan muli mamaya.' },
          { status: 500 }
        );
      }
    },
    POST: async (request: Request) => {
      try {
        const ownerToken = extractBearerToken(request);
        if (!ownerToken) {
          return NextResponse.json(
            { error: 'Kailangan munang mag-log in bilang may-ari ng tindahan.' },
            { status: 401 }
          );
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return NextResponse.json(
            { error: 'Kailangan ang wastong impormasyon at 4-digit numeric PIN.' },
            { status: 400 }
          );
        }

        const { tenantId, username, pin } = body || {};

        const cleanTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';
        const cleanUsername = typeof username === 'string' ? username.trim() : '';
        const cleanPin = typeof pin === 'string' ? pin.trim() : '';

        if (!cleanTenantId || !cleanUsername || !/^\d{4}$/.test(cleanPin)) {
          return NextResponse.json(
            { error: 'Kailangan ang wastong impormasyon at 4-digit numeric PIN.' },
            { status: 400 }
          );
        }

        const result = await createCashierAccount({
          ownerToken,
          tenantId: cleanTenantId,
          username: cleanUsername,
          pin: cleanPin
        }, serviceOptions);

        return NextResponse.json({
          success: true,
          cashier: {
            id: result.id,
            username: result.username,
            status: result.status
          }
        });
      } catch (error: any) {
        if (error instanceof LifecycleError) {
          return NextResponse.json({ error: error.userMessage }, { status: error.httpStatus });
        }
        console.error('[OWNER_CASHIER_ERROR] create operation failed: internal_error');
        return NextResponse.json(
          { error: 'Nagkaroon ng problema sa server. Paki-subukan muli mamaya.' },
          { status: 500 }
        );
      }
    }
  };
}

export function createResetPinRouteHandler(serviceOptions?: LifecycleServiceOptions) {
  return async function POST(request: Request) {
    try {
      const ownerToken = extractBearerToken(request);
      if (!ownerToken) {
        return NextResponse.json(
          { error: 'Kailangan munang mag-log in bilang may-ari ng tindahan.' },
          { status: 401 }
        );
      }

      let body: any;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: 'Kailangan ang wastong impormasyon at 4-digit numeric PIN.' },
          { status: 400 }
        );
      }

      const { tenantId, staffAccountId, newPin } = body || {};

      const cleanTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';
      const cleanStaffAccountId = typeof staffAccountId === 'string' ? staffAccountId.trim() : '';
      const cleanPin = typeof newPin === 'string' ? newPin.trim() : '';

      if (!cleanTenantId || !cleanStaffAccountId || !/^\d{4}$/.test(cleanPin)) {
        return NextResponse.json(
          { error: 'Kailangan ang wastong impormasyon at 4-digit numeric PIN.' },
          { status: 400 }
        );
      }

      await resetCashierPin({
        ownerToken,
        tenantId: cleanTenantId,
        staffAccountId: cleanStaffAccountId,
        newPin: cleanPin
      }, serviceOptions);

      return NextResponse.json({
        success: true,
        message: 'Matagumpay na na-reset ang 4-digit PIN ng Cashier.'
      });
    } catch (error: any) {
      if (error instanceof LifecycleError) {
        return NextResponse.json({ error: error.userMessage }, { status: error.httpStatus });
      }
      console.error('[OWNER_CASHIER_ERROR] reset-pin operation failed: internal_error');
      return NextResponse.json(
        { error: 'Nagkaroon ng problema sa server. Paki-subukan muli mamaya.' },
        { status: 500 }
      );
    }
  };
}

export function createDisableRouteHandler(serviceOptions?: LifecycleServiceOptions) {
  return async function POST(request: Request) {
    try {
      const ownerToken = extractBearerToken(request);
      if (!ownerToken) {
        return NextResponse.json(
          { error: 'Kailangan munang mag-log in bilang may-ari ng tindahan.' },
          { status: 401 }
        );
      }

      let body: any;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: 'Kailangan ang wastong impormasyon.' },
          { status: 400 }
        );
      }

      const { tenantId, staffAccountId } = body || {};

      const cleanTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';
      const cleanStaffAccountId = typeof staffAccountId === 'string' ? staffAccountId.trim() : '';

      if (!cleanTenantId || !cleanStaffAccountId) {
        return NextResponse.json(
          { error: 'Kailangan ang wastong impormasyon.' },
          { status: 400 }
        );
      }

      await disableCashierAccount({
        ownerToken,
        tenantId: cleanTenantId,
        staffAccountId: cleanStaffAccountId
      }, serviceOptions);

      return NextResponse.json({
        success: true,
        message: 'Na-disable na ang Cashier account.'
      });
    } catch (error: any) {
      if (error instanceof LifecycleError) {
        return NextResponse.json({ error: error.userMessage }, { status: error.httpStatus });
      }
      console.error('[OWNER_CASHIER_ERROR] disable operation failed: internal_error');
      return NextResponse.json(
        { error: 'Nagkaroon ng problema sa server. Paki-subukan muli mamaya.' },
        { status: 500 }
      );
    }
  };
}

export function createRemoveRouteHandler(serviceOptions?: LifecycleServiceOptions) {
  return async function POST(request: Request) {
    try {
      const ownerToken = extractBearerToken(request);
      if (!ownerToken) {
        return NextResponse.json(
          { error: 'Kailangan munang mag-log in bilang may-ari ng tindahan.' },
          { status: 401 }
        );
      }

      let body: any;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: 'Kailangan ang wastong impormasyon.' },
          { status: 400 }
        );
      }

      const { tenantId, staffAccountId } = body || {};

      const cleanTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';
      const cleanStaffAccountId = typeof staffAccountId === 'string' ? staffAccountId.trim() : '';

      if (!cleanTenantId || !cleanStaffAccountId) {
        return NextResponse.json(
          { error: 'Kailangan ang wastong impormasyon.' },
          { status: 400 }
        );
      }

      await removeCashierAccount({
        ownerToken,
        tenantId: cleanTenantId,
        staffAccountId: cleanStaffAccountId
      }, serviceOptions);

      return NextResponse.json({
        success: true,
        message: 'Na-delete na ang Cashier account.'
      });
    } catch (error: any) {
      if (error instanceof LifecycleError) {
        return NextResponse.json({ error: error.userMessage }, { status: error.httpStatus });
      }
      console.error('[OWNER_CASHIER_ERROR] remove operation failed: internal_error');
      return NextResponse.json(
        { error: 'Nagkaroon ng problema sa server. Paki-subukan muli mamaya.' },
        { status: 500 }
      );
    }
  };
}
