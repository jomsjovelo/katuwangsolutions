import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, AlertCircle, X, ShieldCheck } from 'lucide-react';
import { usePinApprovalStore } from '@/store/use-pin-approval-store';
import { useTenant } from '@/app/lib/tenant-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function PinApprovalModal() {
  const { isOpen, actionDescription, resolveApproval, close } = usePinApprovalStore();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // If no pin is set by owner, we cannot approve! Or we allow it?
    // According to requirements, the owner MUST set a PIN to use this feature.
    // If no PIN is set on the tenant, it will always fail, prompting them to ask the owner to set one.
    if (!currentTenant?.managerPin) {
      toast({
        title: "No PIN Configured",
        description: "The Store Owner has not set a Manager PIN yet.",
        variant: "destructive"
      });
      setError(true);
      return;
    }

    if (pin === currentTenant.managerPin) {
      resolveApproval(true);
    } else {
      setError(true);
      toast({
        title: "Access Denied",
        description: "Incorrect Manager PIN.",
        variant: "destructive"
      });
      setPin('');
    }
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPin(e.target.value);
    setError(false);
    // Auto-submit if 4 digits
    if (e.target.value.length === 4) {
      // Small timeout to allow the digit to render
      setTimeout(() => {
        // Can't use pin state here because it's stale, use e.target.value
        const enteredPin = e.target.value;
        if (currentTenant?.managerPin && enteredPin === currentTenant.managerPin) {
          resolveApproval(true);
        } else {
          setError(true);
          toast({
            title: "Access Denied",
            description: "Incorrect Manager PIN.",
            variant: "destructive"
          });
          setPin('');
        }
      }, 50);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="sm:max-w-md rounded-[24px] overflow-hidden p-0 gap-0 border-slate-200">
        <div className="bg-slate-900 p-6 flex flex-col items-center justify-center text-white relative">
          <button onClick={close} className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors">
            <X className="h-4 w-4" />
          </button>
          
          <div className="h-16 w-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-white" />
          </div>
          <DialogTitle className="text-xl font-black text-center mb-1">Manager Approval Required</DialogTitle>
          <DialogDescription className="text-center text-slate-300 font-medium px-4">
            {actionDescription}
          </DialogDescription>
        </div>
        
        <div className="p-6 space-y-6 bg-white">
          {!currentTenant?.managerPin && (
            <div className="bg-red-50 p-3 rounded-xl flex items-start gap-2 border border-red-100 mb-4">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-800 font-medium">
                The Store Owner has not set up a Manager PIN yet. This action cannot be approved.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2 text-center">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Enter 4-Digit PIN</label>
              <Input 
                type="password" 
                inputMode="numeric"
                maxLength={4}
                autoFocus
                placeholder="••••"
                value={pin}
                onChange={handlePinChange}
                className={cn(
                  "h-16 text-center text-4xl font-black tracking-[0.5em] rounded-2xl transition-all placeholder:tracking-normal",
                  error ? "border-red-500 bg-red-50 text-red-600 focus-visible:ring-red-500" : "border-slate-200 focus-visible:ring-slate-900"
                )}
              />
            </div>
            
            <Button 
              type="submit"
              disabled={pin.length < 4 || !currentTenant?.managerPin}
              className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg"
            >
              <ShieldCheck className="h-5 w-5 mr-2" /> Approve Action
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
