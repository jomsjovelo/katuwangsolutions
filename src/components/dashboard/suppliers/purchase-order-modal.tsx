'use client';

import React, { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useInventory } from '@/hooks/use-inventory';
import { useUser } from '@/firebase/auth/use-user';
import { createPurchaseOrder } from '@/firebase/firestore/supplier-actions';
import { SupplierProfile } from '@/lib/schemas/supplier';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { ShoppingBag, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, DollarSign } from 'lucide-react';

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: SupplierProfile[];
}

interface DraftItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCostPeso: string;
  unitSalePricePeso?: string;
}

export function PurchaseOrderModal({ isOpen, onClose, suppliers }: PurchaseOrderModalProps) {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const { products } = useInventory();

  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'credit_unpaid'>('paid');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash' | 'supplier_credit'>('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Selected item inputs
  const [selectedProductId, setSelectedProductId] = useState('');
  const [inputQty, setInputQty] = useState('1');
  const [inputUnitCost, setInputUnitCost] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (suppliers.length > 0 && !supplierId) {
        setSupplierId(suppliers[0].id || '');
      }
      setItems([]);
      setNotes('');
      setPaymentStatus('paid');
      setPaymentMethod('cash');
    }
  }, [isOpen, suppliers]);

  const handleAddItem = () => {
    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return;

    const qty = parseInt(inputQty);
    const cost = parseFloat(inputUnitCost);

    if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) {
      alert("Maglagay ng tumpak na Dami at Cost Price.");
      return;
    }

    setItems(prev => {
      const existingIdx = prev.findIndex(item => item.productId === (prod.id || ''));
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + qty,
          unitCostPeso: cost.toFixed(2),
        };
        return updated;
      }
      return [
        ...prev,
        {
          productId: prod.id || '',
          productName: prod.name,
          quantity: qty,
          unitCostPeso: cost.toFixed(2),
          unitSalePricePeso: (prod.salePrice / 100).toFixed(2),
        }
      ];
    });

    // Reset inputs
    setSelectedProductId('');
    setInputQty('1');
    setInputUnitCost('');
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const totalCostCentavos = items.reduce((sum, item) => {
    return sum + Math.round(parseFloat(item.unitCostPeso || '0') * 100) * item.quantity;
  }, 0);

  const handleSubmitPO = async () => {
    if (!currentTenant || !supplierId || items.length === 0) return;

    const selectedSupplier = suppliers.find(s => s.id === supplierId);
    if (!selectedSupplier) return;

    try {
      setSubmitting(true);

      const poPayload = {
        poNumber: `PO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(100 + Math.random() * 900)}`,
        supplierId: selectedSupplier.id!,
        supplierName: selectedSupplier.name,
        items: items.map(it => ({
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unitCostCentavos: Math.round(parseFloat(it.unitCostPeso) * 100),
          unitSalePriceCentavos: it.unitSalePricePeso ? Math.round(parseFloat(it.unitSalePricePeso) * 100) : undefined,
        })),
        totalAmountCentavos: totalCostCentavos,
        paymentStatus,
        paymentMethod: paymentStatus === 'credit_unpaid' ? 'supplier_credit' : paymentMethod,
        notes,
        createdByName: user?.displayName || user?.email || 'Store Owner',
        createdByUid: user?.uid,
      };

      await createPurchaseOrder(
        currentTenant.id,
        poPayload,
        user?.uid || 'unknown',
        currentTenant.moduleType
      );

      onClose();
    } catch (err) {
      console.error(err);
      alert("May error sa pag-execute ng Purchase Order.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg bg-white rounded-3xl p-4 sm:p-6 max-h-[calc(100dvh-2rem)] flex flex-col justify-between overflow-hidden">
        <DialogHeader className="pb-3 border-b border-slate-100 shrink-0">
          <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-cyan-600" />
            Bumili ng Stock / Purchase Order (PO)
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Mag-log ng bagong delivery mula sa supplier. Awtomatikong madadagdagan ang iyong stock.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-2 flex-1 min-h-0 overflow-y-auto pr-1">
          {/* Supplier Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">Pumili ng Supplier *</Label>
            {suppliers.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                Wala pang rehistradong supplier. I-add muna ang supplier sa Supplier Directory.
              </div>
            ) : (
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-bold text-slate-800"
              >
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    🏬 {s.name} {s.phone ? `(${s.phone})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Add Item Row */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Pumili ng Paninda na Idadagdag</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-3">
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const prod = products.find(p => p.id === e.target.value);
                    if (prod && prod.costPrice) {
                      setInputUnitCost((prod.costPrice / 100).toString());
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-bold text-slate-800"
                >
                  <option value="">-- Pumili ng Paninda --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current Stock: {p.currentStock})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-[10px] font-bold text-slate-500">Dami (Qty)</Label>
                <Input 
                  type="number"
                  min="1"
                  value={inputQty}
                  onChange={(e) => setInputQty(e.target.value)}
                  className="rounded-xl border-slate-200 text-xs font-bold"
                />
              </div>

              <div>
                <Label className="text-[10px] font-bold text-slate-500">Unit Cost (₱)</Label>
                <Input 
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={inputUnitCost}
                  onChange={(e) => setInputUnitCost(e.target.value)}
                  className="rounded-xl border-slate-200 text-xs font-bold"
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={handleAddItem}
                  disabled={!selectedProductId}
                  className="w-full rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                </Button>
              </div>
            </div>
          </div>

          {/* Draft Items Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[160px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-xs font-medium">
                Wala pang idinagdag na paninda. Pumili sa itaas para magdagdag.
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[9px] tracking-wider sticky top-0">
                  <tr>
                    <th className="p-2">Paninda</th>
                    <th className="p-2 text-center">Dami</th>
                    <th className="p-2 text-right">Cost</th>
                    <th className="p-2 text-right">Total</th>
                    <th className="p-2 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                  {items.map((it, idx) => {
                    const subtotal = (parseFloat(it.unitCostPeso || '0') * it.quantity).toFixed(2);
                    return (
                      <tr key={idx}>
                        <td className="p-2">{it.productName}</td>
                        <td className="p-2 text-center font-bold">{it.quantity}</td>
                        <td className="p-2 text-right">₱{it.unitCostPeso}</td>
                        <td className="p-2 text-right font-black">₱{subtotal}</td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Payment Terms & Summary */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Status ng Bayad</Label>
              <select
                value={paymentStatus}
                onChange={(e: any) => {
                  setPaymentStatus(e.target.value);
                  if (e.target.value === 'credit_unpaid') setPaymentMethod('supplier_credit');
                }}
                className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-bold text-slate-800"
              >
                <option value="paid">✅ Bayad Agad (Paid)</option>
                <option value="credit_unpaid">💳 Utang muna (Supplier Credit)</option>
              </select>
            </div>

            {paymentStatus === 'paid' && (
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Paraan ng Bayad</Label>
                <select
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-bold text-slate-800"
                >
                  <option value="cash">💵 Cash (Drawer)</option>
                  <option value="gcash">📱 GCash</option>
                </select>
              </div>
            )}
          </div>

          {/* Total Summary Banner */}
          <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400 block">KABUUANG GASTOS SA RESTOCK</span>
              <span className="text-xs text-slate-300 font-medium">
                {paymentStatus === 'paid' ? 'Nababawas sa Ledger Flow Expense' : 'Nakarecord sa Utang sa Supplier (30-day)'}
              </span>
            </div>
            <span className="text-xl font-black text-emerald-400">
              ₱{(totalCostCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <DialogFooter className="pt-2 border-t border-slate-100 flex gap-2 shrink-0 bg-white z-10 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 rounded-xl text-xs font-bold"
          >
            Kanselahin
          </Button>
          <Button
            type="button"
            onClick={handleSubmitPO}
            disabled={submitting || items.length === 0 || !supplierId}
            className="flex-1 rounded-xl text-xs font-black text-white bg-cyan-600 hover:bg-cyan-700"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Executing PO...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Execute Restock
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
