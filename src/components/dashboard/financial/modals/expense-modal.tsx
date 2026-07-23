import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { addBudgetTransaction } from '@/firebase/firestore/budget-actions';
import { BudgetPersona } from '../budget-mo-dashboard';
import { BudgetEnvelope } from '@/lib/schemas/budget';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  persona: BudgetPersona;
  envelopes: BudgetEnvelope[];
  masterBalance: number;
}

export function ExpenseModal({ isOpen, onClose, tenantId, persona, envelopes, masterBalance }: ExpenseModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState('Transportation / Pamasahe');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tenantId) return;
    
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount')) * 100;
    const category = formData.get('category') as string;
    const note = formData.get('note') as string;
    const date = formData.get('date') as string || undefined;

    if (masterBalance < amount) {
      toast({ title: 'Insufficient Funds', description: 'You cannot spend more than your available balance.', variant: 'destructive' });
      return;
    }

    try {
      setIsSubmitting(true);
      const finalNote = receiptImage ? `${note} [📷 Receipt Attached]` : note;
      await addBudgetTransaction(tenantId, 'expense', amount, category, finalNote, date);
      toast({ title: 'Expense Logged', description: 'Your balance has been updated.' });
      setReceiptImage(null);
      onClose();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <form onSubmit={handleExpenseSubmit} className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl">
        <h3 className="font-black text-xl mb-4">Log Expense</h3>
        <label htmlFor="expense-amount" className="block text-xs font-bold text-slate-700 mb-1">Amount (₱)</label>
        <input id="expense-amount" required name="amount" type="number" step="0.01" placeholder="0.00" className="w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 focus:border-rose-500" />
        <div className="mb-3 space-y-2">
          <label htmlFor="expense-category" className="block text-xs font-bold text-slate-700 mb-1">Category</label>
          <input id="expense-category" list="category-history-list" required name="category" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} placeholder="Category (e.g. Food, Transportation)" className="w-full bg-slate-50 p-4 rounded-2xl font-medium outline-none border border-slate-100 focus:border-rose-500" />
          <div className="flex flex-wrap gap-2">
            {(envelopes.length > 0 ? envelopes.map(e => e.category) : persona === 'student' ? ['Food', 'Pamasahe', 'School Project', 'Dorm/Rent', 'Load', 'Gala'] : persona === 'freelancer' ? ['Internet', 'Software/Tools', 'Food', 'Pamasahe', 'Coffee Shop'] : ['Groceries', 'Rent', 'Utilities/Bills', 'Pamasahe', 'Dining Out']).map(cat => (
              <button key={cat} type="button" onClick={() => setExpenseCategory(cat)} className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${expenseCategory === cat ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {cat}
              </button>
            ))}
          </div>
        </div>
        <label htmlFor="expense-date" className="block text-xs font-bold text-slate-700 mb-1">Date</label>
        <input id="expense-date" name="date" type="date" className="w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 focus:border-rose-500 text-slate-500" />
        <label htmlFor="expense-note" className="block text-xs font-bold text-slate-700 mb-1">Mandatory Note</label>
        <textarea id="expense-note" required name="note" placeholder="Mandatory Note (e.g. Tricycle to work)" className="w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 focus:border-rose-500 h-20 resize-none" />

        <div className="mb-4">
          <label htmlFor="expense-receipt-upload" className="block text-xs font-bold text-slate-700 mb-1">Receipt Photo (Optional)</label>
          <input
            id="expense-receipt-upload"
            name="receiptFile"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="text-xs text-slate-500 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-rose-50 file:text-rose-600 hover:file:bg-rose-100"
          />
          {receiptImage && (
            <div className="mt-2 flex items-center gap-2">
              <img src={receiptImage} alt="Receipt Preview" className="h-10 w-10 object-cover rounded-lg border border-slate-200" />
              <span className="text-[10px] text-emerald-600 font-bold">✓ Receipt Photo Attached</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" disabled={isSubmitting} variant="ghost" onClick={onClose} className="flex-1 rounded-xl">Cancel</Button>
          <Button type="submit" disabled={isSubmitting} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold">Save</Button>
        </div>
      </form>
    </div>
  );
}
