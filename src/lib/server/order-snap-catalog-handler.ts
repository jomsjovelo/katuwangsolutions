/**
 * Order Snap Catalog Handler — Cashier-Safe Offline Catalog Endpoint
 *
 * Implements:
 * - Strict Firebase ID token verification for Owner and Cashier identities
 * - Zero trust of client-provided roles or tenant IDs
 * - Tenant-scoped, module-entitled catalog data extraction
 * - Cashier-safe data transformation (excludes all cost/COGS/margin fields)
 * - Deterministic canonical ordering for reproducible catalogVersion hashes
 * - Sanitized error responses without stack traces or internal details
 */

import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import {
  OfflineCatalogSnapshot,
  OfflineMenuItem,
  OfflineRecipeVersion,
  OfflineModifierGroup,
  OfflineIngredientStock
} from '../order-snap/offline-types';
import {
  OrderSnapError,
  OrderSnapErrorCode,
  sanitizedErrorResponse
} from './order-snap-finalizer';
import {
  verifyOrderSnapIdentity,
  VerifiedOrderSnapIdentity
} from './order-snap-identity';
import { asciiCompare } from '../order-snap/quantity-math';

export interface OrderSnapCatalogHandlerOptions {
  adminAuth?: admin.auth.Auth;
  adminFirestore?: admin.firestore.Firestore;
  now?: () => admin.firestore.Timestamp;
}

const MAX_CATALOG_SIZE_BYTES = 512 * 1024;

interface FirestoreMenuItem {
  id: string;
  tenantId: string;
  name: string;
  category: string;
  basePriceCentavos: number;
  activeRecipeVersionId: string;
  modifierGroupIds?: string[];
  isActive: boolean;
  isAvailable?: boolean;
  description?: string;
  prepTimeMinutes?: number;
  station?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface FirestoreRecipeVersion {
  id: string;
  tenantId: string;
  menuItemId: string;
  version: number;
  yield?: number;
  isActive: boolean;
  components: Array<{
    ingredientId: string;
    quantityMinor: number;
    unit: string;
    quantityScale?: number;
    notes?: string;
  }>;
  effectiveFrom?: string;
  effectiveTo?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface FirestoreModifierGroup {
  id: string;
  tenantId: string;
  name: string;
  isRequired?: boolean;
  minSelections?: number;
  maxSelections?: number;
  allowMultiple?: boolean;
  options: Array<{
    id: string;
    name: string;
    priceDeltaCentavos?: number;
    ingredientDeltas?: Array<{
      ingredientId: string;
      quantityMinorDelta: number;
      unit?: string;
    }>;
    prepInstruction?: string;
    isAvailable?: boolean;
    displayOrder?: number;
  }>;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface FirestoreIngredient {
  id: string;
  tenantId: string;
  name: string;
  unit: string;
  quantityScale?: number;
  stockQuantityMinor: number;
  costBasis?: {
    basisQuantityMinor: number;
    basisCostCentavos: number;
  };
  reorderLevelMinor?: number;
  isActive: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

async function verifyIdentityForCatalog(
  req: Request,
  auth: admin.auth.Auth,
  firestore: admin.firestore.Firestore
): Promise<VerifiedOrderSnapIdentity> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new OrderSnapError(OrderSnapErrorCode.AUTHENTICATION_REQUIRED, 'Missing Bearer token');
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    throw new OrderSnapError(OrderSnapErrorCode.AUTHENTICATION_REQUIRED, 'Empty Bearer token');
  }

  return verifyOrderSnapIdentity(idToken, auth, firestore);
}

export function createOrderSnapCatalogRouteHandler(
  options: OrderSnapCatalogHandlerOptions = {}
) {
  return async function handleOrderSnapCatalog(req: Request): Promise<Response> {
    if (req.method !== 'GET') {
      return sanitizedErrorResponse(
        new OrderSnapError(OrderSnapErrorCode.INVALID_REQUEST, 'Method Not Allowed'),
        { Allow: 'GET' }
      );
    }

    try {
      const auth = options.adminAuth || getAdminAuth();
      const firestore = options.adminFirestore || getAdminFirestore();

      const identity = await verifyIdentityForCatalog(req, auth, firestore);
      const catalog = await buildCatalogSnapshot(identity.tenantId, identity.role, identity.staffAccountId, firestore, options.now);

      if (!catalog) {
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.CHECKOUT_UNAVAILABLE, 'Catalog unavailable')
        );
      }

      const payload = JSON.stringify(catalog);
      const responseSize = new TextEncoder().encode(payload).length;

      if (responseSize > MAX_CATALOG_SIZE_BYTES) {
        console.error('[CATALOG_HANDLER] catalog_size_limit_exceeded');
        return sanitizedErrorResponse(
          new OrderSnapError(OrderSnapErrorCode.SERVICE_UNAVAILABLE, 'Catalog size limit exceeded')
        );
      }

      return Response.json(catalog, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Content-Length': String(responseSize)
        }
      });
    } catch (err: any) {
      if (err instanceof OrderSnapError) {
        return sanitizedErrorResponse(err);
      }
      console.error('[CATALOG_HANDLER] unexpected_error');
      return sanitizedErrorResponse(
        new OrderSnapError(OrderSnapErrorCode.SERVICE_UNAVAILABLE, 'Internal server error')
      );
    }
  };
}

interface FirestoreIngredientMap {
  [id: string]: FirestoreIngredient;
}

export async function buildCatalogSnapshot(
  tenantId: string,
  role: 'cashier' | 'owner',
  staffAccountId: string | null,
  firestore: admin.firestore.Firestore,
  nowFn?: () => admin.firestore.Timestamp
): Promise<OfflineCatalogSnapshot | null> {
  const tenantRef = firestore.collection('tenants').doc(tenantId);

  let menuItemsSnap: admin.firestore.QuerySnapshot;
  let recipesSnap: admin.firestore.QuerySnapshot;
  let modifierGroupsSnap: admin.firestore.QuerySnapshot;
  let ingredientsSnap: admin.firestore.QuerySnapshot;

  try {
    [menuItemsSnap, recipesSnap, modifierGroupsSnap, ingredientsSnap] = await Promise.all([
      tenantRef.collection('menu_items').where('isActive', '==', true).get(),
      tenantRef.collection('recipes').where('isActive', '==', true).get(),
      tenantRef.collection('modifier_groups').get(),
      tenantRef.collection('ingredients').where('isActive', '==', true).get()
    ]);
  } catch (err) {
    console.error('[CATALOG_HANDLER] firestore_query_error');
    return null;
  }

  const ingredientsMap: FirestoreIngredientMap = {};
  for (const doc of ingredientsSnap.docs) {
    const data = doc.data() as FirestoreIngredient;
    if (doc.id !== data.id) {
      console.error('[CATALOG_HANDLER] ingredient_id_mismatch');
      return null;
    }
    ingredientsMap[data.id] = data;
  }

  const recipesMap: Record<string, FirestoreRecipeVersion> = {};
  const seenRecipeIds = new Set<string>();
  const menuItemsMap: Record<string, FirestoreMenuItem> = {};
  const seenMenuItemIds = new Set<string>();

  for (const doc of menuItemsSnap.docs) {
    const data = doc.data() as FirestoreMenuItem;
    if (doc.id !== data.id) {
      console.error('[CATALOG_HANDLER] menu_item_id_mismatch');
      return null;
    }
    if (seenMenuItemIds.has(doc.id)) {
      console.error('[CATALOG_HANDLER] duplicate_menu_item_id');
      return null;
    }
    seenMenuItemIds.add(doc.id);

    if (typeof data.basePriceCentavos !== 'number' || data.basePriceCentavos < 0) {
      console.error('[CATALOG_HANDLER] invalid_menu_item_price');
      return null;
    }

    menuItemsMap[data.id] = data;
  }

  for (const doc of recipesSnap.docs) {
    const data = doc.data() as FirestoreRecipeVersion;
    if (doc.id !== data.id) {
      console.error('[CATALOG_HANDLER] recipe_id_mismatch');
      return null;
    }
    if (seenRecipeIds.has(doc.id)) {
      console.error('[CATALOG_HANDLER] duplicate_recipe_id');
      return null;
    }
    seenRecipeIds.add(doc.id);

    if (!data.components || data.components.length === 0) {
      console.error('[CATALOG_HANDLER] recipe_no_components');
      return null;
    }

    for (const comp of data.components) {
      if (!comp.ingredientId || !comp.quantityMinor || comp.quantityMinor <= 0 || !comp.unit) {
        console.error('[CATALOG_HANDLER] invalid_recipe_component');
        return null;
      }
    }

    recipesMap[data.id] = data;
  }

  const modifierGroups: OfflineModifierGroup[] = [];
  const seenModifierGroupIds = new Set<string>();

  interface OfflineModifierOption {
    optionId: string;
    name: string;
    priceDeltaCentavos: number;
    ingredientDeltas?: Array<{ ingredientId: string; quantityMinorDelta: number; unit: string }>;
  }

  for (const doc of modifierGroupsSnap.docs) {
    const data = doc.data() as FirestoreModifierGroup;
    if (doc.id !== data.id) {
      console.error('[CATALOG_HANDLER] modifier_group_id_mismatch');
      return null;
    }
    if (seenModifierGroupIds.has(doc.id)) {
      console.error('[CATALOG_HANDLER] duplicate_modifier_group_id');
      return null;
    }
    seenModifierGroupIds.add(doc.id);

    const options: OfflineModifierOption[] = [];

    for (const opt of (data.options || [])) {
      if (opt.isAvailable === false) continue;

      const ingredientDeltas: Array<{ ingredientId: string; quantityMinorDelta: number; unit: string }> = [];

      for (const delta of (opt.ingredientDeltas || [])) {
        if (!delta.ingredientId || typeof delta.quantityMinorDelta !== 'number' || delta.quantityMinorDelta <= 0) {
          continue;
        }
        if (!ingredientsMap[delta.ingredientId]) {
          console.error('[CATALOG_HANDLER] modifier_delta_missing_ingredient');
          return null;
        }
        ingredientDeltas.push({
          ingredientId: delta.ingredientId,
          quantityMinorDelta: delta.quantityMinorDelta,
          unit: delta.unit ?? 'g'
        });
      }

      options.push({
        optionId: opt.id,
        name: opt.name,
        priceDeltaCentavos: opt.priceDeltaCentavos ?? 0,
        ingredientDeltas
      });
    }

    options.sort((a, b) => asciiCompare(a.optionId, b.optionId));

    modifierGroups.push({
      modifierGroupId: doc.id,
      tenantId: data.tenantId,
      name: data.name,
      minSelections: data.minSelections ?? 0,
      maxSelections: data.maxSelections ?? 1,
      isRequired: data.isRequired ?? false,
      options
    });
  }

  modifierGroups.sort((a, b) => asciiCompare(a.modifierGroupId, b.modifierGroupId));

  const ingredients: OfflineIngredientStock[] = [];

  for (const doc of ingredientsSnap.docs) {
    const data = doc.data() as FirestoreIngredient;

    ingredients.push({
      ingredientId: doc.id,
      tenantId: data.tenantId,
      name: data.name,
      unit: data.unit,
      stockQuantityMinor: data.stockQuantityMinor,
      isActive: data.isActive
    });
  }

  ingredients.sort((a, b) => asciiCompare(a.ingredientId, b.ingredientId));

  const sortedMenuItemIds = Object.keys(menuItemsMap).sort((a, b) => asciiCompare(a, b));
  const finalMenuItems: OfflineMenuItem[] = [];

  for (const id of sortedMenuItemIds) {
    const data = menuItemsMap[id];
    finalMenuItems.push({
      menuItemId: data.id,
      tenantId: data.tenantId,
      name: data.name,
      category: data.category,
      basePriceCentavos: data.basePriceCentavos,
      activeRecipeVersionId: data.activeRecipeVersionId,
      isActive: data.isActive,
      modifierGroupIds: data.modifierGroupIds || []
    });
  }

  const sortedRecipeIds = Object.keys(recipesMap).sort((a, b) => asciiCompare(a, b));
  const finalRecipes: OfflineRecipeVersion[] = [];

  for (const id of sortedRecipeIds) {
    const data = recipesMap[id];
    const components = data.components
      .slice()
      .sort((a, b) => asciiCompare(a.ingredientId, b.ingredientId))
      .map(c => ({
        ingredientId: c.ingredientId,
        quantityMinor: c.quantityMinor,
        unit: c.unit
      }));

    finalRecipes.push({
      recipeVersionId: data.id,
      menuItemId: data.menuItemId,
      versionNumber: data.version,
      isActive: true,
      components
    });
  }

  finalRecipes.sort((a, b) => {
    if (a.menuItemId !== b.menuItemId) {
      return asciiCompare(a.menuItemId, b.menuItemId);
    }
    return asciiCompare(a.recipeVersionId, b.recipeVersionId);
  });

  const finalIngredients: OfflineIngredientStock[] = ingredients.map(i => ({
    ingredientId: i.ingredientId,
    tenantId: i.tenantId,
    name: i.name,
    unit: i.unit,
    stockQuantityMinor: i.stockQuantityMinor,
    isActive: i.isActive
  }));

  finalIngredients.sort((a, b) => asciiCompare(a.ingredientId, b.ingredientId));

  const catalog: OfflineCatalogSnapshot = {
    tenantId,
    catalogVersion: computeCatalogVersion(finalMenuItems, finalRecipes, modifierGroups, finalIngredients),
    syncedAt: nowFn ? nowFn().toDate().toISOString() : new Date().toISOString(),
    menuItems: finalMenuItems,
    recipes: finalRecipes,
    modifierGroups,
    ingredients: finalIngredients
  };

  try {
    const parsed = JSON.parse(JSON.stringify(catalog));
    for (const key of Object.keys(parsed)) {
      if (['costBasis', 'basisCostCentavos', 'totalCogsCentavos', 'lineCogsCentavos', 'grossProfit', 'margin', 'supplier'].some(f => key.toLowerCase().includes(f))) {
        console.error('[CATALOG_HANDLER] forbidden_field_detected');
        return null;
      }
    }
  } catch (err) {
    return null;
  }

  return catalog;
}

function computeCatalogVersion(
  menuItems: OfflineMenuItem[],
  recipes: OfflineRecipeVersion[],
  modifierGroups: OfflineModifierGroup[],
  ingredients: OfflineIngredientStock[]
): string {
  const canonical = {
    menuItems: menuItems.map(m => ({
      menuItemId: m.menuItemId,
      name: m.name,
      category: m.category,
      basePriceCentavos: m.basePriceCentavos,
      activeRecipeVersionId: m.activeRecipeVersionId,
      isActive: m.isActive,
      modifierGroupIds: m.modifierGroupIds || []
    })),
    recipes: recipes.map(r => ({
      recipeVersionId: r.recipeVersionId,
      menuItemId: r.menuItemId,
      versionNumber: r.versionNumber,
      isActive: r.isActive,
      components: r.components.map(c => ({
        ingredientId: c.ingredientId,
        quantityMinor: c.quantityMinor,
        unit: c.unit
      }))
    })),
    modifierGroups: modifierGroups.map(g => ({
      modifierGroupId: g.modifierGroupId,
      name: g.name,
      minSelections: g.minSelections,
      maxSelections: g.maxSelections,
      isRequired: g.isRequired,
      options: g.options.map(o => ({
        optionId: o.optionId,
        name: o.name,
        priceDeltaCentavos: o.priceDeltaCentavos,
        ingredientDeltas: o.ingredientDeltas
      }))
    })),
    ingredients: ingredients.map(i => ({
      ingredientId: i.ingredientId,
      name: i.name,
      unit: i.unit,
      stockQuantityMinor: i.stockQuantityMinor,
      isActive: i.isActive
    }))
  };

  const hash = createHash('sha256')
    .update(JSON.stringify(canonical), 'utf8')
    .digest('hex');

  return `cat_${hash.substring(0, 32)}`;
}