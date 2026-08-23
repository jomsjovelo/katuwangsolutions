'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserCheck, BookOpen, AlertCircle, Loader2 } from 'lucide-react';

interface QuickPlistaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmPlista: (customerName: string, customerPhone?: string, note?: string) => Promise<void>;
  totalAmountPesos: number;
  themeColor?: string;
}

export function QuickPlistaModal({
  isOpen,
  onClose,
  onConfirmPlista,
  totalAmountPesos,
  themeColor = '#06B6D4'
}: QuickPlistaModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setError('Paki-lagay ang pangalan ng kapitbahay/suki.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirmPlista(customerName.trim(), customerPhone.trim() || undefined, note.trim() || undefined);
      setCustomerName('');
      setCustomerPhone('');
      setNote('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to log credit transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md rounded-3xl p-6 bg-white border-slate-200">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-lg font-black text-slate-800 flex items-center gap-2">
            <BookOpen className="h-5 w-5" style={{ color: themeColor }} />
            <span>Plista kay Kapitbahay / Suki</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            I-record ang utang sa talaan nang walang abala. Total amount: <strong className="text-slate-800">₱{totalAmountPesos.toFixed(2)}</strong>
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
              Pangalan ng Suki / Kapitbahay *
            </label>
            <Input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Aling Nena, Pareng Boyet"
              className="h-11 text-sm font-bold rounded-xl mt-1"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                CP Number (Optional)
              </label>
              <Input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="0917XXXXXXX"
                className="h-10 text-xs font-semibold rounded-xl mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Note / Paalala
              </label>
              <Input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Bayad daw sa Biyernes"
                className="h-10 text-xs font-semibold rounded-xl mt-1"
              />
            </div>
          </div>

          <div className="bg-lime-50 border border-lime-200 rounded-2xl p-3 flex items-center justify-between">
            <span className="text-xs font-bold text-lime-900">Total na Ipapalista:</span>
            <span className="text-lg font-black text-lime-800">₱{totalAmountPesos.toFixed(2)}</span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl h-10 px-4 font-bold text-xs"
            >
              Kanselahin
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl h-10 px-5 font-black text-xs text-white shadow-sm"
              style={{ backgroundColor: themeColor }}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <UserCheck className="h-4 w-4 mr-1.5" />
              )}
              I-Plista Na
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
