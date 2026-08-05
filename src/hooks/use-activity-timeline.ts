'use client';

import { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { initializeFirebase } from '@/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { ShoppingCart, Package, AlertTriangle, Banknote, RefreshCw, Trash2, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export interface TimelineItem {
  id: string;
  type: 'sale' | 'purchase' | 'void' | 'cash_in' | 'cash_out' | 'stock' | 'audit';
  title: string;
  subtitle?: string;
  amountPesos?: number | null;
  timestamp: Date;
  timeFormatted: string;
  icon: any;
  color: string;
  bg: string;
}

export function useActivityTimeline() {
  const { currentTenant } = useTenant();
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTenant?.id) {
      setLoading(false);
      return;
    }

    const { db } = initializeFirebase();
    const tenantId = currentTenant.id;

    let salesList: any[] = [];
    let poList: any[] = [];
    let txList: any[] = [];
    let auditList: any[] = [];

    const mergeStreams = () => {
      const merged: TimelineItem[] = [];

      // 1. Sales
      salesList.forEach((sale) => {
        const date = sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt || Date.now());
        const totalPesos = (sale.totalAmount || 0) / 100;
        const itemCount = sale.items?.length || 0;
        merged.push({
          id: `sale-${sale.id}`,
          type: 'sale',
          title: `POS Sale (${sale.paymentMethod || 'cash'})`,
          subtitle: `${itemCount} item${itemCount !== 1 ? 's' : ''}${sale.palistaName ? ` • ${sale.palistaName}` : ''}`,
          amountPesos: totalPesos,
          timestamp: date,
          timeFormatted: formatTimeAgo(date),
          icon: ShoppingCart,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50'
        });
      });

      // 2. Purchase Orders
      poList.forEach((po) => {
        const date = po.createdAt?.toDate ? po.createdAt.toDate() : new Date(po.createdAt || Date.now());
        const isVoided = po.status === 'voided';
        const totalPesos = (po.totalAmountCentavos || 0) / 100;
        merged.push({
          id: `po-${po.id}`,
          type: isVoided ? 'void' : 'purchase',
          title: isVoided ? `Voided PO #${po.poNumber}` : `Restock PO: ${po.supplierName}`,
          subtitle: `#${po.poNumber} • ${po.items?.length || 0} items`,
          amountPesos: isVoided ? null : -totalPesos,
          timestamp: date,
          timeFormatted: formatTimeAgo(date),
          icon: isVoided ? Trash2 : Package,
          color: isVoided ? 'text-rose-600' : 'text-blue-600',
          bg: isVoided ? 'bg-rose-50' : 'bg-blue-50'
        });
      });

      // 3. Cash Drawer & Expense Transactions (excluding sales to avoid double counting)
      txList.forEach((tx) => {
        if (tx.saleId) return; // Skip sales since already handled
        const date = tx.createdAt?.toDate ? tx.createdAt.toDate() : new Date(tx.date || Date.now());
        const isIncome = tx.type === 'income' || tx.type === 'INCOME';
        const amtPesos = (tx.amount || 0) / (tx.amount > 1000 ? 100 : 1);
        merged.push({
          id: `tx-${tx.id}`,
          type: isIncome ? 'cash_in' : 'cash_out',
          title: tx.description || tx.category || (isIncome ? 'Cash In' : 'Cash Out'),
          subtitle: tx.category || 'Cash Drawer Movement',
          amountPesos: isIncome ? amtPesos : -amtPesos,
          timestamp: date,
          timeFormatted: formatTimeAgo(date),
          icon: isIncome ? ArrowUpRight : ArrowDownLeft,
          color: isIncome ? 'text-teal-600' : 'text-amber-600',
          bg: isIncome ? 'bg-teal-50' : 'bg-amber-50'
        });
      });

      // 4. Audit Log Voids
      auditList.forEach((evt) => {
        if (evt.type === 'void_sale' || evt.type === 'void_purchase') {
          const date = evt.timestamp?.toDate ? evt.timestamp.toDate() : new Date(evt.timestamp || Date.now());
          merged.push({
            id: `audit-${evt.id}`,
            type: 'void',
            title: evt.description || 'Void Event Logged',
            subtitle: `Performed by ${evt.userName || 'Store Owner'}`,
            amountPesos: null,
            timestamp: date,
            timeFormatted: formatTimeAgo(date),
            icon: Trash2,
            color: 'text-rose-600',
            bg: 'bg-rose-50'
          });
        }
      });

      // Sort combined timeline by timestamp desc
      merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setTimeline(merged.slice(0, 15));
      setLoading(false);
    };

    // Subscriptions
    const unsubSales = onSnapshot(
      query(collection(db, 'tenants', tenantId, 'sales'), orderBy('createdAt', 'desc'), limit(10)),
      (snap) => { salesList = snap.docs.map(d => ({ id: d.id, ...d.data() })); mergeStreams(); }
    );

    const unsubPO = onSnapshot(
      query(collection(db, 'tenants', tenantId, 'purchase_orders'), orderBy('createdAt', 'desc'), limit(10)),
      (snap) => { poList = snap.docs.map(d => ({ id: d.id, ...d.data() })); mergeStreams(); }
    );

    const unsubTx = onSnapshot(
      query(collection(db, 'tenants', tenantId, 'transactions'), orderBy('createdAt', 'desc'), limit(10)),
      (snap) => { txList = snap.docs.map(d => ({ id: d.id, ...d.data() })); mergeStreams(); }
    );

    const unsubAudit = onSnapshot(
      query(collection(db, 'tenants', tenantId, 'audit_events'), orderBy('timestamp', 'desc'), limit(10)),
      (snap) => { auditList = snap.docs.map(d => ({ id: d.id, ...d.data() })); mergeStreams(); }
    );

    return () => {
      unsubSales();
      unsubPO();
      unsubTx();
      unsubAudit();
    };
  }, [currentTenant?.id]);

  return { timeline, loading };
}

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
