/**
 * Pure request-intent helpers for Tsek-In checkout and stay extension.
 * Business payloads deliberately exclude browser-derived totals, timestamps,
 * tenant identifiers, and actor identity; the server owns those values.
 */

import type {
  CheckOutRequest,
  ExtensionRequest,
  PaymentChannel,
} from './tsek-in-client';

export interface TsekInCheckOutBusinessPayload {
  bookingId: string;
  extraCharges: Array<{ description: string; amountCentavos: number }>;
  paymentChannel: PaymentChannel;
}

export interface TsekInExtensionBusinessPayload {
  bookingId: string;
  extension: { type: 'night' | 'short'; duration: number };
  collectionCentavos: number;
  paymentChannel: PaymentChannel;
}

export interface TsekInCheckOutIntent {
  idempotencyKey: string;
  fingerprint: string;
}

export interface TsekInExtensionIntent {
  idempotencyKey: string;
  fingerprint: string;
}

export function buildTsekInCheckOutBusinessPayload(input: {
  bookingId: string;
  extraCharges: Array<{ description: string; amountCentavos: number }>;
  paymentChannel: PaymentChannel;
}): TsekInCheckOutBusinessPayload {
  return {
    bookingId: input.bookingId.trim(),
    extraCharges: input.extraCharges.map((charge) => ({
      description: charge.description.trim(),
      amountCentavos: charge.amountCentavos,
    })),
    paymentChannel: input.paymentChannel,
  };
}

export function buildTsekInExtensionBusinessPayload(input: {
  bookingId: string;
  durationType: 'Daily' | '3h' | '6h' | '8h' | '12h';
  nights: string;
  collection: string;
  paymentChannel: PaymentChannel;
}): TsekInExtensionBusinessPayload {
  const isNight = input.durationType === 'Daily';
  return {
    bookingId: input.bookingId.trim(),
    extension: {
      type: isNight ? 'night' : 'short',
      duration: isNight
        ? Number.parseInt(input.nights, 10)
        : Number.parseInt(input.durationType.replace('h', ''), 10),
    },
    collectionCentavos: Math.round(Number.parseFloat(input.collection || '0') * 100),
    paymentChannel: input.paymentChannel,
  };
}

function resolveIntent<TPayload, TRequest extends TPayload>(
  payload: TPayload,
  previousIntent: { idempotencyKey: string; fingerprint: string } | null,
  generateKey: () => string,
): { request: TRequest; nextIntent: { idempotencyKey: string; fingerprint: string } } {
  const fingerprint = JSON.stringify(payload);
  const idempotencyKey = previousIntent?.fingerprint === fingerprint
    ? previousIntent.idempotencyKey
    : generateKey();
  const nextIntent = { idempotencyKey, fingerprint };
  return {
    request: { ...payload, idempotencyKey } as TRequest,
    nextIntent,
  };
}

export function resolveTsekInCheckOutIntent(
  payload: TsekInCheckOutBusinessPayload,
  previousIntent: TsekInCheckOutIntent | null,
  generateKey: () => string,
): { request: CheckOutRequest; nextIntent: TsekInCheckOutIntent } {
  return resolveIntent<TsekInCheckOutBusinessPayload, CheckOutRequest>(payload, previousIntent, generateKey);
}

export function resolveTsekInExtensionIntent(
  payload: TsekInExtensionBusinessPayload,
  previousIntent: TsekInExtensionIntent | null,
  generateKey: () => string,
): { request: ExtensionRequest; nextIntent: TsekInExtensionIntent } {
  return resolveIntent<TsekInExtensionBusinessPayload, ExtensionRequest>(payload, previousIntent, generateKey);
}
