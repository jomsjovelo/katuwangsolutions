'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useInventory } from '@/hooks/use-inventory';
import { useUser } from '@/firebase/auth/use-user';
import { createPurchaseOrder, updatePurchaseOrder } from '@/firebase/firestore/supplier-actions';
import { SupplierProfile, PurchaseOrder } from '@/lib/schemas/supplier';
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
import { ShoppingBag, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, DollarSign, Save, Edit3 } from 'lucide-react';
import {
  validateAndProjectBentaRestockDraft,
  submitBentaRestockPO,
  computeBentaRestockDraftFingerprint,
  generateSecureIdempotencyKey,
  parseExactPositiveInteger,
  type BentaDraftItemInput,
} from '@/lib/client/benta-inventory-restock-client';
import { parsePesoToCentavos } from '@/lib/shared/pricing-math';

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: SupplierProfile[];
  poToEdit?: PurchaseOrder | null;
}

export function PurchaseOrderModal({ 
  isOpen, 
  onClose, 
  suppliers,
  poToEdit 
}: PurchaseOrderModalProps) {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const { products } = useInventory();

  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState<BentaDraftItemInput[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'credit_unpaid'>('paid');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'cash_drawer' | 'gcash' | 'supplier_credit'>('cash_drawer');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Idempotency tracking
  const idempotencyKeyRef = useRef<string>('');
  const lastDraftFingerprintRef = useRef<string>('');

  // Selected item inputs
  const [selectedProductId, setSelectedProductId] = useState('');
  const [inputQty, setInputQty] = useState('1');
  const [inputUnitCost, setInputUnitCost] = useState('');

  const isEditing = !!poToEdit;

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      if (poToEdit) {
        setSupplierId(poToEdit.supplierId || '');
        setPaymentStatus(poToEdit.paymentStatus === 'credit_unpaid' ? 'credit_unpaid' : 'paid');
        setPaymentMethod(
          poToEdit.paymentMethod === 'gcash'
            ? 'gcash'
            : poToEdit.paymentMethod === 'supplier_credit'
            ? 'supplier_credit'
            : poToEdit.paymentMethod === 'cash'
            ? 'cash_drawer'
            : 'cash_drawer'
        );
        setNotes(poToEdit.notes || '');
        
        const mappedItems: BentaDraftItemInput[] = (poToEdit.items || []).map(it => ({
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unitCostPeso: (it.unitCostCentavos / 100).toFixed(2),
        }));
        setItems(mappedItems);
      } else {
        if (suppliers.length > 0 && !supplierId) {
          setSupplierId(suppliers[0].id || '');
        }
        setItems([]);
        setNotes('');
        setPaymentStatus('paid');
        setPaymentMethod('cash_drawer');
        idempotencyKeyRef.current = '';
        lastDraftFingerprintRef.current = '';
      }
    }
  }, [isOpen, suppliers, poToEdit]);

  const handleAddItem = () => {
    setErrorMessage(null);
    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return;

    if (prod.quantityMode === 'measured') {
      setErrorMessage(`Ang panindang "${prod.name}" ay measured (tinitimbang/sinusukat). Hindi pa suportado ang measured restocking sa modal na ito.`);
      return;
    }

    const parsedQty = parseExactPositiveInteger(inputQty);
    const parsedCost = parsePesoToCentavos(inputUnitCost);

    if (!parsedQty.valid || !parsedCost.valid || parsedCost.centavos < 0) {
      setErrorMessage(parsedQty.valid ? "Maglagay ng tumpak na Cost Price." : parsedQty.error);
      return;
    }

    const qty = parsedQty.value;
    const costPesoFormatted = (parsedCost.centavos / 100).toFixed(2);

    setItems(prev => {
      const existingIdx = prev.findIndex(item => item.productId === (prod.id || ''));
      if (existingIdx >= 0) {
        const existingQtyParsed = parseExactPositiveInteger(prev[existingIdx].quantity);
        const currentExistingQty = existingQtyParsed.valid ? existingQtyParsed.value : 0;
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: currentExistingQty + qty,
          unitCostPeso: costPesoFormatted,
        };
        return updated;
      }
      return [
        ...prev,
        {
          productId: prod.id || '',
          productName: prod.name,
          quantity: qty,
          unitCostPeso: costPesoFormatted,
        }
      ];
    });

    // Reset inputs
    setSelectedProductId('');
    setInputQty('1');
    setInputUnitCost('');
  };

  const handleRemoveItem = (index: number) => {
    setErrorMessage(null);
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const totalCostCentavos = items.reduce((sum, item) => {
    const parsedCost = parsePesoToCentavos(item.unitCostPeso);
    const parsedQty = parseExactPositiveInteger(item.quantity);
    const qty = parsedQty.valid ? parsedQty.value : 0;
    return sum + (parsedCost.valid ? parsedCost.centavos * qty : 0);
  }, 0);

  const handleSubmitPO = async () => {
    if (submitting) return;
    setErrorMessage(null);

    if (!currentTenant || !supplierId || items.length === 0) {
      setErrorMessage('Maglagay ng kahit isang paninda at pumili ng supplier.');
      return;
    }

    const selectedSupplier = suppliers.find(s => s.id === supplierId);
    if (!selectedSupplier || !selectedSupplier.id) {
      setErrorMessage('Pumili ng wastong supplier.');
      return;
    }

    const resolvedPaymentMethod = paymentStatus === 'credit_unpaid' ? 'supplier_credit' : paymentMethod;

    // LIVE SMART RESTOCKING PATH FOR BENTA SNAP
    if (currentTenant.moduleType === 'benta-snap' && !isEditing) {
      if (!user) {
        setErrorMessage('Kailangang mag-log in upang makapag-save ng purchase order.');
        return;
      }

      // Compute draft fingerprint to check if draft changed
      const currentFingerprint = computeBentaRestockDraftFingerprint({
        tenantId: currentTenant.id,
        supplierId: selectedSupplier.id,
        paymentStatus,
        paymentMethod: resolvedPaymentMethod,
        notes,
        items,
      });

      let currentIdempotencyKey = idempotencyKeyRef.current;
      if (!currentIdempotencyKey || currentFingerprint !== lastDraftFingerprintRef.current) {
        try {
          currentIdempotencyKey = generateSecureIdempotencyKey();
          idempotencyKeyRef.current = currentIdempotencyKey;
          lastDraftFingerprintRef.current = currentFingerprint;
        } catch {
          setErrorMessage('Hindi makagawa ng secure idempotency key. Subukan muli.');
          return;
        }
      }

      const projection = validateAndProjectBentaRestockDraft({
        tenantId: currentTenant.id,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        paymentStatus,
        paymentMethod: resolvedPaymentMethod,
        notes,
        idempotencyKey: currentIdempotencyKey,
        items,
        products,
      });

      if (!projection.valid) {
        setErrorMessage(projection.error);
        return;
      }

      try {
        setSubmitting(true);
        const token = await user.getIdToken();
        const response = await submitBentaRestockPO({
          token,
          payload: projection.payload,
        });

        if (response.success) {
          idempotencyKeyRef.current = '';
          lastDraftFingerprintRef.current = '';
          onClose();
        } else {
          setErrorMessage(response.error || 'Hindi ma-save ang Purchase Order. Subukan muli.');
        }
      } catch {
        setErrorMessage('Hindi makakonekta sa server. Pakitingnan ang internet connection.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // LEGACY CREATION / UPDATE PATH FOR OTHER MODULES
    try {
      setSubmitting(true);

      const itemsPayload = items.map(it => {
        const parsed = parsePesoToCentavos(it.unitCostPeso);
        const qty = typeof it.quantity === 'number' ? it.quantity : parseInt(String(it.quantity), 10) || 0;
        return {
          productId: it.productId,
          productName: it.productName || 'Paninda',
          quantity: qty,
          unitCostCentavos: parsed.valid ? parsed.centavos : 0,
        };
      });

      if (isEditing && poToEdit?.id) {
        await updatePurchaseOrder(
          currentTenant.id,
          poToEdit.id,
          {
            supplierId: selectedSupplier.id,
            supplierName: selectedSupplier.name,
            items: itemsPayload,
            totalAmountCentavos: totalCostCentavos,
            paymentStatus,
            paymentMethod: resolvedPaymentMethod,
            notes,
          },
          user?.uid || 'unknown',
          user?.displayName || user?.email || 'Store Owner'
        );
      } else {
        const poPayload = {
          poNumber: `PO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(100 + Math.random() * 900)}`,
          supplierId: selectedSupplier.id,
          supplierName: selectedSupplier.name,
          items: itemsPayload,
          totalAmountCentavos: totalCostCentavos,
          paymentStatus,
          paymentMethod: resolvedPaymentMethod,
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
      }

      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'May error sa pag-save ng Purchase Order.';
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg bg-white rounded-3xl p-4 sm:p-6 max-h-[calc(100dvh-2rem)] flex flex-col justify-between overflow-hidden">
        <DialogHeader className="pb-3 border-b border-slate-100 shrink-0">
          <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
            {isEditing ? <Edit3 className="h-5 w-5 text-cyan-600" /> : <ShoppingBag className="h-5 w-5 text-cyan-600" />}
            {isEditing ? `Edit Purchase Order (${poToEdit?.poNumber})` : 'Bumili ng Stock / Purchase Order (PO)'}
          </DialogTitle>
          <DialogDescription className="text-xs font-semibold text-slate-400">
            Itala ang bagong delivery mula sa supplier para awtomatikong tumaas ang inventory stock.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2 text-rose-800 text-xs font-bold">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Supplier Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">Piliin ang Supplier</Label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full h-10 px-3 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none"
            >
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.paymentTerms})</option>
              ))}
            </select>
          </div>

          {/* Add Item Section */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
              Magdagdag ng Paninda sa Delivery
            </span>

            <div className="space-y-2">
              <div>
                <Label className="text-[10px] font-bold text-slate-600">Pumili ng Paninda</Label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedProductId(id);
                    const prod = products.find(p => p.id === id);
                    if (prod) {
                      setInputUnitCost((prod.costPrice / 100).toFixed(2));
                    }
                  }}
                  className="w-full h-9 px-2 text-xs font-bold bg-white border border-slate-200 rounded-lg outline-none"
                >
                  <option value="">-- Piliin ang Item --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Current: {p.currentStock || 0})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] font-bold text-slate-600">Dami (Qty)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={inputQty}
                    onChange={(e) => setInputQty(e.target.value)}
                    className="h-9 text-xs font-bold bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-bold text-slate-600">Unit Cost (₱)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={inputUnitCost}
                    onChange={(e) => setInputUnitCost(e.target.value)}
                    className="h-9 text-xs font-bold bg-white"
                  />
                </div>
              </div>

              <Button
                type="button"
                onClick={handleAddItem}
                disabled={!selectedProductId}
                size="sm"
                className="w-full h-8 text-xs font-bold bg-slate-900 text-white rounded-lg gap-1 hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" /> Isama sa Listahan
              </Button>
            </div>
          </div>

          {/* Items Table List */}
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
              Mga Kasamang Paninda ({items.length})
            </span>

            {items.length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold italic text-center py-4">
                Wala pang idinadagdag na paninda.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {items.map((it, idx) => (
                  <div key={it.productId || idx} className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-slate-800 truncate">{it.productName}</p>
                      <p className="text-[10px] font-bold text-slate-500">
                        {it.quantity} pcs @ ₱{it.unitCostPeso} = ₱{(parseFloat(String(it.unitCostPeso) || '0') * (typeof it.quantity === 'number' ? it.quantity : parseInt(String(it.quantity), 10) || 0)).toFixed(2)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment Details */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-600">Payment Status</Label>
              <select
                value={paymentStatus}
                onChange={(e) => {
                  const val = e.target.value;
                  setPaymentStatus(val === 'credit_unpaid' ? 'credit_unpaid' : 'paid');
                }}
                className="w-full h-8 px-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none"
              >
                <option value="paid">Bayad Na (Paid)</option>
                <option value="credit_unpaid">Utang (Supplier Credit)</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-600">Payment Method</Label>
              <select
                value={paymentMethod}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'cash' || val === 'cash_drawer' || val === 'gcash' || val === 'supplier_credit') {
                    setPaymentMethod(val);
                  }
                }}
                disabled={paymentStatus === 'credit_unpaid'}
                className="w-full h-8 px-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none disabled:opacity-50"
              >
                <option value="cash_drawer">Cash Drawer</option>
                <option value="gcash">GCash</option>
                <option value="supplier_credit">Supplier Credit</option>
              </select>
            </div>
          </div>

          {/* Total Summary */}
          <div className="p-3 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-900">Kabuuang Halaga (Total)</span>
            <span className="text-base font-black text-cyan-950">
              ₱{(totalCostCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-slate-100 flex-row gap-2 justify-end shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 sm:flex-none text-xs font-bold rounded-xl"
          >
            Kanselahin
          </Button>
          <Button
            type="button"
            onClick={handleSubmitPO}
            disabled={submitting || items.length === 0}
            className="flex-1 sm:flex-none text-xs font-bold bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Sine-save...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{isEditing ? 'I-update ang PO' : 'I-save at Tanggapin'}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
