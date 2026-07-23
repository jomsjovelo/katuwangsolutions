import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, PieChart, Check, ShieldCheck } from 'lucide-react';

interface AllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  incomeAmountCentavos: number;
  onConfirmAllocation: (needsCentavos: number, wantsCentavos: number, savingsCentavos: number) => Promise<void>;
}

export function AllocationModal({
  isOpen,
  onClose,
  incomeAmountCentavos,
  onConfirmAllocation,
}: AllocationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const totalAmount = incomeAmountCentavos / 100;
  const needsAmount = Math.round(totalAmount * 0.5);
  const wantsAmount = Math.round(totalAmount * 0.3);
  const savingsAmount = totalAmount - needsAmount - wantsAmount; // remainder guarantees exact sum

  const needsCentavos = needsAmount * 100;
  const wantsCentavos = wantsAmount * 100;
  const savingsCentavos = savingsAmount * 100;

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      await onConfirmAllocation(needsCentavos, wantsCentavos, savingsCentavos);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Badge */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-bold">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Smart Salary Split</span>
            <h3 className="font-black text-lg text-slate-800 tracking-tight">Auto-Allocate Salary?</h3>
          </div>
        </div>

        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Log ₱{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} instantly into the <strong>50/30/20 rule</strong> envelopes:
        </p>

        {/* 50/30/20 Breakdown Cards */}
        <div className="space-y-2 mb-6">
          <div className="bg-emerald-50/70 border border-emerald-200/60 p-3 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-emerald-500 text-white rounded-lg flex items-center justify-center font-black text-xs">50%</div>
              <div>
                <p className="font-bold text-slate-800 text-xs">Needs / Essentials</p>
                <p className="text-[10px] text-slate-500">Rent, Groceries, Bills</p>
              </div>
            </div>
            <span className="font-black text-emerald-700 text-sm">₱{needsAmount.toLocaleString()}</span>
          </div>

          <div className="bg-indigo-50/70 border border-indigo-200/60 p-3 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-indigo-500 text-white rounded-lg flex items-center justify-center font-black text-xs">30%</div>
              <div>
                <p className="font-bold text-slate-800 text-xs">Wants / Lifestyle</p>
                <p className="text-[10px] text-slate-500">Dining, Leisure, Shopping</p>
              </div>
            </div>
            <span className="font-black text-indigo-700 text-sm">₱{wantsAmount.toLocaleString()}</span>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/60 p-3 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-amber-500 text-white rounded-lg flex items-center justify-center font-black text-xs">20%</div>
              <div>
                <p className="font-bold text-slate-800 text-xs">Savings & Emergency</p>
                <p className="text-[10px] text-slate-500">Emergency Fund, Future</p>
              </div>
            </div>
            <span className="font-black text-amber-700 text-sm">₱{savingsAmount.toLocaleString()}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirm}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 font-bold flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform"
          >
            <Check className="h-4 w-4" /> 1-Tap Auto-Allocate
          </Button>

          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-full text-slate-400 hover:text-slate-600 text-xs font-bold rounded-xl"
          >
            Skip (Keep in Unallocated Balance)
          </Button>
        </div>

      </div>
    </div>
  );
}
