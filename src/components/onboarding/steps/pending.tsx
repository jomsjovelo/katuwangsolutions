"use client"

import React from 'react';
import { Clock, ExternalLink } from 'lucide-react';

const FB_MESSENGER_URL = 'https://m.me/KatuwangSolutions';
const PAYMENT_NUMBER = '09951665423';

interface PendingStepProps {
  data: any;
}

export function PendingStep({ data }: PendingStepProps) {
  return (
    <div className="p-6 flex flex-col items-center justify-center text-center space-y-8 animate-in zoom-in-95 duration-500 min-h-[80vh]">

      {/* Icon */}
      <div className="relative">
        <div className="absolute inset-0 bg-amber-100 rounded-full blur-3xl opacity-70" />
        <div className="relative bg-white h-24 w-24 rounded-full flex items-center justify-center shadow-xl border border-slate-100">
          <Clock className="h-10 w-10 text-amber-500" />
        </div>
      </div>

      {/* Heading */}
      <div className="space-y-3 max-w-xs mx-auto">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Pending Activation</h2>
        <p className="text-slate-600 text-sm font-medium leading-relaxed">
          Thank you, <strong>{data.fullName || data.businessName}!</strong> We have received your registration.
        </p>
        <p className="text-slate-500 text-sm font-medium leading-relaxed">
          Once we verify your payment on Messenger, we'll unlock your access — typically <strong>within 24 hours</strong>.
        </p>
      </div>

      {/* What to Expect Card */}
      <div className="w-full bg-amber-50 border border-amber-100 rounded-3xl p-5 text-left space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">What to expect next</p>
        <ul className="space-y-2.5">
          {[
            "We'll review your payment screenshot on Messenger.",
            "Your account will be manually activated by our team.",
            "You'll receive a confirmation once your access is live.",
          ].map((item, i) => (
            <li key={i} className="flex gap-2.5 items-start text-sm text-amber-900 font-medium">
              <span className="text-amber-400 mt-0.5 font-black">•</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Messenger Follow-up */}
      <div className="w-full space-y-3">
        <a
          href={FB_MESSENGER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full h-14 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-xl"
          style={{ background: '#0099FF' }}
        >
          <ExternalLink className="h-5 w-5" />
          Contact Us on Messenger
        </a>
        <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
          <span translate="no" className="notranslate">Katuwang Solutions</span> · {PAYMENT_NUMBER}
        </p>
      </div>

    </div>
  );
}
