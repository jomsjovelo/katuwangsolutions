'use client';

import React, { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { initializeFirebase } from '@/firebase';
import { 
  doc, 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  setDoc, 
  serverTimestamp, 
  increment 
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { 
  Vault, 
  ArrowUpRight, 
  ArrowDownLeft, 
  PlusCircle, 
  MinusCircle, 
  History, 
  Receipt, 
  ShoppingBag, 
  RefreshCw,
  Loader2,
  Wallet
} from 'lucide-react';
import { format } from 'date-fns';

export function CashDrawerLedger() {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const [balanceCentavos, setBalanceCentavos] = useState<number>(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Cash In / Cash Out Modal State
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustType, setAdjustType] = useState<'in' | 'out'>('in');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!currentTenant?.id) return;
    const { db } = initializeFirebase();

    // 1. Listen to Master Cash Account Balance
    const masterAccountRef = doc(db, 'tenants', currentTenant.id, 'accounts', 'master-cash');
    const unsubBalance = onSnapshot(masterAccountRef, (snap) => {
      if (snap.exists()) {
        setBalanceCentavos(snap.data().balance || 0);
      } else {
        setBalanceCentavos(0);
      }
    });

    // 2. Listen to Recent Master Cash Transactions
    const txRef = collection(db, 'tenants', currentTenant.id, 'transactions');
    const q = query(txRef, orderBy('createdAt', 'desc'), limit(30));

    const unsubTxs = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (!data.accountId || data.accountId === 'master-cash') {
          list.push({ id: docSnap.id, ...data });
        }
      });
      setTransactions(list);
      setLoading(false);
    });

    return () => {
      unsubBalance();
      unsubTxs();
    };
  }, [currentTenant?.id]);

  const handleCashAdjustment = async () => {
    if (!currentTenant?.id || !user) return;
    const amountPesos = parseFloat(adjustAmount);
    if (isNaN(amountPesos) || amountPesos <= 0) return;

    const amountCentavos = Math.round(amountPesos * 100);
    const isIncome = adjustType === 'in';

    try {
      setIsSubmitting(true);
      const { db } = initializeFirebase();

      // 1. Update Master Cash Account
      const masterAccountRef = doc(db, 'tenants', currentTenant.id, 'accounts', 'master-cash');
      await setDoc(masterAccountRef, {
        id: 'master-cash',
        tenantId: currentTenant.id,
        name: 'Main Cash Register',
        type: 'asset',
        balance: increment(isIncome ? amountCentavos : -amountCentavos),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Log Cash Transaction
      const txRef = doc(collection(db, 'tenants', currentTenant.id, 'transactions'));
      await setDoc(txRef, {
        id: txRef.id,
        tenantId: currentTenant.id,
        accountId: 'master-cash',
        amount: amountCentavos,
        type: isIncome ? 'income' : 'expense',
        category: isIncome ? 'Cash In (Dagdag Pondo)' : 'Cash Out (Bawas Pondo)',
        description: adjustNote.trim() || (isIncome ? 'Manual Cash In' : 'Manual Cash Out'),
        date: new Date(),
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });

      setShowAdjustModal(false);
      setAdjustAmount('');
      setAdjustNote('');
    } catch (e: any) {
      console.error("Cash adjustment failed:", e);
      alert("May error sa pag-update ng Cash Drawer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const balancePesos = balanceCentavos / 100;

  return (
    <Card className="rounded-[24px] border-slate-200/80 shadow-sm overflow-hidden bg-white">
      <CardHeader className="p-5 pb-3 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">
            <Vault className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wide">
              Cash Drawer Ledger
            </CardTitle>
            <p className="text-[10px] font-bold text-slate-400">Pondo at Cash Movement sa Tindahan</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setAdjustType('in'); setShowAdjustModal(true); }}
            className="h-8 px-2.5 rounded-xl border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold gap-1 cursor-pointer"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Cash In
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setAdjustType('out'); setShowAdjustModal(true); }}
            className="h-8 px-2.5 rounded-xl border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-[11px] font-bold gap-1 cursor-pointer"
          >
            <MinusCircle className="h-3.5 w-3.5" />
            Cash Out
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-4">
        {/* Total Cash Balance Box */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-4 text-white shadow-md flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100 block mb-0.5">
              Kasalukuyang Pondo sa Cash Drawer
            </span>
            <h3 className="text-2xl font-black font-headline tracking-tight">
              ₱{balancePesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <Wallet className="h-8 w-8 text-emerald-200/60 shrink-0" />
        </div>

        {/* Transactions List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <History className="h-3.5 w-3.5" /> Recent Cash Movements
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {transactions.length} records
            </span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto pr-1">
            {loading ? (
              <div className="p-6 text-center text-xs font-bold text-slate-400 animate-pulse flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                Kinukuha ang cash history...
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 italic">
                Walang pang cash movement sa drawer.
              </div>
            ) : (
              transactions.map((tx) => {
                const isIncome = tx.type === 'income' || tx.type === 'INCOME';
                const isSale = tx.category === 'Sales' || tx.saleId;
                const isPurchase = tx.category?.includes('Purchase') || tx.poId;
                const isVoid = tx.category?.includes('Reversal') || tx.category?.includes('Void');
                
                const amtPesos = (tx.amount || 0) / (tx.amount > 1000 ? 100 : 1);
                
                const formattedTime = tx.createdAt?.toDate
                  ? format(tx.createdAt.toDate(), 'MMM d • h:mm a')
                  : tx.date
                  ? format(new Date(tx.date), 'MMM d • h:mm a')
                  : 'Recent';

                return (
                  <div key={tx.id} className="py-2.5 px-1 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isIncome ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {isIncome ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-slate-800 truncate">
                            {tx.description || tx.category || 'Cash Entry'}
                          </span>
                          {isSale && (
                            <Badge className="text-[8px] font-black uppercase bg-emerald-50 text-emerald-700 border-none px-1.5 py-0">
                              Sale
                            </Badge>
                          )}
                          {isPurchase && (
                            <Badge className="text-[8px] font-black uppercase bg-blue-50 text-blue-700 border-none px-1.5 py-0">
                              Purchase
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {formattedTime} • {tx.paymentMethod || 'Cash'}
                        </p>
                      </div>
                    </div>

                    <span className={`font-black text-xs shrink-0 ${
                      isIncome ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {isIncome ? '+' : '-'}₱{amtPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </CardContent>

      {/* Manual Cash In / Cash Out Dialog */}
      <Dialog open={showAdjustModal} onOpenChange={setShowAdjustModal}>
        <DialogContent className="rounded-[24px] p-6 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-headline font-black text-base flex items-center gap-2 text-slate-800">
              <Wallet className="h-5 w-5 text-emerald-600" />
              {adjustType === 'in' ? 'Mag-Cash In (Dagdag Pondo)' : 'Mag-Cash Out (Bawas Pondo)'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {adjustType === 'in' 
                ? 'Magpasok ng pondo o sukli sa iyong Cash Drawer.' 
                : 'Kumuha ng cash sa drawer para sa personal na kailangan o pambayad.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                Halaga sa Pesos (₱)
              </label>
              <Input
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="Hal. 500"
                className="h-11 rounded-xl text-sm font-extrabold"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                Dahilan / Note
              </label>
              <Input
                type="text"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder={adjustType === 'in' ? 'Hal. Dagdag pondo sa barya' : 'Hal. Kumuha para sa pamasahe'}
                className="h-10 rounded-xl text-xs font-bold"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setShowAdjustModal(false)} className="rounded-xl text-xs font-bold">
              Kanselahin
            </Button>
            <Button
              onClick={handleCashAdjustment}
              disabled={isSubmitting || !adjustAmount}
              className={`rounded-xl text-xs font-black text-white ${
                adjustType === 'in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kumpirmahin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
