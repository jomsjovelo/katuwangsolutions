"use client"

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="birthday" className="text-xs font-bold uppercase tracking-widest text-slate-500">Birthday (18+)</Label>
              <Input 
                id="birthday"
                type="date"
                value={data.birthday || ''}
                onChange={(e) => onUpdate({ birthday: e.target.value })}
                className={errors.birthday ? "border-destructive" : ""}
              />
              {errors.birthday && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{errors.birthday}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender" className="text-xs font-bold uppercase tracking-widest text-slate-500">Gender</Label>
              <Select value={data.gender || 'Prefer not to say'} onValueChange={(val) => onUpdate({ gender: val })}>
                <SelectTrigger className={errors.gender ? "border-destructive" : ""}>
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

          <div className="space-y-2">
            <Label htmlFor="address" className="text-xs font-bold uppercase tracking-widest text-slate-500">Kumpletong Address</Label>
            <Input 
              id="address"
              placeholder="House No., Street, Brgy., City, Province"
              value={data.address || ''}
              onChange={(e) => onUpdate({ address: e.target.value })}
              className={errors.address ? "border-destructive" : ""}
            />
            {errors.address && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{errors.address}</p>}
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
