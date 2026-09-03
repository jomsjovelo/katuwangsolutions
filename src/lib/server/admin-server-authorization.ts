import type * as admin from 'firebase-admin';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { isAdminRole, type AdminRole } from '@/lib/auth/admin-claim-resolver';

export enum AdminAuthorizationErrorCode {
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  OPERATION_NOT_PERMITTED = 'OPERATION_NOT_PERMITTED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export class AdminAuthorizationError extends Error {
  constructor(
    readonly code: AdminAuthorizationErrorCode,
    readonly httpStatus: number,
    readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = 'AdminAuthorizationError';
  }
}

export interface AdminIdentity {
  uid: string;
  email: string | null;
  role: AdminRole;
}

export interface AdminAuthorizationDependencies {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
}

function resolveClaimRole(claims: Record<string, unknown>): AdminRole | null {
  if (isAdminRole(claims.adminRole)) return claims.adminRole;
  if (isAdminRole(claims.role)) return claims.role;
  if (claims.isMasterAdmin === true) return 'superadmin';
  if (claims.admin === true) return 'admin';
  return null;
}

function resolveDocumentRole(data: Record<string, unknown>): AdminRole | null {
  const role = data.role;
  if (role === undefined || role === null || role === '') return 'superadmin';
  return isAdminRole(role) ? role : null;
}

export function extractAdminBearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) {
    throw new AdminAuthorizationError(
      AdminAuthorizationErrorCode.AUTHENTICATION_REQUIRED,
      401,
      'Administrator authentication is required.',
    );
  }
  return match[1];
}

export async function authorizeAdminToken(
  idToken: string,
  allowedRoles: readonly AdminRole[] = ['superadmin', 'admin', 'billing', 'support', 'auditor'],
  dependencies: AdminAuthorizationDependencies = {},
): Promise<AdminIdentity> {
  const auth = dependencies.adminAuth ?? getAdminAuth();
  const db = dependencies.adminFirestore ?? getAdminFirestore();

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch {
    throw new AdminAuthorizationError(
      AdminAuthorizationErrorCode.AUTHENTICATION_REQUIRED,
      401,
      'Administrator authentication is required.',
    );
  }

  let adminSnapshot: admin.firestore.DocumentSnapshot;
  try {
    adminSnapshot = await db.doc(`admins/${decoded.uid}`).get();
  } catch {
    throw new AdminAuthorizationError(
      AdminAuthorizationErrorCode.SERVICE_UNAVAILABLE,
      503,
      'Command Center authorization is temporarily unavailable.',
    );
  }

  // A present administrator document is authoritative. Invalid roles fail
  // closed even if a stale token still contains an older administrator claim.
  const role = adminSnapshot.exists
    ? resolveDocumentRole((adminSnapshot.data() || {}) as Record<string, unknown>)
    : resolveClaimRole(decoded as unknown as Record<string, unknown>);

  if (!role || !allowedRoles.includes(role)) {
    throw new AdminAuthorizationError(
      AdminAuthorizationErrorCode.OPERATION_NOT_PERMITTED,
      403,
      'This administrator role cannot perform the requested operation.',
    );
  }

  return {
    uid: decoded.uid,
    email: typeof decoded.email === 'string' ? decoded.email : null,
    role,
  };
}

export function adminAuthorizationErrorResponse(error: unknown): Response {
  if (error instanceof AdminAuthorizationError) {
    return Response.json(
      { error: error.userMessage, category: error.code },
      { status: error.httpStatus },
    );
  }
  return Response.json(
    {
      error: 'Command Center service is temporarily unavailable.',
      category: AdminAuthorizationErrorCode.SERVICE_UNAVAILABLE,
    },
    { status: 503 },
  );
}
