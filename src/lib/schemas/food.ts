import { z } from 'zod';

export const IngredientSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  name: z.string().min(2, 'Ingredient name is required'),
  currentStock: z.coerce.number().default(0), // Raw amount (e.g. 1000)
  unit: z.string().default('g'), // g, ml, pcs
  costPerUnit: z.coerce.number().default(0), // in centavos
  minStock: z.coerce.number().default(0),
  isActive: z.boolean().default(true),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export const RecipeItemSchema = z.object({
  ingredientId: z.string(),
  quantityRequired: z.coerce.number().positive(),
});

export const MenuItemSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  name: z.string().min(2, 'Menu item name is required'),
  category: z.string().default('Mains'),
  price: z.coerce.number().positive(), // in centavos
  recipe: z.array(RecipeItemSchema).default([]), // The composite BOM
  isAvailable: z.boolean().default(true), // Can auto-flip to false if recipe ingredients are out of stock
  imageSrc: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export const FoodOrderSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  orderNumber: z.string(), // e.g. A01
  tableNumber: z.string().optional(), // For Dine-In
  orderType: z.enum(['dine_in', 'take_out', 'delivery']).default('dine_in'),
  status: z.enum(['pending', 'preparing', 'served', 'paid']).default('pending'),
  items: z.array(z.object({
    menuItemId: z.string(),
    name: z.string(),
    quantity: z.coerce.number().int().positive(),
    price: z.coerce.number(), // Price at time of order
    notes: z.string().optional(), // e.g. "No onions"
  })),
  totalAmount: z.coerce.number(),
  customerPhone: z.string().optional(),
  referrerCode: z.string().optional(),
  createdAt: z.any().optional(),
});

export type Ingredient = z.infer<typeof IngredientSchema>;
export type MenuItem = z.infer<typeof MenuItemSchema>;
export type FoodOrder = z.infer<typeof FoodOrderSchema>;
