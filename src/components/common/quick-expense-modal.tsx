'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Receipt, AlertCircle, Loader2, DollarSign } from 'lucide-react';
import { addRetailExpense } from '@/firebase/firestore/retail-actions';
import { useToast } from '@/hooks/use-toast';

interface QuickExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  moduleType?: string;
  themeColor?: string;
  onExpenseLogged?: () => void;
}

const EXPENSE_CATEGORIES: Record<string, string[]> = {
  'benta-snap': ['Kuryente / Tubig', 'Plastic / Packaging', 'Biyahe / Pamasahe', 'Meryenda / Staff', 'Renta / Puwesto', 'Iba pa'],
  'fresh-tally': ['Yelo / Packaging', 'Kuryente / Tubig', 'Tapon / Spoilage', 'Biyahe / Pamasahe', 'Renta / Puwesto', 'Iba pa'],
  'build-stack': ['Gasolina / Fuel', 'Helper / Arawan', 'Delivery / Hakot', 'Supplier Payout', 'Kuryente / Tubig', 'Iba pa'],
};

export function QuickExpenseModal({
  isOpen,
  onClose,
  tenantId,
  moduleType = 'benta-snap',
  themeColor = '#06B6D4',
  onExpenseLogged
}: QuickExpenseModalProps) {
  const [amountPesos, setAmountPesos] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();
  const categoryOptions = EXPENSE_CATEGORIES[moduleType] || EXPENSE_CATEGORIES['benta-snap'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valPesos = parseFloat(amountPesos);
    if (isNaN(valPesos) || valPesos <= 0) {
      setError('Paki-lagay ang tamang halaga ng gastos.');
      return;
    }
    if (!selectedCategory) {
      setError('Paki-pili ang kategorya ng gastos.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const amountCentavos = Math.round(valPesos * 100);
      await addRetailExpense(tenantId, amountCentavos, selectedCategory, note.trim());
      toast({
        title: 'Gastos Recorded!',
        description: `Matagumpay na na-record ang ₱${valPesos.toFixed(2)} (${selectedCategory}).`
      });
      setAmountPesos('');
      setSelectedCategory('');
      setNote('');
      if (onExpenseLogged) onExpenseLogged();
      onClose();
    } catch (err: any) {
      setError(err.message || 'May error sa pag-record ng gastos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md rounded-3xl p-6 bg-white border-slate-200">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Receipt className="h-5 w-5" style={{ color: themeColor }} />
            <span>Mag-Record ng Gastos / Expense</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            I-log ang mga gastusin sa negosyo para sa malinis at eksaktong profit report.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center gap-2 text-red-700 text-xs font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 my-2">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Halaga ng Gastos (₱) *
            </label>
            <div className="relative mt-1">
              <Input
                type="number"
                step="1"
                min="1"
                value={amountPesos}
                onChange={(e) => setAmountPesos(e.target.value)}
                placeholder="e.g. 150"
                className="h-12 text-lg font-black text-slate-800 rounded-xl pr-12"
                required
                autoFocus
              />
              <span className="absolute right-3 top-3 text-xs font-black text-slate-400">
                PHP
              </span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Kategorya ng Gastos *
            </label>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              {categoryOptions.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`p-2.5 text-xs font-bold rounded-xl border text-left transition-all ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Note / Paalala (Optional)
            </label>
            <Input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Bayad sa biyahe ng paninda"
              className="h-10 text-xs font-semibold rounded-xl mt-1"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl h-10 px-4 font-bold text-xs">
              Kanselahin
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl h-10 px-5 font-black text-xs text-white shadow-sm"
              style={{ backgroundColor: themeColor }}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Receipt className="h-4 w-4 mr-1.5" />}
              I-save ang Gastos
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
