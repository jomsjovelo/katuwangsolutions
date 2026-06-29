"use client"

import React, { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Plus, Users, Store, Banknote, History, ExternalLink, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getModuleTheme } from '@/lib/theme-utils';
import { DiscountInput } from '@/components/ui/discount-input';
import { addRetailCredit, recordRetailCreditPayment, RetailCreditEntry } from '@/firebase/firestore/retail-credit-actions';
import { Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useInventory } from '@/hooks/use-inventory';
import { ShoppingCart, Package, Trash2, CheckSquare } from 'lucide-react';
const CreditListItem = React.memo(({ credit, idx, setSelectedCredit, setShowPayModal, setPaymentAmountStr, setViewItemsCredit }: any) => {
  const isReceivable = credit.type === 'receivable';
  const remaining = credit.amount - (credit.paidAmount || 0);
  
  return (
    <div className={cn("p-4 flex items-center justify-between", idx > 0 && "border-t border-slate-50")}>
      <div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
            isReceivable ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
          )}>
            {isReceivable ? 'Pautang' : 'Utang sa Supplier'}
          </span>
          <span className="text-xs font-bold text-slate-400">
            {credit.creditDate?.toDate().toLocaleDateString()}
          </span>
        </div>
        <h4 className="font-extrabold text-sm text-slate-800 mt-1">{credit.name}</h4>
        {credit.description && <p className="text-[10px] font-medium text-slate-400 mt-0.5">{credit.description}</p>}
        {credit.items && credit.items.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setViewItemsCredit(credit)} 
            className="text-[10px] h-6 px-2 text-indigo-600 hover:bg-indigo-50 mt-1 -ml-2"
          >
            <Package className="h-3 w-3 mr-1" /> Tingnan ang {credit.items.length} items
          </Button>
        )}
      </div>
      <div className="text-right flex flex-col items-end gap-2">
        <div>
          <h5 className="font-black text-sm text-slate-800">₱{(remaining / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</h5>
          {credit.paidAmount > 0 && (
            <p className="text-[9px] font-bold text-slate-400">
              Paid: ₱{(credit.paidAmount / 100).toLocaleString()}
            </p>
          )}
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => { setSelectedCredit(credit); setShowPayModal(true); setPaymentAmountStr((remaining/100).toString()); }}
          className="h-7 text-[10px] font-bold px-3 rounded-lg border-slate-200 hover:bg-slate-50"
        >
          Bayaran
        </Button>
      </div>
    </div>
  );
});

export function CreditTracker() {
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  const { toast } = useToast();

  const [credits, setCredits] = useState<RetailCreditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const { products } = useInventory();
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addForm, setAddForm] = useState({
    type: 'receivable' as 'receivable' | 'payable',
    name: '',
    amountStr: '',
    description: '',
    dateStr: new Date().toISOString().split('T')[0],
    useItems: false,
    updateStock: true,
    items: [] as { productId: string; name: string; quantity: string; priceStr: string }[]
  });

  const [viewItemsCredit, setViewItemsCredit] = useState<RetailCreditEntry | null>(null);

  const [showPayModal, setShowPayModal] = useState(false);
  const [paymentAmountStr, setPaymentAmountStr] = useState('');
  const [discountType, setDiscountType] = useState<'percentage'|'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');

  useEffect(() => {
    if (!currentTenant) return;
    const { db } = initializeFirebase();
    const q = query(
      collection(db, 'tenants', currentTenant.id, 'retail_credits'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const results: RetailCreditEntry[] = [];
      snapshot.forEach(doc => results.push({ id: doc.id, ...doc.data() } as RetailCreditEntry));
      setCredits(results);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [currentTenant?.id]);

  const unpaidCredits = credits.filter(c => c.status !== 'paid');
  
  const totalReceivables = unpaidCredits
    .filter(c => c.type === 'receivable')
    .reduce((acc, curr) => acc + (curr.amount - (curr.paidAmount || 0)), 0);
    
  const totalPayables = unpaidCredits
    .filter(c => c.type === 'payable')
    .reduce((acc, curr) => acc + (curr.amount - (curr.paidAmount || 0)), 0);

  const computedAmount = addForm.useItems 
    ? addForm.items.reduce((acc, it) => acc + (parseFloat(it.quantity || '0') * parseFloat(it.priceStr || '0')), 0)
    : parseFloat(addForm.amountStr || '0');

  const handleAddCredit = async () => {
    if (!currentTenant || !addForm.name) return;
    if (!addForm.useItems && !addForm.amountStr) return;
    setIsSubmitting(true);
    try {
      const amountCentavos = Math.round(computedAmount * 100);
      if (isNaN(amountCentavos) || amountCentavos <= 0) throw new Error("Invalid amount");
      
      const dateVal = addForm.dateStr ? new Date(addForm.dateStr) : new Date();

      const itemsToSave = addForm.useItems ? addForm.items.map(it => ({
        productId: it.productId,
        name: it.name,
        quantity: parseFloat(it.quantity || '0'),
        price: Math.round(parseFloat(it.priceStr || '0') * 100)
      })) : undefined;

      await addRetailCredit({
        tenantId: currentTenant.id,
        type: addForm.type,
        name: addForm.name,
        amount: amountCentavos,
        description: addForm.description,
        creditDate: Timestamp.fromDate(dateVal),
        items: itemsToSave
      }, addForm.type === 'payable' ? addForm.updateStock : false);
      
      toast({ title: "Tagumpay!", description: "Ang credit ay naitala na." });
      setShowAddModal(false);
      setAddForm({
        type: 'receivable',
        name: '',
        amountStr: '',
        description: '',
        dateStr: new Date().toISOString().split('T')[0],
        useItems: false,
        updateStock: true,
        items: []
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayment = async () => {
    if (!currentTenant || !selectedCredit || !paymentAmountStr) return;
    setIsSubmitting(true);
    try {
      const payCentavos = Math.round(parseFloat(paymentAmountStr) * 100);
      if (isNaN(payCentavos) || payCentavos <= 0) throw new Error("Invalid payment amount");
      
      const parsedDiscount = parseFloat(discountValue) || 0;
      let discountCentavos = 0;
      if (discountType === 'percentage') {
        discountCentavos = Math.round((payCentavos * parsedDiscount) / 100);
      } else {
        discountCentavos = Math.round(parsedDiscount * 100);
      }

      await recordRetailCreditPayment(currentTenant.id, selectedCredit.id!, payCentavos, discountCentavos, discountType);
      
      toast({ title: 'Success', description: 'Payment recorded successfully' });
      setShowPayModal(false);
      setPaymentAmountStr('');
      setDiscountValue('');
      setSelectedCredit(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <History className="h-4 w-4" /> Credit Tracker
          </h3>
          <p className="text-xs text-slate-400 font-medium mt-0.5">I-monitor ang utang ng customer at supplier.</p>
        </div>
        <Button 
          size="sm" 
          onClick={() => setShowAddModal(true)}
          className="rounded-xl h-9 text-xs font-bold gap-1.5"
          style={{ backgroundColor: theme.primary, color: 'white' }}
        >
          <Plus className="h-3 w-3" /> Add Record
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Receivables Card */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white relative overflow-hidden shadow-sm shadow-emerald-500/20">
          <div className="absolute right-0 top-0 opacity-10 transform translate-x-4 -translate-y-4">
            <Users className="h-24 w-24" />
          </div>
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-1">Pautang (Receivable)</p>
            <h3 className="text-2xl font-black tracking-tighter">₱{(totalReceivables / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</h3>
            <p className="text-[9px] font-bold text-emerald-200 mt-1">Sisingilin sa mga customer</p>
          </div>
        </div>

        {/* Payables Card */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 text-white relative overflow-hidden shadow-sm shadow-orange-500/20">
          <div className="absolute right-0 top-0 opacity-10 transform translate-x-4 -translate-y-4">
            <Store className="h-24 w-24" />
          </div>
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-100 mb-1">Utang sa Supplier</p>
            <h3 className="text-2xl font-black tracking-tighter">₱{(totalPayables / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</h3>
            <p className="text-[9px] font-bold text-orange-200 mt-1">Babayaran ng tindahan</p>
          </div>
        </div>
      </div>

      {unpaidCredits.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          {unpaidCredits.map((credit, idx) => (
            <CreditListItem 
              key={credit.id}
              credit={credit}
              idx={idx}
              setSelectedCredit={setSelectedCredit}
              setShowPayModal={setShowPayModal}
              setPaymentAmountStr={setPaymentAmountStr}
              setViewItemsCredit={setViewItemsCredit}
            />
          ))}
        </div>
      )}

      {/* Add Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Magdagdag ng Utang/Pautang</DialogTitle>
            <DialogDescription>I-record ang mano-manong utang para ma-monitor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Uri ng Transaksyon</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setAddForm({...addForm, type: 'receivable'})}
                  className={cn("h-12 border-slate-200 rounded-xl font-bold", addForm.type === 'receivable' && "border-emerald-500 bg-emerald-50 text-emerald-700")}
                >
                  Pautang (Customer)
                </Button>
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setAddForm({...addForm, type: 'payable'})}
                  className={cn("h-12 border-slate-200 rounded-xl font-bold", addForm.type === 'payable' && "border-orange-500 bg-orange-50 text-orange-700")}
                >
                  Utang sa Supplier
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Pangalan</Label>
              <Input 
                value={addForm.name} 
                onChange={(e) => setAddForm({...addForm, name: e.target.value})} 
                className="h-12 rounded-xl" placeholder="Juan Dela Cruz" 
              />
            </div>
            
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <Label>Itemized Breakdown?</Label>
                <div 
                  className={cn("w-10 h-6 rounded-full transition-colors cursor-pointer flex items-center px-1", addForm.useItems ? "bg-indigo-500" : "bg-slate-300")}
                  onClick={() => setAddForm({...addForm, useItems: !addForm.useItems})}
                >
                  <div className={cn("w-4 h-4 bg-white rounded-full transition-transform shadow-sm", addForm.useItems && "translate-x-4")} />
                </div>
              </div>

              {!addForm.useItems ? (
                <div className="space-y-2">
                  <Label>Halaga (₱)</Label>
                  <Input 
                    type="number" 
                    value={addForm.amountStr} 
                    onChange={(e) => setAddForm({...addForm, amountStr: e.target.value})} 
                    className="h-12 rounded-xl" placeholder="0.00" 
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {addForm.type === 'payable' && (
                    <div className="flex items-center gap-2 p-2 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 cursor-pointer" onClick={() => setAddForm({...addForm, updateStock: !addForm.updateStock})}>
                      <CheckSquare className={cn("h-4 w-4", !addForm.updateStock && "opacity-30")} />
                      <span className="text-xs font-bold">Awtomatikong idagdag sa Inventory Stock (Auto-Stock Update)</span>
                    </div>
                  )}
                  {addForm.items.map((item, i) => (
                    <div key={i} className="flex gap-2 items-center bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
                      <div className="flex-1 space-y-1">
                        <Input 
                          placeholder="Pangalan ng Item o Product" 
                          className="h-8 text-xs border-slate-100" 
                          value={item.name}
                          onChange={(e) => {
                            const newItems = [...addForm.items];
                            newItems[i].name = e.target.value;
                            setAddForm({...addForm, items: newItems});
                          }}
                        />
                        {addForm.type === 'payable' && products && products.length > 0 && (
                          <select 
                            className="w-full text-xs h-8 rounded-md border border-slate-100 text-slate-500 bg-slate-50"
                            value={item.productId}
                            onChange={(e) => {
                              const selected = products.find(p => p.id === e.target.value);
                              const newItems = [...addForm.items];
                              newItems[i].productId = e.target.value;
                              if (selected) {
                                newItems[i].name = selected.name;
                                if (!newItems[i].priceStr) newItems[i].priceStr = (selected.costPrice || selected.salePrice || 0).toString();
                              }
                              setAddForm({...addForm, items: newItems});
                            }}
                          >
                            <option value="">(Select Product sa Inventory)</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                      </div>
                      <Input 
                        placeholder="Qty" 
                        type="number"
                        className="h-8 text-xs w-16" 
                        value={item.quantity}
                        onChange={(e) => {
                          const newItems = [...addForm.items];
                          newItems[i].quantity = e.target.value;
                          setAddForm({...addForm, items: newItems});
                        }}
                      />
                      <Input 
                        placeholder="Price" 
                        type="number"
                        className="h-8 text-xs w-20" 
                        value={item.priceStr}
                        onChange={(e) => {
                          const newItems = [...addForm.items];
                          newItems[i].priceStr = e.target.value;
                          setAddForm({...addForm, items: newItems});
                        }}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => {
                        const newItems = [...addForm.items];
                        newItems.splice(i, 1);
                        setAddForm({...addForm, items: newItems});
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setAddForm({...addForm, items: [...addForm.items, { productId: '', name: '', quantity: '1', priceStr: '' }]})}
                    className="w-full h-8 border-dashed text-xs text-indigo-600 bg-white"
                  >
                    + Add Item
                  </Button>
                  <div className="flex justify-between items-center bg-indigo-50 p-2 rounded-lg mt-2">
                    <span className="text-xs font-bold text-indigo-900">Total Computed Amount:</span>
                    <span className="text-sm font-black text-indigo-700">₱{computedAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Petsa</Label>
                <Input 
                  type="date" 
                  value={addForm.dateStr} 
                  onChange={(e) => setAddForm({...addForm, dateStr: e.target.value})} 
                  className="h-12 rounded-xl block w-full text-slate-700" 
                />
              </div>
              <div className="space-y-2">
                <Label>Description (Optional)</Label>
                <Input 
                  value={addForm.description} 
                  onChange={(e) => setAddForm({...addForm, description: e.target.value})} 
                  className="h-12 rounded-xl" placeholder="Hal. Grocery" 
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)} className="rounded-xl font-bold">Kanselahin</Button>
            <Button onClick={handleAddCredit} disabled={!addForm.name || (addForm.useItems ? addForm.items.length === 0 : !addForm.amountStr) || isSubmitting} className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'I-save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Modal */}
      <Dialog open={showPayModal} onOpenChange={setShowPayModal}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Magtala ng Bayad</DialogTitle>
            <DialogDescription>
              Ang halagang ibabayad ay idadagdag/ibabawas sa Master Cash Register nang awtomatiko.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedCredit && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedCredit.name}</p>
                  <p className="text-sm font-black text-slate-800">Remaining Balance</p>
                </div>
                <div className="text-xl font-black text-slate-900">
                  ₱{((selectedCredit.amount - (selectedCredit.paidAmount || 0)) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Halaga ng Bayad (₱) - Partial/Full</Label>
              <Input 
                type="number" 
                value={paymentAmountStr} 
                onChange={(e) => setPaymentAmountStr(e.target.value)} 
                className="h-12 rounded-xl text-lg font-bold" placeholder="0.00" 
                autoFocus
              />
            </div>
            
            <DiscountInput 
              discountType={discountType}
              discountValue={discountValue}
              onTypeChange={setDiscountType}
              onValueChange={setDiscountValue}
              subtotal={(parseFloat(paymentAmountStr) || 0) * 100}
            />

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayModal(false)} className="rounded-xl font-bold">Kanselahin</Button>
            <Button onClick={handlePayment} disabled={!paymentAmountStr || isSubmitting} className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kumpirmahin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Items Dialog */}
      <Dialog open={!!viewItemsCredit} onOpenChange={(open) => !open && setViewItemsCredit(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-indigo-500" /> Item Breakdown
            </DialogTitle>
            <DialogDescription>
              Mga items para kay {viewItemsCredit?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3 max-h-[60vh] overflow-y-auto">
            {viewItemsCredit?.items?.map((item, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div>
                  <h4 className="font-bold text-sm text-slate-800">{item.name}</h4>
                  <p className="text-xs text-slate-500 font-medium">{item.quantity}x @ ₱{(item.price / 100).toLocaleString('en-PH', {minimumFractionDigits: 2})}</p>
                </div>
                <span className="font-black text-slate-900">
                  ₱{((item.quantity * item.price) / 100).toLocaleString('en-PH', {minimumFractionDigits: 2})}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-3 border-t border-slate-200 px-1">
              <span className="font-black text-slate-400 uppercase tracking-widest text-xs">Total Items Amount</span>
              <span className="text-lg font-black text-indigo-600">
                ₱{viewItemsCredit?.items?.reduce((acc, curr) => acc + (curr.quantity * curr.price), 0) ? (viewItemsCredit.items.reduce((acc, curr) => acc + (curr.quantity * curr.price), 0) / 100).toLocaleString('en-PH', {minimumFractionDigits:2}) : '0.00'}
              </span>
            </div>
            {viewItemsCredit && viewItemsCredit.items && viewItemsCredit.amount !== viewItemsCredit.items.reduce((acc, curr) => acc + (curr.quantity * curr.price), 0) && (
              <p className="text-[10px] text-orange-500 font-bold bg-orange-50 p-2 rounded-lg border border-orange-100">
                Note: The total credit amount (₱{(viewItemsCredit.amount / 100).toLocaleString('en-PH', {minimumFractionDigits: 2})}) differs from the sum of items. This can happen if discounts or miscellaneous charges were applied during checkout.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setViewItemsCredit(null)} className="rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-700 w-full">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
