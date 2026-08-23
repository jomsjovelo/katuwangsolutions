/**
 * Canonical administrator custom claim resolver.
 * Evaluates Firebase Auth custom token claims to determine administrative access.
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
