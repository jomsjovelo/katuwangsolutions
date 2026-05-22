import { z } from 'zod';

export const BusinessInfoSchema = z.object({
  fullName: z.string().min(2, 'Kailangan ang buong pangalan mo'),
  businessName: z.string().min(2, 'Kailangan ang pangalan ng tindahan').max(100),
});

export const AccountSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').regex(/\d/, 'Password must contain at least one number'),
});

export type BusinessInfoInput = z.infer<typeof BusinessInfoSchema>;
export type AccountInput = z.infer<typeof AccountSchema>;
