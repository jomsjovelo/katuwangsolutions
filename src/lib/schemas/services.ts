import { z } from 'zod';

export const ServiceSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  name: z.string().min(2, 'Service name is required'),
  description: z.string().optional(),
  price: z.coerce.number().positive('Price must be positive'),
  durationMinutes: z.coerce.number().int().positive().default(30),
  isActive: z.boolean().default(true),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export const JobStatusEnum = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);

export const JobSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  serviceId: z.string(),
  customerName: z.string().min(2, 'Customer name is required'),
  customerPhone: z.string().optional(), // For SMS alerts later
  status: JobStatusEnum.default('pending'),
  amount: z.coerce.number(), // Locked in at time of booking
  assignedStaffId: z.string().optional(),
  createdAt: z.any().optional(),
  startedAt: z.any().optional(),
  completedAt: z.any().optional(),
});

export type Service = z.infer<typeof ServiceSchema>;
export type Job = z.infer<typeof JobSchema>;
export type JobStatus = z.infer<typeof JobStatusEnum>;
