import { z } from 'zod';

export const LaundryOrderSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  customerName: z.string().min(2, 'Customer name is required'),
  kilos: z.number().min(0.5, 'Must be at least 0.5 kilos'),
  serviceType: z.string(),
  status: z.enum(['Queued', 'Washing', 'Drying', 'Folding', 'Ready', 'Claimed']).default('Queued'),
  amountDue: z.number().min(0), // in cents
  paymentStatus: z.enum(['Unpaid', 'Paid']).default('Unpaid'),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type LaundryOrderModel = z.infer<typeof LaundryOrderSchema>;
