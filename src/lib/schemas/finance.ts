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

export const TransactionCategoryEnum = z.enum([
  // Income categories
  'Sales', 'Service', 'Collection', 'Other Income',
  // Expense categories
  'Supplies', 'Utilities', 'Rent', 'Salary', 'Food', 'Transport', 'Other Expense'
]);

export const TransactionSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  accountId: z.string(),
  amount: z.coerce.number().positive('Amount must be positive'),
  type: TransactionTypeEnum,
  category: TransactionCategoryEnum.optional(),
  description: z.string().optional(),
  date: z.any(), // Timestamp of transaction
  createdAt: z.any().optional(),
});

export const EmployeeSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  name: z.string().min(2, 'Employee name is required'),
  position: z.string().default('Staff'), // Job title / position
  role: z.string().optional(),
  baseSalary: z.coerce.number().positive('Salary must be positive'), // In centavos
  salaryType: z.enum(['daily', 'monthly']).default('daily'),
  daysWorkedThisPeriod: z.coerce.number().min(0).default(0), // For current pay period
  outstandingVale: z.coerce.number().default(0), // Cash advance deduction in centavos
  isActive: z.boolean().default(true),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export const PayoutRecordSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  employeeId: z.string(),
  employeeName: z.string(),
  daysWorked: z.number(),
  grossPay: z.number(),  // In centavos
  valeDeducted: z.number(), // In centavos
  netPay: z.number(),    // In centavos
  paidAt: z.any().optional(),
  createdAt: z.any().optional(),
});

export type Account = z.infer<typeof AccountSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type Employee = z.infer<typeof EmployeeSchema>;
export type PayoutRecord = z.infer<typeof PayoutRecordSchema>;
