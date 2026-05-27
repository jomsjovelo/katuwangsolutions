import { z } from 'zod';

export const EventSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  title: z.string().min(2, 'Event title is required'),
  clientName: z.string().min(2, 'Client name is required'),
  eventDate: z.string(), // ISO date string or formatted date
  venue: z.string().default(''),
  status: z.enum(['Upcoming', 'Ongoing', 'Done']).default('Upcoming'),
  contractPrice: z.coerce.number().default(0), // Revenue from client (centavos)
  
  // Setup logistics
  setupNotes: z.string().default(''), // e.g. "Main stage left, buffet line by the garden"
  foodPackage: z.string().default(''),
  
  // Vendor Tracking
  vendors: z.array(z.object({
    role: z.string(), // e.g., 'Florist', 'DJ', 'Caterer'
    name: z.string(),
    contact: z.string(),
    cost: z.coerce.number().default(0), // Vendor fee (centavos)
    status: z.enum(['Pending', 'Confirmed', 'Paid']).default('Pending'),
  })).default([]),
  
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type EventModel = z.infer<typeof EventSchema>;
