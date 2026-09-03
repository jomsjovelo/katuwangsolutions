import type * as admin from 'firebase-admin';
import { getAdminFirestore } from '@/firebase/admin';
import {
  adminAuthorizationErrorResponse,
  authorizeAdminToken,
  extractAdminBearerToken,
  type AdminAuthorizationDependencies,
} from '@/lib/server/admin-server-authorization';

export interface CommandCenterStats {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  pendingTenants: number;
  mrr: number;
  promoCount: number;
  standardCount: number;
  enterpriseCount: number;
  focCount: number;
}

export interface CommandCenterStatsDependencies extends AdminAuthorizationDependencies {
  adminFirestore?: admin.firestore.Firestore;
}

function safePrice(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

async function readCount(query: admin.firestore.Query): Promise<number> {
  const snapshot = await query.count().get();
  const count = snapshot.data().count;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Invalid aggregate count');
  }
  return count;
}

export async function fetchCommandCenterStats(
  idToken: string,
  dependencies: CommandCenterStatsDependencies = {},
): Promise<CommandCenterStats> {
  await authorizeAdminToken(idToken, undefined, dependencies);
  const db = dependencies.adminFirestore ?? getAdminFirestore();
  const tenants = db.collection('tenants');

  const [
    totalTenants,
    activeTenants,
    suspendedTenants,
    pendingTenants,
    promo99Count,
    promo50Count,
    standard199Count,
    standard100Count,
    enterpriseCount,
    focCount,
    configSnapshot,
  ] = await Promise.all([
    readCount(tenants),
    readCount(tenants.where('subscriptionStatus', '==', 'active')),
    readCount(tenants.where('subscriptionStatus', '==', 'suspended')),
    readCount(tenants.where('subscriptionStatus', '==', 'pending')),
    readCount(tenants.where('subscriptionStatus', '==', 'active').where('pricingTier', '==', 'promo_99')),
    readCount(tenants.where('subscriptionStatus', '==', 'active').where('pricingTier', '==', 'promo_50')),
    readCount(tenants.where('subscriptionStatus', '==', 'active').where('pricingTier', '==', 'standard_199')),
    readCount(tenants.where('subscriptionStatus', '==', 'active').where('pricingTier', '==', 'standard_100')),
    readCount(tenants.where('subscriptionStatus', '==', 'active').where('pricingTier', '==', 'enterprise')),
    readCount(tenants.where('subscriptionStatus', '==', 'active').where('pricingTier', '==', 'foc')),
    db.doc('system/config').get(),
  ]);

  const config = configSnapshot.exists ? configSnapshot.data() || {} : {};
  const promo99Price = safePrice(config.promoPrice, 99);
  const standard199Price = safePrice(config.standardPrice, 199);
  const enterprisePrice = safePrice(config.enterprisePrice, 499);
  const promo50Price = safePrice(config.promo50Price, 50);
  const standard100Price = safePrice(config.standard100Price, 100);

  return {
    totalTenants,
    activeTenants,
    suspendedTenants,
    pendingTenants,
    mrr:
      (promo99Count * promo99Price) +
      (promo50Count * promo50Price) +
      (standard199Count * standard199Price) +
      (standard100Count * standard100Price) +
      (enterpriseCount * enterprisePrice),
    promoCount: promo99Count + promo50Count,
    standardCount: standard199Count + standard100Count,
    enterpriseCount,
    focCount,
  };
}

export function createCommandCenterStatsRoute(
  dependencies: CommandCenterStatsDependencies = {},
) {
  return async function GET(request: Request): Promise<Response> {
    try {
      const token = extractAdminBearerToken(request);
      const stats = await fetchCommandCenterStats(token, dependencies);
      return Response.json(stats, { status: 200 });
    } catch (error) {
      return adminAuthorizationErrorResponse(error);
    }
  };
}
