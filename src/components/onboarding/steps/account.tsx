"use client"

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';

import { AccountSchema } from '@/lib/schemas/onboarding';

interface AccountStepProps {
  data: any;
  onUpdate: (update: any) => void;
  onNext: () => void;
}

export function AccountStep({ data, onUpdate, onNext }: AccountStepProps) {
  const [errors, setErrors] = useState<any>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = AccountSchema.safeParse(data);
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

  const Field = ({ id, label, error, optional = false, children }: any) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-bold uppercase tracking-widest text-slate-500">
        {label}
        {optional && <span className="ml-1 font-normal normal-case text-slate-400">(Optional)</span>}
      </Label>
      {children}
      {error && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{error}</p>}
    </div>
  );

  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Login Details</h2>
        <p className="text-slate-600 text-sm font-medium">Konting detalye na lang, pwede ka na mag-lista!</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Login Credentials ── */}
        <div className="space-y-4">
          <Field id="email" label="Email Address" error={errors.email}>
            <Input
              id="email"
              type="email"
              placeholder="example@email.com"
              value={data.email || ''}
              onChange={(e) => onUpdate({ email: e.target.value })}
              className={errors.email ? 'border-destructive' : ''}
            />
          </Field>

          <Field id="password" label="Password" error={errors.password}>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters with a number"
                value={data.password || ''}
                onChange={(e) => onUpdate({ password: e.target.value })}
                className={`pr-10 ${errors.password ? 'border-destructive' : ''}`}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
        </div>

        <Button type="submit" className="w-full h-14 rounded-2xl text-base font-bold shadow-xl active:scale-[0.98] transition-transform">
          Gawa na ang Account
        </Button>
      </form>
    </div>
  );
}
