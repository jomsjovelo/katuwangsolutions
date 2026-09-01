import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeModules,
  activeModulesCount,
  businessModules,
  standardModulesCount,
  normalizeModuleId,
  isValidActiveModuleId,
  getActiveAppById,
  BENTA_PROFILES,
  DEFAULT_BENTA_BUSINESS_PROFILE,
  normalizeBentaProfile,
  type BentaBusinessProfile,
} from '../src/lib/app-data';
import { getBentaBusinessProfile, type Tenant } from '../src/store/use-tenant-store';
import { BusinessInfoSchema } from '../src/lib/schemas/onboarding';
import { getModulePricing } from '../src/lib/pricing';

test('Benta Snap Consolidation & Business Profile Foundation Suite', async (t) => {
  await t.test('1. Active Modules Count & Canonical Catalogue Truth', () => {
    assert.equal(activeModulesCount, 17, 'Expected exactly 17 active modules');
    assert.equal(activeModules.length, 17, 'Expected activeModules array length to be 17');
    assert.equal(standardModulesCount, 16, 'Expected 16 standard business modules');
    assert.equal(businessModules.length, 16, 'Expected businessModules array length to be 16');

    const benta = getActiveAppById('benta-snap');
    assert.ok(benta, 'Benta Snap should be present');
    assert.equal(benta?.id, 'benta-snap');
    assert.equal(benta?.name, 'Benta Snap');
    assert.equal(benta?.tagline, 'POS, Sales & Inventory para sa negosyo mo.');

    const activeIds = activeModules.map(m => m.id);
    assert.ok(!activeIds.includes('fresh-tally'), 'fresh-tally should be retired from activeModules');
    assert.ok(!activeIds.includes('build-stack'), 'build-stack should be retired from activeModules');
    assert.ok(!activeIds.includes('farm-master'), 'farm-master should be excluded from activeModules');

    const uniqueIds = new Set(activeIds);
    assert.equal(uniqueIds.size, activeIds.length, 'No duplicate IDs in activeModules');
  });

  await t.test('2. Normalization & Alias Redirection', () => {
    assert.equal(normalizeModuleId('fresh-tally'), 'benta-snap');
    assert.equal(normalizeModuleId('build-stack'), 'benta-snap');
    assert.equal(normalizeModuleId('FRESH-TALLY'), 'benta-snap');
    assert.equal(normalizeModuleId('BUILD-STACK'), 'benta-snap');
    assert.equal(normalizeModuleId('fleet-sync'), 'biyahe-sync');
    assert.equal(normalizeModuleId('rental-track'), 'rental');

    assert.equal(isValidActiveModuleId('benta-snap'), true);
    assert.equal(isValidActiveModuleId('fresh-tally'), true);
    assert.equal(isValidActiveModuleId('build-stack'), true);
    assert.equal(isValidActiveModuleId('fleet-sync'), true);
    assert.equal(isValidActiveModuleId('unknown-xyz'), false);
    assert.equal(isValidActiveModuleId('farm-master'), false);
  });

  await t.test('3. Business Profile Foundation & Compatibility Contract', () => {
    const profileIds = BENTA_PROFILES.map(p => p.id);
    assert.deepEqual(profileIds, [
      'general_retail',
      'fresh_goods',
      'hardware_supply',
    ]);
    assert.equal(DEFAULT_BENTA_BUSINESS_PROFILE, 'general_retail');

    // Canonical & Legacy Normalization Comprehensive Tests
    assert.equal(normalizeBentaProfile('general_retail'), 'general_retail');
    assert.equal(normalizeBentaProfile('fresh_goods'), 'fresh_goods');
    assert.equal(normalizeBentaProfile('hardware_supply'), 'hardware_supply');
    assert.equal(normalizeBentaProfile('standard-retail'), 'general_retail');
    assert.equal(normalizeBentaProfile('fresh-goods'), 'fresh_goods');
    assert.equal(normalizeBentaProfile('hardware-supplies'), 'hardware_supply');
    assert.equal(normalizeBentaProfile('wholesale'), 'general_retail', 'Wholesale must map to general_retail');
    assert.equal(normalizeBentaProfile('  FRESH-GOODS  '), 'fresh_goods');
    assert.equal(normalizeBentaProfile('HARDWARE_SUPPLY'), 'hardware_supply');
    assert.equal(normalizeBentaProfile(null), 'general_retail');
    assert.equal(normalizeBentaProfile(undefined), 'general_retail');
    assert.equal(normalizeBentaProfile('invalid-unknown'), 'general_retail');

    const legacyTenant: Partial<Tenant> = {
      id: 'tenant-123',
      name: "Aling Nena's Sari-Sari",
      moduleType: 'benta-snap',
    };
    assert.equal(
      getBentaBusinessProfile(legacyTenant as Tenant),
      'general_retail',
      'Legacy Benta tenant with undefined profile must default to general_retail'
    );

    const freshTenant: Partial<Tenant> = {
      id: 'tenant-fresh',
      name: 'Gulay & Meat Stand',
      moduleType: 'benta-snap',
      businessProfile: 'fresh-goods',
    };
    assert.equal(getBentaBusinessProfile(freshTenant as Tenant), 'fresh_goods');

    const hardwareTenant: Partial<Tenant> = {
      id: 'tenant-hw',
      name: 'City Hardware & Supply',
      moduleType: 'benta-snap',
      businessProfile: 'hardware-supplies',
    };
    assert.equal(getBentaBusinessProfile(hardwareTenant as Tenant), 'hardware_supply');

    const wholesaleTenant: Partial<Tenant> = {
      id: 'tenant-ws',
      name: 'Bagsakan Distribution Center',
      moduleType: 'benta-snap',
      businessProfile: 'wholesale',
    };
    assert.equal(getBentaBusinessProfile(wholesaleTenant as Tenant), 'general_retail');

    assert.equal(getBentaBusinessProfile(null), 'general_retail');
    assert.equal(getBentaBusinessProfile(undefined), 'general_retail');

    const laundryTenant: Partial<Tenant> = {
      id: 'tenant-laundry',
      moduleType: 'spin-snap',
    };
    assert.equal(getBentaBusinessProfile(laundryTenant as Tenant), 'general_retail');
  });

  await t.test('4. Onboarding Schema & Profile Validation', () => {
    const validProfiles: BentaBusinessProfile[] = [
      'general_retail',
      'fresh_goods',
      'hardware_supply',
      'standard-retail',
      'fresh-goods',
      'hardware-supplies',
      'wholesale',
    ];

    validProfiles.forEach(profile => {
      const result = BusinessInfoSchema.safeParse({
        fullName: 'Juan Dela Cruz',
        birthday: '1995-05-15',
        gender: 'Lalaki',
        address: '123 Rizal St., Quezon City',
        businessName: 'My Store',
        businessProfile: profile,
      });
      assert.equal(result.success, true, `Profile ${profile} should be valid`);
    });

    const resultWithoutProfile = BusinessInfoSchema.safeParse({
      fullName: 'Maria Santos',
      birthday: '1992-08-20',
      gender: 'Babae',
      address: '456 Bonifacio Ave., Makati',
      businessName: 'Santos Grocers',
    });
    assert.equal(resultWithoutProfile.success, true, 'Schema without profile should be valid (optional)');

    const resultWithInvalidProfile = BusinessInfoSchema.safeParse({
      fullName: 'Juan Dela Cruz',
      birthday: '1995-05-15',
      gender: 'Lalaki',
      address: '123 Rizal St., Quezon City',
      businessName: 'My Store',
      businessProfile: 'invalid-profile-xyz',
    });
    assert.equal(resultWithInvalidProfile.success, false, 'Invalid profile must fail validation');
  });

  await t.test('5. Pricing & Product Disclosures', () => {
    const pricing = getModulePricing('benta-snap');
    assert.equal(pricing.promotionalMonthlyPrice, 99);
    assert.equal(pricing.regularMonthlyPrice, 199);
    assert.equal(pricing.pricingTier, 'promo_99');
  });

  await t.test('6. Truthful Positioning & Non-Overpromising Disclosures', () => {
    const benta = getActiveAppById('benta-snap');
    assert.ok(benta);
    // Features must reflect released capabilities only
    assert.deepEqual(benta?.features, [
      'Sales Recording & POS',
      'Inventory Monitoring',
      'Customer Credit Tracking',
      'Thermal Receipts & Cashier Shift'
    ]);

    // Profiles descriptions must avoid unbacked batch/weighting claims
    const freshProfile = BENTA_PROFILES.find(p => p.id === 'fresh_goods');
    assert.ok(freshProfile);
    assert.ok(!freshProfile?.description.includes('kilo'), 'Fresh profile must not claim kilos before weighted engine batch');
    assert.ok(!freshProfile?.description.includes('perishable batches'), 'Fresh profile must not claim perishable batch tracking');

    const hardwareProfile = BENTA_PROFILES.find(p => p.id === 'hardware_supply');
    assert.ok(hardwareProfile);
    assert.ok(!hardwareProfile?.description.includes('dispatch'), 'Hardware profile must not claim dispatch tracking');
  });

  await t.test('7. Authoritative registerNewTenant Canonicalization & Write Boundary', async () => {
    const { registerNewTenant } = await import('../src/firebase/firestore/onboarding-actions');

    const createMockDependencies = () => {
      const writtenDocs: Array<{ path: string; data: any }> = [];
      let createdAuthUser: any = null;

      const mockAuth = {};
      const mockDb = {};

      const mockDeps: any = {
        initializeFirebase: () => ({ auth: mockAuth, db: mockDb }),
        createUser: async (_auth: any, email: string) => {
          createdAuthUser = { uid: 'mock-uid-123', email };
          return {
            user: {
              uid: 'mock-uid-123',
              email,
              getIdToken: async () => 'mock-id-token',
              delete: async () => {},
            },
          };
        },
        getDocument: async () => ({ exists: () => false }),
        document: (_dbOrCol: any, ...pathSegments: string[]) => {
          const path = pathSegments.join('/') || 'tenants/mock-tenant-id';
          return { id: 'mock-doc-id', path };
        },
        collectionRef: () => ({ path: 'tenants' }),
        runTransaction: async (_db: any, updateFunction: (tx: any) => Promise<any>) => {
          const mockTx = {
            get: async () => ({ exists: () => false }),
            set: (docRef: any, data: any) => {
              writtenDocs.push({ path: docRef.path || docRef.id, data });
            },
          };
          return updateFunction(mockTx);
        },
        timestamp: () => 'MOCK_TIMESTAMP',
        fetchRequest: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      };

      return { mockDeps, writtenDocs, getCreatedUser: () => createdAuthUser };
    };

    // Test A: legacy fresh-tally without explicit profile -> writes benta-snap + fresh_goods
    {
      const { mockDeps, writtenDocs } = createMockDependencies();
      const result = await registerNewTenant(
        {
          appId: 'fresh-tally',
          fullName: 'Juan Dela Cruz',
          birthday: '1990-01-01',
          gender: 'Lalaki',
          address: '123 Palengke St.',
          businessName: 'Juan Gulay Stand',
          email: 'juan@palengke.ph',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        },
        mockDeps
      );

      assert.equal(result.success, true);
      assert.equal(result.emailDeliveryFailed, false);

      const tenantDoc = writtenDocs.find(d => d.data.businessProfile !== undefined);
      assert.ok(tenantDoc, 'Tenant document must be written');
      assert.equal(tenantDoc?.data.moduleType, 'benta-snap', 'moduleType on tenant must be canonical benta-snap');
      assert.equal(tenantDoc?.data.businessProfile, 'fresh_goods', 'businessProfile must resolve to fresh_goods');
      assert.equal(tenantDoc?.data.pricingTier, 'promo_99');

      const userDoc = writtenDocs.find(d => d.data.role === 'owner');
      assert.ok(userDoc, 'User document must be written');
      assert.equal(userDoc?.data.moduleType, 'benta-snap', 'moduleType on user must be canonical benta-snap');
    }

    // Test B: legacy build-stack without explicit profile -> writes benta-snap + hardware_supply
    {
      const { mockDeps, writtenDocs } = createMockDependencies();
      await registerNewTenant(
        {
          appId: 'build-stack',
          fullName: 'Pedro Builder',
          birthday: '1988-03-10',
          gender: 'Lalaki',
          address: '456 Hardware Ave.',
          businessName: 'Pedro Construction Supplies',
          email: 'pedro@hardware.ph',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        },
        mockDeps
      );

      const tenantDoc = writtenDocs.find(d => d.data.businessProfile !== undefined);
      assert.equal(tenantDoc?.data.moduleType, 'benta-snap');
      assert.equal(tenantDoc?.data.businessProfile, 'hardware_supply');
    }

    // Test C: legacy fresh-tally with explicit wholesale profile -> normalizes to canonical general_retail
    {
      const { mockDeps, writtenDocs } = createMockDependencies();
      await registerNewTenant(
        {
          appId: 'fresh-tally',
          businessProfile: 'wholesale',
          fullName: 'Elena Bagsakan',
          birthday: '1985-07-22',
          gender: 'Babae',
          address: '789 Bagsakan Road',
          businessName: 'Elena Wholesale Produce',
          email: 'elena@bagsakan.ph',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        },
        mockDeps
      );

      const tenantDoc = writtenDocs.find(d => d.data.businessProfile !== undefined);
      assert.equal(tenantDoc?.data.moduleType, 'benta-snap');
      assert.equal(tenantDoc?.data.businessProfile, 'general_retail', 'Explicit wholesale profile normalizes to general_retail');
    }

    // Test D: invalid/inactive module IDs (e.g. farm-master or unknown) rejected before write
    {
      const { mockDeps, writtenDocs } = createMockDependencies();
      await assert.rejects(
        async () => {
          await registerNewTenant(
            {
              appId: 'farm-master',
              fullName: 'Hacienda Owner',
              birthday: '1980-01-01',
              gender: 'Lalaki',
              address: 'Farm Road',
              businessName: 'My Farm',
              email: 'owner@farm.ph',
              password: 'Password123!',
              confirmPassword: 'Password123!',
            },
            mockDeps
          );
        },
        /hindi aktibo o hindi magagamit/
      );
      assert.equal(writtenDocs.length, 0, 'No Firestore mutations must occur for inactive module');
    }

    {
      const { mockDeps, writtenDocs } = createMockDependencies();
      await assert.rejects(
        async () => {
          await registerNewTenant(
            {
              appId: 'unknown-random-app',
              fullName: 'Hacienda Owner',
              birthday: '1980-01-01',
              gender: 'Lalaki',
              address: 'Unknown Road',
              businessName: 'My Shop',
              email: 'owner@shop.ph',
              password: 'Password123!',
              confirmPassword: 'Password123!',
            },
            mockDeps
          );
        },
        /hindi aktibo o hindi magagamit/
      );
      assert.equal(writtenDocs.length, 0, 'No Firestore mutations must occur for unknown module');
    }
  });

  await t.test('8. Draft Normalization Logic Contract Across All Lifecycle Stages', () => {
    const normalizeDraft = (savedDraft: { step: string; data: any }) => {
      const updatedData = { ...savedDraft.data };
      let updatedStep = savedDraft.step;
      const rawSavedAppId = (savedDraft.data.appId || '').toLowerCase();
      const draftAppId = normalizeModuleId(rawSavedAppId);

      if (draftAppId === 'farm-master' || (draftAppId && !isValidActiveModuleId(draftAppId))) {
        updatedData.appId = '';
        updatedStep = 'apps';
      } else {
        updatedData.appId = draftAppId;
        if (rawSavedAppId === 'fresh-tally' && !updatedData.businessProfile) {
          updatedData.businessProfile = 'fresh_goods';
        } else if (rawSavedAppId === 'build-stack' && !updatedData.businessProfile) {
          updatedData.businessProfile = 'hardware_supply';
        } else if (updatedData.businessProfile) {
          updatedData.businessProfile = normalizeBentaProfile(updatedData.businessProfile);
        }
      }

      return { step: updatedStep, data: updatedData };
    };

    const stages = ['account', 'business', 'payment', 'pending', 'success'];

    stages.forEach((stage) => {
      const freshDraft = {
        step: stage,
        data: {
          appId: 'fresh-tally',
          businessName: 'Palengke Fresh',
          fullName: 'Maria Santos',
        },
      };
      const normalizedFresh = normalizeDraft(freshDraft);
      assert.equal(normalizedFresh.data.appId, 'benta-snap');
      assert.equal(normalizedFresh.data.businessProfile, 'fresh_goods');
      assert.equal(normalizedFresh.data.businessName, 'Palengke Fresh');
      assert.equal(normalizedFresh.step, stage);

      const buildDraft = {
        step: stage,
        data: {
          appId: 'build-stack',
          businessName: 'Hardware Hub',
          fullName: 'Juan Builder',
        },
      };
      const normalizedBuild = normalizeDraft(buildDraft);
      assert.equal(normalizedBuild.data.appId, 'benta-snap');
      assert.equal(normalizedBuild.data.businessProfile, 'hardware_supply');
      assert.equal(normalizedBuild.data.businessName, 'Hardware Hub');
      assert.equal(normalizedBuild.step, stage);

      const explicitProfileDraft = {
        step: stage,
        data: {
          appId: 'fresh-tally',
          businessProfile: 'wholesale',
          businessName: 'Bagsakan Central',
        },
      };
      const normalizedExplicit = normalizeDraft(explicitProfileDraft);
      assert.equal(normalizedExplicit.data.appId, 'benta-snap');
      assert.equal(normalizedExplicit.data.businessProfile, 'general_retail', 'Wholesale normalizes to general_retail');
    });
  });
});
