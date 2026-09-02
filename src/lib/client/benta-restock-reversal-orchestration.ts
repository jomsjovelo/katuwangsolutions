import {
  isRetryableError,
  isValidIdempotencyKey,
  RestockReversalError,
  validateReversalReason,
  type RestockReversalReceipt,
} from '@/lib/client/benta-restock-reversal-client';

export function classifyBentaRestockReversal(po: { costingVersion?: string } | null | undefined): boolean {
  if (!po) return false;
  return po.costingVersion === 'moving_average_v1';
}

export interface RestockReversalContext {
  purchaseOrderId: string;
  isSmartPO: boolean;
  idempotencyKey: string;
  reason: string;
}

export interface SubmitRestockReversalFn {
  (options: {
    tenantId: string;
    purchaseOrderId: string;
    reason: string;
    idempotencyKey: string;
    token?: string;
  }): Promise<RestockReversalReceipt>;
}

export interface VoidPurchaseOrderFn {
  (tenantId: string, poId: string, userId: string, userName: string): Promise<boolean>;
}

export interface BentaRestockReversalOrchestrationOptions {
  tenantId: string;
  purchaseOrder: {
    id: string;
    costingVersion?: string;
    paymentMethod?: string;
  } | null;
  reason: string;
  uid: string;
  userName: string;
  submitRestockReversal: SubmitRestockReversalFn;
  voidPurchaseOrder: VoidPurchaseOrderFn;
  idempotencyKey?: string;
  onSuccess?: (receipt?: RestockReversalReceipt) => void;
  lockRef?: { current: boolean };
}

export interface BentaRestockReversalOrchestrationResult {
  success: boolean;
  context: RestockReversalContext;
  receipt?: RestockReversalReceipt;
  error?: {
    code: string;
    message: string;
    isRetryable?: boolean;
  };
}

export function isValidRestockReversalReason(reason: string): { valid: true; value: string } | { valid: false; message: string } {
  return validateReversalReason(reason);
}

export async function executeBentaRestockReversalOrchestration(
  options: BentaRestockReversalOrchestrationOptions
): Promise<BentaRestockReversalOrchestrationResult> {
  const {
    tenantId,
    purchaseOrder,
    reason,
    uid,
    userName,
    submitRestockReversal,
    voidPurchaseOrder,
    idempotencyKey,
    onSuccess,
    lockRef,
  } = options;

  const poId = purchaseOrder?.id || '';
  const isSmartPO = classifyBentaRestockReversal(purchaseOrder);

  if (lockRef?.current) {
    return {
      success: false,
      context: { purchaseOrderId: poId, isSmartPO, idempotencyKey: idempotencyKey || '', reason },
      error: { code: 'BUSY', message: 'May reversal operation na nagsasagawa.' },
    };
  }

  if (lockRef) {
    lockRef.current = true;
  }

  try {
    if (!purchaseOrder || poId.length === 0 || tenantId.length === 0 || uid.length === 0) {
      return {
        success: false,
        context: { purchaseOrderId: poId, isSmartPO, idempotencyKey: idempotencyKey || '', reason },
        error: { code: 'INVALID_REQUEST', message: 'Hindi kumpleto ang reversal request.' },
      };
    }
    if (isSmartPO) {
      if (!idempotencyKey || typeof idempotencyKey !== 'string' || !isValidIdempotencyKey(idempotencyKey)) {
        return {
          success: false,
          context: { purchaseOrderId: poId, isSmartPO: true, idempotencyKey: idempotencyKey || '', reason },
          error: {
            code: 'INVALID_REQUEST',
            message: 'Kailangan ng valid na idempotency key para sa Smart PO reversal.',
          },
        };
      }

      const reasonValidation = isValidRestockReversalReason(reason);
      if (!reasonValidation.valid) {
        return {
          success: false,
          context: { purchaseOrderId: poId, isSmartPO: true, idempotencyKey, reason },
          error: {
            code: 'INVALID_REQUEST',
            message: reasonValidation.message,
          },
        };
      }

      try {
        const receipt = await submitRestockReversal({
          tenantId,
          purchaseOrderId: poId,
          reason: reasonValidation.value,
          idempotencyKey,
        });
        onSuccess?.(receipt);
        return { success: true, context: { purchaseOrderId: poId, isSmartPO: true, idempotencyKey, reason: reasonValidation.value }, receipt };
      } catch (err: unknown) {
        const error = err instanceof RestockReversalError
          ? err
          : new RestockReversalError('Reversal failed', 'UNKNOWN_ERROR', 500);
        const isRetryable = isRetryableError(error);
        return {
          success: false,
          context: { purchaseOrderId: poId, isSmartPO: true, idempotencyKey, reason: reasonValidation.value },
          error: {
            code: error?.code || 'UNKNOWN_ERROR',
            message: error?.message || 'Reversal failed',
            isRetryable,
          },
        };
      }
    } else {
      try {
        await voidPurchaseOrder(tenantId, poId, uid, userName);
        onSuccess?.();
        return { success: true, context: { purchaseOrderId: poId, isSmartPO: false, idempotencyKey: idempotencyKey || '', reason } };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Legacy void failed';
        return {
          success: false,
          context: { purchaseOrderId: poId, isSmartPO: false, idempotencyKey: idempotencyKey || '', reason },
          error: {
            code: 'VOID_FAILED',
            message,
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
