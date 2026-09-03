import { z } from 'zod';

export const SaleItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  price: z.number().int(),
  quantity: z.number().int(),
});

const SaleLineSchema = z.object({
  saleLineId: z.string(),
  menuItemId: z.string(),
  menuItemName: z.string(),
  quantity: z.number().int().positive(),
  finalUnitPriceCentavos: z.number().int().nonnegative(),
  lineCogsCentavos: z.number().int().nonnegative(),
  lineRevenueCentavos: z.number().int().nonnegative(),
  unitCogsCentavos: z.number().int().nonnegative().optional(),
  createdAt: z.string().optional(),
});

export const SaleSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  module: z.string().optional(),
  moduleId: z.string().optional(),

  // Benta shape
  totalAmount: z.number().int().optional(),
  subtotalAmount: z.number().int().optional(),
  discountAmount: z.number().int().optional(),
  discountType: z.string().optional(),
  discountReason: z.string().optional(),
  items: z.array(SaleItemSchema).optional(),

  // Production Order Snap shape
  totalRevenueCentavos: z.number().int().optional(),
  totalCogsCentavos: z.number().int().optional(),
  saleLines: z.array(SaleLineSchema).optional(),

  paymentMethod: z.string().optional(),
  status: z.string().optional(),
  
  performedBy: z.string().optional(),
  gcashRef: z.string().optional(),
  createdAt: z.any().optional(),
}).refine(
  (sale) => sale.totalAmount != null || (sale.totalRevenueCentavos != null && sale.saleLines != null && sale.saleLines.length > 0),
  {
    message: "Sale must have either Benta totalAmount or Order Snap totalRevenueCentavos with saleLines",
  }
);

export type Sale = z.infer<typeof SaleSchema>;
