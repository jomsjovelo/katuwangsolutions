/**
 * Order Snap — Canonical F&B Domain Schemas and Invariants
 *
 * Enforces:
 * 1. Safe integer centavos for all prices, costs, and financial deltas.
 * 2. Safe integer minor units with explicit scale for all ingredient quantities.
 * 3. Exact immutable snapshot structures for historical audit integrity.
 * 4. Yield constrained strictly to 1 (per-serving).
 * 5. Ingredient unit and scale must strictly match closed canonical unit registry.
 * 6. Modifier groups require maxSelections === 1 when allowMultiple is false, and unique option IDs.
 * 7. Gross margin represented in integer basis points (10,000 bps = 100%).
 * 8. Valid ISO datetime format for historical snapshots.
 */

import { z } from 'zod';
import {
  MAX_SAFE_CENTAVOS,
  MAX_SAFE_QUANTITY_MINOR,
  MAX_SAFE_QUANTITY_COUNT,
  isValidQuantityScale,
  getUnitMetadata
} from './quantity-math';

// ==========================================
// Base Primitives & Custom Validators
// ==========================================

export const SafeCentavosSchema = z.number()
  .int('Centavos must be an integer.')
  .min(0, 'Centavos must be non-negative.')
  .max(MAX_SAFE_CENTAVOS, 'Centavos exceeds safe financial limits.');

export const SafeDeltaCentavosSchema = z.number()
  .int('Delta centavos must be an integer.')
  .min(-MAX_SAFE_CENTAVOS, 'Delta centavos exceeds minimum safe bounds.')
  .max(MAX_SAFE_CENTAVOS, 'Delta centavos exceeds maximum safe bounds.');

export const SafeQuantityMinorSchema = z.number()
  .int('Quantity minor must be an integer.')
  .min(0, 'Quantity minor must be non-negative.')
  .max(MAX_SAFE_QUANTITY_MINOR, 'Quantity minor exceeds safe bounds.');

export const SafeQuantityMinorDeltaSchema = z.number()
  .int('Quantity minor delta must be an integer.')
  .min(-MAX_SAFE_QUANTITY_MINOR, 'Quantity minor delta exceeds minimum safe bounds.')
  .max(MAX_SAFE_QUANTITY_MINOR, 'Quantity minor delta exceeds maximum safe bounds.');

export const QuantityScaleSchema = z.number()
  .int('Quantity scale must be an integer.')
  .refine(isValidQuantityScale, { message: 'Quantity scale must be an integer between 0 and 4.' });

export const IsoDateTimeSchema = z.string()
  .min(1, 'ISO datetime string is required.')
  .refine(val => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(val)) {
      return false;
    }
    const timestamp = Date.parse(val);
    return !Number.isNaN(timestamp);
  }, { message: 'Invalid ISO datetime format.' });

// ==========================================
// Ingredient & Cost Basis Schemas
// ==========================================

export const IngredientCostBasisSchema = z.object({
  basisQuantityMinor: z.number().int().positive('Basis quantity must be a positive integer.').max(MAX_SAFE_QUANTITY_MINOR),
  basisCostCentavos: SafeCentavosSchema
}).strict();

export const IngredientSchema = z.object({
  id: z.string().min(1, 'Ingredient ID is required.'),
  tenantId: z.string().min(1, 'Tenant ID is required.'),
  name: z.string().min(1, 'Ingredient name is required.'),
  unit: z.string().min(1, 'Unit of measurement is required.'),
  quantityScale: QuantityScaleSchema.default(3),
  stockQuantityMinor: SafeQuantityMinorSchema.default(0),
  costBasis: IngredientCostBasisSchema,
  reorderLevelMinor: SafeQuantityMinorSchema.default(0),
  isActive: z.boolean().default(true),
  version: z.number().int().positive().max(100_000).default(1),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
}).strict()
  .refine(data => {
    try {
      const meta = getUnitMetadata(data.unit);
      return meta.canonicalUnit === data.unit;
    } catch {
      return false;
    }
  }, {
    message: 'Ingredient unit must be a registered canonical unit in canonical form.',
    path: ['unit']
  })
  .refine(data => {
    try {
      const meta = getUnitMetadata(data.unit);
      return data.quantityScale === meta.standardScale;
    } catch {
      return false;
    }
  }, {
    message: 'Ingredient quantityScale must match the standard scale for the canonical unit.',
    path: ['quantityScale']
  });

// ==========================================
// Recipe Component & Version Schemas
// ==========================================

export const RecipeComponentSchema = z.object({
  ingredientId: z.string().min(1, 'Ingredient ID is required.'),
  quantityMinor: z.number().int().positive('Component quantity must be a positive integer.').max(MAX_SAFE_QUANTITY_MINOR),
  unit: z.string().optional(),
  quantityScale: QuantityScaleSchema.optional(),
  notes: z.string().optional()
}).strict();

export const RecipeVersionSchema = z.object({
  id: z.string().min(1, 'Recipe version ID is required.'),
  tenantId: z.string().min(1, 'Tenant ID is required.'),
  menuItemId: z.string().min(1, 'Menu item ID is required.'),
  version: z.number().int().positive('Recipe version number must be a positive integer.').max(100_000),
  yield: z.number().int().refine(y => y === 1, {
    message: 'Unsupported recipe yield. Current foundation only supports yield: 1 (single-serving recipes).'
  }).default(1),
  components: z.array(RecipeComponentSchema)
    .min(1, 'Recipe must have at least one ingredient component.')
    .refine(components => {
      const ids = new Set<string>();
      for (const comp of components) {
        if (ids.has(comp.ingredientId)) return false;
        ids.add(comp.ingredientId);
      }
      return true;
    }, { message: 'Duplicate ingredient components are not allowed in a recipe version.' }),
  isActive: z.boolean().default(true),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
  createdAt: z.string().optional()
}).strict();

// ==========================================
// Modifier Option & Group Schemas
// ==========================================

export const ModifierIngredientDeltaSchema = z.object({
  ingredientId: z.string().min(1, 'Ingredient ID is required.'),
  quantityMinorDelta: SafeQuantityMinorDeltaSchema
}).strict();

export const ModifierOptionSchema = z.object({
  id: z.string().min(1, 'Modifier option ID is required.'),
  name: z.string().min(1, 'Modifier option name is required.'),
  priceDeltaCentavos: SafeDeltaCentavosSchema.default(0),
  ingredientDeltas: z.array(ModifierIngredientDeltaSchema).default([]),
  prepInstruction: z.string().optional(),
  isAvailable: z.boolean().default(true),
  displayOrder: z.number().int().optional()
}).strict();

export const ModifierGroupSchema = z.object({
  id: z.string().min(1, 'Modifier group ID is required.'),
  tenantId: z.string().min(1, 'Tenant ID is required.'),
  name: z.string().min(1, 'Modifier group name is required.'),
  isRequired: z.boolean().default(false),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(1).default(1),
  allowMultiple: z.boolean().default(false),
  options: z.array(ModifierOptionSchema)
    .min(1, 'Modifier group must contain at least one option.')
    .refine(options => {
      const ids = new Set<string>();
      for (const opt of options) {
        if (ids.has(opt.id)) return false;
        ids.add(opt.id);
      }
      return true;
    }, { message: 'Modifier group options must have unique IDs.' }),
  isActive: z.boolean().default(true)
}).strict()
  .refine(data => data.maxSelections >= data.minSelections, {
    message: 'maxSelections must be greater than or equal to minSelections.',
    path: ['maxSelections']
  })
  .refine(data => data.allowMultiple || data.maxSelections === 1, {
    message: 'Single-select modifier groups (allowMultiple=false) must have maxSelections === 1.',
    path: ['maxSelections']
  })
  .refine(data => !data.isRequired || data.minSelections >= 1, {
    message: 'Required modifier groups must have minSelections of at least 1.',
    path: ['minSelections']
  });

// ==========================================
// Menu Item Schema
// ==========================================

export const MenuItemSchema = z.object({
  id: z.string().min(1, 'Menu item ID is required.'),
  tenantId: z.string().min(1, 'Tenant ID is required.'),
  name: z.string().min(1, 'Menu item name is required.'),
  category: z.string().min(1, 'Category is required.').default('General'),
  basePriceCentavos: z.number().int().positive('Base price must be a positive integer in centavos.').max(MAX_SAFE_CENTAVOS),
  activeRecipeVersionId: z.string().min(1, 'Active recipe version ID is required.'),
  modifierGroupIds: z.array(z.string()).default([]),
  isAvailable: z.boolean().default(true),
  description: z.string().optional(),
  prepTimeMinutes: z.number().int().min(0).optional(),
  station: z.string().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
}).strict();

// ==========================================
// Historical Snapshot Schemas (Immutable Audit Record)
// ==========================================

export const HistoricalComponentSnapshotSchema = z.object({
  ingredientId: z.string(),
  ingredientName: z.string(),
  unit: z.string(),
  quantityScale: QuantityScaleSchema,
  baseQuantityMinor: SafeQuantityMinorSchema,
  deltaQuantityMinor: SafeQuantityMinorDeltaSchema,
  finalQuantityMinor: SafeQuantityMinorSchema,
  basisQuantityMinor: z.number().int().positive().max(MAX_SAFE_QUANTITY_MINOR),
  basisCostCentavos: SafeCentavosSchema,
  componentCostCentavos: SafeCentavosSchema
}).strict();

export const HistoricalModifierSnapshotSchema = z.object({
  modifierGroupId: z.string(),
  modifierGroupName: z.string(),
  modifierOptionId: z.string(),
  modifierOptionName: z.string(),
  priceDeltaCentavos: SafeDeltaCentavosSchema,
  ingredientDeltas: z.array(ModifierIngredientDeltaSchema)
}).strict();

export const SaleLineSnapshotSchema = z.object({
  saleLineId: z.string().min(1, 'saleLineId is required.'),
  tenantId: z.string().min(1, 'tenantId is required.'),
  menuItemId: z.string().min(1, 'menuItemId is required.'),
  menuItemName: z.string().min(1, 'menuItemName is required.'),
  category: z.string().min(1, 'category is required.'),
  basePriceCentavos: SafeCentavosSchema,
  finalUnitPriceCentavos: SafeCentavosSchema,
  quantity: z.number().int().positive('Sale line quantity must be a positive integer.').max(MAX_SAFE_QUANTITY_COUNT),
  unitCogsCentavos: SafeCentavosSchema,
  lineCogsCentavos: SafeCentavosSchema,
  lineRevenueCentavos: SafeCentavosSchema,
  lineGrossProfitCentavos: SafeDeltaCentavosSchema,
  grossMarginBasisPoints: z.number().int().min(-1000000).max(10000), // 10,000 bps = 100.00%
  recipeVersionId: z.string().min(1, 'recipeVersionId is required.'),
  recipeVersionNumber: z.number().int().positive().max(100_000),
  components: z.array(HistoricalComponentSnapshotSchema),
  selectedModifiers: z.array(HistoricalModifierSnapshotSchema),
  createdAt: IsoDateTimeSchema
}).strict();

// ==========================================
// Inferred TypeScript Domain Types
// ==========================================

export type IngredientCostBasis = z.infer<typeof IngredientCostBasisSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>;
export type RecipeComponent = z.infer<typeof RecipeComponentSchema>;
export type RecipeVersion = z.infer<typeof RecipeVersionSchema>;
export type ModifierIngredientDelta = z.infer<typeof ModifierIngredientDeltaSchema>;
export type ModifierOption = z.infer<typeof ModifierOptionSchema>;
export type ModifierGroup = z.infer<typeof ModifierGroupSchema>;
export type MenuItem = z.infer<typeof MenuItemSchema>;
export type HistoricalComponentSnapshot = z.infer<typeof HistoricalComponentSnapshotSchema>;
export type HistoricalModifierSnapshot = z.infer<typeof HistoricalModifierSnapshotSchema>;
export type SaleLineSnapshot = z.infer<typeof SaleLineSnapshotSchema>;
