import { z } from 'zod';

export const SaleItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  price: z.number().int(),
  quantity: z.number().int(),
});

export const SaleSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  module: z.string().optional(),
  
  // Amounts in centavos
  subtotalAmount: z.number().int().optional(),
  discountAmount: z.number().int().optional(),
  discountType: z.string().optional(),
  discountReason: z.string().optional(),
  totalAmount: z.number().int(),
  
  items: z.array(SaleItemSchema).optional(),
  
  paymentMethod: z.string(),
  status: z.string().optional(),
  
  performedBy: z.string().optional(),
  gcashRef: z.string().optional(),
  createdAt: z.any().optional(),
});

export type Sale = z.infer<typeof SaleSchema>;
