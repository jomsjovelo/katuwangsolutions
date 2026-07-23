import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { allocateToSavings } from '@/firebase/firestore/budget-actions';
import { SavingsGoal } from '@/lib/schemas/budget';
import { PiggyBank, Sparkles } from 'lucide-react';

interface DepositGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  goal: SavingsGoal | null;
  masterBalance: number;
}

export function DepositGoalModal({ isOpen, onClose, tenantId, goal, masterBalance }: DepositGoalModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customAmount, setCustomAmount] = useState('');

  if (!isOpen || !goal) return null;

  const handleDeposit = async (amountInPesos: number) => {
    if (!tenantId || !goal.id) return;
    const amountCentavos = Math.round(amountInPesos * 100);

    if (masterBalance < amountCentavos) {
      toast({
        title: 'Insufficient Balance',
        description: `You only have ₱${(masterBalance / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} available in cash.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await allocateToSavings(tenantId, goal.id, amountCentavos);
      toast({
        title: '🎉 Savings Boosted!',
        description: `Deposited ₱${amountInPesos.toLocaleString('en-US')} to ${goal.name}.`,
      });
      setCustomAmount('');
      onClose();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customAmount);
    if (isNaN(val) || val <= 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid amount.', variant: 'destructive' });
      return;
    }
    handleDeposit(val);
  };

  const targetPesos = goal.targetAmountCentavos / 100;
  const currentPesos = goal.currentAmountCentavos / 100;
  const remainingPesos = Math.max(0, targetPesos - currentPesos);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center">
            <PiggyBank className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-black text-lg text-slate-900 tracking-tight">Deposit to {goal.name}</h3>
            <p className="text-xs font-semibold text-slate-500">
              Remaining to goal: <span className="text-indigo-600 font-bold">₱{remainingPesos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </p>
          </div>
        </div>

        {/* 1-Tap Quick Presets */}
        <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Quick 1-Tap Deposit</label>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[50, 100, 200, 500, 1000, 2000].map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={isSubmitting}
              onClick={() => handleDeposit(preset)}
              className="py-2.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black text-sm rounded-2xl border border-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-1"
            >
              +₱{preset}
            </button>
          ))}
        </div>

        {/* Custom Amount Form */}
        <form onSubmit={handleCustomSubmit} className="space-y-3">
          <div>
            <label htmlFor="custom-deposit-amount" className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">
              Custom Amount (₱)
            </label>
            <input
              id="custom-deposit-amount"
              type="number"
              step="0.01"
              placeholder="Enter custom amount..."
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="w-full bg-slate-50 p-3.5 rounded-2xl font-bold text-slate-800 outline-none border border-slate-200 focus:border-indigo-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
              className="flex-1 rounded-xl text-slate-500 font-bold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !customAmount}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5"
            >
              <Sparkles className="h-4 w-4" /> Deposit
            </Button>
          </div>
        </form>

      </div>
    </div>
  );
}
