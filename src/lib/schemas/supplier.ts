import { z } from 'zod';

export const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Kailangan ang pangalan ng supplier'),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  category: z.string().optional(),
  address: z.string().optional(),
  paymentTerms: z.enum(['cash', 'credit_15', 'credit_30', 'credit_60']).default('cash'),
  notes: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type SupplierProfile = z.infer<typeof supplierSchema>;

export const purchaseOrderItemPositionSchema = z.object({
  quantityMinor: z.number(),
  quantityScale: z.number(),
  inventoryValueCentavos: z.number(),
  averageUnitCostCentavos: z.number(),
});

export const purchaseOrderItemSchema = z.object({
  productId: z.string().min(1, 'Kailangan ang product ID'),
  productName: z.string().min(1, 'Kailangan ang product name'),
  quantity: z.number().positive('Dapat higit sa 0 ang dami'),
  unitCostCentavos: z.number().min(0, 'Hindi pwedeng negative ang cost'),
  unitSalePriceCentavos: z.number().optional(),
  quantityMode: z.enum(['discrete', 'measured']).optional(),
  quantityMinor: z.number().optional(),
  quantityScale: z.number().optional(),
  supplierCostCentavos: z.number().optional(),
  freightCentavos: z.number().optional(),
  otherAcquisitionCostCentavos: z.number().optional(),
  landedCostCentavos: z.number().optional(),
  latestPurchaseUnitCostCentavos: z.number().optional(),
  restockEventId: z.string().optional(),
  previousPosition: purchaseOrderItemPositionSchema.optional(),
  resultingPosition: purchaseOrderItemPositionSchema.optional(),
  previousLatestPurchaseUnitCostCentavos: z.number().int().nonnegative().safe().optional(),
});

export type PurchaseOrderItem = z.infer<typeof purchaseOrderItemSchema>;

export const purchaseOrderSchema = z.object({
  id: z.string().optional(),
  poNumber: z.string().min(1, 'PO number required'),
  supplierId: z.string().min(1, 'Pumili ng supplier'),
  supplierName: z.string().min(1, 'Supplier name required'),
  items: z.array(purchaseOrderItemSchema).min(1, 'Magdagdag ng kahit 1 paninda'),
  totalAmountCentavos: z.number().min(0),
  status: z.enum(['received', 'pending', 'voided']).default('received').optional(),
  paymentStatus: z.enum(['paid', 'credit_unpaid', 'voided']).default('paid'),
  paymentMethod: z.enum(['cash', 'cash_drawer', 'gcash', 'maya', 'supplier_credit']).default('cash'),
  costingVersion: z.string().optional(),
  restockEventIds: z.array(z.string()).optional(),
  deliveryDate: z.any().optional(),
  notes: z.string().optional(),
  createdByName: z.string().optional(),
  createdByUid: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

export function assertLegacyPurchaseOrderMutable(
  poData: { readonly costingVersion?: string; readonly status?: string } | null | undefined,
  operation: 'update' | 'void',
): void {
  if (!poData) {
    throw new Error('Purchase order not found');
  }

  if (poData.status === 'voided') {
    throw new Error(operation === 'update' ? 'Cannot edit a voided purchase order' : 'Purchase order is already voided');
  }

  if (poData.costingVersion === 'moving_average_v1') {
    throw new Error(
      operation === 'update'
        ? 'Smart Restocking purchase orders cannot be edited with legacy logic. Please use the dedicated Smart Restocking adjustment workflow.'
        : 'Smart Restocking purchase orders cannot be voided with legacy logic. Please use the dedicated Smart Restocking reversal workflow.'
    );
  }
}
