'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, ArrowRight, ShieldCheck } from 'lucide-react';

function AuthActionHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For Reset Password
  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!mode || !oobCode) {
      setError('Invalid link. Walang action mode o verification code na natagpuan.');
      setLoading(false);
      return;
    }

    const { auth } = initializeFirebase();

    const handleVerifyEmail = async () => {
      try {
        await applyActionCode(auth, oobCode);
        setSuccess(true);
      } catch (e) {
      const err = e as Error & { code?: string };
        if (err.code === 'auth/invalid-action-code' || err.code === 'auth/expired-action-code') {
          setError('Ang link na ito ay expired na o nagamit na.');
        } else {
          setError('May error na naganap: ' + err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    const handleVerifyResetCode = async () => {
      try {
        const email = await verifyPasswordResetCode(auth, oobCode);
        setResetEmail(email);
      } catch (e) {
      const err = e as Error & { code?: string };
        if (err.code === 'auth/invalid-action-code' || err.code === 'auth/expired-action-code') {
          setError('Ang link na ito ay expired na o nagamit na.');
        } else {
          setError('May error na naganap: ' + err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    if (mode === 'verifyEmail') {
      handleVerifyEmail();
    } else if (mode === 'resetPassword') {
      handleVerifyResetCode();
    } else {
      setError('Hindi suportadong action mode.');
      setLoading(false);
    }
  }, [mode, oobCode]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError('Ang password ay dapat hindi bababa sa 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Hindi magkapareho ang passwords.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const { auth } = initializeFirebase();
      await confirmPasswordReset(auth, oobCode!, newPassword);
      setSuccess(true);
    } catch (e) {
      const err = e as Error & { code?: string };
      setError('Nabigo ang pag-reset ng password. Maaaring expired na ang link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center space-y-4 py-8">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Pinoproseso...</p>
        </div>
      );
    }

    if (error && !success) {
      return (
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900">Invalid Link</h2>
            <p className="text-slate-500">{error}</p>
          </div>
          <Button 
            className="w-full h-14 rounded-xl font-bold" 
            onClick={() => router.push('/')}
          >
            Bumalik sa Homepage
          </Button>
        </div>
      );
    }

    if (mode === 'verifyEmail') {
      return (
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="h-20 w-20 bg-emerald-100 rounded-full flex items-center justify-center">
            <ShieldCheck className="h-10 w-10 text-emerald-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900">Verified na ang iyong Email!</h2>
            <p className="text-slate-500">Salamat sa pag-verify. Ligtas na ang iyong Katuwang account.</p>
          </div>
          <Button 
            className="w-full h-14 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20" 
            onClick={() => router.push('/dashboard')}
          >
            Pumunta sa Dashboard
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      );
    }

    if (mode === 'resetPassword') {
      if (success) {
        return (
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="h-20 w-20 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-900">Password Reset Successful!</h2>
              <p className="text-slate-500">Na-update na ang iyong password. Maaari ka nang mag-login.</p>
            </div>
            <Button 
              className="w-full h-14 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20" 
              onClick={() => router.push('/?login=true')}
            >
              Mag-Login
            </Button>
          </div>
        );
      }

      return (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black text-slate-900">I-reset ang Password</h2>
            <p className="text-slate-500">
              Gumawa ng bagong password para sa <br/>
              <span className="font-bold text-slate-700">{resetEmail}</span>
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="bg-destructive/10 border-none">
              <AlertDescription className="font-bold">{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Bagong Password</label>
              <Input 
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-14 rounded-xl bg-slate-50 border-slate-200"
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400">I-type Ulit ang Password</label>
              <Input 
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-14 rounded-xl bg-slate-50 border-slate-200"
                placeholder="••••••••"
              />
            </div>
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full h-14 rounded-xl font-bold shadow-lg mt-4"
            >
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'I-save ang Bagong Password'}
            </Button>
          </form>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[32px] p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="flex justify-center mb-8">
          <BrandLogo showText={true} />
        </div>
        {renderContent()}
      </div>
    </div>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    }>
      <AuthActionHandler />
    </Suspense>
  );
}
