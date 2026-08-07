'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { FirebaseError } from 'firebase/app';
import { Loader2, LogIn, ArrowLeft, UserCheck } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { StaffLoginModal } from '@/components/auth/staff-login-modal';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { loginUser } from '@/firebase/firestore/staff-actions';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingCode = searchParams?.get('ref') || searchParams?.get('code') || '';
  
  const [authError, setAuthError] = useState<string | null>(null);
  const [showStaffModal, setShowStaffModal] = useState(false);
  
  // Forgot Password States
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      setAuthError(null);
      await loginUser(data.email, data.password);
      
      // Force a hard navigation to dashboard to guarantee AuthGuard sees the clean persisted auth state
      window.location.href = '/dashboard';
    } catch (e) {
      const error = e as Error & { code?: string };
      if (error instanceof FirebaseError) {
        switch (error.code) {
          case 'auth/invalid-credential':
            setAuthError('Invalid email or password.');
            break;
          case 'auth/too-many-requests':
            setAuthError('Too many failed attempts. Please try again later.');
            break;
          default:
            setAuthError('An error occurred during login.');
        }
      } else {
        setAuthError(error.message || 'Network error. Please check your connection.');
      }
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || !resetEmail.includes('@')) {
      setResetMessage({ type: 'error', text: 'Mangyaring maglagay ng valid na email address.' });
      return;
    }
    
    try {
      setResetLoading(true);
      setResetMessage(null);
      // Using custom backend password reset email sender
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      if (!res.ok) {
        throw new Error('Failed to send reset email');
      }
      setResetMessage({ 
        type: 'success', 
        text: `Nagpadala na kami ng reset link sa ${resetEmail}. I-check ang inyong inbox at spam folder.` 
      });
      setResetEmail('');
    } catch (e) {
      const error = e as Error & { code?: string };
      setResetMessage({ 
        type: 'error', 
        text: 'Maaaring hindi nakarehistro ang email na ito, o may error sa network.' 
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-8">
      {/* Back to Home Link */}
      <div className="w-full max-w-md mb-6">
        <Link 
          href="/" 
          className="inline-flex items-center text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Bumalik sa Home
        </Link>
      </div>

      <div className="w-full max-w-md bg-white rounded-[32px] p-8 sm:p-10 border border-slate-100 shadow-2xl shadow-slate-200/50 relative overflow-hidden">
        {/* Subtle top gradient decoration */}
        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-primary/80 to-teal-400/80" />

        <div className="flex flex-col items-center text-center space-y-4 mb-8">
          <div className="p-3 bg-primary/5 rounded-full mb-2">
            <BrandLogo showText={false} className="!h-12 !w-12 sm:!h-14 sm:!w-14" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black font-headline uppercase tracking-tight text-slate-900">
              {view === 'login' ? 'Magsimula Na' : 'I-reset ang Password'}
            </h1>
            <p className="text-slate-500 font-medium mt-2 text-sm max-w-[280px] mx-auto">
              {view === 'login' 
                ? 'I-enter ang inyong account details upang makapasok sa Katuwang Environment.'
                : 'I-enter ang inyong email at padadalhan ka namin ng link para mag-set ng bagong password.'}
            </p>
          </div>
        </div>

        {view === 'forgot' ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {resetMessage && (
              <Alert 
                variant={resetMessage.type === 'error' ? 'destructive' : 'default'} 
                className={`mb-6 border-none ${resetMessage.type === 'error' ? 'bg-destructive/10' : 'bg-emerald-50 text-emerald-800'}`}
              >
                <AlertDescription className="font-bold text-center">
                  {resetMessage.text}
                </AlertDescription>
              </Alert>
            )}
            
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Email Address</label>
                <Input 
                  type="email"
                  placeholder="pangalan@negosyo.com" 
                  autoComplete="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="h-14 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2 px-4" 
                  disabled={resetLoading}
                />
              </div>
              
              <div className="pt-6 space-y-3">
                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-base font-bold shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                  disabled={resetLoading}
                >
                  {resetLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    'Magpadala ng Reset Link'
                  )}
                </Button>
                
                <Button 
                  type="button" 
                  variant="ghost"
                  className="w-full h-12 text-slate-500 font-bold hover:text-slate-700"
                  onClick={() => {
                    setView('login');
                    setResetMessage(null);
                  }}
                  disabled={resetLoading}
                >
                  Bumalik sa Login
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            {authError && (
              <Alert variant="destructive" className="mb-6 bg-destructive/10 border-none">
                <AlertDescription className="font-bold text-center">
                  {authError}
                </AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Email Address</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="pangalan@negosyo.com" 
                          autoComplete="email"
                          className="h-14 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2 px-4" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage className="text-xs font-bold" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Password</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="••••••••" 
                          autoComplete="current-password"
                          className="h-14 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2 px-4" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage className="text-xs font-bold" />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setView('forgot')}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Nakalimutan ang password?
                  </button>
                </div>
                
                <div className="pt-4 space-y-4">
                  <Button 
                    type="submit" 
                    className="w-full h-14 rounded-xl text-base font-bold shadow-lg hover:shadow-xl transition-all joy-glow active:scale-95 flex items-center justify-center gap-2"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <LogIn className="h-5 w-5" />
                        Mag-Login
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>

            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => setShowStaffModal(true)}
                className="w-full h-12 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center gap-2 border border-blue-200 transition-colors"
              >
                <UserCheck className="w-4 h-4" />
                Staff / Cashier Login (PIN)
              </button>

              <p className="text-xs font-medium text-slate-500 pt-2">
                Wala pang account? 
              </p>
              <Button 
                variant="outline" 
                className="w-full h-12 rounded-xl border-dashed border-slate-300 text-slate-600 font-bold active:scale-95 transition-transform"
                onClick={() => {
                  router.push(`/onboarding${existingCode ? `?code=${existingCode}` : ''}`);
                }}
              >
                Gumawa ng Account
              </Button>
            </div>
          </div>
        )}
      </div>

      <StaffLoginModal 
        isOpen={showStaffModal} 
        onClose={() => setShowStaffModal(false)} 
        initialBusinessCode={existingCode}
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginContent />
    </React.Suspense>
  );
}
