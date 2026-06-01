"use client"

import React, { useState } from 'react';
import { ExternalLink, Copy, CheckCircle2 } from 'lucide-react';

const PAYMENT_NUMBER = '09951665423';
const ACCOUNT_NAME = 'Katuwang Solutions';
const FB_MESSENGER_URL = 'https://m.me/KatuwangSolutions';

interface PaymentStepProps {
  data: any;
  onPaymentSent: () => void;
}

export function PaymentStep({ data, onPaymentSent }: PaymentStepProps) {
  const [copiedGcash, setCopiedGcash] = useState(false);
  const [copiedMaya, setCopiedMaya] = useState(false);

  const copyNumber = (type: 'gcash' | 'maya') => {
    navigator.clipboard.writeText(PAYMENT_NUMBER);
    if (type === 'gcash') {
      setCopiedGcash(true);
      setTimeout(() => setCopiedGcash(false), 2500);
    } else {
      setCopiedMaya(true);
      setTimeout(() => setCopiedMaya(false), 2500);
    }
  };

  return (
    <div className="p-6 space-y-7 animate-in fade-in slide-in-from-right-4 duration-500 pb-12">

      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Complete Your Payment</h2>
        <p className="text-slate-600 text-sm font-medium">Send <strong>₱99.00</strong> via GCash or Maya to activate your account.</p>
      </div>

      {/* Amount Due Card */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex justify-between items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Amount Due</p>
          <p className="text-3xl font-black text-primary">₱99.00</p>
          <p className="text-[10px] text-slate-500 font-medium mt-0.5">per month · all 15 modules</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Business</p>
          <p className="text-sm font-bold text-slate-900">{data.businessName}</p>
        </div>
      </div>

      {/* Payment Options */}
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Payment Options</p>

        {/* GCash Card */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: '#00A3E0' }}>G</div>
            <span className="font-black uppercase tracking-wide text-sm" style={{ color: '#00A3E0' }}>GCash</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Account Name</p>
              <p className="font-bold text-slate-900 text-xs"><span translate="no" className="notranslate">{ACCOUNT_NAME}</span></p>
            </div>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">GCash Number</p>
            <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-blue-100">
              <span className="font-black text-xl tracking-wider text-slate-900">{PAYMENT_NUMBER}</span>
              <button onClick={() => copyNumber('gcash')} className="active:scale-90 transition-transform" style={{ color: '#00A3E0' }}>
                {copiedGcash
                  ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                  : <Copy className="h-5 w-5" />}
              </button>
            </div>
            {copiedGcash && <p className="text-[10px] text-green-600 font-bold mt-1">Copied to clipboard!</p>}
          </div>
        </div>

        {/* Maya Card */}
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: '#2ECC71' }}>M</div>
            <span className="font-black uppercase tracking-wide text-sm" style={{ color: '#27AE60' }}>Maya</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Account Name</p>
              <p className="font-bold text-slate-900 text-xs"><span translate="no" className="notranslate">{ACCOUNT_NAME}</span></p>
            </div>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Maya Number</p>
            <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-green-100">
              <span className="font-black text-xl tracking-wider text-slate-900">{PAYMENT_NUMBER}</span>
              <button onClick={() => copyNumber('maya')} className="active:scale-90 transition-transform text-green-600">
                {copiedMaya
                  ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                  : <Copy className="h-5 w-5" />}
              </button>
            </div>
            {copiedMaya && <p className="text-[10px] text-green-600 font-bold mt-1">Copied to clipboard!</p>}
          </div>
        </div>
      </div>

      {/* How-to Instructions */}
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">How to Confirm Payment</p>
        <div className="space-y-3">
          {[
            'Send ₱99.00 to the GCash or Maya number above.',
            'Take a screenshot of your payment confirmation.',
            'Send the screenshot to our Facebook Page via Messenger.',
            'We will activate your account within 24 hours.',
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
