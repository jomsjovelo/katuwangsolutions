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
  const [direction, setDirection] = React.useState<'i_owe' | 'owed_to_me'>('i_owe');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
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
            fd.get('isRecurring') === 'on',
            direction
          );
          toast({title: direction === 'owed_to_me' ? 'Receivable Record Added' : 'Debt Record Added'});
          onClose();
        } catch(e:any) { toast({title: 'Error', description: e.message, variant: 'destructive'}) }
      }} onClick={(e) => e.stopPropagation()} className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl">
        <h3 className="font-black text-xl mb-3">{direction === 'owed_to_me' ? 'Add Receivable (Owed to Me)' : 'Add Bill or Debt (I Owe)'}</h3>
        
        {/* Direction Segmented Control */}
        <div className="bg-slate-100 p-1 rounded-2xl flex gap-1 mb-4">
          <button
            type="button"
            onClick={() => setDirection('i_owe')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${direction === 'i_owe' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            I Owe (Debt)
          </button>
          <button
            type="button"
            onClick={() => setDirection('owed_to_me')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${direction === 'owed_to_me' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Owed to Me (Receivable)
          </button>
        </div>

        <label htmlFor="debt-creditor" className="block text-xs font-bold text-slate-700 mb-1">
          {direction === 'owed_to_me' ? 'Borrower Name' : 'Creditor / Bill Name'}
        </label>
        <input id="debt-creditor" required name="creditor" placeholder={direction === 'owed_to_me' ? "e.g. Juan, Mare, Cousin" : "e.g. Rent, Credit Card, Friend"} className="w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 focus:border-rose-500" />
        
        <label htmlFor="debt-amount" className="block text-xs font-bold text-slate-700 mb-1">Amount (₱)</label>
        <input id="debt-amount" required name="amount" type="number" step="0.01" placeholder="0.00" className="w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 focus:border-rose-500" />
        
        <label htmlFor="debt-due" className="block text-xs font-bold text-slate-700 mb-1">Due Date</label>
        <input id="debt-due" required name="due" type="date" className="w-full bg-slate-50 p-4 rounded-2xl mb-4 font-medium outline-none border border-slate-100 focus:border-rose-500 text-slate-500" />
        
        {direction === 'i_owe' && (
          <div className="flex items-center gap-2 mb-4 px-2">
            <input type="checkbox" name="isRecurring" id="isRecurring" className="w-4 h-4 accent-rose-500 rounded border-slate-300" />
            <label htmlFor="isRecurring" className="text-sm font-bold text-slate-700">This is a recurring monthly bill</label>
          </div>
        )}
        
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} className="flex-1 rounded-xl">Cancel</Button>
          <Button type="submit" className={`flex-1 text-white rounded-xl font-bold ${direction === 'owed_to_me' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-500 hover:bg-rose-600'}`}>Save</Button>
        </div>
      </form>
    </div>
  );
}
