import { z } from 'zod';

export const FreshBatchSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  itemName: z.string().min(1, 'Item name is required'),
  supplier: z.string().min(1, 'Supplier is required'),
  batchNumber: z.string(),
  
  // Financials and Quantities
  unitCostCentavos: z.number().int().min(0),
  salePriceCentavos: z.number().int().min(0),
  initialQty: z.number().min(0),
  currentQty: z.number().min(0),
  unit: z.string().default('kg'),
  
  // Tracking
  expiryDate: z.any(), // Firestore Timestamp
  status: z.enum(['fresh', 'sell-first', 'expired', 'depleted']).default('fresh'),
  
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export const FreshWasteLogSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  batchId: z.string(),
  batchNumber: z.string(),
  itemName: z.string(),
  
  quantity: z.number().min(0),
  unitCostCentavos: z.number().int(),
  totalLossCentavos: z.number().int(),
  
  reason: z.string().optional(),
  loggedBy: z.string(), // UID
  createdAt: z.any().optional(),
});

export type FreshBatch = z.infer<typeof FreshBatchSchema>;
export type FreshWasteLog = z.infer<typeof FreshWasteLogSchema>;
