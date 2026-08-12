import React, { useState } from 'react';
import { ExternalLink, Copy, Check, AlertTriangle, MailCheck, Loader2 } from 'lucide-react';
import { getModulePricing, formatPesoWithCents, formatPeso } from '@/lib/pricing';
import { getActiveAppById } from '@/lib/app-data';
import { trackPaymentMessengerClick, trackPaymentMarkedSent } from '@/lib/conversion-events';
import { getAuth } from 'firebase/auth';
import { app } from '@/firebase/config';

const FB_MESSENGER_BASE = 'https://m.me/katuwangsolutions';
const PAYMENT_NUMBER = '09951665423';
const PAYMENT_NUMBER_DISPLAY = '0995 166 5423';

interface PaymentStepProps {
  data: any;
  emailDeliveryFailed?: boolean;
  onPaymentSent: () => void;
  trackerSet?: Set<string>;
}

export function PaymentStep({ data, emailDeliveryFailed, onPaymentSent, trackerSet }: PaymentStepProps) {
  const pricing = getModulePricing(data.appId || '');
  const appModule = getActiveAppById(data.appId || '');
  const [gcashStatus, setGcashStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [mayaStatus, setMayaStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const [isSending, setIsSending] = useState(false);
  const [resendStatus, setResendStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const handleResendVerification = async () => {
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user || isSending || cooldown > 0) return;

    try {
      setIsSending(true);
      setResendStatus(null);
      const idToken = await user.getIdToken();
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ email: user.email }),
      });

      if (!res.ok) {
        throw new Error('Failed to send verification email');
      }

      setResendStatus({ type: 'success', text: 'Naipadala na ulit ang verification link!' });
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch {
      setResendStatus({ type: 'error', text: 'May kaunting problema sa pagpapadala ng link. Subukan ulit mamaya.' });
    } finally {
      setIsSending(false);
    }
  };

  const copyNumber = async (type: 'gcash' | 'maya') => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(PAYMENT_NUMBER);
      if (type === 'gcash') {
        setGcashStatus('success');
        setTimeout(() => setGcashStatus('idle'), 2500);
      } else {
        setMayaStatus('success');
        setTimeout(() => setMayaStatus('idle'), 2500);
      }
    } catch {
      if (type === 'gcash') {
        setGcashStatus('error');
        setTimeout(() => setGcashStatus('idle'), 4000);
      } else {
        setMayaStatus('error');
        setTimeout(() => setMayaStatus('idle'), 4000);
      }
    }
  };

  const messengerMessage = [
    'Bayad ko na po!',
    '',
    `Pangalan: ${data.fullName || ''}`,
    `Email: ${data.email || ''}`,
    `Negosyo: ${data.businessName || ''}`,
    `Module: ${appModule?.name || data.appId}`,
    `Halaga: ${formatPesoWithCents(pricing.promotionalMonthlyPrice)}`,
    '',
    '(Screenshot attached below 👇)',
  ].join('\n');

  const messengerUrl = `${FB_MESSENGER_BASE}?text=${encodeURIComponent(messengerMessage)}`;

  return (
    <div className="p-6 space-y-7 animate-in fade-in slide-in-from-right-4 duration-500 pb-12">
      {/* Email Delivery Advisory Banner */}
      {emailDeliveryFailed && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <p className="text-xs font-bold text-amber-900">
                Nagawa na ang iyong account! Subalit may kaunting delay sa pagpapadala ng verification email sa <strong>{data.email}</strong>.
              </p>
              <p className="text-[11px] text-amber-800 font-medium">
                Huwag mag-alala, maaari mo pa ring ituloy ang payment ngayon. Pagkatapos magbayad, maaari mong i-click ang button sa ibaba para magpadala ulit.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1 border-t border-amber-200/60">
            {resendStatus ? (
              <span className={`text-xs font-bold ${resendStatus.type === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                {resendStatus.text}
              </span>
            ) : (
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                Resend Verification Link
              </span>
            )}
            <button
              onClick={handleResendVerification}
              disabled={isSending || cooldown > 0}
              className="flex items-center gap-1.5 bg-amber-200 hover:bg-amber-300 disabled:opacity-50 text-amber-900 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-colors shrink-0 min-h-[44px]"
            >
              {isSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : cooldown > 0 ? (
                `Mag-antay (${cooldown}s)`
              ) : (
                <>
                  <MailCheck className="h-3.5 w-3.5" />
                  Magpadala Ulit
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Pricing Badge */}
      {data.appId === 'budget-mo' ? (
        <div className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full inline-block border border-amber-200">
          🎉 Special ₱50/mo Promo Applied!
        </div>
      ) : null}

      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Mga Tagubilin sa Pagbabayad</h2>
        <p className="text-slate-600 text-sm font-medium">
          Magbayad ng <strong>{formatPesoWithCents(pricing.promotionalMonthlyPrice)}</strong> gamit ang GCash o Maya. Pagkatapos, ipadala ang payment screenshot sa Messenger. Ia-activate ang napiling module matapos ma-verify ang payment.
        </p>
      </div>

      {/* Compact Journey Explanation */}
      <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 flex items-center justify-between flex-wrap gap-1 text-center" data-testid="payment-journey-banner">
        <span>Account created</span>
        <span className="text-slate-400">→</span>
        <span>Magbayad</span>
        <span className="text-slate-400">→</span>
        <span>Iva-verify ang payment</span>
        <span className="text-slate-400">→</span>
        <span>Ia-activate ang module</span>
      </div>

      {/* Amount Due Card */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex justify-between items-center" data-testid="payment-amount-card">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Amount Due</p>
          <p className="text-3xl font-black text-primary" data-testid="payment-amount">{formatPesoWithCents(pricing.promotionalMonthlyPrice)}</p>
          <p className="text-[10px] text-slate-500 font-medium mt-0.5" data-testid="payment-per-module-label">
            {formatPeso(pricing.promotionalMonthlyPrice)}/buwan · bawat module
          </p>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1" data-testid="payment-clarification">
            Ang bayad na {formatPeso(pricing.promotionalMonthlyPrice)} ay para sa napili mong module.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Business</p>
          <p className="text-sm font-bold text-slate-900">{data.businessName}</p>
        </div>
      </div>

      {/* Payment Number Cards */}
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Send Payment To</p>
        <div className="grid grid-cols-2 gap-3">

          {/* GCash Card */}
          <div className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-4 flex flex-col items-center text-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-[#007DFE] flex items-center justify-center shrink-0">
                <span className="text-white text-[8px] font-black">G</span>
              </div>
              <span className="text-sm font-black text-[#007DFE] uppercase tracking-wide">GCash</span>
            </div>
            <p className="text-base font-black text-slate-900 tracking-widest leading-tight tabular-nums" data-testid="gcash-number">
              {PAYMENT_NUMBER_DISPLAY}
            </p>
            <button
              onClick={() => copyNumber('gcash')}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg w-full justify-center transition-all duration-200 active:scale-95 min-h-[44px] ${
                gcashStatus === 'success'
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : gcashStatus === 'error'
                  ? 'bg-red-100 text-red-700 border border-red-200'
                  : 'bg-[#007DFE] text-white hover:bg-blue-700'
              }`}
            >
              {gcashStatus === 'success' ? (
                <><Check className="h-3 w-3" /> Copied!</>
              ) : (
                <><Copy className="h-3 w-3" /> Copy Number</>
              )}
            </button>
            <div aria-live="polite" className="w-full text-center">
              {gcashStatus === 'error' && (
                <p className="text-[10px] font-medium text-red-600 leading-tight mt-1" data-testid="gcash-copy-error">
                  Hindi nakopya. Pindutin nang matagal ang numero para piliin at kopyahin.
                </p>
              )}
            </div>
          </div>

          {/* Maya Card */}
          <div className="bg-green-50 border-2 border-green-100 rounded-2xl p-4 flex flex-col items-center text-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-[#00A14B] flex items-center justify-center shrink-0">
                <span className="text-white text-[8px] font-black">M</span>
              </div>
              <span className="text-sm font-black text-[#00A14B] uppercase tracking-wide">Maya</span>
            </div>
            <p className="text-base font-black text-slate-900 tracking-widest leading-tight tabular-nums" data-testid="maya-number">
              {PAYMENT_NUMBER_DISPLAY}
            </p>
            <button
              onClick={() => copyNumber('maya')}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg w-full justify-center transition-all duration-200 active:scale-95 min-h-[44px] ${
                mayaStatus === 'success'
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : mayaStatus === 'error'
                  ? 'bg-red-100 text-red-700 border border-red-200'
                  : 'bg-[#00A14B] text-white hover:bg-green-700'
              }`}
            >
              {mayaStatus === 'success' ? (
                <><Check className="h-3 w-3" /> Copied!</>
              ) : (
                <><Copy className="h-3 w-3" /> Copy Number</>
              )}
            </button>
            <div aria-live="polite" className="w-full text-center">
              {mayaStatus === 'error' && (
                <p className="text-[10px] font-medium text-red-600 leading-tight mt-1" data-testid="maya-copy-error">
                  Hindi nakopya. Pindutin nang matagal ang numero para piliin at kopyahin.
                </p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Streamlined Instructions */}
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Paano Magbayad</p>
        <div className="space-y-3">
          {[
            'Buksan ang GCash o Maya → i-tap ang Send Money → i-paste ang numero sa itaas.',
            `Ipasok ang eksaktong halaga: ${formatPesoWithCents(pricing.promotionalMonthlyPrice)}.`,
            'Kumuha ng screenshot ng kumpirmasyon, pagkatapos ay ipadala ito sa amin sa Messenger sa ibaba — naka-prefill na ang iyong mga detalye!',
          ].map((text, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="h-6 w-6 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </div>
              <p className="text-sm text-slate-700 font-medium leading-snug">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Clarification Disclaimer */}
      <p className="text-xs text-slate-500 text-center font-medium leading-relaxed" data-testid="payment-verification-disclaimer">
        Manual ang verification. Ang pagpapadala ng screenshot o pag-click sa button sa ibaba ay hindi pa kumpirmasyon na verified ang payment o active na ang module.
      </p>

      {/* Messenger CTA */}
      <a
        href={messengerUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackPaymentMessengerClick(data.appId)}
        className="w-full h-14 min-h-[44px] rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-xl px-4 text-center"
        style={{ background: '#0099FF' }}
      >
        <ExternalLink className="h-5 w-5 shrink-0" />
        Buksan ang Messenger at Ipadala ang Screenshot
      </a>

      {/* Already sent */}
      <button
        onClick={() => {
          trackPaymentMarkedSent(data.appId, trackerSet);
          onPaymentSent();
        }}
        className="w-full text-center text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors py-2 h-11 min-h-[44px] flex items-center justify-center"
      >
        Naipadala ko na sa Messenger
      </button>
    </div>
  );
}
