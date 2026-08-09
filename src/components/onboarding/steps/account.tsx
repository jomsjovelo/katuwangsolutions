"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { AccountSchema } from '@/lib/schemas/onboarding';

interface AccountStepProps {
  data: any;
  onUpdate: (update: any) => void;
  onNext: () => void;
  isLoading?: boolean;
}

export function AccountStep({ data, onUpdate, onNext, isLoading }: AccountStepProps) {
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
    
    if (!data.termsAccepted) {
      return;
    }
    
    setErrors({});
    onNext();
  };

  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Gumawa ng Account</h2>
        <p className="text-slate-600 text-sm font-medium">
          Gumawa ng login. Pagkatapos nito, makikita mo ang payment instructions. Maa-activate lamang ang module pagkatapos ma-verify ang payment.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Login Credentials ── */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="example@email.com"
              value={data.email || ''}
              onChange={(e) => onUpdate({ email: e.target.value })}
              className={errors.email ? 'border-destructive' : ''}
            />
            {errors.email && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters with a number"
                value={data.password || ''}
                onChange={(e) => onUpdate({ password: e.target.value })}
                className={`pr-12 ${errors.password ? 'border-destructive' : ''}`}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Itago ang password' : 'Ipakita ang password'}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.password && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{errors.password}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Confirm Password
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Re-type your password"
                value={data.confirmPassword || ''}
                onChange={(e) => onUpdate({ confirmPassword: e.target.value })}
                className={`pr-12 ${errors.confirmPassword ? 'border-destructive' : ''}`}
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? 'Itago ang kumpirmasyon ng password' : 'Ipakita ang kumpirmasyon ng password'}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">{errors.confirmPassword}</p>}
          </div>
        </div>

        {/* ── Terms & Conditions Checkbox ── */}
        <div className="flex items-start space-x-3 bg-slate-100 p-4 rounded-xl border border-slate-200">
          <Checkbox 
            id="terms" 
            checked={data.termsAccepted} 
            onCheckedChange={(checked) => onUpdate({ termsAccepted: checked as boolean })}
            className="mt-1"
          />
          <div className="grid gap-1.5 leading-none">
            <label
              htmlFor="terms"
              className="text-sm font-medium leading-snug text-slate-700 cursor-pointer"
            >
              I confirm that I am at least 18 years old and agree to the{' '}
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-0.5"
              >
                Terms &amp; Conditions
              </Link>
              {' '}and{' '}
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-0.5"
              >
                Privacy Policy
              </Link>.
            </label>
            <p className="text-xs text-slate-500">
              Basahin ang dalawang dokumento bago gumawa ng account.
            </p>
          </div>
        </div>

        <Button 
          type="submit" 
          disabled={!data.termsAccepted || isLoading}
          className="w-full h-14 rounded-2xl text-base font-bold shadow-xl active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100 min-h-[44px]"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Gumawa ng Account at Magpatuloy sa Payment'}
        </Button>
      </form>
    </div>
  );
}
