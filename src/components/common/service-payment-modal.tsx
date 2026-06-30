import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Coins, Smartphone } from "lucide-react";
import { DiscountInput } from '@/components/ui/discount-input';
import { useState } from 'react';
import { CashModal } from './cash-modal';
import { GCashQrModal } from './gcash-qr-modal';

export function ServicePaymentModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  amountDue, 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: (method: string, discountCentavos?: number, discountType?: 'percentage' | 'fixed', discountReason?: string) => void, 
  amountDue: number, 
}) {
  const [discountType, setDiscountType] = useState<'percentage'|'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [showGCashQr, setShowGCashQr] = useState(false);

  const parsedDiscount = parseFloat(discountValue) || 0;
  let discountCentavos = 0;
  if (discountType === 'percentage') {
    discountCentavos = Math.round((amountDue * parsedDiscount) / 100);
  } else {
    discountCentavos = Math.round(parsedDiscount * 100);
  }
  if (discountCentavos > amountDue) discountCentavos = amountDue;

  const finalTotalCentavos = Math.max(0, amountDue - discountCentavos);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        setDiscountValue('');
        setDiscountReason('');
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-[350px]">
        <DialogHeader>
          <DialogTitle className="font-headline font-black text-center text-xl">Payment Method</DialogTitle>
          <DialogDescription className="text-center">
            Total Amount Due
            <div className="text-3xl font-black text-slate-800 mt-2 mb-4">
              ₱{(finalTotalCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </div>
            Select payment method to complete the order.
          </DialogDescription>
        </DialogHeader>
        
        <DiscountInput 
          discountType={discountType}
          discountValue={discountValue}
          onTypeChange={setDiscountType}
          onValueChange={setDiscountValue}
          subtotal={amountDue}
          discountReason={discountReason}
          onReasonChange={setDiscountReason}
        />
        
        <div className="grid grid-cols-2 gap-3 mt-4 border-t border-slate-100 pt-4">
          <Button 
            className="h-16 flex flex-col items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border-2 border-slate-200"
            onClick={() => setShowCashModal(true)}
          >
            <Coins className="h-6 w-6 text-amber-500" />
            <span className="font-bold text-xs uppercase">Cash</span>
          </Button>
          <Button 
            className="h-16 flex flex-col items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border-2 border-slate-200"
            onClick={() => setShowGCashQr(true)}
          >
            <Smartphone className="h-6 w-6 text-blue-500" />
            <span className="font-bold text-xs uppercase">GCash</span>
          </Button>
        </div>
      </DialogContent>

      <CashModal 
        open={showCashModal}
        onClose={() => { setShowCashModal(false); setCashTendered(''); }}
        totalAmount={finalTotalCentavos}
        cashTendered={cashTendered}
        onCashTenderedChange={setCashTendered}
        onConfirm={() => {
          setShowCashModal(false);
          onConfirm('cash', discountCentavos, discountType, discountReason);
        }}
        theme={{ primary: '#10b981', primaryText: '#ffffff' }}
      />
      <GCashQrModal
        open={showGCashQr}
        onClose={() => setShowGCashQr(false)}
        totalAmount={finalTotalCentavos}
        tenantName="Katuwang Service"
        paymentType="gcash"
        onPaymentVerified={async (method, ref) => {
          setShowGCashQr(false);
          onConfirm(method, discountCentavos, discountType, discountReason);
        }}
        theme={{ primary: '#007aff', primaryText: '#ffffff' }}
      />
    </Dialog>
  );
}
