'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Image from 'next/image';
import { Download, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PAYMENT_NUMBER = '09951665423';
const ACCOUNT_NAME = 'Katuwang Solutions';
const FB_MESSENGER_URL = 'https://m.me/KatuwangSolutions';

interface SponsorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffName: string;
}

export function SponsorDialog({ open, onOpenChange, staffName }: SponsorDialogProps) {
  const [copiedGcash, setCopiedGcash] = useState(false);

  const copyNumber = () => {
    navigator.clipboard.writeText(PAYMENT_NUMBER);
    setCopiedGcash(true);
    setTimeout(() => setCopiedGcash(false), 2500);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-slate-900">Sponsor Team Member</DialogTitle>
          <DialogDescription className="text-sm font-medium">
            Pay <strong>₱99.00</strong> to activate {staffName}'s account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4 pb-2">
          {/* QR Code Section */}
          <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 flex flex-col items-center text-center space-y-4 shadow-sm">
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">Scan to Pay</p>
              <p className="text-xs text-slate-500 font-medium">Use this QR code for GCash</p>
            </div>
            
            <div className="relative w-48 h-48 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 p-2 shadow-inner">
              <Image 
                src="/images/gcash-qr.jpg" 
                alt="Katuwang Solutions QR Code" 
                fill 
                className="object-contain"
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

          {/* GCash Card */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded flex items-center justify-center font-black text-[10px] text-white" style={{ background: '#00A3E0' }}>G</div>
                <span className="font-black uppercase tracking-wide text-xs" style={{ color: '#00A3E0' }}>GCash Number</span>
              </div>
              <p className="font-bold text-slate-900 text-xs"><span translate="no" className="notranslate">{ACCOUNT_NAME}</span></p>
            </div>
            <div className="flex items-center justify-between bg-white rounded-xl px-4 py-2 border border-blue-100">
              <span className="font-black text-lg tracking-wider text-slate-900">{PAYMENT_NUMBER}</span>
              <button onClick={copyNumber} className="active:scale-90 transition-transform" style={{ color: '#00A3E0' }}>
                {copiedGcash ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* How-to Instructions */}
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">How to Confirm</p>
            <div className="space-y-3">
              {[
                'Scan the QR code and pay exactly ₱99.00.',
                'Take a screenshot of your successful payment.',
                `Send the screenshot and ${staffName}'s email to our Facebook Page.`,
              ].map((text, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="h-6 w-6 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                  <p className="text-sm text-slate-700 font-medium leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <Button
            className="w-full h-14 rounded-2xl font-bold text-base shadow-xl"
            style={{ background: '#0099FF', color: 'white' }}
            onClick={() => window.open(FB_MESSENGER_URL, '_blank')}
          >
            <ExternalLink className="h-5 w-5 mr-2" />
            Send Screenshot on Messenger
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
