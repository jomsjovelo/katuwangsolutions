/**
 * Order Snap — Authoritative Order Ingestion Schemas and Validation
 *
 * Converts authoritative food orders into immutable, validated order-line
 * references with modifier selections, ready for inventory deduction and
 * ledger movement generation.
 *
 * Invariants:
 * 1. Caller-provided idempotency key prevents duplicate order finalization.
 * 2. Caller-provided timestamps (no Date.now()) ensure deterministic ordering.
 * 3. All monetary values are safe integer centavos.
 * 4. All quantities are safe integer minor units.
 * 5. Modifier selections are authoritatively resolved from provided groups.
 * 6. Order lines are deterministically sorted for byte-identical serialization.
 * 7. Tenant identity is enforced across all references.
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import { IsoDateTimeSchema } from './domain-schemas';
import { MAX_SAFE_QUANTITY_COUNT, asciiCompare } from './quantity-math';

// ==========================================
// Order Line Canonical Schemas
// ==========================================

export const OrderLineModifierRefSchema = z.object({
  groupId: z.string().min(1, 'Modifier group ID is required.'),
  optionId: z.string().min(1, 'Modifier option ID is required.')
}).strict();

export const OrderLineSchema = z.object({
  lineId: z.string().min(1, 'Line ID is required.'),
  menuItemId: z.string().min(1, 'MenuItem ID is required.'),
  quantity: z.number().int().positive('Line quantity must be a positive integer.').max(MAX_SAFE_QUANTITY_COUNT),
  selectedModifiers: z.array(OrderLineModifierRefSchema).default([])
}).strict()
  .refine(data => {
    const keys = new Set<string>();
    for (const sel of data.selectedModifiers) {
      const key = `${sel.groupId}:${sel.optionId}`;
      if (keys.has(key)) return false;
      keys.add(key);
    }
    return true;
  }, { message: 'Duplicate modifier selections within a single order line (same group:option pair).', path: ['selectedModifiers'] });

// ==========================================
// Order Ingestion Request Schema
// ==========================================

export const OrderIngestionRequestSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required.'),
  tenantId: z.string().min(1, 'Tenant ID is required.'),
  staffAccountId: z.string().min(1, 'Staff account ID is required.'),
  idempotencyKey: z.string().min(1, 'Idempotency key is required.'),
  createdAt: IsoDateTimeSchema,
  committedAt: IsoDateTimeSchema,
  lines: z.array(OrderLineSchema)
    .min(1, 'Order must contain at least one line.')
    .max(100, 'Order must not exceed 100 lines.'),
  metadata: z.record(z.unknown()).optional()
}).strict()
  .refine(data => {
    const ids = new Set<string>();
    for (const line of data.lines) {
      if (ids.has(line.lineId)) return false;
      ids.add(line.lineId);
    }
    return true;
  }, { message: 'Duplicate line IDs within an order.', path: ['lines'] });

// ==========================================
// TypeScript Types
// ==========================================

export type OrderLineModifierRef = z.infer<typeof OrderLineModifierRefSchema>;
export type OrderLine = z.infer<typeof OrderLineSchema>;
export type OrderIngestionRequest = z.infer<typeof OrderIngestionRequestSchema>;

// ==========================================
// Validation Helpers
// ==========================================

/**
 * Validates that order line IDs are unique within the request.
 */
export function validateOrderLineUniqueness(request: OrderIngestionRequest): void {
  const lineIds = new Set<string>();
  for (const line of request.lines) {
    if (lineIds.has(line.lineId)) {
      throw new Error(`Duplicate line ID "${line.lineId}" found in order "${request.orderId}".`);
    }
    lineIds.add(line.lineId);
  }
}

/**
 * Normalizes order lines into canonical form: sort by lineId for deterministic ordering.
 */
export function normalizeOrderLines(lines: OrderLine[]): OrderLine[] {
  return [...lines].sort((a, b) => asciiCompare(a.lineId, b.lineId));
}

/**
 * Builds SelectedModifierSelection[] from OrderLine.selectedModifiers for use with costing engine.
 * Cross-line duplicate modifier selections are allowed; they represent different order lines.
 */
export function buildModifierSelectionsFromLines(
  lines: OrderLine[],
  modifierGroups: import('./costing').ModifierGroupsInput
): import('./costing').SelectedModifierSelection[] {
  const selections: import('./costing').SelectedModifierSelection[] = [];

  for (const line of normalizeOrderLines(lines)) {
    for (const ref of line.selectedModifiers) {
      selections.push({ groupId: ref.groupId, optionId: ref.optionId });
    }
  }

  return selections;
}

/**
 * Validates that modifier references in order lines correspond to authoritative groups.
 */
export function validateOrderModifierReferences(
  lines: OrderLine[],
  modifierGroups: import('./costing').ModifierGroupsInput
): void {
  const { normalizeModifierGroups } = require('./costing') as typeof import('./costing');
  const groupsMap = normalizeModifierGroups(modifierGroups);

  for (const line of lines) {
    for (const ref of line.selectedModifiers) {
      const group = groupsMap.get(ref.groupId);
      if (!group) {
        throw new Error(`Order line "${line.lineId}" references unknown modifier group "${ref.groupId}".`);
      }
      const option = group.options.find((o: { id: string }) => o.id === ref.optionId);
      if (!option) {
        throw new Error(`Order line "${line.lineId}" references option "${ref.optionId}" not in group "${ref.groupId}".`);
      }
      if (!option.isAvailable) {
        throw new Error(`Order line "${line.lineId}" references unavailable option "${ref.optionId}".`);
      }
    }
  }
}

/**
 * Computes a deterministic fingerprint for idempotency checking.
 * Uses canonical ASCII sorting and JSON serialization.
 */
export function computeOrderFingerprint(request: OrderIngestionRequest): string {
  const normalizedLines = normalizeOrderLines(request.lines);
  const canonical = {
    tenantId: request.tenantId,
    staffAccountId: request.staffAccountId,
    lines: normalizedLines.map(line => ({
      lineId: line.lineId,
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      selectedModifiers: [...line.selectedModifiers].sort((a, b) =>
        asciiCompare(`${a.groupId}:${a.optionId}`, `${b.groupId}:${b.optionId}`)
      )
    }))
  };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}