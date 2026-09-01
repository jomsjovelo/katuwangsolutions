/**
 * Order Snap Typed Lifecycle Foundation Tests
 */

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { OrderSnapController } from "../../src/lib/order-snap/order-snap-controller";
import { OrderSnapOutboxDB } from "../../src/lib/order-snap/order-snap-outbox-db";
import { OrderSnapAuthorityManager } from "../../src/lib/order-snap/order-snap-authority-manager";
import { OrderSnapCertificateSigner } from "../../src/lib/server/order-snap-certificate-signer";
import {
  OrderSnapSyncCoordinatorFactory,
  EstablishAuthorityParams,
  EstablishAuthorityResult,
} from "../../src/lib/order-snap/order-snap-controller";
import {
  mapOutboxStateToLifecycleStatus,
  projectToSanitizedLifecycle,
  OrderSnapOutboxEntry,
  ConflictDiagnosticRecord,
  OrderSnapAuthorityGrant,
} from "../../src/lib/order-snap/offline-types";
import { SyncCoordinatorOptions } from "../../src/lib/order-snap/order-snap-sync-coordinator";
import { OrderIngestionRequestSchema, OrderLineSchema, OrderIngestionRequest } from "../../src/lib/order-snap/order-ingestion";
import { createMockIndexedDB } from "../test-indexeddb-mock";

const testServerKeyPair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const testServerPrivateKeyPem = testServerKeyPair.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
const testServerPublicKeySpkiBase64 = Buffer.from(
  testServerKeyPair.publicKey.export({ type: "spki", format: "der" })
).toString("base64");

const testTrustedRegistry = {
  v2: {
    algorithm: "ES256" as const,
    spki: testServerPublicKeySpkiBase64,
  },
};

const clientCredentialKeyPair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const clientCredentialPublicKeySpkiBase64 = Buffer.from(
  clientCredentialKeyPair.publicKey.export({ type: "spki", format: "der" })
).toString("base64");
const clientCredentialIdBase64Url = "test_webauthn_credential_id_base64url_12345";
const credIdBytes = Buffer.from(clientCredentialIdBase64Url, "base64url");
const clientCredentialIdFingerprint = crypto.createHash("sha256").update(credIdBytes).digest("hex");
const spkiBytes = Buffer.from(clientCredentialPublicKeySpkiBase64, "base64");
const clientCredentialPublicKeyFingerprint = crypto.createHash("sha256").update(spkiBytes).digest("hex");

const now = new Date().toISOString();

function createTestCert(tenantId: string, deviceId: string, catalogVersion: string) {
  const localSigner = new OrderSnapCertificateSigner({ privateKeys: { v2: testServerPrivateKeyPem } });
  return localSigner.signCertificate({
    version: 2,
    algorithm: "ES256",
    keyId: "v2",
    grantId: "grant_lifecycle_test",
    moduleId: "order-snap",
    tenantId,
    staffAccountId: "staff_verified_from_authority",
    actorId: "staff_staff_verified_from_authority",
    authUid: "firebase_uid_selector_only",
    sessionVersion: 1,
    role: "cashier",
    displayName: "Verified Cashier",
    deviceId,
    catalogVersion,
    allowedTenders: ["cash"],
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    credentialIdFingerprint: clientCredentialIdFingerprint,
    credentialPublicKeyFingerprint: clientCredentialPublicKeyFingerprint,
    rpId: "localhost",
    expectedOrigin: "http://localhost:9002",
    requireUserPresence: true,
    requireUserVerification: true,
  }, "v2");
}

function createIngestionRequest(orderId: string, idempotencyKey: string, tenantId: string): OrderIngestionRequest {
  return OrderIngestionRequestSchema.parse({
    orderId,
    idempotencyKey,
    tenantId,
    staffAccountId: "staff_verified_from_authority",
    createdAt: now,
    committedAt: now,
    lines: [
      OrderLineSchema.parse({
        lineId: "line_1",
        menuItemId: "item_latte",
        quantity: 1,
        selectedModifiers: [{ groupId: "grp_syrup", optionId: "opt_vanilla" }],
      }),
    ],
  });
}

function createTestEntry(tenantId: string, deviceId: string, catalogVersion: string): OrderSnapOutboxEntry {
  const cert = createTestCert(tenantId, deviceId, catalogVersion);
  const grant: OrderSnapAuthorityGrant = cert;

  const entry: OrderSnapOutboxEntry = {
    orderId: "ord_test_entry",
    idempotencyKey: "idemp_test_entry",
    tenantId,
    actorId: "staff_staff_verified_from_authority",
    staffAccountId: "staff_verified_from_authority",
    actorRole: "cashier",
    deviceId,
    localSequence: 1,
    request: createIngestionRequest("ord_test_entry", "idemp_test_entry", tenantId),
    paymentMethod: "cash",
    cashTenderedCentavos: 20000,
    clientCreatedAt: now,
    provisionalReceiptNumber: "PROV-ORD-000001-ABC",
    grant,
    syncState: "pending_sync",
    attemptCount: 0,
    serverSaleId: "sale_xyz",
    serverCommittedAt: now,
  };
  return entry;
}

class SuccessfulAuthorityManager extends OrderSnapAuthorityManager {
  establishCallCount = 0;

  override async establishOnlineAuthority(
    params: EstablishAuthorityParams
  ): Promise<EstablishAuthorityResult> {
    this.establishCallCount += 1;

    const localCert = createTestCert(params.tenantId, params.deviceId, params.catalogVersion);

    const body = JSON.stringify({
      success: true,
      grant: localCert,
      webAuthnCredential: {
        credentialId: clientCredentialIdBase64Url,
        publicKeySpki: clientCredentialPublicKeySpkiBase64,
        rpId: "localhost",
        counter: 0,
      },
    });

    const mockFetch: (url: string, init?: RequestInit) => Promise<Response> =
      async () => new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });

    return super.establishOnlineAuthority({
      ...params,
      fetchFn: mockFetch,
    });
  }
}

function createSampleCatalog(tenantId = "tenant_cafe", catalogVersion = "v1.0.0") {
  return {
    tenantId,
    catalogVersion,
    syncedAt: new Date().toISOString(),
    menuItems: [
      {
        menuItemId: "item_latte",
        tenantId,
        name: "Iced Latte",
        category: "Coffee",
        basePriceCentavos: 13000,
        activeRecipeVersionId: "rec_latte_v1",
        isActive: true,
        modifierGroupIds: ["grp_syrup"],
      },
    ],
    recipes: [
      {
        recipeVersionId: "rec_latte_v1",
        menuItemId: "item_latte",
        versionNumber: 1,
        isActive: true,
        components: [
          { ingredientId: "ing_beans", quantityMinor: 18000, unit: "g" },
          { ingredientId: "ing_milk", quantityMinor: 200000, unit: "ml" },
        ],
      },
    ],
    modifierGroups: [
      {
        modifierGroupId: "grp_syrup",
        tenantId,
        name: "Syrup Options",
        minSelections: 0,
        maxSelections: 2,
        isRequired: false,
        options: [
          {
            optionId: "opt_vanilla",
            name: "Vanilla Syrup (1 pump)",
            priceDeltaCentavos: 2500,
            ingredientDeltas: [
              { ingredientId: "ing_vanilla_syrup", quantityMinorDelta: 15000, unit: "ml" },
            ],
          },
        ],
      },
    ],
    ingredients: [
      { ingredientId: "ing_beans", tenantId, name: "Coffee Beans", unit: "g", stockQuantityMinor: 40000, isActive: true },
      { ingredientId: "ing_milk", tenantId, name: "Fresh Milk", unit: "ml", stockQuantityMinor: 500000, isActive: true },
      { ingredientId: "ing_vanilla_syrup", tenantId, name: "Vanilla Syrup", unit: "ml", stockQuantityMinor: 100000, isActive: true },
    ],
  };
}

function createControllerWithCapturedCoordinator(
  tenantId: string,
  outboxDB: OrderSnapOutboxDB,
  authorityManager: OrderSnapAuthorityManager,
) {
  let capturedOptions: SyncCoordinatorOptions | null = null;

  const syncCoordinatorFactory: OrderSnapSyncCoordinatorFactory = (options) => {
    capturedOptions = options;
    return {
      destroy: () => {},
      triggerSync: () => {},
    };
  };

  const controller = new OrderSnapController({
    tenantId,
    authUid: "firebase_uid_selector_only",
    outboxDB,
    authorityManager,
    syncCoordinatorFactory,
    getIdToken: async () => "test_id_token",
  });

  return { controller, getCapturedOptions: () => capturedOptions };
}

function createSimpleController(
  tenantId: string,
  outboxDB: OrderSnapOutboxDB,
  authorityManager: OrderSnapAuthorityManager,
) {
  const syncCoordinatorFactory: OrderSnapSyncCoordinatorFactory = () => ({
    destroy: () => {},
    triggerSync: () => {},
  });

  return new OrderSnapController({
    tenantId,
    authUid: "firebase_uid_selector_only",
    outboxDB,
    authorityManager,
    syncCoordinatorFactory,
    getIdToken: async () => "test_id_token",
  });
}

function createConflictDiagnostic(orderId: string, tenantId: string): ConflictDiagnosticRecord {
  return {
    occurredAt: now,
    errorCode: "INSUFFICIENT_STOCK",
    errorMessage: "Out of stock",
    conflictReason: "stock_conflict",
    attemptedByActorId: "staff_staff_verified_from_authority",
    originalRequest: createIngestionRequest(orderId, orderId.replace("ord_", "idemp_"), tenantId),
  };
}

test("1. mapOutboxStateToLifecycleStatus maps all seven outbox states", () => {
  assert.equal(mapOutboxStateToLifecycleStatus("draft"), "pending");
  assert.equal(mapOutboxStateToLifecycleStatus("pending_sync"), "pending");
  assert.equal(mapOutboxStateToLifecycleStatus("syncing"), "syncing");
  assert.equal(mapOutboxStateToLifecycleStatus("retryable_failure"), "retrying");
  assert.equal(mapOutboxStateToLifecycleStatus("confirmed"), "confirmed");
  assert.equal(mapOutboxStateToLifecycleStatus("conflict"), "conflict");
  assert.equal(mapOutboxStateToLifecycleStatus("permanently_rejected"), "rejected");
});

test("2. projectToSanitizedLifecycle returns a frozen object with only public fields", () => {
  const entry = createTestEntry("tenant_cafe", "dev_1", "v1.0.0");

  const record = projectToSanitizedLifecycle(entry);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(record.orderId, "ord_test_entry");
  assert.equal(record.provisionalReceiptNumber, "PROV-ORD-000001-ABC");
  assert.equal(record.status, "pending");
  assert.equal(record.serverSaleId, "sale_xyz");
  assert.ok(record.serverCommittedAt);

  const serialized = JSON.stringify(record);
  for (const forbiddenField of [
    "grant",
    "actorId",
    "staffAccountId",
    "tenantId",
    "deviceId",
    "request",
    "conflictDiagnostic",
    "certificate",
    "token",
    "signature",
    "publicKey",
    "credentialPublicKey",
    "idToken",
  ]) {
    assert.equal(serialized.includes(forbiddenField), false, `forbidden field present: ${forbiddenField}`);
  }
});

test("3. public receipt excludes tenant, device, cashier, and local-sequence fields", async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const tenantId = "tenant_receipt_exclusion";
  const catalogVersion = "v1.0.0";
  const authorityManager = new SuccessfulAuthorityManager(outboxDB, { trustedRegistry: testTrustedRegistry });
  await outboxDB.saveCatalogSnapshot(createSampleCatalog(tenantId, catalogVersion));

  const { controller } = createControllerWithCapturedCoordinator(tenantId, outboxDB, authorityManager);
  try {
    await controller.initialize();

    const result = await controller.acceptOfflineOrder({
      lines: [
        {
          lineId: "line_1",
          menuItemId: "item_latte",
          quantity: 1,
          selectedModifiers: [{ groupId: "grp_syrup", optionId: "opt_vanilla" }],
        },
      ],
      cashTenderedCentavos: 20000,
      idempotencyKey: "idemp_receipt_excl",
    });

    assert.equal(result.success, true);
    const serialized = JSON.stringify(result.provisionalReceipt);
    for (const forbiddenField of [
      "tenantId",
      "deviceId",
      "cashierDisplayName",
      "localSequence",
      "grant",
      "actorId",
      "staffAccountId",
      "request",
    ]) {
      assert.equal(
        serialized.includes(forbiddenField),
        false,
        `forbidden field present in public receipt: ${forbiddenField}`
      );
    }
  } finally {
    controller.destroy();
  }
});

test("4. nested public receipt arrays and objects are frozen", async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const tenantId = "tenant_frozen_receipt";
  const catalogVersion = "v1.0.0";
  const authorityManager = new SuccessfulAuthorityManager(outboxDB, { trustedRegistry: testTrustedRegistry });
  await outboxDB.saveCatalogSnapshot(createSampleCatalog(tenantId, catalogVersion));

  const { controller } = createControllerWithCapturedCoordinator(tenantId, outboxDB, authorityManager);
  try {
    await controller.initialize();

    const result = await controller.acceptOfflineOrder({
      lines: [
        {
          lineId: "line_1",
          menuItemId: "item_latte",
          quantity: 1,
          selectedModifiers: [{ groupId: "grp_syrup", optionId: "opt_vanilla" }],
        },
      ],
      cashTenderedCentavos: 20000,
      idempotencyKey: "idemp_frozen_receipt",
    });

    const receipt = result.provisionalReceipt;
    assert.equal(Object.isFrozen(receipt), true);
    assert.equal(Object.isFrozen(receipt.items), true);

    for (const line of receipt.items) {
      assert.equal(Object.isFrozen(line), true);
      assert.equal(Object.isFrozen(line.selectedModifiers), true);
      for (const mod of line.selectedModifiers) {
        assert.equal(Object.isFrozen(mod), true);
      }
    }
  } finally {
    controller.destroy();
  }
});

test("5. acceptance publishes exactly one pending lifecycle update", async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const tenantId = "tenant_accept_cb";
  const catalogVersion = "v1.0.0";
  const authorityManager = new SuccessfulAuthorityManager(outboxDB, { trustedRegistry: testTrustedRegistry });
  await outboxDB.saveCatalogSnapshot(createSampleCatalog(tenantId, catalogVersion));

  const { controller } = createControllerWithCapturedCoordinator(tenantId, outboxDB, authorityManager);
  try {
    await controller.initialize();

    const received = [];
    const unsubscribe = controller.subscribeToLifecycle((record) => received.push(record));

    await controller.acceptOfflineOrder({
      lines: [{ lineId: "line_1", menuItemId: "item_latte", quantity: 1, selectedModifiers: [] }],
      cashTenderedCentavos: 20000,
      idempotencyKey: "idemp_accept_cb",
    });

    assert.equal(received.length, 1);
    assert.equal(received[0].status, "pending");

    unsubscribe();
  } finally {
    controller.destroy();
  }
});

test("6. confirmed: persist confirmed state, invoke captured callback, receive confirmed", async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const tenantId = "tenant_confirmed_flow";
  const catalogVersion = "v1.0.0";
  const authorityManager = new SuccessfulAuthorityManager(outboxDB, { trustedRegistry: testTrustedRegistry });
  await outboxDB.saveCatalogSnapshot(createSampleCatalog(tenantId, catalogVersion));

  const { controller, getCapturedOptions } = createControllerWithCapturedCoordinator(tenantId, outboxDB, authorityManager);
  try {
    await controller.initialize();

    const received = [];
    const unsubscribe = controller.subscribeToLifecycle((record) => received.push(record));

    const result = await controller.acceptOfflineOrder({
      lines: [{ lineId: "line_1", menuItemId: "item_latte", quantity: 1, selectedModifiers: [] }],
      cashTenderedCentavos: 20000,
      idempotencyKey: "idemp_confirmed_flow",
    });

    // acceptance publishes one pending
    assert.equal(received.length, 1);
    assert.equal(received[0].status, "pending");

    // Transition from pending_sync -> syncing -> confirmed
    await outboxDB.updateOrderSyncState(tenantId, result.lifecycle.orderId, "syncing");

    const committedAt = new Date().toISOString();
    await outboxDB.markOrderConfirmed(
      tenantId,
      result.lifecycle.orderId,
      { success: true, saleId: "sale_test", snapshotId: "snap_test", committedAt },
      "sale_id_test",
      "snapshot_id_test",
      committedAt
    );

    // Capture the confirmed callback and invoke it
    const capturedOptions = getCapturedOptions();
    assert.ok(capturedOptions, "sync coordinator options should have been captured");
    assert.ok(capturedOptions.onOrderConfirmed, "onOrderConfirmed callback should exist");

    const entryBefore = await outboxDB.getOrder(tenantId, result.lifecycle.orderId);
    assert.ok(entryBefore, "entry should exist before callback");

    capturedOptions.onOrderConfirmed!(entryBefore);

    // Wait for async re-read and publication
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    assert.equal(received.length, 2);
    assert.equal(received[1].status, "confirmed");

    unsubscribe();
  } finally {
    controller.destroy();
  }
});

test("7. conflict: persist conflict state, invoke callback, receive conflict without diagnostics", async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const tenantId = "tenant_conflict_flow";
  const catalogVersion = "v1.0.0";
  const authorityManager = new SuccessfulAuthorityManager(outboxDB, { trustedRegistry: testTrustedRegistry });
  await outboxDB.saveCatalogSnapshot(createSampleCatalog(tenantId, catalogVersion));

  const { controller, getCapturedOptions } = createControllerWithCapturedCoordinator(tenantId, outboxDB, authorityManager);
  try {
    await controller.initialize();

    const received = [];
    const unsubscribe = controller.subscribeToLifecycle((record) => received.push(record));

    const result = await controller.acceptOfflineOrder({
      lines: [{ lineId: "line_1", menuItemId: "item_latte", quantity: 1, selectedModifiers: [] }],
      cashTenderedCentavos: 20000,
      idempotencyKey: "idemp_conflict_flow",
    });

    assert.equal(received.length, 1);
    assert.equal(received[0].status, "pending");

    // Transition from pending_sync -> syncing -> conflict
    await outboxDB.updateOrderSyncState(tenantId, result.lifecycle.orderId, "syncing");

    const diagnostic = createConflictDiagnostic(result.lifecycle.orderId, tenantId);
    await outboxDB.markOrderConflict(tenantId, result.lifecycle.orderId, diagnostic);

    const capturedOptions = getCapturedOptions();
    assert.ok(capturedOptions, "sync coordinator options should have been captured");
    assert.ok(capturedOptions.onOrderConflict, "onOrderConflict callback should exist");

    const entryBefore = await outboxDB.getOrder(tenantId, result.lifecycle.orderId);
    assert.ok(entryBefore, "entry should exist before callback");

    capturedOptions.onOrderConflict!(entryBefore, diagnostic);

    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    assert.equal(received.length, 2);
    assert.equal(received[1].status, "conflict");

    // Ensure no diagnostic text in the serialized lifecycle
    const serialized = JSON.stringify(received[1]);
    assert.equal(serialized.includes("INSUFFICIENT_STOCK"), false);
    assert.equal(serialized.includes("stock_conflict"), false);

    unsubscribe();
  } finally {
    controller.destroy();
  }
});

test("8. permanently rejected: invoke conflict callback, receive rejected", async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const tenantId = "tenant_rejected_flow";
  const catalogVersion = "v1.0.0";
  const authorityManager = new SuccessfulAuthorityManager(outboxDB, { trustedRegistry: testTrustedRegistry });
  await outboxDB.saveCatalogSnapshot(createSampleCatalog(tenantId, catalogVersion));

  const { controller, getCapturedOptions } = createControllerWithCapturedCoordinator(tenantId, outboxDB, authorityManager);
  try {
    await controller.initialize();

    const received = [];
    const unsubscribe = controller.subscribeToLifecycle((record) => received.push(record));

    const result = await controller.acceptOfflineOrder({
      lines: [{ lineId: "line_1", menuItemId: "item_latte", quantity: 1, selectedModifiers: [] }],
      cashTenderedCentavos: 20000,
      idempotencyKey: "idemp_rejected_flow",
    });

    assert.equal(received.length, 1);
    assert.equal(received[0].status, "pending");

    // Transition from pending_sync -> syncing -> permanently_rejected
    await outboxDB.updateOrderSyncState(tenantId, result.lifecycle.orderId, "syncing");

    const diagnostic = createConflictDiagnostic(result.lifecycle.orderId, tenantId);
    await outboxDB.markOrderPermanentlyRejected(tenantId, result.lifecycle.orderId, diagnostic);

    const capturedOptions = getCapturedOptions();
    assert.ok(capturedOptions.onOrderConflict, "reused conflict callback should exist");

    const entryBefore = await outboxDB.getOrder(tenantId, result.lifecycle.orderId);
    assert.ok(entryBefore, "entry should exist before callback");

    capturedOptions.onOrderConflict!(entryBefore, diagnostic);

    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    assert.equal(received.length, 2);
    assert.equal(received[1].status, "rejected");

    unsubscribe();
  } finally {
    controller.destroy();
  }
});

test("9. unsubscribe prevents later delivery", async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const tenantId = "tenant_unsub";
  const catalogVersion = "v1.0.0";
  const authorityManager = new SuccessfulAuthorityManager(outboxDB, { trustedRegistry: testTrustedRegistry });
  await outboxDB.saveCatalogSnapshot(createSampleCatalog(tenantId, catalogVersion));

  const { controller } = createControllerWithCapturedCoordinator(tenantId, outboxDB, authorityManager);
  try {
    await controller.initialize();

    const received = [];
    const unsubscribe = controller.subscribeToLifecycle((record) => received.push(record));
    unsubscribe();

    await controller.acceptOfflineOrder({
      lines: [{ lineId: "line_1", menuItemId: "item_latte", quantity: 1, selectedModifiers: [] }],
      cashTenderedCentavos: 20000,
      idempotencyKey: "idemp_unsub",
    });

    assert.equal(received.length, 0);
  } finally {
    controller.destroy();
  }
});

test("10. retained callback invoked after destroy publishes nothing", async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const tenantId = "tenant_retained_after_destroy";
  const catalogVersion = "v1.0.0";
  const authorityManager = new SuccessfulAuthorityManager(outboxDB, { trustedRegistry: testTrustedRegistry });
  await outboxDB.saveCatalogSnapshot(createSampleCatalog(tenantId, catalogVersion));

  const { controller, getCapturedOptions } = createControllerWithCapturedCoordinator(tenantId, outboxDB, authorityManager);
  await controller.initialize();

  try {
    const received = [];
    controller.subscribeToLifecycle((record) => received.push(record));

    const result = await controller.acceptOfflineOrder({
      lines: [{ lineId: "line_1", menuItemId: "item_latte", quantity: 1, selectedModifiers: [] }],
      cashTenderedCentavos: 20000,
      idempotencyKey: "idemp_retained_destroy",
    });

    // Capture the confirmed callback before destroying
    const capturedOptions = getCapturedOptions();
    assert.ok(capturedOptions.onOrderConfirmed, "captured callback should still be available");

    controller.destroy();

    const entryAfter = await outboxDB.getOrder(tenantId, result.lifecycle.orderId);
    assert.ok(entryAfter, "entry should still exist in DB after destroy");

    // Invoke the confirmed callback after destroy - should publish nothing
    capturedOptions.onOrderConfirmed!(entryAfter);

    // Wait for any async work
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    assert.equal(received.length, 1, "no new publications after destroy");
  } finally {
    controller.destroy();
  }
});

test("11. subscribing after destroy retains nothing", async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const tenantId = "tenant_subscribe_after_destroy";
  const catalogVersion = "v1.0.0";
  const authorityManager = new SuccessfulAuthorityManager(outboxDB, { trustedRegistry: testTrustedRegistry });
  await outboxDB.saveCatalogSnapshot(createSampleCatalog(tenantId, catalogVersion));

  const controller = createSimpleController(tenantId, outboxDB, authorityManager);
  await controller.initialize();
  controller.destroy();

  const received = [];
  const unsubscribe = controller.subscribeToLifecycle((record) => received.push(record));

  // Call unsubscribe (must be safe even after destroy)
  assert.doesNotThrow(() => unsubscribe());

  assert.equal(received.length, 0);
});

test("12. DB lookup failure returns null", async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const tenantId = "tenant_db_error";
  const catalogVersion = "v1.0.0";
  const authorityManager = new SuccessfulAuthorityManager(outboxDB, { trustedRegistry: testTrustedRegistry });
  await outboxDB.saveCatalogSnapshot(createSampleCatalog(tenantId, catalogVersion));

  const controller = createSimpleController(tenantId, outboxDB, authorityManager);

  try {
    await controller.initialize();

    // Blank and whitespace IDs return null without DB access
    assert.equal(await controller.getOrderLifecycle(""), null);
    assert.equal(await controller.getOrderLifecycle("   "), null);

    // Missing order returns null
    assert.equal(await controller.getOrderLifecycle("ord_missing"), null);

    // Corrupt database: patch getOrder to throw
    const origGetOrder = outboxDB.getOrder.bind(outboxDB);
    let callCount = 0;
    (outboxDB as Record<string, unknown>).getOrder = (tId: string, orderId: string) => {
      callCount += 1;
      throw new Error("Simulated DB failure");
    };

    // Should catch and return null, not throw
    assert.equal(await controller.getOrderLifecycle("ord_corrupt"), null);

    // Restore original method
    (outboxDB as Record<string, unknown>).getOrder = origGetOrder;

    assert.ok(callCount > 0, "getOrder should have been called despite the throw");
  } finally {
    controller.destroy();
  }
});

test("13. lifecycle publication does not replace general cached controller snapshot", async () => {
  const mockFactory = createMockIndexedDB();
  const outboxDB = new OrderSnapOutboxDB(mockFactory);
  const tenantId = "tenant_snapshot_isolation";
  const catalogVersion = "v1.0.0";
  const authorityManager = new SuccessfulAuthorityManager(outboxDB, { trustedRegistry: testTrustedRegistry });
  await outboxDB.saveCatalogSnapshot(createSampleCatalog(tenantId, catalogVersion));

  const { controller, getCapturedOptions } = createControllerWithCapturedCoordinator(tenantId, outboxDB, authorityManager);
  try {
    await controller.initialize();

    const received = [];
    const lifecycleUnsubscribe = controller.subscribeToLifecycle((record) => received.push(record));
    const stateUnsubscribe = controller.subscribe(() => {});

    const result = await controller.acceptOfflineOrder({
      lines: [{ lineId: "line_1", menuItemId: "item_latte", quantity: 1, selectedModifiers: [] }],
      cashTenderedCentavos: 20000,
      idempotencyKey: "idemp_snapshot_iso",
    });

    // Transition to syncing -> confirmed in the DB
    await outboxDB.updateOrderSyncState(tenantId, result.lifecycle.orderId, "syncing");
    await outboxDB.markOrderConfirmed(
      tenantId,
      result.lifecycle.orderId,
      { success: true, saleId: "sale_test", snapshotId: "snap_test", committedAt: new Date().toISOString() },
      "sale_id_test",
      "snapshot_id_test",
      new Date().toISOString()
    );

    const capturedOptions = getCapturedOptions();
    assert.ok(capturedOptions.onOrderConfirmed, "captured callback should exist");

    const entryRefreshed = await outboxDB.getOrder(tenantId, result.lifecycle.orderId);
    assert.ok(entryRefreshed);

    // Invoke the confirmed callback (synchronously: decrements pendingCount, calls notify())
    capturedOptions.onOrderConfirmed!(entryRefreshed);

    // After synchronous notify(), the state is fresh - capture it
    const stateAfterSync = controller.getState();

    // Wait for async re-read and lifecycle publication (which should NOT call notify())
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    // The async lifecycle publication should not have invalidated the cached state
    assert.strictEqual(stateAfterSync, controller.getState(), "state snapshot must be unchanged by async lifecycle publication");

    // Verify that a confirmed lifecycle was published
    const confirmedRecord = received[received.length - 1];
    assert.equal(confirmedRecord.status, "confirmed");

    lifecycleUnsubscribe();
    stateUnsubscribe();
  } finally {
    controller.destroy();
  }
});