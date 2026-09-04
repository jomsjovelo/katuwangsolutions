/**
 * Tsek-In Check-In Intent Helpers
 * Pure functions for building and resolving check-in request intents with idempotency.
 */

import type { CheckInRequest, PaymentChannel } from './tsek-in-client';

export interface TsekInCheckInFormValues {
  roomId: string;
  guestName: string;
  contactInfo: string;
  durationType: 'Daily' | '3h' | '6h' | '8h' | '12h';
  nights: string;
  extraPax: string;
  paymentMethod: PaymentChannel;
  initialPayment: string;
}

export interface TsekInCheckInBusinessPayload {
  roomId: string;
  guestName: string;
  contactInfo?: string;
  stayType: 'night' | 'short';
  duration: number;
  extraPax: number;
  paymentMethod: PaymentChannel;
  initialPaymentCentavos: number;
}

export interface TsekInCheckInIntent {
  idempotencyKey: string;
  businessPayload: TsekInCheckInBusinessPayload;
}

/**
 * Maps duration type to stay type and duration.
 */
function mapDurationTypeToStayType(durationType: string, nights: string): { stayType: 'night' | 'short'; duration: number } {
  if (durationType === 'Daily') {
    return { stayType: 'night', duration: parseInt(nights) || 1 };
  } else {
    return { stayType: 'short', duration: parseInt(durationType.replace('h', '')) };
  }
}

/**
 * Builds the business payload from form values (without idempotency key).
 * Omits blank optional contact information.
 */
export function buildTsekInCheckInBusinessPayload(formValues: TsekInCheckInFormValues): TsekInCheckInBusinessPayload {
  const { stayType, duration } = mapDurationTypeToStayType(formValues.durationType, formValues.nights);
  const contactInfo = formValues.contactInfo.trim();
  return {
    roomId: formValues.roomId,
    guestName: formValues.guestName.trim(),
    contactInfo: contactInfo || undefined,
    stayType,
    duration,
    extraPax: parseInt(formValues.extraPax || '0'),
    paymentMethod: formValues.paymentMethod,
    initialPaymentCentavos: Math.round(parseFloat(formValues.initialPayment || '0') * 100),
  };
}

/**
 * Fingerprints the business payload for intent comparison.
 * Excludes the idempotency key.
 */
function fingerprintBusinessPayload(payload: TsekInCheckInBusinessPayload): string {
  return JSON.stringify(payload);
}

/**
 * Resolves the check-in intent, handling idempotency key management.
 * - Identical business payload reuses the previous key.
 * - Changed business payload generates exactly one new key.
 * - Returns the final CheckInRequest and next intent state.
 */
export function resolveTsekInCheckInIntent(
  businessPayload: TsekInCheckInBusinessPayload,
  previousIntent: TsekInCheckInIntent | null,
  generateKey: () => string
): { request: CheckInRequest; nextIntent: TsekInCheckInIntent } {
  const fingerprint = fingerprintBusinessPayload(businessPayload);

  if (previousIntent && previousIntent.businessPayload !== undefined) {
    const prevFingerprint = fingerprintBusinessPayload(previousIntent.businessPayload);
    if (fingerprint === prevFingerprint) {
      // Identical business payload - reuse the previous key
      return {
        request: { ...businessPayload, idempotencyKey: previousIntent.idempotencyKey },
        nextIntent: previousIntent,
      };
    }
  }

  // Changed business payload (or first attempt) - generate new key
  const newKey = generateKey();
  const nextIntent: TsekInCheckInIntent = {
    idempotencyKey: newKey,
    businessPayload,
  };
  return {
    request: { ...businessPayload, idempotencyKey: newKey },
    nextIntent,
  };
}
