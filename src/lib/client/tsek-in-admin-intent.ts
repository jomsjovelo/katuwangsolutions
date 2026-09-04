import type { TsekInAdminRequest } from './tsek-in-client';

export type TsekInAdminBusinessRequest = TsekInAdminRequest extends infer T
  ? T extends { idempotencyKey: string }
    ? Omit<T, 'idempotencyKey'>
    : never
  : never;

export interface TsekInAdminIntent {
  idempotencyKey: string;
  fingerprint: string;
}

export function resolveTsekInAdminIntent(
  payload: TsekInAdminBusinessRequest,
  previousIntent: TsekInAdminIntent | null,
  generateKey: () => string,
): { request: TsekInAdminRequest; nextIntent: TsekInAdminIntent } {
  const fingerprint = JSON.stringify(payload);
  const idempotencyKey = previousIntent?.fingerprint === fingerprint
    ? previousIntent.idempotencyKey
    : generateKey();
  return {
    request: { ...payload, idempotencyKey } as TsekInAdminRequest,
    nextIntent: { idempotencyKey, fingerprint },
  };
}
