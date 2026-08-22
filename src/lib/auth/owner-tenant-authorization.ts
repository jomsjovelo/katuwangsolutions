import { Tenant } from '@/store/use-tenant-store';

export interface UserProfileAuthData {
  tenantId?: string | null;
  tenantIds?: (string | null | undefined)[];
  role?: string;
  approvalStatus?: string;
}

export interface AuthoritativeTenantResolutionResult {
  authorized: boolean;
  selectedTenantId: string | null;
  tenant: Tenant | null;
  error?: string;
}

/**
 * Resolves which tenant ID should be loaded based strictly on the user's
 * authoritative Firestore profile and an optional client-persisted preference.
 *
 * Invariant: Browser-persisted state is ONLY a UI preference. If the persisted
 * ID is not in the user's authoritative set, it is ignored and falls back
 * to the authoritative primary tenant.
 */
export function selectAuthoritativeTenantId(
  userProfile: UserProfileAuthData | null | undefined,
  persistedTenantId?: string | null
): { selectedTenantId: string | null; error?: string } {
  if (!userProfile) {
    return { selectedTenantId: null, error: 'User profile not found.' };
  }

  const authoritativeTenantIds: string[] = [
    userProfile.tenantId,
    ...(userProfile.tenantIds || [])
  ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

  if (authoritativeTenantIds.length === 0) {
    return { selectedTenantId: null, error: 'User is not associated with any business.' };
  }

  // If a persisted tenant ID exists AND is authoritatively permitted:
  if (persistedTenantId && authoritativeTenantIds.includes(persistedTenantId)) {
    return { selectedTenantId: persistedTenantId };
  }

  // Otherwise fall back to primary authoritative tenant:
  const primaryId = userProfile.tenantId || authoritativeTenantIds[0];
  return { selectedTenantId: primaryId };
}

/**
 * Validates the authoritative tenant document fetched from Firestore against
 * the authenticated user's identity.
 *
 * Invariant: Client-provided ownerUid or localStorage data can NEVER grant access.
 * The tenant document snapshot from Firestore must confirm that user.uid is
 * the ownerUid or in staffUids.
 */
export function validateAuthoritativeTenant(
  userUid: string,
  tenantDoc: Tenant | null | undefined
): { isAuthorized: boolean; error?: string } {
  if (!userUid) {
    return { isAuthorized: false, error: 'Unauthenticated user.' };
  }

  if (!tenantDoc) {
    return { isAuthorized: false, error: 'Business account not found or was deleted.' };
  }

  const isOwner = tenantDoc.ownerUid === userUid;
  const isStaff = Array.isArray(tenantDoc.staffUids) && tenantDoc.staffUids.includes(userUid);

  if (isOwner || isStaff) {
    return { isAuthorized: true };
  }

  return { isAuthorized: false, error: 'Unauthorized tenant access.' };
}
