"use client"

import React from 'react';
import { ExternalLink, Download } from 'lucide-react';
import Image from 'next/image';
import { getModulePricing, formatPesoWithCents, formatPeso } from '@/lib/pricing';

const FB_MESSENGER_URL = 'https://m.me/KatuwangSolutions';

interface PaymentStepProps {
  data: any;
  onPaymentSent: () => void;
}

export function PaymentStep({ data, onPaymentSent }: PaymentStepProps) {
  const pricing = getModulePricing(data.appId || '');

  const downloadQR = () => {
    const link = document.createElement('a');
    link.href = '/images/gcash-qr.jpg';
    link.download = 'Katuwang-QR-Code.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 space-y-7 animate-in fade-in slide-in-from-right-4 duration-500 pb-12">
      {/* Dynamic Pricing Logic */}
      {data.appId === 'budget-mo' ? (
        <div className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full inline-block mb-2 border border-amber-200">
          🎉 Special ₱50/mo Promo Applied!
        </div>
      ) : null}

      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Complete Your Payment</h2>
        <p className="text-slate-600 text-sm font-medium">Send <strong>{formatPesoWithCents(pricing.promotionalMonthlyPrice)}</strong> via GCash or Maya to activate your account.</p>
      </div>

      {/* Amount Due Card */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex justify-between items-center" data-testid="payment-amount-card">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Amount Due</p>
          <p className="text-3xl font-black text-primary" data-testid="payment-amount">{formatPesoWithCents(pricing.promotionalMonthlyPrice)}</p>
          <p className="text-[10px] text-slate-500 font-medium mt-0.5" data-testid="payment-per-module-label">{formatPeso(pricing.promotionalMonthlyPrice)}/buwan · bawat module</p>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1" data-testid="payment-clarification">Ang bayad na {formatPeso(pricing.promotionalMonthlyPrice)} ay para sa napili mong module.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Business</p>
          <p className="text-sm font-bold text-slate-900">{data.businessName}</p>
        </div>
      </div>

      {/* QR Code Section */}
      <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 flex flex-col items-center text-center space-y-4 shadow-sm">
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">Scan to Pay</p>
          <p className="text-xs text-slate-500 font-medium">Use this QR code for both GCash and Maya</p>
        </div>
        
        <div className="relative w-48 h-48 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 p-2 shadow-inner">
          <Image 
            src="/images/gcash-qr.jpg" 
            alt="Katuwang Solutions QR Code" 
            fill 
            className="object-contain"
            priority
            unoptimized
          />
        </div>

        <button 
          onClick={downloadQR}
          className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors bg-primary/5 px-4 py-2 rounded-lg"
        >
          <Download className="h-4 w-4" /> Download QR Code
        </button>
      </div>

      {/* How-to Instructions */}
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">How to Confirm Payment</p>
        <div className="space-y-3">
          {[
            'Scan or download the QR code above, then upload it in your GCash or Maya app.',
            `Input the exact amount: ${formatPesoWithCents(pricing.promotionalMonthlyPrice)}.`,
            'Take a screenshot of your payment confirmation.',
            'Send the screenshot AND your registered email address to our Facebook Page via Messenger.',
            'We will send you a message once your account is activated.',
          ].map((text, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="h-6 w-6 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
              <p className="text-sm text-slate-700 font-medium leading-snug">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Messenger CTA */}
      <a
        href={FB_MESSENGER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full h-14 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-xl"
        style={{ background: '#0099FF' }}
      >
        <ExternalLink className="h-5 w-5" />
        Send Screenshot on Messenger
      </a>

      {/* Already sent */}
      <button
        onClick={onPaymentSent}
        className="w-full text-center text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors py-2"
      >
        I've already sent my payment →
      </button>
    </div>
  );
}
