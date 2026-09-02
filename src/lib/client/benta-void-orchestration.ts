import { isBentaExactPoolCostedSale } from '@/lib/shared/benta-sale-mutation-guard';
import { validateReversalReason, isValidIdempotencyKey, type SaleReversalReceipt } from '@/lib/client/benta-sale-reversal-client';

export interface VoidSaleContext {
  saleId: string;
  isProtected: boolean;
  idempotencyKey: string;
  reason: string;
}

export interface SubmitSaleReversalFn {
  (options: {
    tenantId: string;
    saleId: string;
    reason: string;
    idempotencyKey: string;
    token?: string;
  }): Promise<SaleReversalReceipt>;
}

export interface DeleteSaleFn {
  (tenantId: string, saleId: string, uid: string, userName: string): Promise<void>;
}

export interface BentaVoidOrchestrationOptions {
  tenantId: string;
  sale: unknown;
  reason: string;
  uid: string;
  userName: string;
  submitSaleReversal: SubmitSaleReversalFn;
  deleteSale: DeleteSaleFn;
  idempotencyKey?: string;
  onSuccess?: () => void;
  lockRef?: { current: boolean };
}

export interface BentaVoidOrchestrationResult {
  success: boolean;
  context: VoidSaleContext;
  error?: {
    code: string;
    message: string;
  };
}

export function classifyBentaSaleVoid(sale: unknown): boolean {
  return isBentaExactPoolCostedSale(sale);
}

export function isValidVoidReason(reason: string): { valid: true; value: string } | { valid: false; message: string } {
  return validateReversalReason(reason);
}

export async function executeBentaVoid(
  options: BentaVoidOrchestrationOptions
): Promise<BentaVoidOrchestrationResult> {
  const { tenantId, sale, reason, uid, userName, submitSaleReversal, deleteSale, idempotencyKey, onSuccess, lockRef } = options;
  const isProtected = classifyBentaSaleVoid(sale);
  const saleId = (sale as Record<string, unknown>)?.id as string || '';

  if (lockRef?.current) {
    return {
      success: false,
      context: { saleId, isProtected, idempotencyKey: idempotencyKey || '', reason },
      error: { code: 'BUSY', message: 'A void operation is already in progress' },
    };
  }
  if (lockRef) {
    lockRef.current = true;
  }

  try {
    if (isProtected) {
      if (!idempotencyKey || typeof idempotencyKey !== 'string' || !isValidIdempotencyKey(idempotencyKey)) {
        return {
          success: false,
          context: { saleId, isProtected: true, idempotencyKey: idempotencyKey || '', reason },
          error: {
            code: 'INVALID_REQUEST',
            message: 'A valid idempotency key is required for protected void operations',
          },
        };
      }

      const reasonValidation = validateReversalReason(reason);
      if (!reasonValidation.valid) {
        return {
          success: false,
          context: { saleId, isProtected: true, idempotencyKey, reason },
          error: {
            code: 'INVALID_REQUEST',
            message: reasonValidation.message,
          },
        };
      }

      try {
        await submitSaleReversal({
          tenantId,
          saleId,
          reason: reasonValidation.value,
          idempotencyKey,
        });
        onSuccess?.();
        return { success: true, context: { saleId, isProtected: true, idempotencyKey, reason: reasonValidation.value } };
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        return {
          success: false,
          context: { saleId, isProtected: true, idempotencyKey, reason: reasonValidation.value },
          error: {
            code: error?.code || 'UNKNOWN_ERROR',
            message: error?.message || 'Reversal failed',
          },
        };
      }
    } else {
      try {
        await deleteSale(tenantId, saleId, uid, userName);
        onSuccess?.();
        return { success: true, context: { saleId, isProtected: false, idempotencyKey: idempotencyKey || '', reason } };
      } catch (err: unknown) {
        const error = err as { message?: string };
        return {
          success: false,
          context: { saleId, isProtected: false, idempotencyKey: idempotencyKey || '', reason },
          error: {
            code: 'DELETE_FAILED',
            message: error?.message || 'Delete failed',
          },
        };
      }
    }
  } finally {
    if (lockRef) {
      lockRef.current = false;
    }
  }
}
