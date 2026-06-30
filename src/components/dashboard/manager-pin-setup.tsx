import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Loader2, CheckCircle2 } from 'lucide-react';
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { updateManagerPin } from '@/firebase/firestore/tenant-actions';
import { useToast } from '@/hooks/use-toast';
import { getModuleTheme } from '@/lib/theme-utils';

export function ManagerPinSetup() {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const theme = getModuleTheme(currentTenant?.moduleType);
  const { toast } = useToast();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const hasPin = !!currentTenant?.managerPin;

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !user) return;

    if (pin.length !== 4) {
      toast({ title: 'Invalid PIN', description: 'PIN must be exactly 4 digits.', variant: 'destructive' });
      return;
    }

    if (pin !== confirmPin) {
      toast({ title: 'PIN Mismatch', description: 'The PINs do not match.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      await updateManagerPin(
        currentTenant.id,
        pin,
        user.uid,
        user.email || 'Owner'
      );
      toast({ title: 'Success', description: 'Manager Override PIN has been set successfully.' });
      setPin('');
      setConfirmPin('');
      setIsEditing(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save PIN.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasPin && !isEditing) {
    setIsEditing(true);
  }

  return (
    <Card className="bg-white border-slate-200 shadow-sm rounded-[24px] overflow-hidden">
      <CardHeader className="p-4 pb-2 border-b border-slate-50">
        <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
          <Shield className="h-4 w-4" style={{ color: theme.primary }} />
          Manager Override PIN
        </CardTitle>
        <CardDescription className="text-[11px] font-medium leading-relaxed mt-0.5">
          Set a 4-digit PIN. Staff will be required to enter this PIN whenever they want to void sales or delete records.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-4">
        {hasPin && !isEditing ? (
          <div className="bg-emerald-50 rounded-xl p-4 flex flex-col items-center justify-center text-center border border-emerald-100 gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="text-sm font-black text-emerald-800">PIN is Configured</p>
              <p className="text-[10px] text-emerald-600 font-medium leading-tight">Your store is protected against unauthorized deletions.</p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setIsEditing(true)}
              className="mt-2 h-10 px-6 rounded-xl text-xs font-bold bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-100"
            >
              Change PIN
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSavePin} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New PIN</label>
                <Input 
                  type="password" 
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="h-12 text-center text-xl font-black tracking-widest rounded-xl border-slate-200 focus-visible:ring-slate-900 placeholder:tracking-normal"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Confirm PIN</label>
                <Input 
                  type="password" 
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="••••"
                  className="h-12 text-center text-xl font-black tracking-widest rounded-xl border-slate-200 focus-visible:ring-slate-900 placeholder:tracking-normal"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              {hasPin && (
                <Button 
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 h-12 rounded-xl text-slate-600 font-bold"
                >
                  Cancel
                </Button>
              )}
              <Button 
                type="submit"
                disabled={submitting || pin.length !== 4 || confirmPin.length !== 4}
                className="flex-[2] h-12 rounded-xl text-white font-bold bg-slate-900 hover:bg-slate-800"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : (hasPin ? 'Update PIN' : 'Save PIN')}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
