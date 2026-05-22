import { z } from 'zod';

// Borrower Profile Schema
export const BorrowerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Name is required'),
  contactNumber: z.string().min(11, 'Valid 11-digit mobile number required'),
  address: z.string().min(5, 'Address is required'),
  photoUrl: z.string().url().optional().or(z.literal('')),
  createdAt: z.any().optional(), // Firestore Timestamp
  updatedAt: z.any().optional(),
});

// Loan Schema (5-6 typically has flat 20% interest)
export const LoanSchema = z.object({
  id: z.string().optional(),
  borrowerId: z.string(),
  principalAmount: z.coerce.number().positive('Principal must be positive'),
  interestRate: z.coerce.number().min(0).max(100).default(20), // Default 20%
  totalPayable: z.coerce.number().positive(),
  dailyDue: z.coerce.number().positive(),
  outstandingBalance: z.coerce.number().min(0),
  durationDays: z.coerce.number().int().positive().default(60), // Typical 60 days
  status: z.enum(['active', 'fully_paid', 'defaulted']).default('active'),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

// Daily Collection / Payment Schema
export const PaymentSchema = z.object({
  id: z.string().optional(),
  loanId: z.string(),
  borrowerId: z.string(),
  amountPaid: z.coerce.number().positive('Amount must be positive'),
  collectedBy: z.string(), // UID of the collector/staff
  createdAt: z.any().optional(),
});

// Types inferred from Schemas
export type Borrower = z.infer<typeof BorrowerSchema>;
export type Loan = z.infer<typeof LoanSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
