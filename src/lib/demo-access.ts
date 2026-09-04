export const OFFICIAL_DEMO_EMAIL = 'demo@katuwangsolutions.com';
export const DEMO_ROOT_TENANT_ID = 'demo';

export interface DemoIdentityInput {
  email?: string | null;
  authUid?: string | null;
  tenantId?: string | null;
  ownerUid?: string | null;
}

export function isOfficialDemoIdentity(input: DemoIdentityInput): boolean {
  return input.email?.trim().toLowerCase() === OFFICIAL_DEMO_EMAIL
    && input.tenantId === DEMO_ROOT_TENANT_ID
    && typeof input.authUid === 'string'
    && input.authUid.length > 0
    && input.ownerUid === input.authUid;
}

export function demoTenantIdForModule(moduleId: string): string {
  return `${DEMO_ROOT_TENANT_ID}_${moduleId}`;
}
