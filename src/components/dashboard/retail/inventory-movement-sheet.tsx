'use client';

import React, { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { initializeFirebase } from '@/firebase';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { History, Package, ArrowUpRight, ArrowDownLeft, RefreshCw, Loader2, User } from 'lucide-react';
import { format } from 'date-fns';

interface InventoryMovementSheetProps {
  isOpen: boolean;
  onClose: () => void;
  product: any;
}

export function InventoryMovementSheet({ isOpen, onClose, product }: InventoryMovementSheetProps) {
  const { currentTenant } = useTenant();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !currentTenant?.id || !product?.id) return;
    setLoading(true);

    const { db } = initializeFirebase();
    const invTxRef = collection(db, 'tenants', currentTenant.id, 'inventory_transactions');
    const q = query(
      invTxRef,
      where('productId', '==', product.id),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setLogs(list);
      setLoading(false);
    }, (err) => {
      console.warn("Inventory transactions listener warning:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [isOpen, currentTenant?.id, product?.id]);

  if (!product) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-[32px] p-6 max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left pb-4 border-b border-slate-100 space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-lime-100 text-lime-800 flex items-center justify-center font-black">
              <History className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="font-headline font-black text-base text-slate-800">
                Imbentaryo History: {product.name}
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-500 font-medium">
                Talaan ng lahat ng dagdag at bawas sa stock ng panindang ito
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="py-4 space-y-4">
          {/* Current Stock Banner */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-lime-400 block">
                Kasalukuyang Stock
              </span>
              <span className="text-2xl font-black">
                {product.currentStock || 0} {product.unit || 'pcs'}
              </span>
            </div>
            <Badge variant="outline" className="text-xs font-black bg-slate-800 border-slate-700 text-slate-200">
              Min: {product.minStock || 0}
            </Badge>
          </div>

          {/* Logs List */}
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Movement Logs ({logs.length})
            </span>

            <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
              {loading ? (
                <div className="p-8 text-center text-xs text-slate-400 font-bold flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-lime-600" />
                  Kino-kolekta ang kasaysayan ng stock...
                </div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 italic">
                  Walang pang naitatalang movement log para sa item na ito.
                </div>
              ) : (
                logs.map((log) => {
                  const isPositive = log.quantity > 0;
                  const formattedDate = log.createdAt?.toDate
                    ? format(log.createdAt.toDate(), 'MMM d, yyyy • h:mm a')
                    : log.createdAt
                    ? format(new Date(log.createdAt), 'MMM d, yyyy • h:mm a')
                    : 'Recent';

                  return (
                    <div key={log.id} className="p-3.5 flex items-center justify-between gap-3 text-xs bg-white">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-slate-800 truncate">
                              {log.note || log.type || 'Stock Adjustment'}
                            </span>
                            <Badge className={`text-[8px] font-black uppercase border-none px-1.5 py-0 ${
                              log.type === 'restock' ? 'bg-blue-100 text-blue-800' :
                              log.type === 'sale' ? 'bg-amber-100 text-amber-800' :
                              log.type === 'return' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {log.type}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {formattedDate} • Balance After: <strong className="text-slate-600">{log.balanceAfter ?? '—'}</strong>
                          </p>
                        </div>
                      </div>

                      <span className={`font-black text-sm shrink-0 ${
                        isPositive ? 'text-emerald-600' : 'text-amber-600'
                      }`}>
                        {isPositive ? '+' : ''}{log.quantity} {product.unit || 'pcs'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
