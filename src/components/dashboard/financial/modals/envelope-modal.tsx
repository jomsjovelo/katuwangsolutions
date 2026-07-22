import React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { addBudgetEnvelope } from '@/firebase/firestore/budget-actions';

interface EnvelopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}

export function EnvelopeModal({ isOpen, onClose, tenantId }: EnvelopeModalProps) {
  const { toast } = useToast();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <form id="envelope-form" onSubmit={async (e) => {
        e.preventDefault();
        if(!tenantId) return;
        const fd = new FormData(e.currentTarget);
        try {
          await addBudgetEnvelope(tenantId, fd.get('category') as string, Number(fd.get('amount'))*100);
          toast({title: 'Envelope Added'});
          onClose();
        } catch(e:any) { toast({title: 'Error', description: e.message, variant: 'destructive'}) }
      }} className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl">
        <h3 className="font-black text-xl mb-4">New Category Budget</h3>
        <p className="text-xs text-slate-500 mb-3">Set a strict limit for a specific spending category.</p>
        <input required name="category" placeholder="Category (e.g. Food)" className="w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 focus:border-violet-500" />
        <input required name="amount" type="number" step="0.01" placeholder="Limit Amount (₱)" className="w-full bg-slate-50 p-4 rounded-2xl mb-4 font-medium outline-none border border-slate-100 focus:border-violet-500" />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1 rounded-xl">Cancel</Button>
          <Button type="submit" className="flex-1 bg-violet-500 hover:bg-violet-600 text-white rounded-xl font-bold">Save Envelope</Button>
        </div>
      </form>
    </div>
  );
}
