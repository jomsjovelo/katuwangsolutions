import * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  assertBentaCashierAuthorization,
  CheckoutError,
  CheckoutErrorCode,
  verifyBentaCashierIdentity
} from './cashier-server-authorization';
import { isSecureCashierSystemEnabled } from './secure-cashier-config';

export interface CashierShiftReportSummary {
  shiftId: string;
  tenantId: string;
  cashierDisplayName: string;
  staffAccountId: string;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt: string | null;
  startingCashCentavos: number;
  expectedEndingCashCentavos: number;
  endingCashCentavos: number | null;
  varianceCentavos: number | null;
  saleCount: number;
  totalGrossSalesCentavos: number;
  cashSalesCentavos: number;
  gcashSalesCentavos: number;
  mayaSalesCentavos: number;
  discountTotalCentavos: number;
  aggregateCogsCentavos: number | null;
  aggregateGrossProfitCentavos: number | null;
  profitComplete: boolean;
}

export interface HistoricalShiftSummary {
  shiftId: string;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt: string | null;
  totalGrossSalesCentavos: number;
  saleCount: number;
}

export interface CashierShiftReportResponse {
  currentReport: CashierShiftReportSummary;
  historicalShifts: HistoricalShiftSummary[];
}

export interface CashierShiftReportOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
}

function safeAdd(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) {
    throw new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE);
  }
  return sum;
}

function safeMultiply(a: number, b: number): number {
  const prod = a * b;
  if (!Number.isSafeInteger(prod)) {
    throw new CheckoutError(CheckoutErrorCode.SERVICE_UNAVAILABLE);
  }
  return prod;
}

export function extractBearerToken(authHeader: string | null | undefined): string {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new CheckoutError(CheckoutErrorCode.AUTHENTICATION_REQUIRED);
  }
  return authHeader.slice(7).trim();
}

export async function fetchCashierShiftReport(
  idToken: string,
  targetShiftId?: string,
  options: CashierShiftReportOptions = {}
): Promise<CashierShiftReportResponse> {
  const auth = options.adminAuth || getAdminAuth();
  const db = options.adminFirestore || getAdminFirestore();

  if (!isSecureCashierSystemEnabled()) {
    throw new CheckoutError(CheckoutErrorCode.CHECKOUT_UNAVAILABLE);
  }

  // 1. Authoritative verification of Cashier identity & session
  const identity = await verifyBentaCashierIdentity(idToken, auth);
  const tenantRef = db.collection('tenants').doc(identity.tenantId);
  const [tenantSnapshot, staffSnapshot] = await Promise.all([
    tenantRef.get(),
    tenantRef.collection('staff_accounts').doc(identity.staffAccountId).get()
  ]);
  const staffAccount = assertBentaCashierAuthorization(identity, tenantSnapshot, staffSnapshot) as {
    displayName?: string;
    username?: string;
    activeShiftId?: string;
  };

  // 2. Fetch all shifts belonging to this authenticated cashier
  const shiftsQuery = await tenantRef
    .collection('shifts')
    .where('staffAccountId', '==', identity.staffAccountId)
    .orderBy('openedAt', 'desc')
    .limit(20)
    .get();

  if (shiftsQuery.empty && !staffAccount.activeShiftId) {
    throw new CheckoutError(CheckoutErrorCode.OPERATION_NOT_PERMITTED);
  }

  const shiftsList: Array<{ id: string; [key: string]: any }> = shiftsQuery.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, any>)
  }));

  // 3. Determine selected shift
  let selectedShift = targetShiftId
    ? shiftsList.find((s) => s.id === targetShiftId)
    : shiftsList.find((s) => s.id === staffAccount.activeShiftId) || shiftsList[0];

  if (!selectedShift && targetShiftId) {
    const directDoc = await tenantRef.collection('shifts').doc(targetShiftId).get();
    if (directDoc.exists && directDoc.data()?.staffAccountId !== identity.staffAccountId) {
      throw new CheckoutError(CheckoutErrorCode.OPERATION_NOT_PERMITTED);
    }
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }

  if (!selectedShift) {
    throw new CheckoutError(CheckoutErrorCode.INVALID_REQUEST);
  }

  // 4. Fetch finalized sales strictly for this cashier and selected shift
  const salesQuery = await tenantRef
    .collection('sales')
    .where('shiftId', '==', selectedShift.id)
    .get();

  let totalGrossSalesCentavos = 0;
  let cashSalesCentavos = 0;
  let gcashSalesCentavos = 0;
  let mayaSalesCentavos = 0;
  let discountTotalCentavos = 0;
  let runningCogsCentavos = 0;
  let profitComplete = true;
  let validSaleCount = 0;

  for (const doc of salesQuery.docs) {
    const saleData = doc.data() as Record<string, any>;

    // Cashier isolation check: skip sales not committed by this cashier
    if (saleData.staffAccountId !== identity.staffAccountId) {
      continue;
    }

    validSaleCount++;

    // Canonical financial field: totalAmount (stored in centavos)
    const saleTotal = Number.isSafeInteger(saleData.totalAmount) && saleData.totalAmount >= 0
      ? saleData.totalAmount
      : 0;

    totalGrossSalesCentavos = safeAdd(totalGrossSalesCentavos, saleTotal);

    const method = saleData.paymentMethod;
    if (method === 'cash') cashSalesCentavos = safeAdd(cashSalesCentavos, saleTotal);
    else if (method === 'gcash') gcashSalesCentavos = safeAdd(gcashSalesCentavos, saleTotal);
    else if (method === 'maya') mayaSalesCentavos = safeAdd(mayaSalesCentavos, saleTotal);

    // Canonical discount field: discountAmount
    if (Number.isSafeInteger(saleData.discountAmount) && saleData.discountAmount >= 0) {
      discountTotalCentavos = safeAdd(discountTotalCentavos, saleData.discountAmount);
    }

    // Historical COGS calculation: each finalized item stores its recorded costPrice
    if (!Array.isArray(saleData.items) || saleData.items.length === 0) {
      profitComplete = false;
    } else {
      for (const item of saleData.items) {
        const qty = item.quantity;
        const costPrice = item.costPrice;

        if (!Number.isSafeInteger(qty) || qty <= 0 || !Number.isSafeInteger(costPrice) || costPrice < 0) {
          profitComplete = false;
        } else if (profitComplete) {
          const itemCogs = safeMultiply(costPrice, qty);
          runningCogsCentavos = safeAdd(runningCogsCentavos, itemCogs);
        }
      }
    }
  }

  const aggregateCogsCentavos = profitComplete ? runningCogsCentavos : null;
  const aggregateGrossProfitCentavos = profitComplete
    ? totalGrossSalesCentavos - runningCogsCentavos
    : null;

  const startingCashCentavos = Number.isSafeInteger(selectedShift.startingCash)
    ? selectedShift.startingCash
    : 0;

  const physicalCashAdjustments = Number.isSafeInteger(selectedShift.physicalCashAdjustments)
    ? selectedShift.physicalCashAdjustments
    : 0;

  const expectedEndingCashCentavos = safeAdd(
    safeAdd(startingCashCentavos, cashSalesCentavos),
    physicalCashAdjustments
  );

  const endingCashCentavos = Number.isSafeInteger(selectedShift.endingCash)
    ? selectedShift.endingCash
    : null;

  const varianceCentavos = endingCashCentavos !== null
    ? endingCashCentavos - expectedEndingCashCentavos
    : null;

  const openedAtStr = selectedShift.openedAt?.toDate?.()?.toISOString?.() ||
    (typeof selectedShift.openedAt === 'string' ? selectedShift.openedAt : new Date().toISOString());

  const closedAtStr = selectedShift.closedAt?.toDate?.()?.toISOString?.() ||
    (typeof selectedShift.closedAt === 'string' ? selectedShift.closedAt : null);

  const currentReport: CashierShiftReportSummary = {
    shiftId: selectedShift.id,
    tenantId: identity.tenantId,
    cashierDisplayName: staffAccount.displayName || staffAccount.username || 'Cashier',
    staffAccountId: identity.staffAccountId,
    status: selectedShift.status === 'closed' ? 'closed' : 'open',
    openedAt: openedAtStr,
    closedAt: closedAtStr,
    startingCashCentavos,
    expectedEndingCashCentavos,
    endingCashCentavos,
    varianceCentavos,
    saleCount: validSaleCount,
    totalGrossSalesCentavos,
    cashSalesCentavos,
    gcashSalesCentavos,
    mayaSalesCentavos,
    discountTotalCentavos,
    aggregateCogsCentavos,
    aggregateGrossProfitCentavos,
    profitComplete
  };

  const historicalShifts: HistoricalShiftSummary[] = shiftsList.map((s) => ({
    shiftId: s.id,
    status: s.status === 'closed' ? 'closed' : 'open',
    openedAt: s.openedAt?.toDate?.()?.toISOString?.() || (typeof s.openedAt === 'string' ? s.openedAt : new Date().toISOString()),
    closedAt: s.closedAt?.toDate?.()?.toISOString?.() || (typeof s.closedAt === 'string' ? s.closedAt : null),
    totalGrossSalesCentavos: Number.isSafeInteger(s.totalShiftSales) ? s.totalShiftSales : 0,
    saleCount: Number.isSafeInteger(s.saleCount) ? s.saleCount : 0
  }));

  return {
    currentReport,
    historicalShifts
  };
}
