export const OFFICIAL_DEMO_EMAIL = 'demo@katuwangsolutions.com';

export interface DemoIdentityInput {
  email?: string | null;
  authUid?: string | null;
  tenantId?: string | null;
  ownerUid?: string | null;
}

export function isOfficialDemoIdentity(input: DemoIdentityInput): boolean {
  return input.email?.trim().toLowerCase() === OFFICIAL_DEMO_EMAIL
    && typeof input.tenantId === 'string'
    && input.tenantId.length > 0
    && typeof input.authUid === 'string'
    && input.authUid.length > 0
    && input.ownerUid === input.authUid;
}

export function demoTenantIdForModule(rootTenantId: string, moduleId: string): string {
  return `${rootTenantId}_${moduleId}`;
}
