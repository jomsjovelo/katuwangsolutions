import React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { addSavingsGoal } from '@/firebase/firestore/budget-actions';
import { BudgetPersona } from '../budget-mo-dashboard';

interface GoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  persona: BudgetPersona;
}

export function GoalModal({ isOpen, onClose, tenantId, persona }: GoalModalProps) {
  const { toast } = useToast();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <form id="goal-form" onSubmit={async (e) => {
        e.preventDefault();
        if(!tenantId) return;
        const fd = new FormData(e.currentTarget);
        try {
          await addSavingsGoal(tenantId, fd.get('name') as string, Number(fd.get('amount'))*100);
          toast({title: 'Goal Added'});
          onClose();
        } catch(e:any) { toast({title: 'Error', description: e.message, variant: 'destructive'}) }
      }} onClick={(e) => e.stopPropagation()} className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl">
        <h3 className="font-black text-xl mb-4">New Savings Goal</h3>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
          {(persona === 'student' ? [
            {name: 'Concert Ticket', amt: 5000},
            {name: 'New Phone', amt: 20000},
            {name: 'Tuition Fund', amt: 15000}
          ] : persona === 'freelancer' ? [
            {name: 'Tax Fund', amt: 40000},
            {name: 'New Laptop', amt: 60000},
            {name: 'Business Capital', amt: 50000}
          ] : persona === 'business' ? [
            {name: 'Equipment Upgrade', amt: 50000},
            {name: 'Tax Reserve', amt: 80000},
            {name: 'Emergency Payroll', amt: 100000}
          ] : [
            {name: 'Emergency Fund', amt: 50000},
            {name: 'Vacation', amt: 30000},
            {name: 'Car Downpayment', amt: 100000}
          ]).map(template => (
            <button key={template.name} type="button" 
              onClick={() => {
                const form = document.getElementById('goal-form') as HTMLFormElement;
                if(form) {
                  (form.elements.namedItem('name') as HTMLInputElement).value = template.name;
                  (form.elements.namedItem('amount') as HTMLInputElement).value = template.amt.toString();
                }
              }}
              className="whitespace-nowrap px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-bold transition-colors">
              {template.name}
            </button>
          ))}
        </div>
        <label htmlFor="goal-name" className="block text-xs font-bold text-slate-700 mb-1">Goal Name</label>
        <input id="goal-name" required name="name" placeholder="Goal Name (e.g. Emergency Fund)" className="w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 focus:border-indigo-500" />
        <label htmlFor="goal-amount" className="block text-xs font-bold text-slate-700 mb-1">Target Amount (₱)</label>
        <input id="goal-amount" required name="amount" type="number" step="0.01" placeholder="0.00" className="w-full bg-slate-50 p-4 rounded-2xl mb-4 font-medium outline-none border border-slate-100 focus:border-indigo-500" />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} className="flex-1 rounded-xl">Cancel</Button>
          <Button type="submit" className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-bold">Save</Button>
        </div>
      </form>
    </div>
  );
}
