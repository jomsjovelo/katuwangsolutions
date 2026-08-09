"use client"

import React, { useState } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { getModulePricing, formatPesoWithCents, formatPeso } from '@/lib/pricing';
import { getActiveAppById } from '@/lib/app-data';
import { trackPaymentMessengerClick, trackPaymentMarkedSent } from '@/lib/conversion-events';

const FB_MESSENGER_BASE = 'https://m.me/katuwangsolutions';
const PAYMENT_NUMBER = '09951665423';
const PAYMENT_NUMBER_DISPLAY = '0995 166 5423';

interface PaymentStepProps {
  data: any;
  onPaymentSent: () => void;
  trackerSet?: Set<string>;
}

export function PaymentStep({ data, onPaymentSent, trackerSet }: PaymentStepProps) {
  const pricing = getModulePricing(data.appId || '');
  const app = getActiveAppById(data.appId || '');
  const [gcashCopied, setGcashCopied] = useState(false);
  const [mayaCopied, setMayaCopied] = useState(false);

  const copyNumber = (type: 'gcash' | 'maya') => {
    navigator.clipboard.writeText(PAYMENT_NUMBER).catch(() => {});
    if (type === 'gcash') {
      setGcashCopied(true);
      setTimeout(() => setGcashCopied(false), 2500);
    } else {
      setMayaCopied(true);
      setTimeout(() => setMayaCopied(false), 2500);
    }
  };

  const messengerMessage = [
    'Bayad ko na po!',
    '',
    `Pangalan: ${data.fullName || ''}`,
    `Email: ${data.email || ''}`,
    `Negosyo: ${data.businessName || ''}`,
    `Module: ${app?.name || data.appId}`,
    `Halaga: ${formatPesoWithCents(pricing.promotionalMonthlyPrice)}`,
    '',
    '(Screenshot attached below 👇)',
  ].join('\n');

  const messengerUrl = `${FB_MESSENGER_BASE}?text=${encodeURIComponent(messengerMessage)}`;

  return (
    <div className="p-6 space-y-7 animate-in fade-in slide-in-from-right-4 duration-500 pb-12">
      {/* Dynamic Pricing Badge */}
      {data.appId === 'budget-mo' ? (
        <div className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full inline-block border border-amber-200">
          🎉 Special ₱50/mo Promo Applied!
        </div>
      ) : null}

      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Complete Your Payment</h2>
        <p className="text-slate-600 text-sm font-medium">
          Send <strong>{formatPesoWithCents(pricing.promotionalMonthlyPrice)}</strong> via GCash or Maya to activate your account.
        </p>
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
            <p className="text-base font-black text-slate-900 tracking-widest leading-tight tabular-nums">
              {PAYMENT_NUMBER_DISPLAY}
            </p>
            <button
              onClick={() => copyNumber('gcash')}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg w-full justify-center transition-all duration-200 active:scale-95 min-h-[44px] ${
                gcashCopied
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : 'bg-[#007DFE] text-white hover:bg-blue-700'
              }`}
            >
              {gcashCopied
                ? <><Check className="h-3 w-3" /> Copied!</>
                : <><Copy className="h-3 w-3" /> Copy Number</>
              }
            </button>
          </div>

          {/* Maya Card */}
          <div className="bg-green-50 border-2 border-green-100 rounded-2xl p-4 flex flex-col items-center text-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-[#00A14B] flex items-center justify-center shrink-0">
                <span className="text-white text-[8px] font-black">M</span>
              </div>
              <span className="text-sm font-black text-[#00A14B] uppercase tracking-wide">Maya</span>
            </div>
            <p className="text-base font-black text-slate-900 tracking-widest leading-tight tabular-nums">
              {PAYMENT_NUMBER_DISPLAY}
            </p>
            <button
              onClick={() => copyNumber('maya')}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg w-full justify-center transition-all duration-200 active:scale-95 min-h-[44px] ${
                mayaCopied
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : 'bg-[#00A14B] text-white hover:bg-green-700'
              }`}
            >
              {mayaCopied
                ? <><Check className="h-3 w-3" /> Copied!</>
                : <><Copy className="h-3 w-3" /> Copy Number</>
              }
            </button>
          </div>

        </div>
      </div>

      {/* Streamlined Instructions */}
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">How to Pay</p>
        <div className="space-y-3">
          {[
            'Open GCash or Maya → tap Send Money → paste the number above.',
            `Enter the exact amount: ${formatPesoWithCents(pricing.promotionalMonthlyPrice)}.`,
            'Take a screenshot of your confirmation, then send it to us on Messenger below — your details will be pre-filled!',
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

      {/* Messenger CTA */}
      <a
        href={messengerUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackPaymentMessengerClick(data.appId)}
        className="w-full h-14 min-h-[44px] rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-xl"
        style={{ background: '#0099FF' }}
      >
        <ExternalLink className="h-5 w-5" />
        Send Screenshot on Messenger
      </a>

      {/* Already sent */}
      <button
        onClick={() => {
          trackPaymentMarkedSent(data.appId, trackerSet);
          onPaymentSent();
        }}
        className="w-full text-center text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors py-2 h-11 min-h-[44px] flex items-center justify-center"
      >
        Naipadala ko na ang payment screenshot →
      </button>
    </div>
  );
}
