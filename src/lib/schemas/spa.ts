import { z } from 'zod';

export const SpaAppointmentSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  clientName: z.string().min(2, 'Client name is required'),
  therapistName: z.string().min(2, 'Therapist name is required'),
  serviceType: z.enum(['Massage', 'Facial', 'Body Scrub', 'Spa Package']).default('Massage'),
  
  status: z.enum(['Scheduled', 'Waiting', 'In Session', 'Resting', 'Done']).default('Waiting'),
  amountDue: z.number().min(0), // in cents
  paymentStatus: z.enum(['Unpaid', 'Paid']).default('Unpaid'),
  customerPhone: z.string().nullable().optional(),
  appointmentDate: z.any().optional(),

  sessionStartTime: z.any().optional(),
  sessionEndTime: z.any().optional(),

  // Room tracking
  roomId: z.string().nullable().optional(),
  roomNumber: z.string().nullable().optional(),

  // Commission & loyalty
  therapistCommission: z.number().optional(),
  referrerCode: z.string().nullable().optional(),

  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type SpaAppointmentModel = z.infer<typeof SpaAppointmentSchema>;
