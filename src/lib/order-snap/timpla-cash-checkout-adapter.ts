/**
 * Timpla Cash Checkout Adapter
 *
 * Pure, tested adapter that converts an eligible Timpla counter cash checkout
 * into the exact input expected by OrderSnapController.acceptOfflineOrder().
 */

import type { OrderSnapController } from './order-snap-controller';
import {
  generateSecureId,
  type SecureCryptoProvider,
} from './secure-id-utils';

export type OrderSnapCashCheckoutRequest =
  Parameters<OrderSnapController['acceptOfflineOrder']>[0];

export interface TimplaCashCartItem {
  readonly menuItemId: string;
  readonly quantity: number;
  readonly notes?: string;
  readonly selectedModifiers?: ReadonlyArray<{
    readonly groupId: string;
    readonly optionId: string;
  }>;
}

export function createTimplaCashCheckoutAttemptId(
  crypto?: SecureCryptoProvider
): string {
  return generateSecureId('idemp_', crypto);
}

export function parseCashTenderedCentavos(value: string): number {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Cash tendered must be a nonempty decimal string');
  }

  if (/[\s,+\-eE]/.test(value)) {
    throw new Error('Cash tendered contains invalid characters');
  }

  const dotIndex = value.indexOf('.');
  let integerPart: string;
  let fractionalPart: string;

  if (dotIndex === -1) {
    integerPart = value;
    fractionalPart = '';
  } else {
    integerPart = value.slice(0, dotIndex);
    fractionalPart = value.slice(dotIndex + 1);
    if (fractionalPart.length === 0 || fractionalPart.length > 2) {
      throw new Error('Cash tendered decimal point requires one or two digits after it');
    }
  }

  if (integerPart.length === 0) {
    throw new Error('Cash tendered must have an integer part');
  }

  if (!/^\d+$/.test(integerPart)) {
    throw new Error('Cash tendered integer part is not numeric');
  }

  if (fractionalPart.length > 0 && !/^\d+$/.test(fractionalPart)) {
    throw new Error('Cash tendered fractional part is not numeric');
  }

  let fractionalPadded = fractionalPart;
  if (fractionalPart.length === 0) {
    fractionalPadded = '00';
  } else if (fractionalPart.length === 1) {
    fractionalPadded = fractionalPart + '0';
  }

  const combined = integerPart + fractionalPadded;
  let centavos = BigInt(combined);
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);

  if (centavos > maxSafe) {
    throw new Error('Cash tendered exceeds safe integer range');
  }

  return Number(centavos);
}

export interface BuildOrderSnapCashCheckoutParams {
  readonly cart: ReadonlyArray<TimplaCashCartItem>;
  readonly cashTendered: string;
  readonly idempotencyKey: string;
  readonly paymentMethod: string;
  readonly discountCentavos: number;
  readonly loyaltyDiscountCentavos: number;
  readonly activeTableId: string | null;
}

export function buildOrderSnapCashCheckoutRequest(
  params: BuildOrderSnapCashCheckoutParams
): OrderSnapCashCheckoutRequest {
  if (params.paymentMethod !== 'cash') {
    throw new Error('Only cash payments are supported for offline checkout');
  }

  if (params.discountCentavos !== 0) {
    throw new Error('Discounts are not supported for offline checkout');
  }

  if (params.loyaltyDiscountCentavos !== 0) {
    throw new Error('Loyalty discounts are not supported for offline checkout');
  }

  if (params.activeTableId !== null) {
    throw new Error('Table orders are not supported for offline checkout');
  }

  if (params.cart.length === 0) {
    throw new Error('Cart cannot be empty');
  }

  if (
    !params.idempotencyKey ||
    typeof params.idempotencyKey !== 'string' ||
    !/^idemp_[A-Za-z0-9_-]+$/.test(params.idempotencyKey)
  ) {
    throw new Error(
      'Idempotency key must be a nonempty idemp_-prefixed safe identifier'
    );
  }

  type RequestLine = OrderSnapCashCheckoutRequest['lines'][number];
  const lines: RequestLine[] = [];

  for (let i = 0; i < params.cart.length; i++) {
    const item = params.cart[i];

    if (
      !item.menuItemId ||
      typeof item.menuItemId !== 'string' ||
      item.menuItemId.trim() === ''
    ) {
      throw new Error('Menu item ID is required and cannot be blank');
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Quantity must be a positive integer');
    }

    if (item.notes !== undefined && item.notes !== null && item.notes.trim() !== '') {
      throw new Error('Notes are not supported for offline checkout');
    }

    const lineId = `${params.idempotencyKey}_line_${i}`;

    const selectedModifiers: RequestLine['selectedModifiers'] =
      item.selectedModifiers
        ? item.selectedModifiers.map((mod) => {
            if (!mod.groupId || mod.groupId.trim() === '') {
              throw new Error('Modifier group ID cannot be blank');
            }
            if (!mod.optionId || mod.optionId.trim() === '') {
              throw new Error('Modifier option ID cannot be blank');
            }
            return {
              groupId: mod.groupId,
              optionId: mod.optionId,
            };
          })
        : [];

    lines.push({
      lineId,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      selectedModifiers,
    });
  }

  const cashTenderedCentavos = parseCashTenderedCentavos(params.cashTendered);

  return {
    lines,
    cashTenderedCentavos,
    idempotencyKey: params.idempotencyKey,
  };
}