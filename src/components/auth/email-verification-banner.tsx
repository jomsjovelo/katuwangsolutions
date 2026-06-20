'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { sendEmailVerification } from 'firebase/auth';
import { AlertTriangle, MailCheck, Loader2 } from 'lucide-react';

export function EmailVerificationBanner() {
  const { user, loading } = useUser();
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Wait for loading or missing user to resolve before potentially returning null
  // We must define all hooks BEFORE any early returns!

  const handleResend = async () => {
    if (!user || cooldown > 0 || isSending) return;

    try {
      setIsSending(true);
      setMessage(null);
      await sendEmailVerification(user);
      setMessage({ type: 'success', text: 'Naipadala na ulit ang verification link. I-check ang inyong inbox.' });
      setCooldown(60);
    } catch (e) {
      const error = e as Error & { code?: string };
      if (error.code === 'auth/too-many-requests') {
        setMessage({ type: 'error', text: 'Masyadong maraming request. Subukan ulit mamaya.' });
      } else {
        setMessage({ type: 'error', text: 'May error sa pagpadala ng link. Subukan ulit.' });
      }
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Early return MUST be after all hooks!
  if (loading || !user || user.emailVerified) {
    return null;
  }

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-3 text-amber-900 text-sm font-medium z-50">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p>
            I-verify ang iyong email address para maprotektahan ang account. I-check ang <strong>{user.email}</strong> para sa aming link.
          </p>
        </div>
        
        <div className="flex items-center gap-4 shrink-0">
          {message && (
            <span className={`text-xs font-bold ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {message.text}
            </span>
          )}
          
          <button
            onClick={handleResend}
            disabled={isSending || cooldown > 0}
            className="flex items-center gap-1.5 bg-amber-200 hover:bg-amber-300 disabled:opacity-50 disabled:hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-lg font-bold transition-colors text-xs"
          >
            {isSending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : cooldown > 0 ? (
              `Magpadala Ulit (${cooldown}s)`
            ) : (
              <>
                <MailCheck className="h-3.5 w-3.5" />
                Magpadala Ulit
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
