import React from 'react';
import { Input } from './input';
import { Label } from './label';
import { Percent, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DiscountInputProps {
  discountType: 'percentage' | 'fixed';
  discountValue: string;
  onTypeChange: (type: 'percentage' | 'fixed') => void;
  onValueChange: (val: string) => void;
  subtotal?: number; // In centavos
  className?: string;
  label?: string;
  discountReason?: string;
  onReasonChange?: (reason: string) => void;
}

export function DiscountInput({
  discountType,
  discountValue,
  onTypeChange,
  onValueChange,
  subtotal = 0,
  className,
  label = 'Discount',
  discountReason,
  onReasonChange
}: DiscountInputProps) {
  // Calculate preview
  const val = parseFloat(discountValue) || 0;
  let discountCentavos = 0;
  if (discountType === 'percentage') {
    discountCentavos = Math.round((subtotal * val) / 100);
  } else {
    discountCentavos = Math.round(val * 100);
  }

  // Cap at subtotal
  if (discountCentavos > subtotal && subtotal > 0) {
    discountCentavos = subtotal;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
          <Tag className="w-3.5 h-3.5" />
          {label}
        </Label>
        {discountCentavos > 0 && subtotal > 0 && (
          <span className="text-xs font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            -₱{(discountCentavos / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => {
              onTypeChange('percentage');
              onValueChange('');
            }}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center gap-1",
              discountType === 'percentage' 
                ? "bg-white shadow-sm text-slate-800" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Percent className="w-3.5 h-3.5" /> %
          </button>
          <button
            type="button"
            onClick={() => {
              onTypeChange('fixed');
              onValueChange('');
            }}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center gap-1",
              discountType === 'fixed' 
                ? "bg-white shadow-sm text-slate-800" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            ₱ Off
          </button>
        </div>
        <div className="relative flex-1">
          {discountType === 'fixed' && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₱</span>
          )}
          {discountType === 'percentage' && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">%</span>
          )}
          <Input
            type="number"
            min="0"
            step={discountType === 'percentage' ? "1" : "0.01"}
            max={discountType === 'percentage' ? "100" : undefined}
            value={discountValue}
            onChange={(e) => {
              // Ensure we don't go over 100%
              let val = e.target.value;
              if (discountType === 'percentage' && parseFloat(val) > 100) val = '100';
              onValueChange(val);
            }}
            className={cn(
              "h-10 text-base font-semibold",
              discountType === 'fixed' ? "pl-7" : "pr-7 text-right"
            )}
            placeholder={discountType === 'percentage' ? "0" : "0.00"}
          />
        </div>
      </div>
      {onReasonChange && (
        <Input
          placeholder="Reason for discount (e.g., Senior, Promo)"
          value={discountReason || ''}
          onChange={(e) => onReasonChange(e.target.value)}
          className="h-9 text-sm"
        />
      )}
    </div>
  );
}
