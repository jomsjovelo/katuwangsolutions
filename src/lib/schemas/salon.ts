import { z } from 'zod';

export const SalonAppointmentSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  customerName: z.string().min(2, 'Customer name is required'),
  stylistName: z.string().min(2, 'Stylist name is required'),
  serviceType: z.enum(['Haircut', 'Hair Color', 'Rebond', 'Shave/Beard', 'Treatment']).default('Haircut'),
  
  status: z.enum(['Waiting', 'In Chair', 'Done']).default('Waiting'),
  amountDue: z.number().min(0), // in cents
  paymentStatus: z.enum(['Unpaid', 'Paid']).default('Unpaid'),
  
  // Chair tracking
  chairId: z.string().nullable().optional(),
  chairNumber: z.string().nullable().optional(),

  // Loyalty
  phoneNumber: z.string().nullable().optional(),

  queueNumber: z.number().optional(),

  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type SalonAppointmentModel = z.infer<typeof SalonAppointmentSchema>;
