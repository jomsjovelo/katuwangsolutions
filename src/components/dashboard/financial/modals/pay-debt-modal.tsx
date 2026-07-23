import React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { logDebtPayment } from '@/firebase/firestore/budget-actions';
import { Debt } from '@/lib/schemas/budget';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatPeso } from '@/lib/pricing';
import { Input } from '@/components/ui/input';

interface PayDebtModalProps {
  debt: Debt | null;
  onClose: () => void;
  tenantId: string;
}

export function PayDebtModal({ debt, onClose, tenantId }: PayDebtModalProps) {
  const { toast } = useToast();

  if (!debt) return null;

  return (
    <Dialog open={!!debt} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay {debt.creditorName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const amtStr = new FormData(e.currentTarget).get('amount') as string;
          if (!amtStr || isNaN(Number(amtStr)) || !tenantId || !debt?.id) return;
          try {
            const amtC = Number(amtStr) * 100;
            await logDebtPayment(tenantId, debt.id, amtC, `Payment towards ${debt.creditorName}`);
            toast({title: 'Payment Logged', description: 'Your balance and debt have been updated.'});
            onClose();
          } catch(err:any) {
            toast({title: 'Error', description: err.message, variant: 'destructive'});
          }
        }}>
          <div className="py-4 space-y-2">
            <p className="text-sm text-slate-500 mb-2">
              How much are you paying today? Your remaining balance is {formatPeso(debt.remainingAmountCentavos / 100)}.
            </p>
            <label htmlFor="pay-debt-amount" className="block text-xs font-bold text-slate-700">Amount (₱)</label>
            <Input id="pay-debt-amount" required name="amount" type="number" step="0.01" placeholder="0.00" max={(debt.remainingAmountCentavos / 100).toString()} />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit">Log Payment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
