import { z } from 'zod';

export const AssetStatusEnum = z.enum(['idle', 'in_transit', 'maintenance', 'offline']);

export const AssetSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  name: z.string().min(2, 'Asset name is required'), // e.g. "Truck 01", "Van 02"
  plateNumber: z.string().optional(),
  type: z.enum(['truck', 'van', 'motorcycle', 'tractor', 'other']).default('truck'),
  capacity: z.string().optional(), // e.g. "2000kg" or "100 sacks"
  status: AssetStatusEnum.default('idle'),
  currentDriverId: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export const TripStatusEnum = z.enum(['planned', 'loading', 'in_transit', 'arrived', 'completed', 'cancelled']);

export const TripSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  assetId: z.string().optional(), // Can be unassigned initially for planning
  driverName: z.string().optional(),
  origin: z.string().min(2, 'Origin is required'),
  destination: z.string().min(2, 'Destination is required'),
  loadDescription: z.string().optional(), // e.g. "50 sacks of rice"
  deliveryFee: z.coerce.number().min(0).default(0), // Income in centavos
  tripExpenses: z.coerce.number().min(0).default(0), // Gas/Toll in centavos
  status: TripStatusEnum.default('planned'),
  estimatedDeparture: z.any().optional(),
  actualDeparture: z.any().optional(),
  actualArrival: z.any().optional(),
  createdAt: z.any().optional(),
});

export type Asset = z.infer<typeof AssetSchema>;
export type Trip = z.infer<typeof TripSchema>;
export type AssetStatus = z.infer<typeof AssetStatusEnum>;
export type TripStatus = z.infer<typeof TripStatusEnum>;
