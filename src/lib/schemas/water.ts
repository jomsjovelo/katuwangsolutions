import { z } from 'zod';

export const WaterDeliverySchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  customerName: z.string().min(2, 'Customer name is required'),
  address: z.string().min(2, 'Address is required'),
  driver: z.string().default(''),
  
  roundOrdered: z.number().int().min(0).default(0),
  slimOrdered: z.number().int().min(0).default(0),
  
  roundReturned: z.number().int().min(0).default(0),
  slimReturned: z.number().int().min(0).default(0),
  
  orderType: z.enum(['Walk-in', 'Delivery']).default('Delivery'),
  status: z.enum(['Empty Received', 'Washing', 'Refilled', 'Out for Delivery', 'Completed']).default('Empty Received'),
  amountDue: z.number().min(0), // in cents
  paymentStatus: z.enum(['Unpaid', 'Paid']).default('Unpaid'),
  
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type WaterDeliveryModel = z.infer<typeof WaterDeliverySchema>;
