import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { activeModules, isValidActiveModuleId } from '@/lib/app-data';
import {
  demoTenantIdForModule,
  isOfficialDemoIdentity,
} from '@/lib/demo-access';

export const DemoModuleBootstrapRequestSchema = z.object({
  moduleId: z.string().trim().min(1).max(64),
}).strict().refine((value) => isValidActiveModuleId(value.moduleId), {
  message: 'Unsupported module.',
});

export type DemoModuleBootstrapRequest = z.infer<typeof DemoModuleBootstrapRequestSchema>;

export interface DemoModuleBootstrapReceipt {
  moduleId: string;
  tenantId: string;
  status: 'ready';
}

export class DemoModuleBootstrapError extends Error {
  constructor(
    readonly code: 'INVALID_REQUEST' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'SERVICE_UNAVAILABLE',
    readonly httpStatus: number,
  ) {
    super(code);
    this.name = 'DemoModuleBootstrapError';
  }
}

export interface DemoModuleBootstrapOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

const DEMO_ROOMS = [
  { id: 'demo-room-101', roomNumber: '101', type: 'Standard', rateCentavos: 150_000, capacity: 2, bedType: '1 Queen' },
  { id: 'demo-room-102', roomNumber: '102', type: 'Standard', rateCentavos: 150_000, capacity: 2, bedType: '1 Queen' },
  { id: 'demo-room-103', roomNumber: '103', type: 'Standard', rateCentavos: 150_000, capacity: 2, bedType: '1 Queen' },
  { id: 'demo-room-201', roomNumber: '201', type: 'Deluxe', rateCentavos: 250_000, capacity: 3, bedType: '1 Queen, 1 Single' },
  { id: 'demo-room-202', roomNumber: '202', type: 'Deluxe', rateCentavos: 250_000, capacity: 3, bedType: '1 Queen, 1 Single' },
  { id: 'demo-room-301', roomNumber: '301', type: 'Suite', rateCentavos: 450_000, capacity: 4, bedType: '2 Queens' },
  { id: 'demo-room-villa-a', roomNumber: 'Villa A', type: 'Villa', rateCentavos: 800_000, capacity: 6, bedType: '3 Queens' },
] as const;

export async function bootstrapOfficialDemoModule(
  idToken: string,
  requestValue: unknown,
  options: DemoModuleBootstrapOptions = {},
): Promise<DemoModuleBootstrapReceipt> {
  let request: DemoModuleBootstrapRequest;
  try {
    request = DemoModuleBootstrapRequestSchema.parse(requestValue);
  } catch {
    throw new DemoModuleBootstrapError('INVALID_REQUEST', 400);
  }

  const auth = options.adminAuth ?? getAdminAuth();
  const db = options.adminFirestore ?? getAdminFirestore();
  const now = options.now ?? (() => admin.firestore.Timestamp.now());

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch {
    throw new DemoModuleBootstrapError('UNAUTHENTICATED', 401);
  }

  try {
    const profileSnap = await db.collection('users').doc(decoded.uid).get();
    const profile = profileSnap.exists ? profileSnap.data() : undefined;
    const rootTenantId = typeof profile?.tenantId === 'string' ? profile.tenantId : '';
    if (profile?.role !== 'owner' || !rootTenantId) {
      throw new DemoModuleBootstrapError('FORBIDDEN', 403);
    }
    const rootRef = db.collection('tenants').doc(rootTenantId);
    const rootSnap = await rootRef.get();
    const rootData = rootSnap.exists ? rootSnap.data() : undefined;

    if (!rootData || !isOfficialDemoIdentity({
      email: decoded.email,
      authUid: decoded.uid,
      tenantId: rootTenantId,
      ownerUid: rootData.ownerUid,
    })) {
      throw new DemoModuleBootstrapError('FORBIDDEN', 403);
    }

    const moduleId = request.moduleId;
    const module = activeModules.find((entry) => entry.id === moduleId);
    if (!module) throw new DemoModuleBootstrapError('INVALID_REQUEST', 400);

    const tenantId = demoTenantIdForModule(rootTenantId, moduleId);
    const targetRef = db.collection('tenants').doc(tenantId);
    const targetSnap = await targetRef.get();
    const committedAt = now();
    const moduleStatuses = Object.fromEntries(activeModules.map((entry) => [entry.id, 'active']));
    const unlockedModules = activeModules.map((entry) => entry.id);

    const batch = db.batch();
    batch.set(rootRef, {
      unlockedModules,
      moduleStatuses,
      pricingTier: 'foc',
      subscriptionStatus: 'active',
      pendingModuleRequests: [],
      lastPaymentRequestedModule: admin.firestore.FieldValue.delete(),
      updatedAt: committedAt,
    }, { merge: true });
    batch.set(targetRef, {
      name: `Demo - ${module.name}`,
      moduleType: moduleId,
      primaryModuleType: moduleId,
      ownerUid: decoded.uid,
      ownerEmail: decoded.email,
      staffUids: [],
      unlockedModules,
      moduleStatuses,
      pricingTier: 'foc',
      subscriptionStatus: 'active',
      pendingModuleRequests: [],
      updatedAt: committedAt,
      ...(!targetSnap.exists ? { createdAt: committedAt } : {}),
    }, { merge: true });

    if (moduleId === 'tsek-in') {
      for (const room of DEMO_ROOMS) {
        batch.set(targetRef.collection('rooms').doc(room.id), {
          ...room,
          status: 'Available',
          shortTimeRatesCentavos: {
            '3h': Math.round(room.rateCentavos * 0.45),
            '6h': Math.round(room.rateCentavos * 0.65),
            '8h': Math.round(room.rateCentavos * 0.8),
            '12h': room.rateCentavos,
          },
          extraPaxFeeCentavos: 50_000,
          createdAt: committedAt,
          updatedAt: committedAt,
        }, { merge: true });
      }
    }

    await batch.commit();
    return { moduleId, tenantId, status: 'ready' };
  } catch (error) {
    if (error instanceof DemoModuleBootstrapError) throw error;
    throw new DemoModuleBootstrapError('SERVICE_UNAVAILABLE', 503);
  }
}
