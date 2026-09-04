import * as admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { CheckinError, CheckinErrorCode } from '@/lib/server/tsek-in-checkin-service';
import { TsekInAdminRequestSchema, tsekInAdminMutate } from '@/lib/server/tsek-in-admin-service';
import { createTsekInAdminRouteHandler } from '@/lib/server/tsek-in-admin-handler';
import { submitTsekInAdminMutation } from '@/lib/client/tsek-in-client';
import { resolveTsekInAdminIntent } from '@/lib/client/tsek-in-admin-intent';

let passed = 0;
let failed = 0;
function assert(condition: unknown, message: string): void {
  if (condition) { console.log(`  PASS ${message}`); passed++; }
  else { console.error(`  FAIL ${message}`); failed++; }
}
async function rejects(fn: () => unknown | Promise<unknown>, code: CheckinErrorCode, message: string): Promise<void> {
  try { await fn(); assert(false, message); }
  catch (error) { assert(error instanceof CheckinError && error.code === code, message); }
}

type Store = Record<string, any>;
function memoryFirestore(seed: Store) {
  const store: Store = structuredClone(seed);
  let generated = 0;
  const snap = (ref: any) => ({ id: ref.id, ref, exists: store[ref.path] !== undefined, data: () => store[ref.path] });
  const collection = (path: string): any => ({
    path,
    doc: (id?: string) => makeRef(`${path}/${id ?? `generated-${++generated}`}`),
  });
  const makeRef = (path: string): any => ({
    path,
    id: path.split('/').pop(),
    collection: (child: string) => collection(`${path}/${child}`),
    get: async () => snap(makeRef(path)),
  });
  const db = {
    collection: (name: string) => collection(name),
    runTransaction: async (work: (transaction: any) => Promise<any>) => work({
      getAll: async (...refs: any[]) => refs.map(snap),
      get: async (query: any) => ({
        docs: Object.keys(store)
          .filter((path) => path.startsWith(`${query.path}/`) && path.slice(query.path.length + 1).split('/').length === 1)
          .map((path) => snap(makeRef(path))),
      }),
      create: (ref: any, data: any) => {
        if (store[ref.path] !== undefined) throw new Error('already exists');
        store[ref.path] = data;
      },
      update: (ref: any, data: any) => {
        if (store[ref.path] === undefined) throw new Error('missing');
        store[ref.path] = { ...store[ref.path], ...data };
      },
    }),
  };
  return { db: db as any, store };
}

const tenantId = 'tenant-1';
const ownerUid = 'owner-1';
const baseTenant = { ownerUid, moduleType: 'tsek-in', subscriptionStatus: 'active' };
const ownerAuth = { verifyIdToken: async () => ({ uid: ownerUid, role: 'owner', tenantId }) } as any;
const now = () => admin.firestore.Timestamp.fromMillis(Date.parse('2026-09-04T04:00:00.000Z'));
const key1 = '123e4567-e89b-42d3-a456-426614174001';
const key2 = '123e4567-e89b-42d3-a456-426614174002';
const key3 = '123e4567-e89b-42d3-a456-426614174003';
const key4 = '123e4567-e89b-42d3-a456-426614174004';

async function main() {
  console.log('\nTSEK-IN ADMIN SERVICE TESTS');

  assert(!TsekInAdminRequestSchema.safeParse({ idempotencyKey: key1, operation: 'mark-room-ready', roomId: 'r1', status: 'Occupied' }).success, 'Arbitrary room status authority is rejected');
  assert(!TsekInAdminRequestSchema.safeParse({ idempotencyKey: key1, operation: 'update-global-settings', standardCheckInTime: '25:00', standardCheckOutTime: '12:00' }).success, 'Malformed global time is rejected');
  assert(!TsekInAdminRequestSchema.safeParse({ idempotencyKey: key1, operation: 'delete-room', roomId: 'r1', tenantId }).success, 'Tenant authority field is rejected');

  const memory = memoryFirestore({ [`tenants/${tenantId}`]: baseTenant });
  const createRequest = {
    idempotencyKey: key1,
    operation: 'create-room' as const,
    roomNumber: '101', type: 'Standard', rateCentavos: 150000,
    shortTimeRatesCentavos: { '3h': 50000 }, capacity: 2, bedType: '1 Queen', extraPaxFeeCentavos: 25000,
  };
  const created = await tsekInAdminMutate('owner-token', createRequest, { adminAuth: ownerAuth, adminFirestore: memory.db, now });
  const createdPath = `tenants/${tenantId}/rooms/${created.roomId}`;
  assert(created.operation === 'create-room' && created.affectedRooms === 1, 'Owner creates one room');
  assert(memory.store[createdPath].status === 'Available' && memory.store[createdPath].moduleId === 'tsek-in', 'Server owns new room status and module');
  assert(memory.store[createdPath].createdBy === `owner_${ownerUid}`, 'Authenticated actor is recorded by server');

  const replay = await tsekInAdminMutate('owner-token', createRequest, { adminAuth: ownerAuth, adminFirestore: memory.db, now });
  const roomPaths = Object.keys(memory.store).filter((path) => path.startsWith(`tenants/${tenantId}/rooms/`));
  assert(JSON.stringify(replay) === JSON.stringify(created) && roomPaths.length === 1, 'Create-room replay returns original receipt without duplication');
  await rejects(
    () => tsekInAdminMutate('owner-token', { ...createRequest, roomNumber: '102' }, { adminAuth: ownerAuth, adminFirestore: memory.db, now }),
    CheckinErrorCode.IDEMPOTENCY_CONFLICT,
    'Changed request with reused key fails closed',
  );

  memory.store[createdPath].status = 'Cleaning';
  const ready = await tsekInAdminMutate('owner-token', { idempotencyKey: key2, operation: 'mark-room-ready', roomId: created.roomId! }, { adminAuth: ownerAuth, adminFirestore: memory.db, now });
  assert(ready.affectedRooms === 1 && memory.store[createdPath].status === 'Available', 'Cleaning room can be marked ready');

  memory.store[createdPath].status = 'Occupied';
  const beforeOccupiedDelete = JSON.stringify(memory.store[createdPath]);
  await rejects(
    () => tsekInAdminMutate('owner-token', { idempotencyKey: key3, operation: 'delete-room', roomId: created.roomId! }, { adminAuth: ownerAuth, adminFirestore: memory.db, now }),
    CheckinErrorCode.ROOM_UNAVAILABLE,
    'Occupied room cannot be deleted',
  );
  assert(JSON.stringify(memory.store[createdPath]) === beforeOccupiedDelete, 'Rejected occupied-room deletion leaves room unchanged');

  memory.store[createdPath].status = 'Available';
  memory.store[`tenants/${tenantId}/rooms/r2`] = { id: 'r2', roomNumber: '102', type: 'Standard', rateCentavos: 100000, status: 'Available' };
  memory.store[`tenants/${tenantId}/rooms/r3`] = { id: 'r3', roomNumber: '201', type: 'Deluxe', rateCentavos: 200000, status: 'Available' };
  const rates = await tsekInAdminMutate('owner-token', {
    idempotencyKey: key3, operation: 'update-category-rates', category: 'Standard', rateCentavos: 175000,
    shortTimeRatesCentavos: { '6h': 90000 }, extraPaxFeeCentavos: 30000,
  }, { adminAuth: ownerAuth, adminFirestore: memory.db, now });
  assert(rates.affectedRooms === 2, 'Category-rate update reports matching active rooms');
  assert(memory.store[createdPath].rateCentavos === 175000 && memory.store[`tenants/${tenantId}/rooms/r2`].rateCentavos === 175000, 'Category-rate update changes every matching room');
  assert(memory.store[`tenants/${tenantId}/rooms/r3`].rateCentavos === 200000, 'Category-rate update leaves other categories unchanged');

  await tsekInAdminMutate('owner-token', {
    idempotencyKey: key4, operation: 'update-global-settings', standardCheckInTime: '14:00', standardCheckOutTime: '12:00',
  }, { adminAuth: ownerAuth, adminFirestore: memory.db, now });
  assert(memory.store[`tenants/${tenantId}`].standardCheckInTime === '14:00' && memory.store[`tenants/${tenantId}`].standardCheckOutTime === '12:00', 'Global times are server-written');

  const staffAuth = { verifyIdToken: async () => ({ uid: 'staff-auth', role: 'staff', tenantId, staffAccountId: 'staff-1', sessionVersion: 2 }) } as any;
  const staffMemory = memoryFirestore({
    [`tenants/${tenantId}`]: baseTenant,
    [`tenants/${tenantId}/staff_accounts/staff-1`]: { tenantId, authUid: 'staff-auth', sessionVersion: 2, status: 'active' },
  });
  await rejects(
    () => tsekInAdminMutate('staff-token', createRequest, { adminAuth: staffAuth, adminFirestore: staffMemory.db, now }),
    CheckinErrorCode.FORBIDDEN,
    'Staff cannot create rooms or change owner settings',
  );

  let forwardedToken = '';
  let forwardedBody: unknown;
  const route = createTsekInAdminRouteHandler({ service: (async (token: string, body: unknown) => {
    forwardedToken = token; forwardedBody = body;
    return { operation: 'delete-room', roomId: 'r1', affectedRooms: 1, committedAt: '2026-09-04T04:00:00.000Z', moduleId: 'tsek-in' };
  }) as typeof tsekInAdminMutate });
  const routeResponse = await route(new Request('http://localhost/api/tsek-in/admin', {
    method: 'POST', headers: { authorization: 'Bearer safe-token', 'content-type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: key1, operation: 'delete-room', roomId: 'r1' }),
  }));
  assert(routeResponse.status === 200 && routeResponse.headers.get('cache-control') === 'no-store', 'Admin route returns no-store success response');
  assert(forwardedToken === 'safe-token' && (forwardedBody as any).roomId === 'r1', 'Admin route forwards token and parsed body');

  const clientReceipt = await submitTsekInAdminMutation(
    { idempotencyKey: key1, operation: 'delete-room', roomId: 'r1' },
    { token: 'safe-token', fetchFn: (async () => Response.json({ operation: 'delete-room', roomId: 'r1', affectedRooms: 1, committedAt: '2026-09-04T04:00:00.000Z', moduleId: 'tsek-in' })) as typeof fetch },
  );
  assert(clientReceipt.operation === 'delete-room', 'Browser client validates admin receipt');

  const firstIntent = resolveTsekInAdminIntent({ operation: 'delete-room', roomId: 'r1' }, null, () => key1);
  const retryIntent = resolveTsekInAdminIntent({ operation: 'delete-room', roomId: 'r1' }, firstIntent.nextIntent, () => key2);
  assert(retryIntent.request.idempotencyKey === key1, 'Admin intent reuses key for an identical retry');

  const addRoomCode = readFileSync('src/components/dashboard/hospitality/modals/add-room-modal.tsx', 'utf8');
  const settingsCode = readFileSync('src/components/dashboard/hospitality/modals/settings-modal.tsx', 'utf8');
  const dashboardCode = readFileSync('src/components/dashboard/hospitality/tsek-in-dashboard.tsx', 'utf8');
  assert(!addRoomCode.includes('tsek-in-actions') && addRoomCode.includes('submitTsekInAdminMutation'), 'Add Room uses only the server API');
  assert(!settingsCode.includes('import { updateCategoryRates') && !settingsCode.includes("from 'firebase/firestore'") && !settingsCode.includes('initializeFirebase') && settingsCode.includes('submitTsekInAdminMutation'), 'Settings mutations use only the server API');
  assert(!dashboardCode.includes('updateRoomStatus') && !dashboardCode.includes('deleteRoom') && !dashboardCode.includes('handleMigrate'), 'Dashboard has no legacy room mutation or browser migration path');

  const rules = readFileSync('firestore.rules', 'utf8');
  const roomsRule = rules.indexOf('match /rooms/{roomId}');
  const bookingsRule = rules.indexOf('match /bookings/{bookingId}');
  const catchAll = rules.indexOf('match /{subcollection}/{document=**}');
  assert(roomsRule >= 0 && roomsRule < catchAll && bookingsRule >= 0 && bookingsRule < catchAll, 'Explicit Tsek-In rules precede tenant catch-all');
  assert(rules.slice(roomsRule, bookingsRule).includes('allow create, update, delete: if false'), 'Direct room mutations are denied');
  assert(rules.slice(bookingsRule, catchAll).includes('allow create, update, delete: if false'), 'Direct booking mutations are denied');
  assert(rules.includes('match /tsek_in_admin_idempotency/{key}') && rules.includes('allow read, write: if false'), 'Admin idempotency records are server-only');

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
