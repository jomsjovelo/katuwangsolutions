import * as admin from 'firebase-admin';
import { getAdminFirestore } from '@/firebase/admin';
import {
  AdminAuthorizationError,
  adminAuthorizationErrorResponse,
  authorizeAdminToken,
  extractAdminBearerToken,
  type AdminAuthorizationDependencies,
  type AdminIdentity,
} from '@/lib/server/admin-server-authorization';

export type WithdrawalDecision = 'mark_paid' | 'reject';

export enum WithdrawalDecisionErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  STATE_CONFLICT = 'STATE_CONFLICT',
  DATA_INTEGRITY_ERROR = 'DATA_INTEGRITY_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export class WithdrawalDecisionError extends Error {
  constructor(
    readonly code: WithdrawalDecisionErrorCode,
    readonly httpStatus: number,
    readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = 'WithdrawalDecisionError';
  }
}

export interface WithdrawalDecisionReceipt {
  withdrawalId: string;
  status: 'paid' | 'rejected';
  replayed: boolean;
}

export interface WithdrawalDecisionDependencies extends AdminAuthorizationDependencies {
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

function isValidDocumentId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function readMoney(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new WithdrawalDecisionError(
      WithdrawalDecisionErrorCode.DATA_INTEGRITY_ERROR,
      409,
      'The withdrawal record requires administrator review.',
    );
  }
  const centavos = Math.round(value * 100);
  if (!Number.isSafeInteger(centavos) || Math.abs((centavos / 100) - value) > Number.EPSILON) {
    throw new WithdrawalDecisionError(
      WithdrawalDecisionErrorCode.DATA_INTEGRITY_ERROR,
      409,
      'The withdrawal record requires administrator review.',
    );
  }
  return value;
}

function readNonNegativeMoney(value: unknown, fallback: unknown): number {
  const selected = value === undefined ? fallback : value;
  if (typeof selected !== 'number' || !Number.isFinite(selected) || selected < 0) {
    throw new WithdrawalDecisionError(
      WithdrawalDecisionErrorCode.DATA_INTEGRITY_ERROR,
      409,
      'The withdrawal record requires administrator review.',
    );
  }
  return selected;
}

function receipt(withdrawalId: string, status: 'paid' | 'rejected', replayed: boolean): WithdrawalDecisionReceipt {
  return { withdrawalId, status, replayed };
}

export async function decideReferralWithdrawal(
  idToken: string,
  withdrawalId: string,
  decision: WithdrawalDecision,
  dependencies: WithdrawalDecisionDependencies = {},
): Promise<WithdrawalDecisionReceipt> {
  if (!isValidDocumentId(withdrawalId) || !['mark_paid', 'reject'].includes(decision)) {
    throw new WithdrawalDecisionError(
      WithdrawalDecisionErrorCode.INVALID_REQUEST,
      400,
      'The withdrawal decision request is invalid.',
    );
  }

  const identity: AdminIdentity = await authorizeAdminToken(
    idToken,
    ['superadmin', 'admin', 'billing'],
    dependencies,
  );
  const db = dependencies.adminFirestore ?? getAdminFirestore();
  const processedAt = dependencies.now?.() ?? admin.firestore.Timestamp.now();

  try {
    return await db.runTransaction(async (transaction) => {
      const withdrawalRef = db.doc(`referral_withdrawals/${withdrawalId}`);
      const withdrawalSnapshot = await transaction.get(withdrawalRef);
      if (!withdrawalSnapshot.exists) {
        throw new WithdrawalDecisionError(
          WithdrawalDecisionErrorCode.NOT_FOUND,
          404,
          'Withdrawal request not found.',
        );
      }

      const withdrawal = withdrawalSnapshot.data() || {};
      const currentStatus = withdrawal.status;
      if (decision === 'mark_paid' && currentStatus === 'paid') {
        return receipt(withdrawalId, 'paid', true);
      }
      if (decision === 'reject' && currentStatus === 'rejected') {
        return receipt(withdrawalId, 'rejected', true);
      }
      if (currentStatus !== 'pending') {
        throw new WithdrawalDecisionError(
          WithdrawalDecisionErrorCode.STATE_CONFLICT,
          409,
          'This withdrawal request has already been resolved.',
        );
      }

      let userRef: admin.firestore.DocumentReference | null = null;
      let refundedBalance: number | null = null;
      if (decision === 'reject') {
        const uid = withdrawal.uid;
        if (typeof uid !== 'string' || !isValidDocumentId(uid)) {
          throw new WithdrawalDecisionError(
            WithdrawalDecisionErrorCode.DATA_INTEGRITY_ERROR,
            409,
            'The withdrawal record requires administrator review.',
          );
        }
        const amountPesos = readMoney(withdrawal.amountPesos);
        userRef = db.doc(`users/${uid}`);
        const userSnapshot = await transaction.get(userRef);
        if (!userSnapshot.exists) {
          throw new WithdrawalDecisionError(
            WithdrawalDecisionErrorCode.DATA_INTEGRITY_ERROR,
            409,
            'The withdrawal record requires administrator review.',
          );
        }
        const user = userSnapshot.data() || {};
        const currentBalance = readNonNegativeMoney(user.availableBalance, user.referralEarnings);
        refundedBalance = currentBalance + amountPesos;
        if (!Number.isFinite(refundedBalance)) {
          throw new WithdrawalDecisionError(
            WithdrawalDecisionErrorCode.DATA_INTEGRITY_ERROR,
            409,
            'The withdrawal record requires administrator review.',
          );
        }
      }

      // All reads are complete before the first write.
      if (userRef && refundedBalance !== null) {
        transaction.update(userRef, {
          availableBalance: refundedBalance,
          updatedAt: processedAt,
        });
      }

      const finalStatus = decision === 'mark_paid' ? 'paid' : 'rejected';
      transaction.update(withdrawalRef, {
        status: finalStatus,
        processedAt,
        processedBy: identity.email || identity.uid,
        processedByUid: identity.uid,
      });
      transaction.set(db.doc(`admin_logs/withdrawal_${withdrawalId}_${decision}`), {
        adminUid: identity.uid,
        adminEmail: identity.email || 'Unknown',
        action: decision === 'mark_paid' ? 'MARK_WITHDRAWAL_PAID' : 'REJECT_WITHDRAWAL',
        details: decision === 'mark_paid'
          ? `Marked withdrawal ${withdrawalId} as paid`
          : `Rejected withdrawal ${withdrawalId} and restored its authoritative balance`,
        targetId: withdrawalId,
        timestamp: processedAt,
      });

      return receipt(withdrawalId, finalStatus, false);
    });
  } catch (error) {
    if (error instanceof WithdrawalDecisionError) throw error;
    throw new WithdrawalDecisionError(
      WithdrawalDecisionErrorCode.SERVICE_UNAVAILABLE,
      503,
      'Withdrawal processing is temporarily unavailable.',
    );
  }
}

function withdrawalErrorResponse(error: unknown): Response {
  if (error instanceof AdminAuthorizationError) return adminAuthorizationErrorResponse(error);
  if (error instanceof WithdrawalDecisionError) {
    return Response.json(
      { error: error.userMessage, category: error.code },
      { status: error.httpStatus },
    );
  }
  return Response.json(
    {
      error: 'Withdrawal processing is temporarily unavailable.',
      category: WithdrawalDecisionErrorCode.SERVICE_UNAVAILABLE,
    },
    { status: 503 },
  );
}

export function createWithdrawalDecisionRoute(
  dependencies: WithdrawalDecisionDependencies = {},
) {
  return async function POST(request: Request, withdrawalId: string): Promise<Response> {
    try {
      const token = extractAdminBearerToken(request);
      const body: unknown = await request.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new WithdrawalDecisionError(
          WithdrawalDecisionErrorCode.INVALID_REQUEST,
          400,
          'The withdrawal decision request is invalid.',
        );
      }
      const record = body as Record<string, unknown>;
      if (Object.keys(record).length !== 1 || (record.action !== 'mark_paid' && record.action !== 'reject')) {
        throw new WithdrawalDecisionError(
          WithdrawalDecisionErrorCode.INVALID_REQUEST,
          400,
          'The withdrawal decision request is invalid.',
        );
      }
      const result = await decideReferralWithdrawal(token, withdrawalId, record.action, dependencies);
      return Response.json(result, { status: 200 });
    } catch (error) {
      return withdrawalErrorResponse(error);
    }
  };
}
