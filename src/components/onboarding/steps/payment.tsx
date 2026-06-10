"use client"

import React, { useState } from 'react';
import { ExternalLink, Copy, CheckCircle2, Download } from 'lucide-react';
import Image from 'next/image';

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

      {/* Manual Options (Collapsed/Secondary) */}
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Or Pay via Mobile Number</p>

        {/* GCash Card */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded flex items-center justify-center font-black text-[10px] text-white" style={{ background: '#00A3E0' }}>G</div>
              <span className="font-black uppercase tracking-wide text-xs" style={{ color: '#00A3E0' }}>GCash</span>
            </div>
            <p className="font-bold text-slate-900 text-xs"><span translate="no" className="notranslate">{ACCOUNT_NAME}</span></p>
          </div>
          <div className="flex items-center justify-between bg-white rounded-xl px-4 py-2 border border-blue-100">
            <span className="font-black text-lg tracking-wider text-slate-900">{PAYMENT_NUMBER}</span>
            <button onClick={() => copyNumber('gcash')} className="active:scale-90 transition-transform" style={{ color: '#00A3E0' }}>
              {copiedGcash ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Maya Card */}
        <div className="bg-green-50 border border-green-100 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded flex items-center justify-center font-black text-[10px] text-white" style={{ background: '#2ECC71' }}>M</div>
              <span className="font-black uppercase tracking-wide text-xs" style={{ color: '#27AE60' }}>Maya</span>
            </div>
            <p className="font-bold text-slate-900 text-xs"><span translate="no" className="notranslate">{ACCOUNT_NAME}</span></p>
          </div>
          <div className="flex items-center justify-between bg-white rounded-xl px-4 py-2 border border-green-100">
            <span className="font-black text-lg tracking-wider text-slate-900">{PAYMENT_NUMBER}</span>
            <button onClick={() => copyNumber('maya')} className="active:scale-90 transition-transform text-green-600">
              {copiedMaya ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* How-to Instructions */}
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">How to Confirm Payment</p>
        <div className="space-y-3">
          {[
            'Scan or download the QR code above, then upload it in your GCash or Maya app.',
            'Input the exact amount: ₱99.00.',
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
