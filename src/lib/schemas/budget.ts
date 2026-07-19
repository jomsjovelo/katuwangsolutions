import { z } from 'zod';

export const BudgetTransactionSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['income', 'expense']),
  amountCentavos: z.number().min(1, 'Amount must be greater than 0'),
  category: z.string().min(1, 'Category is required'),
  note: z.string().min(1, 'Note is mandatory so you track every centavo'),
  date: z.string().optional(),
});

export const DebtSchema = z.object({
  id: z.string().optional(),
  creditorName: z.string().min(1, 'Creditor name is required'),
  totalAmountCentavos: z.number().min(1, 'Amount must be greater than 0'),
  remainingAmountCentavos: z.number().min(0),
  dueDate: z.string().optional(),
  note: z.string().optional(),
  status: z.enum(['active', 'paid']),
  isRecurring: z.boolean().optional().default(false),
});

export const SavingsGoalSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Goal name is required'),
  targetAmountCentavos: z.number().min(1, 'Target amount is required'),
  currentAmountCentavos: z.number().min(0).default(0),
});

export const BudgetEnvelopeSchema = z.object({
  id: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  limitCentavos: z.number().min(1, 'Limit must be greater than 0'),
});
