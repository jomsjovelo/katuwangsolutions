import { z } from 'zod';

export const RepairJobSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  customerName: z.string().min(2, 'Customer name is required'),
  itemName: z.string().min(2, 'Item name is required'), // e.g., iPhone 12, Washing Machine
  issueDescription: z.string().min(2, 'Issue description is required'),
  
  status: z.enum(['Queued', 'Repairing', 'Ready', 'Released']).default('Queued'),
  estimatedCost: z.number().min(0), // in cents
  paymentStatus: z.enum(['Unpaid', 'Paid']).default('Unpaid'),
  
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type RepairJobModel = z.infer<typeof RepairJobSchema>;
