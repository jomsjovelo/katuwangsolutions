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

export const purchaseOrderItemSchema = z.object({
  productId: z.string().min(1, 'Kailangan ang product ID'),
  productName: z.string().min(1, 'Kailangan ang product name'),
  quantity: z.number().positive('Dapat higit sa 0 ang dami'),
  unitCostCentavos: z.number().min(0, 'Hindi pwedeng negative ang cost'),
  unitSalePriceCentavos: z.number().optional(),
});

export type PurchaseOrderItem = z.infer<typeof purchaseOrderItemSchema>;

export const purchaseOrderSchema = z.object({
  id: z.string().optional(),
  poNumber: z.string().min(1, 'PO number required'),
  supplierId: z.string().min(1, 'Pumili ng supplier'),
  supplierName: z.string().min(1, 'Supplier name required'),
  items: z.array(purchaseOrderItemSchema).min(1, 'Magdagdag ng kahit 1 paninda'),
  totalAmountCentavos: z.number().min(0),
  paymentStatus: z.enum(['paid', 'credit_unpaid']).default('paid'),
  paymentMethod: z.enum(['cash', 'gcash', 'maya', 'supplier_credit']).default('cash'),
  deliveryDate: z.any().optional(),
  notes: z.string().optional(),
  createdByName: z.string().optional(),
  createdByUid: z.string().optional(),
  createdAt: z.any().optional(),
});

export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;
