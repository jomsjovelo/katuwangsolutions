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
import { addRetailCredit, recordRetailCreditPayment, RetailCreditEntry } from '@/firebase/firestore/retail-credit-actions';
import { Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

const CreditListItem = React.memo(({ credit, idx, setSelectedCredit, setShowPayModal, setPaymentAmountStr }: any) => {
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

  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addForm, setAddForm] = useState({
    type: 'receivable' as 'receivable' | 'payable',
    name: '',
    amountStr: '',
    description: '',
    dateStr: new Date().toISOString().split('T')[0]
  });

  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<RetailCreditEntry | null>(null);
  const [paymentAmountStr, setPaymentAmountStr] = useState('');

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

  const handleAddCredit = async () => {
    if (!currentTenant || !addForm.name || !addForm.amountStr) return;
    setIsSubmitting(true);
    try {
      const amountCentavos = Math.round(parseFloat(addForm.amountStr) * 100);
      if (isNaN(amountCentavos) || amountCentavos <= 0) throw new Error("Invalid amount");
      
      const dateVal = addForm.dateStr ? new Date(addForm.dateStr) : new Date();

      await addRetailCredit({
        tenantId: currentTenant.id,
        type: addForm.type,
        name: addForm.name,
        amount: amountCentavos,
        description: addForm.description,
        creditDate: Timestamp.fromDate(dateVal)
      });
      
      toast({ title: "Tagumpay!", description: "Ang credit ay naitala na." });
      setShowAddModal(false);
      setAddForm({
        type: 'receivable',
        name: '',
        amountStr: '',
        description: '',
        dateStr: new Date().toISOString().split('T')[0]
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
      const paymentCentavos = Math.round(parseFloat(paymentAmountStr) * 100);
      if (isNaN(paymentCentavos) || paymentCentavos <= 0) throw new Error("Invalid amount");
      
      const remaining = selectedCredit.amount - (selectedCredit.paidAmount || 0);
      if (paymentCentavos > remaining) throw new Error("Mas malaki ang bayad kaysa sa utang.");

      await recordRetailCreditPayment(currentTenant.id, selectedCredit.id!, paymentCentavos);
      
      toast({ title: "Tagumpay!", description: "Ang bayad ay naitala na." });
      setShowPayModal(false);
      setPaymentAmountStr('');
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
            <div className="space-y-2">
              <Label>Halaga (₱)</Label>
              <Input 
                type="number" 
                value={addForm.amountStr} 
                onChange={(e) => setAddForm({...addForm, amountStr: e.target.value})} 
                className="h-12 rounded-xl" placeholder="0.00" 
              />
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
            <Button onClick={handleAddCredit} disabled={!addForm.name || !addForm.amountStr || isSubmitting} className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayModal(false)} className="rounded-xl font-bold">Kanselahin</Button>
            <Button onClick={handlePayment} disabled={!paymentAmountStr || isSubmitting} className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kumpirmahin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
