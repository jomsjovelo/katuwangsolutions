'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Plus, Minus, Edit3, ShoppingBag, CreditCard, Tag } from 'lucide-react';
import { updateSaleTransaction } from '@/firebase/firestore/retail-actions';
import { isBentaExactPoolCostedSale } from '@/lib/shared/benta-sale-mutation-guard';
import type { CartItem, Product } from '@/types/firestore';

interface EditTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: any;
  tenantId: string;
  userId: string;
  userName: string;
  products: Product[];
  onSuccess?: () => void;
}

export function EditTransactionModal({
  open,
  onOpenChange,
  sale,
  tenantId,
  userId,
  userName,
  products,
  onSuccess,
}: EditTransactionModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>('');
  const [palistaName, setPalistaName] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  useEffect(() => {
    if (sale) {
      setItems(sale.items ? sale.items.map((it: CartItem) => ({ ...it })) : []);
      setPaymentMethod(sale.paymentMethod || 'cash');
      setDiscountType(sale.discountType || 'none');
      setDiscountReason(sale.discountReason || '');
      setPalistaName(sale.palistaName || '');
      
      const discAmt = sale.discountAmount || 0;
      if (sale.discountType === 'percentage' && sale.subtotalAmount > 0) {
        setDiscountValue(Math.round((discAmt / sale.subtotalAmount) * 100));
      } else {
        setDiscountValue(discAmt / 100);
      }
    }
  }, [sale]);

  if (!sale) return null;

  const subtotalCentavos = items.reduce((acc, item) => acc + Math.round(item.price * item.quantity), 0);
  
  let calculatedDiscountCentavos = 0;
  if (discountType === 'percentage') {
    calculatedDiscountCentavos = Math.round((subtotalCentavos * Math.min(100, Math.max(0, discountValue))) / 100);
  } else if (discountType === 'fixed') {
    calculatedDiscountCentavos = Math.min(subtotalCentavos, Math.round((discountValue || 0) * 100));
  }

  const finalTotalCentavos = Math.max(0, subtotalCentavos - calculatedDiscountCentavos);

  const handleQuantityChange = (index: number, delta: number) => {
    const next = [...items];
    const newQty = next[index].quantity + delta;
    if (newQty <= 0) {
      next.splice(index, 1);
    } else {
      next[index].quantity = newQty;
    }
    setItems(next);
  };

  const handleRemoveItem = (index: number) => {
    const next = [...items];
    next.splice(index, 1);
    setItems(next);
  };

  const handleAddProduct = (productId: string) => {
    if (!productId) return;
    const targetProduct = products.find(p => p.id === productId);
    if (!targetProduct) return;

    const existingIdx = items.findIndex(it => it.productId === productId);
    if (existingIdx >= 0) {
      const next = [...items];
      next[existingIdx].quantity += 1;
      setItems(next);
    } else {
      const newItem: CartItem = {
        productId: targetProduct.id,
        name: targetProduct.name,
        price: targetProduct.salePrice || 0,
        costPrice: targetProduct.costPrice || 0,
        quantity: 1,
      };
      setItems([...items, newItem]);
    }
    setSelectedProductId('');
  };

  const handleSave = async () => {
    if (isBentaExactPoolCostedSale(sale)) {
      toast({
        title: 'Hindi ma-edit ang Exact-Cost Sale',
        description: 'Ang exact-cost sales ay hindi maaaring i-edit. Gamitin ang void workflow para ma-reverse ang sale.',
        variant: 'destructive',
      });
      return;
    }

    if (items.length === 0) {
      toast({
        title: 'Bawal ang Walang Item',
        description: 'Dapat may kahit isang item sa transaksyon.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      await updateSaleTransaction(
        tenantId,
        sale.id,
        {
          items,
          paymentMethod,
          discountCentavos: calculatedDiscountCentavos,
          discountType: discountType === 'none' ? undefined : discountType,
          discountReason,
          palistaName,
        },
        userId,
        userName
      );

      toast({
        title: 'Nai-save na ang Bagong Transaksyon!',
        description: `Na-update na ang resibo at stock adjustments para sa #${sale.id.slice(-6).toUpperCase()}.`,
      });

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast({
        title: 'PAGKAKAMALI SA PAG-SAVE',
        description: err.message || 'Hindi ma-update ang transaksyon.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[88vh] flex flex-col p-0 rounded-[28px] overflow-hidden bg-white border border-slate-200/80 shadow-2xl">
        <DialogHeader className="p-5 pb-3 border-b border-slate-100 bg-white shrink-0 space-y-1">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-headline font-black text-slate-800">
            <Edit3 className="w-5 h-5 text-indigo-600 shrink-0" />
            I-edit ang Transaksyon #{sale.id.slice(-6).toUpperCase()}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 font-medium">
            Buhayin at isaayos ang mga biniling item, discount, at paraan ng pagbabayad.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Payment Method & Palista Customer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black tracking-wider text-slate-500 uppercase flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                Paraan ng Pagbabayad
              </Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="bg-white rounded-xl text-xs font-bold border-slate-200">
                  <SelectValue placeholder="Pumili ng Payment Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash (Perang Papel/Barya)</SelectItem>
                  <SelectItem value="gcash">GCash</SelectItem>
                  <SelectItem value="maya">Maya</SelectItem>
                  <SelectItem value="utang">Palista / Utang</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === 'utang' && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Pangalan ng Nagpalista</Label>
                <Input
                  placeholder="e.g. Aling Nena"
                  value={palistaName}
                  onChange={(e) => setPalistaName(e.target.value)}
                  className="bg-white rounded-xl text-xs font-bold border-slate-200"
                />
              </div>
            )}
          </div>

          {/* Product Items Table */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-black text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <ShoppingBag className="w-4 h-4 text-indigo-600" />
                Mga Nilalaman ng Resibo ({items.length})
              </Label>
            </div>

            {/* Quick Add Product Dropdown */}
            {products && products.length > 0 && (
              <div className="flex gap-2">
                <Select value={selectedProductId} onValueChange={handleAddProduct}>
                  <SelectTrigger className="bg-white border-dashed border-indigo-300 hover:border-indigo-500 rounded-xl text-xs font-bold">
                    <SelectValue placeholder="+ Magdagdag ng Item mula sa Imbentaryo..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — ₱{(p.salePrice / 100).toFixed(2)} (Stock: {p.currentStock})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Items List */}
            <div className="border border-slate-200/80 rounded-2xl divide-y overflow-hidden bg-white shadow-sm">
              {items.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 font-medium">Walang natitirang item sa listahan.</div>
              ) : (
                items.map((item, idx) => {
                  const itemTotal = (item.price * item.quantity) / 100;
                  return (
                    <div key={idx} className="p-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-[130px] pr-2">
                        <p className="font-bold text-xs sm:text-sm text-slate-800 line-clamp-1">{item.name}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          ₱{(item.price / 100).toFixed(2)} × {item.quantity} {item.unit || 'pcs'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50 shadow-sm">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-600 hover:bg-slate-200 rounded-none"
                            onClick={() => handleQuantityChange(idx, -1)}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                          <span className="w-7 text-center text-xs font-black text-slate-800">{item.quantity}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-600 hover:bg-slate-200 rounded-none"
                            onClick={() => handleQuantityChange(idx, 1)}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        <span className="min-w-[64px] text-right font-black text-xs sm:text-sm text-slate-900 shrink-0">
                          ₱{itemTotal.toFixed(2)}
                        </span>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 shrink-0 rounded-xl"
                          onClick={() => handleRemoveItem(idx)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Discount Section */}
          <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/80 space-y-2.5">
            <Label className="text-[10px] font-black text-amber-800 uppercase tracking-wider flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-amber-600" />
              Diskwento (Discount)
            </Label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <Label className="text-[10px] font-bold text-amber-700">Uri ng Diskwento</Label>
                <Select value={discountType} onValueChange={(val: any) => setDiscountType(val)}>
                  <SelectTrigger className="bg-white border-amber-200 rounded-xl text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Walang Diskwento</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (₱)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {discountType !== 'none' && (
                <>
                  <div>
                    <Label className="text-[10px] font-bold text-amber-700">
                      {discountType === 'percentage' ? 'Halaga sa %' : 'Halaga sa Pesos (₱)'}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                      className="bg-white border-amber-200 rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <Label className="text-[10px] font-bold text-amber-700">Dahilan ng Diskwento</Label>
                    <Input
                      placeholder="e.g. Senior Discount / Suki"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="bg-white border-amber-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Summary Breakdown */}
          <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-2 border border-slate-800 shadow-sm">
            <div className="flex justify-between items-center text-xs text-slate-300">
              <span className="font-semibold">Subtotal:</span>
              <span className="font-bold">₱{(subtotalCentavos / 100).toFixed(2)}</span>
            </div>
            {calculatedDiscountCentavos > 0 && (
              <div className="flex justify-between items-center text-xs text-emerald-400">
                <span className="font-semibold">Diskwento ({discountType}):</span>
                <span className="font-bold">-₱{(calculatedDiscountCentavos / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 pt-2.5 border-t border-slate-800">
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-200">
                Bagong Kabuuang Bayarin:
              </span>
              <span className="text-xl sm:text-2xl font-headline font-black text-emerald-400 shrink-0">
                ₱{(finalTotalCentavos / 100).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 flex flex-row justify-end gap-2.5">
          <Button type="button" variant="outline" className="rounded-xl font-bold text-xs" onClick={() => onOpenChange(false)} disabled={loading}>
            Kanselahin
          </Button>
          <Button
            type="button"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs px-5 shadow-sm"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Ina-update...' : 'I-save ang Pagbabago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
