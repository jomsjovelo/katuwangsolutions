import React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { addDebtRecord } from '@/firebase/firestore/budget-actions';

interface DebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}

export function DebtModal({ isOpen, onClose, tenantId }: DebtModalProps) {
  const { toast } = useToast();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <form onSubmit={async (e) => {
        e.preventDefault();
        if(!tenantId) return;
        const fd = new FormData(e.currentTarget);
        try {
          await addDebtRecord(
            tenantId, 
            fd.get('creditor') as string, 
            Number(fd.get('amount'))*100, 
            fd.get('due') as string,
            undefined,
            fd.get('isRecurring') === 'on'
          );
          toast({title: 'Record Added'});
          onClose();
        } catch(e:any) { toast({title: 'Error', description: e.message, variant: 'destructive'}) }
      }} className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl">
        <h3 className="font-black text-xl mb-4">Add Bill or Debt</h3>
        <input required name="creditor" placeholder="Name (e.g. Rent, Credit Card)" className="w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 focus:border-rose-500" />
        <input required name="amount" type="number" step="0.01" placeholder="Amount (₱)" className="w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 focus:border-rose-500" />
        <input required name="due" type="date" className="w-full bg-slate-50 p-4 rounded-2xl mb-4 font-medium outline-none border border-slate-100 focus:border-rose-500 text-slate-500" />
        <div className="flex items-center gap-2 mb-4 px-2">
          <input type="checkbox" name="isRecurring" id="isRecurring" className="w-4 h-4 accent-rose-500 rounded border-slate-300" />
          <label htmlFor="isRecurring" className="text-sm font-bold text-slate-700">This is a recurring monthly bill</label>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1 rounded-xl">Cancel</Button>
          <Button type="submit" className="flex-1 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold">Save</Button>
        </div>
      </form>
    </div>
  );
}
