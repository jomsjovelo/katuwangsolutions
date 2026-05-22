import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, PartyPopper, BookText, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SuccessStepProps {
  data: any;
  onProceed: () => void;
}

export function SuccessStep({ data, onProceed }: SuccessStepProps) {
  const [customerName, setCustomerName] = useState('');
  const [amount, setAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    if (!customerName || !amount) return;
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setIsSaved(true);
      setTimeout(() => {
        onProceed();
      }, 1500); // Wait for checkmark to show before redirecting
    }, 1000);
  };

  if (isSaved) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500 min-h-[80vh]">
        <div className="h-24 w-24 rounded-full bg-green-100 flex items-center justify-center mb-4 shadow-lg border border-green-200">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>
        <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Na-save na!</h2>
        <p className="text-slate-600 text-sm font-medium max-w-xs">
          Ganun lang kadali mag-lista sa Katuwang. Papunta na tayo sa Dashboard mo...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col items-center justify-start text-center space-y-6 animate-in slide-in-from-right-4 duration-500 min-h-[80vh] pt-12">
      
      <div className="space-y-2 max-w-xs mx-auto">
        <div className="inline-block px-4 py-1.5 bg-green-100 text-green-800 text-[10px] font-black uppercase tracking-widest rounded-full mb-2">
          Account Created
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Ayos, {data.fullName.split(' ')[0]}!</h2>
        <p className="text-slate-600 text-sm font-medium">
          Welcome sa <strong>{data.businessName}</strong>. Subukan na natin! I-lista ang unang umutang sa'yo ngayon.
        </p>
      </div>

      <div className="w-full bg-white border border-slate-200 rounded-3xl p-6 shadow-xl space-y-5 text-left relative overflow-hidden">
        
        {/* Top banner styling */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-orange-400" />
        
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="h-10 w-10 bg-orange-100 rounded-xl flex items-center justify-center">
            <BookText className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Utang Tracker</h3>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Mock Entry</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Pangalan ng Suki</Label>
            <Input 
              placeholder="Halimbawa: Aling Nena"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="bg-slate-50"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Magkano?</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₱</span>
              <Input 
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-8 bg-slate-50 font-medium"
              />
            </div>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={!customerName || !amount || isSaving}
          className="w-full h-14 rounded-2xl text-base font-bold bg-orange-500 hover:bg-orange-600 shadow-xl shadow-orange-500/20 active:scale-[0.98] transition-all flex items-center justify-center"
        >
          {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : "I-save ang Utang"}
        </Button>
      </div>

      <button 
        onClick={onProceed}
        className="text-[11px] text-slate-400 uppercase tracking-widest font-bold pt-4 hover:text-slate-600 transition-colors"
      >
        Skip na muna →
      </button>

    </div>
  );
}
