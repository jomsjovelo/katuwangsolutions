import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Coins } from 'lucide-react';

interface CashModalProps {
  open: boolean;
  onClose: () => void;
  totalAmount: number; // in centavos
  cashTendered: string;
  onCashTenderedChange: (val: string) => void;
  onConfirm: () => void;
  theme: any;
}

export function CashModal({
  open,
  onClose,
  totalAmount,
  cashTendered,
  onCashTenderedChange,
  onConfirm,
  theme
}: CashModalProps) {
  const parsedCash = parseFloat(cashTendered) || 0;
  const cashCentavos = parsedCash * 100;
  const changeCentavos = Math.max(0, cashCentavos - totalAmount);
  
  const isValid = cashCentavos >= totalAmount;
  const totalPesos = totalAmount / 100;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-[24px] p-0 overflow-hidden sm:max-w-[400px]">
        <DialogHeader className="px-6 pt-6 pb-4 bg-emerald-50 border-b border-emerald-100">
          <DialogTitle className="font-headline font-black text-lg flex items-center gap-2 text-emerald-800">
            <Coins className="h-5 w-5 text-emerald-600" />
            Cash Payment
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center">
            <span className="font-bold text-slate-500 uppercase text-xs">Total Amount</span>
            <span className="font-black text-2xl" style={{ color: theme.primary }}>
              ₱{totalPesos.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Pera na Ibinayad (Tendered)</Label>
            <Input 
              id="cash-tendered"
              name="cashTendered"
              type="number"
              value={cashTendered}
              onChange={e => onCashTenderedChange(e.target.value)}
              placeholder="0.00"
              className="h-14 text-2xl font-black border-emerald-200 bg-white text-emerald-700 placeholder:text-emerald-200"
              autoFocus
            />
          </div>
          
          <div className="grid grid-cols-4 gap-2">
            <Button variant="outline" onClick={() => onCashTenderedChange(totalPesos.toString())} className="h-10 text-[10px] font-bold rounded-xl border-slate-200 text-slate-600">Exact</Button>
            <Button variant="outline" onClick={() => onCashTenderedChange('100')} className="h-10 text-[10px] font-bold rounded-xl border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">₱100</Button>
            <Button variant="outline" onClick={() => onCashTenderedChange('500')} className="h-10 text-[10px] font-bold rounded-xl border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">₱500</Button>
            <Button variant="outline" onClick={() => onCashTenderedChange('1000')} className="h-10 text-[10px] font-bold rounded-xl border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">₱1000</Button>
          </div>

          {isValid && cashTendered !== '' && (
            <div className="flex justify-between items-center p-4 rounded-xl border border-emerald-200 bg-emerald-50 animate-in fade-in zoom-in duration-200">
              <span className="text-xs font-black uppercase tracking-widest text-emerald-700">Sukli (Change)</span>
              <span className="text-2xl font-black text-emerald-700">₱{(changeCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl h-12 flex-1 font-bold">
            Bumalik
          </Button>
          <Button 
            className="rounded-xl h-12 flex-1 font-bold text-white border-none shadow-md" 
            style={{ backgroundColor: theme.primary, boxShadow: `0 8px 16px -4px ${theme.primary}40` }}
            onClick={onConfirm}
            disabled={!isValid && totalAmount > 0}
          >
            Tapusin ang Sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
