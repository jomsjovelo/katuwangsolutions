'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Scale, Banknote, ShoppingCart } from 'lucide-react';

interface FreshWeightModalProps {
  product: any | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: any, calculatedQty: number, customPriceCentavos?: number) => void;
  themeColor?: string;
}

export function FreshWeightModal({
  product,
  isOpen,
  onClose,
  onAddToCart,
  themeColor = '#10B981'
}: FreshWeightModalProps) {
  const [mode, setMode] = useState<'weight' | 'peso'>('weight');
  const [weightKg, setWeightKg] = useState<string>('1');
  const [targetPeso, setTargetPeso] = useState<string>('50');

  if (!product) return null;

  const pricePerUnitCentavos = product.salePrice || 0; // price per kg/unit in centavos
  const pricePerUnitPesos = pricePerUnitCentavos / 100;

  // Mode 1: Weight in KG -> Total Pesos
  const computedPesoFromWeight = parseFloat(weightKg) && pricePerUnitPesos > 0
    ? (parseFloat(weightKg) * pricePerUnitPesos).toFixed(2)
    : '0.00';

  // Mode 2: Target Peso -> Weight in KG
  const computedKgFromPeso = parseFloat(targetPeso) && pricePerUnitPesos > 0
    ? (parseFloat(targetPeso) / pricePerUnitPesos).toFixed(3)
    : '0.000';

  const handleConfirm = () => {
    if (mode === 'weight') {
      const kg = Math.max(0.01, parseFloat(weightKg) || 1);
      // For fractional kg, we pass quantity as rounded integer or weighted custom item
      const roundedQty = Math.max(1, Math.round(kg));
      const customPrice = Math.round((kg * pricePerUnitPesos) * 100);
      onAddToCart(product, roundedQty, customPrice);
    } else {
      const peso = Math.max(1, parseFloat(targetPeso) || 50);
      const calculatedKg = pricePerUnitPesos > 0 ? peso / pricePerUnitPesos : 1;
      const roundedQty = Math.max(1, Math.round(calculatedKg));
      const customPrice = Math.round(peso * 100);
      onAddToCart(product, roundedQty, customPrice);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md rounded-3xl p-6 bg-white border-slate-200">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Scale className="h-5 w-5" style={{ color: themeColor }} />
            <span>Kilo at Presyo Calculator</span>
          </DialogTitle>
          <p className="text-xs font-medium text-slate-500">
            {product.name} — <strong className="text-slate-800">₱{pricePerUnitPesos.toFixed(2)}</strong> / {product.unit || 'kg'}
          </p>
        </DialogHeader>

        {/* Mode Selector */}
        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl my-3">
          <button
            onClick={() => setMode('weight')}
            className={`py-2 px-3 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              mode === 'weight'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            I-timbang (kg)
          </button>
          <button
            onClick={() => setMode('peso')}
            className={`py-2 px-3 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              mode === 'peso'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Banknote className="h-3.5 w-3.5" />
            Halagang Perang Bayad (₱)
          </button>
        </div>

        {/* Form Controls */}
        {mode === 'weight' ? (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Timbang (Kilogram / Grams)
              </label>
              <div className="relative mt-1">
                <Input
                  type="number"
                  step="0.05"
                  min="0.01"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="h-12 text-lg font-black text-slate-800 rounded-xl pr-12"
                  placeholder="e.g. 0.5"
                />
                <span className="absolute right-3 top-3 text-xs font-black text-slate-400 uppercase">
                  KG
                </span>
              </div>
            </div>

            {/* Quick Weight Presets */}
            <div className="flex gap-1.5 flex-wrap">
              {['0.25', '0.5', '0.75', '1.0', '2.0', '5.0'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setWeightKg(preset)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-lg transition-colors"
                >
                  {preset} kg
                </button>
              ))}
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800">Total na Halaga:</span>
              <span className="text-xl font-black text-emerald-700">₱{computedPesoFromWeight}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Gusto / Bibilhing Halaga (₱)
              </label>
              <div className="relative mt-1">
                <Input
                  type="number"
                  step="5"
                  min="1"
                  value={targetPeso}
                  onChange={(e) => setTargetPeso(e.target.value)}
                  className="h-12 text-lg font-black text-slate-800 rounded-xl pr-12"
                  placeholder="e.g. 50"
                />
                <span className="absolute right-3 top-3 text-xs font-black text-slate-400 uppercase">
                  PHP
                </span>
              </div>
            </div>

            {/* Quick Peso Presets */}
            <div className="flex gap-1.5 flex-wrap">
              {['20', '50', '100', '150', '200', '500'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTargetPeso(preset)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-lg transition-colors"
                >
                  ₱{preset}
                </button>
              ))}
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800">Kalkuladong Timbang:</span>
              <span className="text-xl font-black text-emerald-700">{computedKgFromPeso} kg</span>
            </div>
          </div>
        )}

        <Button
          onClick={handleConfirm}
          className="w-full h-12 rounded-2xl font-black text-sm text-white shadow-md transition-all mt-2"
          style={{ backgroundColor: themeColor }}
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          Idagdag sa Cart
        </Button>
      </DialogContent>
    </Dialog>
  );
}
