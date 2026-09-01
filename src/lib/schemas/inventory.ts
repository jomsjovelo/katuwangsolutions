import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  name: z.string().min(2, 'Product name is required'),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  category: z.string().default('General'),
  
  // Stock levels stored as integers
  currentStock: z.number().int().default(0),
  minStock: z.number().int().default(5), // Reorder point
  
  // Variable Quantity schema v2 extensions
  quantityMode: z.enum(['discrete', 'measured']).default('discrete'),
  sellingUnit: z.string().optional(),
  quantityScale: z.number().int().default(3),
  stockQuantityMinor: z.number().int().optional(),
  minStockMinor: z.number().int().optional(),

  // Financials stored as integers (centavos/cents)
  costPrice: z.number().int().default(0),
  inventoryValueCentavos: z.number().int().nonnegative().optional(),
  averageUnitCostCentavos: z.number().int().nonnegative().optional(),
  salePrice: z.number().int().default(0),
  
  unit: z.string().default('pcs'),
  isActive: z.boolean().default(true),

  // Wholesale-to-Tingi breakdown fields
  isWholesalePack: z.boolean().default(false),
  wholesaleParentId: z.string().optional(),
  packQuantity: z.number().int().default(24),

  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export const InventoryTransactionSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  productId: z.string(),
  type: z.enum(['sale', 'restock', 'adjustment', 'return', 'dispatch']),
  
  // Quantity changed (positive for restock, negative for sale/dispatch)
  quantity: z.number().int(),
  
  // Optional project ID if this transaction was a dispatch to a specific project
  projectId: z.string().optional(),
  
  // Running total after this transaction
  balanceAfter: z.number().int(),
  
  note: z.string().optional(),
  performedBy: z.string(), // UID
  createdAt: z.any().optional(),
});

export type Product = z.infer<typeof ProductSchema>;
export type InventoryTransaction = z.infer<typeof InventoryTransactionSchema>;
