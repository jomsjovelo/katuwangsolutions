/**
 * Order Snap — Immutable Inventory Ledger Movement Records
 *
 * Creates deterministic, tenant-scoped inventory ledger movement records for
 * order finalization, ensuring audit integrity and byte-identical replay.
 *
 * Invariants:
 * 1. Every movement is tenant-scoped and validated.
 * 2. Movement IDs are deterministic using SHA-256 of canonical components.
 * 3. All quantities are positive deduction quantities; deltas are negative-signed.
 * 4. previousStock + quantityMinorDelta === newStock (exact reconciliation).
 * 5. Movements are sorted by ASCII ingredient ID for byte-identical output.
 * 6. All records are recursively deep-frozen.
 * 7. No Date.now(), random IDs, database access, or mutation inside pure builders.
 * 8. quantityMinorDelta must be strictly negative (non-zero deduction).
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import { IsoDateTimeSchema, SafeQuantityMinorSchema } from './domain-schemas';
import { asciiCompare, deepFreeze, getUnitMetadata } from './quantity-math';
import { InventoryDeduction } from './inventory-deduction';

/**
 * Validates that the deduction's unit is the canonical form and that quantityScale matches
 * the standard scale for that unit. Required for ledger integrity even when the ledger
 * builder is called directly (bypassing higher-level aggregation).
 */
function validateCanonicalLedgerUnit(unit: string, quantityScale: number, ingredientId: string): void {
  const meta = getUnitMetadata(unit);
  if (meta.canonicalUnit !== unit) {
    throw new Error(
      `Ledger unit for ingredient "${ingredientId}" must be canonical. Got "${unit}", expected "${meta.canonicalUnit}".`
    );
  }
  if (quantityScale !== meta.standardScale) {
    throw new Error(
      `Ledger quantityScale for ingredient "${ingredientId}" (unit "${unit}") must equal standard scale ${meta.standardScale}, got ${quantityScale}.`
    );
  }
}

// ==========================================
// Schema and Types
// ==========================================

export const InventoryLedgerMovementSchema = z.object({
  movementId: z.string().min(1, 'Movement ID is required.'),
  tenantId: z.string().min(1, 'Tenant ID is required.'),
  orderId: z.string().min(1, 'Order ID is required.'),
  saleId: z.string().min(1, 'Sale ID is required.'),
  ingredientId: z.string().min(1, 'Ingredient ID is required.'),
  ingredientName: z.string().min(1, 'Ingredient name is required.'),
  unit: z.string().min(1, 'Unit is required.'),
  quantityScale: z.number().int().min(0).max(4),
  quantityMinorDelta: z.number().int().refine(
    delta => Number.isSafeInteger(delta) && delta < 0,
    { message: 'Quantity delta must be a strictly negative integer (non-zero deduction).' }
  ),
  previousStockQuantityMinor: SafeQuantityMinorSchema,
  newStockQuantityMinor: SafeQuantityMinorSchema,
  createdAt: IsoDateTimeSchema
}).strict()
  .refine(data => {
    return data.previousStockQuantityMinor + data.quantityMinorDelta === data.newStockQuantityMinor;
  }, {
    message: 'Stock reconciliation failed: previousStock + delta must equal newStock.',
    path: ['newStockQuantityMinor']
  })
  .refine(data => {
    return data.newStockQuantityMinor >= 0;
  }, {
    message: 'New stock cannot be negative.',
    path: ['newStockQuantityMinor']
  });

export type InventoryLedgerMovement = z.infer<typeof InventoryLedgerMovementSchema>;

// ==========================================
// Builder Functions
// ==========================================

/**
 * Validates that an ID string is a safe server identifier (alphanumeric, dash, underscore).
 * Prevents injection or ambiguous concatenation in deterministic ID derivation.
 */
const SERVER_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

function validateIdentifier(value: string, fieldName: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  if (!SERVER_IDENTIFIER.test(value)) {
    throw new Error(`${fieldName} contains invalid characters. Must match ${SERVER_IDENTIFIER}.`);
  }
}

/**
 * Creates a deterministic movement ID from canonical components.
 * Uses SHA-256 to produce collision-resistant, unambiguous identifiers.
 */
function deriveMovementId(
  tenantId: string,
  orderId: string,
  saleId: string,
  ingredientId: string
): string {
  const canonical = `movement:${tenantId}:${orderId}:${saleId}:${ingredientId}`;
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Builds an immutable InventoryLedgerMovement record from validated deduction data.
 *
 * Enforces:
 * - Tenant scoping and identity validation
 * - Stock reconciliation: previousStock + quantityMinorDelta === newStock
 * - Deduction is strictly positive; delta is negative
 * - Deterministic movement ID derivation
 * - Recursive deep freeze
 */
export function buildInventoryLedgerMovement(params: {
  tenantId: string;
  orderId: string;
  saleId: string;
  ingredientId: string;
  deduction: InventoryDeduction;
  createdAt: string;
}): InventoryLedgerMovement {
  const { tenantId, orderId, saleId, ingredientId, deduction, createdAt } = params;

  validateIdentifier(tenantId, 'tenantId');
  validateIdentifier(orderId, 'orderId');
  validateIdentifier(saleId, 'saleId');
  validateIdentifier(ingredientId, 'ingredientId');

  if (!createdAt || typeof createdAt !== 'string' || createdAt.trim().length === 0) {
    throw new Error('createdAt must be a non-empty ISO datetime string.');
  }

  IsoDateTimeSchema.parse(createdAt);

  if (deduction.deductionQuantityMinor <= 0) {
    throw new Error(`Deduction quantity must be positive, got ${deduction.deductionQuantityMinor}.`);
  }

  // Enforce canonical unit + matching standard scale on every ledger entry,
  // even when the builder is called directly.
  validateCanonicalLedgerUnit(deduction.unit, deduction.quantityScale, ingredientId);

  const previousStock = deduction.previousStockQuantityMinor;
  const deductionQuantity = deduction.deductionQuantityMinor;
  const newStock = deduction.newStockQuantityMinor;

  const quantityMinorDelta = -deductionQuantity;

  if (previousStock + quantityMinorDelta !== newStock) {
    throw new Error(
      `Stock reconciliation failed for ingredient "${ingredientId}": ` +
      `${previousStock} + (${quantityMinorDelta}) !== ${newStock}`
    );
  }

  if (newStock < 0) {
    throw new Error(`New stock cannot be negative for ingredient "${ingredientId}": ${newStock}`);
  }

  // Verify deduction tenant matches movement tenant
  if (deduction.tenantId !== tenantId) {
    throw new Error(`Tenant mismatch: deduction tenant "${deduction.tenantId}" does not match movement tenant "${tenantId}".`);
  }

  const movementId = deriveMovementId(tenantId, orderId, saleId, ingredientId);

  const raw = {
    movementId,
    tenantId,
    orderId,
    saleId,
    ingredientId,
    ingredientName: deduction.ingredientName,
    unit: deduction.unit,
    quantityScale: deduction.quantityScale,
    quantityMinorDelta,
    previousStockQuantityMinor: previousStock,
    newStockQuantityMinor: newStock,
    createdAt
  };

  const validated = InventoryLedgerMovementSchema.parse(raw);
  return deepFreezeMovement(validated);
}

/**
 * Builds all ledger movements for an order from a complete deduction plan.
 * Movements are sorted by ASCII ingredient ID for byte-identical output.
 */
export function buildInventoryLedgerMovements(params: {
  tenantId: string;
  orderId: string;
  saleId: string;
  deductions: ReadonlyArray<InventoryDeduction>;
  createdAt: string;
}): ReadonlyArray<InventoryLedgerMovement> {
  const { tenantId, orderId, saleId, deductions, createdAt } = params;

  validateIdentifier(tenantId, 'tenantId');
  validateIdentifier(orderId, 'orderId');
  validateIdentifier(saleId, 'saleId');

  if (!Array.isArray(deductions) || deductions.length === 0) {
    throw new Error('Deductions array must be non-empty.');
  }

  const existingMovementIds = new Set<string>();
  const movements: InventoryLedgerMovement[] = [];

  const sortedDeductions = [...deductions].sort((a, b) =>
    asciiCompare(a.ingredientId, b.ingredientId)
  );

  for (const deduction of sortedDeductions) {
    validateIdentifier(deduction.ingredientId, 'ingredientId');

    // Verify deduction tenant matches
    if (deduction.tenantId !== tenantId) {
      throw new Error(`Tenant mismatch in deduction for ingredient "${deduction.ingredientId}".`);
    }

    const movementId = deriveMovementId(tenantId, orderId, saleId, deduction.ingredientId);
    if (existingMovementIds.has(movementId)) {
      throw new Error(`Duplicate movement ID detected: "${movementId}" for ingredient "${deduction.ingredientId}".`);
    }
    existingMovementIds.add(movementId);

    const movement = buildInventoryLedgerMovement({
      tenantId,
      orderId,
      saleId,
      ingredientId: deduction.ingredientId,
      deduction,
      createdAt
    });
    movements.push(movement);
  }

  return deepFreeze(movements);
}

/**
 * Recursively deep freezes a movement object to make it genuinely immutable.
 */
function deepFreezeMovement<T extends object>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = (obj as any)[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreezeMovement(value);
    }
  }
  return obj as Readonly<T>;
}