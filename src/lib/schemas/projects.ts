import { z } from 'zod';

export const ProjectSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  name: z.string().min(2, 'Project name is required'),
  contractor: z.string().min(2, 'Contractor name is required'),
  status: z.enum(['active', 'completed', 'on-hold']).default('active'),
  
  // Total cost of materials dispatched to this project so far
  totalMaterialCost: z.number().int().default(0),
  
  // Total payments collected for this project so far
  totalPaymentsCollected: z.number().int().default(0),
  
  location: z.string().optional(),
  startDate: z.any().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type Project = z.infer<typeof ProjectSchema>;
