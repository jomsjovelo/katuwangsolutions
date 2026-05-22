"use client"

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { BusinessInfoSchema } from '@/lib/schemas/onboarding';

interface BusinessInfoStepProps {
  data: any;
  onUpdate: (update: any) => void;
  onNext: () => void;
}

export function BusinessInfoStep({ data, onUpdate, onNext }: BusinessInfoStepProps) {
  const [errors, setErrors] = useState<any>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = BusinessInfoSchema.safeParse(data);
    if (!result.success) {
      const fieldErrors: any = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0]] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }
    
    setErrors({});
    onNext();
  };

  return (
    <div className="p-6 space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Simulan natin!</h2>
        <p className="text-slate-600 text-sm font-medium">Ano'ng pangalan mo at ng tindahan mo?</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-xs font-bold uppercase tracking-widest text-slate-500">Buong Pangalan</Label>
            <Input 
              id="fullName"
              placeholder="Halimbawa: Juan dela Cruz"
              value={data.fullName || ''}
              onChange={(e) => onUpdate({ fullName: e.target.value })}
              className={errors.fullName ? "border-destructive" : ""}
            />
            {errors.fullName && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{errors.fullName}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessName" className="text-xs font-bold uppercase tracking-widest text-slate-500">Pangalan ng Tindahan</Label>
            <Input 
              id="businessName"
              placeholder="Halimbawa: Aling Nena's Store"
              value={data.businessName || ''}
              onChange={(e) => onUpdate({ businessName: e.target.value })}
              className={errors.businessName ? "border-destructive" : ""}
            />
            {errors.businessName && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{errors.businessName}</p>}
          </div>
        </div>

        <Button type="submit" className="w-full h-14 rounded-2xl text-base font-bold shadow-xl active:scale-[0.98] transition-transform">
          Tuloy Natin
        </Button>
      </form>
    </div>
  );
}
