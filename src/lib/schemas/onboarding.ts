import { z } from 'zod';

export const BusinessInfoSchema = z.object({
  fullName: z.string().min(2, 'Kailangan ang buong pangalan mo'),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').refine(val => {
    const today = new Date();
    const [year, month, day] = val.split('-').map(Number);
    const birthDate = new Date(year, month - 1, day);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 18;
  }, { message: 'Kailangan ay 18 years old pataas upang makapag-register.' }),
  gender: z.enum(['Lalaki', 'Babae', 'Iba pa', 'Prefer not to say']),
  address: z.string().min(5, 'Kailangan ng kumpletong address'),
  businessName: z.string().min(2, 'Kailangan ang pangalan ng tindahan').max(100),
  businessProfile: z.enum(['standard-retail', 'fresh-goods', 'hardware-supplies', 'wholesale']).optional(),
});

export const AccountSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').regex(/\d/, 'Password must contain at least one number'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type BusinessInfoInput = z.infer<typeof BusinessInfoSchema>;
export type AccountInput = z.infer<typeof AccountSchema>;
