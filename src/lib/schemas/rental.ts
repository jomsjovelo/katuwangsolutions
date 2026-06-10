import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';

export const RentalInventorySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  dailyRate: z.number(),
  totalQuantity: z.number(),
  availableQuantity: z.number(),
  createdAt: z.custom<Timestamp | Date | string | number>(),
  updatedAt: z.custom<Timestamp | Date | string | number>(),
});

export type RentalInventoryModel = z.infer<typeof RentalInventorySchema>;

export const RentalBookingSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  itemName: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  startDate: z.custom<Timestamp | Date | string | number>(),
  endDate: z.custom<Timestamp | Date | string | number>(),
  status: z.enum(['active', 'returned', 'reserved']),
  totalCost: z.number(),
  depositStatus: z.enum(['pending', 'paid', 'refunded']),
  createdAt: z.custom<Timestamp | Date | string | number>(),
  updatedAt: z.custom<Timestamp | Date | string | number>(),
});

export type RentalBookingModel = z.infer<typeof RentalBookingSchema>;

export const RentalCustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  contactInfo: z.string(),
  idVerificationInfo: z.string().optional(),
  createdAt: z.custom<Timestamp | Date | string | number>(),
  updatedAt: z.custom<Timestamp | Date | string | number>(),
});

export type RentalCustomerModel = z.infer<typeof RentalCustomerSchema>;
