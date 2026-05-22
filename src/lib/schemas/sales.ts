import { z } from 'zod';

export const SaleSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  productId: z.string(),
  productName: z.string(),
  
  // Amounts in centavos
  unitPrice: z.number().int(),
  quantity: z.number().int(),
  totalAmount: z.number().int(),
  
  paymentMethod: z.enum(['cash', 'gcash', 'credit']),
  status: z.enum(['paid', 'pending', 'cancelled']),
  
  performedBy: z.string(),
  createdAt: z.any().optional(),
});

export type Sale = z.infer<typeof SaleSchema>;
