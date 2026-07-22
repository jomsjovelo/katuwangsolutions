import React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { allocateToSavings } from '@/firebase/firestore/budget-actions';
import { SavingsGoal } from '@/lib/schemas/budget';
import { formatPeso } from '@/lib/pricing';
import { ArrowRight } from 'lucide-react';

interface WrapUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  goals: SavingsGoal[];
  wrapUpSavingsAmount: number;
}

export function WrapUpModal({ isOpen, onClose, tenantId, goals, wrapUpSavingsAmount }: WrapUpModalProps) {
  const { toast } = useToast();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">🎉</div>
          <h3 className="font-black text-2xl mb-2 text-slate-800">You Survived!</h3>
          <p className="text-slate-500 font-medium leading-relaxed">
            You finished your last cycle with extra cash! Great job!
          </p>
          <div className="mt-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Total Saved</p>
            <p className="text-3xl font-black text-emerald-700 tracking-tighter">{formatPeso(wrapUpSavingsAmount)}</p>
          </div>
        </div>
        
        <div className="space-y-3">
          {goals.length > 0 ? (
            <Button 
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold p-6 flex flex-col gap-1 h-auto"
              onClick={async () => {
                if(!tenantId || !goals[0]?.id) return;
                await allocateToSavings(tenantId, goals[0].id, wrapUpSavingsAmount);
                toast({title: 'Savings Boosted!', description: `You moved ${formatPeso(wrapUpSavingsAmount)} to ${goals[0].name}.`});
                onClose();
              }}
            >
              <span>Send to {goals[0].name}</span>
              <span className="text-xs font-medium text-emerald-100 flex items-center gap-1">Fastest way to reach your goal <ArrowRight className="h-3 w-3" /></span>
            </Button>
          ) : (
            <Button 
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold p-6 h-auto"
              onClick={onClose}
            >
              Start a Savings Goal
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} className="w-full rounded-xl text-slate-500 font-bold">Keep it in Wallet</Button>
        </div>
      </div>
    </div>
  );
}
