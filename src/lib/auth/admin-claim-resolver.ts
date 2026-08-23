/**
 * Canonical administrator custom claim & document resolver.
 * Evaluates Firebase Auth custom token claims and authoritative Firestore /admins/{uid} documents.
 */

export function isMasterAdminClaim(claims: Record<string, any> | undefined | null): boolean {
  if (!claims || typeof claims !== 'object') return false;
  return (
    claims.admin === true ||
    claims.role === 'admin' ||
    claims.role === 'superadmin' ||
    claims.isMasterAdmin === true ||
    claims.adminRole === 'superadmin'
  );
}

export function isMasterAdminDocData(data: Record<string, any> | undefined | null): boolean {
  if (!data || typeof data !== 'object') return false;
  // If role is present, it must be 'superadmin' or 'admin'. If omitted on an existing admin doc, defaults to superadmin.
  const role = data.role;
  if (role === undefined || role === null || role === '') return true;
  return role === 'superadmin' || role === 'admin';
}

export async function resolveAdminStatus(
  claims: Record<string, any> | undefined | null,
  uid?: string | null,
  fetchAdminDoc?: (uid: string) => Promise<{ exists: boolean; data?: () => Record<string, any> | undefined } | null>
): Promise<boolean> {
  // 1. Fast path: Signed Token Claims
  if (isMasterAdminClaim(claims)) {
    return true;
  }

  // 2. Fallback: Authoritative Firestore /admins/{uid} Document
  if (fetchAdminDoc && uid) {
    try {
      const docSnap = await fetchAdminDoc(uid);
      if (docSnap && docSnap.exists) {
        const data = typeof docSnap.data === 'function' ? docSnap.data() : (docSnap as any).data;
        return isMasterAdminDocData(data || {});
      }
    } catch {
      return false;
    }
  }

  return false;
}
