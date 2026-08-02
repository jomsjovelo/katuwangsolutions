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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <Edit3 className="w-5 h-5 text-indigo-600" />
            I-edit ang Transaksyon #{sale.id.slice(-6).toUpperCase()}
          </DialogTitle>
          <DialogDescription>
            Buhayin at isaayos ang mga biniling item, discount, at paraan ng pagbabayad.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Payment Method & Palista Customer */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600 uppercase flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                Paraan ng Pagbabayad
              </Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="bg-white">
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
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-600 uppercase">Pangalan ng Nagpalista</Label>
                <Input
                  placeholder="e.g. Aling Nena"
                  value={palistaName}
                  onChange={(e) => setPalistaName(e.target.value)}
                  className="bg-white"
                />
              </div>
            )}
          </div>

          {/* Product Items Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-indigo-600" />
                Mga Nilalaman ng Resibo ({items.length})
              </Label>
            </div>

            {/* Quick Add Product Dropdown */}
            {products && products.length > 0 && (
              <div className="flex gap-2">
                <Select value={selectedProductId} onValueChange={handleAddProduct}>
                  <SelectTrigger className="bg-white border-dashed border-indigo-300 hover:border-indigo-500">
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
            <div className="border rounded-xl divide-y overflow-hidden bg-white shadow-sm">
              {items.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">Walang natitirang item sa listahan.</div>
              ) : (
                items.map((item, idx) => {
                  const itemTotal = (item.price * item.quantity) / 100;
                  return (
                    <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="font-semibold text-sm text-slate-800 truncate">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          ₱{(item.price / 100).toFixed(2)} × {item.quantity} {item.unit || 'pcs'}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center border rounded-lg overflow-hidden bg-slate-50">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-600 hover:bg-slate-200"
                            onClick={() => handleQuantityChange(idx, -1)}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                          <span className="w-8 text-center text-sm font-bold text-slate-800">{item.quantity}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-600 hover:bg-slate-200"
                            onClick={() => handleQuantityChange(idx, 1)}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        <span className="w-20 text-right font-bold text-sm text-slate-900">
                          ₱{itemTotal.toFixed(2)}
                        </span>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
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
          <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200/80 space-y-3">
            <Label className="text-xs font-semibold text-amber-800 uppercase flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-amber-600" />
              Diskwento (Discount)
            </Label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-amber-700">Uri ng Diskwento</Label>
                <Select value={discountType} onValueChange={(val: any) => setDiscountType(val)}>
                  <SelectTrigger className="bg-white border-amber-200">
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
                    <Label className="text-xs text-amber-700">
                      {discountType === 'percentage' ? 'Halaga sa %' : 'Halaga sa Pesos (₱)'}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                      className="bg-white border-amber-200"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-amber-700">Dahilan ng Diskwento</Label>
                    <Input
                      placeholder="e.g. Senior Discount / Suki"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="bg-white border-amber-200"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Summary Breakdown */}
          <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Subtotal:</span>
              <span className="font-semibold">₱{(subtotalCentavos / 100).toFixed(2)}</span>
            </div>
            {calculatedDiscountCentavos > 0 && (
              <div className="flex justify-between text-xs text-emerald-400">
                <span>Diskwento:</span>
                <span className="font-semibold">-₱{(calculatedDiscountCentavos / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-extrabold text-white pt-2 border-t border-slate-800">
              <span>Bagong Kabuuang Bayarin:</span>
              <span className="text-emerald-400">₱{(finalTotalCentavos / 100).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Kanselahin
          </Button>
          <Button
            type="button"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
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
