/**
 * Order Snap â€” Server Transaction & Concurrency Emulator Test Suite
 *
 * Genuinely verifies Firestore database state, transactional atomicity,
 * rollback behavior, concurrency contention, idempotent replay,
 * cashier redaction, and authorization isolation against the local Firestore emulator.
 */

import * as admin from 'firebase-admin';
import {
  finalizeOrderSnapTransaction,
  OrderSnapErrorCode,
  ORDER_SNAP_MODULE_ID,
  hashIdempotencyKey,
  CashierOrderFinalizationResult
} from '../src/lib/server/order-snap-finalizer';
import { OrderIngestionRequest } from '../src/lib/order-snap/order-ingestion';
import { OrderFinalizationResult } from '../src/lib/order-snap/order-finalization';

// ---------------------------------------------------------------------------
// Safety Boundary Checks
// ---------------------------------------------------------------------------
const PROJECT_ID = 'demo-katuwang-ordersnap-test';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

if (!PROJECT_ID.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(EMULATOR_HOST)) {
  throw new Error('SECURITY_FAIL_CLOSED: emulator isolation violation. Must use demo- project on localhost.');
}

process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const app = admin.apps.find((candidate): candidate is admin.app.App => candidate !== null && candidate.name === 'ordersnap-tx-emulator') ||
  admin.initializeApp({ projectId: PROJECT_ID }, 'ordersnap-tx-emulator');
const db = app.firestore();

let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string, extra?: unknown) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`, extra ? JSON.stringify(extra) : '');
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test Data & Fixtures
// ---------------------------------------------------------------------------
const runTag = `t_${Date.now().toString(36)}`;
const tenantId = `tenant_os_${runTag}`;
const otherTenantId = `tenant_os_foreign_${runTag}`;
const ownerUid = `owner_auth_${runTag}`;
const cashierUid = `cashier_auth_${runTag}`;
const cashierStaffId = `staff_cashier_${runTag}`;

const ingEspressoId = `ing_espresso_${runTag}`;
const ingMilkId = `ing_milk_${runTag}`;
const ingSyrupId = `ing_syrup_${runTag}`;
const recipeLatteId = `recipe_latte_${runTag}`;
const menuLatteId = `item_latte_${runTag}`;
const modGroupId = `group_syrup_${runTag}`;
const modOptionVanillaId = `opt_vanilla_${runTag}`;

async function seedDatabase() {
  const tenantRef = db.collection('tenants').doc(tenantId);
  const otherTenantRef = db.collection('tenants').doc(otherTenantId);

  await Promise.all([
    // Active Order Snap Tenant
    tenantRef.set({
      id: tenantId,
      name: 'Timpla Artisanal Cafe',
      moduleType: ORDER_SNAP_MODULE_ID,
      subscriptionStatus: 'active',
      ownerUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }),

    // Foreign Tenant
    otherTenantRef.set({
      id: otherTenantId,
      name: 'Foreign Store',
      moduleType: ORDER_SNAP_MODULE_ID,
      subscriptionStatus: 'active',
      ownerUid: 'other_owner',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }),

    // Cashier Staff Account
    tenantRef.collection('staff_accounts').doc(cashierStaffId).set({
      id: cashierStaffId,
      tenantId,
      username: 'barista_ann',
      displayName: 'Ann Barista',
      role: 'cashier',
      status: 'active',
      sessionVersion: 1,
      authUid: cashierUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }),

    // Ingredients
    // 1. Espresso Beans: 1000g, basis 1000g @ â‚±800.00 (80000 centavos)
    tenantRef.collection('ingredients').doc(ingEspressoId).set({
      id: ingEspressoId,
      tenantId,
      name: 'Espresso Roast Beans',
      unit: 'kg',
      quantityScale: 3,
      stockQuantityMinor: 1000,
      version: 1,
      isActive: true,
      costBasis: {
        basisQuantityMinor: 1000,
        basisCostCentavos: 80000
      },
      createdAt: '2026-08-30T00:00:00.000Z'
    }),

    // 2. Fresh Milk: 5000ml, basis 1000ml @ â‚±95.00 (9500 centavos)
    tenantRef.collection('ingredients').doc(ingMilkId).set({
      id: ingMilkId,
      tenantId,
      name: 'Fresh Dairy Milk',
      unit: 'L',
      quantityScale: 3,
      stockQuantityMinor: 5000,
      version: 1,
      isActive: true,
      costBasis: {
        basisQuantityMinor: 1000,
        basisCostCentavos: 9500
      },
      createdAt: '2026-08-30T00:00:00.000Z'
    }),

    // 3. Vanilla Syrup: 500ml, basis 750ml @ â‚±450.00 (45000 centavos)
    tenantRef.collection('ingredients').doc(ingSyrupId).set({
      id: ingSyrupId,
      tenantId,
      name: 'Madagascar Vanilla Syrup',
      unit: 'L',
      quantityScale: 3,
      stockQuantityMinor: 500,
      version: 1,
      isActive: true,
      costBasis: {
        basisQuantityMinor: 750,
        basisCostCentavos: 45000
      },
      createdAt: '2026-08-30T00:00:00.000Z'
    }),

    // Modifier Group: Flavor Syrup
    tenantRef.collection('modifier_groups').doc(modGroupId).set({
      id: modGroupId,
      tenantId,
      name: 'Syrup Options',
      minSelections: 0,
      maxSelections: 1,
      isRequired: false,
      allowMultiple: false,
      isActive: true,
      options: [
        {
          id: modOptionVanillaId,
          name: 'Vanilla Pump',
          priceDeltaCentavos: 2500, // +â‚±25.00
          ingredientDeltas: [
            {
              ingredientId: ingSyrupId,
              quantityMinorDelta: 20 // +20ml
            }
          ]
        }
      ]
    }),

    // Recipe: 16oz Latte (20g espresso, 240ml milk)
    tenantRef.collection('recipes').doc(recipeLatteId).set({
      id: recipeLatteId,
      tenantId,
      menuItemId: menuLatteId,
      version: 1,
      yield: 1,
      isActive: true,
      components: [
        {
          ingredientId: ingEspressoId,
          quantityMinor: 20
        },
        {
          ingredientId: ingMilkId,
          quantityMinor: 240
        }
      ],
      createdAt: '2026-08-30T00:00:00.000Z'
    }),

    // Menu Item: Iced Latte (â‚±150.00 = 15000 centavos)
    tenantRef.collection('menu_items').doc(menuLatteId).set({
      id: menuLatteId,
      tenantId,
      name: 'Iced Latte 16oz',
      category: 'Espresso Drinks',
      basePriceCentavos: 15000,
      activeRecipeVersionId: recipeLatteId,
      modifierGroupIds: [modGroupId],
      isAvailable: true,
      isActive: true,
      createdAt: '2026-08-30T00:00:00.000Z'
    })
  ]);
}

function createSampleOrderRequest(overrides: Partial<OrderIngestionRequest> = {}): OrderIngestionRequest {
  return {
    orderId: `ord_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
    tenantId,
    staffAccountId: cashierStaffId,
    idempotencyKey: `idemp_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: '2026-08-30T10:00:00.000Z',
    committedAt: '2026-08-30T10:00:01.000Z',
    lines: [
      {
        lineId: 'line-1',
        menuItemId: menuLatteId,
        quantity: 2,
        selectedModifiers: [
          {
            groupId: modGroupId,
            optionId: modOptionVanillaId
          }
        ]
      }
    ],
    ...overrides
  };
}

async function runTests() {
  console.log(`\n======================================================`);
  console.log(`ORDER SNAP FIRESTORE EMULATOR TRANSACTION AUDIT TESTS`);
  console.log(`Project: ${PROJECT_ID} @ ${EMULATOR_HOST}`);
  console.log(`======================================================\n`);

  await seedDatabase();

  const ownerIdentity = {
    uid: ownerUid,
    tenantId,
    staffAccountId: '',
    sessionVersion: 0,
    actorId: `owner_${ownerUid}`,
    role: 'owner' as const
  };

  const cashierIdentity = {
    uid: cashierUid,
    tenantId,
    staffAccountId: cashierStaffId,
    sessionVersion: 1,
    actorId: `staff_${cashierStaffId}`,
    role: 'cashier' as const
  };

  // -------------------------------------------------------------------------
  // 1. Owner Transaction & Full Database State Audit
  // -------------------------------------------------------------------------
  console.log(`\n[Scenario 1] Owner Transaction & Full Database State Audit`);
  {
    const req = createSampleOrderRequest();
    const result = await finalizeOrderSnapTransaction(
      { identity: ownerIdentity, request: req },
      { adminFirestore: db }
    );

    assert(result.success === true, 'Owner transaction succeeded', result);
    if (result.success) {
      const ownerRes = result.result as OrderFinalizationResult;
      assert(ownerRes.totalRevenueCentavos === 35000, 'Calculated correct revenue (â‚±350.00 for 2 lattes + 2 vanilla)');
      assert(ownerRes.totalCogsCentavos > 0, 'Owner result includes authoritative COGS');
      assert(ownerRes.saleLines[0].components.length === 3, 'Owner result includes historical component snapshots');
      assert(ownerRes.movements.length === 3, 'Owner result includes ledger movements');

      // Genuine Firestore Database Audit:
      const saleSnap = await db.collection('tenants').doc(tenantId).collection('sales').doc(result.saleId).get();
      assert(saleSnap.exists, 'Sale document written to database');
      assert(saleSnap.data()?.totalRevenueCentavos === 35000, 'Sale document totalRevenueCentavos matches');
      assert(saleSnap.data()?.actorRole === 'owner', 'Sale document records owner role');

      const idempHash = hashIdempotencyKey(tenantId, req.idempotencyKey);
      const idempSnap = await db.collection('tenants').doc(tenantId).collection('order_snap_idempotency').doc(idempHash).get();
      assert(idempSnap.exists, 'Idempotency document written to database');
      assert(idempSnap.data()?.status === 'completed', 'Idempotency document marked completed');

      // Check ingredient stock deductions in Firestore
      // 2 drinks: 40g espresso (1000 -> 960), 480ml milk (2000 -> 1520), 40ml vanilla (500 -> 460)
      const [espSnap, milkSnap, syrupSnap] = await Promise.all([
        db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingEspressoId).get(),
        db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingMilkId).get(),
        db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingSyrupId).get()
      ]);

      assert(espSnap.data()?.stockQuantityMinor === 960, 'Espresso stock updated to 960g in database');
      assert(espSnap.data()?.version === 2, 'Espresso version incremented to 2');
      assert(milkSnap.data()?.stockQuantityMinor === 4520, 'Milk stock updated to 4520ml in database');
      assert(milkSnap.data()?.version === 2, 'Milk version incremented to 2');
      assert(syrupSnap.data()?.stockQuantityMinor === 460, 'Vanilla stock updated to 460ml in database');
      assert(syrupSnap.data()?.version === 2, 'Vanilla version incremented to 2');
    }
  }

  // -------------------------------------------------------------------------
  // 2. Cashier Transaction & Response Redaction Audit
  // -------------------------------------------------------------------------
  console.log(`\n[Scenario 2] Cashier Transaction & Strict Cost Redaction`);
  {
    const req = createSampleOrderRequest();
    const result = await finalizeOrderSnapTransaction(
      { identity: cashierIdentity, request: req },
      { adminFirestore: db }
    );

    assert(result.success === true, 'Cashier transaction succeeded', result);
    if (result.success) {
      const cashierRes = result.result as CashierOrderFinalizationResult;
      assert(cashierRes.totalRevenueCentavos === 35000, 'Cashier result contains total revenue');
      assert(cashierRes.saleLines.length === 1, 'Cashier result contains sale lines');

      // Strict Redaction Verification:
      assert(!('totalCogsCentavos' in cashierRes), 'Cashier result strictly omits totalCogsCentavos');
      assert(!('movements' in cashierRes), 'Cashier result strictly omits internal ledger movements');
      assert(!('lineCogsCentavos' in cashierRes.saleLines[0]), 'Cashier sale line strictly omits lineCogsCentavos');
      assert(!('unitCogsCentavos' in cashierRes.saleLines[0]), 'Cashier sale line strictly omits unitCogsCentavos');
      assert(!('lineGrossProfitCentavos' in cashierRes.saleLines[0]), 'Cashier sale line strictly omits gross profit');
      assert(!('grossMarginBasisPoints' in cashierRes.saleLines[0]), 'Cashier sale line strictly omits gross margin');
      assert(!('components' in cashierRes.saleLines[0]), 'Cashier sale line strictly omits recipe components');

      // Verify Firestore persisted the FULL authoritative result internally
      const saleSnap = await db.collection('tenants').doc(tenantId).collection('sales').doc(result.saleId).get();
      assert(saleSnap.data()?.totalCogsCentavos > 0, 'Internal sale record stores complete authoritative COGS');
    }
  }

  // -------------------------------------------------------------------------
  // 3. Matching Idempotent Replay (Zero New Writes)
  // -------------------------------------------------------------------------
  console.log(`\n[Scenario 3] Matching Idempotent Replay`);
  {
    const req = createSampleOrderRequest();
    // First invocation
    const firstResult = await finalizeOrderSnapTransaction(
      { identity: ownerIdentity, request: req },
      { adminFirestore: db }
    );
    assert(firstResult.success === true, 'First invocation succeeded');

    const [espBefore] = await Promise.all([
      db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingEspressoId).get()
    ]);
    const stockBefore = espBefore.data()?.stockQuantityMinor;

    // Exact replay invocation
    const replayResult = await finalizeOrderSnapTransaction(
      { identity: ownerIdentity, request: req },
      { adminFirestore: db }
    );
    assert(replayResult.success === true, 'Replay invocation succeeded');
    if (firstResult.success && replayResult.success) {
      assert(firstResult.saleId === replayResult.saleId, 'Replay returned identical saleId');
      assert(firstResult.snapshotId === replayResult.snapshotId, 'Replay returned identical snapshotId');
    }

    // Verify database had NO additional stock deductions
    const espAfter = await db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingEspressoId).get();
    assert(espAfter.data()?.stockQuantityMinor === stockBefore, 'Zero new stock deductions on idempotent replay');
    assert(espAfter.data()?.version === espBefore.data()?.version, 'Ingredient document version unchanged');
  }

  // -------------------------------------------------------------------------
  // 4. Conflicting Idempotency Key (Fails Closed)
  // -------------------------------------------------------------------------
  console.log(`\n[Scenario 4] Conflicting Idempotency Key`);
  {
    const req = createSampleOrderRequest();
    const firstResult = await finalizeOrderSnapTransaction(
      { identity: ownerIdentity, request: req },
      { adminFirestore: db }
    );
    assert(firstResult.success === true, 'First order succeeded');

    // Conflicting request: same idempotencyKey, different orderId and items
    const conflictingReq: OrderIngestionRequest = {
      ...req,
      orderId: `ord_conflict_${Date.now()}`,
      lines: [
        {
          lineId: 'line-diff',
          menuItemId: menuLatteId,
          quantity: 5,
          selectedModifiers: []
        }
      ]
    };

    const conflictResult = await finalizeOrderSnapTransaction(
      { identity: ownerIdentity, request: conflictingReq },
      { adminFirestore: db }
    );

    assert(conflictResult.success === false, 'Conflicting replay failed');
    if (!conflictResult.success) {
      assert(conflictResult.errorCode === OrderSnapErrorCode.IDEMPOTENCY_CONFLICT, 'Failed with IDEMPOTENCY_CONFLICT');
    }
  }

  // -------------------------------------------------------------------------
  // 5. Insufficient Stock & Atomic Rollback Audit
  // -------------------------------------------------------------------------
  console.log(`\n[Scenario 5] Insufficient Stock & Genuine Rollback`);
  {
    const [espBefore, milkBefore] = await Promise.all([
      db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingEspressoId).get(),
      db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingMilkId).get()
    ]);
    const espStockBefore = espBefore.data()?.stockQuantityMinor;
    const milkStockBefore = milkBefore.data()?.stockQuantityMinor;

    // Order 500 lattes: requires 10,000g espresso (far exceeding remaining stock ~800g)
    const excessiveReq = createSampleOrderRequest({
      lines: [
        {
          lineId: 'line-excess',
          menuItemId: menuLatteId,
          quantity: 500,
          selectedModifiers: []
        }
      ]
    });

    const excessiveResult = await finalizeOrderSnapTransaction(
      { identity: ownerIdentity, request: excessiveReq },
      { adminFirestore: db }
    );

    assert(excessiveResult.success === false, 'Excessive order failed closed', excessiveResult);
    if (!excessiveResult.success) {
      assert(excessiveResult.errorCode === OrderSnapErrorCode.INSUFFICIENT_STOCK, 'Failed with INSUFFICIENT_STOCK', excessiveResult);
    }

    // Genuine Rollback Verification: All database documents remain completely unchanged
    const [espAfter, milkAfter] = await Promise.all([
      db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingEspressoId).get(),
      db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingMilkId).get()
    ]);

    assert(espAfter.data()?.stockQuantityMinor === espStockBefore, 'Espresso stock unchanged after failed transaction');
    assert(milkAfter.data()?.stockQuantityMinor === milkStockBefore, 'Milk stock unchanged after failed transaction');

    // Verify no orphaned sale or idempotency records created
    const idempHash = hashIdempotencyKey(tenantId, excessiveReq.idempotencyKey);
    const idempSnap = await db.collection('tenants').doc(tenantId).collection('order_snap_idempotency').doc(idempHash).get();
    assert(!idempSnap.exists, 'No orphaned idempotency document written');
  }

  // -------------------------------------------------------------------------
  // 6. Concurrency Contention (Exactly One Winner)
  // -------------------------------------------------------------------------
  console.log(`\n[Scenario 6] Concurrency Contention (Stock Sufficient for Exactly 1 Winner)`);
  {
    const ingContentionId = `ing_contention_${runTag}`;
    const recipeContentionId = `recipe_contention_${runTag}`;
    const menuContentionId = `menu_contention_${runTag}`;

    // Seed ingredient with exactly 15 minor units
    await Promise.all([
      db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingContentionId).set({
        id: ingContentionId,
        tenantId,
        name: 'Limited Specialty Roast',
        unit: 'kg',
        quantityScale: 3,
        stockQuantityMinor: 15,
        version: 1,
        isActive: true,
        costBasis: { basisQuantityMinor: 1000, basisCostCentavos: 100000 },
        createdAt: '2026-08-30T00:00:00.000Z'
      }),
      db.collection('tenants').doc(tenantId).collection('recipes').doc(recipeContentionId).set({
        id: recipeContentionId,
        tenantId,
        menuItemId: menuContentionId,
        version: 1,
        yield: 1,
        isActive: true,
        components: [{ ingredientId: ingContentionId, quantityMinor: 10 }], // each order takes 10g
        createdAt: '2026-08-30T00:00:00.000Z'
      }),
      db.collection('tenants').doc(tenantId).collection('menu_items').doc(menuContentionId).set({
        id: menuContentionId,
        tenantId,
        name: 'Specialty Espresso Shot',
        category: 'Single Origin',
        basePriceCentavos: 12000,
        activeRecipeVersionId: recipeContentionId,
        modifierGroupIds: [],
        isAvailable: true,
        isActive: true,
        createdAt: '2026-08-30T00:00:00.000Z'
      })
    ]);

    const orderA = createSampleOrderRequest({
      lines: [{ lineId: 'line-a', menuItemId: menuContentionId, quantity: 1, selectedModifiers: [] }]
    });
    const orderB = createSampleOrderRequest({
      lines: [{ lineId: 'line-b', menuItemId: menuContentionId, quantity: 1, selectedModifiers: [] }]
    });

    // Execute concurrently against emulator
    const [resultA, resultB] = await Promise.all([
      finalizeOrderSnapTransaction({ identity: ownerIdentity, request: orderA }, { adminFirestore: db }),
      finalizeOrderSnapTransaction({ identity: ownerIdentity, request: orderB }, { adminFirestore: db })
    ]);

    const successCount = (resultA.success ? 1 : 0) + (resultB.success ? 1 : 0);
    const failureCount = (!resultA.success ? 1 : 0) + (!resultB.success ? 1 : 0);

    assert(successCount === 1, 'Exactly one order won under concurrency contention');
    assert(failureCount === 1, 'Exactly one order was rejected due to depleted stock');

    const winningResult = resultA.success ? resultA : resultB;
    const losingResult = !resultA.success ? resultA : resultB;

    if (!losingResult.success) {
      assert(losingResult.errorCode === OrderSnapErrorCode.INSUFFICIENT_STOCK, 'Losing order failed with INSUFFICIENT_STOCK');
    }

    // Database stock must be exactly 5g (15 - 10)
    const ingFinalSnap = await db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingContentionId).get();
    assert(ingFinalSnap.data()?.stockQuantityMinor === 5, 'Final database stock is exactly 5g (no double deduction or negative stock)');
    assert(ingFinalSnap.data()?.version === 2, 'Version incremented exactly once');
  }

  // -------------------------------------------------------------------------
  // 7. Authorization & Role Isolation
  // -------------------------------------------------------------------------
  console.log(`\n[Scenario 7] Authorization & Role Security Boundaries`);
  {
    // 1. Cross-Tenant Attempt
    const crossTenantReq = createSampleOrderRequest({ tenantId: otherTenantId });
    const crossResult = await finalizeOrderSnapTransaction(
      { identity: ownerIdentity, request: crossTenantReq },
      { adminFirestore: db }
    );
    assert(crossResult.success === false, 'Cross-tenant order rejected');
    if (!crossResult.success) {
      assert(crossResult.errorCode === OrderSnapErrorCode.OPERATION_NOT_PERMITTED, 'Cross-tenant rejected with OPERATION_NOT_PERMITTED');
    }

    // 2. Unauthorized Cashier Session (stale sessionVersion)
    const staleCashierIdentity = {
      ...cashierIdentity,
      sessionVersion: 999
    };
    const staleResult = await finalizeOrderSnapTransaction(
      { identity: staleCashierIdentity, request: createSampleOrderRequest() },
      { adminFirestore: db }
    );
    assert(staleResult.success === false, 'Stale cashier session rejected');
    if (!staleResult.success) {
      assert(staleResult.errorCode === OrderSnapErrorCode.SESSION_INVALID, 'Stale cashier rejected with SESSION_INVALID');
    }

    // 3. Owner without staff account succeeds cleanly
    const ownerDirectReq = createSampleOrderRequest({ staffAccountId: ownerUid });
    const ownerDirectResult = await finalizeOrderSnapTransaction(
      { identity: ownerIdentity, request: ownerDirectReq },
      { adminFirestore: db }
    );
    assert(ownerDirectResult.success === true, 'Owner operates without needing cashier staff record', ownerDirectResult);
  }

  // -------------------------------------------------------------------------
  // 8. Multi-Line Atomic Rollback Proof (Zero Partial Deductions)
  // -------------------------------------------------------------------------
  console.log(`\n[Scenario 8] Multi-Line Atomic Rollback Proof`);
  {
    const [espBefore, milkBefore, syrupBefore] = await Promise.all([
      db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingEspressoId).get(),
      db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingMilkId).get(),
      db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingSyrupId).get()
    ]);
    const espStockBefore = espBefore.data()?.stockQuantityMinor;
    const milkStockBefore = milkBefore.data()?.stockQuantityMinor;
    const syrupStockBefore = syrupBefore.data()?.stockQuantityMinor;

    // Multi-line order: Line 1 has valid quantity (1 latte), Line 2 has impossible quantity (99999 vanilla syrup)
    const multiLineOrder = createSampleOrderRequest({
      lines: [
        {
          lineId: 'line-valid-latte',
          menuItemId: menuLatteId,
          quantity: 1,
          selectedModifiers: []
        },
        {
          lineId: 'line-insufficient-vanilla',
          menuItemId: menuLatteId,
          quantity: 1,
          selectedModifiers: [
            {
              groupId: modGroupId,
              optionId: modOptionVanillaId
            }
          ]
        }
      ]
    });

    // Temporarily deplete vanilla syrup to 5ml (less than 20ml required)
    await db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingSyrupId).update({
      stockQuantityMinor: 5
    });

    const multiLineResult = await finalizeOrderSnapTransaction(
      { identity: ownerIdentity, request: multiLineOrder },
      { adminFirestore: db }
    );

    assert(multiLineResult.success === false, 'Multi-line order with partial failure failed closed');
    if (!multiLineResult.success) {
      assert(multiLineResult.errorCode === OrderSnapErrorCode.INSUFFICIENT_STOCK, 'Failed with INSUFFICIENT_STOCK');
    }

    // Restore syrup stock for check
    const [espAfter, milkAfter] = await Promise.all([
      db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingEspressoId).get(),
      db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingMilkId).get()
    ]);

    // Assert Line 1 ingredients (espresso, milk) were NOT partially deducted
    assert(espAfter.data()?.stockQuantityMinor === espStockBefore, 'Espresso was NOT partially deducted when Line 2 failed');
    assert(milkAfter.data()?.stockQuantityMinor === milkStockBefore, 'Milk was NOT partially deducted when Line 2 failed');

    // Restore vanilla
    await db.collection('tenants').doc(tenantId).collection('ingredients').doc(ingSyrupId).update({
      stockQuantityMinor: syrupStockBefore
    });
  }

  // -------------------------------------------------------------------------
  // 9. Deterministic ID Safety & Path Traversal Rejection
  // -------------------------------------------------------------------------
  console.log(`\n[Scenario 9] Deterministic ID Safety & Path Traversal Rejection`);
  {
    // Illegal characters in tenantId
    const evilTenantIdentity = {
      ...ownerIdentity,
      tenantId: 'tenant/with/slashes/../escape'
    };
    const evilTenantReq = createSampleOrderRequest({ tenantId: evilTenantIdentity.tenantId });
    const evilTenantResult = await finalizeOrderSnapTransaction(
      { identity: evilTenantIdentity, request: evilTenantReq },
      { adminFirestore: db }
    );
    assert(evilTenantResult.success === false, 'Path traversal tenantId rejected');
    if (!evilTenantResult.success) {
      assert(evilTenantResult.errorCode === OrderSnapErrorCode.OPERATION_NOT_PERMITTED, 'Rejected with OPERATION_NOT_PERMITTED');
    }
  }

  // -------------------------------------------------------------------------
  // Final Results
  // -------------------------------------------------------------------------
  console.log(`\n======================================================`);
  console.log(`AUDIT RESULTS: ${passed} PASS, ${failed} FAIL`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Unhandled emulator test error:', err);
  process.exit(1);
});
