import { z } from 'zod';

export const IngredientSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  name: z.string().min(2, 'Ingredient name is required'),
  
  // E.g., 'grams', 'ml', 'pumps', 'pieces'
  unitOfMeasurement: z.string().default('grams'),
  
  // Cost per unit in centavos
  // E.g., if 1000g of coffee beans costs ₱500.00 (50000 centavos)
  // unitCost = 50 centavos per gram
  unitCost: z.number().int().min(0).default(0), 
  
  // Current stock level (in unitOfMeasurement)
  currentStock: z.number().default(0),
  
  isActive: z.boolean().default(true),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type Ingredient = z.infer<typeof IngredientSchema>;
