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

export function ServicePaymentModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  amountDue, 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: (method: string) => void, 
  amountDue: number, 
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[350px]">
        <DialogHeader>
          <DialogTitle className="font-headline font-black text-center text-xl">Payment Method</DialogTitle>
          <DialogDescription className="text-center">
            Total Amount Due
            <div className="text-3xl font-black text-slate-800 mt-2 mb-4">
              ₱{(amountDue / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </div>
            Select payment method to complete the order.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-3 mt-2">
          <Button 
            className="h-16 flex flex-col items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border-2 border-slate-200"
            onClick={() => onConfirm('cash')}
          >
            <Coins className="h-6 w-6 text-amber-500" />
            <span className="font-bold text-xs uppercase">Cash</span>
          </Button>
          <Button 
            className="h-16 flex flex-col items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border-2 border-slate-200"
            onClick={() => onConfirm('gcash')}
          >
            <Smartphone className="h-6 w-6 text-blue-500" />
            <span className="font-bold text-xs uppercase">GCash</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
