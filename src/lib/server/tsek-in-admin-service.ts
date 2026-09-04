import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  CheckinError,
  CheckinErrorCode,
  TSEK_IN_MODULE_ID,
  assertStaffMatches,
  assertTenantTsekInEntitlement,
  verifyTsekInIdentity,
} from './tsek-in-checkin-service';

const MAX_MONEY = 1_000_000_000_000;
const MoneySchema = z.number().int().min(0).max(MAX_MONEY);
const IdentifierSchema = z.string().trim().min(1).max(100);
const DisplayStringSchema = z.string().trim().min(1).max(200);
const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const ShortRatesSchema = z.object({
  '3h': MoneySchema.optional(),
  '6h': MoneySchema.optional(),
  '8h': MoneySchema.optional(),
  '12h': MoneySchema.optional(),
}).strict();

const IdempotentBase = { idempotencyKey: z.string().uuid() };

export const TsekInAdminRequestSchema = z.discriminatedUnion('operation', [
  z.object({
    ...IdempotentBase,
    operation: z.literal('create-room'),
    roomNumber: DisplayStringSchema,
    type: DisplayStringSchema,
    rateCentavos: MoneySchema,
    shortTimeRatesCentavos: ShortRatesSchema,
    capacity: z.number().int().min(1).max(100),
    bedType: DisplayStringSchema,
    extraPaxFeeCentavos: MoneySchema.optional(),
  }).strict(),
  z.object({ ...IdempotentBase, operation: z.literal('mark-room-ready'), roomId: IdentifierSchema }).strict(),
  z.object({ ...IdempotentBase, operation: z.literal('delete-room'), roomId: IdentifierSchema }).strict(),
  z.object({
    ...IdempotentBase,
    operation: z.literal('update-category-rates'),
    category: DisplayStringSchema,
    rateCentavos: MoneySchema,
    shortTimeRatesCentavos: ShortRatesSchema,
    extraPaxFeeCentavos: MoneySchema.optional(),
  }).strict(),
  z.object({
    ...IdempotentBase,
    operation: z.literal('update-global-settings'),
    standardCheckInTime: TimeSchema,
    standardCheckOutTime: TimeSchema,
  }).strict(),
]);

export type TsekInAdminRequest = z.infer<typeof TsekInAdminRequestSchema>;

export const TsekInAdminReceiptSchema = z.object({
  operation: z.enum(['create-room', 'mark-room-ready', 'delete-room', 'update-category-rates', 'update-global-settings']),
  roomId: z.string().min(1).max(128).optional(),
  affectedRooms: z.number().int().min(0).max(25),
  committedAt: z.string().min(1).max(64),
  moduleId: z.literal(TSEK_IN_MODULE_ID),
}).strict();

export type TsekInAdminReceipt = z.infer<typeof TsekInAdminReceiptSchema>;

export interface TsekInAdminServiceOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

function requestFingerprint(request: TsekInAdminRequest): string {
  const { idempotencyKey: _ignored, ...businessFields } = request;
  return createHash('sha256').update(JSON.stringify(businessFields)).digest('hex');
}

function idempotencyDocumentId(tenantId: string, key: string): string {
  return createHash('sha256').update(`${tenantId}:${key}`).digest('hex');
}

function requireOwner(role: 'owner' | 'staff'): void {
  if (role !== 'owner') throw new CheckinError(CheckinErrorCode.FORBIDDEN);
}

export async function tsekInAdminMutate(
  idToken: string,
  requestValue: unknown,
  options: TsekInAdminServiceOptions = {},
): Promise<TsekInAdminReceipt> {
  let request: TsekInAdminRequest;
  try {
    request = TsekInAdminRequestSchema.parse(requestValue);
  } catch {
    throw new CheckinError(CheckinErrorCode.INVALID_REQUEST);
  }

  const auth = options.adminAuth ?? getAdminAuth();
  const db = options.adminFirestore ?? getAdminFirestore();
  const now = options.now ?? (() => admin.firestore.Timestamp.now());
  const identity = await verifyTsekInIdentity(idToken, auth, db);
  if (request.operation !== 'mark-room-ready') requireOwner(identity.role);

  const tenantRef = db.collection('tenants').doc(identity.tenantId);
  const idempotencyRef = tenantRef.collection('tsek_in_admin_idempotency').doc(
    idempotencyDocumentId(identity.tenantId, request.idempotencyKey),
  );
  const roomId = 'roomId' in request ? request.roomId : undefined;
  const roomRef = roomId ? tenantRef.collection('rooms').doc(roomId) : undefined;
  const staffRef = identity.staffAccountId
    ? tenantRef.collection('staff_accounts').doc(identity.staffAccountId)
    : undefined;
  const fingerprint = requestFingerprint(request);

  try {
    return await db.runTransaction(async (transaction) => {
      const refs: admin.firestore.DocumentReference[] = [idempotencyRef, tenantRef];
      if (staffRef) refs.push(staffRef);
      if (roomRef) refs.push(roomRef);
      const snapshots = await transaction.getAll(...refs);
      const idempotencySnap = snapshots[0];
      const tenantSnap = snapshots[1];
      let cursor = 2;
      const staffSnap = staffRef ? snapshots[cursor++] : undefined;
      const roomSnap = roomRef ? snapshots[cursor] : undefined;

      if (!tenantSnap.exists) throw new CheckinError(CheckinErrorCode.TENANT_INELIGIBLE);
      const { ownerUid } = assertTenantTsekInEntitlement(tenantSnap.data());
      if (identity.role === 'owner' && ownerUid !== identity.uid) throw new CheckinError(CheckinErrorCode.FORBIDDEN);
      if (identity.role === 'staff') {
        assertStaffMatches(staffSnap?.exists ? staffSnap.data() : null, identity.tenantId, identity.uid, identity.sessionVersion);
      }

      if (idempotencySnap.exists) {
        const stored = idempotencySnap.data() as { fingerprint?: unknown; receipt?: unknown };
        if (stored.fingerprint !== fingerprint) throw new CheckinError(CheckinErrorCode.IDEMPOTENCY_CONFLICT);
        try {
          return TsekInAdminReceiptSchema.parse(stored.receipt);
        } catch {
          throw new CheckinError(CheckinErrorCode.FINANCIAL_INTEGRITY_ERROR);
        }
      }

      const roomsQueryNeeded = request.operation === 'create-room' || request.operation === 'update-category-rates';
      const roomsSnapshot = roomsQueryNeeded
        ? await transaction.get(tenantRef.collection('rooms'))
        : undefined;
      const committedAt = now();
      let receipt: TsekInAdminReceipt;

      if (request.operation === 'create-room') {
        requireOwner(identity.role);
        const activeRooms = roomsSnapshot!.docs.filter((doc) => !doc.data().deletedAt);
        if (activeRooms.length >= 25) throw new CheckinError(CheckinErrorCode.ROOM_UNAVAILABLE);
        const normalizedNumber = request.roomNumber.toLocaleLowerCase();
        if (activeRooms.some((doc) => String(doc.data().roomNumber ?? '').trim().toLocaleLowerCase() === normalizedNumber)) {
          throw new CheckinError(CheckinErrorCode.ROOM_UNAVAILABLE);
        }
        const createdRef = tenantRef.collection('rooms').doc();
        transaction.create(createdRef, {
          id: createdRef.id,
          roomNumber: request.roomNumber,
          type: request.type,
          rateCentavos: request.rateCentavos,
          shortTimeRatesCentavos: request.shortTimeRatesCentavos,
          capacity: request.capacity,
          bedType: request.bedType,
          status: 'Available',
          ...(request.extraPaxFeeCentavos !== undefined ? { extraPaxFeeCentavos: request.extraPaxFeeCentavos } : {}),
          moduleId: TSEK_IN_MODULE_ID,
          createdAt: committedAt,
          createdBy: identity.actorId,
        });
        receipt = { operation: request.operation, roomId: createdRef.id, affectedRooms: 1, committedAt: committedAt.toDate().toISOString(), moduleId: TSEK_IN_MODULE_ID };
      } else if (request.operation === 'mark-room-ready') {
        if (!roomSnap?.exists || roomSnap.data()?.deletedAt) throw new CheckinError(CheckinErrorCode.ROOM_NOT_FOUND);
        const currentStatus = roomSnap.data()?.status;
        if (currentStatus !== 'Cleaning' && currentStatus !== 'Available') throw new CheckinError(CheckinErrorCode.ROOM_UNAVAILABLE);
        const affectedRooms = currentStatus === 'Cleaning' ? 1 : 0;
        if (affectedRooms) transaction.update(roomRef!, { status: 'Available', updatedAt: committedAt, updatedBy: identity.actorId });
        receipt = { operation: request.operation, roomId: request.roomId, affectedRooms, committedAt: committedAt.toDate().toISOString(), moduleId: TSEK_IN_MODULE_ID };
      } else if (request.operation === 'delete-room') {
        requireOwner(identity.role);
        if (!roomSnap?.exists || roomSnap.data()?.deletedAt) throw new CheckinError(CheckinErrorCode.ROOM_NOT_FOUND);
        if (roomSnap.data()?.status === 'Occupied') throw new CheckinError(CheckinErrorCode.ROOM_UNAVAILABLE);
        transaction.update(roomRef!, { deletedAt: committedAt, deletedBy: identity.actorId });
        receipt = { operation: request.operation, roomId: request.roomId, affectedRooms: 1, committedAt: committedAt.toDate().toISOString(), moduleId: TSEK_IN_MODULE_ID };
      } else if (request.operation === 'update-category-rates') {
        requireOwner(identity.role);
        const matching = roomsSnapshot!.docs.filter((doc) => {
          const data = doc.data();
          return !data.deletedAt && data.type === request.category;
        });
        if (matching.length === 0) throw new CheckinError(CheckinErrorCode.ROOM_NOT_FOUND);
        for (const doc of matching) {
          transaction.update(doc.ref, {
            rateCentavos: request.rateCentavos,
            shortTimeRatesCentavos: request.shortTimeRatesCentavos,
            ...(request.extraPaxFeeCentavos !== undefined ? { extraPaxFeeCentavos: request.extraPaxFeeCentavos } : {}),
            updatedAt: committedAt,
            updatedBy: identity.actorId,
          });
        }
        receipt = { operation: request.operation, affectedRooms: matching.length, committedAt: committedAt.toDate().toISOString(), moduleId: TSEK_IN_MODULE_ID };
      } else {
        requireOwner(identity.role);
        transaction.update(tenantRef, {
          standardCheckInTime: request.standardCheckInTime,
          standardCheckOutTime: request.standardCheckOutTime,
          tsekInSettingsUpdatedAt: committedAt,
          tsekInSettingsUpdatedBy: identity.actorId,
        });
        receipt = { operation: request.operation, affectedRooms: 0, committedAt: committedAt.toDate().toISOString(), moduleId: TSEK_IN_MODULE_ID };
      }

      const validatedReceipt = TsekInAdminReceiptSchema.parse(receipt);
      transaction.create(idempotencyRef, {
        fingerprint,
        receipt: validatedReceipt,
        operation: request.operation,
        moduleId: TSEK_IN_MODULE_ID,
        createdAt: committedAt,
        actorId: identity.actorId,
      });
      return validatedReceipt;
    });
  } catch (error) {
    if (error instanceof CheckinError) throw error;
    if (error instanceof z.ZodError) throw new CheckinError(CheckinErrorCode.INVALID_REQUEST);
    throw new CheckinError(CheckinErrorCode.SERVICE_UNAVAILABLE);
  }
}
