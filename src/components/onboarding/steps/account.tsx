"use client"

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { AccountSchema } from '@/lib/schemas/onboarding';
import { getActiveAppById } from '@/lib/app-data';
import { getModulePricing, formatPesoWithCents } from '@/lib/pricing';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  const app = getActiveAppById(data.appId || '');
  const pricing = getModulePricing(data.appId || '');

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
      return; // Disabled button should prevent this, but just in case
    }
    
    setErrors({});
    onNext();
  };



  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Login Details</h2>
        <p className="text-slate-600 text-sm font-medium">Konting detalye na lang, pwede ka na mag-lista!</p>
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
                className={`pr-10 ${errors.password ? 'border-destructive' : ''}`}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                className={`pr-10 ${errors.confirmPassword ? 'border-destructive' : ''}`}
              />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
              I confirm that I am at least 18 years old, and I agree to the{' '}
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setIsTermsOpen(true);
                }}
                className="text-primary hover:underline font-bold"
              >
                Terms & Conditions
              </button>
              {' '}and Privacy Policy.
            </label>
            <p className="text-xs text-slate-500">
              Required to create a business account.
            </p>
          </div>
        </div>

        <Button 
          type="submit" 
          disabled={!data.termsAccepted || isLoading}
          className="w-full h-14 rounded-2xl text-base font-bold shadow-xl active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Gawa na ang Account'}
        </Button>
      </form>

      {/* ── Terms Sheet ── */}
      <Sheet open={isTermsOpen} onOpenChange={setIsTermsOpen}>
        <SheetContent side="bottom" className="h-[85vh] sm:h-[80vh] rounded-t-3xl flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b border-slate-100 text-left shrink-0">
            <SheetTitle className="text-2xl font-black text-slate-900 tracking-tight">Terms & Conditions</SheetTitle>
            <SheetDescription>
              Please read our terms before creating your Katuwang account.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 px-6 py-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-6 pb-8">
              <section>
                <h3 className="text-lg font-bold text-slate-900 mb-2">1. Acceptance of Terms</h3>
                <p className="text-slate-600">By accessing and using Katuwang Solutions, you agree to be bound by these Terms and Conditions. Our services are specifically designed for Micro, Small, and Medium Enterprises (MSMEs) operating in the Philippines. You must be at least 18 years old.</p>
              </section>
              <section>
                <h3 className="text-lg font-bold text-slate-900 mb-2">2. Account Security & Email Access</h3>
                <p className="text-slate-600">
                  We use email verification for password resets. <strong>If you lose access to your email address or forget its password, Katuwang Solutions is not responsible for the lost access to your account.</strong> We cannot manually bypass email verification for security reasons.
                </p>
              </section>
              <section>
                <h3 className="text-lg font-bold text-slate-900 mb-2">3. Offline Mode & Data Syncing</h3>
                <p className="text-slate-600">
                  Transactions made offline are saved locally on your device. <strong>If your device breaks, is lost, or its cache is cleared before syncing to the cloud, that data is permanently lost.</strong> We are not liable for unsynced data.
                </p>
              </section>
              <section>
                <h3 className="text-lg font-bold text-slate-900 mb-2">4. Data Accuracy & Staff Liability</h3>
                <p className="text-slate-600">
                  You are solely responsible for the accuracy of all data (sales, inventory, loans) entered into the app. Katuwang Solutions is a recording tool, not a lending agency or tax accountant. Business owners are strictly liable for the actions of their staff accounts.
                </p>
              </section>
              <section>
                <h3 className="text-lg font-bold text-slate-900 mb-2">5. Activity Logs & Data Retention</h3>
                <p className="text-slate-600">
                  To keep the app fast and organized, minor Activity Logs (e.g., recent sales, stock alerts) are only retained for a rolling window of <strong>7 days</strong>. Older logs are automatically hidden and overwritten.
                </p>
              </section>
              <section>
                <h3 className="text-lg font-bold text-slate-900 mb-2">6. Subscription</h3>
                <p className="text-slate-600">
                  <strong>Pricing:</strong> Access to {app?.name || 'the module'} is billed at {formatPesoWithCents(pricing.promotionalMonthlyPrice)} per month (Philippine Peso) on promo. (Regular rate: {formatPesoWithCents(pricing.regularMonthlyPrice)}).<br />
                  <strong>No Auto-Renew:</strong> We do not automatically charge your payment method. You must manually renew to continue.
                </p>
              </section>
            </div>
          </ScrollArea>
          <div className="p-4 border-t border-slate-100 bg-white shrink-0">
            <Button 
              type="button" 
              className="w-full h-14 rounded-2xl font-bold shadow-xl active:scale-[0.98] transition-transform"
              onClick={() => {
                onUpdate({ termsAccepted: true });
                setIsTermsOpen(false);
              }}
            >
              I Agree & Close
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
