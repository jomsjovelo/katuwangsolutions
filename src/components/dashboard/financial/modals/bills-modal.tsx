import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Receipt, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { addDebtRecord } from '@/firebase/firestore/budget-actions';

interface BillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}

export function BillsModal({
  isOpen,
  onClose,
  tenantId,
}: BillsModalProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [billType, setBillType] = useState<'fixed' | 'variable'>('fixed');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    try {
      setIsSubmitting(true);
      const amountCentavos = Math.round(parseFloat(amount) * 100);
      await addDebtRecord(
        tenantId,
        name,
        amountCentavos,
        dueDate || undefined,
        billType === 'fixed' ? 'Fixed monthly subscription/rent' : 'Variable utility bill',
        true, // isRecurring = true
        'i_owe', // direction = i_owe
        billType
      );
      toast({
        title: 'Bill Added',
        description: `${name} has been added to your upcoming bills.`,
      });
      setName('');
      setAmount('');
      setDueDate('');
      setBillType('fixed');
      onClose();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to add bill',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-lg text-slate-800 tracking-tight">Add Bill or Subscription</h3>
            <p className="text-xs text-slate-500">Track subscriptions & monthly expenses</p>
          </div>
        </div>

        {/* Bill Type Segmented Control */}
        <label className="block text-xs font-bold text-slate-700 mb-1.5">Bill Type</label>
        <div className="bg-slate-100 p-1 rounded-2xl flex gap-1 mb-4">
          <button
            type="button"
            onClick={() => setBillType('fixed')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${billType === 'fixed' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Fixed Amount (Internet, Rent)
          </button>
          <button
            type="button"
            onClick={() => setBillType('variable')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${billType === 'variable' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Variable Utility (Meralco, Water)
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <Label htmlFor="bill-name-input" className="text-xs font-bold text-slate-700 mb-1.5 block">Bill Name</Label>
            <Input
              id="bill-name-input"
              name="billName"
              required
              placeholder={billType === 'fixed' ? "e.g. Netflix, Rent, PLDT" : "e.g. Meralco Electricity, Water Bill"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-50 border-slate-200 rounded-xl font-medium"
            />
          </div>

          <div>
            <Label htmlFor="bill-amount-input" className="text-xs font-bold text-slate-700 mb-1.5 block">
              {billType === 'fixed' ? "Monthly Amount (₱)" : "Estimated Monthly Amount (₱)"}
            </Label>
            <Input
              id="bill-amount-input"
              name="billAmount"
              required
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-slate-50 border-slate-200 rounded-xl font-bold"
            />
          </div>

          <div>
            <Label htmlFor="bill-duedate-input" className="text-xs font-bold text-slate-700 mb-1.5 block">Due Date (Optional)</Label>
            <Input
              id="bill-duedate-input"
              name="billDueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-slate-50 border-slate-200 rounded-xl font-medium"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            className="flex-1 rounded-xl text-slate-500 font-bold"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold"
          >
            {isSubmitting ? 'Saving...' : 'Add Bill'}
          </Button>
        </div>
      </form>
    </div>
  );
}
