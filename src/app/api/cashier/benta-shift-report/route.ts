import { NextRequest, NextResponse } from 'next/server';
import { fetchCashierShiftReport, extractBearerToken } from '@/lib/server/benta-cashier-shift-report';
import { sanitizedErrorResponse } from '@/lib/server/cashier-server-authorization';

export async function GET(request: NextRequest) {
  try {
    const idToken = extractBearerToken(request.headers.get('Authorization'));
    const { searchParams } = new URL(request.url);
    const shiftId = searchParams.get('shiftId') || undefined;

    const report = await fetchCashierShiftReport(idToken, shiftId);
    return NextResponse.json(report, { status: 200 });
  } catch (error: any) {
    const sanitized = sanitizedErrorResponse(error);
    return NextResponse.json(sanitized.body, { status: sanitized.status });
  }
}
