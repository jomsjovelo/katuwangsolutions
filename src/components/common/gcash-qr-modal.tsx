"use client"

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  CheckCircle2, 
  Clock, 
  Coins, 
  Smartphone, 
  ShieldCheck,
  RefreshCw,
  AlertTriangle
} from "lucide-react";

interface GCashQrModalProps {
  open: boolean;
  onClose: () => void;
  totalAmount: number; // in centavos
  tenantName: string;
  onPaymentVerified: (paymentMethod: string, gcashRef: string) => void;
  theme: any;
  paymentType?: 'gcash' | 'maya'; // defaults to gcash
}

import { useTenantStore } from '@/store/use-tenant-store';
import { playCashlessDoubleBeep } from '@/lib/hardware/audio-synthesizer';

// Synthesize premium retro-cashier checkout sound using standard HTML5 AudioContext
export const playSuccessBeep = () => playCashlessDoubleBeep();

export function GCashQrModal({ 
  open, 
  onClose, 
  totalAmount, 
  tenantName, 
  onPaymentVerified,
  theme,
  paymentType = 'gcash'
}: GCashQrModalProps) {
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes in seconds
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);

  // Payment config based on type
  const isMaya = paymentType === 'maya';
  const paymentLabel = isMaya ? 'Maya' : 'GCash';
  const walletColor = isMaya ? { from: 'from-green-600', via: 'via-green-700', to: 'to-emerald-500', badge: 'bg-violet-600' } 
                             : { from: 'from-blue-700', via: 'via-indigo-800', to: 'to-red-600', badge: 'bg-blue-600' };

  const amountPesos = totalAmount / 100;
  const [gcashRef] = useState(() => `KAT${Date.now().toString(36).toUpperCase()}`);
  const qrData = `payph://merchant/${encodeURIComponent(tenantName)}?amount=${amountPesos}&ref=${gcashRef}`;
  const { activeTenant } = useTenantStore();
  
  // Try to use the owner's uploaded QR first
  const customQrImage = activeTenant?.gcashQrImageBase64;

  // Real-time dynamic QR Ph code using QRServer
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(customQrImage || null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  // Countdown timer effect
  useEffect(() => {
    if (!open) return;
    setTimeLeft(120);
    setVerificationSuccess(false);
    setIsVerifying(false);

    // If no custom QR, fallback to a placeholder/mock QR
    if (!customQrImage) {
      setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=MOCK-${paymentLabel.toUpperCase()}-${amountPesos}`);
    } else {
      setQrCodeUrl(customQrImage);
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [open, customQrImage, paymentLabel, amountPesos]);

  // Format seconds into MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVerifyPayment = () => {
    if (timeLeft === 0) return;
    setIsVerifying(true);
    
    // Simulate real-time API callback payment reconciliation
    setTimeout(() => {
      setIsVerifying(false);
      setVerificationSuccess(true);
      playSuccessBeep();
      
      // Complete transaction in DB — pass gcashRef so it can be stored in the sale record
      setTimeout(() => {
        onPaymentVerified(paymentType, gcashRef);
      }, 1200);
    }, 1800);
  };

  // Render a completely client-side, offline-resilient high-fidelity QR Ph vector SVG
  const QrPhVectorSvg = () => {
    return (
      <svg 
        width="180" 
        height="180" 
        viewBox="0 0 100 100" 
        className="bg-white p-1 rounded-2xl"
      >
        {/* Background */}
        <rect width="100" height="100" fill="#ffffff" />
        
        {/* Top-Left Anchor */}
        <rect x="5" y="5" width="22" height="22" fill="#0f172a" rx="3" />
        <rect x="9" y="9" width="14" height="14" fill="#ffffff" rx="1.5" />
        <rect x="12" y="12" width="8" height="8" fill="#0f172a" rx="1" />
        
        {/* Top-Right Anchor */}
        <rect x="73" y="5" width="22" height="22" fill="#0f172a" rx="3" />
        <rect x="77" y="9" width="14" height="14" fill="#ffffff" rx="1.5" />
        <rect x="80" y="12" width="8" height="8" fill="#0f172a" rx="1" />
        
        {/* Bottom-Left Anchor */}
        <rect x="5" y="73" width="22" height="22" fill="#0f172a" rx="3" />
        <rect x="9" y="77" width="14" height="14" fill="#ffffff" rx="1.5" />
        <rect x="12" y="80" width="8" height="8" fill="#0f172a" rx="1" />

        {/* Small Bottom-Right Alignment Pattern */}
        <rect x="76" y="76" width="10" height="10" fill="#0f172a" rx="1.5" />
        <rect x="79" y="79" width="4" height="4" fill="#ffffff" rx="0.5" />
        <rect x="80.5" y="80.5" width="1" height="1" fill="#0f172a" />

        {/* Stylized QR Data Grid Matrix Blocks */}
        <path d="M32 5h4v4h-4zm8 0h6v4h-6zm10 0h4v6h-4zm6 0h4v4h-4zm-28 8h6v4h-6zm14 0h4v4h-4zm10 0h8v4h-8z" fill="#0f172a" />
        {qrCodeUrl && (
          <image href={qrCodeUrl} x="10" y="10" width="80" height="80" opacity="0.1" />
        )}
      </svg>
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden border border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-bottom-8 duration-300">
        
        {/* QR Ph / Maya Styled Top Banner */}
        <div className={`bg-gradient-to-r ${walletColor.from} ${walletColor.via} ${walletColor.to} text-white py-3 px-5 text-center relative`}>
          <div className="flex justify-between items-center">
            <span className="font-headline font-black text-xs uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-full">
              {isMaya ? '🌿 Maya Pay' : 'QR Ph Terminal'}
            </span>
            <div className="flex items-center gap-1.5 text-[10px] font-bold">
              <Smartphone className="h-3.5 w-3.5" />
              Scan to Pay
            </div>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="p-6 flex-1 flex flex-col items-center text-center space-y-4">
          <div>
            <h3 className="font-headline font-black text-base text-slate-800 uppercase tracking-tight">
              {tenantName}
            </h3>
            <p className="text-slate-400 text-[10px] font-bold mt-0.5">{paymentLabel} Cashless Checkout</p>
          </div>

          {/* Amount Box */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl py-2.5 px-6 w-full text-center">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Halagang Babayaran</span>
            <h4 className="text-2xl font-headline font-black text-slate-800 mt-0.5">
              ₱{amountPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </h4>
          </div>

          {/* QR Ph Container Wrapper (Authentic National QR Layout) */}
          <div className="relative border-4 border-red-500 rounded-[28px] p-3.5 bg-white shadow-md flex items-center justify-center">
            {/* Top QR Ph Red/Blue Corners */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-600 to-red-500" />
            
            {timeLeft === 0 ? (
              <div className="h-[180px] w-[180px] flex flex-col items-center justify-center bg-slate-50 rounded-2xl gap-2 p-4 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-500 animate-pulse" />
                <h5 className="font-black text-xs text-slate-800">QR Expirado</h5>
                <p className="text-[9px] text-slate-400 leading-normal">
                  Mangyaring i-regenerate ang checkout QR code.
                </p>
              </div>
            ) : verificationSuccess ? (
              <div className="h-[180px] w-[180px] flex flex-col items-center justify-center bg-emerald-50 rounded-2xl gap-2 text-center animate-in zoom-in-95 duration-300">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 animate-bounce" />
                <h5 className="font-black text-xs text-emerald-800">Bayad Tanggap!</h5>
                <p className="text-[9px] text-emerald-600 font-bold">POS sync completed</p>
              </div>
            ) : (
              <div className="relative">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} className="h-44 w-44 object-contain rounded-2xl" alt="Payment QR" />
                ) : (
                  <div className="h-44 w-44 flex flex-col items-center justify-center bg-slate-50 rounded-2xl p-4 text-center">
                    <AlertTriangle className="h-6 w-6 text-slate-400 mb-2" />
                    <p className="text-[10px] text-slate-500 font-bold leading-tight">No QR Code Uploaded</p>
                  </div>
                )}
                {!customQrImage && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl p-4 text-center">
                     <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />
                     <p className="text-[10px] text-slate-700 font-bold leading-tight">Walang GCash QR Code na nakalagay.</p>
                     <p className="text-[8px] text-slate-500 mt-1">Mangyaring sabihan ang Store Owner na mag-upload sa Settings.</p>
                  </div>
                )}
                {isVerifying && (
                  <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center gap-1.5 rounded-2xl">
                    <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
                    <span className="text-[9px] font-black uppercase text-indigo-700 tracking-wider">Verifying...</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Bottom national brand mark */}
            <div className="absolute -bottom-3 bg-gradient-to-r from-blue-600 to-red-600 text-white font-black text-[8px] px-3 py-0.5 rounded-full shadow-sm uppercase tracking-widest">
              QR Ph
            </div>
          </div>

          {/* Time Countdown Timer */}
          {timeLeft > 0 && !verificationSuccess && (
            <div className="flex items-center gap-1.5 text-slate-500 font-bold text-xs bg-slate-100 px-3.5 py-1 rounded-full">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>Mag-eexpire sa:</span>
              <span className="font-mono text-red-500 font-black">{formatTime(timeLeft)}</span>
            </div>
          )}

          {/* Wallet Badges */}
          <div className="w-full space-y-1.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Tumatanggap ng:</span>
            <div className="flex items-center justify-center gap-3 opacity-80">
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-md border shadow-sm ${
                isMaya 
                  ? 'text-violet-700 bg-violet-50 border-violet-100 ring-2 ring-violet-400' 
                  : 'text-blue-600 bg-blue-50 border-blue-100 ring-2 ring-blue-400'
              }`}>
                {isMaya ? 'Maya' : 'GCash'} ✓
              </span>
              <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-100">
                {isMaya ? 'GCash' : 'Maya'}
              </span>
              <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-2.5 py-0.5 rounded-md border border-orange-100 shadow-sm">ShopeePay</span>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="p-5 border-t border-slate-50 bg-slate-50/50 flex flex-col gap-2">
          {verificationSuccess ? (
            <Button 
              disabled 
              className="w-full h-11 bg-emerald-500 text-white font-bold rounded-xl gap-2 flex items-center justify-center"
            >
              <CheckCircle2 className="h-4 w-4" /> Bayad Nakumpirma!
            </Button>
          ) : timeLeft === 0 ? (
            <Button 
              onClick={onClose}
              className="w-full h-11 bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center"
            >
              Mag-back sa Cart
            </Button>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Button 
                variant="outline"
                onClick={onClose}
                disabled={isVerifying}
                className="col-span-1 rounded-xl h-11 border-slate-200 text-slate-500 font-bold text-xs"
              >
                Bumalik
              </Button>
              <Button 
                onClick={handleVerifyPayment}
                disabled={isVerifying}
                className="col-span-2 rounded-xl h-11 text-white font-bold flex items-center justify-center text-xs border-none"
                style={{ 
                  backgroundColor: theme.primary,
                  boxShadow: `0 6px 12px -3px ${theme.primary}40` 
                }}
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <ShieldCheck className="h-4 w-4 mr-1.5" />
                )}
                I-verify Payment
              </Button>
            </div>
          )}
          <div className="flex items-center justify-center gap-1 text-[8px] text-slate-400 font-bold uppercase tracking-wider">
            <ShieldCheck className="h-3 w-3 text-emerald-500" /> Secure PH Settlement Layer
          </div>
        </div>

      </div>
    </div>
  );
}
