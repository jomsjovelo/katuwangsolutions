export const PRODUCTION_PREFLIGHT_ACKNOWLEDGEMENT = 'MARKETING_DIRECTOR_READ_ONLY_PRODUCTION_PREFLIGHT';

export interface PreflightRecord { id: string; path?: string; data: Record<string, unknown>; }
export interface BentaTenantPreflightScope {
  tenant: PreflightRecord;
  businessCodeRelationship?: PreflightRecord;
  staff: PreflightRecord[];
  usernameRelationships: PreflightRecord[];
  shifts: PreflightRecord[];
  products: PreflightRecord[];
}
export interface SecureCashierPreflightInput { tenants: BentaTenantPreflightScope[]; }
export interface SecureCashierPreflightReport {
  authoritativeBentaTenants: number;
  activeBentaTenants: number;
  bentaTenantsWithoutActiveEntitlement: number;
  cashierRecords: number;
  cashierRecordsMissingRequiredIdentifiers: number;
  duplicateOrContradictoryCashierRelationships: number;
  modernCredentialRecords: number;
  legacyCredentialRecords: number;
  unresolvedLegacyOpenShifts: number;
  incompatibleProducts: number;
  productsMissingAuthoritativeFields: number;
  usableCompanyControlledSmokeTestIdentities: number;
  smokeTestReady: boolean;
}

export function assertProductionPreflightAuthorized(args: string[], env: Record<string, string | undefined>): string {
  const projectArg = args.find((value) => value.startsWith('--project-id='))?.slice('--project-id='.length).trim();
  const acknowledgement = args.find((value) => value.startsWith('--authorization='))?.slice('--authorization='.length);
  if (!projectArg || projectArg.startsWith('demo-') || env.FIRESTORE_EMULATOR_HOST ||
      env.SECURE_CASHIER_PREFLIGHT_AUTHORIZED !== 'true' || acknowledgement !== PRODUCTION_PREFLIGHT_ACKNOWLEDGEMENT) {
    throw new Error('SECURITY_FAIL_CLOSED: production preflight requires separate explicit Director authorization');
  }
  return projectArg;
}

/** Collects only tenant-scoped records after authoritative Benta tenant discovery. */
export async function collectBentaPreflightScopes(db: any): Promise<BentaTenantPreflightScope[]> {
  const tenantSnapshots = await db.collection('tenants').where('moduleType', '==', 'benta-snap').get();
  const record = (document: any): PreflightRecord => ({
    id: document.id, path: document.ref.path, data: document.data() || {}
  });
  const tenants: BentaTenantPreflightScope[] = [];
  for (const tenantDocument of tenantSnapshots.docs) {
    const tenant = record(tenantDocument);
    if (tenant.data.subscriptionStatus !== 'active') {
      tenants.push({ tenant, staff: [], usernameRelationships: [], shifts: [], products: [] });
      continue;
    }
    const [staffSnapshot, shiftSnapshot, productSnapshot] = await Promise.all([
      tenantDocument.ref.collection('staff_accounts').get(),
      tenantDocument.ref.collection('shifts').get(),
      tenantDocument.ref.collection('products').get()
    ]);
    const businessCode = typeof tenant.data.businessCode === 'string' ? tenant.data.businessCode : '';
    const businessCodeSnapshot = businessCode ? await db.collection('business_codes').doc(businessCode).get() : null;
    const usernameRelationships: PreflightRecord[] = [];
    for (const staffDocument of staffSnapshot.docs) {
      const usernameLower = staffDocument.data().usernameLower;
      if (typeof usernameLower !== 'string' || !usernameLower) continue;
      const relationship = await db.collection('staff_usernames').doc(usernameLower).get();
      if (relationship.exists) usernameRelationships.push(record(relationship));
    }
    tenants.push({
      tenant,
      businessCodeRelationship: businessCodeSnapshot?.exists ? record(businessCodeSnapshot) : undefined,
      staff: staffSnapshot.docs.map(record), usernameRelationships,
      shifts: shiftSnapshot.docs.map(record), products: productSnapshot.docs.map(record)
    });
  }
  return tenants;
}

function isModernCredential(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('scrypt:v2:');
}

function isCompleteCashier(record: PreflightRecord, tenantId: string): boolean {
  const data = record.data;
  return Boolean(record.id && data.tenantId === tenantId && typeof data.authUid === 'string' && data.authUid &&
    typeof data.usernameLower === 'string' && data.usernameLower && Number.isSafeInteger(data.sessionVersion) &&
    ['active', 'disabled'].includes(String(data.status)));
}

function isValidBusinessCodeRelationship(scope: BentaTenantPreflightScope): boolean {
  const businessCode = scope.tenant.data.businessCode;
  const relationship = scope.businessCodeRelationship;
  return typeof businessCode === 'string' && Boolean(businessCode) && Boolean(relationship) &&
    relationship!.id === businessCode && relationship!.data.tenantId === scope.tenant.id;
}

export function analyzeSecureCashierCompatibility(input: SecureCashierPreflightInput): SecureCashierPreflightReport {
  const bentaScopes = input.tenants.filter((scope) => scope.tenant.data.moduleType === 'benta-snap');
  const activeScopes = bentaScopes.filter((scope) => scope.tenant.data.subscriptionStatus === 'active');
  let cashierRecords = 0, missing = 0, contradictions = 0, modern = 0, legacy = 0;
  let unresolvedLegacyOpenShifts = 0, incompatibleProducts = 0, productsMissingAuthoritativeFields = 0, usableSmoke = 0;

  for (const scope of activeScopes) {
    const tenantId = scope.tenant.id;
    const shiftById = new Map(scope.shifts.map((shift) => [shift.id, shift]));
    const usernameById = new Map(scope.usernameRelationships.map((relationship) => [relationship.id, relationship]));
    const seenAuth = new Set<string>(), seenUsername = new Set<string>(), contradictoryStaff = new Set<string>();
    const openByAccount = new Map<string, number>(), openByActor = new Map<string, number>();

    for (const shift of scope.shifts) {
      const data = shift.data;
      if (data.status !== 'open') continue;
      const accountId = typeof data.staffAccountId === 'string' ? data.staffAccountId : '';
      const actorId = typeof data.staffId === 'string' ? data.staffId : '';
      if (data.reconciliationVersion !== 1 || !accountId || !actorId) unresolvedLegacyOpenShifts++;
      if (data.tenantId !== tenantId || (accountId && actorId && actorId !== `staff_${accountId}`)) {
        contradictions++;
        if (accountId) contradictoryStaff.add(accountId);
      }
      if (accountId) openByAccount.set(accountId, (openByAccount.get(accountId) || 0) + 1);
      if (actorId) openByActor.set(actorId, (openByActor.get(actorId) || 0) + 1);
    }
    for (const [accountId, count] of openByAccount) {
      if (count > 1) { contradictions += count - 1; contradictoryStaff.add(accountId); }
    }
    for (const count of openByActor.values()) if (count > 1) contradictions += count - 1;

    for (const record of scope.staff) {
      cashierRecords++;
      const data = record.data;
      const authUid = typeof data.authUid === 'string' ? data.authUid : '';
      const usernameLower = typeof data.usernameLower === 'string' ? data.usernameLower : '';
      const complete = isCompleteCashier(record, tenantId);
      if (!complete) missing++;
      let staffContradiction = false;
      if ((authUid && seenAuth.has(authUid)) || (usernameLower && seenUsername.has(usernameLower))) staffContradiction = true;
      if (data.activeShiftId !== undefined) {
        const activeShift = typeof data.activeShiftId === 'string' ? shiftById.get(data.activeShiftId) : undefined;
        if (!activeShift || activeShift.data.status !== 'open' || activeShift.data.staffAccountId !== record.id ||
            activeShift.data.staffId !== `staff_${record.id}` || activeShift.data.tenantId !== tenantId) staffContradiction = true;
      }
      if (staffContradiction) { contradictions++; contradictoryStaff.add(record.id); }
      if (authUid) seenAuth.add(authUid);
      if (usernameLower) seenUsername.add(usernameLower);
      if (isModernCredential(data.pinHash)) modern++; else legacy++;

      const usernameRelationship = usernameLower ? usernameById.get(usernameLower) : undefined;
      const usernameValid = Boolean(usernameRelationship && usernameRelationship.data.tenantId === tenantId &&
        usernameRelationship.data.staffAccountId === record.id);
      const noOpenShift = !data.activeShiftId && !openByAccount.has(record.id) && !openByActor.has(`staff_${record.id}`);
      if (data.companyControlledSmokeTest === true && complete && data.status === 'active' && isModernCredential(data.pinHash) &&
          isValidBusinessCodeRelationship(scope) && usernameValid && noOpenShift && !contradictoryStaff.has(record.id)) usableSmoke++;
    }

    for (const product of scope.products) {
      const data = product.data;
      const missingAuthoritative = typeof data.tenantId !== 'string' || typeof data.name !== 'string' || !data.name ||
        typeof data.unit !== 'string' || !data.unit || !Number.isSafeInteger(data.salePrice) || !Number.isSafeInteger(data.costPrice) ||
        !Number.isSafeInteger(data.currentStock) || typeof data.isActive !== 'boolean';
      if (missingAuthoritative) productsMissingAuthoritativeFields++;
      if (!product.id || missingAuthoritative || data.tenantId !== tenantId ||
          (data.moduleId !== undefined && data.moduleId !== 'benta-snap') || Number(data.salePrice) < 0 ||
          Number(data.costPrice) < 0 || Number(data.currentStock) < 0) incompatibleProducts++;
    }
  }

  return {
    authoritativeBentaTenants: bentaScopes.length,
    activeBentaTenants: activeScopes.length,
    bentaTenantsWithoutActiveEntitlement: bentaScopes.length - activeScopes.length,
    cashierRecords,
    cashierRecordsMissingRequiredIdentifiers: missing,
    duplicateOrContradictoryCashierRelationships: contradictions,
    modernCredentialRecords: modern,
    legacyCredentialRecords: legacy,
    unresolvedLegacyOpenShifts,
    incompatibleProducts,
    productsMissingAuthoritativeFields,
    usableCompanyControlledSmokeTestIdentities: usableSmoke,
    smokeTestReady: usableSmoke > 0
  };
}
