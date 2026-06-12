"use client"

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Gift, ChevronDown, ChevronUp } from 'lucide-react';

interface CustomerReferralInputProps {
  customerPhone: string;
  setCustomerPhone: (phone: string) => void;
  referrerCode: string;
  setReferrerCode: (code: string) => void;
  primaryColor?: string;
}

export function CustomerReferralInput({
  customerPhone,
  setCustomerPhone,
  referrerCode,
  setReferrerCode,
  primaryColor = '#3b82f6'
}: CustomerReferralInputProps) {
  const [showReferral, setShowReferral] = useState(false);

  return (
    <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
      <div className="space-y-1">
        <Label htmlFor="customer-phone" className="text-xs font-bold uppercase tracking-widest text-slate-500">Customer Phone</Label>
        <Input 
          id="customer-phone" 
          placeholder="e.g. 09171234567" 
          value={customerPhone} 
          onChange={e => setCustomerPhone(e.target.value)} 
          className="bg-white border-slate-200"
        />
      </div>

      {!showReferral ? (
        <Button 
          type="button" 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowReferral(true)}
          className="w-full text-xs font-medium h-8 flex items-center justify-center gap-2 hover:bg-slate-100 text-slate-500"
        >
          <Gift className="h-3 w-3" style={{ color: primaryColor }} />
          Add Referral Code
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      ) : (
        <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between">
            <Label htmlFor="referrer-code" className="text-[10px] font-bold uppercase tracking-widest" style={{ color: primaryColor }}>
              Referrer Code (4 chars)
            </Label>
            <button 
              type="button"
              onClick={() => {
                setShowReferral(false);
                setReferrerCode('');
              }}
              className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center"
            >
              Cancel <ChevronUp className="h-3 w-3 ml-1" />
            </button>
          </div>
          <Input 
            id="referrer-code" 
            placeholder="e.g. A1B2" 
            value={referrerCode} 
            onChange={e => setReferrerCode(e.target.value.toUpperCase().slice(0, 4))} 
            className="bg-white border-slate-200 font-mono tracking-widest uppercase"
            maxLength={4}
          />
        </div>
      )}
    </div>
  );
}
