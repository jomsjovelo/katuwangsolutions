import { z } from 'zod';

export const MenuItemSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  name: z.string().min(2, 'Item name is required'),
  price: z.number().int().min(0, 'Price must be positive'), // Stored in centavos/cents
  category: z.string().default('General'),
  isAvailable: z.boolean().default(true),
  imageColor: z.string().default('#06B6D4'), // A fallback color if no image
  
  // Timpla Track specifics
  costPerServing: z.number().int().optional(), // Stored in centavos/cents
  recipe: z.array(z.object({
    ingredientId: z.string(),
    amount: z.number(), // Amount needed for the recipe
  })).optional(),
  
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type MenuItem = z.infer<typeof MenuItemSchema>;
