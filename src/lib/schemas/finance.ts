import { z } from 'zod';

export const AccountTypeEnum = z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']);

export const AccountSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  name: z.string().min(2, 'Account name is required'),
  type: AccountTypeEnum,
  balance: z.coerce.number().default(0), // Stored in centavos for precision
  isActive: z.boolean().default(true),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export const TransactionTypeEnum = z.enum(['income', 'expense', 'transfer']);

export const TransactionSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  accountId: z.string(),
  amount: z.coerce.number().positive('Amount must be positive'),
  type: TransactionTypeEnum,
  description: z.string().optional(),
  date: z.any(), // Timestamp of transaction
  createdAt: z.any().optional(),
});

export const EmployeeSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  name: z.string().min(2, 'Employee name is required'),
  role: z.string().optional(),
  baseSalary: z.coerce.number().positive('Salary must be positive'), // In centavos
  salaryType: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  outstandingVale: z.coerce.number().default(0), // Cash advances
  isActive: z.boolean().default(true),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type Account = z.infer<typeof AccountSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type Employee = z.infer<typeof EmployeeSchema>;
