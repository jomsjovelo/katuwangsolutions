import { z } from 'zod';

export const GymMembershipSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  memberName: z.string().min(2, 'Member name is required'),
  planType: z.enum(['Daily Drop-in', '1-Month Plan', '3-Month Plan', 'Promo']).default('1-Month Plan'),
  
  status: z.enum(['Active', 'Expired', 'Drop-in']).default('Active'),
  amountDue: z.number().min(0), // in cents
  paymentStatus: z.enum(['Unpaid', 'Paid']).default('Unpaid'),
  
  lastCheckIn: z.any().optional(), // timestamp
  expiresAt: z.any().optional(), // timestamp for monthly plans
  
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type GymMembershipModel = z.infer<typeof GymMembershipSchema>;
