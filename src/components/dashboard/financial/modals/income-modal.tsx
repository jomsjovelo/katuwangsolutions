import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { addBudgetTransaction } from '@/firebase/firestore/budget-actions';
import { BudgetPersona } from '../budget-mo-dashboard';

interface IncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  persona: BudgetPersona;
  onAllocationPrompt: (data: { amount: number }) => void;
}

export function IncomeModal({ isOpen, onClose, tenantId, persona, onAllocationPrompt }: IncomeModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [incomeCategory, setIncomeCategory] = useState('Salary');

  if (!isOpen) return null;

  const handleIncomeSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tenantId) return;
    
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount')) * 100;
    const category = formData.get('category') as string;
    const note = formData.get('note') as string;
    const date = formData.get('date') as string || undefined;

    try {
      setIsSubmitting(true);
      await addBudgetTransaction(tenantId, 'income', amount, category, note, date);
      toast({ title: 'Income Logged', description: 'Your balance has been updated.' });
      onClose();

      if (category === 'Salary' || amount >= 500000) { // If it's salary or > 5000 pesos
        onAllocationPrompt({ amount });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <form onSubmit={handleIncomeSubmit} className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl">
        <h3 className="font-black text-xl mb-4">Log Income</h3>
        <input required name="amount" type="number" step="0.01" placeholder="Amount (₱)" className="w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 focus:border-emerald-500" />
        <div className="mb-3 space-y-2">
          <input required name="category" value={incomeCategory} onChange={(e) => setIncomeCategory(e.target.value)} placeholder="Category (e.g. Salary, Gift)" className="w-full bg-slate-50 p-4 rounded-2xl font-medium outline-none border border-slate-100 focus:border-emerald-500" />
          <div className="flex flex-wrap gap-2">
            {(persona === 'student' ? ['Allowance', 'Raket', 'Gift', 'Scholarship'] : persona === 'freelancer' ? ['Client Payment', 'Gig', 'Sales', 'Other'] : ['Salary', 'Business', 'Bonus', 'Investment']).map(cat => (
              <button key={cat} type="button" onClick={() => setIncomeCategory(cat)} className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${incomeCategory === cat ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {cat}
              </button>
            ))}
          </div>
        </div>
        <input name="date" type="date" className="w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 focus:border-emerald-500 text-slate-500" />
        <textarea required name="note" placeholder="Mandatory Note (e.g. June Salary)" className="w-full bg-slate-50 p-4 rounded-2xl mb-4 font-medium outline-none border border-slate-100 focus:border-emerald-500 h-24 resize-none" />
        <div className="flex gap-2">
          <Button type="button" disabled={isSubmitting} variant="ghost" onClick={onClose} className="flex-1 rounded-xl">Cancel</Button>
          <Button type="submit" disabled={isSubmitting} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold">Save</Button>
        </div>
      </form>
    </div>
  );
}
