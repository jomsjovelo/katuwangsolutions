import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';

interface PosCurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  onChange: (val: string) => void;
}

export function PosCurrencyInput({ value, onChange, ...props }: PosCurrencyInputProps) {
  const [centavosStr, setCentavosStr] = useState<string>('0');

  useEffect(() => {
    if (!value || value === '0') {
      setCentavosStr('0');
      return;
    }
    
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
       const centavos = Math.round(parsed * 100);
       if (parseInt(centavosStr || '0', 10) !== centavos) {
         setCentavosStr(centavos.toString());
       }
    }
  }, [value, centavosStr]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRaw = e.target.value.replace(/\D/g, '');
    const cleanRaw = newRaw.replace(/^0+/, '');
    const nextCentavos = cleanRaw === '' ? '0' : cleanRaw;
    
    setCentavosStr(nextCentavos);
    
    const parsedCentavos = parseInt(nextCentavos, 10);
    const pesos = (parsedCentavos / 100).toString();
    onChange(pesos);
  };

  const parsedCentavos = parseInt(centavosStr || '0', 10);
  const displayValue = (parsedCentavos / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">₱</span>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        className={`pl-7 text-right font-mono font-bold tracking-wider ${props.className || ''}`}
      />
    </div>
  );
}
