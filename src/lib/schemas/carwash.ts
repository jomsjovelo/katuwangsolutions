import { z } from 'zod';

export const CarwashOrderSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  plateNumber: z.string().min(2, 'Plate number is required').toUpperCase(),
  vehicleType: z.enum(['Motorcycle', 'Sedan', 'SUV', 'Van']).default('Sedan'),
  servicePackage: z.enum(['Basic Wash', 'Wash & Wax', 'Interior Detail', 'Full Detail']).default('Basic Wash'),
  
  status: z.enum(['Scheduled', 'Queued', 'Washing', 'Drying', 'Ready', 'Completed']).default('Queued'),
  amountDue: z.number().min(0), // in cents
  paymentStatus: z.enum(['Unpaid', 'Paid']).default('Unpaid'),
  customerPhone: z.string().optional(),
  appointmentDate: z.any().optional(),
  mechanicName: z.string().optional(),
  washerCommission: z.number().optional(), // in cents
  bayNumber: z.string().optional(),
  
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type CarwashOrderModel = z.infer<typeof CarwashOrderSchema>;
