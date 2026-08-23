"use client"

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from 'lucide-react';
import { BirthdayPicker } from '@/components/ui/birthday-picker';

import { BusinessInfoSchema } from '@/lib/schemas/onboarding';
import { z } from 'zod';

interface BusinessInfoStepProps {
  data: any;
  onUpdate: (update: any) => void;
  onNext: () => void;
  isLoading?: boolean;
}

// Partial schemas for each sub-step
const SubStepASchema = z.object({
  fullName: z.string().min(2, 'Kailangan ang buong pangalan mo'),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Kailangan ang kaarawan mo').refine(val => {
    const today = new Date();
    const [year, month, day] = val.split('-').map(Number);
    const birthDate = new Date(year, month - 1, day);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 18;
  }, { message: 'Kailangan ay 18 taon pataas.' }),
  gender: z.enum(['Lalaki', 'Babae', 'Iba pa', 'Prefer not to say']),
});

const SubStepBSchema = z.object({
  address: z.string().min(5, 'Kailangan ng kumpletong tirahan'),
  businessName: z.string().min(2, 'Kailangan ang pangalan ng negosyo').max(100),
});


export function BusinessInfoStep({ data, onUpdate, onNext, isLoading }: BusinessInfoStepProps) {
  const [subStep, setSubStep] = useState<'A' | 'B'>('A');
  const [errors, setErrors] = useState<any>({});
  
  // Local submitting state for sub-step transitions
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);

  // Stable callback to prevent BirthdayPicker's useEffect from re-running on every render
  const handleBirthdayChange = useCallback((val: string) => {
    onUpdate({ birthday: val });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNextSubStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocalSubmitting || isLoading) return;
    
    const result = SubStepASchema.safeParse(data);
    if (!result.success) {
      const fieldErrors: any = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0]] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }
    
    setErrors({});
    setIsLocalSubmitting(true);
    // slight delay for visual feedback
    setTimeout(() => {
      setSubStep('B');
      setIsLocalSubmitting(false);
    }, 150);
  };

  const handleSubmitFinal = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    
    const result = SubStepBSchema.safeParse(data);
    if (!result.success) {
      const isBudgetMo = data.appId === 'budget-mo';
      const fieldErrors: any = {};
      result.error.issues.forEach((issue) => {
        const fieldName = issue.path[0];
        if (fieldName === 'businessName' && isBudgetMo) {
          fieldErrors[fieldName] = 'Kailangan ang pangalan ng iyong budget account';
        } else {
          fieldErrors[fieldName] = issue.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }
    
    setErrors({});
    onNext();
  };

  return (
    <div className="p-6 space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      
      {subStep === 'A' && (
        <>
          <div className="space-y-1">
            <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Mga Detalye Mo</h2>
            <p className="text-slate-600 text-sm font-medium">Mga simpleng impormasyon tungkol sa iyo.</p>
          </div>

          <form onSubmit={handleNextSubStep} className="space-y-6">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-xs font-bold uppercase tracking-widest text-slate-500">Buong Pangalan</Label>
                <Input 
                  id="fullName"
                  placeholder="Halimbawa: Juan dela Cruz"
                  value={data.fullName || ''}
                  onChange={(e) => onUpdate({ fullName: e.target.value })}
                  className={errors.fullName ? "border-destructive h-14" : "h-14"}
                />
                {errors.fullName && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{errors.fullName}</p>}
              </div>

              <div className="space-y-2">
                <div className="flex flex-col gap-0.5">
                  <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Kaarawan</Label>
                  <span className="text-[10px] text-slate-400 font-medium">Kailangan ay 18 taon pataas</span>
                </div>
                <BirthdayPicker 
                  value={data.birthday} 
                  onChange={handleBirthdayChange}
                  error={!!errors.birthday}
                />
                {errors.birthday && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{errors.birthday}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender" className="text-xs font-bold uppercase tracking-widest text-slate-500">Kasarian</Label>
                <Select name="gender" value={data.gender || 'Prefer not to say'} onValueChange={(val) => onUpdate({ gender: val })}>
                  <SelectTrigger id="gender" className={errors.gender ? "border-destructive h-14" : "h-14"}>
                    <SelectValue placeholder="Pumili..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lalaki">Lalaki</SelectItem>
                    <SelectItem value="Babae">Babae</SelectItem>
                    <SelectItem value="Iba pa">Iba pa</SelectItem>
                    <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
                {errors.gender && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{errors.gender}</p>}
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={isLocalSubmitting || isLoading}
              className="w-full h-14 rounded-2xl text-base font-bold shadow-xl active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isLocalSubmitting || isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Susunod'}
            </Button>
          </form>
        </>
      )}

      {subStep === 'B' && (() => {
        const isBudgetMo = data.appId === 'budget-mo';
        return (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-1 mb-8">
              <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">
                {isBudgetMo ? 'Personal Budget Setup' : 'Lokasyon at Negosyo'}
              </h2>
              <p className="text-slate-600 text-sm font-medium">
                {isBudgetMo ? 'Mga detalye para sa iyong personal na badyet at ipon.' : 'Mga detalye ng iyong tindahan o negosyo.'}
              </p>
            </div>

            <form onSubmit={handleSubmitFinal} className="space-y-6">
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor="address" className="text-xs font-bold uppercase tracking-widest text-slate-500">Tirahan</Label>
                    <span className="text-[10px] text-slate-400 font-medium">Bahay No., Kalye, Barangay, Lungsod</span>
                  </div>
                  <Input 
                    id="address"
                    placeholder="Hal: 123 Rizal St., Brgy. San Jose"
                    value={data.address || ''}
                    onChange={(e) => onUpdate({ address: e.target.value })}
                    className={errors.address ? "border-destructive h-14" : "h-14"}
                  />
                  {errors.address && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{errors.address}</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor="businessName" className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      {isBudgetMo ? 'Pangalan ng Account / Budget Ledger' : 'Pangalan ng Negosyo'}
                    </Label>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {isBudgetMo ? 'Halimbawa: Aking Personal Budget / Pamilya Budget' : "Halimbawa: Aling Nena's Store"}
                    </span>
                  </div>
                  <Input 
                    id="businessName"
                    placeholder={isBudgetMo ? 'Halimbawa: Aking Personal Budget' : "Halimbawa: Aling Nena's Store"}
                    value={data.businessName || ''}
                    onChange={(e) => onUpdate({ businessName: e.target.value })}
                    className={errors.businessName ? "border-destructive h-14" : "h-14"}
                  />
                  {errors.businessName && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{errors.businessName}</p>}
                </div>

                {data.appId === 'benta-snap' && (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-0.5">
                      <Label htmlFor="businessProfile" className="text-xs font-bold uppercase tracking-widest text-slate-500">What type of business do you run?</Label>
                      <span className="text-[10px] text-slate-400 font-medium">Piliin ang uri ng negosyo para sa setup ng iyong account</span>
                    </div>
                    <Select
                      name="businessProfile"
                      value={data.businessProfile || 'general_retail'}
                      onValueChange={(val) => onUpdate({ businessProfile: val })}
                    >
                      <SelectTrigger id="businessProfile" className="h-14">
                        <SelectValue placeholder="Pumili ng uri..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general_retail">
                          <div className="flex flex-col text-left py-0.5">
                            <span className="font-black text-xs uppercase tracking-tight">GENERAL RETAIL</span>
                            <span className="text-[10px] text-slate-500 font-normal">Sari-sari stores, minimarts, groceries, clothing, convenience stores, and general merchandise.</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="fresh_goods">
                          <div className="flex flex-col text-left py-0.5">
                            <span className="font-black text-xs uppercase tracking-tight">FRESH GOODS</span>
                            <span className="text-[10px] text-slate-500 font-normal">Vegetables, fruit, meat, seafood, rice, grains, and other products commonly sold by weight or variable quantity.</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="hardware_supply">
                          <div className="flex flex-col text-left py-0.5">
                            <span className="font-black text-xs uppercase tracking-tight">HARDWARE &amp; SUPPLIES</span>
                            <span className="text-[10px] text-slate-500 font-normal">Hardware, construction materials, electrical and plumbing supplies, and products sold by piece, box, sack, meter, foot, or kilogram.</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

            <div className="space-y-3">
              <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full h-14 rounded-2xl text-base font-bold shadow-xl active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Tuloy Natin'}
              </Button>
              <Button 
                type="button" 
                variant="ghost"
                disabled={isLoading}
                onClick={() => {
                  setErrors({});
                  setSubStep('A');
                }}
                className="w-full h-12 rounded-xl text-slate-400 font-bold hover:text-slate-600 uppercase tracking-widest text-xs"
              >
                Bumalik
              </Button>
            </div>
          </form>
        </div>
      );
    })()}
    </div>
  );
}
