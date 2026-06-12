"use client"

import React, { useState } from 'react';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetDescription
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { submitReferralWithdrawal } from '@/firebase/firestore/referral-withdrawal-actions';
import { cn } from '@/lib/utils';

interface WithdrawReferralSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uid: string;
  userFullName: string;
  userEmail: string;
  tenantName: string;
  role: 'owner' | 'staff';
  availableBalance: number;
}

export function WithdrawReferralSheet({
  open,
  onOpenChange,
  uid,
  userFullName,
  userEmail,
  tenantName,
  role,
  availableBalance
}: WithdrawReferralSheetProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [paymentMethod, setPaymentMethod] = useState<'gcash' | 'maya'>('gcash');
  const [accountName, setAccountName] = useState(userFullName);
  const [accountNumber, setAccountNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWithdraw = availableBalance >= 200;
  
  // Reset state when opened
  React.useEffect(() => {
    if (open) {
      setStep(1);
      setPaymentMethod('gcash');
      setAccountName(userFullName);
      setAccountNumber('');
      setError(null);
    }
  }, [open, userFullName]);

  const handleSubmit = async () => {
    if (!accountName.trim() || !accountNumber.trim()) {
      setError("Please fill in all payment details.");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      await submitReferralWithdrawal(
        uid,
        userFullName,
        userEmail,
        tenantName,
        role,
        availableBalance,
        paymentMethod,
        accountName,
        accountNumber
      );
      setStep(3); // Success step
    } catch (err: any) {
      setError(err.message || "Failed to submit withdrawal request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] sm:h-auto sm:max-w-md mx-auto rounded-t-3xl sm:rounded-2xl p-0 flex flex-col">
        {step === 1 && (
          <>
            <SheetHeader className="p-6 pb-2 text-left bg-emerald-50/50 rounded-t-3xl sm:rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-600">
                  <Wallet className="h-6 w-6" />
                </div>
                <div>
                  <SheetTitle className="text-xl font-headline font-black text-slate-800">
                    Withdraw Referral Bonus
                  </SheetTitle>
                  <SheetDescription className="text-slate-500 font-medium">
                    Convert your referrals to real cash
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mb-6 text-center">
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Available Balance</p>
                <div className="text-4xl font-headline font-black text-emerald-600 mb-2">
                  ₱{availableBalance.toFixed(2)}
                </div>
                <p className="text-sm font-medium text-slate-500">
                  From {Math.floor(availableBalance / 10)} successful referrals
                </p>
              </div>

              {!canWithdraw ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                  <p className="text-sm font-bold text-amber-800 mb-1">Minimum withdrawal is ₱200.00</p>
                  <p className="text-xs text-amber-600">
                    You need ₱{(200 - availableBalance).toFixed(2)} more to withdraw. Keep sharing your code!
                  </p>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-2xl p-4">
                  <h4 className="font-bold text-slate-800 mb-2 text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    You are eligible to withdraw!
                  </h4>
                  <p className="text-xs text-slate-500">
                    The full amount of ₱{availableBalance.toFixed(2)} will be transferred to your preferred e-wallet. Processing takes 24-48 hours.
                  </p>
                </div>
              )}
            </div>
            
            <div className="p-6 pt-2 mt-auto border-t">
              <Button 
                onClick={() => setStep(2)} 
                disabled={!canWithdraw}
                className="w-full h-12 rounded-xl font-bold text-base shadow-lg bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                Proceed to Payment Details
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <SheetHeader className="p-6 pb-2 text-left border-b">
              <SheetTitle className="text-lg font-headline font-black text-slate-800">
                Payment Details
              </SheetTitle>
              <SheetDescription className="text-slate-500">
                Where should we send your ₱{availableBalance.toFixed(2)}?
              </SheetDescription>
            </SheetHeader>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Payment Method</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setPaymentMethod('gcash')}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all",
                      paymentMethod === 'gcash' 
                        ? "border-blue-500 bg-blue-50 text-blue-700" 
                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                    )}
                  >
                    <span className="font-black text-lg tracking-tight">GCash</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('maya')}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all",
                      paymentMethod === 'maya' 
                        ? "border-green-500 bg-green-50 text-green-700" 
                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                    )}
                  >
                    <span className="font-black text-lg tracking-tight">Maya</span>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="accountName" className="text-slate-600 font-bold">Account Name</Label>
                  <Input 
                    id="accountName"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="E.g. Juan Dela Cruz"
                    className="h-12 bg-slate-50 border-slate-200 focus:bg-white rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber" className="text-slate-600 font-bold">{paymentMethod === 'gcash' ? 'GCash' : 'Maya'} Number</Label>
                  <Input 
                    id="accountNumber"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="0917 123 4567"
                    className="h-12 bg-slate-50 border-slate-200 focus:bg-white rounded-xl font-mono text-lg"
                  />
                </div>
              </div>

              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-800 mb-2">Request Summary</h4>
                <div className="space-y-1 text-sm text-emerald-700 font-medium">
                  <div className="flex justify-between">
                    <span>Amount to receive:</span>
                    <span className="font-bold">₱{availableBalance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Send via:</span>
                    <span className="font-bold uppercase">{paymentMethod}</span>
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-sm font-bold text-destructive text-center bg-destructive/10 p-3 rounded-xl">
                  {error}
                </p>
              )}
            </div>
            
            <div className="p-6 pt-2 mt-auto border-t bg-white">
              <Button 
                onClick={handleSubmit} 
                disabled={isSubmitting || !accountName || !accountNumber}
                className="w-full h-12 rounded-xl font-bold text-base shadow-lg bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>Submit Withdrawal Request</>
                )}
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setStep(1)}
                disabled={isSubmitting}
                className="w-full mt-2 h-10 text-slate-500 font-bold"
              >
                Back
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="p-8 flex flex-col items-center justify-center text-center h-full sm:min-h-[400px]">
            <div className="h-20 w-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-headline font-black text-slate-800 mb-2">
              Request Submitted!
            </h2>
            <p className="text-slate-500 font-medium mb-8">
              We've received your request to withdraw <strong className="text-slate-700">₱{availableBalance.toFixed(2)}</strong>.
              It will be sent to your {paymentMethod === 'gcash' ? 'GCash' : 'Maya'} account ({accountNumber}) within 24-48 hours.
            </p>
            <Button 
              onClick={() => onOpenChange(false)}
              className="w-full h-12 rounded-xl font-bold bg-slate-800 hover:bg-slate-900 text-white"
            >
              Done
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
