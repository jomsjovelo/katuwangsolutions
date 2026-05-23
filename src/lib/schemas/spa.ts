import { z } from 'zod';

export const SpaAppointmentSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  clientName: z.string().min(2, 'Client name is required'),
  therapistName: z.string().min(2, 'Therapist name is required'),
  serviceType: z.enum(['Massage', 'Facial', 'Body Scrub', 'Spa Package']).default('Massage'),
  
  status: z.enum(['Waiting', 'In Session', 'Resting', 'Done']).default('Waiting'),
  amountDue: z.number().min(0), // in cents
  paymentStatus: z.enum(['Unpaid', 'Paid']).default('Unpaid'),
  
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type SpaAppointmentModel = z.infer<typeof SpaAppointmentSchema>;
