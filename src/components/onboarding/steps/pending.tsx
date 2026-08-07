"use client"

import React from 'react';
import { Clock, ExternalLink } from 'lucide-react';

const FB_MESSENGER_URL = 'https://m.me/KatuwangSolutions';

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
          Kapag na-verify na ang inyong bayad ng aming Operations team, mai-unlock ang inyong access sa account.
        </p>
      </div>

      {/* Payment Screenshot Instructions */}
      <div className="w-full bg-amber-50 border border-amber-100 rounded-3xl p-5 text-left space-y-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">Final Step: Send Screenshot</p>
          <p className="text-sm text-amber-900 font-medium">
            Kung hindi pa naipapadala, paki-send ang inyong payment screenshot sa aming Facebook Messenger page kasama ang inyong rehistradong Email o Business Name para ma-verify ng Operations team.
          </p>
        </div>
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
          Send Payment Screenshot on Messenger
        </a>
        <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
          <span translate="no" className="notranslate">Katuwang Solutions</span>
        </p>
      </div>

    </div>
  );
}
